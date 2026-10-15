import { FORMATIONS, MOTION_PRESETS, type FormationId, type MotionPresetId } from '../config';

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
}

export interface HudHandlers {
  drift(): void;
  gather(): void;
  burst(): void;
  tune<K extends keyof TuneValues>(key: K, value: TuneValues[K]): void;
}

export interface Hud {
  setGatherTarget(target: number): void;
  setFps(fps: number): void;
  dispose(): void;
}

function button(label: string, className = 'hud-button'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

export function createHud(container: HTMLElement, initial: TuneValues, h: HudHandlers): Hud {
  const hud = document.createElement('div');
  hud.className = 'hud';

  const main = document.createElement('div');
  main.className = 'hud-row';
  const badge = document.createElement('span');
  badge.className = 'mode-badge';
  badge.textContent = 'Manual';
  badge.title = 'Manual mode: buttons drive the sculpture (no microphone)';
  const drift = button('Drift');
  const gather = button('Gather');
  const burst = button('Burst');
  main.append(badge, drift, gather, burst);

  const secondary = document.createElement('div');
  secondary.className = 'hud-row hud-secondary';
  const fullscreen = button('Fullscreen', 'hud-chip');
  const tuneToggle = button('Tune', 'hud-chip');
  const fpsToggle = button('FPS', 'hud-chip');
  const fps = document.createElement('span');
  fps.className = 'fps';
  fps.hidden = true;
  secondary.append(fullscreen, tuneToggle, fpsToggle, fps);
  if (!document.fullscreenEnabled) fullscreen.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'tune-panel';
  panel.hidden = true;

  const addSelect = <K extends 'formation' | 'motion'>(key: K, label: string, options: readonly TuneValues[K][]) => {
    const row = document.createElement('label');
    row.className = 'tune-row';
    const span = document.createElement('span');
    span.textContent = label;
    const select = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      select.append(opt);
    }
    select.value = initial[key];
    select.addEventListener('change', () => h.tune(key, select.value as TuneValues[K]));
    row.append(span, select);
    panel.append(row);
  };

  type NumKey = Exclude<keyof TuneValues, 'formation' | 'motion'>;
  const addSlider = (key: NumKey, label: string, min: number, max: number, step: number, digits = 2) => {
    const row = document.createElement('label');
    row.className = 'tune-row';
    const span = document.createElement('span');
    const out = document.createElement('output');
    const input = document.createElement('input');
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
    panel.append(row);
  };

  addSelect('formation', 'Formation', FORMATIONS);
  addSelect('motion', 'Motion preset', MOTION_PRESETS);
  addSlider('particleCount', 'Particles', 500, 6000, 250, 0);
  addSlider('pointSize', 'Point size (m)', 0.004, 0.03, 0.001, 3);
  addSlider('brightness', 'Brightness', 0.3, 2, 0.05);
  addSlider('gatherSeconds', 'Gather time (s)', 0.5, 8, 0.25);
  addSlider('releaseSeconds', 'Release time (s)', 0.5, 8, 0.25);
  addSlider('burstStrength', 'Burst strength', 0, 1.2, 0.05);
  addSlider('burstRecoverySeconds', 'Burst recovery (s)', 0.3, 4, 0.1);
  addSlider('manualEnergy', 'Energy (manual test)', 0, 1, 0.05);
  addSlider('maxPixelRatio', 'Render scale cap', 0.75, 3, 0.25);

  hud.append(main, secondary);
  container.append(panel, hud);

  const setGatherTarget = (target: number) => {
    gather.classList.toggle('active', target > 0.5);
    drift.classList.toggle('active', target <= 0.5);
  };
  setGatherTarget(0);

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
  tuneToggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    tuneToggle.classList.toggle('active', !panel.hidden);
  });
  fpsToggle.addEventListener('click', () => {
    fps.hidden = !fps.hidden;
    fpsToggle.classList.toggle('active', !fps.hidden);
  });

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

  return {
    setGatherTarget,
    setFps(v: number) {
      if (!fps.hidden) fps.textContent = `${Math.round(v)} FPS`;
    },
    dispose() {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      hud.remove();
      panel.remove();
    },
  };
}
