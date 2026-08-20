-- Foundation — immediate authentication correction for the student domain.
--
-- Run this whole file in Supabase Dashboard → SQL Editor → New query.
-- It accepts every address ending in:
-- @students.kasralainy.edu.eg
-- The administrator allowed to publish shared content is:
-- yanalhassoneh987@gmail.com
--
-- This SQL deliberately does NOT attempt to change OTP length. Hosted Supabase
-- Auth generates OTPs outside Postgres; use the authenticated Management API
-- command documented in DEPLOY.md for that setting.

create or replace function public.allowed_email_domain()
returns text language sql immutable as $$
  select 'students.kasralainy.edu.eg'::text;
$$;

create or replace function public.admin_emails()
returns text[] language sql immutable as $$
  select array['yanalhassoneh987@gmail.com']::text[];
$$;

create or replace function public.email_is_allowed(p_email text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(
    lower(btrim(p_email)) = any (select lower(unnest(public.admin_emails())))
    or public.allowed_email_domain() is null
    or public.allowed_email_domain() = ''
    or lower(btrim(p_email)) like '%@' || lower(public.allowed_email_domain())
    or lower(btrim(p_email)) like '%@%.' || lower(public.allowed_email_domain()),
    false
  );
$$;

create or replace function public.enforce_email_domain()
returns trigger language plpgsql security definer set search_path = '' as $$
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

-- Expected results:
select public.allowed_email_domain() as allowed_domain;
select public.admin_emails() as administrators;
