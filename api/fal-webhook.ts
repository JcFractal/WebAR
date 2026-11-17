/// <reference types="node" />
import { waitUntil } from '@vercel/functions';
import { json, serverCtx } from './_lib/context.ts';
import { handleWebhook, tick } from './_lib/pipeline.ts';
import { falJwks, verifyFalSignature } from './_lib/webhook.ts';

/** fal completion callback: signature-verified, idempotent; packing continues after the 200 reply. */
export async function POST(request: Request): Promise<Response> {
  const ctx = serverCtx();
  if (!ctx) return json(503, { error: 'not-configured' });
  const raw = new Uint8Array(await request.arrayBuffer());
  const check = verifyFalSignature(request.headers, raw, await falJwks().catch(() => []));
  if (!check.ok) return json(401, { error: check.reason });
  const q = new URL(request.url).searchParams;
  const jobId = q.get('job') ?? '';
  const attempt = Number(q.get('attempt'));
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json(200, { result: 'ignored' });
  }
  const parsed = ctx.provider.fromWebhook(body);
  if (!/^[0-9a-f-]{36}$/.test(jobId) || !Number.isInteger(attempt) || !parsed || parsed.requestId !== check.requestId) return json(200, { result: 'ignored' });
  const r = await handleWebhook(ctx, jobId, attempt, parsed.requestId, parsed.outcome);
  if (r.job?.state === 'matte_ready') waitUntil(tick(ctx, null, jobId).catch((e) => console.error('webhook pack', e)));
  return json(200, { result: r.result });
}
