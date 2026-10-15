import * as THREE from 'three';
import { VoiceAnalyzer, type VoiceFrame } from '../audio/analysis';
import { MicInput, type MicStatus } from '../audio/mic';
import { AUDIO_DEFAULTS, SWARM_DEFAULTS, type AudioSettings, type ExperienceConfig, type SwarmTuning } from '../config';
import { SwarmControls, type ControlTiming } from './controls';
import { Swarm } from './swarm';
import { ArPlacement, isArSupported } from '../xr/ar';
import { createHud, MIC_LABELS, type InputMode, type TuneValues } from './ui';

const MAX_FRAME_DELTA = 0.1;
const FOV = 50;
/** Extra room around the sculpture so drift, energy expansion, and bursts stay on screen. */
const FRAME_MARGIN = 1.55;
const DIAG_INTERVAL = 0.2;

export function mountSwarm(container: HTMLElement, config: ExperienceConfig): () => void {
  const s = config.settings;
  const tuning: SwarmTuning = { ...SWARM_DEFAULTS, ...s.swarm };
  const audio: AudioSettings = { ...AUDIO_DEFAULTS, ...s.audio };
  const timing: ControlTiming = {
    gatherSeconds: audio.gatherSeconds,
    quietSettleSeconds: audio.quietSettleSeconds,
    releaseSeconds: tuning.releaseSeconds,
    burstRecoverySeconds: tuning.burstRecoverySeconds,
  };
  const radius = s.diameterMeters / 2;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03040a, 1);
  renderer.domElement.className = 'stage';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);

  const swarm = new Swarm({
    count: s.particleCount,
    palette: s.palette,
    formation: s.formation,
    motion: s.motionPreset,
    radius,
    tuning,
  });
  // Placement anchor: identity in the normal player, the placed world transform in AR.
  const anchor = new THREE.Group();
  anchor.add(swarm.points);
  scene.add(anchor);
  const ar = new ArPlacement(renderer, scene, anchor, container, s.heightAboveSurfaceMeters + radius);

  const controls = new SwarmControls();
  const mic = new MicInput();
  const voice = new VoiceAnalyzer();
  let mode: InputMode = 'manual';
  let wantLive = false;
  let manualGatherTarget = 0;
  let manualEnergy = 0;
  let lastFrame: VoiceFrame | null = null;

  const resize = () => {
    if (renderer.xr.isPresenting) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tuning.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const tanFit = Math.min(tanV, tanV * camera.aspect);
    camera.position.set(0, 0, (radius * FRAME_MARGIN) / tanFit);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    swarm.setProjectionScale(buffer.y / (2 * tanV));
  };

  const initial: TuneValues = {
    formation: s.formation,
    motion: s.motionPreset,
    particleCount: swarm.particleCount,
    pointSize: tuning.pointSize,
    brightness: tuning.brightness,
    gatherSeconds: timing.gatherSeconds,
    releaseSeconds: timing.releaseSeconds,
    burstStrength: tuning.burstStrength,
    burstRecoverySeconds: timing.burstRecoverySeconds,
    manualEnergy,
    maxPixelRatio: tuning.maxPixelRatio,
    gain: audio.gain,
    speechCoherence: audio.speechCoherence,
    tonalThreshold: audio.tonalThreshold,
    turbulenceStrength: tuning.turbulenceStrength,
    rippleStrength: tuning.rippleStrength,
    steadyHoldSeconds: audio.steadyHoldSeconds,
    quietSettleSeconds: audio.quietSettleSeconds,
    quietDelaySeconds: audio.quietDelaySeconds,
    burstThresholdDb: audio.burstThresholdDb,
    burstCooldownSeconds: audio.burstCooldownSeconds,
  };

  const setMode = (m: InputMode) => {
    mode = m;
    hud.setMode(m);
    if (m === 'manual') {
      controls.settling = false;
      controls.gatherTarget = manualGatherTarget;
      controls.energyTarget = manualEnergy;
      controls.turbulenceTarget = manualEnergy * 0.5;
    }
    updateHint();
  };

  const startLive = async () => {
    wantLive = true;
    const wasLive = mic.status === 'live';
    await mic.start();
    if (mic.status !== 'live' || !wantLive) return;
    if (!wasLive && !voice.calibrated) voice.calibrate();
    setMode('live');
  };

  const hud = createHud(container, initial, {
    drift: () => {
      manualGatherTarget = 0;
      controls.gatherTarget = 0;
    },
    gather: () => {
      manualGatherTarget = 1;
      controls.gatherTarget = 1;
    },
    burst: () => controls.triggerBurst(1),
    live: () => void startLive(),
    retry: () => void startLive(),
    manual: () => {
      wantLive = false;
      setMode('manual');
    },
    calibrate: () => {
      voice.calibrate();
      updateHint();
    },
    enterAr: () => {
      if (!arSupported) {
        hud.setAr(false, 'AR is not available on this device or browser. The fullscreen sculpture still works.');
        return;
      }
      void ar.enter();
    },
    resetAr: () => ar.reset(),
    exitAr: () => ar.exit(),
    stopSound: () => {
      wantLive = false;
      mic.stop();
      setMode('manual');
    },
    tune: (key, value) => {
      switch (key) {
        case 'formation':
          swarm.setFormation(value as TuneValues['formation']);
          break;
        case 'motion':
          swarm.setMotion(value as TuneValues['motion']);
          break;
        case 'particleCount':
          swarm.setCount(value as number);
          break;
        case 'gatherSeconds':
          timing.gatherSeconds = audio.gatherSeconds = value as number;
          break;
        case 'quietSettleSeconds':
          timing.quietSettleSeconds = audio.quietSettleSeconds = value as number;
          break;
        case 'releaseSeconds':
          timing.releaseSeconds = value as number;
          break;
        case 'burstRecoverySeconds':
          timing.burstRecoverySeconds = value as number;
          break;
        case 'gain':
        case 'speechCoherence':
        case 'tonalThreshold':
        case 'steadyHoldSeconds':
        case 'quietDelaySeconds':
        case 'burstThresholdDb':
        case 'burstCooldownSeconds':
          audio[key as 'gain' | 'speechCoherence' | 'tonalThreshold' | 'steadyHoldSeconds' | 'quietDelaySeconds' | 'burstThresholdDb' | 'burstCooldownSeconds'] = value as number;
          break;
        case 'manualEnergy':
          manualEnergy = value as number;
          if (mode === 'manual') {
            controls.energyTarget = manualEnergy;
            controls.turbulenceTarget = manualEnergy * 0.5;
          }
          break;
        case 'maxPixelRatio':
          tuning.maxPixelRatio = value as number;
          resize();
          break;
        default:
          tuning[key as 'pointSize' | 'brightness' | 'burstStrength' | 'turbulenceStrength' | 'rippleStrength'] = value as number;
      }
    },
  });

  const MIC_ERRORS: MicStatus[] = ['denied', 'no-device', 'unsupported', 'error'];
  let lastHint = '';
  function updateHint() {
    let text: string;
    let retry = false;
    if (MIC_ERRORS.includes(mic.status)) {
      text = `${mic.message} Manual mode still works.`;
      retry = mic.status !== 'unsupported';
    } else if (mic.status === 'requesting') {
      text = 'Allow microphone access to use your voice.';
    } else if (mode === 'live' && voice.isCalibrating) {
      text = `Stay quiet: measuring room noise… ${Math.round((lastFrame?.calibrationProgress ?? 0) * 100)}%`;
    } else if (mode === 'live' && mic.contextState === 'suspended') {
      text = 'Sound paused. Tap anywhere to resume.';
    } else if (mode === 'live') {
      text = 'Speak to stir the particles. Hold a steady hum to form the shape.';
    } else {
      text = '';
    }
    const key = `${text}|${retry}`;
    if (key !== lastHint) {
      lastHint = key;
      hud.setHint(text, retry);
    }
  }

  mic.onChange = (status) => {
    hud.setMic(status);
    if (status !== 'live' && mode === 'live') setMode('manual');
    updateHint();
  };

  // Audio can be suspended in the background; resume when visible again or on the next tap.
  const resumeAudio = () => {
    if (document.visibilityState === 'visible') mic.resume();
  };
  document.addEventListener('visibilitychange', resumeAudio);
  container.addEventListener('pointerdown', resumeAudio);

  resize();
  window.addEventListener('resize', resize);
  setMode('manual');

  const timer = new THREE.Timer();
  timer.connect(document);
  // Own clock so procedural motion never jumps after the tab was suspended.
  let elapsed = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;
  let diagTime = 0;
  let frames = 0;
  let bursts = 0;

  let arSupported = false;
  void isArSupported().then((ok) => (arSupported = ok));
  ar.onChange = (state, message) => {
    document.documentElement.classList.toggle('ar-active', ar.active);
    hud.setAr(ar.active, message);
    if (state === 'off') resize();
  };
  const blockXrSelect = (e: Event) => {
    if ((e.target as Element | null)?.closest('button, input, select, label, .tune-panel')) e.preventDefault();
  };
  container.addEventListener('beforexrselect', blockXrSelect);

  renderer.setAnimationLoop((time, frame) => {
    timer.update(time);
    const realDt = timer.getDelta();
    const dt = Math.min(realDt, MAX_FRAME_DELTA);
    elapsed += dt;
    frames++;

    if (mic.status === 'live') {
      // Analyse in both modes so diagnostics stay useful; only Live mode writes the controls.
      const f = voice.step(mic.read(), dt, audio);
      lastFrame = f;
      if (mode === 'live') {
        controls.energyTarget = f.energy;
        controls.turbulenceTarget = f.turbulence;
        controls.gatherTarget = f.gatherTarget;
        controls.settling = f.settling;
        if (f.burst > 0) {
          controls.triggerBurst(f.burst);
          bursts++;
        }
        hud.setMeter(f.energy, f.state === 'tonal');
      }
    } else {
      lastFrame = null;
    }

    controls.step(dt, timing);
    swarm.update(elapsed, dt, controls);
    ar.update(frame);
    renderer.render(scene, camera);

    fpsFrames++;
    fpsTime += realDt;
    if (fpsTime >= 0.5) {
      fps = fpsFrames / fpsTime;
      fpsFrames = 0;
      fpsTime = 0;
    }
    diagTime += realDt;
    if (diagTime >= DIAG_INTERVAL) {
      diagTime = 0;
      updateHint();
      if (hud.diagnosticsOpen) {
        hud.setDiagnostics({
          mic: MIC_LABELS[mic.status],
          energy: mode === 'live' || !lastFrame ? controls.energy : lastFrame.energy,
          levelDb: lastFrame?.levelDb ?? -100,
          floorDb: voice.noiseFloorDb,
          calibrated: voice.calibrated,
          steadiness: lastFrame?.steadiness ?? 0,
          tonality: lastFrame?.tonality ?? 0,
          turbulence: controls.turbulence,
          gather: controls.gather,
          state: lastFrame?.state ?? (mode === 'manual' ? 'manual' : '–'),
          fps,
        });
      }
    }
  });

  const debug = new URLSearchParams(window.location.search).has('debug');
  if (debug) {
    (window as unknown as Record<string, unknown>).__webar = {
      controls,
      timing,
      tuning,
      audio,
      mic,
      voice,
      mode: () => mode,
      lastFrame: () => lastFrame,
      bursts: () => bursts,
      frames: () => frames,
      maxRadius: () => swarm.maxRadius(),
      radius,
    };
  }

  return () => {
    container.removeEventListener('beforexrselect', blockXrSelect);
    ar.dispose();
    document.documentElement.classList.remove('ar-active');
    renderer.setAnimationLoop(null);
    mic.dispose();
    document.removeEventListener('visibilitychange', resumeAudio);
    container.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('resize', resize);
    timer.dispose();
    hud.dispose();
    anchor.remove(swarm.points);
    scene.remove(anchor);
    swarm.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    if (debug) delete (window as unknown as Record<string, unknown>).__webar;
  };
}
