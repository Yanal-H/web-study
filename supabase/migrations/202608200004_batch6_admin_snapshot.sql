-- Batch 6: administrator-only operational health snapshot.
-- Apply after the prior setup, community, and Batch 1–5 migrations.

begin;

create or replace function public.admin_operational_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published integer;
  v_archived integer;
  v_drafts integer;
  v_versions integer;
  v_roster integer;
  v_claimed integer;
  v_open_reports integer;
  v_departments integer;
  v_channels integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = 'insufficient_privilege';
  end if;

  select count(*) filter (where status = 'published'),
         count(*) filter (where status = 'archived')
    into v_published, v_archived from public.chapters;
  select count(*) into v_drafts from public.chapter_drafts;
  select count(*) into v_versions from public.chapter_versions;
  select count(*), count(*) filter (where claimed_user_id is not null)
    into v_roster, v_claimed from private.community_entitlements;
  select count(*) into v_open_reports from public.community_reports where status = 'open';
  select count(*) into v_departments from public.departments where active;
  select count(*) into v_channels from public.community_channels where active;

  return jsonb_build_object(
    'generatedAt', now(),
    'content', jsonb_build_object(
      'published', coalesce(v_published, 0),
      'drafts', coalesce(v_drafts, 0),
      'archived', coalesce(v_archived, 0),
      'versions', coalesce(v_versions, 0)
    ),
    'community', jsonb_build_object(
      'roster', coalesce(v_roster, 0),
      'claimed', coalesce(v_claimed, 0),
      'waiting', greatest(coalesce(v_roster, 0) - coalesce(v_claimed, 0), 0),
      'openReports', coalesce(v_open_reports, 0),
      'activeDepartments', coalesce(v_departments, 0),
      'activeChannels', coalesce(v_channels, 0)
    )
  );
end;
$$;

revoke all on function public.admin_operational_snapshot() from public, anon;
grant execute on function public.admin_operational_snapshot() to authenticated;

commit;
