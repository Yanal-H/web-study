-- Batch 4: safe shared-content lifecycle.
-- Apply after supabase/setup.sql and 202608200001_batch1_security.sql.
-- Drafts are never visible to students. Publishing a selected set of drafts is
-- one database transaction; archiving keeps the chapter and its history.

begin;

alter table public.chapters add column if not exists status text;
update public.chapters set status = 'published' where status is null;
alter table public.chapters alter column status set default 'published';
alter table public.chapters alter column status set not null;
alter table public.chapters drop constraint if exists chapters_status_check;
alter table public.chapters add constraint chapters_status_check
  check (status in ('published', 'archived'));

create table if not exists public.chapter_drafts (
  id          text primary key,
  revision    text not null,
  subject     text,
  title       text,
  pack        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.chapter_versions (
  id           bigint generated always as identity primary key,
  chapter_id   text not null,
  revision     text not null,
  subject      text,
  title        text,
  status       text not null check (status in ('published', 'archived')),
  pack         jsonb not null,
  archived_at  timestamptz not null default now(),
  archived_by  uuid references auth.users(id) on delete set null
);
create index if not exists chapter_versions_chapter_archived_idx
  on public.chapter_versions(chapter_id, archived_at desc);

alter table public.chapter_drafts enable row level security;
alter table public.chapter_versions enable row level security;

drop policy if exists chapter_drafts_admin on public.chapter_drafts;
create policy chapter_drafts_admin on public.chapter_drafts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists chapter_versions_admin on public.chapter_versions;
create policy chapter_versions_admin on public.chapter_versions
  for select to authenticated
  using ((select public.is_admin()));

-- A learner sees only live material. An administrator can inspect archived rows
-- as part of the operational content screen.
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters
  for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_allowed_learner()) and status = 'published')
  );

create or replace function private.record_chapter_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.revision = new.revision and old.status = new.status then
    return new;
  end if;
  insert into public.chapter_versions(chapter_id, revision, subject, title, status, pack, archived_by)
  values (old.id, old.revision, old.subject, old.title, old.status, old.pack, auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists chapters_record_version on public.chapters;
create trigger chapters_record_version
  before update or delete on public.chapters
  for each row execute function private.record_chapter_version();

create or replace function public.touch_chapter_draft_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists chapter_drafts_touch on public.chapter_drafts;
create trigger chapter_drafts_touch
  before insert or update on public.chapter_drafts
  for each row execute function public.touch_chapter_draft_updated_at();

-- Validated drafts are promoted together. Any missing draft or database error
-- aborts the entire call, so a multi-file release cannot be partially live.
create or replace function public.publish_chapter_drafts(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.chapter_drafts%rowtype;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or cardinality(p_ids) is null or cardinality(p_ids) = 0 then
    raise exception 'Choose at least one draft.' using errcode = 'invalid_parameter_value';
  end if;
  if cardinality(p_ids) <> cardinality(array(select distinct unnest(p_ids))) then
    raise exception 'A draft was selected more than once.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.chapter_drafts where id = any(p_ids) for update;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_ids) then
    raise exception 'One or more selected drafts no longer exist.' using errcode = 'no_data_found';
  end if;

  for v_draft in select * from public.chapter_drafts where id = any(p_ids) order by id loop
    insert into public.chapters(id, revision, subject, title, pack, status)
    values (v_draft.id, v_draft.revision, v_draft.subject, v_draft.title, v_draft.pack, 'published')
    on conflict (id) do update set
      revision = excluded.revision,
      subject = excluded.subject,
      title = excluded.title,
      pack = excluded.pack,
      status = 'published';
  end loop;
  delete from public.chapter_drafts where id = any(p_ids);
  return cardinality(p_ids);
end;
$$;

create or replace function public.archive_chapter(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = 'insufficient_privilege'; end if;
  update public.chapters set status = 'archived' where id = p_id and status = 'published';
  return found;
end;
$$;

create or replace function public.restore_chapter(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = 'insufficient_privilege'; end if;
  update public.chapters set status = 'published' where id = p_id and status = 'archived';
  return found;
end;
$$;

revoke all on function public.publish_chapter_drafts(text[]) from public, anon;
revoke all on function public.archive_chapter(text) from public, anon;
revoke all on function public.restore_chapter(text) from public, anon;
grant execute on function public.publish_chapter_drafts(text[]) to authenticated;
grant execute on function public.archive_chapter(text) to authenticated;
grant execute on function public.restore_chapter(text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

commit;
