import * as THREE from 'three';
import type { ExperienceConfig } from './config';

const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_DELTA = 0.1;

/** Milestone 1 stand-in for the swarm template: a slowly rotating wireframe in the configured palette. */
export function mountPlaceholder(container: HTMLElement, config: ExperienceConfig): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x05060a, 1);
  renderer.domElement.className = 'stage';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
  camera.position.set(0, 0, 2.2);

  const palette = config.settings.palette.map((c) => new THREE.Color(c));
  const radius = config.settings.diameterMeters / 2;

  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  palette.forEach((color, i) => {
    const geometry = new THREE.IcosahedronGeometry(radius * (1 - i * 0.22), 1);
    const material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(i * 0.6, i * 0.9, 0);
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  });
  scene.add(group);

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME_DELTA);
    group.rotation.y += dt * 0.4;
    group.children.forEach((child, i) => {
      child.rotation.x += dt * 0.15 * (i + 1);
    });
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    timer.dispose();
    window.removeEventListener('resize', resize);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
}
