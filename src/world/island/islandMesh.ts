// Wraps the pure island geometry in a three mesh. Nothing else belongs here:
// every decision about shape and colour lives in islandMesh.geometry.ts and
// terrainColour.ts, where it can be tested in Node.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import { buildIslandGeometry } from './islandMesh.geometry';

export function buildIslandMesh(): THREE.Mesh {
  const { positions, colors } = buildIslandGeometry();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'island';
  mesh.castShadow = false; // the terrain is the shadow receiver, not a caster
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * M1 stand-in for the water. One flat plane at the water line, covering the
 * pool, the gorge mouth and the open sea as one surface — the mouth is open, so
 * they genuinely are one surface. Replaced by the banded shader in M2.
 */
export function buildWaterStandIn(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(600, 600, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(CONFIG.palette.steamGrey),
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water-standin';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(60, CONFIG.units.waterY, 160);
  return mesh;
}
