import * as THREE from 'three';
import { mediaErrorMessage } from './media';

export type ClipState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'blocked' | 'error';

let liveObjectUrls = 0;
/** Object URLs created for local files and not yet revoked (for lifecycle checks). */
export const liveObjectUrlCount = (): number => liveObjectUrls;

/**
 * One video element + VideoTexture. Replacing the source means disposing this clip and creating a
 * new one, so element, listeners, texture and object URL are always released together.
 */
export class VideoClip {
  readonly video: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;
  readonly local: boolean;
  readonly label: string;
  state: ClipState = 'loading';
  message = 'Loading video…';
  /** True once a decoded frame has been uploaded; until then nothing is drawn (no blank rectangle). */
  frameReady = false;
  onChange: () => void = () => undefined;

  private objectUrl: string | null = null;
  private readonly listeners = new AbortController();
  private playToken = 0;
  private disposed = false;

  constructor(host: HTMLElement, source: string | File, loop: boolean) {
    const v = document.createElement('video');
    v.className = 'video-source';
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.muted = true;
    v.preload = 'auto';
    v.loop = loop;
    v.disableRemotePlayback = true;
    v.setAttribute('aria-hidden', 'true');
    this.video = v;
    this.local = typeof source !== 'string';
    this.label = typeof source === 'string' ? source.split('/').pop() ?? source : source.name;

    this.texture = new THREE.VideoTexture(v);
    this.texture.colorSpace = THREE.NoColorSpace;

    const on = (type: string, fn: () => void) => v.addEventListener(type, fn, { signal: this.listeners.signal });
    on('loadedmetadata', () => this.onChange());
    on('loadeddata', () => {
      if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      this.texture.needsUpdate = true;
      this.frameReady = true;
      if (this.state === 'loading') this.set('ready', '');
      else this.onChange();
    });
    on('seeked', () => {
      if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) this.texture.needsUpdate = true;
    });
    on('playing', () => this.set('playing', ''));
    on('pause', () => {
      if (!v.ended && this.state === 'playing') this.set('paused', '');
    });
    on('ended', () => this.set('ended', ''));
    on('error', () => {
      this.frameReady = false;
      this.set('error', mediaErrorMessage(v.error?.code, this.local));
    });

    if (typeof source === 'string') {
      v.src = `${import.meta.env.BASE_URL}${source}`;
    } else {
      this.objectUrl = URL.createObjectURL(source);
      liveObjectUrls++;
      v.src = this.objectUrl;
    }
    host.append(v);
  }

  get aspect(): number {
    const v = this.video;
    return v.videoWidth > 0 && v.videoHeight > 0 ? v.videoWidth / v.videoHeight : 9 / 16;
  }

  get duration(): number {
    return this.video.duration;
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  /** Call from a user gesture when sound is wanted. Any rejection becomes a recoverable "Tap Play". */
  async play(withSound: boolean): Promise<void> {
    if (this.disposed || this.state === 'error') return;
    this.video.muted = !withSound;
    const token = ++this.playToken;
    try {
      await this.video.play();
    } catch (err) {
      if (token !== this.playToken || this.disposed) return;
      if ((err as DOMException).name === 'AbortError') return;
      this.set('blocked', 'The browser did not start playback. Tap Play.');
    }
  }

  restart(withSound: boolean): Promise<void> {
    this.seekStart();
    return this.play(withSound);
  }

  pause(): void {
    this.playToken++;
    if (!this.video.paused) this.video.pause();
    if (this.state === 'blocked') this.set(this.frameReady ? 'paused' : 'loading', this.frameReady ? '' : this.message);
  }

  /** Pause and rewind, so the next Play starts from the beginning. */
  stop(): void {
    this.pause();
    this.seekStart();
    if (this.state === 'ended') this.set('paused', '');
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  setLoop(loop: boolean): void {
    this.video.loop = loop;
  }

  retry(): void {
    if (this.disposed) return;
    this.frameReady = false;
    this.set('loading', 'Loading video…');
    this.video.load();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playToken++;
    this.listeners.abort();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
    this.texture.dispose();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
      liveObjectUrls--;
    }
    this.onChange = () => undefined;
  }

  private seekStart(): void {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA && this.video.currentTime !== 0) this.video.currentTime = 0;
  }

  private set(state: ClipState, message: string): void {
    this.state = state;
    this.message = message;
    this.onChange();
  }
}
