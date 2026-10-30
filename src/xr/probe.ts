import * as THREE from 'three';
import { KEYING_DEFAULTS, type ExperienceConfig } from '../config';
import { VideoClip } from '../video/clip';
import { createVideoMaterial } from '../video/material';
import { planeSize } from '../video/media';
import { ArPlacement } from './ar';
import { applyStageFlag, createXrRenderer, describeFlags, layerReport, overlayRootFor, readXrTestFlags, sessionReport } from './options';

/**
 * `&probe`: AR rendering ladder for the S24 investigation. The XR setup (renderer, overlay root,
 * layer, ArPlacement) is the one the baseline cube passed with; each `step` adds one change:
 * - `cube` (default)  reticle + untextured 25 cm cube; no video, texture, shader or mic.
 * - `plane`           untextured magenta upright plane, video-plane size and position (0.675 × 1.2 m).
 * - `video-element`   + a playing `<video>` (synthetic clip, same element code as the video page); plane still magenta.
 * - `video-texture`   + the plane shows the video through a plain MeshBasicMaterial (VideoTexture).
 * - `video-shader`    + the plane uses the video page's keying ShaderMaterial in Opaque mode.
 * Also accepts the `layer` / `overlay` / `stage` flags from options.ts.
 */
export const PROBE_STEPS = ['cube', 'plane', 'video-element', 'video-texture', 'video-shader'] as const;
export type ProbeStep = (typeof PROBE_STEPS)[number];

const VIDEO_HEIGHT = 1.2;

export function mountXrProbe(container: HTMLElement, config: ExperienceConfig): () => void {
  const params = new URLSearchParams(window.location.search);
  const flags = readXrTestFlags(params);
  const requested = params.get('step') ?? 'cube';
  const step: ProbeStep = (PROBE_STEPS as readonly string[]).includes(requested) ? (requested as ProbeStep) : 'cube';
  const stepIndex = PROBE_STEPS.indexOf(step);
  const usesVideo = stepIndex >= PROBE_STEPS.indexOf('video-element');

  const renderer = createXrRenderer({ antialias: false, powerPreference: 'high-performance' }, flags);
  renderer.setClearColor(0x03040a, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'stage';
  container.prepend(renderer.domElement);
  const overlayRoot = overlayRootFor(container, flags);
  const removeStageFlag = applyStageFlag(flags);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
  const anchor = new THREE.Group();
  scene.add(anchor);

  const source = config.template === 'video' && config.settings.source ? config.settings.source : 'media/synthetic-greeting.mp4';
  const clip = usesVideo ? new VideoClip(container, source, true) : null;
  let lastVideoTime = -1;

  let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  if (step === 'cube') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshNormalMaterial());
    mesh.position.y = 0.125;
    camera.position.set(0.6, 0.5, 1.2);
    camera.lookAt(0, 0.125, 0);
  } else {
    const material =
      step === 'video-texture'
        ? new THREE.MeshBasicMaterial({ map: clip!.texture, side: THREE.DoubleSide, toneMapped: false })
        : step === 'video-shader'
          ? createVideoMaterial(clip!.texture, { ...KEYING_DEFAULTS, mode: 'opaque' })
          : new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    camera.position.set(0, VIDEO_HEIGHT / 2, 2.4);
    camera.lookAt(0, VIDEO_HEIGHT / 2, 0);
  }
  anchor.add(mesh);
  const layoutPlane = () => {
    if (step === 'cube') return;
    const size = planeSize(VIDEO_HEIGHT, clip?.aspect ?? 9 / 16);
    mesh.scale.set(size.width, size.height, 1);
    mesh.position.set(0, size.height / 2, 0);
  };
  layoutPlane();
  if (clip) clip.onChange = layoutPlane;

  const hud = document.createElement('div');
  hud.className = 'hud';
  const status = document.createElement('p');
  status.className = 'hud-hint';
  status.textContent = `AR probe step "${step}". ${requested !== step ? `Unknown step "${requested}"; using cube. ` : ''}Steps: ${PROBE_STEPS.join(' → ')}.`;
  const row = document.createElement('div');
  row.className = 'hud-row';
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-chip';
    b.textContent = label;
    b.addEventListener('click', fn);
    row.append(b);
    return b;
  };
  const readout = document.createElement('pre');
  readout.className = 'diag-readout';
  hud.append(status, row);
  overlayRoot.append(readout, hud);

  const ar = new ArPlacement(renderer, scene, anchor, overlayRoot, 0, { noun: step === 'cube' ? 'cube' : 'plane', fallback: 'probe preview' });
  const enter = mk('Enter AR', () => void ar.enter());
  const reset = mk('Reset placement', () => ar.reset());
  const exit = mk('Exit AR', () => ar.exit());
  const play = clip ? mk('Play', () => void clip.restart(true)) : null;
  const sync = () => {
    enter.hidden = ar.active;
    reset.hidden = exit.hidden = !ar.active;
    if (play) play.hidden = ar.active;
  };
  ar.onChange = (state, message) => {
    document.documentElement.classList.toggle('ar-active', ar.active);
    if (message) status.textContent = message;
    if (state === 'placed') void clip?.restart(true);
    if (state === 'off') clip?.pause();
    sync();
  };
  sync();
  const blockXrSelect = (e: Event) => {
    if ((e.target as Element | null)?.closest('button')) e.preventDefault();
  };
  overlayRoot.addEventListener('beforexrselect', blockXrSelect);

  const layout = () => {
    if (renderer.xr.isPresenting) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', layout);
  layout();

  const gl = renderer.getContext();
  const stats = { frames: 0, xrFrames: 0, renderErrors: 0, lastError: '', glError: 0 };
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const f2 = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const report = (): string => {
    const xr = renderer.xr.isPresenting;
    const xrCam = renderer.xr.getCamera();
    const view = xr ? (xrCam.cameras[0] ?? xrCam) : camera;
    view.getWorldPosition(v1);
    mesh.getWorldPosition(v2);
    viewProj.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    const reticle = scene.children.find((o) => o !== anchor) as THREE.Object3D | undefined;
    const v = clip?.video;
    return [
      `PROBE step=${step} (${stepIndex + 1}/${PROBE_STEPS.length}) flags: ${describeFlags(flags)}`,
      navigator.userAgent,
      `xr ${xr ? 'on' : 'off'} ar=${ar.state} ${layerReport(renderer)}`,
      sessionReport(renderer, overlayRoot),
      `frames ${stats.frames} xrFrames ${stats.xrFrames} renderErr ${stats.renderErrors} gl 0x${stats.glError.toString(16)}`,
      `reticle vis=${reticle?.visible ?? '-'} anchor vis=${anchor.visible}`,
      `${step === 'cube' ? 'cube' : 'plane'} ${mesh.material.type} ${mesh.scale.x.toFixed(2)}x${mesh.scale.y.toFixed(2)} @${f2(v2)} camera @${f2(v1)} dist ${v1.distanceTo(v2).toFixed(2)} m inView=${frustum.intersectsObject(mesh)}`,
      clip
        ? `video rs=${v!.readyState} ${v!.videoWidth}x${v!.videoHeight} t=${v!.currentTime.toFixed(2)} paused=${v!.paused} state=${clip.state} frameReady=${clip.frameReady} texture v${clip.texture.version}`
        : 'video none',
      stats.lastError ? `error: ${stats.lastError}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  let lastReport = -1000;
  renderer.setAnimationLoop((time, frame) => {
    stats.frames++;
    if (frame) stats.xrFrames++;
    try {
      ar.update(frame);
      if (!renderer.xr.isPresenting && step === 'cube') mesh.rotation.y = time / 2000;
      const v = clip?.video;
      if (clip?.frameReady && v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        clip.texture.needsUpdate = true;
      }
      renderer.render(scene, camera);
      const e = gl.getError();
      if (e) stats.glError = e;
    } catch (err) {
      stats.renderErrors++;
      stats.lastError = (err as Error)?.message ?? String(err);
    }
    if (time - lastReport > 250) {
      lastReport = time;
      readout.textContent = report();
    }
  });

  if (params.has('debug')) {
    (window as unknown as { __webar: unknown }).__webar = {
      report,
      flags,
      step,
      frames: () => stats.frames,
      frameReady: () => !!clip?.frameReady,
    };
  }

  return () => {
    renderer.setAnimationLoop(null);
    ar.dispose();
    clip?.dispose();
    window.removeEventListener('resize', layout);
    overlayRoot.removeEventListener('beforexrselect', blockXrSelect);
    document.documentElement.classList.remove('ar-active');
    removeStageFlag();
    mesh.geometry.dispose();
    mesh.material.dispose();
    readout.remove();
    hud.remove();
    if (overlayRoot !== container) overlayRoot.remove();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
