-- pgTAP structural checks for Batch 5. Run against a disposable Supabase test DB
-- after applying the community setup scripts and migrations.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(5);

select extensions.has_function(
  'public', 'admin_list_community_entitlements_page',
  array['integer', 'integer', 'text', 'uuid', 'boolean'],
  'paged roster RPC exists'
);
select extensions.has_function(
  'public', 'admin_import_community_entitlements', array['jsonb'],
  'bounded roster import RPC exists'
);
select extensions.has_index(
  'private', 'community_entitlements', 'community_entitlements_department_created_idx',
  'roster paging has a department/time index'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'private.community_entitlements', 'SELECT'),
  'students cannot read the private roster'
);
select extensions.ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_list_community_entitlements_page'
      and p.prosecdef
  ),
  'paged roster RPC performs server-side authorization'
);

select * from extensions.finish();
rollback;
