-- pgTAP structural checks for Batch 1. Run against a disposable Supabase test DB.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

select extensions.has_function('public', 'is_allowed_learner', array[]::text[],
  'eligible learner predicate exists');
select extensions.has_function('public', 'consume_ai_quota', array['integer'],
  'AI quota function exists');
select extensions.has_table('private', 'ai_usage_events',
  'private AI usage ledger exists');
select extensions.has_index('private', 'ai_usage_events', 'ai_usage_events_user_created_idx',
  'AI usage lookup is indexed');

select extensions.ok(
  exists (select 1 from pg_trigger where tgname = 'enforce_email_domain_trigger'
    and (tgtype & 16) = 16 and (tgtype & 4) = 4),
  'email eligibility trigger covers UPDATE and INSERT');
select extensions.ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chapters'
    and policyname = 'chapters_read' and qual ilike '%is_allowed_learner%'),
  'chapter reads require an eligible learner');
select extensions.ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_messages'
    and policyname = 'community_messages_author_edit'),
  'student message UPDATE policy is absent');
select extensions.ok(
  exists (select 1 from pg_trigger where tgname = 'community_messages_rate_limit'),
  'community message insert rate trigger exists');
select extensions.ok(
  exists (select 1 from pg_trigger where tgname = 'community_reports_rate_limit'),
  'community report insert rate trigger exists');
select extensions.ok(
  not has_table_privilege('authenticated', 'private.ai_usage_events', 'SELECT'),
  'authenticated users cannot read the AI usage ledger');

select * from extensions.finish();
rollback;

