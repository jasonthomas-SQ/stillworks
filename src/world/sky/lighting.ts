// Applies a SkyState to the scene. One directional sun, one hemisphere light,
// fog and background — and nothing else. No second light pretends to be a
// shaft; the shaft is the sun clearing the rims.
//
// three 0.186 is past the physical-lighting cutover, so intensities are ~3 for
// the sun and ~1 for the hemisphere, not 0.5/0.2.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { SkyState, Rgb } from './skyPalette';

const setRgb = (c: THREE.Color, v: Rgb): void => {
  c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
};

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
    // Flat-shaded geometry acnes badly without this.
    this.sun.shadow.normalBias = CONFIG.render.shadowNormalBias;
    this.sun.shadow.bias = CONFIG.render.shadowBias;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    scene.add(this.hemi);

    this.fog = new THREE.Fog(0x000000, CONFIG.render.fogNear, CONFIG.render.fogFar);
    scene.fog = this.fog;
    scene.background = new THREE.Color();
  }

  /**
   * Writes the state. Colours are mutated in place rather than reallocated —
   * this runs every frame.
   */
  apply(
    state: SkyState,
    sunDir: [number, number, number],
    scene: THREE.Scene,
    heroX: number,
    heroY: number,
    heroZ: number,
  ): void {
    setRgb(this.sun.color, state.sunColour);
    this.sun.intensity = state.sunIntensity;
    this.sun.visible = state.sunIntensity > 0.001;

    // Park the light along the sun direction from the hero, far enough back
    // that the shadow camera's near plane clears the terrain.
    const d = 140;
    this.sun.position.set(heroX + sunDir[0] * d, heroY + sunDir[1] * d, heroZ + sunDir[2] * d);

    setRgb(this.hemi.color, state.hemiSky);
    setRgb(this.hemi.groundColor, state.hemiGround);
    this.hemi.intensity = state.hemiIntensity;

    setRgb(this.fog.color, state.fogColour);
    if (scene.background instanceof THREE.Color) {
      setRgb(scene.background, state.background);
    }
  }
}
