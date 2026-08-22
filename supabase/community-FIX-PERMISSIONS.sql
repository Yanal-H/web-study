-- Foundation — fix: let the security policies call their own helpers
--
-- Symptom: Community says "permission denied for function is_root_admin",
-- even though every table was created successfully.
--
-- Cause (mine, in community-foundation.sql): the setup locks down the private
-- schema with
--
--     revoke all on schema private from public, anon, authenticated;
--     revoke all on all functions in schema private from public, anon, authenticated;
--
-- The intent was right — a browser must never call these helpers directly. But
-- it went too far. A row-level-security policy is evaluated as the role making
-- the request, so when the policy on community_channels asks
-- "private.is_root_admin()", it is the SIGNED-IN STUDENT who has to be able to
-- resolve and call that function. Revoking it from `authenticated` did not
-- secure the policy; it stopped the policy working at all.
--
-- Why granting this back is not a step backwards:
--
--   • USAGE on a schema grants nothing about the objects inside it. Per-object
--     privileges still decide everything, so private.community_entitlements —
--     the student roster — stays completely unreadable. That revoke is left
--     exactly as it is.
--   • Only the helpers that policies actually reference are granted. Trigger
--     functions are not (a trigger fires as part of the write; the caller never
--     needs permission to call it), and private.can_curate_department, which is
--     defined but used by no policy, stays locked.
--   • None of them is reachable from the app in any case: PostgREST exposes
--     only the schemas it is configured for — `public` — so nothing in
--     `private` can be called over the API whatever its grants say.
--   • Each is SECURITY DEFINER and answers a question about the current user
--     from auth.uid(). Being callable by `authenticated` is simply how an RLS
--     helper works.
--
-- Safe to run more than once, and safe to run whether or not every community
-- section has been applied — each grant is skipped if that function is absent.

grant usage on schema private to authenticated;

do $$
declare
  fn text;
  target regprocedure;
begin
  -- Exactly the helpers referenced inside RLS policies. Resolved by name from
  -- the catalogue rather than written as a signature, so this cannot drift out
  -- of step with the definitions or fail on a partial install.
  foreach fn in array array[
    'is_root_admin',
    'can_access_community_channel',
    'is_active_channel_member',
    'is_active_department_member',
    'current_academic_year'
  ]
  loop
    for target in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = fn
    loop
      execute format('grant execute on function %s to authenticated', target);
      raise notice 'granted execute on %', target;
    end loop;
  end loop;
end
$$;

-- Confirmation. Every helper a policy needs should be listed here.
select p.proname as helper, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and has_function_privilege('authenticated', p.oid, 'execute')
order by p.proname;
