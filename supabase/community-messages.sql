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
