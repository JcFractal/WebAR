/**
 * Microphone input: getUserMedia (audio only) → AnalyserNode. Analysed locally, never routed
 * to the speakers, recorded, or uploaded. Repeated starts reuse one pending request and never
 * open a second stream.
 */
export type MicStatus = 'off' | 'requesting' | 'live' | 'denied' | 'no-device' | 'unsupported' | 'error';

const FFT_SIZE = 1024;

export class MicInput {
  status: MicStatus = 'off';
  message = '';
  onChange: (status: MicStatus, message: string) => void = () => undefined;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer = new Float32Array(FFT_SIZE);
  private pending: Promise<void> | null = null;
  private disposed = false;

  /** Call directly from a user gesture: the AudioContext is created and resumed synchronously. */
  start(): Promise<void> {
    if (this.disposed || this.status === 'live') return Promise.resolve();
    if (this.pending) return this.pending;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      this.set('unsupported', 'This browser cannot use the microphone here (it needs HTTPS and Web Audio).');
      return Promise.resolve();
    }

    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    const resumed = this.ctx.resume().catch(() => undefined);
    this.set('requesting', 'Waiting for microphone permission…');

    this.pending = (async () => {
      try {
        const stream = await requestAudio();
        if (this.disposed || !this.ctx) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        await resumed;
        const track = stream.getAudioTracks()[0];
        if (!track) throw new DOMException('No audio track', 'NotFoundError');
        this.stream = stream;
        this.source = this.ctx.createMediaStreamSource(stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.analyser.smoothingTimeConstant = 0;
        this.source.connect(this.analyser);
        track.addEventListener('ended', this.onEnded);
        this.set('live', '');
      } catch (err) {
        this.releaseStream();
        this.set(...describeError(err));
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  /** RMS of the latest analyser window, 0..1. */
  readRms(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    return Math.sqrt(sum / this.buffer.length);
  }

  /** Browsers may suspend audio in the background; resuming needs a visible page or a tap. */
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  stop(): void {
    this.releaseStream();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    if (this.status !== 'off') this.set('off', '');
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.onChange = () => undefined;
  }

  private onEnded = () => {
    this.releaseStream();
    this.set('error', 'The microphone stopped (disconnected or taken by another app). Tap Retry.');
  };

  private releaseStream(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        t.removeEventListener('ended', this.onEnded);
        t.stop();
      }
    }
    this.stream = null;
  }

  private set(status: MicStatus, message: string): void {
    this.status = status;
    this.message = message;
    this.onChange(status, message);
  }
}

async function requestAudio(): Promise<MediaStream> {
  // Processing flags are preferences only (never `exact`), so they cannot make setup fail.
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    throw err;
  }
}

function describeError(err: unknown): [MicStatus, string] {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return ['denied', 'Microphone blocked. Allow it in the browser’s site settings (lock icon → Permissions), then tap Retry.'];
    case 'NotFoundError':
    case 'OverconstrainedError':
      return ['no-device', 'No microphone was found. Connect one, then tap Retry.'];
    case 'NotReadableError':
    case 'AbortError':
      return ['error', 'The microphone is busy or unavailable (another app may be using it). Tap Retry.'];
    default:
      return ['error', `The microphone could not start${name ? ` (${name})` : ''}. Tap Retry.`];
  }
}
