import * as THREE from 'three';

/**
 * Opt-in AR isolation flags for the S24 investigation, one variable each (URL parameters):
 * - `layer=legacy`  force three's legacy XRWebGLLayer instead of an XRProjectionLayer.
 * - `overlay=hud`   DOM overlay root is a HUD-only element; the WebGL canvas is outside it.
 * - `stage=visible` do not hide the canvas (`.stage`) with CSS while AR is active.
 * Without these flags behaviour is unchanged.
 */
export interface XrTestFlags {
  legacyLayer: boolean;
  hudOnlyOverlay: boolean;
  stageVisible: boolean;
}

export function readXrTestFlags(params = new URLSearchParams(window.location.search)): XrTestFlags {
  return {
    legacyLayer: params.get('layer') === 'legacy',
    hudOnlyOverlay: params.get('overlay') === 'hud',
    stageVisible: params.get('stage') === 'visible',
  };
}

export function describeFlags(f: XrTestFlags): string {
  const on = [f.legacyLayer && 'layer=legacy', f.hudOnlyOverlay && 'overlay=hud', f.stageVisible && 'stage=visible'].filter(Boolean);
  return on.length ? on.join(' ') : 'none (default path)';
}

/**
 * three r185 picks an XRProjectionLayer whenever `XRWebGLBinding` exists when the renderer (and its
 * WebXRManager) is constructed. For `layer=legacy` the global is hidden only for the duration of the
 * synchronous constructor and restored immediately, so this renderer uses XRWebGLLayer and nothing
 * else on the page is affected. No prototype is modified.
 */
export function createXrRenderer(params: THREE.WebGLRendererParameters, flags: XrTestFlags): THREE.WebGLRenderer {
  const g = globalThis as Record<string, unknown>;
  const desc = flags.legacyLayer ? Object.getOwnPropertyDescriptor(g, 'XRWebGLBinding') : undefined;
  if (desc) delete g.XRWebGLBinding;
  try {
    return new THREE.WebGLRenderer(params);
  } finally {
    if (desc) Object.defineProperty(g, 'XRWebGLBinding', desc);
  }
}

/** The element passed as the DOM overlay root: the whole player, or a HUD-only child of it. */
export function overlayRootFor(container: HTMLElement, flags: XrTestFlags): HTMLElement {
  if (!flags.hudOnlyOverlay) return container;
  const root = document.createElement('div');
  root.className = 'ar-overlay-root';
  container.append(root);
  return root;
}

export function applyStageFlag(flags: XrTestFlags): () => void {
  document.documentElement.classList.toggle('ar-stage-visible', flags.stageVisible);
  return () => document.documentElement.classList.remove('ar-stage-visible');
}

export function layerReport(renderer: THREE.WebGLRenderer): string {
  const binding = typeof XRWebGLBinding !== 'undefined';
  const proj = binding && 'createProjectionLayer' in XRWebGLBinding.prototype;
  const session = renderer.xr.getSession();
  if (!session) return `layer - (XRWebGLBinding ${binding ? 'yes' : 'no'}, createProjectionLayer ${proj ? 'yes' : 'no'})`;
  const layer = renderer.xr.getBaseLayer();
  const rs = session.renderState as XRRenderState & { layers?: unknown[] };
  return `layer ${layer ? layer.constructor.name : 'none'} (renderState layers=${rs.layers?.length ?? 0} baseLayer=${rs.baseLayer ? 'yes' : 'no'})`;
}

export function sessionReport(renderer: THREE.WebGLRenderer, overlayRoot: HTMLElement): string {
  const session = renderer.xr.getSession() as (XRSession & { enabledFeatures?: string[]; domOverlayState?: { type: string } }) | null;
  const canvas = renderer.domElement;
  return [
    `blend ${session?.environmentBlendMode ?? '-'} domOverlay ${session?.domOverlayState?.type ?? '-'} features ${session?.enabledFeatures?.join(',') ?? '-'}`,
    `canvas inOverlayRoot=${overlayRoot.contains(canvas)} visibility=${getComputedStyle(canvas).visibility} ${canvas.width}x${canvas.height}`,
  ].join('\n');
}
