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
  // World Bible §7 wants one shadow-casting sun through cliff geometry: the
  // walls must actually shade the floor on screen, not just in the light probe.
  // With this false the probe was guarding geometry the renderer never drew.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
