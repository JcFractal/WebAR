/// <reference types="node" />
import { createClient } from '@supabase/supabase-js';
import type { Ctx } from './pipeline.ts';
import { providerFromEnv } from './provider.ts';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Server-only context: service-role Supabase client and the configured provider (mock unless PROCESSING_PROVIDER=fal). */
export function serverCtx(): Ctx | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const base = process.env.PROCESSING_WEBHOOK_BASE ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
  return {
    db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    provider: providerFromEnv(),
    webhookBase: base.replace(/\/$/, ''),
  };
}
