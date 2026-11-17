import { SubmitError, classifySubmit } from './jobs.js';

// Background-removal providers. `fal` is real (paid); `mock` runs no network and costs nothing.
export interface ProviderUrls {
  status?: string;
  response?: string;
  cancel?: string;
}

export interface ProviderOutcome {
  state: 'pending' | 'completed' | 'failed';
  maskUrl?: string;
  inferenceSeconds?: number | null;
  error?: string;
}

export interface Provider {
  name: 'fal' | 'mock';
  /** Throws SubmitError; `certainty` says whether a request may exist anyway. */
  submit(input: { videoUrl: string; webhookUrl: string; idempotencyKey: string }): Promise<{ requestId: string; urls: ProviderUrls }>;
  status(requestId: string, urls: ProviderUrls): Promise<ProviderOutcome>;
  cancel(requestId: string, urls: ProviderUrls): Promise<void>;
  /** Parse a (signature-verified) webhook body. */
  fromWebhook(body: unknown): { requestId: string; outcome: ProviderOutcome } | null;
}

export const FAL_ENDPOINT = 'fal-ai/birefnet/v2/video';
// Same arguments as the measured G2 run (cost estimate is based on it).
export const FAL_ARGS = {
  model: 'Matting',
  operating_resolution: '1024x1024',
  output_mask: true,
  refine_foreground: true,
  video_output_type: 'PRORES4444 (.mov)',
  video_quality: 'maximum',
};

type Fetch = typeof fetch;

export function falProvider(key: string, f: Fetch = fetch): Provider {
  const auth = { Authorization: `Key ${key}` };
  const maskOf = (payload: unknown): string | undefined => (payload as { mask_video?: { url?: string } } | null)?.mask_video?.url;
  return {
    name: 'fal',
    async submit({ videoUrl, webhookUrl }) {
      let res: Response;
      try {
        res = await f(`https://queue.fal.run/${FAL_ENDPOINT}?fal_webhook=${encodeURIComponent(webhookUrl)}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: videoUrl, ...FAL_ARGS }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        throw new SubmitError(`fal submit: ${String(err)}`, classifySubmit(err), 'submit-network');
      }
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new SubmitError(`fal submit HTTP ${res.status}: ${text.slice(0, 300)}`, classifySubmit(null, res.status), `submit-http-${res.status}`);
      let body: { request_id?: string; status_url?: string; response_url?: string; cancel_url?: string };
      try {
        body = JSON.parse(text);
      } catch {
        throw new SubmitError('fal submit: unreadable reply', 'uncertain', 'submit-reply');
      }
      if (!body.request_id) throw new SubmitError('fal submit: no request id', 'uncertain', 'submit-reply');
      return { requestId: body.request_id, urls: { status: body.status_url, response: body.response_url, cancel: body.cancel_url } };
    },
    async status(requestId, urls) {
      const base = `https://queue.fal.run/fal-ai/birefnet/requests/${requestId}`;
      const s = await f(urls.status ?? `${base}/status`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      if (!s.ok) return s.status === 404 ? { state: 'failed', error: 'request-not-found' } : { state: 'pending' };
      const st = (await s.json()) as { status?: string; metrics?: { inference_time?: number } };
      if (!st.status || st.status === 'IN_QUEUE' || st.status === 'IN_PROGRESS') return { state: 'pending' };
      if (st.status !== 'COMPLETED') return { state: 'failed', error: `provider status ${st.status}` };
      const r = await f(urls.response ?? base, { headers: auth, signal: AbortSignal.timeout(15_000) });
      const body = (await r.json().catch(() => null)) as unknown;
      const mask = r.ok ? maskOf(body) : undefined;
      const inferenceSeconds = st.metrics?.inference_time ?? null;
      return mask ? { state: 'completed', maskUrl: mask, inferenceSeconds } : { state: 'failed', error: `result HTTP ${r.status}`, inferenceSeconds };
    },
    async cancel(requestId, urls) {
      await f(urls.cancel ?? `https://queue.fal.run/fal-ai/birefnet/requests/${requestId}/cancel`, { method: 'PUT', headers: auth, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    },
    fromWebhook(body) {
      const b = body as { request_id?: string; status?: string; payload?: unknown; error?: string };
      if (!b?.request_id) return null;
      const mask = b.status === 'OK' ? maskOf(b.payload) : undefined;
      return {
        requestId: b.request_id,
        outcome: mask ? { state: 'completed', maskUrl: mask, inferenceSeconds: null } : { state: 'failed', error: b.error ?? 'provider-error' },
      };
    },
  };
}

/**
 * No-network stand-in. `MOCK_PROVIDER_MODE`: ok (default) | fail (provider reports an error) |
 * reject (submit refused) | uncertain (submit outcome unknown; nothing ever arrives).
 */
export function mockProvider(mode = 'ok'): Provider {
  return {
    name: 'mock',
    async submit({ idempotencyKey }) {
      if (mode === 'reject') throw new SubmitError('mock: refused', 'rejected', 'submit-http-422');
      if (mode === 'uncertain') throw new SubmitError('mock: timed out', 'uncertain', 'submit-network');
      return { requestId: `mock-${idempotencyKey}`, urls: {} };
    },
    async status() {
      if (mode === 'uncertain') return { state: 'pending' };
      return mode === 'fail' ? { state: 'failed', error: 'mock provider error' } : { state: 'completed', maskUrl: 'mock:', inferenceSeconds: 0 };
    },
    async cancel() {},
    fromWebhook: () => null,
  };
}

export function providerFromEnv(env: Record<string, string | undefined> = process.env): Provider {
  if (env.PROCESSING_PROVIDER === 'fal') {
    if (!env.FAL_KEY) throw new Error('PROCESSING_PROVIDER=fal needs FAL_KEY');
    return falProvider(env.FAL_KEY);
  }
  return mockProvider(env.MOCK_PROVIDER_MODE);
}
