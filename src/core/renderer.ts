// WebGLRenderer setup, deliberately rather than copied from a template.
//
// three 0.186.1 verified: outputColorSpace already defaults to SRGBColorSpace
// and toneMapping to NoToneMapping, and useLegacyLights is gone — we are past
// the physical-light cutover, so sun intensity is ~3 and hemisphere ~1, not
// 0.5/0.2. Both defaults are correct for a flat-colour palette, so they are
// asserted here rather than reassigned, and the assertion is the thing that
// would notice a renderer bump changing them.

import * as THREE from 'three';
import { CONFIG } from '../config';

export type RendererBundle = {
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
  /** Pixel ratio actually in use, for the stats overlay. */
  pixelRatio: () => number;
};

export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.dprCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Defaults at 0.186.1, correct for a flat-colour palette. Left alone on
  // purpose; do not "fix" these without re-reading the colour-management docs.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.dprCap));
    renderer.setSize(w, h, false);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  return {
    renderer,
    pixelRatio: () => renderer.getPixelRatio(),
    dispose: () => {
      observer.disconnect();
      renderer.dispose();
    },
  };
}

/** Keeps a camera's aspect in step with the canvas. Called from the loop. */
export function syncCameraToCanvas(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): void {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  if (Math.abs(camera.aspect - aspect) < 1e-6) return;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
