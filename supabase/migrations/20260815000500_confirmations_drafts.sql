-- Host flow plan (docs/host-flow-plan.md), P0: uploads land before a game exists. game_id
-- becomes nullable so a receipt can be parsed on step 0, before the wizard has created
-- anything to attach it to. claimed_at is stamped when a draft is later attached to a game
-- (see ai-proxy's 'attach' mode) — nullable + claimed_at lets the purge crons tell "still a
-- draft" apart from "attached but somehow still unset", which never happens but keeps the
-- column's meaning unambiguous rather than overloading game_id-is-null for both.
-- storage_path also goes nullable: the retention purge (purge-confirmations, daily) deletes the
-- blob and nulls this column while keeping the row (parsed + review_status survive as the
-- record of what was verified).
alter table public.game_confirmations
  alter column game_id drop not null,
  alter column storage_path drop not null,
  add column claimed_at timestamptz;

-- Existing read policy only covered organizer-owned rows (via games.organizer_id), which is
-- meaningless for a draft with no game yet. Add the uploader arm so a caller can read back
-- their own in-flight draft (parsed fields for the review step) before it's attached.
drop policy "organizer reads own game confirmations" on public.game_confirmations;

create policy "organizer or uploader reads own confirmations" on public.game_confirmations
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.games g
      where g.id = game_confirmations.game_id and g.organizer_id = auth.uid()
    )
  );

-- Draft uploads land at drafts/{auth.uid()}/{confirmation_id}.jpg, ahead of any game_id. The
-- existing organizer-scoped {game_id}/ policy is untouched (confirmations_storage.sql) — the
-- upload-from-hosting-card path (useUploadConfirmation) still uses it and must not regress.
create policy "authenticated manages own draft confirmations" on storage.objects
  for all to authenticated
  using (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text);
