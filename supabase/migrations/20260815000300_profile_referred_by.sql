-- Profile plan P5: referral attribution. shareReferral shared a link with nothing to credit
-- it to — this column plus a client-side capture (lib/referral.ts) closes that loop. Self
-- writable under the existing "update own row" policy (profiles.sql) since it's an attribution
-- hint, not a security boundary.
alter table public.profiles add column referred_by uuid references public.profiles(id) on delete set null;
