-- Fix: p_suggested_value had no default, so a user leaving only a free-text note (no suggested
-- value) couldn't call the RPC without passing an explicit null — same optional shape as p_note.
create or replace function public.report_venue_correction(
  p_venue_id uuid,
  p_field text,
  p_suggested_value text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_today_count int;
  v_id uuid;
begin
  select count(*) into v_today_count
  from public.venue_corrections
  where reporter_id = auth.uid() and created_at >= now() - interval '1 day';

  if v_today_count >= 10 then
    raise exception 'Daily correction report limit reached';
  end if;

  insert into public.venue_corrections (venue_id, reporter_id, field, suggested_value, note)
  values (p_venue_id, auth.uid(), p_field, p_suggested_value, p_note)
  returning id into v_id;

  return v_id;
end;
$$;
