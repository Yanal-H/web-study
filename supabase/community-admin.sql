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
