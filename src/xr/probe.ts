import * as THREE from 'three';
import { KEYING_DEFAULTS, type ExperienceConfig } from '../config';
import { VideoClip } from '../video/clip';
import { createVideoMaterial } from '../video/material';
import { planeSize } from '../video/media';
import { createVideoHud, type VideoHud } from '../video/ui';
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
 * Then, one video-page difference at a time on top of `video-shader` (cumulative):
 * - `placeholder`     material created with an empty placeholder texture, then the clip texture swapped in (as setClip).
 * - `visibility`      plane hidden until the first frame, visibility recomputed every frame (video page rule).
 * - `floor`           + the GridHelper floor, hidden while AR is active.
 * - `layout`          + the video page's layout(): pixel ratio, size, preview-camera framing on clip change,
 *                     resize and AR exit; searching pauses and rewinds.
 * - `hud`             + the full video HUD (transport, Choose MP4, Adjust appearance, Fullscreen) and its
 *                     beforexrselect rule, replacing the probe's buttons.
 * Also accepts the `layer` / `overlay` / `stage` flags from options.ts.
 */
export const PROBE_STEPS = ['cube', 'plane', 'video-element', 'video-texture', 'video-shader', 'placeholder', 'visibility', 'floor', 'layout', 'hud'] as const;
export type ProbeStep = (typeof PROBE_STEPS)[number];

const VIDEO_HEIGHT = 1.2;

export function mountXrProbe(container: HTMLElement, config: ExperienceConfig): () => void {
  const params = new URLSearchParams(window.location.search);
  const flags = readXrTestFlags(params);
  const requested = params.get('step') ?? 'cube';
  const step: ProbeStep = (PROBE_STEPS as readonly string[]).includes(requested) ? (requested as ProbeStep) : 'cube';
  const stepIndex = PROBE_STEPS.indexOf(step);
  const usesVideo = stepIndex >= PROBE_STEPS.indexOf('video-element');
  const has = (s: ProbeStep) => stepIndex >= PROBE_STEPS.indexOf(s);

  const renderer = createXrRenderer({ antialias: false, powerPreference: 'high-performance' }, flags);
  renderer.setClearColor(0x03040a, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'stage';
  container.prepend(renderer.domElement);
  const overlayRoot = overlayRootFor(container, flags);
  const removeStageFlag = applyStageFlag(flags);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
  const floor = has('floor') ? new THREE.GridHelper(2, 8, 0x4dd8ff, 0x2a3142) : null;
  if (floor) scene.add(floor);
  const anchor = new THREE.Group();
  scene.add(anchor);

  const source = config.template === 'video' && config.settings.source ? config.settings.source : 'media/synthetic-greeting.mp4';
  const clip = usesVideo ? new VideoClip(container, source, true) : null;
  let lastVideoTime = -1;

  const placeholder = new THREE.Texture();
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
        : has('video-shader')
          ? createVideoMaterial(has('placeholder') ? placeholder : clip!.texture, { ...KEYING_DEFAULTS, mode: 'opaque' })
          : new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    camera.position.set(0, VIDEO_HEIGHT / 2, 2.4);
    camera.lookAt(0, VIDEO_HEIGHT / 2, 0);
  }
  anchor.add(mesh);
  if (has('placeholder')) (mesh.material as THREE.ShaderMaterial).uniforms.map.value = clip!.texture;
  if (has('visibility')) mesh.visible = false;
  // Without `layout`: plane only. With `layout`: the video page's layout() (copied as is).
  const layout = () => {
    if (step !== 'cube') {
      const size = planeSize(VIDEO_HEIGHT, clip?.aspect ?? 9 / 16);
      mesh.scale.set(size.width, size.height, 1);
      mesh.position.set(0, size.height / 2, 0);
    }
    if (renderer.xr.isPresenting) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (has('layout')) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (has('layout')) {
      const tanV = Math.tan(THREE.MathUtils.degToRad(50 / 2));
      const span = VIDEO_HEIGHT;
      const dist = Math.max((span * 1.15) / 2 / tanV, (Math.max(mesh.scale.x, 0.5) * 1.15) / 2 / (tanV * camera.aspect));
      camera.position.set(0, span / 2, dist);
      camera.lookAt(0, span / 2, 0);
    }
    camera.updateProjectionMatrix();
  };
  let soundOn = true;
  const refreshHud = () => {
    hud?.setTransport(clip?.state ?? 'loading', soundOn);
    hud?.setStatus(clip?.state === 'error' ? clip.message : clip?.state === 'blocked' ? clip.message : '', clip?.state === 'error');
  };
  if (clip)
    clip.onChange = () => {
      layout();
      refreshHud();
    };

  const probeDiv = document.createElement('div');
  probeDiv.className = 'hud';
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
  probeDiv.append(status, row);
  overlayRoot.append(readout);
  if (!has('hud')) overlayRoot.append(probeDiv);

  const ar = new ArPlacement(renderer, scene, anchor, overlayRoot, 0, { noun: step === 'cube' ? 'cube' : 'plane', fallback: 'probe preview' });
  const enter = mk('Enter AR', () => void ar.enter());
  const reset = mk('Reset placement', () => ar.reset());
  const exit = mk('Exit AR', () => ar.exit());
  const play = clip ? mk('Play', () => void clip.restart(true)) : null;
  const hud: VideoHud | null = has('hud')
    ? createVideoHud(overlayRoot, { displayHeightMeters: VIDEO_HEIGHT, bottomOffsetMeters: 0, loop: true, ...KEYING_DEFAULTS, mode: 'opaque', background: 'dark' }, true, false, {
        playPause: () => {
          if (!clip) return;
          if (clip.playing) clip.pause();
          else if (ar.active && ar.state !== 'placed') return;
          else void clip.play(soundOn);
        },
        replay: () => {
          if (!clip || (ar.active && ar.state !== 'placed')) return;
          void clip.restart(soundOn);
        },
        toggleSound: () => {
          soundOn = !soundOn;
          clip?.setMuted(!soundOn);
          refreshHud();
        },
        retry: () => clip?.retry(),
        enterAr: () => void ar.enter(),
        resetAr: () => ar.reset(),
        exitAr: () => ar.exit(),
        chooseFile: () => hud?.setStatus('Probe uses the synthetic clip only; local files are not loaded here.', false),
        useFixture: () => undefined,
        sampleKey: () => undefined,
        tune: () => undefined,
        cyclePlaneMaterial: () => undefined,
      })
    : null;
  const sync = () => {
    enter.hidden = ar.active;
    reset.hidden = exit.hidden = !ar.active;
    if (play) play.hidden = ar.active;
  };
  let lastAr = 'off';
  ar.onChange = (state, message) => {
    document.documentElement.classList.toggle('ar-active', ar.active);
    if (floor) floor.visible = !ar.active;
    if (message) status.textContent = message;
    hud?.setAr(ar.active, message);
    if (has('layout') && state === 'searching' && lastAr !== 'ready') clip?.stop();
    if (state === 'placed') void clip?.restart(soundOn);
    if (state === 'off') {
      clip?.pause();
      if (has('layout')) layout();
    }
    lastAr = state;
    sync();
    refreshHud();
  };
  sync();
  const blockXrSelect = (e: Event) => {
    const sel = has('hud') ? 'button, input, select, label, .tune-panel' : 'button';
    if ((e.target as Element | null)?.closest(sel)) e.preventDefault();
  };
  const selectRoot = has('hud') ? container : overlayRoot;
  selectRoot.addEventListener('beforexrselect', blockXrSelect);

  window.addEventListener('resize', layout);
  layout();
  refreshHud();

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
      `${step === 'cube' ? 'cube' : 'plane'} vis=${mesh.visible} ${mesh.material.type} ${mesh.scale.x.toFixed(2)}x${mesh.scale.y.toFixed(2)} @${f2(v2)} camera @${f2(v1)} dist ${v1.distanceTo(v2).toFixed(2)} m inView=${frustum.intersectsObject(mesh)}`,
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
      if (has('visibility')) mesh.visible = !!clip?.frameReady && clip.state !== 'error';
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
    selectRoot.removeEventListener('beforexrselect', blockXrSelect);
    document.documentElement.classList.remove('ar-active');
    removeStageFlag();
    mesh.geometry.dispose();
    mesh.material.dispose();
    readout.remove();
    probeDiv.remove();
    hud?.dispose();
    floor?.dispose();
    placeholder.dispose();
    if (overlayRoot !== container) overlayRoot.remove();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
