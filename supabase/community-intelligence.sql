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
