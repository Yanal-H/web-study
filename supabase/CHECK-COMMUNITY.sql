-- Is the community set up? Paste this into Supabase → SQL Editor → Run.
--
-- It only READS. It changes nothing, and is safe to run any time.
--
-- Expect 9 rows. If you get 0, the setup has not been applied — run
-- supabase/community-ALL-IN-ONE.sql. If you get some but not all, the run
-- stopped partway; run the ALL-IN-ONE file again, which will finish the job.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'departments',
    'community_channels',
    'community_profiles',
    'department_memberships',
    'channel_memberships',
    'community_messages',
    'community_message_versions',
    'community_reports',
    'community_daily_logs'
  )
order by table_name;
