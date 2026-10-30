import * as THREE from 'three';

/** Temporary AR diagnostics (`&diag`): what the plane is drawn with. */
export type PlaneMaterialMode = 'shader' | 'basic' | 'solid';
export const PLANE_MODES: readonly PlaneMaterialMode[] = ['shader', 'basic', 'solid'];
export const PLANE_MODE_LABELS: Record<PlaneMaterialMode, string> = {
  shader: 'video, keying shader',
  basic: 'video, plain material',
  solid: 'solid magenta, no video',
};

/**
 * A magenta outline around the plane rectangle and a cyan cube at the anchor origin, both
 * children of the same anchor and drawn without depth test, so they show where the greeting
 * should be independently of the video texture, the shader and the first-frame gate.
 */
export class PlacementMarkers {
  readonly outline: THREE.LineSegments;
  readonly origin: THREE.Mesh;

  constructor(private readonly anchor: THREE.Object3D) {
    const square = new THREE.PlaneGeometry(1, 1);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(square),
      new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true }),
    );
    square.dispose();
    this.origin = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false, transparent: true }),
    );
    for (const o of [this.outline, this.origin]) {
      o.renderOrder = 10;
      o.visible = false;
      anchor.add(o);
    }
  }

  setVisible(on: boolean): void {
    this.outline.visible = on;
    this.origin.visible = on;
  }

  follow(plane: THREE.Object3D): void {
    this.outline.position.copy(plane.position);
    this.outline.scale.set(plane.scale.x * 1.04, plane.scale.y * 1.04, 1);
  }

  dispose(): void {
    this.anchor.remove(this.outline, this.origin);
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    this.origin.geometry.dispose();
    (this.origin.material as THREE.Material).dispose();
  }
}
