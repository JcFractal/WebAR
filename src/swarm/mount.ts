import * as THREE from 'three';
import { SWARM_DEFAULTS, type ExperienceConfig, type SwarmTuning } from '../config';
import { SwarmControls, type ControlTiming } from './controls';
import { Swarm } from './swarm';
import { createHud, type TuneValues } from './ui';

const MAX_FRAME_DELTA = 0.1;
const FOV = 50;
/** Extra room around the sculpture so drift, energy expansion, and bursts stay on screen. */
const FRAME_MARGIN = 1.55;

export function mountSwarm(container: HTMLElement, config: ExperienceConfig): () => void {
  const s = config.settings;
  const tuning: SwarmTuning = { ...SWARM_DEFAULTS, ...s.swarm };
  const timing: ControlTiming = {
    gatherSeconds: s.audio?.gatherSeconds ?? 3,
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
  scene.add(swarm.points);

  const controls = new SwarmControls();

  const resize = () => {
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
    manualEnergy: 0,
    maxPixelRatio: tuning.maxPixelRatio,
  };

  const hud = createHud(container, initial, {
    drift: () => (controls.gatherTarget = 0),
    gather: () => (controls.gatherTarget = 1),
    burst: () => controls.triggerBurst(1),
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
        case 'releaseSeconds':
        case 'burstRecoverySeconds':
          timing[key as keyof ControlTiming] = value as number;
          break;
        case 'manualEnergy':
          controls.energyTarget = value as number;
          break;
        case 'maxPixelRatio':
          tuning.maxPixelRatio = value as number;
          resize();
          break;
        default:
          tuning[key as 'pointSize' | 'brightness' | 'burstStrength'] = value as number;
      }
    },
  });

  resize();
  window.addEventListener('resize', resize);

  const timer = new THREE.Timer();
  timer.connect(document);
  // Own clock so procedural motion never jumps after the tab was suspended.
  let elapsed = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let frames = 0;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME_DELTA);
    elapsed += dt;
    frames++;
    controls.step(dt, timing);
    swarm.update(elapsed, dt, controls);
    renderer.render(scene, camera);

    fpsFrames++;
    fpsTime += timer.getDelta();
    if (fpsTime >= 0.5) {
      hud.setFps(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }
  });

  const debug = new URLSearchParams(window.location.search).has('debug');
  if (debug) {
    (window as unknown as Record<string, unknown>).__webar = {
      controls,
      timing,
      tuning,
      frames: () => frames,
      maxRadius: () => swarm.maxRadius(),
      radius,
    };
  }

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    timer.dispose();
    hud.dispose();
    scene.remove(swarm.points);
    swarm.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    if (debug) delete (window as unknown as Record<string, unknown>).__webar;
  };
}
