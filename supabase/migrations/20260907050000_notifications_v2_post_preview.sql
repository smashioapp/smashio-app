-- Notifications v2 (docs/notifications-v2-plan.md), phase V2.0 §6.3 — "Feed posts are
-- unshareable. website/api/post/ does not exist, and vercel.json has no /post/:id rewrite."
-- Mirrors game_preview_anon.sql's shape: anon deep-link teaser, single-id lookup only (not
-- listable), no organizer/author PII beyond a first name.
create or replace function public.post_preview(p_post_id uuid)
returns table (
  id uuid,
  kind text,
  body text,
  author_display_name text,
  sport_name text,
  venue_name text,
  venue_suburb text,
  reply_count int,
  reaction_count int,
  created_at timestamptz,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.kind,
    p.body,
    split_part(coalesce(nullif(pr.display_name, ''), 'A player'), ' ', 1),
    s.name,
    v.name,
    v.suburb,
    p.reply_count,
    p.reaction_count,
    p.created_at,
    p.status
  from public.posts p
  left join public.sports s on s.id = p.sport_id
  left join public.venues v on v.id = p.venue_id
  left join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id;
$$;

grant execute on function public.post_preview(uuid) to anon, authenticated;
