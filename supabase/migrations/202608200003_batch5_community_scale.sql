-- Batch 5: scalable, auditable community administration.
-- Apply after setup.sql, community-foundation.sql, community-messages.sql,
-- community-admin.sql, and the earlier batch migrations.

begin;

create index if not exists community_entitlements_department_created_idx
  on private.community_entitlements(department_id, created_at desc);
create index if not exists community_entitlements_email_lower_idx
  on private.community_entitlements(lower(email));

-- Returns one bounded roster page plus the total filtered count. The client
-- never receives the full private roster, even for a 20,000-student cohort.
create or replace function public.admin_list_community_entitlements_page(
  p_offset integer default 0,
  p_limit integer default 50,
  p_search text default '',
  p_department_id uuid default null,
  p_claimed boolean default null
)
returns table (
  id uuid,
  email text,
  department_id uuid,
  department_name text,
  channel_id uuid,
  channel_name text,
  academic_year text,
  claimed boolean,
  created_at timestamptz,
  total_count bigint
)
language plpgsql security definer set search_path = '' as $$
declare
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;

  return query
  with filtered as (
    select entitlement.id, entitlement.email, entitlement.department_id,
           department.name as department_name, entitlement.channel_id,
           channel.name as channel_name, entitlement.academic_year,
           entitlement.claimed_user_id is not null as claimed,
           entitlement.created_at
      from private.community_entitlements entitlement
      join public.departments department on department.id = entitlement.department_id
      left join public.community_channels channel on channel.id = entitlement.channel_id
     where (p_department_id is null or entitlement.department_id = p_department_id)
       and (p_claimed is null or (entitlement.claimed_user_id is not null) = p_claimed)
       and (v_search = '' or lower(entitlement.email) like '%' || v_search || '%')
  )
  select filtered.*, count(*) over () as total_count
    from filtered
   order by created_at desc, email
   offset v_offset limit v_limit;
end;
$$;

-- Make the existing bounded import stricter: roster emails must be eligible for
-- the application, not just syntactically email-shaped.
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
  if jsonb_array_length(p_rows) = 0 then raise exception 'Roster is empty'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Import at most 500 students at a time'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    normal_email := lower(btrim(item ->> 'email'));
    if normal_email !~ '^[^[:space:]@]+@([^[:space:]@]+\.)+[^[:space:]@]+$' then
      raise exception 'Invalid email: %', normal_email;
    end if;
    if not public.email_is_allowed(normal_email) then
      raise exception 'Email is outside the allowed student domain: %', normal_email;
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

revoke all on function public.admin_list_community_entitlements_page(integer, integer, text, uuid, boolean) from public, anon;
grant execute on function public.admin_list_community_entitlements_page(integer, integer, text, uuid, boolean) to authenticated;

commit;
