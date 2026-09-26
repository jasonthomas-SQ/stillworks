// Water: a fully owned ShaderMaterial, not an injection.
//
// The look is bespoke and nothing about three's built-in lighting is wanted —
// the brief rules out glossy materials, so there is no specular and no
// reflection. Depth is carried by three colour bands cut from the summed-sine
// wave height, which is the same flat-colour language as the terrain.
//
// Two meshes, one material. The pool and the sea are ONE surface because
// Kettle's mouth is open to the sea; the stream is a separate ribbon because it
// follows the ground down the gorge.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import { groundHeightAt } from '../island/heightfield';
import type { SkyState } from '../sky/skyPalette';
import vertexShader from './water.vert.glsl?raw';
import fragmentShader from './water.frag.glsl?raw';

const hexColour = (h: string): THREE.Color => new THREE.Color(h);

export function createWaterMaterial(): THREE.ShaderMaterial {
  const P = CONFIG.palette;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        // Deep is the gorge's own green; shallow lifts toward moss so the
        // water belongs to the place rather than sitting on top of it.
        uDeep: { value: hexColour(P.fernDeep) },
        uShallow: { value: hexColour(P.mossLight).lerp(hexColour(P.steamGrey), 0.45) },
        uCrest: { value: hexColour(P.steamGrey) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColour: { value: new THREE.Color(1, 1, 1) },
        uSunIntensity: { value: 3 },
      },
    ]),
  });
}

/**
 * The stream: a ribbon of quads following the ground from the head of Fernwell
 * down into the pool. World Bible §7 runs it "the length of Fernwell into the
 * stair pool"; §5 puts the channel from c7 r5 south.
 */
function buildStreamGeometry(): THREE.BufferGeometry {
  const path: [number, number][] = [];
  // From c7 r5 south to the pool, drifting slightly west onto the stair.
  for (let z = 45; z <= 112; z += 1) {
    const t = (z - 45) / (112 - 45);
    const x = 65 - 5 * t + Math.sin(t * 7) * 2.2;
    path.push([x, z]);
  }

  const halfWidth = 1.6;
  const positions: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i]!;
    const [x1, z1] = path[i + 1]!;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * halfWidth;
    const nz = (dx / len) * halfWidth;

    const corners: [number, number][] = [
      [x0 - nx, z0 - nz],
      [x0 + nx, z0 + nz],
      [x1 + nx, z1 + nz],
      [x1 - nx, z1 - nz],
    ];
    const y = corners.map(([cx, cz]) => groundHeightAt(cx, cz) + 0.12);

    // Two triangles, wound counter-clockwise seen from above.
    for (const [a, b, c] of [
      [0, 2, 1],
      [0, 3, 2],
    ] as const) {
      for (const k of [a, b, c]) {
        positions.push(corners[k]![0], y[k]!, corners[k]![1]);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class Water {
  readonly sea: THREE.Mesh;
  readonly stream: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = createWaterMaterial();

    // One plane for the pool and the open sea. 3 m quads: the shortest wave is
    // 2.6 m, so anything coarser would alias the sines away.
    const seaGeometry = new THREE.PlaneGeometry(420, 420, 140, 140);
    this.sea = new THREE.Mesh(seaGeometry, this.material);
    this.sea.name = 'water-sea';
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(60, CONFIG.units.waterY, 150);
    this.sea.receiveShadow = false;
    this.sea.castShadow = false;

    this.stream = new THREE.Mesh(buildStreamGeometry(), this.material);
    this.stream.name = 'water-stream';
    this.stream.receiveShadow = false;
    this.stream.castShadow = false;
  }

  update(elapsed: number, state: SkyState, sunDir: [number, number, number]): void {
    const u = this.material.uniforms;
    u.uTime!.value = elapsed;
    (u.uSunDir!.value as THREE.Vector3).set(sunDir[0], sunDir[1], sunDir[2]);
    (u.uSunColour!.value as THREE.Color).setRGB(
      state.sunColour[0],
      state.sunColour[1],
      state.sunColour[2],
      THREE.SRGBColorSpace,
    );
    u.uSunIntensity!.value = state.sunIntensity;
  }

  dispose(): void {
    this.sea.geometry.dispose();
    this.stream.geometry.dispose();
    this.material.dispose();
  }
}
