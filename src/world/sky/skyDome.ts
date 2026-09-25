// The sky dome: an inverted sphere parented to the camera, unlit, banded.
//
// Banded rather than smoothly graded on purpose. A smooth gradient behind a
// flat-shaded world reads as two different rendering techniques in one frame;
// five bands read as the same deliberate low-poly language as the terrain.

import * as THREE from 'three';
import vertexShader from './sky.vert.glsl?raw';
import fragmentShader from './sky.frag.glsl?raw';
import type { SkyState, Rgb } from './skyPalette';

const setRgb = (c: THREE.Color, v: Rgb): void => {
  c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
};

/** Large enough to sit beyond anything on the island. */
const DOME_RADIUS = 600;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly horizon = new THREE.Color();
  private readonly zenith = new THREE.Color();

  constructor() {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uHorizon: { value: this.horizon },
        uZenith: { value: this.zenith },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material);
    this.mesh.name = 'sky-dome';
    // Drawn first, never occludes, never culled by its own tiny radius.
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(DOME_RADIUS);
  }

  apply(state: SkyState): void {
    setRgb(this.horizon, state.background);
    // Zenith is the background pulled down toward the night colour, so the top
    // of the dome is always the cooler end. Keeps depth without a second hex.
    this.zenith.copy(this.horizon).multiplyScalar(0.72);
  }

  /** Keeps the dome centred on the camera so it can never be walked out of. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
