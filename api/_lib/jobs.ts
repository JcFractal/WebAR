// Pure processing-job rules: which step runs next, and how provider failures are classified.

export type JobState =
  | 'queued' | 'normalizing' | 'normalized' | 'submitting' | 'submitted' | 'matte_ready' | 'packing'
  | 'ready' | 'failed' | 'cancelled';

export const TERMINAL: readonly JobState[] = ['ready', 'failed', 'cancelled'];
/** States in which a paid provider request may exist. */
export const PAID: readonly JobState[] = ['submitting', 'submitted', 'matte_ready', 'packing'];

export const LIMITS = {
  /** Lease for one ffmpeg step; below Vercel's 300 s function limit. */
  leaseSeconds: 290,
  /** Free steps (normalize, pack) retry automatically this many times. */
  maxStepTries: 3,
  /** An unconfirmed submission waits this long for a webhook before failing (never resubmitted). */
  uncertainSeconds: 30 * 60,
  /** A crashed submit (no outcome recorded) is treated as uncertain after this. */
  submitStaleSeconds: 60,
  pollEverySeconds: 15,
  packRetrySeconds: 30,
  /** A confirmed provider request that never finishes is cancelled and failed after this. */
  submittedSeconds: 60 * 60,
};

export interface JobView {
  state: JobState;
  lease_until: string | null;
  step_tries: number;
  submit_started_at: string | null;
  submit_uncertain: boolean;
  last_polled_at: string | null;
  provider_request_id: string | null;
}

export type Action =
  | 'normalize' | 'submit' | 'wait-uncertain' | 'give-up-uncertain' | 'poll' | 'give-up-submitted'
  | 'pack' | 'fail-step' | 'wait' | 'none';

const secs = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / 1000 : Infinity);
const leased = (j: JobView, now: number) => j.lease_until !== null && Date.parse(j.lease_until) > now;

export function nextAction(j: JobView, now: number): Action {
  switch (j.state) {
    case 'queued':
      return 'normalize';
    case 'normalizing':
    case 'packing':
      if (leased(j, now)) return 'wait';
      if (j.step_tries >= LIMITS.maxStepTries) return 'fail-step';
      return j.state === 'normalizing' ? 'normalize' : 'pack';
    case 'normalized':
      return 'submit';
    case 'submitting': {
      // Never resubmit: an unconfirmed request may be running and billing. Wait for its webhook.
      const age = secs(j.submit_started_at, now);
      if (!j.submit_uncertain && age < LIMITS.submitStaleSeconds) return 'wait';
      return age >= LIMITS.uncertainSeconds ? 'give-up-uncertain' : 'wait-uncertain';
    }
    case 'submitted':
      if (secs(j.submit_started_at, now) >= LIMITS.submittedSeconds) return 'give-up-submitted';
      return secs(j.last_polled_at, now) >= LIMITS.pollEverySeconds ? 'poll' : 'wait';
    case 'matte_ready':
      return leased(j, now) ? 'wait' : 'pack';
    default:
      return 'none';
  }
}

export type SubmitCertainty = 'rejected' | 'uncertain';

export class SubmitError extends Error {
  readonly certainty: SubmitCertainty;
  readonly code: string;
  constructor(message: string, certainty: SubmitCertainty, code: string) {
    super(message);
    this.certainty = certainty;
    this.code = code;
  }
}

/**
 * Whether a failed submit definitely did not create a provider request. Only connection failures
 * before the request was sent, and explicit 4xx refusals, count as rejected; timeouts, resets,
 * 5xx and malformed 2xx replies are uncertain.
 */
export function classifySubmit(err: unknown, httpStatus?: number): SubmitCertainty {
  if (httpStatus !== undefined) return httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 ? 'rejected' : 'uncertain';
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
  if (code && ['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_INVALID_URL', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)) return 'rejected';
  return 'uncertain';
}

export function costUsd(inferenceSeconds: number | null | undefined, usdPerSecond: number): number | null {
  return inferenceSeconds == null || !Number.isFinite(inferenceSeconds) ? null : Math.round(inferenceSeconds * usdPerSecond * 10000) / 10000;
}

/** Creator-facing stage for a job state. */
export function stageLabel(state: JobState): string {
  if (state === 'queued' || state === 'normalizing' || state === 'normalized') return 'Preparing';
  if (state === 'submitting' || state === 'submitted' || state === 'matte_ready') return 'Removing background';
  if (state === 'packing') return 'Finishing';
  if (state === 'ready') return 'Ready';
  return state === 'cancelled' ? 'Cancelled' : 'Failed';
}
