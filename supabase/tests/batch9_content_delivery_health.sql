-- pgTAP structural checks for Batch 9. Run after applying the migrations.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

select extensions.has_function('public', 'admin_content_delivery_health', array[]::text[],
  'administrator content-delivery health RPC exists');
select extensions.ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_content_delivery_health' and p.prosecdef),
  'delivery health performs server-side administrator authorization'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.admin_content_delivery_health()', 'EXECUTE'),
  'anonymous users cannot inspect delivery health'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.admin_content_delivery_health()', 'EXECUTE'),
  'authenticated administrators may call delivery health'
);

select * from extensions.finish();
rollback;
