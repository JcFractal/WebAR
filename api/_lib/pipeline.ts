/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIMITS, PAID, SubmitError, TERMINAL, costUsd, nextAction, stageLabel, type JobState } from './jobs.js';
import { download, mockMatte, normalize, pack, packOk, probe } from './media.js';
import type { Provider, ProviderOutcome, ProviderUrls } from './provider.js';
import { MAX_BYTES, SECONDS, preparedProblems, sourceProblems, type Format } from './rules.js';

export const VIDEOS = 'greeting-videos';
export const WORK = 'greeting-work';
/** Provider mattes are streamed into the function's /tmp only (a 30 s ProRes matte is ~60 MB). */
const MATTE_MAX_BYTES = 300 * 1024 * 1024;

export interface Ctx {
  db: SupabaseClient;
  provider: Provider;
  webhookBase: string;
  now?: () => number;
}

export interface User {
  id: string;
  creator: boolean;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Job {
  id: string;
  greeting_id: string | null;
  owner_id: string;
  attempt: number;
  state: JobState;
  provider: string;
  idempotency_key: string;
  provider_request_id: string | null;
  provider_urls: ProviderUrls | null;
  submit_started_at: string | null;
  submit_uncertain: boolean;
  last_polled_at: string | null;
  mask_url: string | null;
  normalized_path: string | null;
  video_seconds: number | null;
  lease_until: string | null;
  step_tries: number;
  reserved_usd: number;
  cost_usd: number | null;
  inference_seconds: number | null;
  error_code: string | null;
  user_message: string | null;
  version: number;
}

interface Greeting {
  id: string;
  owner_id: string;
  video_path: string;
  video_format: Format;
  video_mime: string;
  media_state: string;
  source_kind: 'prepared' | 'ordinary';
  source_path: string | null;
}

const now = (ctx: Ctx) => (ctx.now ?? Date.now)();
const iso = (ms: number) => new Date(ms).toISOString();

/** Creator-safe view (no provider URLs). */
export function publicJob(j: Job) {
  return { id: j.id, greeting_id: j.greeting_id, attempt: j.attempt, state: j.state, stage: stageLabel(j.state), error_code: j.error_code, user_message: j.user_message, cost_usd: j.cost_usd };
}

export async function authUser(db: SupabaseClient, authorization: string | null): Promise<User> {
  const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
  if (!token) throw new HttpError(401, 'signed-out', 'Sign in again.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'signed-out', 'Your sign-in has expired. Sign in again.');
  const ok = await db.rpc('creator_ok', { uid: data.user.id });
  return { id: data.user.id, creator: ok.data === true };
}

async function settings(ctx: Ctx): Promise<{ usd_per_compute_second: number; enabled: boolean }> {
  const { data, error } = await ctx.db.from('processing_settings').select('enabled,usd_per_compute_second').eq('id', 1).single();
  if (error) throw error;
  return { enabled: data.enabled, usd_per_compute_second: Number(data.usd_per_compute_second) };
}

async function loadJob(ctx: Ctx, id: string): Promise<Job | null> {
  const { data, error } = await ctx.db.from('processing_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Job | null;
}

async function ownGreeting(ctx: Ctx, user: User, id: string): Promise<Greeting> {
  const { data, error } = await ctx.db.from('greetings').select('id,owner_id,video_path,video_format,video_mime,media_state,source_kind,source_path').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== user.id) throw new HttpError(404, 'not-found', 'Greeting not found.');
  return data as Greeting;
}

/** Conditional transition: applies only if nobody else changed the job since it was read. */
async function transition(ctx: Ctx, job: Job, patch: Partial<Job> & Record<string, unknown>): Promise<Job | null> {
  const { data, error } = await ctx.db.from('processing_jobs').update(patch).eq('id', job.id).eq('version', job.version).select('*').maybeSingle();
  if (error) throw error;
  return data as Job | null;
}

async function setGreeting(ctx: Ctx, id: string | null, patch: Record<string, unknown>): Promise<void> {
  if (!id) return;
  const { error } = await ctx.db.from('greetings').update(patch).eq('id', id);
  if (error) throw error;
}

function workDir(): string {
  const dir = join(tmpdir(), `g4-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function fetchObject(ctx: Ctx, bucket: string, path: string, file: string, maxBytes = MAX_BYTES): Promise<number> {
  const signed = await ctx.db.storage.from(bucket).createSignedUrl(path, 600);
  if (signed.error) throw new HttpError(404, 'file-missing', 'The uploaded video file is missing. Upload it again.');
  return download(signed.data.signedUrl, file, maxBytes);
}

async function putObject(ctx: Ctx, bucket: string, path: string, file: string): Promise<void> {
  const up = await ctx.db.storage.from(bucket).upload(path, readFileSync(file), { contentType: 'video/mp4', upsert: true });
  if (up.error) throw new Error(`storage upload ${bucket}/${path}: ${up.error.message}`);
}

async function fail(ctx: Ctx, job: Job, code: string, message: string, cost: number | null, state: 'failed' | 'cancelled' = 'failed'): Promise<Job | null> {
  const done = await transition(ctx, job, { state, lease_until: null, error_code: code, user_message: message, cost_usd: cost, finished_at: iso(now(ctx)) });
  if (done) await setGreeting(ctx, job.greeting_id, { media_state: 'failed', media_error: message });
  return done;
}

/** Start (or explicitly retry) automatic processing of an uploaded ordinary recording. */
export async function startProcessing(ctx: Ctx, user: User, greetingId: string): Promise<Job> {
  if (!user.creator) throw new HttpError(403, 'not-creator', 'This account is not enabled for creating greetings yet.');
  const g = await ownGreeting(ctx, user, greetingId);
  if (g.source_kind !== 'ordinary' || !g.source_path) throw new HttpError(400, 'not-ordinary', 'This greeting was uploaded as a processed video.');
  if (g.media_state === 'ready') throw new HttpError(409, 'already-ready', 'This greeting is already processed.');
  if (!(await settings(ctx)).enabled) throw new HttpError(503, 'processing-disabled', 'Automatic background removal is switched off right now.');
  const active = await ctx.db.from('processing_jobs').select('id,greeting_id').eq('owner_id', user.id).not('state', 'in', `(${TERMINAL.join(',')})`);
  if (active.error) throw active.error;
  if (active.data.length) {
    throw new HttpError(409, 'busy', active.data[0].greeting_id === g.id ? 'This greeting is already processing.' : 'Another greeting is still processing. Wait for it to finish first.');
  }

  const dir = workDir();
  try {
    const src = join(dir, 'source');
    const bytes = await fetchObject(ctx, VIDEOS, g.source_path, src, MAX_BYTES);
    const info = await probe(src);
    const problems = sourceProblems(bytes, info);
    if (problems.length) {
      const message = problems.map((p) => p.message).join(' ');
      await setGreeting(ctx, g.id, { media_state: 'failed', media_error: message });
      throw new HttpError(422, problems[0].code, message);
    }
    const prev = await ctx.db.from('processing_jobs').select('attempt').eq('greeting_id', g.id).order('attempt', { ascending: false }).limit(1);
    const attempt = (prev.data?.[0]?.attempt ?? 0) + 1;
    const ins = await ctx.db.from('processing_jobs').insert({
      greeting_id: g.id, owner_id: user.id, attempt, provider: ctx.provider.name,
      idempotency_key: `${g.id}:${attempt}`, video_seconds: info.duration, state: 'queued',
    }).select('*').single();
    if (ins.error) {
      if (ins.error.code === '23505') throw new HttpError(409, 'busy', 'Another greeting is still processing. Wait for it to finish first.');
      throw ins.error;
    }
    await setGreeting(ctx, g.id, { media_state: 'processing', media_error: null });
    return ins.data as Job;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function applyOutcome(ctx: Ctx, job: Job, outcome: ProviderOutcome): Promise<Job | null> {
  if (outcome.state === 'pending') return job;
  let inference = outcome.inferenceSeconds ?? null;
  if (inference === null && job.provider_request_id) {
    inference = (await ctx.provider.status(job.provider_request_id, job.provider_urls ?? {}).catch(() => null))?.inferenceSeconds ?? null;
  }
  // Unknown compute time: charge the reservation (never under-count spend).
  const cost = costUsd(inference, (await settings(ctx)).usd_per_compute_second) ?? Number(job.reserved_usd);
  if (outcome.state === 'completed' && outcome.maskUrl) {
    return transition(ctx, job, { state: 'matte_ready', mask_url: outcome.maskUrl, inference_seconds: inference, cost_usd: job.provider === 'mock' ? 0 : cost });
  }
  return fail(ctx, job, 'provider-failed', 'Background removal failed for this video. You can try again.', job.provider === 'mock' ? 0 : cost);
}

/** Advance one step. Safe to call repeatedly and concurrently (leases + conditional transitions). */
export async function tick(ctx: Ctx, user: User | null, jobId: string): Promise<Job> {
  const job = await loadJob(ctx, jobId);
  if (!job || (user && job.owner_id !== user.id)) throw new HttpError(404, 'not-found', 'Processing job not found.');
  const t = now(ctx);
  const action = nextAction(job, t);
  const after = async (j: Job | null) => (await loadJob(ctx, jobId)) ?? j ?? job;

  if (action === 'normalize') {
    const mine = await transition(ctx, job, { state: 'normalizing', lease_until: iso(t + LIMITS.leaseSeconds * 1000), step_tries: job.step_tries + 1 });
    if (!mine) return after(null);
    const dir = workDir();
    try {
      const g = (await ctx.db.from('greetings').select('source_path').eq('id', job.greeting_id).single()).data as { source_path: string };
      const src = join(dir, 'source');
      await fetchObject(ctx, VIDEOS, g.source_path, src);
      const norm = join(dir, 'normalized.mp4');
      await normalize(src, norm, await probe(src));
      const n = await probe(norm);
      if (!n.width || !n.height || !n.frames || !n.duration) throw new Error('normalized output unreadable');
      const path = `${job.greeting_id}/normalized.mp4`;
      await putObject(ctx, WORK, path, norm);
      return after(await transition(ctx, mine, { state: 'normalized', lease_until: null, step_tries: 0, normalized_path: path, video_seconds: n.duration, error_code: null }));
    } catch (err) {
      console.error('normalize', job.id, err);
      if (mine.step_tries >= LIMITS.maxStepTries) return after(await fail(ctx, mine, 'normalize-failed', 'This video could not be prepared. Try a different recording.', 0));
      return after(await transition(ctx, mine, { state: 'queued', lease_until: null, error_code: 'normalize-retry' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (action === 'fail-step') return after(await fail(ctx, job, 'step-failed', 'Processing kept failing. Try again later.', job.provider === 'mock' ? 0 : job.cost_usd));

  if (action === 'submit') {
    const r = await ctx.db.rpc('reserve_processing', { job: job.id, video_seconds: job.video_seconds ?? SECONDS[1] });
    if (r.error) throw r.error;
    const res = (r.data as { ok: boolean; reason: string | null }[])[0];
    if (!res?.ok) {
      if (res?.reason === 'not-normalized') return after(null);
      const msg: Record<string, string> = {
        'daily-budget': "Today's background-removal budget is used up. Try again tomorrow.",
        'creator-quota': "You've reached today's limit of processing attempts. Try again tomorrow.",
        'processing-disabled': 'Automatic background removal is switched off right now.',
        'not-creator': 'This account is not enabled for creating greetings anymore.',
      };
      const latest = await loadJob(ctx, job.id);
      return after(latest && (await fail(ctx, latest, res?.reason ?? 'reserve-failed', msg[res?.reason ?? ''] ?? 'Processing could not start.', 0)));
    }
    const reserved = (await loadJob(ctx, job.id))!;
    const signed = await ctx.db.storage.from(WORK).createSignedUrl(reserved.normalized_path!, 2 * 3600);
    if (signed.error) return after(await fail(ctx, reserved, 'normalized-missing', 'The prepared video went missing. Try again.', 0));
    try {
      const sub = await ctx.provider.submit({
        videoUrl: signed.data.signedUrl,
        webhookUrl: `${ctx.webhookBase}/api/fal-webhook?job=${reserved.id}&attempt=${reserved.attempt}`,
        idempotencyKey: reserved.idempotency_key,
      });
      const moved = await transition(ctx, reserved, { state: 'submitted', provider_request_id: sub.requestId, provider_urls: sub.urls, submit_uncertain: false, error_code: null });
      if (moved) return after(moved);
      // A webhook adopted it (same id, keep going) or the job was cancelled/deleted while submitting: stop the paid request.
      const cur = await loadJob(ctx, reserved.id);
      if (!cur || (TERMINAL.includes(cur.state) && cur.provider_request_id !== sub.requestId)) {
        await ctx.provider.cancel(sub.requestId, sub.urls);
        if (cur && !cur.provider_request_id) await transition(ctx, cur, { provider_request_id: sub.requestId, provider_urls: sub.urls });
      }
      return after(null);
    } catch (err) {
      const e = err instanceof SubmitError ? err : new SubmitError(String(err), 'uncertain', 'submit-error');
      console.error('submit', job.id, e.certainty, e.message);
      if (e.certainty === 'rejected') {
        // Definitely no provider request: release the reservation.
        return after(await fail(ctx, reserved, e.code, 'The background-removal service refused the request. Try again later.', 0));
      }
      // Possibly running and billing: keep the reservation, never resubmit, wait for its webhook.
      return after(await transition(ctx, reserved, { submit_uncertain: true, error_code: e.code }));
    }
  }

  if (action === 'give-up-uncertain') {
    return after(await fail(ctx, job, 'submit-uncertain', "We couldn't confirm the background-removal request. Try again starts a new attempt.", job.provider === 'mock' ? 0 : Number(job.reserved_usd)));
  }

  if (action === 'poll') {
    const mine = await transition(ctx, job, { last_polled_at: iso(t) });
    if (!mine) return after(null);
    const outcome = await ctx.provider.status(mine.provider_request_id!, mine.provider_urls ?? {}).catch((): ProviderOutcome => ({ state: 'pending' }));
    return after(await applyOutcome(ctx, mine, outcome));
  }

  if (action === 'give-up-submitted') {
    await ctx.provider.cancel(job.provider_request_id!, job.provider_urls ?? {});
    return after(await fail(ctx, job, 'provider-timeout', 'Background removal took too long. Try again later.', job.provider === 'mock' ? 0 : Number(job.reserved_usd)));
  }

  if (action === 'pack') {
    const mine = await transition(ctx, job, { state: 'packing', lease_until: iso(t + LIMITS.leaseSeconds * 1000), step_tries: job.step_tries + 1 });
    if (!mine) return after(null);
    const dir = workDir();
    let uploadedTo: string | null = null;
    try {
      const g = (await ctx.db.from('greetings').select('owner_id').eq('id', job.greeting_id).single()).data as { owner_id: string };
      const norm = join(dir, 'normalized.mp4');
      await fetchObject(ctx, WORK, mine.normalized_path!, norm);
      const n = await probe(norm);
      const mask = join(dir, 'mask');
      if (mine.mask_url === 'mock:') await mockMatte(mask + '.mp4', n.width!, n.height!, n.duration!, dir);
      else await download(mine.mask_url!, mask, MATTE_MAX_BYTES);
      const out = join(dir, 'packed.mp4');
      const { info, check } = await pack(norm, mine.mask_url === 'mock:' ? mask + '.mp4' : mask, out, dir);
      const bytes = statSync(out).size;
      if (!packOk(check) || bytes > MAX_BYTES) throw new Error(`packed output failed validation: ${JSON.stringify({ ...check, bytes })}`);
      // Per-attempt path: a cancelled older attempt can never overwrite or delete a newer one's cutout.
      const path = `${g.owner_id}/${job.greeting_id}-cutout-${mine.attempt}.mp4`;
      await putObject(ctx, VIDEOS, path, out);
      uploadedTo = path;
      // Job and greeting become ready in one transaction; a lost race (cancel, delete, newer attempt) changes neither.
      const fin = await ctx.db.rpc('finish_processing', {
        job: mine.id, expected_version: mine.version, path, bytes, width: info.width, height: info.height, duration: info.duration,
      });
      if (fin.error) throw fin.error;
      if (fin.data !== true) {
        await ctx.db.storage.from(VIDEOS).remove([path]);
        return after(null);
      }
      const done = (await loadJob(ctx, mine.id))!;
      await cleanup(ctx, job.greeting_id!, true);
      return after(done);
    } catch (err) {
      console.error('pack', job.id, err);
      if (uploadedTo) {
        const cur = await ctx.db.from('greetings').select('video_path').eq('id', job.greeting_id).maybeSingle();
        if (!cur.error && cur.data?.video_path !== uploadedTo) await ctx.db.storage.from(VIDEOS).remove([uploadedTo]);
      }
      if (mine.step_tries >= LIMITS.maxStepTries) return after(await fail(ctx, mine, 'pack-failed', 'The cutout could not be finished. You can try again.', mine.cost_usd));
      // Back off (30 s, 60 s): a just-completed provider output can take a moment to appear on its CDN.
      return after(await transition(ctx, mine, { state: 'matte_ready', lease_until: iso(t + LIMITS.packRetrySeconds * 1000 * mine.step_tries), error_code: 'pack-retry' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return job;
}

/** Remove temporary files; after success also the original upload (the packed output replaces it). */
async function cleanup(ctx: Ctx, greetingId: string, ready: boolean): Promise<void> {
  await ctx.db.storage.from(WORK).remove([`${greetingId}/normalized.mp4`]);
  if (ready) {
    const g = await ctx.db.from('greetings').select('source_path').eq('id', greetingId).maybeSingle();
    if (g.data?.source_path) await ctx.db.storage.from(VIDEOS).remove([g.data.source_path]);
  }
}

/** Verified webhook for (job, attempt). Late or foreign deliveries never revive a finished/deleted job. */
export async function handleWebhook(ctx: Ctx, jobId: string, attempt: number, requestId: string, outcome: ProviderOutcome): Promise<{ result: 'applied' | 'ignored' | 'late'; job?: Job }> {
  const job = await loadJob(ctx, jobId);
  if (!job || job.attempt !== attempt) return { result: 'ignored' };
  if (job.provider_request_id && job.provider_request_id !== requestId) return { result: 'ignored' };
  if (job.state === 'submitting') {
    // The submit reply was lost (or is still in flight): adopt the request named by the provider.
    const adopted = await transition(ctx, job, { state: 'submitted', provider_request_id: requestId, submit_uncertain: false, error_code: null });
    const cur = adopted ?? (await loadJob(ctx, jobId));
    if (!cur || cur.state !== 'submitted') return { result: 'ignored' };
    return { result: 'applied', job: (await applyOutcome(ctx, cur, outcome)) ?? undefined };
  }
  if (job.state === 'submitted') return { result: 'applied', job: (await applyOutcome(ctx, job, outcome)) ?? undefined };
  if (TERMINAL.includes(job.state) && !job.provider_request_id) {
    await transition(ctx, job, { provider_request_id: requestId });
    return { result: 'late' };
  }
  return { result: 'ignored' };
}

export async function cancelJob(ctx: Ctx, user: User, jobId: string): Promise<Job> {
  const job = await loadJob(ctx, jobId);
  if (!job || job.owner_id !== user.id) throw new HttpError(404, 'not-found', 'Processing job not found.');
  if (TERMINAL.includes(job.state)) return job;
  if (job.provider_request_id) await ctx.provider.cancel(job.provider_request_id, job.provider_urls ?? {});
  // A request that reached the provider may already be billing: keep its reservation as spend.
  const cost = job.provider === 'mock' || !PAID.includes(job.state) ? 0 : (job.cost_usd ?? Number(job.reserved_usd));
  const done = await fail(ctx, job, 'cancelled', 'Processing was cancelled.', cost, 'cancelled');
  if (!done) throw new HttpError(409, 'changed', 'The job changed meanwhile; refresh and try again.');
  return done;
}

/** Delete a greeting with all its files. Its jobs stay in the ledger (cancelled) so spend and quota still count. */
export async function deleteGreeting(ctx: Ctx, user: User, greetingId: string): Promise<void> {
  const g = await ownGreeting(ctx, user, greetingId);
  for (let round = 0; ; round++) {
    const active = await ctx.db.from('processing_jobs').select('*').eq('greeting_id', g.id).not('state', 'in', `(${TERMINAL.join(',')})`);
    if (active.error) throw active.error;
    const jobs = active.data as Job[];
    if (!jobs.length) break;
    if (round >= 3) throw new HttpError(409, 'changed', 'Processing is busy; try deleting again in a moment.');
    for (const j of jobs) {
      if (j.provider_request_id) await ctx.provider.cancel(j.provider_request_id, j.provider_urls ?? {});
      const cost = j.provider === 'mock' || !PAID.includes(j.state) ? 0 : (j.cost_usd ?? Number(j.reserved_usd));
      await transition(ctx, j, { state: 'cancelled', lease_until: null, error_code: 'deleted', user_message: 'The greeting was deleted.', cost_usd: cost, finished_at: iso(now(ctx)) });
    }
  }
  // Files first: if removal fails the greeting stays, so the creator can retry instead of leaving videos behind.
  const listed = await ctx.db.storage.from(VIDEOS).list(g.owner_id, { search: g.id, limit: 100 });
  if (listed.error) throw listed.error;
  const paths = new Set([g.video_path, g.source_path, ...listed.data.map((o) => `${g.owner_id}/${o.name}`)].filter((p): p is string => !!p));
  const rm = await ctx.db.storage.from(VIDEOS).remove([...paths]);
  if (rm.error) throw rm.error;
  const rmWork = await ctx.db.storage.from(WORK).remove([`${g.id}/normalized.mp4`]);
  if (rmWork.error) throw rmWork.error;
  const del = await ctx.db.from('greetings').delete().eq('id', g.id);
  if (del.error) throw del.error;
}

/** G3 path: check an already-processed upload on the server and record trusted metadata. */
export async function verifyPrepared(ctx: Ctx, user: User, greetingId: string): Promise<{ media_state: string; media_error: string | null }> {
  if (!user.creator) throw new HttpError(403, 'not-creator', 'This account is not enabled for creating greetings yet.');
  const g = await ownGreeting(ctx, user, greetingId);
  if (g.source_kind !== 'prepared') throw new HttpError(400, 'not-prepared', 'This greeting is processed automatically.');
  const dir = workDir();
  try {
    const file = join(dir, 'video');
    const bytes = await fetchObject(ctx, VIDEOS, g.video_path, file);
    const info = await probe(file);
    const problems = preparedProblems(bytes, info, g.video_format, g.video_mime);
    const patch = problems.length
      ? { media_state: 'failed', media_error: problems.map((p) => p.message).join(' '), media_checked_at: iso(now(ctx)) }
      : { media_state: 'ready', media_error: null, media_checked_at: iso(now(ctx)), video_bytes: bytes, video_width: info.width, video_height: info.height, video_duration: info.duration };
    await setGreeting(ctx, g.id, patch);
    return { media_state: patch.media_state, media_error: patch.media_error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
