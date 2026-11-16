/// <reference types="node" />
import { createClient } from '@supabase/supabase-js';

const SLUG = /^[a-f0-9]{12}$/;
const BUCKET = 'greeting-videos';
const URL_TTL_SECONDS = 6 * 3600;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Recipient lookup `GET /api/greeting?g=<link id>`: no account needed. Uses the service role on the
 * server so anonymous clients get no table or storage access at all (drafts and other greetings
 * cannot be listed); returns one published greeting with a short-lived signed video URL.
 */
export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('g') ?? '';
  if (!SLUG.test(slug)) return json(400, { error: 'invalid-link' });
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: 'not-configured' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from('greetings')
    .select('slug,title,video_path,video_format,video_mime')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) return json(502, { error: 'lookup-failed' });
  if (!data) return json(404, { error: 'not-published' });
  const signed = await db.storage.from(BUCKET).createSignedUrl(data.video_path, URL_TTL_SECONDS);
  if (signed.error) return json(502, { error: 'video-unavailable' });
  return json(200, { slug: data.slug, title: data.title, video_format: data.video_format, video_mime: data.video_mime, video_url: signed.data.signedUrl });
}
