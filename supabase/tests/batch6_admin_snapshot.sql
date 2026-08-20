-- pgTAP structural checks for Batch 6. Run against a disposable test database
-- after applying the preceding migrations.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(3);

select extensions.has_function('public', 'admin_operational_snapshot', array[]::text[],
  'admin operational snapshot RPC exists');
select extensions.ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_operational_snapshot' and p.prosecdef),
  'snapshot runs with server-side authorization'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.admin_operational_snapshot()', 'EXECUTE'),
  'anonymous users cannot call the snapshot'
);

select * from extensions.finish();
rollback;
