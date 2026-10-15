import type { MicStatus } from '../audio/mic';
import { FORMATIONS, MOTION_PRESETS, type FormationId, type MotionPresetId } from '../config';

export type InputMode = 'manual' | 'live';

export interface TuneValues {
  formation: FormationId;
  motion: MotionPresetId;
  particleCount: number;
  pointSize: number;
  brightness: number;
  gatherSeconds: number;
  releaseSeconds: number;
  burstStrength: number;
  burstRecoverySeconds: number;
  manualEnergy: number;
  maxPixelRatio: number;
  gain: number;
  steadyHoldSeconds: number;
  quietSettleSeconds: number;
  quietDelaySeconds: number;
  burstThresholdDb: number;
  burstCooldownSeconds: number;
}

export interface DiagValues {
  mic: string;
  energy: number;
  levelDb: number;
  floorDb: number;
  calibrated: boolean;
  steadiness: number;
  gather: number;
  state: string;
  fps: number;
}

export interface HudHandlers {
  drift(): void;
  gather(): void;
  burst(): void;
  live(): void;
  manual(): void;
  retry(): void;
  calibrate(): void;
  stopSound(): void;
  tune<K extends keyof TuneValues>(key: K, value: TuneValues[K]): void;
}

export interface Hud {
  setGatherTarget(target: number): void;
  setMode(mode: InputMode): void;
  setMic(status: MicStatus): void;
  setHint(text: string, showRetry: boolean): void;
  setMeter(energy: number, steady: boolean): void;
  setDiagnostics(d: DiagValues): void;
  readonly diagnosticsOpen: boolean;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, className = 'hud-button'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const MIC_LABELS: Record<MicStatus, string> = {
  off: 'Off',
  requesting: 'Requesting…',
  live: 'On',
  denied: 'Blocked',
  'no-device': 'No microphone',
  unsupported: 'Unsupported',
  error: 'Error',
};

export function createHud(container: HTMLElement, initial: TuneValues, h: HudHandlers): Hud {
  const hud = el('div', 'hud');

  const hintRow = el('div', 'hud-row hud-hint-row');
  const hint = el('p', 'hud-hint');
  hint.setAttribute('aria-live', 'polite');
  const retry = button('Retry', 'hud-chip');
  hintRow.append(hint, retry);

  const main = el('div', 'hud-row');
  const badge = el('span', 'mode-badge', 'Manual');
  const manualGroup = el('div', 'hud-group');
  const drift = button('Drift');
  const gather = button('Gather');
  const burst = button('Burst');
  manualGroup.append(drift, gather, burst);
  const liveGroup = el('div', 'hud-group');
  const meter = el('div', 'meter');
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Sound level');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '1');
  const meterFill = el('div', 'meter-fill');
  meter.append(meterFill);
  liveGroup.append(meter);
  liveGroup.hidden = true;
  main.append(badge, manualGroup, liveGroup);

  const secondary = el('div', 'hud-row hud-secondary');
  const liveChip = button('Enable sound', 'hud-chip');
  const manualChip = button('Manual', 'hud-chip');
  const fullscreen = button('Fullscreen', 'hud-chip');
  const tuneToggle = button('Tune', 'hud-chip');
  const diagToggle = button('Diagnostics', 'hud-chip');
  secondary.append(liveChip, manualChip, fullscreen, tuneToggle, diagToggle);
  if (!document.fullscreenEnabled) fullscreen.hidden = true;

  const panel = el('div', 'tune-panel');
  panel.hidden = true;
  const diag = el('div', 'tune-panel diag-panel');
  diag.hidden = true;

  const addSelect = <K extends 'formation' | 'motion'>(key: K, label: string, options: readonly TuneValues[K][]) => {
    const row = el('label', 'tune-row');
    const select = el('select');
    for (const o of options) {
      const opt = el('option', '', o);
      opt.value = o;
      select.append(opt);
    }
    select.value = initial[key];
    select.addEventListener('change', () => h.tune(key, select.value as TuneValues[K]));
    row.append(el('span', '', label), select);
    panel.append(row);
  };

  type NumKey = Exclude<keyof TuneValues, 'formation' | 'motion'>;
  const addSlider = (parent: HTMLElement, key: NumKey, label: string, min: number, max: number, step: number, digits = 2) => {
    const row = el('label', 'tune-row');
    const span = el('span');
    const out = el('output');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial[key]);
    const show = () => (out.textContent = Number(input.value).toFixed(digits));
    show();
    span.append(label, ' ', out);
    input.addEventListener('input', () => {
      show();
      h.tune(key, Number(input.value));
    });
    row.append(span, input);
    parent.append(row);
  };

  panel.append(el('p', 'panel-heading', 'Visuals'));
  addSelect('formation', 'Formation', FORMATIONS);
  addSelect('motion', 'Motion preset', MOTION_PRESETS);
  addSlider(panel, 'particleCount', 'Particles', 500, 6000, 250, 0);
  addSlider(panel, 'pointSize', 'Point size (m)', 0.004, 0.03, 0.001, 3);
  addSlider(panel, 'brightness', 'Brightness', 0.3, 2, 0.05);
  addSlider(panel, 'burstStrength', 'Burst strength', 0, 1.2, 0.05);
  addSlider(panel, 'burstRecoverySeconds', 'Burst recovery (s)', 0.3, 4, 0.1);
  addSlider(panel, 'releaseSeconds', 'Release time (s)', 0.5, 8, 0.25);
  addSlider(panel, 'maxPixelRatio', 'Render scale cap', 0.75, 3, 0.25);
  panel.append(el('p', 'panel-heading', 'Sound response'));
  addSlider(panel, 'steadyHoldSeconds', 'Steady hold (s)', 0.5, 6, 0.25);
  addSlider(panel, 'gatherSeconds', 'Gather time (s)', 0.5, 8, 0.25);
  addSlider(panel, 'quietDelaySeconds', 'Quiet delay (s)', 0, 4, 0.1, 1);
  addSlider(panel, 'quietSettleSeconds', 'Quiet settle (s)', 0.5, 10, 0.25);
  addSlider(panel, 'burstThresholdDb', 'Burst threshold (dB)', 5, 35, 1, 0);
  addSlider(panel, 'burstCooldownSeconds', 'Burst cooldown (s)', 0.2, 4, 0.1, 1);
  panel.append(el('p', 'panel-heading', 'Manual test'));
  addSlider(panel, 'manualEnergy', 'Energy (manual only)', 0, 1, 0.05);

  const stats = el('dl', 'diag-stats');
  const statValues = new Map<string, HTMLElement>();
  for (const label of ['Mic', 'Input', 'Energy', 'Level', 'Noise floor', 'Steadiness', 'Gather', 'State', 'Frame rate']) {
    const dd = el('dd', '', '–');
    stats.append(el('dt', '', label), dd);
    statValues.set(label, dd);
  }
  const diagButtons = el('div', 'hud-row diag-buttons');
  const calibrate = button('Calibrate', 'hud-chip');
  const retryMic = button('Retry mic', 'hud-chip');
  const stopSound = button('Stop sound', 'hud-chip');
  diagButtons.append(calibrate, retryMic, stopSound);
  diag.append(stats);
  addSlider(diag, 'gain', 'Sensitivity', 0.25, 5, 0.05);
  diag.append(
    diagButtons,
    el(
      'p',
      'diag-note',
      'Any steady sound (humming, a held vowel, music, or loud room noise) can gather the particles. ' +
        'It responds to sound level and steadiness only; it does not recognize words.',
    ),
  );

  hud.append(hintRow, main, secondary);
  container.append(panel, diag, hud);

  const setGatherTarget = (target: number) => {
    gather.classList.toggle('active', target > 0.5);
    drift.classList.toggle('active', target <= 0.5);
  };
  setGatherTarget(0);

  let micStatus: MicStatus = 'off';
  let mode: InputMode = 'manual';
  const syncChips = () => {
    liveChip.textContent = micStatus === 'requesting' ? 'Starting…' : micStatus === 'live' ? 'Live' : 'Enable sound';
    liveChip.disabled = micStatus === 'requesting';
    liveChip.classList.toggle('active', mode === 'live');
    manualChip.classList.toggle('active', mode === 'manual');
    calibrate.disabled = micStatus !== 'live';
    stopSound.disabled = micStatus !== 'live';
    retryMic.disabled = micStatus === 'live' || micStatus === 'requesting';
  };
  syncChips();

  drift.addEventListener('click', () => {
    h.drift();
    setGatherTarget(0);
  });
  gather.addEventListener('click', () => {
    h.gather();
    setGatherTarget(1);
  });
  burst.addEventListener('click', () => {
    h.burst();
    burst.classList.remove('flash');
    void burst.offsetWidth;
    burst.classList.add('flash');
  });
  liveChip.addEventListener('click', () => h.live());
  manualChip.addEventListener('click', () => h.manual());
  retry.addEventListener('click', () => h.retry());
  retryMic.addEventListener('click', () => h.retry());
  calibrate.addEventListener('click', () => h.calibrate());
  stopSound.addEventListener('click', () => h.stopSound());

  const togglePanel = (open: HTMLElement, other: HTMLElement) => {
    open.hidden = !open.hidden;
    other.hidden = true;
    tuneToggle.classList.toggle('active', !panel.hidden);
    diagToggle.classList.toggle('active', !diag.hidden);
  };
  tuneToggle.addEventListener('click', () => togglePanel(panel, diag));
  diagToggle.addEventListener('click', () => togglePanel(diag, panel));

  const syncFullscreen = () => {
    const on = document.fullscreenElement !== null;
    fullscreen.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
    fullscreen.classList.toggle('active', on);
  };
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', syncFullscreen);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return {
    setGatherTarget,
    setMode(m) {
      mode = m;
      badge.textContent = m === 'live' ? 'Live' : 'Manual';
      badge.classList.toggle('live', m === 'live');
      badge.title = m === 'live' ? 'Live: the microphone drives the sculpture' : 'Manual: buttons drive the sculpture (no microphone)';
      manualGroup.hidden = m === 'live';
      liveGroup.hidden = m !== 'live';
      syncChips();
    },
    setMic(status) {
      micStatus = status;
      syncChips();
    },
    setHint(text, showRetry) {
      hint.textContent = text;
      hintRow.hidden = text === '';
      retry.hidden = !showRetry;
    },
    setMeter(energy, steady) {
      meterFill.style.transform = `scaleX(${Math.min(1, Math.max(0, energy)).toFixed(3)})`;
      meterFill.classList.toggle('steady', steady);
      meter.setAttribute('aria-valuenow', energy.toFixed(2));
    },
    setDiagnostics(d) {
      const set = (k: string, v: string) => {
        const node = statValues.get(k);
        if (node && node.textContent !== v) node.textContent = v;
      };
      set('Mic', d.mic);
      set('Input', mode === 'live' ? 'Live (microphone)' : 'Manual (buttons)');
      set('Energy', pct(d.energy));
      set('Level', `${d.levelDb.toFixed(0)} dBFS`);
      set('Noise floor', d.calibrated ? `${d.floorDb.toFixed(0)} dBFS` : `${d.floorDb.toFixed(0)} dBFS (not calibrated)`);
      set('Steadiness', pct(d.steadiness));
      set('Gather', pct(d.gather));
      set('State', d.state);
      set('Frame rate', `${Math.round(d.fps)} FPS`);
    },
    get diagnosticsOpen() {
      return !diag.hidden;
    },
    dispose() {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      hud.remove();
      panel.remove();
      diag.remove();
    },
  };
}

export { MIC_LABELS };
