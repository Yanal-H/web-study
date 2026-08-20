-- Batch 1: identity, shared-content, community and AI-cost boundaries.
-- Apply after the existing Foundation/community setup scripts.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One canonical eligibility predicate, used by the auth trigger, RLS and the AI
-- quota RPC. Administrators remain eligible regardless of email domain.
create or replace function public.email_is_allowed(p_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(btrim(p_email)) = any (select lower(unnest(public.admin_emails())))
    or public.allowed_email_domain() is null
    or public.allowed_email_domain() = ''
    or lower(btrim(p_email)) like '%@' || lower(public.allowed_email_domain())
    or lower(btrim(p_email)) like '%@%.' || lower(public.allowed_email_domain()),
    false
  );
$$;

create or replace function public.is_allowed_learner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and public.email_is_allowed(email)
  );
$$;

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.email_is_allowed(new.email) then return new; end if;
  raise exception 'Email domain not allowed. Use your @% address.', public.allowed_email_domain()
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists enforce_email_domain_trigger on auth.users;
create trigger enforce_email_domain_trigger
  before insert or update of email on auth.users
  for each row execute function public.enforce_email_domain();

revoke all on function public.email_is_allowed(text) from public, anon;
revoke all on function public.is_allowed_learner() from public, anon;
grant execute on function public.email_is_allowed(text) to authenticated;
grant execute on function public.is_allowed_learner() to authenticated;

-- Existing or manually created out-of-domain users no longer inherit chapter
-- access merely because they have an authenticated JWT.
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters
  for select to authenticated
  using ((select public.is_allowed_learner()));

-- Durable per-user quota checked by /api/ai before any paid upstream call.
create table if not exists private.ai_usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  input_chars integer not null check (input_chars between 1 and 24000),
  created_at  timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on private.ai_usage_events(user_id, created_at desc);

revoke all on table private.ai_usage_events from public, anon, authenticated;

create or replace function public.consume_ai_quota(p_input_chars integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_minute_count integer;
  v_day_count integer;
  v_day_chars bigint;
  v_day_limit integer;
begin
  if v_user is null or not public.is_allowed_learner() then return false; end if;
  if p_input_chars is null or p_input_chars < 1 or p_input_chars > 24000 then return false; end if;

  -- Serialise quota decisions for one user so parallel requests cannot all pass
  -- before their usage rows are inserted.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));

  select count(*) filter (where created_at >= now() - interval '1 minute'),
         count(*),
         coalesce(sum(input_chars), 0)
    into v_minute_count, v_day_count, v_day_chars
    from private.ai_usage_events
   where user_id = v_user
     and created_at >= now() - interval '1 day';

  v_day_limit := case when public.is_admin() then 100 else 30 end;
  if v_minute_count >= 6 or v_day_count >= v_day_limit or v_day_chars + p_input_chars > 180000 then
    return false;
  end if;

  insert into private.ai_usage_events(user_id, input_chars) values (v_user, p_input_chars);
  return true;
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- The application has no student message-editing UI. Remove the unsafe broad
-- UPDATE policy; administrators retain their existing moderation policy.
do $$
begin
  if to_regclass('public.community_messages') is not null then
    execute 'drop policy if exists community_messages_author_edit on public.community_messages';
  end if;
end $$;

-- Server-enforced posting/reporting limits also protect direct REST calls.
create or replace function private.enforce_community_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_allowed_learner() then
    raise exception 'Sign in with an eligible account.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.community_messages
       where author_id = v_user and created_at >= now() - interval '1 minute') >= 6
     or (select count(*) from public.community_messages
       where author_id = v_user and created_at >= now() - interval '1 day') >= 100 then
    raise exception 'Community posting limit reached. Please wait.' using errcode = 'program_limit_exceeded';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_community_report_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_allowed_learner() then
    raise exception 'Sign in with an eligible account.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.community_reports
       where reporter_id = v_user and created_at >= now() - interval '1 hour') >= 10
     or (select count(*) from public.community_reports
       where reporter_id = v_user and created_at >= now() - interval '1 day') >= 30 then
    raise exception 'Community reporting limit reached. Please wait.' using errcode = 'program_limit_exceeded';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.community_messages') is not null then
    execute 'drop trigger if exists community_messages_rate_limit on public.community_messages';
    execute 'create trigger community_messages_rate_limit before insert on public.community_messages for each row execute function private.enforce_community_message_rate()';
  end if;
  if to_regclass('public.community_reports') is not null then
    execute 'drop trigger if exists community_reports_rate_limit on public.community_reports';
    execute 'create trigger community_reports_rate_limit before insert on public.community_reports for each row execute function private.enforce_community_report_rate()';
  end if;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

commit;
