-- =====================================================================
-- Foundation — COMMUNITY, ALL IN ONE
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- That is the only step. It replaces running the five community files
-- separately, and it is safe to run again as many times as you like.
--
-- BEFORE running this, supabase/setup.sql must already have been run
-- (it is what creates the chapters table and the admin rules). If your
-- students can already sign in and read chapters, you have done it.
--
-- After it finishes: reload the app. Community will load.
-- =====================================================================


-- ============================================================
-- SECTION: community-foundation.sql
-- ============================================================

-- Foundation — Department / Group Community Foundation
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query, AFTER
-- supabase/setup.sql. It is safe to run again.
--
-- What this creates (no chat messages yet):
--   • configurable departments and channels
--   • private, roster-based membership entitlements
--   • student profiles with non-email public aliases
--   • server-enforced department/channel isolation through RLS
--
-- Important operating rule:
--   A student never chooses a department in the browser. Add their university
--   email to private.community_entitlements and it is claimed automatically on
--   their next sign-in. This is what makes department isolation real.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- CONFIGURABLE COMMUNITY STRUCTURE
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.community_channels (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  slug           text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name           text not null check (char_length(btrim(name)) between 2 and 120),
  description    text,
  channel_type   text not null default 'general'
                 check (channel_type in ('general', 'academic-year', 'course', 'previous-years', 'topic')),
  academic_year  text,
  course_code    text,
  access_mode    text not null default 'department'
                 check (access_mode in ('department', 'members')),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (department_id, slug)
);

-- The profile deliberately has no email column. The email remains in auth.users
-- and never needs to be returned by community queries.
create table if not exists public.community_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  public_alias  text not null unique,
  created_at    timestamptz not null default now()
);

create table if not exists public.department_memberships (
  user_id        uuid not null references auth.users(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  role           text not null default 'student' check (role in ('student', 'curator')),
  status         text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  academic_year  text,
  granted_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, department_id)
);

create table if not exists public.channel_memberships (
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel_id   uuid not null references public.community_channels(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- This table is deliberately private: it contains the roster mapping from a
-- university email to a department/group. It is never readable from the app.
create table if not exists private.community_entitlements (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (email = lower(btrim(email))),
  department_id  uuid not null references public.departments(id) on delete cascade,
  channel_id     uuid references public.community_channels(id) on delete cascade,
  academic_year  text,
  claimed_user_id uuid references auth.users(id) on delete set null,
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (email, department_id, channel_id)
);

create index if not exists department_memberships_department_active_idx
  on public.department_memberships (department_id, user_id)
  where status = 'active';
create index if not exists department_memberships_user_active_idx
  on public.department_memberships (user_id, department_id)
  where status = 'active';
create index if not exists channel_memberships_channel_user_idx
  on public.channel_memberships (channel_id, user_id);
create index if not exists community_channels_department_active_idx
  on public.community_channels (department_id, id)
  where active = true;
create unique index if not exists community_entitlements_email_scope_idx
  on private.community_entitlements (email, department_id, coalesce(channel_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- PRIVATE AUTHORIZATION HELPERS
--
-- These security-definer helpers are intentionally in a non-exposed schema.
-- RLS policies call them; browser code cannot use them as a general data API.
-- ---------------------------------------------------------------------------

create or replace function private.is_root_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

create or replace function private.is_active_department_member(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.department_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.department_id = p_department_id
      and membership.status = 'active'
  );
$$;

create or replace function private.is_active_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channel_memberships membership
    join public.community_channels channel on channel.id = membership.channel_id
    join public.department_memberships department_membership
      on department_membership.user_id = membership.user_id
     and department_membership.department_id = channel.department_id
     and department_membership.status = 'active'
    where membership.user_id = (select auth.uid())
      and membership.channel_id = p_channel_id
  );
$$;

create or replace function private.can_curate_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_root_admin())
      or exists (
        select 1
        from public.department_memberships membership
        where membership.user_id = (select auth.uid())
          and membership.department_id = p_department_id
          and membership.status = 'active'
          and membership.role = 'curator'
      );
$$;

create or replace function private.ensure_community_profile(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_profiles (user_id, public_alias)
  values (p_user_id, 'Student-' || substring(replace(p_user_id::text, '-', '') from 1 for 12))
  on conflict (user_id) do nothing;
$$;

create or replace function private.claim_community_entitlements(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement private.community_entitlements%rowtype;
  claimed_count integer := 0;
begin
  perform private.ensure_community_profile(p_user_id);

  for entitlement in
    select *
    from private.community_entitlements
    where email = lower(btrim(p_email))
      and claimed_user_id is null
    for update
  loop
    insert into public.department_memberships (user_id, department_id, role, status, academic_year)
    values (p_user_id, entitlement.department_id, 'student', 'active', entitlement.academic_year)
    on conflict (user_id, department_id) do nothing;

    -- A roster entry may name a restricted group, but it must belong to its
    -- stated department. The SELECT prevents cross-department mistakes.
    insert into public.channel_memberships (user_id, channel_id)
    select p_user_id, entitlement.channel_id
    where entitlement.channel_id is not null
      and exists (
        select 1
        from public.community_channels channel
        where channel.id = entitlement.channel_id
          and channel.department_id = entitlement.department_id
      )
    on conflict (user_id, channel_id) do nothing;

    update private.community_entitlements
       set claimed_user_id = p_user_id,
           claimed_at = now()
     where id = entitlement.id
       and claimed_user_id is null;
    claimed_count := claimed_count + 1;
  end loop;

  return claimed_count;
end;
$$;

-- New users receive a privacy-safe profile and automatically claim only the
-- roster entitlements matching their verified sign-in email.
create or replace function private.on_auth_user_created_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.claim_community_entitlements(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_community on auth.users;
create trigger on_auth_user_created_community
  after insert on auth.users
  for each row execute function private.on_auth_user_created_community();

-- Existing users can safely claim an entitlement added after their first sign-in.
-- It only uses the caller's signed JWT email and cannot grant arbitrary access.
create or replace function public.claim_my_community_memberships()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := auth.jwt() ->> 'email';
begin
  if current_user_id is null or current_email is null then
    raise exception 'You must be signed in to claim community membership.';
  end if;
  return private.claim_community_entitlements(current_user_id, current_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_profiles enable row level security;
alter table public.department_memberships enable row level security;
alter table public.channel_memberships enable row level security;
alter table private.community_entitlements enable row level security;

revoke all on table private.community_entitlements from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.claim_my_community_memberships() from public, anon;
grant execute on function public.claim_my_community_memberships() to authenticated;

grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.community_channels to authenticated;
grant select on public.community_profiles to authenticated;
grant select, insert, update, delete on public.department_memberships to authenticated;
grant select, insert, update, delete on public.channel_memberships to authenticated;

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments
  for select to authenticated
  using ((select private.is_root_admin()) or (select private.is_active_department_member(id)));

drop policy if exists departments_root_write on public.departments;
create policy departments_root_write on public.departments
  for all to authenticated
  using ((select private.is_root_admin()))
  with check ((select private.is_root_admin()));

drop policy if exists community_channels_read on public.community_channels;
create policy community_channels_read on public.community_channels
  for select to authenticated
  using (
    (select private.is_root_admin())
    or (
      active
      and (select private.is_active_department_member(department_id))
      and (
        access_mode = 'department'
        or (select private.is_active_channel_member(id))
      )
    )
  );

drop policy if exists community_channels_root_write on public.community_channels;
create policy community_channels_root_write on public.community_channels
  for all to authenticated
  using ((select private.is_root_admin()))
  with check ((select private.is_root_admin()));

drop policy if exists community_profiles_read on public.community_profiles;
create policy community_profiles_read on public.community_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_root_admin()));

drop policy if exists department_memberships_read on public.department_memberships;
create policy department_memberships_read on public.department_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_root_admin()));

drop policy if exists department_memberships_root_write on public.department_memberships;
create policy department_memberships_root_write on public.department_memberships
  for all to authenticated
  using ((select private.is_root_admin()))
  with check ((select private.is_root_admin()));

drop policy if exists channel_memberships_read on public.channel_memberships;
create policy channel_memberships_read on public.channel_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_root_admin()));

drop policy if exists channel_memberships_root_write on public.channel_memberships;
create policy channel_memberships_root_write on public.channel_memberships
  for all to authenticated
  using ((select private.is_root_admin()))
  with check ((select private.is_root_admin()));

-- Keep timestamps trustworthy without trusting the browser clock.
create or replace function private.touch_community_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists departments_touch on public.departments;
create trigger departments_touch
  before update on public.departments
  for each row execute function private.touch_community_updated_at();

drop trigger if exists community_channels_touch on public.community_channels;
create trigger community_channels_touch
  before update on public.community_channels
  for each row execute function private.touch_community_updated_at();

drop trigger if exists department_memberships_touch on public.department_memberships;
create trigger department_memberships_touch
  before update on public.department_memberships
  for each row execute function private.touch_community_updated_at();

-- Functions created above are callable only by their triggers/RLS policies;
-- they are not part of the browser-facing API.
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- FIRST CONFIGURATION (run these separately after creating real departments)
--
-- 1) Create a department:
-- insert into public.departments (code, name)
-- values ('medicine', 'Faculty of Medicine') returning id;
--
-- 2) Create a department-wide channel (replace <department-id>):
-- insert into public.community_channels (department_id, slug, name, channel_type)
-- values ('<department-id>', 'general', 'General discussion', 'general');
--
-- 3) Add an entitlement BEFORE a student signs in (lowercase email only):
-- insert into private.community_entitlements (email, department_id, academic_year)
-- values ('student@students.kasralainy.edu.eg', '<department-id>', '5th year');
--
-- 4) Existing signed-in students claim a newly-added entitlement the next time
--    they load the updated app. A curator can also run:
-- select public.claim_my_community_memberships();
--
-- Verify current user's assigned access:
-- select * from public.department_memberships where user_id = auth.uid();
-- select * from public.community_channels;


-- ============================================================
-- SECTION: community-messages.sql
-- ============================================================

-- Foundation — Community Messages, Reporting, and Moderation (Batch 3)
--
-- Run this ONCE in Supabase Dashboard → SQL Editor AFTER:
--   1. supabase/setup.sql
--   2. supabase/community-foundation.sql
--
-- It is additive and safe to run again. All permission checks below run in
-- PostgreSQL/RLS; hiding a button in the browser is never the security boundary.

create table if not exists public.community_messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.community_channels(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete cascade,
  author_alias    text not null check (char_length(author_alias) between 3 and 80),
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  reply_to_id     uuid references public.community_messages(id) on delete set null,
  status          text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);

create table if not exists public.community_message_versions (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.community_messages(id) on delete cascade,
  body            text not null,
  changed_by      uuid not null references auth.users(id) on delete cascade,
  change_kind     text not null check (change_kind in ('edit', 'moderation')),
  created_at      timestamptz not null default now()
);

create table if not exists public.community_reports (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.community_messages(id) on delete cascade,
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reason          text not null check (char_length(btrim(reason)) between 3 and 500),
  status          text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  resolution_note text,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create table if not exists public.community_moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.community_messages(id) on delete cascade,
  actor_id        uuid not null references auth.users(id) on delete cascade,
  action          text not null check (action in ('hide', 'restore', 'delete')),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists community_messages_channel_created_idx
  on public.community_messages(channel_id, created_at desc, id desc);
create index if not exists community_messages_author_idx
  on public.community_messages(author_id, created_at desc);
create index if not exists community_reports_open_idx
  on public.community_reports(status, created_at asc) where status = 'open';

-- Department-wide channels are accessible to active department members; restricted
-- channels require the separate channel membership created from the private roster.
create or replace function private.can_access_community_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_root_admin()) or exists (
    select 1 from public.community_channels channel
    where channel.id = p_channel_id and channel.active
      and (select private.is_active_department_member(channel.department_id))
      and (channel.access_mode = 'department' or (select private.is_active_channel_member(channel.id)))
  );
$$;

create or replace function private.current_community_alias(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public_alias from public.community_profiles where user_id = p_user_id;
$$;

-- Keep the author alias server-owned. A browser cannot impersonate another student.
create or replace function private.prepare_community_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_alias := private.current_community_alias(auth.uid());
    if new.author_alias is null then
      perform private.ensure_community_profile(auth.uid());
      new.author_alias := private.current_community_alias(auth.uid());
    end if;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.archive_community_message_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.body is distinct from new.body or old.status is distinct from new.status then
    insert into public.community_message_versions (message_id, body, changed_by, change_kind)
    values (old.id, old.body, auth.uid(), case when old.body is distinct from new.body then 'edit' else 'moderation' end);
  end if;
  return new;
end;
$$;

drop trigger if exists community_messages_prepare on public.community_messages;
create trigger community_messages_prepare before insert or update on public.community_messages
for each row execute function private.prepare_community_message();
drop trigger if exists community_messages_archive_version on public.community_messages;
create trigger community_messages_archive_version after update on public.community_messages
for each row execute function private.archive_community_message_version();

alter table public.community_messages enable row level security;
alter table public.community_message_versions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_actions enable row level security;

grant select, insert, update on public.community_messages to authenticated;
grant select on public.community_message_versions to authenticated;
grant select, insert, update on public.community_reports to authenticated;
grant select, insert on public.community_moderation_actions to authenticated;

drop policy if exists community_messages_read on public.community_messages;
create policy community_messages_read on public.community_messages for select to authenticated using (
  (select private.can_access_community_channel(channel_id))
  and (status = 'visible' or author_id = (select auth.uid()) or (select private.is_root_admin()))
);
drop policy if exists community_messages_insert on public.community_messages;
create policy community_messages_insert on public.community_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and status = 'visible'
  and (select private.can_access_community_channel(channel_id))
);
-- Students cannot update messages. The previous 15-minute policy also allowed a
-- direct REST caller to mutate server-owned alias/channel/timestamp metadata.
-- If editing is added later, use a narrow RPC that accepts only the new body.
drop policy if exists community_messages_author_edit on public.community_messages;
drop policy if exists community_messages_admin_moderate on public.community_messages;
create policy community_messages_admin_moderate on public.community_messages for update to authenticated using (
  (select private.is_root_admin())
) with check ((select private.is_root_admin()));

drop policy if exists community_message_versions_read on public.community_message_versions;
create policy community_message_versions_read on public.community_message_versions for select to authenticated using (
  exists (select 1 from public.community_messages message
          where message.id = message_id
            and (message.author_id = (select auth.uid()) or (select private.is_root_admin())))
);

drop policy if exists community_reports_read on public.community_reports;
create policy community_reports_read on public.community_reports for select to authenticated using (
  reporter_id = (select auth.uid()) or (select private.is_root_admin())
);
drop policy if exists community_reports_insert on public.community_reports;
create policy community_reports_insert on public.community_reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and exists (
    select 1 from public.community_messages message
    where message.id = message_id and (select private.can_access_community_channel(message.channel_id))
  )
);
drop policy if exists community_reports_admin_update on public.community_reports;
create policy community_reports_admin_update on public.community_reports for update to authenticated using (
  (select private.is_root_admin())
) with check ((select private.is_root_admin()));

drop policy if exists community_actions_read on public.community_moderation_actions;
create policy community_actions_read on public.community_moderation_actions for select to authenticated using (
  (select private.is_root_admin())
);
drop policy if exists community_actions_admin_insert on public.community_moderation_actions;
create policy community_actions_admin_insert on public.community_moderation_actions for insert to authenticated with check (
  (select private.is_root_admin()) and actor_id = (select auth.uid())
);

revoke all on all functions in schema private from public, anon, authenticated;

-- Realtime is opt-in. In Supabase Dashboard → Database → Replication, add
-- public.community_messages only if you want live updates. The UI still works
-- without Realtime: it refreshes after a student posts a message.


-- ============================================================
-- SECTION: community-admin.sql
-- ============================================================

-- Foundation — Community Administration API (Batch 4)
-- Run AFTER setup.sql, community-foundation.sql, and community-messages.sql.
-- Safe to run again. The private roster never becomes directly readable.

create or replace function public.admin_list_community_entitlements()
returns table (
  id uuid,
  email text,
  department_id uuid,
  department_name text,
  channel_id uuid,
  channel_name text,
  academic_year text,
  claimed boolean,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select entitlement.id, entitlement.email, entitlement.department_id,
           department.name, entitlement.channel_id, channel.name,
           entitlement.academic_year, entitlement.claimed_user_id is not null,
           entitlement.created_at
    from private.community_entitlements entitlement
    join public.departments department on department.id = entitlement.department_id
    left join public.community_channels channel on channel.id = entitlement.channel_id
    order by entitlement.created_at desc;
end;
$$;

-- Accepts at most 500 rows per request. Example row:
-- {"email":"student@students.kasralainy.edu.eg","department_id":"...",
--  "channel_id":null,"academic_year":"Year 3"}
create or replace function public.admin_import_community_entitlements(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  normal_email text;
  department_value uuid;
  channel_value uuid;
  year_value text;
  imported_count integer := 0;
  duplicate_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Roster must be a JSON array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Import at most 500 students at a time'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    normal_email := lower(btrim(item ->> 'email'));
    if normal_email !~ '^[^[:space:]@]+@([^[:space:]@]+\.)+[^[:space:]@]+$' then
      raise exception 'Invalid email: %', normal_email;
    end if;
    department_value := (item ->> 'department_id')::uuid;
    channel_value := nullif(item ->> 'channel_id', '')::uuid;
    year_value := nullif(btrim(item ->> 'academic_year'), '');

    if not exists (select 1 from public.departments d where d.id = department_value and d.active) then
      raise exception 'Department is missing or inactive for %', normal_email;
    end if;
    if channel_value is not null and not exists (
      select 1 from public.community_channels c
      where c.id = channel_value and c.department_id = department_value and c.active
    ) then raise exception 'Channel does not belong to the selected department for %', normal_email;
    end if;

    insert into private.community_entitlements (email, department_id, channel_id, academic_year)
    values (normal_email, department_value, channel_value, year_value)
    on conflict do nothing;
    if found then imported_count := imported_count + 1;
    else duplicate_count := duplicate_count + 1;
    end if;
  end loop;
  return jsonb_build_object('imported', imported_count, 'duplicates', duplicate_count);
end;
$$;

create or replace function public.admin_remove_community_entitlement(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  removed private.community_entitlements%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  delete from private.community_entitlements where id = p_id returning * into removed;
  if not found then return false; end if;
  if removed.claimed_user_id is not null then
    if removed.channel_id is not null and not exists (
      select 1 from private.community_entitlements e
      where e.claimed_user_id = removed.claimed_user_id and e.channel_id = removed.channel_id
    ) then
      delete from public.channel_memberships
      where user_id = removed.claimed_user_id and channel_id = removed.channel_id;
    end if;
    if not exists (
      select 1 from private.community_entitlements e
      where e.claimed_user_id = removed.claimed_user_id and e.department_id = removed.department_id
    ) then
      delete from public.channel_memberships membership
      using public.community_channels channel
      where membership.user_id = removed.claimed_user_id
        and membership.channel_id = channel.id
        and channel.department_id = removed.department_id;
      delete from public.department_memberships
      where user_id = removed.claimed_user_id and department_id = removed.department_id;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.admin_resolve_community_report(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('reviewed', 'dismissed', 'actioned') then
    raise exception 'Invalid report status';
  end if;
  update public.community_reports
     set status = p_status,
         resolution_note = nullif(btrim(p_note), ''),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_report_id and status = 'open';
  return found;
end;
$$;

revoke all on function public.admin_list_community_entitlements() from public, anon;
revoke all on function public.admin_import_community_entitlements(jsonb) from public, anon;
revoke all on function public.admin_remove_community_entitlement(uuid) from public, anon;
revoke all on function public.admin_resolve_community_report(uuid, text, text) from public, anon;
grant execute on function public.admin_list_community_entitlements() to authenticated;
grant execute on function public.admin_import_community_entitlements(jsonb) to authenticated;
grant execute on function public.admin_remove_community_entitlement(uuid) to authenticated;
grant execute on function public.admin_resolve_community_report(uuid, text, text) to authenticated;


-- ============================================================
-- SECTION: community-intelligence.sql
-- ============================================================

-- Foundation — Daily Medical Intelligence + Realtime (Batch 5)
-- Run AFTER community-admin.sql. Safe to run again.

create table if not exists public.community_intelligence (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.community_channels(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade,
  category      text not null default 'clinical-pearl'
                check (category in ('clinical-pearl', 'guideline', 'research', 'technology', 'exam-alert')),
  title         text not null check (char_length(btrim(title)) between 5 and 180),
  summary       text not null check (char_length(btrim(summary)) between 10 and 600),
  body          text not null check (char_length(btrim(body)) between 10 and 12000),
  source_label  text not null check (char_length(btrim(source_label)) between 2 and 160),
  source_url    text not null check (source_url ~ '^https://[^[:space:]]+$'),
  status        text not null default 'published' check (status in ('draft', 'published', 'archived')),
  published_at  timestamptz not null default now(),
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (expires_at is null or expires_at > published_at)
);

create index if not exists community_intelligence_channel_published_idx
  on public.community_intelligence(channel_id, published_at desc, id desc)
  where status = 'published';

create or replace function private.prepare_community_intelligence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_intelligence_prepare on public.community_intelligence;
create trigger community_intelligence_prepare
  before insert or update on public.community_intelligence
  for each row execute function private.prepare_community_intelligence();

alter table public.community_intelligence enable row level security;
grant select, insert, update, delete on public.community_intelligence to authenticated;

drop policy if exists community_intelligence_read on public.community_intelligence;
create policy community_intelligence_read on public.community_intelligence
  for select to authenticated using (
    (select private.is_root_admin())
    or (
      status = 'published'
      and (expires_at is null or expires_at > now())
      and (select private.can_access_community_channel(channel_id))
    )
  );

drop policy if exists community_intelligence_admin_write on public.community_intelligence;
create policy community_intelligence_admin_write on public.community_intelligence
  for all to authenticated using ((select private.is_root_admin()))
  with check ((select private.is_root_admin()));

revoke all on function private.prepare_community_intelligence() from public, anon, authenticated;

-- Enable Postgres Changes only once. RLS still determines which rows each
-- signed-in browser can fetch after receiving an event.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_messages'
    ) then alter publication supabase_realtime add table public.community_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_intelligence'
    ) then alter publication supabase_realtime add table public.community_intelligence;
    end if;
  end if;
end;
$$;


-- ============================================================
-- SECTION: community-daily-logs.sql
-- ============================================================

-- Foundation — Daily study logs
--
-- Run this in Supabase Dashboard → SQL Editor → New query, AFTER
-- supabase/community-foundation.sql. It is safe to run again.
--
-- What this is for
--   Students post what they actually covered that day — the lecture, the topic,
--   the points that mattered. The administrator then reads a whole day back in
--   one place and turns it into study material.
--
--   The chat channels are for conversation. This is deliberately NOT chat: a
--   day's learning scattered through hundreds of messages cannot be collected,
--   which is exactly the problem. One structured row per lecture can.
--
-- Isolation is the same as everywhere else in the community: a student sees
-- their own year's logs, an administrator sees all of them, and the browser
-- decides none of it — the policies below do.

create table if not exists public.community_daily_logs (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users(id) on delete cascade,
  -- Denormalised so a digest reads without joining, and so a deleted account
  -- does not blank out the material the cohort already built.
  author_alias  text not null,
  -- The DAY being reported, which is not always the day it was typed: someone
  -- writing up Monday's lecture on Tuesday morning must still file it to Monday.
  log_date      date not null default (now() at time zone 'utc')::date,
  academic_year text,
  subject       text not null,
  topic         text not null,
  lecturer      text,
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint community_daily_logs_subject_len check (char_length(subject) between 1 and 120),
  constraint community_daily_logs_topic_len   check (char_length(topic) between 1 and 200),
  constraint community_daily_logs_body_len    check (char_length(body) between 1 and 8000)
);

-- The digest query is always "one day, newest first" — index for exactly that.
create index if not exists community_daily_logs_by_day
  on public.community_daily_logs (log_date desc, created_at desc);
create index if not exists community_daily_logs_by_author
  on public.community_daily_logs (author_id, log_date desc);

-- The author and their alias are SERVER-owned, exactly as they are for chat
-- messages. A browser sends whatever it likes; this overwrites it with the
-- authenticated user's real id and their safe public alias, so one student can
-- never file a log under another's name however the request is shaped. The
-- academic year is stamped here too, so a client cannot post into another
-- year's digest.
create or replace function private.prepare_community_daily_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_alias := private.current_community_alias(auth.uid());
    if new.author_alias is null then
      perform private.ensure_community_profile(auth.uid());
      new.author_alias := private.current_community_alias(auth.uid());
    end if;
    new.academic_year := (
      select profile.academic_year from public.community_profiles profile
      where profile.user_id = auth.uid()
    );
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists community_daily_logs_prepare on public.community_daily_logs;
create trigger community_daily_logs_prepare
  before insert or update on public.community_daily_logs
  for each row execute function private.prepare_community_daily_log();

alter table public.community_daily_logs enable row level security;

-- READ: your own year's logs, or everything if you are an administrator.
-- Cohort-wide reading is the point — a student should see what the rest of the
-- year covered, which is how a missed lecture gets picked up.
drop policy if exists community_daily_logs_read on public.community_daily_logs;
create policy community_daily_logs_read on public.community_daily_logs
  for select to authenticated using (
    (select private.is_root_admin())
    or author_id = (select auth.uid())
    or academic_year is not distinct from (
      select profile.academic_year from public.community_profiles profile
      where profile.user_id = (select auth.uid())
    )
  );

-- WRITE: only ever your own row, and only under your own identity. A client
-- cannot file a log as somebody else however the request is shaped.
drop policy if exists community_daily_logs_insert on public.community_daily_logs;
create policy community_daily_logs_insert on public.community_daily_logs
  for insert to authenticated with check (author_id = (select auth.uid()));

drop policy if exists community_daily_logs_update on public.community_daily_logs;
create policy community_daily_logs_update on public.community_daily_logs
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- Deleting is the author's own or an administrator's — students can retract a
-- log they filed by mistake without asking anyone.
drop policy if exists community_daily_logs_delete on public.community_daily_logs;
create policy community_daily_logs_delete on public.community_daily_logs
  for delete to authenticated using (
    author_id = (select auth.uid()) or (select private.is_root_admin())
  );

grant select, insert, update, delete on public.community_daily_logs to authenticated;

