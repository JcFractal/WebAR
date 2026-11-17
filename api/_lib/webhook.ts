/// <reference types="node" />
import { createHash, createPublicKey, verify } from 'node:crypto';

// fal webhook signature check (docs.fal.ai/model-endpoints/webhooks): ED25519 over
// request id \n user id \n timestamp \n sha256-hex(raw body), keys from fal's JWKS, ±300 s clock skew.
export const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
export const SKEW_SECONDS = 300;

export interface Jwk {
  kty?: string;
  crv?: string;
  x: string;
}

let cache: { keys: Jwk[]; at: number } | null = null;

export async function falJwks(f: typeof fetch = fetch, now = Date.now()): Promise<Jwk[]> {
  if (cache && now - cache.at < 12 * 3600_000) return cache.keys;
  const res = await f(JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  cache = { keys, at: now };
  return keys;
}

export function verifyFalSignature(headers: Headers, rawBody: Uint8Array, keys: Jwk[], nowSeconds = Date.now() / 1000): { ok: true; requestId: string } | { ok: false; reason: string } {
  const requestId = headers.get('x-fal-webhook-request-id');
  const userId = headers.get('x-fal-webhook-user-id');
  const ts = headers.get('x-fal-webhook-timestamp');
  const sig = headers.get('x-fal-webhook-signature');
  if (!requestId || !userId || !ts || !sig) return { ok: false, reason: 'missing-headers' };
  if (!/^\d+$/.test(ts) || Math.abs(nowSeconds - Number(ts)) > SKEW_SECONDS) return { ok: false, reason: 'stale-timestamp' };
  if (!/^[0-9a-f]{128}$/i.test(sig)) return { ok: false, reason: 'bad-signature' };
  const message = Buffer.from([requestId, userId, ts, createHash('sha256').update(rawBody).digest('hex')].join('\n'), 'utf8');
  const signature = Buffer.from(sig, 'hex');
  for (const k of keys) {
    try {
      const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' });
      if (verify(null, message, key, signature)) return { ok: true, requestId };
    } catch {
      /* malformed key: try the next */
    }
  }
  return { ok: false, reason: 'bad-signature' };
}
