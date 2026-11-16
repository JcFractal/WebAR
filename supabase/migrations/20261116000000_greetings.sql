-- G3 creator MVP: greetings table, private video bucket, ownership + publish rules.
-- Apply once to the dedicated WebAR Supabase project (SQL editor or Management API).

create extension if not exists pgcrypto;

create table if not exists public.greetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Stable public link id, assigned at creation and never changed (so printed QRs keep working).
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  title text not null check (char_length(title) between 1 and 80),
  video_path text not null unique,
  -- Explicit playback representation; the player never infers it from the file name.
  video_format text not null check (video_format in ('packed', 'alpha', 'opaque')),
  video_mime text not null check (video_mime in ('video/mp4', 'video/webm')),
  video_bytes bigint not null check (video_bytes > 0),
  video_width int,
  video_height int,
  video_duration real,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_path_in_owner_folder check (split_part(video_path, '/', 1) = owner_id::text)
);

alter table public.greetings enable row level security;

-- Invitation gate: only listed, confirmed emails may create greetings or upload (anyone may still sign up).
-- Keep Auth "Confirm email" on: with auto-confirm, anyone could register an unused listed address.
create table if not exists public.creator_emails (email text primary key check (email = lower(email)));
alter table public.creator_emails enable row level security;

create or replace function public.is_creator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_emails c join auth.users u on lower(u.email) = c.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_creator() from public;
grant execute on function public.is_creator() to authenticated;

-- Owners manage their own rows only. No anonymous table access: recipients use the function below.
drop policy if exists greetings_owner_select on public.greetings;
create policy greetings_owner_select on public.greetings for select to authenticated using (owner_id = auth.uid());
drop policy if exists greetings_owner_insert on public.greetings;
create policy greetings_owner_insert on public.greetings for insert to authenticated with check (owner_id = auth.uid() and public.is_creator());
drop policy if exists greetings_owner_update on public.greetings;
create policy greetings_owner_update on public.greetings for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists greetings_owner_delete on public.greetings;
create policy greetings_owner_delete on public.greetings for delete to authenticated using (owner_id = auth.uid());

-- Keep identity columns immutable and maintain timestamps.
create or replace function public.greetings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.owner_id := old.owner_id;
    new.slug := old.slug;
    new.video_path := old.video_path;
    new.created_at := old.created_at;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists greetings_guard on public.greetings;
create trigger greetings_guard before insert or update on public.greetings
  for each row execute function public.greetings_guard();

-- Recipients never touch the table or storage directly: api/greeting.ts looks up one published
-- greeting by slug with the service role and returns a short-lived signed video URL.

-- Private bucket: 50 MiB per file, MP4/WebM only. Paths are <owner uuid>/<greeting uuid>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('greeting-videos', 'greeting-videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists greeting_videos_owner_all on storage.objects;
drop policy if exists greeting_videos_owner_read on storage.objects;
create policy greeting_videos_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'greeting-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists greeting_videos_owner_insert on storage.objects;
create policy greeting_videos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'greeting-videos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_creator());
drop policy if exists greeting_videos_owner_delete on storage.objects;
create policy greeting_videos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'greeting-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists greeting_videos_published_read on storage.objects;
