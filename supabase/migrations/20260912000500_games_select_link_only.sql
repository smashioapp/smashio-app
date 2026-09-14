-- M1 (security-audit-2026-09-11.md): the 2026-09-10 link_only fix patched every RPC that
-- enumerates games but left the base table's own select policy at `using (true)`, so
-- `GET /rest/v1/games?visibility=eq.link_only&select=*` still listed every link_only game to any
-- authenticated caller. Resolving one known id (game_preview, games_public by id, /game/:id,
-- post_preview) stays untouched — this only narrows what a *listing* query can see.
--
-- Organizer and approved-player carve-outs keep the direct .from("games") reads that rely on the
-- old open policy working: ui/lib/queries/messages.ts's useChatGameMeta (chat is approved-only),
-- ui/lib/queries/games.ts's attendance_marked_at read on the post-game rating screen, and
-- ui/lib/queries/profile.ts / gamePlayers.ts's own-organizer reads.
drop policy "games readable by authenticated" on public.games;

-- Uses is_approved_player() (security definer) rather than a raw game_players subquery: that
-- table's own select policy joins back to games (organizer check), so a plain subquery here
-- would recurse RLS evaluation between the two tables.
create policy "games readable by authenticated" on public.games
  for select to authenticated using (
    visibility = 'public'
    or organizer_id = auth.uid()
    or public.is_approved_player(id, auth.uid())
  );
