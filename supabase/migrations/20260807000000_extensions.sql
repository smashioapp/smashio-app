-- Slice 0: foundation. Enables PostGIS for venue/geo columns used from slice 2 onward.
create extension if not exists postgis with schema extensions;
