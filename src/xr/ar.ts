import * as THREE from 'three';

/**
 * Minimal WebXR immersive-ar placement on the shared renderer: hit-test reticle, tap (select) to
 * place `anchor` once, Reset to place again. The caller's single `setAnimationLoop` callback calls
 * `update(frame)`; three.js drives it from the XR session while presenting.
 */
export type ArState = 'off' | 'starting' | 'searching' | 'ready' | 'placed';

/** Wording for status messages, so each template names its own content and fallback. */
export interface ArWording {
  /** What gets placed, e.g. "sculpture". */
  noun: string;
  /** The non-AR view that keeps working, e.g. "fullscreen sculpture". */
  fallback: string;
}

const SWARM_WORDING: ArWording = { noun: 'sculpture', fallback: 'fullscreen sculpture' };

export async function isArSupported(): Promise<boolean> {
  try {
    return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'));
  } catch {
    return false;
  }
}

export class ArPlacement {
  state: ArState = 'off';
  onChange: (state: ArState, message: string) => void = () => undefined;

  private session: XRSession | null = null;
  private hitSource: XRHitTestSource | null = null;
  private readonly reticle: THREE.Mesh;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpCam = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly anchor: THREE.Object3D,
    private readonly overlayRoot: HTMLElement,
    private readonly heightAboveSurface: number,
    private readonly wording: ArWording = SWARM_WORDING,
  ) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7dffd8, transparent: true, opacity: 0.9 }),
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  get active(): boolean {
    return this.session !== null;
  }

  /** Call directly from a click handler so the user gesture is preserved. */
  async enter(): Promise<void> {
    if (this.session || this.state === 'starting') return;
    if (!navigator.xr) {
      this.set('off', `AR is not available in this browser. The ${this.wording.fallback} still works.`);
      return;
    }
    this.set('starting', 'Starting AR…');
    let session: XRSession;
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: this.overlayRoot },
      });
    } catch (err) {
      this.set('off', `Could not start AR (${(err as Error).name || 'error'}). The ${this.wording.fallback} still works.`);
      return;
    }
    this.session = session;
    session.addEventListener('end', this.handleEnd);
    session.addEventListener('select', this.handleSelect);
    try {
      await this.renderer.xr.setSession(session);
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitSource = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
      if (!this.hitSource) throw new Error('hit-test unavailable');
    } catch (err) {
      this.failMessage = `AR started but surface detection failed (${(err as Error).message}). Back to the ${this.wording.fallback}.`;
      void session.end().catch(() => undefined);
      return;
    }
    this.anchor.visible = false;
    this.set('searching', 'Move your phone slowly to find a surface.');
  }

  reset(): void {
    if (!this.session) return;
    this.anchor.visible = false;
    this.set('searching', 'Move your phone slowly to find a surface.');
  }

  exit(): void {
    void this.session?.end().catch(() => undefined);
  }

  update(frame: XRFrame | undefined): void {
    if (!frame || !this.hitSource || this.state === 'placed') {
      this.reticle.visible = false;
      return;
    }
    const ref = this.renderer.xr.getReferenceSpace();
    const hit = ref ? frame.getHitTestResults(this.hitSource)[0] : undefined;
    const pose = hit && ref ? hit.getPose(ref) : undefined;
    this.reticle.visible = !!pose;
    if (pose) this.reticle.matrix.fromArray(pose.transform.matrix);
    const next = pose ? 'ready' : 'searching';
    if (next !== this.state) {
      this.set(next, pose ? `Tap to place the ${this.wording.noun}.` : 'Move your phone slowly to find a surface.');
    }
  }

  dispose(): void {
    this.exit();
    this.scene.remove(this.reticle);
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
  }

  private failMessage = '';

  private readonly handleSelect = () => {
    if (this.state !== 'ready' || !this.reticle.visible) return;
    // Fixed world transform from the current hit; it never follows later hits.
    this.tmpPos.setFromMatrixPosition(this.reticle.matrix);
    this.renderer.xr.getCamera().getWorldPosition(this.tmpCam);
    this.anchor.position.set(this.tmpPos.x, this.tmpPos.y + this.heightAboveSurface, this.tmpPos.z);
    this.anchor.rotation.set(0, Math.atan2(this.tmpCam.x - this.tmpPos.x, this.tmpCam.z - this.tmpPos.z), 0);
    this.anchor.visible = true;
    this.set('placed', 'Placed. Walk around it; use Reset placement to move it.');
  };

  private readonly handleEnd = () => {
    this.hitSource?.cancel();
    this.hitSource = null;
    this.session?.removeEventListener('end', this.handleEnd);
    this.session?.removeEventListener('select', this.handleSelect);
    this.session = null;
    this.reticle.visible = false;
    this.anchor.position.set(0, 0, 0);
    this.anchor.rotation.set(0, 0, 0);
    this.anchor.visible = true;
    const msg = this.failMessage;
    this.failMessage = '';
    this.set('off', msg);
  };

  private set(state: ArState, message: string): void {
    this.state = state;
    this.onChange(state, message);
  }
}
