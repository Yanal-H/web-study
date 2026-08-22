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

-- Which year a student is in.
--
-- The year lives on department_memberships, NOT on community_profiles — a
-- student belongs to a department FOR a year, and the profile is only their
-- alias. A student can hold more than one membership, so this takes the active
-- one, most recent first, which keeps the answer deterministic rather than
-- whichever row the planner happened to return.
create or replace function private.current_academic_year(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select membership.academic_year
  from public.department_memberships membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
  order by membership.created_at desc
  limit 1;
$$;

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
    new.academic_year := private.current_academic_year(auth.uid());
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
    or academic_year is not distinct from (select private.current_academic_year((select auth.uid())))
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
