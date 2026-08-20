-- pgTAP structural checks for Batch 8. Run after applying the migrations.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

select extensions.has_function('public', 'published_chapter_catalog', array[]::text[],
  'authenticated lazy-content catalog RPC exists');
select extensions.ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'published_chapter_catalog' and p.prosecdef),
  'catalog uses server-side learner authorization'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.published_chapter_catalog()', 'EXECUTE'),
  'anonymous users cannot read the catalog'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.published_chapter_catalog()', 'EXECUTE'),
  'authenticated users may call the catalog subject to its eligibility check'
);

select * from extensions.finish();
rollback;
