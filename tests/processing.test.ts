import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { LIMITS, classifySubmit, costUsd, nextAction, stageLabel, type JobView } from '../api/_lib/jobs.ts';
import { MAX_BYTES, preparedProblems, sourceProblems } from '../api/_lib/rules.ts';
import { verifyFalSignature } from '../api/_lib/webhook.ts';
import { falProvider, mockProvider } from '../api/_lib/provider.ts';
import { SubmitError } from '../api/_lib/jobs.ts';
import type { MediaInfo } from '../api/_lib/media.ts';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const job = (p: Partial<JobView>): JobView => ({
  state: 'queued', lease_until: null, step_tries: 0, submit_started_at: null, submit_uncertain: false, last_polled_at: null, provider_request_id: null, ...p,
});

test('next action follows the stage order', () => {
  assert.equal(nextAction(job({}), NOW), 'normalize');
  assert.equal(nextAction(job({ state: 'normalized' }), NOW), 'submit');
  assert.equal(nextAction(job({ state: 'matte_ready' }), NOW), 'pack');
  assert.equal(nextAction(job({ state: 'matte_ready', lease_until: new Date(NOW + 30_000).toISOString() }), NOW), 'wait', 'pack retries back off');
  for (const s of ['ready', 'failed', 'cancelled'] as const) assert.equal(nextAction(job({ state: s }), NOW), 'none');
});

test('leased steps wait; expired leases retry then fail', () => {
  assert.equal(nextAction(job({ state: 'normalizing', lease_until: ago(-60), step_tries: 1 }), NOW), 'wait');
  assert.equal(nextAction(job({ state: 'normalizing', lease_until: ago(1), step_tries: 1 }), NOW), 'normalize');
  assert.equal(nextAction(job({ state: 'packing', lease_until: ago(1), step_tries: 2 }), NOW), 'pack');
  assert.equal(nextAction(job({ state: 'packing', lease_until: ago(1), step_tries: LIMITS.maxStepTries }), NOW), 'fail-step');
});

test('an uncertain or crashed submit is never resubmitted', () => {
  // In flight (another call is submitting right now).
  assert.equal(nextAction(job({ state: 'submitting', submit_started_at: ago(5) }), NOW), 'wait');
  // Crashed without an outcome, or recorded as uncertain: wait for the webhook only.
  assert.equal(nextAction(job({ state: 'submitting', submit_started_at: ago(120) }), NOW), 'wait-uncertain');
  assert.equal(nextAction(job({ state: 'submitting', submit_started_at: ago(5), submit_uncertain: true }), NOW), 'wait-uncertain');
  // Eventually fail (keeping the reservation as spend), still without resubmitting.
  assert.equal(nextAction(job({ state: 'submitting', submit_started_at: ago(LIMITS.uncertainSeconds), submit_uncertain: true }), NOW), 'give-up-uncertain');
  for (let s = 0; s < LIMITS.uncertainSeconds + 60; s += 30) {
    assert.notEqual(nextAction(job({ state: 'submitting', submit_started_at: ago(s), submit_uncertain: true }), NOW), 'submit');
  }
});

test('confirmed requests are polled as a webhook fallback, then time out', () => {
  assert.equal(nextAction(job({ state: 'submitted', submit_started_at: ago(30), provider_request_id: 'r' }), NOW), 'poll');
  assert.equal(nextAction(job({ state: 'submitted', submit_started_at: ago(30), last_polled_at: ago(3), provider_request_id: 'r' }), NOW), 'wait');
  assert.equal(nextAction(job({ state: 'submitted', submit_started_at: ago(30), last_polled_at: ago(LIMITS.pollEverySeconds), provider_request_id: 'r' }), NOW), 'poll');
  assert.equal(nextAction(job({ state: 'submitted', submit_started_at: ago(LIMITS.submittedSeconds), provider_request_id: 'r' }), NOW), 'give-up-submitted');
});

test('submit failures: only definite refusals are "rejected"', () => {
  assert.equal(classifySubmit(null, 422), 'rejected');
  assert.equal(classifySubmit(null, 401), 'rejected');
  assert.equal(classifySubmit(null, 408), 'uncertain');
  assert.equal(classifySubmit(null, 500), 'uncertain');
  assert.equal(classifySubmit(null, 504), 'uncertain');
  assert.equal(classifySubmit(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })), 'rejected');
  assert.equal(classifySubmit(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })), 'uncertain');
  assert.equal(classifySubmit(new DOMException('timed out', 'TimeoutError')), 'uncertain');
});

test('cost uses compute seconds; unknown stays unknown', () => {
  assert.equal(costUsd(56.2, 0.000575), 0.0323);
  assert.equal(costUsd(null, 0.000575), null);
  assert.equal(stageLabel('submitted'), 'Removing background');
  assert.equal(stageLabel('packing'), 'Finishing');
});

const info = (p: Partial<MediaInfo>): MediaInfo => ({ container: 'mov,mp4,m4a,3gp,3g2,mj2', vcodec: 'hevc', width: 3840, height: 2160, acodec: 'aac', rotation: -90, duration: 8.56, frames: null, ...p });

test('server source checks: 50 MiB, length, readability', () => {
  assert.equal(MAX_BYTES, 52_428_800);
  assert.deepEqual(sourceProblems(43_245_518, info({})), []);
  assert.deepEqual(sourceProblems(MAX_BYTES, info({})), []);
  assert.match(sourceProblems(MAX_BYTES + 1, info({}))[0].code, /too-large/);
  assert.ok(sourceProblems(1000, info({ duration: 45 })).some((p) => p.code === 'duration'));
  assert.ok(sourceProblems(1000, info({ duration: 2 })).some((p) => p.code === 'duration'));
  assert.ok(sourceProblems(1000, info({ duration: null })).length > 0);
  assert.ok(sourceProblems(1000, info({ vcodec: null, width: null, height: null })).length > 0);
  assert.ok(sourceProblems(1000, info({ container: 'gif' })).length > 0);
});

test('server prepared checks: format must match the content', () => {
  const packed = info({ vcodec: 'h264', width: 1440, height: 1280, rotation: 0 });
  assert.deepEqual(preparedProblems(4_199_363, packed, 'packed', 'video/mp4'), []);
  assert.ok(preparedProblems(4_199_363, info({ vcodec: 'h264', width: 720, height: 1280, rotation: 0 }), 'packed', 'video/mp4').length > 0);
  assert.ok(preparedProblems(4_199_363, packed, 'alpha', 'video/mp4').length > 0);
  assert.ok(preparedProblems(4_199_363, info({ container: 'matroska,webm', vcodec: 'vp9' }), 'packed', 'video/mp4').length > 0);
  assert.ok(preparedProblems(MAX_BYTES + 1, packed, 'packed', 'video/mp4').length > 0);
});

function signedHeaders(priv: ReturnType<typeof generateKeyPairSync>['privateKey'], body: Uint8Array, ts: number, requestId = 'req-1') {
  const msg = ['req-1', 'user-1', String(ts), createHash('sha256').update(body).digest('hex')].join('\n');
  return new Headers({
    'x-fal-webhook-request-id': requestId,
    'x-fal-webhook-user-id': 'user-1',
    'x-fal-webhook-timestamp': String(ts),
    'x-fal-webhook-signature': sign(null, Buffer.from(msg), priv).toString('hex'),
  });
}

test('webhook signatures: valid, tampered, stale, wrong key, missing', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const otherJwk = other.publicKey.export({ format: 'jwk' }) as { x: string };
  const body = new TextEncoder().encode('{"request_id":"req-1","status":"OK"}');
  const ts = 1_800_000_000;
  const h = signedHeaders(privateKey, body, ts);
  assert.deepEqual(verifyFalSignature(h, body, [otherJwk, jwk], ts + 10), { ok: true, requestId: 'req-1' });
  assert.equal(verifyFalSignature(h, new TextEncoder().encode('{"request_id":"req-1","status":"ERROR"}'), [jwk], ts).ok, false);
  assert.deepEqual(verifyFalSignature(h, body, [jwk], ts + 301), { ok: false, reason: 'stale-timestamp' });
  assert.equal(verifyFalSignature(h, body, [otherJwk], ts).ok, false);
  assert.equal(verifyFalSignature(h, body, [{ x: '!!' }], ts).ok, false);
  const missing = new Headers(h);
  missing.delete('x-fal-webhook-signature');
  assert.deepEqual(verifyFalSignature(missing, body, [jwk], ts), { ok: false, reason: 'missing-headers' });
  // Request id header is part of the signed message.
  const swapped = new Headers(h);
  swapped.set('x-fal-webhook-request-id', 'req-2');
  assert.equal(verifyFalSignature(swapped, body, [jwk], ts).ok, false);
});

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return handler(String(input), init);
  }) as typeof fetch;
  return { f, calls };
}

test('fal adapter: submit outcomes are classified without retrying', async () => {
  const args = { videoUrl: 'https://x/v.mp4', webhookUrl: 'https://app/api/fal-webhook?job=j&attempt=1', idempotencyKey: 'g:1' };
  const ok = fakeFetch(() => Response.json({ request_id: 'r1', status_url: 'https://q/s', response_url: 'https://q/r' }));
  assert.equal((await falProvider('k', ok.f).submit(args)).requestId, 'r1');
  assert.equal(ok.calls.length, 1);
  assert.match(ok.calls[0], /queue\.fal\.run\/fal-ai\/birefnet\/v2\/video\?fal_webhook=https%3A%2F%2Fapp/);

  const cases: [() => Response | Promise<Response>, string][] = [
    [() => new Response('bad', { status: 422 }), 'rejected'],
    [() => new Response('oops', { status: 502 }), 'uncertain'],
    [() => new Response('not json', { status: 200 }), 'uncertain'],
    [() => Response.json({}), 'uncertain'],
    [() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })), 'uncertain'],
  ];
  for (const [h, certainty] of cases) {
    const ff = fakeFetch(h);
    await assert.rejects(falProvider('k', ff.f).submit(args), (e: unknown) => e instanceof SubmitError && e.certainty === certainty);
    assert.equal(ff.calls.length, 1, 'submit is attempted exactly once');
  }
});

test('fal adapter: status polling and webhook parsing', async () => {
  const done = fakeFetch((url) => url.endsWith('/s')
    ? Response.json({ status: 'COMPLETED', metrics: { inference_time: 56.2 } })
    : Response.json({ mask_video: { url: 'https://cdn/mask.mov' } }));
  assert.deepEqual(await falProvider('k', done.f).status('r1', { status: 'https://q/s', response: 'https://q/r' }),
    { state: 'completed', maskUrl: 'https://cdn/mask.mov', inferenceSeconds: 56.2 });
  const queued = fakeFetch(() => Response.json({ status: 'IN_QUEUE' }));
  assert.deepEqual(await falProvider('k', queued.f).status('r1', {}), { state: 'pending' });
  for (const status of ['FAILED', 'CANCELED']) {
    const ended = fakeFetch(() => Response.json({ status }));
    assert.equal((await falProvider('k', ended.f).status('r1', {})).state, 'failed', `${status} is final, not pending`);
  }
  const flaky = fakeFetch(() => new Response('', { status: 503 }));
  assert.deepEqual(await falProvider('k', flaky.f).status('r1', {}), { state: 'pending' });
  const p = falProvider('k');
  assert.deepEqual(p.fromWebhook({ request_id: 'r1', status: 'OK', payload: { mask_video: { url: 'https://cdn/m' } } })?.outcome.state, 'completed');
  assert.equal(p.fromWebhook({ request_id: 'r1', status: 'ERROR', error: 'boom' })?.outcome.state, 'failed');
  assert.equal(p.fromWebhook({}), null);
});

test('mock provider modes', async () => {
  const args = { videoUrl: 'x', webhookUrl: 'y', idempotencyKey: 'g:1' };
  assert.equal((await mockProvider().submit(args)).requestId, 'mock-g:1');
  await assert.rejects(mockProvider('reject').submit(args), (e: unknown) => (e as SubmitError).certainty === 'rejected');
  await assert.rejects(mockProvider('uncertain').submit(args), (e: unknown) => (e as SubmitError).certainty === 'uncertain');
  assert.equal((await mockProvider('fail').status()).state, 'failed');
});
