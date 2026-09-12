-- home-redesign-plan.md H5: hero live counter strip needs a suburbs-covered count alongside
-- games_this_week/venues_tracked. city_seo_stats already exists (20260910010000_games_seo_feed.sql)
-- and is anon-granted counts-only, so this just adds one more aggregate field to it.

create or replace function public.city_seo_stats()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'games_this_week', (
      select count(*)::int from public.games_public gp
      where gp.status = 'published'
        and gp.visibility = 'public'
        and gp.starts_at >= now()
        and gp.starts_at <= now() + interval '7 days'
    ),
    'venues_tracked', (
      select count(*)::int from public.venues v where v.slug is not null
    ),
    'suburbs_covered', (
      select count(distinct v.suburb)::int from public.venues v
      where v.slug is not null and v.suburb is not null
    ),
    'generated_at', now()
  );
$$;

grant execute on function public.city_seo_stats() to anon, authenticated;
revoke execute on function public.city_seo_stats() from public;
