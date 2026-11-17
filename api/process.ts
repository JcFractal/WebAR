/// <reference types="node" />
import { json, serverCtx } from './_lib/context.ts';
import { HttpError, authUser, cancelJob, deleteGreeting, publicJob, startProcessing, tick, verifyPrepared } from './_lib/pipeline.ts';

const ID = /^[0-9a-f-]{36}$/;

/**
 * Creator processing API `POST /api/process` (signed-in owner, Bearer access token):
 * {action:'start'|'retry', greeting} · {action:'tick'|'cancel', job} · {action:'verify'|'delete', greeting}.
 * `tick` advances at most one step (normalize/pack run inside the request, < 300 s).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = serverCtx();
  if (!ctx) return json(503, { error: 'not-configured', message: 'The greeting service is not configured.' });
  try {
    const user = await authUser(ctx.db, request.headers.get('authorization'));
    const body = (await request.json().catch(() => ({}))) as { action?: string; greeting?: string; job?: string };
    const greeting = ID.test(body.greeting ?? '') ? body.greeting! : null;
    const job = ID.test(body.job ?? '') ? body.job! : null;
    switch (body.action) {
      case 'start':
      case 'retry':
        if (!greeting) break;
        // The mock provider makes a placeholder cutout; never offer that on the production site.
        if (ctx.provider.name === 'mock' && process.env.VERCEL_ENV === 'production') {
          return json(503, { error: 'processing-disabled', message: 'Automatic background removal is not switched on yet.' });
        }
        return json(200, { job: publicJob(await startProcessing(ctx, user, greeting)) });
      case 'tick':
        if (!job) break;
        return json(200, { job: publicJob(await tick(ctx, user, job)) });
      case 'cancel':
        if (!job) break;
        return json(200, { job: publicJob(await cancelJob(ctx, user, job)) });
      case 'verify':
        if (!greeting) break;
        return json(200, await verifyPrepared(ctx, user, greeting));
      case 'delete':
        if (!greeting) break;
        await deleteGreeting(ctx, user, greeting);
        return json(200, { deleted: true });
    }
    return json(400, { error: 'bad-request', message: 'Unknown action.' });
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.code, message: err.message });
    console.error('process', err);
    return json(500, { error: 'server-error', message: 'Something went wrong on the server. Try again.' });
  }
}
