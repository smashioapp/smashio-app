-- Notifications v2 (docs/notifications-v2-plan.md), phase V2.2 — the expand line (§4.1). A third
-- rendered string alongside title/body: sent as iOS subtitle, appended behind a line break on
-- Android, and shown as a third line in the inbox. Stamped back onto the row the same way
-- title/body already are, so the inbox and the retry sweep both see it without a re-render.

alter table public.notifications add column if not exists expand text;
