import * as THREE from 'three';
import { ArPlacement } from './ar';
import { applyStageFlag, createXrRenderer, describeFlags, layerReport, overlayRootFor, readXrTestFlags, sessionReport } from './options';

/**
 * `&probe`: minimal AR geometry test. Only the shared reticle and an untextured 25 cm cube at the
 * placement anchor; no video element, texture, video shader or microphone. Accepts the
 * `layer` / `overlay` / `stage` flags from options.ts, one at a time.
 */
export function mountXrProbe(container: HTMLElement): () => void {
  const flags = readXrTestFlags();
  const renderer = createXrRenderer({ antialias: false, powerPreference: 'high-performance' }, flags);
  renderer.setClearColor(0x03040a, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'stage';
  container.prepend(renderer.domElement);
  const overlayRoot = overlayRootFor(container, flags);
  const removeStageFlag = applyStageFlag(flags);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
  camera.position.set(0.6, 0.5, 1.2);
  camera.lookAt(0, 0.125, 0);
  const anchor = new THREE.Group();
  scene.add(anchor);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshNormalMaterial());
  cube.position.y = 0.125;
  anchor.add(cube);

  const hud = document.createElement('div');
  hud.className = 'hud';
  const status = document.createElement('p');
  status.className = 'hud-hint';
  status.textContent = 'AR probe: reticle + untextured cube only.';
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

  const ar = new ArPlacement(renderer, scene, anchor, overlayRoot, 0, { noun: 'cube', fallback: 'probe preview' });
  const enter = mk('Enter AR', () => void ar.enter());
  const reset = mk('Reset placement', () => ar.reset());
  const exit = mk('Exit AR', () => ar.exit());
  const sync = () => {
    enter.hidden = ar.active;
    reset.hidden = exit.hidden = !ar.active;
  };
  ar.onChange = (_state, message) => {
    document.documentElement.classList.toggle('ar-active', ar.active);
    if (message) status.textContent = message;
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
    cube.getWorldPosition(v2);
    viewProj.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    const reticle = scene.children.find((o) => o !== anchor) as THREE.Object3D | undefined;
    return [
      `PROBE flags: ${describeFlags(flags)}`,
      navigator.userAgent,
      `xr ${xr ? 'on' : 'off'} ar=${ar.state} ${layerReport(renderer)}`,
      sessionReport(renderer, overlayRoot),
      `frames ${stats.frames} xrFrames ${stats.xrFrames} renderErr ${stats.renderErrors} gl 0x${stats.glError.toString(16)}`,
      `reticle vis=${reticle?.visible ?? '-'} anchor vis=${anchor.visible}`,
      `cube @${f2(v2)} camera @${f2(v1)} dist ${v1.distanceTo(v2).toFixed(2)} m inView=${frustum.intersectsObject(cube)}`,
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
      if (!renderer.xr.isPresenting) cube.rotation.y = time / 2000;
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

  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { __webar: unknown }).__webar = { report, flags, frames: () => stats.frames };
  }

  return () => {
    renderer.setAnimationLoop(null);
    ar.dispose();
    window.removeEventListener('resize', layout);
    overlayRoot.removeEventListener('beforexrselect', blockXrSelect);
    document.documentElement.classList.remove('ar-active');
    removeStageFlag();
    cube.geometry.dispose();
    cube.material.dispose();
    readout.remove();
    hud.remove();
    if (overlayRoot !== container) overlayRoot.remove();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
