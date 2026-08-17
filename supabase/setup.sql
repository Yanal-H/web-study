-- Foundation — Supabase setup.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- after creating your project. It is safe to re-run: every statement is guarded.
--
-- What it sets up:
--   1. A domain restriction, so only your students can create an account.
--   2. A table holding the chapter packs, readable only by signed-in students.
--   3. An admin list, so only you can publish or change content.
--
-- IMPORTANT: change the two values in the "SETTINGS" block below before running.

-- ============================================================================
-- SETTINGS — edit these two lines
-- ============================================================================
-- The email domain your students use. Anyone else is refused at sign-up.
--   e.g. 'student.cu.edu.eg'
-- Leave as '' to allow any domain (not recommended).
create or replace function public.allowed_email_domain()
returns text language sql immutable as $$
  select 'CHANGE-ME.edu'::text;
$$;

-- Your own email address — the only account allowed to publish content.
create or replace function public.admin_emails()
returns text[] language sql immutable as $$
  select array['you@CHANGE-ME.edu']::text[];
$$;


-- ============================================================================
-- 1. Domain restriction (enforced on the server, not in the browser)
-- ============================================================================
-- A student can edit anything the browser runs, so the domain check cannot live
-- there. This trigger runs inside the database on every new account and refuses
-- the insert outright, which is what makes "only my cohort" actually true.

create or replace function public.enforce_email_domain()
returns trigger language plpgsql security definer as $$
declare
  allowed text := public.allowed_email_domain();
begin
  if allowed is null or allowed = '' then
    return new;  -- no restriction configured
  end if;
  if lower(new.email) like '%@' || lower(allowed) then
    return new;
  end if;
  raise exception 'Email domain not allowed. Use your @% address.', allowed
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists enforce_email_domain_trigger on auth.users;
create trigger enforce_email_domain_trigger
  before insert on auth.users
  for each row execute function public.enforce_email_domain();


-- ============================================================================
-- 2. Chapter content — readable only by a signed-in student
-- ============================================================================
-- This is the change that stops anonymous visitors taking the library: the
-- chapters are no longer inside the downloadable app bundle, they are rows here,
-- and the policy below means an unauthenticated request returns nothing at all.

create table if not exists public.chapters (
  id          text primary key,
  revision    text not null,
  subject     text,
  title       text,
  pack        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.chapters enable row level security;

-- Read: any signed-in user. (Sign-up is already domain-restricted above, so
-- "signed in" and "is one of my students" mean the same thing.)
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters
  for select
  to authenticated
  using (true);

-- Write: administrators only. A student who flips an "admin" flag in their own
-- browser still fails here, because this is evaluated in the database against
-- their real signed-in identity.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    lower((select email from auth.users where id = auth.uid())) = any(
      select lower(unnest(public.admin_emails()))
    ),
    false
  );
$$;

drop policy if exists chapters_write on public.chapters;
create policy chapters_write on public.chapters
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chapters_touch on public.chapters;
create trigger chapters_touch
  before update on public.chapters
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- Done.
-- ============================================================================
-- Check it worked:
--   select public.allowed_email_domain();          -- your domain
--   select * from public.chapters;                 -- empty at first
--
-- Then upload your chapters from the app: sign in with your admin email,
-- open Settings -> Admin -> Publish.
