-- G4: trusted media state, publish gate, automatic background-removal jobs with budget reservations.
-- Additive and compatible with the G3 client: prepared uploads keep publishing until
-- processing_settings.enforce_trusted_media is switched on (after the G4 client is deployed).

alter table public.greetings
  add column if not exists media_state text not null default 'ready'
    check (media_state in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists media_error text,
  add column if not exists media_checked_at timestamptz,
  add column if not exists source_kind text not null default 'prepared' check (source_kind in ('prepared', 'ordinary')),
  add column if not exists source_path text;
-- Existing (G3) rows were backfilled as 'ready' above; new rows start unverified.
alter table public.greetings alter column media_state set default 'pending';
alter table public.greetings drop constraint if exists source_path_in_owner_folder;
alter table public.greetings add constraint source_path_in_owner_folder
  check (source_path is null or split_part(source_path, '/', 1) = owner_id::text);

-- Single-row switches and limits; only the service role reads or changes them.
create table if not exists public.processing_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  enforce_trusted_media boolean not null default false,
  daily_budget_usd numeric(10, 4) not null default 1.00,
  creator_daily_attempts int not null default 5,
  usd_per_compute_second numeric(12, 8) not null default 0.000575,
  -- Reservation per second of video: G2 measured 6.6 compute s per video s; reserve 2x that.
  reserve_usd_per_video_second numeric(12, 8) not null default 0.0076,
  min_reserve_usd numeric(10, 4) not null default 0.05
);
insert into public.processing_settings (id) values (1) on conflict (id) do nothing;
alter table public.processing_settings enable row level security;

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  -- set null, not cascade: a deleted greeting's jobs stay in the budget/quota ledger.
  greeting_id uuid references public.greetings (id) on delete set null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  attempt int not null check (attempt >= 1),
  state text not null default 'queued' check (state in
    ('queued', 'normalizing', 'normalized', 'submitting', 'submitted', 'matte_ready', 'packing', 'ready', 'failed', 'cancelled')),
  provider text not null,
  -- One paid submission per (greeting, attempt); never reused for another submission.
  idempotency_key text not null unique,
  provider_request_id text unique,
  provider_urls jsonb,
  submit_started_at timestamptz,
  submit_uncertain boolean not null default false,
  last_polled_at timestamptz,
  mask_url text,
  normalized_path text,
  video_seconds real,
  lease_until timestamptz,
  step_tries int not null default 0,
  reserved_usd numeric(10, 4) not null default 0,
  reserved_at timestamptz,
  cost_usd numeric(10, 4),
  inference_seconds real,
  error_code text,
  user_message text,
  -- Optimistic concurrency: every transition is `update ... where version = <read version>`.
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (greeting_id, attempt)
);
-- At most one unfinished job per creator.
create unique index if not exists processing_jobs_one_active_per_owner on public.processing_jobs (owner_id)
  where state not in ('ready', 'failed', 'cancelled');
create index if not exists processing_jobs_reserved_at on public.processing_jobs (reserved_at);
alter table public.processing_jobs enable row level security;

revoke all on public.processing_jobs, public.processing_settings from anon, authenticated;
grant select on public.processing_jobs to authenticated;
grant all on public.processing_jobs, public.processing_settings to service_role;
drop policy if exists processing_jobs_owner_select on public.processing_jobs;
create policy processing_jobs_owner_select on public.processing_jobs for select to authenticated using (owner_id = auth.uid());

create or replace function public.processing_jobs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
drop trigger if exists processing_jobs_touch on public.processing_jobs;
create trigger processing_jobs_touch before update on public.processing_jobs
  for each row execute function public.processing_jobs_touch();

-- Owner of a greeting may publish only while still an allowlisted, confirmed creator, and only a
-- server-verified video. Clients cannot write media metadata; the server (service role) does.
create or replace function public.creator_ok(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_emails c join auth.users u on lower(u.email) = c.email
    where u.id = uid and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.creator_ok(uuid) from public;
grant execute on function public.creator_ok(uuid) to service_role;

create or replace function public.enforce_trusted_media() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enforce_trusted_media from public.processing_settings where id = 1), false);
$$;
revoke all on function public.enforce_trusted_media() from public;
grant execute on function public.enforce_trusted_media() to authenticated, service_role;

-- Not security definer: current_user must stay the API role (authenticated vs service_role).
create or replace function public.greetings_guard() returns trigger language plpgsql set search_path = public as $$
declare
  trusted boolean := current_user not in ('anon', 'authenticated');
  enforce boolean := public.enforce_trusted_media();
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.owner_id := old.owner_id;
    new.slug := old.slug;
    new.source_kind := old.source_kind;
    new.source_path := old.source_path;
    new.created_at := old.created_at;
    if not trusted then
      new.video_path := old.video_path;
      new.media_state := old.media_state;
      new.media_error := old.media_error;
      new.media_checked_at := old.media_checked_at;
      new.video_mime := old.video_mime;
      new.video_bytes := old.video_bytes;
      new.video_width := old.video_width;
      new.video_height := old.video_height;
      new.video_duration := old.video_duration;
      -- A new playback format must be re-verified by the server before it can be published.
      if new.video_format is distinct from old.video_format then
        if old.status = 'published' then
          raise exception 'unpublish the greeting before changing its format' using errcode = '42501';
        end if;
        if old.source_kind = 'ordinary' then
          raise exception 'the format of an automatically processed greeting cannot be changed' using errcode = '42501';
        end if;
        new.media_state := 'pending';
        new.media_checked_at := null;
      end if;
    end if;
  elsif not trusted then
    new.media_state := 'pending';
    new.media_error := null;
    new.media_checked_at := null;
    if new.source_kind = 'ordinary' then
      new.video_format := 'packed';
      new.video_mime := 'video/mp4';
    else
      new.source_path := null;
    end if;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not trusted and not public.is_creator() then
      raise exception 'this account is not enabled for publishing greetings' using errcode = '42501';
    end if;
    if new.media_state <> 'ready' and (enforce or new.source_kind = 'ordinary' or tg_op = 'INSERT') then
      raise exception 'the video is not ready to publish yet' using errcode = '42501';
    end if;
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists greetings_guard on public.greetings;
create trigger greetings_guard before insert or update on public.greetings
  for each row execute function public.greetings_guard();

-- Atomically reserve budget and the creator's daily attempt for one paid submission.
-- Spend today = settled cost of finished jobs + max(reservation, cost) of jobs still in flight.
create or replace function public.reserve_processing(job uuid, video_seconds real)
returns table (ok boolean, reason text, reserved numeric)
language plpgsql security definer set search_path = public as $$
declare
  s public.processing_settings;
  j public.processing_jobs;
  est numeric;
  spent numeric;
  attempts int;
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  perform pg_advisory_xact_lock(hashtext('processing_budget'));
  select * into s from public.processing_settings where id = 1;
  select * into j from public.processing_jobs where id = job for update;
  if j.id is null or j.state <> 'normalized' then
    return query select false, 'not-normalized'::text, 0::numeric; return;
  end if;
  if not s.enabled then
    return query select false, 'processing-disabled'::text, 0::numeric; return;
  end if;
  if not public.creator_ok(j.owner_id) then
    return query select false, 'not-creator'::text, 0::numeric; return;
  end if;
  est := round(greatest(s.min_reserve_usd, video_seconds::numeric * s.reserve_usd_per_video_second), 4);
  select coalesce(sum(case when state in ('ready', 'failed', 'cancelled') then coalesce(cost_usd, 0)
                           else greatest(reserved_usd, coalesce(cost_usd, 0)) end), 0)
    into spent from public.processing_jobs where reserved_at >= day_start;
  if spent + est > s.daily_budget_usd then
    return query select false, 'daily-budget'::text, est; return;
  end if;
  select count(*) into attempts from public.processing_jobs where owner_id = j.owner_id and reserved_at >= day_start;
  if attempts >= s.creator_daily_attempts then
    return query select false, 'creator-quota'::text, est; return;
  end if;
  update public.processing_jobs set state = 'submitting', reserved_usd = est, reserved_at = now(),
    submit_started_at = now(), submit_uncertain = false, video_seconds = reserve_processing.video_seconds
    where id = job;
  return query select true, null::text, est;
end $$;
revoke all on function public.reserve_processing(uuid, real) from public;
grant execute on function public.reserve_processing(uuid, real) to service_role;

-- Job -> ready and greeting -> ready in one transaction: a lost race (cancel, delete, newer attempt) changes neither.
create or replace function public.finish_processing(job uuid, expected_version int, path text, bytes bigint,
  width int, height int, duration double precision)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  g uuid;
begin
  update public.processing_jobs set state = 'ready', lease_until = null, finished_at = now(), error_code = null, user_message = null
    where id = job and version = expected_version and state = 'packing' and greeting_id is not null
    returning greeting_id into g;
  if g is null then return false; end if;
  update public.greetings set media_state = 'ready', media_error = null, media_checked_at = now(), video_format = 'packed',
    video_mime = 'video/mp4', video_path = path, video_bytes = bytes, video_width = width, video_height = height,
    video_duration = duration
    where id = g;
  return true;
end $$;
revoke all on function public.finish_processing(uuid, int, text, bigint, int, int, double precision) from public;
grant execute on function public.finish_processing(uuid, int, text, bigint, int, int, double precision) to service_role;

-- Temporary processing files (normalized input, provider mattes): private, 50 MiB like the video bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('greeting-work', 'greeting-work', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
