-- social-plan.md B5 (§13.6 step 5): must precede the composer, never follow it (§10). Widens
-- user_reports to content-level (§5.4), adds the moderation_flags queue the ai-proxy pre-publish
-- filter writes to, a posts rate limit, and a Supabase-view admin queue.

-- ---------------------------------------------------------------------------------------------
-- 1. user_reports — widen to subject_type/subject_id (§5.4). One queue, not a second table.
-- ---------------------------------------------------------------------------------------------

alter table public.user_reports
  add column subject_type text not null default 'profile'
    check (subject_type in ('profile', 'post', 'comment', 'photo', 'message', 'club')),
  add column subject_id uuid;

update public.user_reports set subject_id = reported_id where subject_id is null;
alter table public.user_reports alter column reported_id drop not null;

alter table public.user_reports drop constraint user_reports_reason_check;
alter table public.user_reports add constraint user_reports_reason_check
  check (reason in ('harassment', 'no_show', 'unsafe', 'fake_profile', 'spam', 'other', 'hate', 'sexual', 'violence', 'misinformation'));

create index user_reports_subject_idx on public.user_reports(subject_type, subject_id);

-- Mirrors report_user()'s rate-limit shape (§10 item 7: reports keep the shipped 1/target/day
-- limit). p_reported_id stays "the account responsible" for repeat-offender counting even when
-- the subject is a post, not a profile — the caller resolves author_id before calling this.
create function public.report_content(
  p_subject_type text,
  p_subject_id uuid,
  p_reported_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
  v_id uuid;
begin
  if p_reported_id = auth.uid() then
    raise exception 'Cannot report your own content';
  end if;

  select count(*) into v_recent
  from public.user_reports
  where reporter_id = auth.uid()
    and subject_type = p_subject_type
    and subject_id = p_subject_id
    and created_at >= now() - interval '1 day';

  if v_recent >= 1 then
    raise exception 'You have already reported this today';
  end if;

  insert into public.user_reports (reporter_id, reported_id, subject_type, subject_id, reason, detail)
  values (auth.uid(), p_reported_id, p_subject_type, p_subject_id, p_reason, p_detail)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.report_content(text, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. moderation_flags — the ai-proxy pre-publish filter's queue (§10 item 4). service_role only;
-- no client table access. Fail-open entries (classify_timeout/classify_error) and hard flags
-- both land here so an LLM outage leaves a trail instead of silently clearing every post.
-- ---------------------------------------------------------------------------------------------

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  category text,
  reason text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create index moderation_flags_status_idx on public.moderation_flags(status, created_at desc);

alter table public.moderation_flags enable row level security;
-- No policies for authenticated — service_role (the edge function) is the only writer/reader.
revoke all on public.moderation_flags from anon, authenticated;
grant all on public.moderation_flags to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Admin queue — a Supabase-dashboard view (§10 item 5), not app UI. One table's worth of
-- open items across both sources, newest first.
-- ---------------------------------------------------------------------------------------------

create view public.moderation_queue as
  select
    'report'::text as source,
    ur.id,
    ur.subject_type,
    ur.subject_id,
    ur.reported_id as author_id,
    ur.reason,
    ur.detail,
    ur.status,
    ur.created_at
  from public.user_reports ur
  where ur.status = 'open'
  union all
  select
    'ai_flag'::text as source,
    mf.id,
    'post'::text as subject_type,
    null::uuid as subject_id,
    mf.author_id,
    coalesce(mf.category, mf.reason) as reason,
    mf.text as detail,
    mf.status,
    mf.created_at
  from public.moderation_flags mf
  where mf.status = 'open'
  order by created_at desc;

revoke all on public.moderation_queue from anon, authenticated;
grant select on public.moderation_queue to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Rate limits (§10 item 7, decided 2026-08-31): 10 posts/day per user. follows already got
-- its 50/day cap in B0; comments (30/day) land with post_comments in B3.
-- ---------------------------------------------------------------------------------------------

create function public.posts_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
begin
  if new.kind = 'system' then
    return new;
  end if;

  select count(*) into v_recent
  from public.posts
  where author_id = new.author_id and kind <> 'system' and created_at >= now() - interval '1 day';

  if v_recent >= 10 then
    raise exception 'You''ve hit today''s posting limit, try again tomorrow';
  end if;

  return new;
end;
$$;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.posts_rate_limit();
