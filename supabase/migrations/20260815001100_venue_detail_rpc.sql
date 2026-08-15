-- A3 (venues-plan.md §5.1): one round trip for ui/app/venue/[id].tsx. security invoker — every
-- table it touches is already select-to-authenticated (A1/A5), no elevated access needed, unlike
-- player_card which reaches into RLS-restricted game_players.
create function public.venue_detail(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'id', v.id,
    'name', v.name,
    'suburb', v.suburb,
    'state', v.state,
    'address', v.address,
    'lat', extensions.ST_Y(v.location::extensions.geometry),
    'lng', extensions.ST_X(v.location::extensions.geometry),
    'region', v.region,
    'slug', v.slug,
    'profile', (
      select jsonb_build_object(
        'courts_badminton', vp.courts_badminton,
        'courts_total', vp.courts_total,
        'dedicated', vp.dedicated,
        'surface', vp.surface,
        'bookability', vp.bookability,
        'club_contact', vp.club_contact,
        'booking_platform', vp.booking_platform,
        'booking_url', vp.booking_url,
        'website_url', vp.website_url,
        'phone', vp.phone,
        'opening_hours', vp.opening_hours,
        'access_notes', vp.access_notes,
        'summary', vp.summary,
        'confidence', vp.confidence,
        'verified_at', vp.verified_at
      )
      from public.venue_profiles vp
      where vp.venue_id = v.id
    ),
    'amenities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', at.slug,
        'label', at.label,
        'icon', at.icon,
        'category', at.category,
        'availability', va.availability,
        'note', va.note
      ) order by at.category, at.ordinal), '[]'::jsonb)
      from public.venue_amenities va
      join public.amenity_types at on at.slug = va.amenity_slug
      where va.venue_id = v.id
    ),
    'pricing_bands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pb.id,
        'label', pb.label,
        'days', pb.days,
        'starts_time', pb.starts_time,
        'ends_time', pb.ends_time,
        'cents', pb.cents,
        'unit', pb.unit,
        'notes', pb.notes
      ) order by pb.label), '[]'::jsonb)
      from public.venue_pricing_bands pb
      where pb.venue_id = v.id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'credit', ph.credit
      ) order by ph.ordinal), '[]'::jsonb)
      from public.venue_photos ph
      where ph.venue_id = v.id and ph.status = 'approved'
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
  where v.id = p_venue_id;
$$;

grant execute on function public.venue_detail(uuid) to authenticated;
