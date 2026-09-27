-- RPC exposure + table grants. See docs/rpc-exposure-plan.md and .claude/rules/supabase-db.md.
begin;
select plan(44);

-- Every public table has RLS on. A new table without it fails here.
select is(
  (select coalesce(string_agg(tablename, ', '), '') from pg_tables where schemaname = 'public' and not rowsecurity),
  '',
  'every public table has row level security enabled'
);

-- CI guard, also asserted here so `supabase test db` alone catches it.
select lives_ok('select public.assert_no_public_definer_execute()', 'no PUBLIC-executable security definer functions');

-- Signed-in-only RPCs: anon must not run them, authenticated must. (Security invoker RPCs such as
-- nearby_games keep PUBLIC execute on purpose, see rpc-exposure-plan.md; RLS gates them, and
-- game_visibility_test.sql asserts anon is denied at the table.)
select is(has_function_privilege('anon', p.oid, 'execute'), false, 'anon cannot execute ' || p.oid::regprocedure::text)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('request_to_join', 'decide_join_request', 'leave_game', 'remove_player', 'mark_attendance',
                    'add_reserved_spot', 'remove_reserved_spot', 'invite_to_reserved_spot',
                    'create_reserved_spot_invite', 'find_a_sub', 'create_game_with_spots', 'report_user', 'set_home_point')
order by p.proname;

select is(has_function_privilege('authenticated', p.oid, 'execute'), true, 'authenticated can execute ' || p.oid::regprocedure::text)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('request_to_join', 'decide_join_request', 'leave_game', 'remove_player', 'mark_attendance',
                    'add_reserved_spot', 'claim_reserved_spot', 'nearby_games', 'create_game_with_spots')
order by p.proname;

-- Intentionally public (website + logged-out Discover + invite preview).
select is(has_function_privilege('anon', p.oid, 'execute'), true, 'anon can execute ' || p.oid::regprocedure::text)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('nearby_games_public', 'game_preview', 'games_seo_feed', 'city_seo_stats', 'preview_reserved_spot_invite')
order by p.proname;

-- anon has no direct read on user data tables.
select is(has_table_privilege('anon', 'public.' || t, 'select'), false, 'anon cannot select public.' || t)
from unnest(array['game_players', 'game_reserved_spots', 'profile_private', 'blocks', 'ratings', 'messages',
                  'notifications', 'push_tokens']) as t;

-- Column-level UPDATE on games: hosts edit details, never identity or system columns.
select is(has_column_privilege('authenticated', 'public.games', c, 'update'), false, 'authenticated cannot update games.' || c)
from unnest(array['organizer_id', 'verification_status', 'created_at']) as c;
select is(has_column_privilege('authenticated', 'public.games', c, 'update'), true, 'authenticated can update games.' || c)
from unnest(array['starts_at', 'max_players', 'reserved_spots', 'status']) as c;

select * from finish();
rollback;
