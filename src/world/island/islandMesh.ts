// Wraps the pure island geometry in a three mesh. Nothing else belongs here:
// every decision about shape and colour lives in islandMesh.geometry.ts and
// terrainColour.ts, where it can be tested in Node.

import * as THREE from 'three';
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
