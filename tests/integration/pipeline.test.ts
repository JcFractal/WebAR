// Mocked end-to-end processing against a local Supabase (`supabase start`); never calls fal.
// Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… npm run test:int
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ffmpeg, download } from '../../api/_lib/media.ts';
import { mockProvider, type Provider } from '../../api/_lib/provider.ts';
import { MAX_BYTES } from '../../api/_lib/rules.ts';
import { LIMITS } from '../../api/_lib/jobs.ts';
import { HttpError, VIDEOS, WORK, cancelJob, deleteGreeting, handleWebhook, startProcessing, tick, verifyPrepared, type Ctx, type Job, type User } from '../../api/_lib/pipeline.ts';

const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !SERVICE || !ANON ? 'needs a local Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY)' : false;

let admin: SupabaseClient;
const dir = mkdtempSync(join(tmpdir(), 'g4-int-'));
let source: Buffer;
let packedFixture: Buffer;
const people: Record<'a' | 'b', { user: User; db: SupabaseClient; email: string }> = {} as never;

/** Provider wrapper that counts submits and can impersonate a paid provider for budget accounting. */
function counted(base: Provider, name: Provider['name'] = base.name) {
  const p = { ...base, name, submits: 0 };
  p.submit = async (a) => {
    p.submits += 1;
    return base.submit(a);
  };
  return p;
}
const ctxFor = (provider: Provider, offsetMs = () => 0): Ctx => ({ db: admin, provider, webhookBase: 'http://localhost:5173', now: () => Date.now() + offsetMs() });

async function newOrdinary(who: 'a' | 'b', title = 'G4 test'): Promise<string> {
  const { db, user } = people[who];
  const id = randomUUID();
  const src = `${user.id}/${id}-source.mp4`;
  const up = await db.storage.from(VIDEOS).upload(src, source, { contentType: 'video/mp4' });
  assert.equal(up.error, null);
  const ins = await db.from('greetings').insert({
    id, title, video_path: `${user.id}/${id}.mp4`, video_format: 'alpha', video_mime: 'video/webm', video_bytes: source.length,
    source_kind: 'ordinary', source_path: src, media_state: 'ready',
  });
  assert.equal(ins.error, null);
  return id;
}

async function run(ctx: Ctx, user: User, job: Job, max = 12): Promise<Job> {
  let j = job;
  for (let i = 0; i < max && !['ready', 'failed', 'cancelled'].includes(j.state); i++) j = await tick(ctx, user, j.id);
  return j;
}

const greeting = async (id: string) => (await admin.from('greetings').select('*').eq('id', id).maybeSingle()).data;
const exists = async (bucket: string, path: string) => {
  const [folder, name] = [path.slice(0, path.lastIndexOf('/')), path.slice(path.lastIndexOf('/') + 1)];
  const r = await admin.storage.from(bucket).list(folder, { search: name });
  return (r.data ?? []).some((o) => o.name === name);
};
const setSettings = (patch: Record<string, unknown>) => admin.from('processing_settings').update(patch).eq('id', 1);

before(async () => {
  if (skip) return;
  admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } });
  await admin.from('processing_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await setSettings({ enabled: true, enforce_trusted_media: false, daily_budget_usd: 1, creator_daily_attempts: 5 });
  const src = join(dir, 'src.mp4');
  // 4 s portrait recording with a tone: the shape of an ordinary phone greeting, tiny.
  await ffmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
  source = readFileSync(src);
  packedFixture = readFileSync('public/media/synthetic-greeting-packed.mp4');
  for (const who of ['a', 'b'] as const) {
    const email = `g4-${who}-${Date.now()}@example.test`;
    const c = await admin.auth.admin.createUser({ email, password: 'correct-horse-9', email_confirm: true });
    assert.equal(c.error, null);
    await admin.from('creator_emails').insert({ email });
    const db = createClient(URL_!, ANON!, { auth: { persistSession: false } });
    await db.auth.signInWithPassword({ email, password: 'correct-horse-9' });
    people[who] = { user: { id: c.data.user!.id, creator: true }, db, email };
  }
});

after(async () => {
  rmSync(dir, { recursive: true, force: true });
  if (skip) return;
  await setSettings({ enabled: true, enforce_trusted_media: false, daily_budget_usd: 1, creator_daily_attempts: 5 });
  for (const p of Object.values(people)) {
    await admin.from('greetings').delete().eq('owner_id', p.user.id);
    const files = await admin.storage.from(VIDEOS).list(p.user.id);
    if (files.data?.length) await admin.storage.from(VIDEOS).remove(files.data.map((f) => `${p.user.id}/${f.name}`));
    await admin.from('creator_emails').delete().eq('email', p.email);
    await admin.auth.admin.deleteUser(p.user.id);
  }
});

test('ordinary upload → mock cutout → trusted ready → publish; temp files cleaned', { skip }, async () => {
  const { user, db } = people.a;
  const id = await newOrdinary('a');
  const g0 = await greeting(id);
  // Client-written media fields are not trusted: forced pending/packed/mp4.
  assert.equal(g0.media_state, 'pending');
  assert.equal(g0.video_format, 'packed');
  assert.equal(g0.video_mime, 'video/mp4');
  const pub0 = await db.from('greetings').update({ status: 'published' }).eq('id', id);
  assert.ok(pub0.error, 'unprocessed greeting cannot be published');
  await db.from('greetings').update({ media_state: 'ready' }).eq('id', id);
  assert.equal((await greeting(id)).media_state, 'pending', 'client cannot mark media ready');

  const provider = counted(mockProvider());
  const ctx = ctxFor(provider);
  const job = await startProcessing(ctx, user, id);
  assert.equal(job.attempt, 1);
  assert.equal((await greeting(id)).media_state, 'processing');
  const done = await run(ctx, user, job);
  assert.equal(done.state, 'ready');
  assert.equal(provider.submits, 1);
  const g = await greeting(id);
  assert.equal(g.media_state, 'ready');
  assert.equal(g.video_width, 1440, "packed colour|matte, normalized to 1280 tall");
  assert.equal(g.video_height, 1280);
  assert.ok(g.video_duration > 3.9 && g.video_duration < 4.1);
  assert.ok(await exists(VIDEOS, g.video_path), 'packed output stored');
  assert.ok(!(await exists(VIDEOS, g.source_path)), 'original upload removed after success');
  assert.ok(!(await exists(WORK, `${id}/normalized.mp4`)), 'temporary file removed');
  const pub = await db.from('greetings').update({ status: 'published' }).eq('id', id).select('status').single();
  assert.equal(pub.error, null);
  assert.equal(pub.data!.status, 'published');
  // Owner sees its own job; the other creator does not.
  assert.equal((await db.from('processing_jobs').select('id').eq('id', job.id)).data!.length, 1);
  assert.equal((await people.b.db.from('processing_jobs').select('id').eq('id', job.id)).data!.length, 0);
});

test('revoked creator cannot publish an existing ready draft', { skip }, async () => {
  const { user, db, email } = people.a;
  const id = await newOrdinary('a', 'Revoke test');
  const ctx = ctxFor(mockProvider());
  assert.equal((await run(ctx, user, await startProcessing(ctx, user, id))).state, 'ready');
  await admin.from('creator_emails').delete().eq('email', email);
  try {
    const r = await db.from('greetings').update({ status: 'published' }).eq('id', id);
    assert.match(r.error?.message ?? '', /not enabled for publishing/);
    await assert.rejects(startProcessing(ctx, { ...user, creator: false }, id), (e: unknown) => (e as HttpError).status === 403);
  } finally {
    await admin.from('creator_emails').insert({ email });
  }
});

test('prepared upload: server verification gates publishing when enforced', { skip }, async () => {
  const { user, db } = people.a;
  await setSettings({ enforce_trusted_media: true });
  try {
    const id = randomUUID();
    const path = `${user.id}/${id}.mp4`;
    await db.storage.from(VIDEOS).upload(path, packedFixture, { contentType: 'video/mp4' });
    await db.from('greetings').insert({ id, title: 'Prepared', video_path: path, video_format: 'packed', video_mime: 'video/mp4', video_bytes: 999 });
    assert.ok((await db.from('greetings').update({ status: 'published' }).eq('id', id)).error, 'pending prepared video blocked');
    const v = await verifyPrepared(ctxFor(mockProvider()), user, id);
    assert.equal(v.media_state, 'ready');
    const g = await greeting(id);
    assert.equal(g.video_bytes, packedFixture.length, 'server replaced the client-reported size');
    assert.equal((await db.from('greetings').update({ status: 'published' }).eq('id', id)).error, null);
    // Changing the format of a published greeting is refused; after unpublishing it needs re-verification.
    assert.ok((await db.from('greetings').update({ video_format: 'opaque' }).eq('id', id)).error);
    await db.from('greetings').update({ status: 'draft' }).eq('id', id);
    await db.from('greetings').update({ video_format: 'alpha' }).eq('id', id);
    assert.equal((await greeting(id)).media_state, 'pending');
    assert.equal((await verifyPrepared(ctxFor(mockProvider()), user, id)).media_state, 'failed', 'MP4 stored as alpha is rejected');
  } finally {
    await setSettings({ enforce_trusted_media: false });
  }
});

test('uncertain submit: never resubmitted, adopted by webhook, then finishes', { skip }, async () => {
  const { user } = people.a;
  const id = await newOrdinary('a', 'Uncertain');
  const provider = counted(mockProvider('uncertain'));
  let offset = 0;
  const ctx = ctxFor(provider, () => offset);
  let j = await run(ctx, user, await startProcessing(ctx, user, id), 3);
  assert.equal(j.state, 'submitting');
  const row = (await admin.from('processing_jobs').select('*').eq('id', j.id).single()).data as Job;
  assert.equal(row.submit_uncertain, true);
  assert.ok(Number(row.reserved_usd) >= 0.05, 'budget stays reserved while the request may exist');
  for (const t of [0, 120, 900, 1500]) {
    offset = t * 1000;
    j = await tick(ctx, user, j.id);
    assert.equal(j.state, 'submitting');
  }
  assert.equal(provider.submits, 1, 'no blind resubmission');
  // The provider's webhook names the request: adopt it and continue (with a no-network matte).
  const r = await handleWebhook(ctx, j.id, j.attempt, 'mock-late-1', { state: 'completed', maskUrl: 'mock:', inferenceSeconds: 0 });
  assert.equal(r.result, 'applied');
  assert.equal(r.job!.state, 'matte_ready');
  // Duplicate delivery is harmless.
  assert.equal((await handleWebhook(ctx, j.id, j.attempt, 'mock-late-1', { state: 'completed', maskUrl: 'mock:' })).result, 'ignored');
  // A foreign request id or an older attempt is ignored.
  assert.equal((await handleWebhook(ctx, j.id, j.attempt, 'someone-else', { state: 'failed' })).result, 'ignored');
  assert.equal((await handleWebhook(ctx, j.id, j.attempt + 1, 'mock-late-1', { state: 'failed' })).result, 'ignored');
  j = await run(ctx, user, j);
  assert.equal(j.state, 'ready');
  assert.equal(provider.submits, 1);
});

test('uncertain submit gives up after the window (charging the reservation); a late webhook does not revive it', { skip }, async () => {
  const { user } = people.b;
  const id = await newOrdinary('b', 'Give up');
  const provider = counted(mockProvider('uncertain'), 'fal');
  let offset = 0;
  const ctx = ctxFor(provider, () => offset);
  let j = await run(ctx, user, await startProcessing(ctx, user, id), 3);
  assert.equal(j.state, 'submitting');
  offset = LIMITS.uncertainSeconds * 1000 + 1000;
  j = await tick(ctx, user, j.id);
  assert.equal(j.state, 'failed');
  const row = (await admin.from('processing_jobs').select('*').eq('id', j.id).single()).data as Job;
  assert.equal(Number(row.cost_usd), Number(row.reserved_usd), 'unknown outcome counts as spent');
  assert.match((await greeting(id)).media_error, /couldn't confirm/);
  assert.equal((await handleWebhook(ctx, j.id, j.attempt, 'late-req', { state: 'completed', maskUrl: 'mock:' })).result, 'late');
  assert.equal((await admin.from('processing_jobs').select('state').eq('id', j.id).single()).data!.state, 'failed');
  assert.equal(provider.submits, 1);
  // Retry is an explicit new attempt with a new idempotency key.
  const retry = await startProcessing(ctxFor(mockProvider()), user, id);
  assert.equal(retry.attempt, 2);
  assert.notEqual(retry.idempotency_key, row.idempotency_key);
  assert.equal((await run(ctxFor(mockProvider()), user, retry)).state, 'ready');
});

test('budget: in-flight reservations count; quota and kill switch refuse before any submit', { skip }, async () => {
  const a = people.a, b = people.b;
  // An in-flight paid request of creator A holds its reservation.
  const idA = await newOrdinary('a', 'Budget A');
  const pa = counted(mockProvider('uncertain'), 'fal');
  const ja = await run(ctxFor(pa), a.user, await startProcessing(ctxFor(pa), a.user, idA), 3);
  assert.equal(ja.state, 'submitting');
  const spent = (await admin.from('processing_jobs').select('reserved_usd,cost_usd,state,reserved_at')).data!
    .reduce((s, r) => s + (['ready', 'failed', 'cancelled'].includes(r.state) ? Number(r.cost_usd ?? 0) : Math.max(Number(r.reserved_usd), Number(r.cost_usd ?? 0))), 0);
  await setSettings({ daily_budget_usd: Math.round((spent + 0.01) * 10000) / 10000 });
  try {
    const idB = await newOrdinary('b', 'Budget B');
    const pb = counted(mockProvider(), 'fal');
    const jb = await run(ctxFor(pb), b.user, await startProcessing(ctxFor(pb), b.user, idB), 3);
    assert.equal(jb.state, 'failed');
    assert.equal(jb.error_code, 'daily-budget');
    assert.equal(pb.submits, 0, 'refused before submitting');
    assert.match((await greeting(idB)).media_error, /budget/);
    // One active job per creator.
    const idA2 = await newOrdinary('a', 'Second while busy');
    await assert.rejects(startProcessing(ctxFor(pa), a.user, idA2), (e: unknown) => (e as HttpError).code === 'busy');
    // Cancel A's in-flight job: its reservation remains counted as spend (request may have run).
    const c = await cancelJob(ctxFor(pa), a.user, ja.id);
    assert.equal(c.state, 'cancelled');
    assert.equal(Number(c.cost_usd), Number(c.reserved_usd));
    // Per-creator daily quota.
    await setSettings({ daily_budget_usd: 1, creator_daily_attempts: 0 });
    const jq = await run(ctxFor(pb), b.user, await startProcessing(ctxFor(pb), b.user, idB), 3);
    assert.equal(jq.error_code, 'creator-quota');
    await setSettings({ creator_daily_attempts: 5, enabled: false });
    await assert.rejects(startProcessing(ctxFor(pb), b.user, idB), (e: unknown) => (e as HttpError).code === 'processing-disabled');
    assert.equal(pb.submits, 0);
  } finally {
    await setSettings({ daily_budget_usd: 1, creator_daily_attempts: 5, enabled: true });
  }
});

test('provider failure and refusal fail cleanly; cancel stops a job; ownership is enforced', { skip }, async () => {
  const { user } = people.b;
  const id = await newOrdinary('b', 'Failures');
  const failing = await run(ctxFor(mockProvider('fail')), user, await startProcessing(ctxFor(mockProvider('fail')), user, id));
  assert.equal(failing.state, 'failed');
  assert.equal(failing.error_code, 'provider-failed');
  const refused = await run(ctxFor(mockProvider('reject')), user, await startProcessing(ctxFor(mockProvider('reject')), user, id));
  assert.equal(refused.state, 'failed');
  assert.equal(Number(refused.cost_usd), 0, 'definite refusal releases the reservation');
  const j = await startProcessing(ctxFor(mockProvider()), user, id);
  // Another creator cannot see, advance or cancel it, or start processing someone else's greeting.
  await assert.rejects(tick(ctxFor(mockProvider()), people.a.user, j.id), (e: unknown) => (e as HttpError).status === 404);
  await assert.rejects(cancelJob(ctxFor(mockProvider()), people.a.user, j.id), (e: unknown) => (e as HttpError).status === 404);
  await assert.rejects(startProcessing(ctxFor(mockProvider()), people.a.user, id), (e: unknown) => (e as HttpError).status === 404);
  await tick(ctxFor(mockProvider()), user, j.id);
  const c = await cancelJob(ctxFor(mockProvider()), user, j.id);
  assert.equal(c.state, 'cancelled');
  assert.equal((await tick(ctxFor(mockProvider()), user, j.id)).state, 'cancelled', 'a cancelled job stays cancelled');
  assert.equal((await greeting(id)).media_state, 'failed');
});

test('delete removes the greeting, its jobs and every file', { skip }, async () => {
  const { user } = people.a;
  const id = await newOrdinary('a', 'Delete me');
  const ctx = ctxFor(mockProvider());
  const j = await startProcessing(ctx, user, id);
  await tick(ctx, user, j.id);
  assert.ok(await exists(WORK, `${id}/normalized.mp4`));
  const g = await greeting(id);
  await deleteGreeting(ctx, user, id);
  assert.equal(await greeting(id), null);
  assert.equal((await admin.from('processing_jobs').select('id').eq('greeting_id', id)).data!.length, 0);
  assert.ok(!(await exists(VIDEOS, g.source_path)));
  assert.ok(!(await exists(WORK, `${id}/normalized.mp4`)));
  assert.equal((await handleWebhook(ctx, j.id, 1, 'x', { state: 'completed', maskUrl: 'mock:' })).result, 'ignored');
});

test('50 MiB: storage refuses larger uploads; server downloads stop at the limit; bad sources are refused', { skip }, async () => {
  const { db, user } = people.a;
  const big = await db.storage.from(VIDEOS).upload(`${user.id}/${randomUUID()}-source.mp4`, Buffer.alloc(MAX_BYTES + 1), { contentType: 'video/mp4' });
  assert.ok(big.error, 'bucket enforces 52,428,800 bytes');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    const chunk = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < 51; i++) res.write(chunk);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  try {
    const port = (server.address() as { port: number }).port;
    await assert.rejects(download(`http://127.0.0.1:${port}/x`, join(dir, 'big'), MAX_BYTES), /exceeds|limit/i);
  } finally {
    server.close();
  }
  // A non-video "recording" is refused before a job (and any reservation) exists.
  const id = randomUUID();
  const src = `${user.id}/${id}-source.mp4`;
  await db.storage.from(VIDEOS).upload(src, Buffer.from('not a video at all'), { contentType: 'video/mp4' });
  await db.from('greetings').insert({ id, title: 'Junk', video_path: `${user.id}/${id}.mp4`, video_format: 'packed', video_mime: 'video/mp4', video_bytes: 18, source_kind: 'ordinary', source_path: src });
  await assert.rejects(startProcessing(ctxFor(mockProvider()), user, id), (e: unknown) => (e as HttpError).status === 422);
  assert.equal((await admin.from('processing_jobs').select('id').eq('greeting_id', id)).data!.length, 0);
  assert.equal((await greeting(id)).media_state, 'failed');
});

test('webhook endpoint rejects unsigned calls', { skip }, async () => {
  process.env.SUPABASE_URL = URL_;
  const { POST } = await import('../../api/fal-webhook.ts');
  const res = await POST(new Request('http://localhost/api/fal-webhook?job=00000000-0000-0000-0000-000000000000&attempt=1', { method: 'POST', body: '{"request_id":"x","status":"OK"}' }));
  assert.equal(res.status, 401);
});
