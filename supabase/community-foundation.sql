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
