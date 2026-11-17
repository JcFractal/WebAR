import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { BUCKET, type VideoFormat } from './format';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SERVICE_MISSING =
  'The greeting service is not configured for this deployment (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing).';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!URL_ || !KEY) throw new Error(SERVICE_MISSING);
  client ??= createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export interface GreetingRow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  theme: Theme;
  video_path: string;
  video_format: VideoFormat;
  video_mime: string;
  video_bytes: number;
  video_width: number | null;
  video_height: number | null;
  video_duration: number | null;
  status: 'draft' | 'published';
  /** Server-verified video state; only `ready` may be published. */
  media_state: 'pending' | 'processing' | 'ready' | 'failed';
  media_error: string | null;
  source_kind: 'prepared' | 'ordinary';
  source_path: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Theme = 'plain' | 'birthday';

export interface PublishedGreeting {
  slug: string;
  title: string;
  theme?: Theme;
  video_path: string;
  video_format: string;
  video_mime: string;
}

/** Plain-language message for Supabase/HTTP errors shown to the creator. */
export function describeError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'This email is not confirmed yet. Open the confirmation email, then sign in.';
  if (/row-level security|violates row-level|Unauthorized|403/i.test(msg)) return 'This account is not enabled for creating greetings yet. Ask the site owner to add your email.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No connection to the greeting service. Check your network and try again.';
  return msg ? `${fallback} (${msg})` : fallback;
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase().auth.getSession();
  return data.session;
}

export async function listMine(): Promise<GreetingRow[]> {
  const { data, error } = await supabase().from('greetings').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as GreetingRow[];
}

/**
 * Upload with progress (XHR to the Storage REST endpoint; supabase-js offers no progress events).
 * Never overwrites: each greeting gets a new path.
 */
export function uploadVideo(
  session: Session,
  path: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!URL_ || !KEY) return reject(new Error(SERVICE_MISSING));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${URL_}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', KEY);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let detail = xhr.statusText;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        detail = body.message || body.error || detail;
      } catch {
        /* keep statusText */
      }
      if (xhr.status === 413 || /maximum allowed size|too large/i.test(detail)) reject(new Error('The file is larger than the 50 MiB storage limit.'));
      else if (/mime type/i.test(detail)) reject(new Error('Storage only accepts MP4 or WebM files.'));
      else reject(new Error(`Upload failed (HTTP ${xhr.status}: ${detail}).`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted by a network error. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

type NewGreeting = Omit<GreetingRow, 'owner_id' | 'slug' | 'status' | 'published_at' | 'created_at' | 'updated_at' | 'media_state' | 'media_error' | 'source_kind' | 'source_path'> &
  Partial<Pick<GreetingRow, 'source_kind' | 'source_path'>>;

export async function createGreeting(row: NewGreeting): Promise<GreetingRow> {
  const { data, error } = await supabase().from('greetings').insert(row).select('*').single();
  if (error) throw error;
  return data as GreetingRow;
}

export async function updateGreeting(id: string, patch: Partial<Pick<GreetingRow, 'title' | 'theme' | 'status' | 'video_format'>>): Promise<GreetingRow> {
  const { data, error } = await supabase().from('greetings').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as GreetingRow;
}

export interface JobStatus {
  id: string;
  greeting_id: string;
  attempt: number;
  state: string;
  stage: string;
  error_code: string | null;
  user_message: string | null;
}

export const JOB_DONE = ['ready', 'failed', 'cancelled'];

/** Server processing API (api/process.ts); errors carry the server's plain-language message. */
export async function processApi<T>(body: { action: string; greeting?: string; job?: string }): Promise<T> {
  const session = await currentSession();
  if (!session) throw new Error('Your sign-in has expired. Sign in again.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No connection to the greeting service. Check your network; processing continues once you are back.');
  }
  const out = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(out.message ?? `The greeting service did not respond correctly (HTTP ${res.status}).`);
  return out;
}

export async function latestJob(greetingId: string): Promise<JobStatus | null> {
  const { data, error } = await supabase()
    .from('processing_jobs')
    .select('id,greeting_id,attempt,state,error_code,user_message')
    .eq('greeting_id', greetingId)
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? ({ ...data, stage: '' } as JobStatus) : null;
}

/** Server-side delete: cancels any provider request and removes every file of the greeting. */
export async function deleteGreeting(g: GreetingRow): Promise<void> {
  await processApi({ action: 'delete', greeting: g.id });
}

export class GreetingUnavailable extends Error {}

/** Recipient: published greeting via api/greeting.ts; the signed-in owner can also preview a draft. */
export async function loadForPlayback(slug: string): Promise<{ greeting: PublishedGreeting; videoUrl: string; draft: boolean }> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/greeting?g=${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.ok) {
    const body = (await res.json()) as PublishedGreeting & { video_url: string };
    return { greeting: body, videoUrl: body.video_url, draft: false };
  }
  if (res.status !== 404) {
    throw new GreetingUnavailable(res.status === 503 ? SERVICE_MISSING : `The greeting service did not respond correctly (HTTP ${res.status}). Try again shortly.`);
  }
  if (URL_ && KEY && (await currentSession())) {
    const own = await supabase().from('greetings').select('slug,title,video_path,video_format,video_mime').eq('slug', slug).maybeSingle();
    if (own.data) {
      const g = own.data as PublishedGreeting;
      return { greeting: g, videoUrl: await signedVideoUrl(g.video_path), draft: true };
    }
  }
  throw new GreetingUnavailable('This greeting is not published, or the link is wrong. Ask the sender for a new link.');
}

export async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 6 * 3600);
  if (error) throw error;
  return data.signedUrl;
}
