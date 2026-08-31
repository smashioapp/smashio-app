-- gtm-plan.md G11: zero organic search surface. venue_detail (20260815001100) is
-- authenticated-only and keyed by uuid — no use to a crawler, which never logs in and never
-- gets the slug->id mapping the app already has client-side. Two new anon-safe RPCs so the
-- website (not the app) can render real, indexable /venue/:slug pages and a venue-list hub
-- without exposing anything the authenticated version doesn't already show every signed-in user.
-- Photos are deliberately left out: venue_photos lives in a private storage bucket and signing a
-- URL needs a service-role call the website's stateless serverless function doesn't make — same
-- omission game_preview (20260820000100) made for the same reason.

-- Full detail for one venue's SEO page. Takes a slug (the canonical SEO URL) or a raw uuid
-- (ui/app/venue/[id].tsx's shareVenue already mints https://smashio.com.au/venue/<uuid> links —
-- widening to also resolve those means an existing share link gets real content instead of the
-- generic venue.html card, for free). security definer: venues/venue_profiles/etc are
-- select-to-authenticated only, and a crawler is never authenticated.
create function public.venue_seo_detail(p_identifier text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id,
    'slug', v.slug,
    'name', v.name,
    'suburb', v.suburb,
    'state', v.state,
    'address', v.address,
    'region', v.region,
    'profile', (
      select jsonb_build_object(
        'courts_badminton', vp.courts_badminton,
        'courts_total', vp.courts_total,
        'dedicated', vp.dedicated,
        'surface', vp.surface,
        'bookability', vp.bookability,
        'booking_url', vp.booking_url,
        'website_url', vp.website_url,
        'phone', vp.phone,
        'opening_hours', vp.opening_hours,
        'access_notes', vp.access_notes,
        'summary', vp.summary
      )
      from public.venue_profiles vp
      where vp.venue_id = v.id
    ),
    'amenities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', at.slug,
        'label', at.label,
        'category', at.category,
        'availability', va.availability
      ) order by at.category, at.ordinal), '[]'::jsonb)
      from public.venue_amenities va
      join public.amenity_types at on at.slug = va.amenity_slug
      where va.venue_id = v.id and va.availability in ('yes', 'paid')
    ),
    'pricing_bands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', pb.label,
        'days', pb.days,
        'starts_time', pb.starts_time,
        'ends_time', pb.ends_time,
        'cents', pb.cents,
        'unit', pb.unit
      ) order by pb.label), '[]'::jsonb)
      from public.venue_pricing_bands pb
      where pb.venue_id = v.id
    ),
    'upcoming_game_count', (
      select count(*)::int from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.starts_at >= now()
    ),
    'next_game_at', (
      select min(g.starts_at) from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.starts_at >= now()
    )
  )
  from public.venues v
  where v.slug = p_identifier or v.id::text = p_identifier;
$$;

grant execute on function public.venue_seo_detail(text) to anon, authenticated;

-- Sitemap + /sydney hub source. Gated to slug is not null and a profile exists, same "real
-- content" bar venues-plan.md's enrichment work sets — the unenriched P2 queue (venues-plan.md
-- §8) stays unindexed rather than serving Google 50-odd thin pages with nothing on them.
create function public.venue_seo_directory()
returns table (
  slug text,
  name text,
  suburb text,
  region text,
  courts_total int,
  dedicated boolean
)
language sql
stable
security definer set search_path = public
as $$
  select v.slug, v.name, v.suburb, v.region, vp.courts_total, vp.dedicated
  from public.venues v
  join public.venue_profiles vp on vp.venue_id = v.id
  where v.slug is not null
  order by v.suburb, v.name;
$$;

grant execute on function public.venue_seo_directory() to anon, authenticated;
