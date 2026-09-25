// Scaffold placeholder. Wren replaces this in milestone 1 with the real
// bootstrap (renderer, game, UI, loop). It exists so the deploy pipeline has
// something visible to prove itself on: a flat-shaded ground and a brass shape
// under the palette's noon sky, seen from the fixed elevated camera angle.
import * as THREE from 'three';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#BFD7D2');

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const pitch = THREE.MathUtils.degToRad(50);
const distance = 18;
camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
camera.lookAt(0, 0, 0);

const sun = new THREE.DirectionalLight('#FFF4E0', 3);
sun.position.set(6, 12, 4);
scene.add(sun);
scene.add(new THREE.HemisphereLight('#BFD7D2', '#2E4A38', 1));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40, 8, 8),
  new THREE.MeshLambertMaterial({ color: '#7FA35C', flatShading: true }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const shape = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.6, 0),
  new THREE.MeshLambertMaterial({ color: '#C8973F', flatShading: true }),
);
shape.position.y = 0.6;
scene.add(shape);

function resize(): void {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((time) => {
  shape.rotation.y = time * 0.0005;
  renderer.render(scene, camera);
});
