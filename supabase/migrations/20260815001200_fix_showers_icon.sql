-- Fix: 'shower' is not a valid Ionicons glyph (checked against the installed glyphmap) — the app
-- would render nothing for the showers amenity row seeded in 20260815000800.
update public.amenity_types set icon = 'water-outline' where slug = 'showers';
