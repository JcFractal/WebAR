import { KEY_MODES, VIDEO_RANGES, type KeyMode } from '../config';
import type { ClipState } from './clip';

export type PreviewBackground = 'dark' | 'light';

export interface VideoTune {
  displayHeightMeters: number;
  bottomOffsetMeters: number;
  loop: boolean;
  mode: KeyMode;
  color: string;
  tolerance: number;
  softness: number;
  spill: number;
  background: PreviewBackground;
}

export interface VideoHudHandlers {
  playPause(): void;
  replay(): void;
  toggleSound(): void;
  retry(): void;
  enterAr(): void;
  resetAr(): void;
  exitAr(): void;
  chooseFile(file: File): void;
  useFixture(): void;
  sampleKey(): void;
  tune<K extends keyof VideoTune>(key: K, value: VideoTune[K]): void;
}

export interface VideoHud {
  setTransport(state: ClipState, soundOn: boolean): void;
  setStatus(text: string, showRetry: boolean): void;
  setNote(text: string): void;
  setAr(active: boolean, message: string): void;
  setArUnavailable(message: string): void;
  setSource(local: boolean, canUseFixture: boolean): void;
  setTune<K extends keyof VideoTune>(key: K, value: VideoTune[K]): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, className = 'hud-chip'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const KEY_LABELS: Record<KeyMode, string> = { opaque: 'Opaque (no keying)', chroma: 'Chroma key' };

export function createVideoHud(container: HTMLElement, initial: VideoTune, allowLocal: boolean, h: VideoHudHandlers): VideoHud {
  const hud = el('div', 'hud');

  const statusRow = el('div', 'hud-row hud-hint-row');
  const status = el('p', 'hud-hint');
  status.setAttribute('aria-live', 'polite');
  const retry = button('Retry');
  retry.addEventListener('click', () => h.retry());
  statusRow.append(status, retry);
  const arStatus = el('p', 'hud-hint ar-status');
  arStatus.setAttribute('aria-live', 'polite');
  arStatus.hidden = true;

  const transport = el('div', 'hud-row');
  const play = button('Play', 'hud-button');
  const replay = button('Replay', 'hud-button');
  const sound = button('Sound on', 'hud-button');
  play.addEventListener('click', () => h.playPause());
  replay.addEventListener('click', () => h.replay());
  sound.addEventListener('click', () => h.toggleSound());
  transport.append(play, replay, sound);

  const secondary = el('div', 'hud-row hud-secondary');
  const enterAr = button('Enter AR');
  const resetAr = button('Reset placement');
  const exitAr = button('Exit AR');
  resetAr.hidden = true;
  exitAr.hidden = true;
  enterAr.addEventListener('click', () => h.enterAr());
  resetAr.addEventListener('click', () => h.resetAr());
  exitAr.addEventListener('click', () => h.exitAr());

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'video/mp4,.mp4';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) h.chooseFile(file);
  });
  const choose = button('Choose local MP4');
  choose.hidden = !allowLocal;
  choose.addEventListener('click', () => fileInput.click());
  const fixture = button('Use test clip');
  fixture.hidden = true;
  fixture.addEventListener('click', () => h.useFixture());
  const adjustToggle = button('Adjust appearance');
  const fullscreen = button('Fullscreen');
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void container.requestFullscreen?.().catch(() => undefined);
  });
  secondary.append(enterAr, resetAr, exitAr, choose, fixture, adjustToggle, fullscreen, fileInput);

  const note = el('p', 'hud-hint video-note');
  note.hidden = true;

  hud.append(statusRow, arStatus, transport, secondary, note);

  // "Adjust appearance": size/height/loop first, test keying controls after.
  const panel = el('div', 'tune-panel');
  panel.hidden = true;
  adjustToggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    adjustToggle.classList.toggle('active', !panel.hidden);
  });
  const setters: Partial<Record<keyof VideoTune, (v: never) => void>> = {};

  const addRange = (key: 'displayHeightMeters' | 'bottomOffsetMeters' | 'tolerance' | 'softness' | 'spill', label: string, min: number, max: number, step: number, unit = '') => {
    const row = el('label', 'tune-row');
    const out = el('output');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const show = (v: number) => {
      input.value = String(v);
      out.textContent = `${v.toFixed(2)}${unit}`;
    };
    show(initial[key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = `${v.toFixed(2)}${unit}`;
      h.tune(key, v);
    });
    row.append(el('span', '', label), out, input);
    panel.append(row);
    setters[key] = show;
  };
  const addCheckbox = (key: 'loop', label: string) => {
    const row = el('label', 'tune-row tune-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = initial[key];
    input.addEventListener('change', () => h.tune(key, input.checked));
    row.append(input, el('span', '', label));
    panel.append(row);
    setters[key] = (v: boolean) => (input.checked = v);
  };
  const addSelect = <K extends 'mode' | 'background'>(key: K, label: string, options: [VideoTune[K], string][]) => {
    const row = el('label', 'tune-row');
    const select = el('select');
    for (const [value, text] of options) {
      const o = el('option', '', text);
      o.value = value;
      select.append(o);
    }
    select.value = initial[key];
    select.addEventListener('change', () => h.tune(key, select.value as VideoTune[K]));
    row.append(el('span', '', label), select);
    panel.append(row);
    setters[key] = (v: VideoTune[K]) => (select.value = v);
  };

  panel.append(el('p', 'panel-heading', 'Size and placement'));
  const [hMin, hMax] = VIDEO_RANGES.displayHeightMeters;
  const [bMin, bMax] = VIDEO_RANGES.bottomOffsetMeters;
  addRange('displayHeightMeters', 'Video height (whole frame)', hMin, hMax, 0.05, ' m');
  addRange('bottomOffsetMeters', 'Bottom above surface', bMin, bMax, 0.05, ' m');
  addCheckbox('loop', 'Loop');
  panel.append(el('p', 'panel-heading', 'Keying (test controls)'));
  addSelect('mode', 'Background', KEY_MODES.map((m) => [m, KEY_LABELS[m]]));
  const colorRow = el('label', 'tune-row');
  const color = el('input');
  color.type = 'color';
  color.value = initial.color;
  color.addEventListener('input', () => h.tune('color', color.value));
  const sample = button('Sample top-left corner');
  sample.addEventListener('click', (e) => {
    e.preventDefault();
    h.sampleKey();
  });
  colorRow.append(el('span', '', 'Key color'), color, sample);
  panel.append(colorRow);
  setters.color = (v: string) => (color.value = v);
  addRange('tolerance', 'Tolerance', 0, 1, 0.01);
  addRange('softness', 'Edge softness', 0, 0.5, 0.01);
  addRange('spill', 'Spill suppression', 0, 1, 0.01);
  panel.append(el('p', 'panel-heading', 'Preview'));
  addSelect('background', 'Preview background', [['dark', 'Dark'], ['light', 'Light']]);

  container.append(hud, panel);

  return {
    setTransport(state, soundOn) {
      const busy = state === 'loading' || state === 'error';
      play.textContent = state === 'playing' ? 'Pause' : 'Play';
      play.classList.toggle('active', state === 'playing');
      play.disabled = busy;
      replay.disabled = busy;
      sound.textContent = soundOn ? 'Sound on' : 'Sound off';
      sound.classList.toggle('active', soundOn);
    },
    setStatus(text, showRetry) {
      status.textContent = text;
      retry.hidden = !showRetry;
      statusRow.hidden = !text && !showRetry;
    },
    setNote(text) {
      note.textContent = text;
      note.hidden = !text;
    },
    setAr(active, message) {
      enterAr.hidden = active;
      resetAr.hidden = !active;
      exitAr.hidden = !active;
      choose.hidden = active || !allowLocal;
      adjustToggle.hidden = active;
      if (active) panel.hidden = true;
      arStatus.textContent = message;
      arStatus.hidden = !message;
    },
    setArUnavailable(message) {
      enterAr.disabled = true;
      enterAr.textContent = 'AR unavailable';
      arStatus.textContent = message;
      arStatus.hidden = !message;
    },
    setSource(local, canUseFixture) {
      fixture.hidden = !(local && canUseFixture);
    },
    setTune(key, value) {
      (setters[key] as ((v: VideoTune[typeof key]) => void) | undefined)?.(value);
    },
    dispose() {
      hud.remove();
      panel.remove();
    },
  };
}
