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
  video_path: string;
  video_format: VideoFormat;
  video_mime: string;
  video_bytes: number;
  video_width: number | null;
  video_height: number | null;
  video_duration: number | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishedGreeting {
  slug: string;
  title: string;
  video_path: string;
  video_format: string;
  video_mime: string;
}

/** Plain-language message for Supabase/HTTP errors shown to the creator. */
export function describeError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'This email is not confirmed yet. Open the confirmation email, then sign in.';
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

export async function createGreeting(row: Omit<GreetingRow, 'owner_id' | 'slug' | 'status' | 'published_at' | 'created_at' | 'updated_at'>): Promise<GreetingRow> {
  const { data, error } = await supabase().from('greetings').insert(row).select('*').single();
  if (error) throw error;
  return data as GreetingRow;
}

export async function updateGreeting(id: string, patch: Partial<Pick<GreetingRow, 'title' | 'status' | 'video_format'>>): Promise<GreetingRow> {
  const { data, error } = await supabase().from('greetings').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as GreetingRow;
}

export async function deleteGreeting(g: GreetingRow): Promise<void> {
  const { error } = await supabase().from('greetings').delete().eq('id', g.id);
  if (error) throw error;
  await supabase().storage.from(BUCKET).remove([g.video_path]);
}

/** Published greeting by link id, or the signed-in owner's own draft (preview). */
export async function loadForPlayback(slug: string): Promise<{ greeting: PublishedGreeting; draft: boolean } | null> {
  const db = supabase();
  const { data, error } = await db.rpc('get_published_greeting', { p_slug: slug });
  if (error) throw error;
  const rows = data as PublishedGreeting[] | null;
  if (rows && rows.length > 0) return { greeting: rows[0], draft: false };
  if (await currentSession()) {
    const own = await db.from('greetings').select('slug,title,video_path,video_format,video_mime').eq('slug', slug).maybeSingle();
    if (own.data) return { greeting: own.data as PublishedGreeting, draft: true };
  }
  return null;
}

export async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 6 * 3600);
  if (error) throw error;
  return data.signedUrl;
}
