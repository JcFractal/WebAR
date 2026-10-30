import * as THREE from 'three';
import { KEYING_DEFAULTS, VIDEO_DEFAULTS, type VideoExperienceConfig } from '../config';
import { ArPlacement, isArSupported, type ArState } from '../xr/ar';
import { VideoClip, liveObjectUrlCount } from './clip';
import { applyKeying, createVideoMaterial } from './material';
import { PLANE_MODES, PLANE_MODE_LABELS, PlacementMarkers, type PlaneMaterialMode } from './diagnostics';
import { checkLocalFile, durationNote, planeSize, rgbToHex } from './media';
import { createVideoHud, type VideoTune } from './ui';

const FOV = 50;
const FRAME_MARGIN = 1.15;
const BACKGROUNDS = { dark: 0x03040a, light: 0xdfe4ec } as const;
const LOCAL_NOTE =
  'Local test only: this video stays on this device. Nothing is uploaded and no shareable link or QR is created.';
const NO_AR_MESSAGE =
  'AR placement is not available on this device or browser. This is an ordinary video preview, not placed in your room.';

/**
 * Video greeting template: one renderer, one animation loop, one upright plane whose bottom edge
 * sits at the content group's origin, placed with the shared ArPlacement. No microphone use.
 */
export function mountVideo(container: HTMLElement, config: VideoExperienceConfig): () => void {
  const s = config.settings;
  const tune: VideoTune = {
    displayHeightMeters: s.displayHeightMeters ?? VIDEO_DEFAULTS.displayHeightMeters,
    bottomOffsetMeters: s.bottomOffsetMeters ?? VIDEO_DEFAULTS.bottomOffsetMeters,
    loop: s.loop ?? VIDEO_DEFAULTS.loop,
    ...KEYING_DEFAULTS,
    ...s.keying,
    background: 'dark',
  };
  const allowLocal = s.localFile ?? VIDEO_DEFAULTS.localFile;
  const params = new URLSearchParams(window.location.search);
  const diag = params.has('diag');

  // Same context settings as the swarm template, whose AR rendering is verified on the S24.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(BACKGROUNDS.dark, 1);
  renderer.domElement.className = 'stage';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
  const floor = new THREE.GridHelper(2, 8, 0x4dd8ff, 0x2a3142);
  scene.add(floor);

  // Placement anchor: identity in the preview, the placed world transform in AR. Its origin is the
  // surface point; the plane centre sits half a video height above the bottom offset.
  const anchor = new THREE.Group();
  scene.add(anchor);
  const placeholder = new THREE.Texture();
  const material = createVideoMaterial(placeholder, tune);
  const plane = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(new THREE.PlaneGeometry(1, 1), material);
  plane.visible = false;
  anchor.add(plane);
  const markers = new PlacementMarkers(anchor);
  markers.setVisible(diag);
  const basicMaterial = new THREE.MeshBasicMaterial({ map: placeholder, side: THREE.DoubleSide, toneMapped: false });
  const solidMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
  let planeMode: PlaneMaterialMode = 'shader';
  const applyPlaneMode = () => {
    plane.material = planeMode === 'shader' ? material : planeMode === 'basic' ? basicMaterial : solidMaterial;
  };
  const ar = new ArPlacement(renderer, scene, anchor, container, 0, { noun: 'greeting', fallback: 'normal video preview' });

  let soundOn = true;
  let clip: VideoClip | null = null;
  let arSupported = false;
  let localError = '';
  let lastVideoTime = -1;

  const layout = () => {
    const aspect = clip?.aspect ?? 9 / 16;
    const size = planeSize(tune.displayHeightMeters, aspect);
    plane.scale.set(size.width, size.height, 1);
    plane.position.set(0, tune.bottomOffsetMeters + size.height / 2, 0);
    if (renderer.xr.isPresenting) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Frame the floor line and the whole rectangle above it.
    const span = tune.bottomOffsetMeters + size.height;
    const dist = Math.max((span * FRAME_MARGIN) / 2 / tanV, (Math.max(size.width, 0.5) * FRAME_MARGIN) / 2 / (tanV * camera.aspect));
    camera.position.set(0, span / 2, dist);
    camera.lookAt(0, span / 2, 0);
    camera.updateProjectionMatrix();
  };

  const statusText = (): [string, boolean] => {
    if (localError) return [localError, false];
    if (!clip) return [allowLocal ? 'Choose a local MP4 to preview it.' : '', false];
    switch (clip.state) {
      case 'loading':
        return ['Loading video…', false];
      case 'error':
        return [clip.message, true];
      case 'blocked':
        return [clip.message, false];
      case 'ended':
        return ['Finished. Tap Replay or Play to watch again.', false];
      default:
        return ['', false];
    }
  };

  const refresh = () => {
    const [text, retry] = statusText();
    hud.setStatus(text, retry);
    hud.setTransport(clip?.state ?? 'loading', soundOn);
    const notes: string[] = [];
    if (clip?.local) notes.push(LOCAL_NOTE);
    else if (s.sourceNote) notes.push(s.sourceNote);
    if (clip) {
      const d = durationNote(clip.duration);
      if (d) notes.push(d);
    }
    hud.setNote(notes.join(' '));
    hud.setSource(!!clip?.local, !!s.source);
  };

  const setClip = (source: string | File) => {
    clip?.dispose();
    clip = new VideoClip(container, source, tune.loop);
    lastVideoTime = -1;
    material.uniforms.map.value = clip.texture;
    basicMaterial.map = clip.texture;
    basicMaterial.needsUpdate = true;
    clip.onChange = () => {
      layout();
      refresh();
    };
    layout();
    refresh();
  };

  const playPause = () => {
    if (!clip) return;
    if (clip.playing) clip.pause();
    else if (ar.active && ar.state !== 'placed') return;
    else void clip.play(soundOn);
  };

  const hud = createVideoHud(container, tune, allowLocal, diag, {
    playPause,
    replay: () => {
      if (!clip || (ar.active && ar.state !== 'placed')) return;
      void clip.restart(soundOn);
    },
    toggleSound: () => {
      soundOn = !soundOn;
      clip?.setMuted(!soundOn);
      refresh();
    },
    retry: () => clip?.retry(),
    enterAr: () => {
      if (!arSupported) {
        hud.setArUnavailable(NO_AR_MESSAGE);
        return;
      }
      void ar.enter();
    },
    resetAr: () => ar.reset(),
    exitAr: () => ar.exit(),
    chooseFile: (file) => {
      const problem = checkLocalFile(file);
      if (problem) {
        localError = problem;
        refresh();
        return;
      }
      localError = '';
      if (tune.mode !== 'opaque') {
        tune.mode = 'opaque';
        hud.setTune('mode', tune.mode);
        applyKeying(material, tune);
      }
      setClip(file);
    },
    useFixture: () => {
      localError = '';
      if (s.source) setClip(s.source);
    },
    sampleKey: () => {
      if (!clip?.frameReady) return;
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const v = clip.video;
      const region = Math.max(4, Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.03));
      ctx.drawImage(v, 0, 0, region, region, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      tune.color = rgbToHex(r, g, b);
      tune.mode = 'chroma';
      hud.setTune('color', tune.color);
      hud.setTune('mode', tune.mode);
      applyKeying(material, tune);
    },
    tune: (key, value) => {
      (tune as unknown as Record<string, unknown>)[key] = value;
      if (key === 'loop') clip?.setLoop(value as boolean);
      else if (key === 'background') renderer.setClearColor(BACKGROUNDS[tune.background], 1);
      else if (key === 'displayHeightMeters' || key === 'bottomOffsetMeters') layout();
      else applyKeying(material, tune);
    },
    cyclePlaneMaterial: () => {
      planeMode = PLANE_MODES[(PLANE_MODES.indexOf(planeMode) + 1) % PLANE_MODES.length];
      applyPlaneMode();
    },
  });

  // Searching pauses and rewinds; placing starts from the beginning (with sound if allowed);
  // leaving AR pauses and returns to the working preview.
  let lastAr: ArState = 'off';
  ar.onChange = (state, message) => {
    document.documentElement.classList.toggle('ar-active', ar.active);
    floor.visible = !ar.active;
    hud.setAr(ar.active, message);
    if (state === 'searching' && lastAr !== 'ready') clip?.stop();
    if (state === 'placed') void clip?.restart(soundOn);
    if (state === 'off') {
      clip?.pause();
      layout();
    }
    lastAr = state;
    refresh();
  };
  void isArSupported().then((ok) => {
    arSupported = ok;
    if (!ok) hud.setArUnavailable(NO_AR_MESSAGE);
  });
  const blockXrSelect = (e: Event) => {
    if ((e.target as Element | null)?.closest('button, input, select, label, .tune-panel')) e.preventDefault();
  };
  container.addEventListener('beforexrselect', blockXrSelect);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') clip?.pause();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', layout);

  if (s.source) setClip(s.source);
  layout();
  refresh();

  const gl = renderer.getContext();
  const stats = { frames: 0, xrFrames: 0, renderErrors: 0, lastError: '', glError: 0 };
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const f2 = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const report = (): string => {
    const xr = renderer.xr.isPresenting;
    const xrCam = renderer.xr.getCamera();
    const view = xr ? (xrCam.cameras[0] ?? xrCam) : camera;
    view.getWorldPosition(v1);
    anchor.getWorldPosition(v2);
    plane.getWorldPosition(v3);
    viewProj.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    plane.updateWorldMatrix(true, false);
    const v = clip?.video;
    const layer = xr ? renderer.xr.getBaseLayer() : null;
    return [
      `xr ${xr ? 'on' : 'off'} ar=${ar.state} blend=${xr ? renderer.xr.getEnvironmentBlendMode() : '-'} layer=${layer ? layer.constructor.name : '-'}`,
      `frames ${stats.frames} xrFrames ${stats.xrFrames} renderErr ${stats.renderErrors} gl 0x${stats.glError.toString(16)}`,
      `anchor vis=${anchor.visible} @${f2(v2)}`,
      `camera @${f2(v1)} dist ${v1.distanceTo(v3).toFixed(2)} m`,
      `plane vis=${plane.visible} ${plane.scale.x.toFixed(2)}x${plane.scale.y.toFixed(2)} @${f2(v3)} inView=${frustum.intersectsObject(plane)}`,
      `video rs=${v?.readyState ?? '-'} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} t=${v?.currentTime.toFixed(2) ?? '-'} paused=${v?.paused ?? '-'}`,
      `texture version ${clip?.texture.version ?? 0} frameReady=${!!clip?.frameReady} state=${clip?.state ?? 'none'}`,
      `keying ${tune.mode} plane=${planeMode}`,
      stats.lastError ? `error: ${stats.lastError}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  let lastReport = 0;
  renderer.setAnimationLoop((time, frame) => {
    stats.frames++;
    if (frame) stats.xrFrames++;
    try {
      ar.update(frame);
      // Upload decoded frames from the render loop: requestVideoFrameCallback (used by
      // VideoTexture) is tied to window rendering, which may not run during an immersive session.
      const v = clip?.video;
      if (clip?.frameReady && v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        clip.texture.needsUpdate = true;
      }
      plane.visible = planeMode === 'solid' || (!!clip?.frameReady && clip.state !== 'error');
      markers.follow(plane);
      renderer.render(scene, camera);
      if (diag) {
        const e = gl.getError();
        if (e) stats.glError = e;
      }
    } catch (err) {
      // Keep the loop alive (an exception here would stop all later XR frames).
      stats.renderErrors++;
      stats.lastError = (err as Error)?.message ?? String(err);
    }
    if (diag && time - lastReport > 250) {
      lastReport = time;
      hud.setDiagnostics(report(), PLANE_MODE_LABELS[planeMode]);
    }
  });
  if (diag) hud.setDiagnostics(report(), PLANE_MODE_LABELS[planeMode]);

  const debug = params.has('debug');
  if (debug) {
    (window as unknown as Record<string, unknown>).__webar = {
      clip: () => clip,
      state: () => clip?.state ?? 'none',
      frameReady: () => !!clip?.frameReady,
      planeVisible: () => plane.visible,
      planeSize: () => ({ width: plane.scale.x, height: plane.scale.y, centerY: plane.position.y }),
      tune,
      frames: () => stats.frames,
      planeMode: () => planeMode,
      report,
      videos: () => document.querySelectorAll('video').length,
      canvases: () => document.querySelectorAll('canvas').length,
      objectUrls: liveObjectUrlCount,
      textures: () => renderer.info.memory.textures,
      ar: () => ar.state,
    };
  }

  return () => {
    container.removeEventListener('beforexrselect', blockXrSelect);
    ar.dispose();
    document.documentElement.classList.remove('ar-active');
    renderer.setAnimationLoop(null);
    clip?.dispose();
    clip = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', layout);
    hud.dispose();
    anchor.remove(plane);
    scene.remove(anchor, floor);
    markers.dispose();
    plane.geometry.dispose();
    material.dispose();
    basicMaterial.dispose();
    solidMaterial.dispose();
    placeholder.dispose();
    floor.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    if (debug) delete (window as unknown as Record<string, unknown>).__webar;
  };
}
