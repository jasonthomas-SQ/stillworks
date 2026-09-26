// Tree ferns and ground cover, both instanced, both swaying through the one
// injection in world/shaders/injections.ts.
//
// World Bible §9 marks ground ferns as a CC0 pack line. They are code-built
// instead: a four-triangle tuft is twenty lines, instances for free, and is
// guaranteed to match the palette. A pack would cost a download, a licences
// file, an offline inspection pass, a material policy and a scale mapping, all
// to make imported geometry sit next to primitives that are already in frame.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import { applySway } from '../shaders/injections';
import { scatterPoints, ringPoints, type ScatterPoint } from './scatter';
import { cellCentre } from '../../data/kettle';
import { makeRng } from '../../core/math/rng';

const P = CONFIG.palette;

/** Adds the per-vertex sway weight the injection reads. 0 holds still. */
function withSwayWeight(geometry: THREE.BufferGeometry, weights: number[]): void {
  geometry.setAttribute('aSwayWeight', new THREE.Float32BufferAttribute(weights, 1));
}

/**
 * A tree fern: a trunk cylinder and eight frond planes on a radial fan.
 * §4-B puts them six to nine metres with crowns overlapping.
 */
function buildTreeFernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const weights: number[] = [];

  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 6.4, 7, 1);
  trunk.translate(0, 3.2, 0);
  parts.push(trunk);
  // Trunks do not move. The weight ramps only a little at the very top, where
  // the crown meets the trunk, so there is no visible hinge.
  const tp = trunk.getAttribute('position');
  for (let i = 0; i < tp.count; i++) {
    weights.push(Math.max(0, (tp.getY(i) - 5.4) / 1.0) * 0.25);
  }

  for (let f = 0; f < 8; f++) {
    const frond = new THREE.PlaneGeometry(0.85, 3.4, 1, 3);
    frond.translate(0, 1.7, 0);
    frond.rotateX(-Math.PI / 2 + 0.55);
    frond.rotateZ(0.2);
    frond.translate(0, 6.3, 0);
    frond.rotateY((f / 8) * Math.PI * 2);
    parts.push(frond);

    const fp = frond.getAttribute('position');
    for (let i = 0; i < fp.count; i++) {
      // Weight by distance from the crown centre: tips move most.
      const r = Math.hypot(fp.getX(i), fp.getZ(i));
      weights.push(Math.min(1, r / 2.6));
    }
  }

  const merged = mergeGeometries(parts);
  withSwayWeight(merged, weights);
  for (const p of parts) p.dispose();
  return merged;
}

/** A ground tuft: four triangles, rooted at the base. */
function buildTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const dx = Math.cos(a) * 0.16;
    const dz = Math.sin(a) * 0.16;
    positions.push(-dz * 0.6, 0, dx * 0.6, dz * 0.6, 0, -dx * 0.6, dx * 1.6, 0.42, dz * 1.6);
    weights.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  withSwayWeight(g, weights);
  return g;
}

/** Minimal geometry merge — enough for position-only parts, no addon needed. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const nonIndexed = part.index ? part.toNonIndexed() : part;
    const p = nonIndexed.getAttribute('position');
    const n = nonIndexed.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
    }
    if (nonIndexed !== part) nonIndexed.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

function instance(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  points: ScatterPoint[],
  castShadow: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const phases = new Float32Array(points.length);

  points.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
    pos.set(p.x, p.y, p.z);
    scale.setScalar(p.scale);
    mesh.setMatrixAt(i, m.compose(pos, q, scale));
    phases[i] = p.phase;
  });

  // Per-instance sway phase, so a stand of ferns is never in lockstep.
  geometry.setAttribute('aSwayPhase', new THREE.InstancedBufferAttribute(phases, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

export class Ferns {
  readonly treeFerns: THREE.InstancedMesh;
  readonly groundCover: THREE.InstancedMesh;
  readonly treeFernCount: number;
  readonly groundCoverCount: number;

  constructor() {
    // Keep clear of the twelve discovery pads and the four character spots, so
    // nothing important ends up inside a fern.
    const keepClear = [
      { cell: [6, 11], r: 5 },
      { cell: [5, 8], r: 4 },
      { cell: [7, 7], r: 7 },
      { cell: [11, 7], r: 5 },
      { cell: [10, 7], r: 5 },
      { cell: [11, 8], r: 4 },
      { cell: [7, 3], r: 5 },
      { cell: [6, 5], r: 5 },
      { cell: [3, 6], r: 4 },
      { cell: [3, 8], r: 4 },
      { cell: [2, 3], r: 5 },
      { cell: [2, 2], r: 5 },
      { cell: [5, 12], r: 6 }, // the landing stage the player starts on
    ].map(({ cell, r }) => {
      const [x, z] = cellCentre(cell[0]!, cell[1]!);
      return { x, z, radius: r };
    });

    // The stream channel, so ferns do not stand in running water.
    const stream: { x: number; z: number; radius: number }[] = [];
    for (let z = 45; z <= 112; z += 4) {
      const t = (z - 45) / (112 - 45);
      stream.push({ x: 65 - 5 * t, z, radius: 3 });
    }
    const exclusions = [...keepClear, ...stream];

    const stands = scatterPoints({
      seed: CONFIG.seed + 301,
      count: 96,
      zones: ['B'],
      maxGradient: 0.35,
      minScale: 0.85,
      maxScale: 1.35,
      minSpacing: 3.4,
      exclusions,
    });

    // §4-B: eleven tree ferns in a ring wide enough to be a room, at c7 r7.
    const cathedral = ringPoints(...cellCentre(7, 7), 8.5, 11, CONFIG.seed + 302);

    const treeMaterial = new THREE.MeshLambertMaterial({
      color: new THREE.Color(P.fernDeep),
      flatShading: true,
      side: THREE.DoubleSide,
    });
    applySway(treeMaterial, { amplitude: 0.42, period: 7.5 });

    const treePoints = [...stands, ...cathedral];
    this.treeFernCount = treePoints.length;
    this.treeFerns = instance(buildTreeFernGeometry(), treeMaterial, treePoints, true);
    this.treeFerns.name = 'tree-ferns';

    const groundPoints = scatterPoints({
      seed: CONFIG.seed + 303,
      count: 5200,
      zones: ['A', 'B', 'C', 'E'],
      maxGradient: 0.4,
      minScale: 0.7,
      maxScale: 1.5,
      exclusions: keepClear,
    });
    this.groundCoverCount = groundPoints.length;

    const rng = makeRng(CONFIG.seed + 304);
    void rng;
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: new THREE.Color(P.mossLight),
      flatShading: true,
      side: THREE.DoubleSide,
    });
    applySway(groundMaterial, { amplitude: 0.09, period: 3.1 });

    // Ground cover never casts: a shadow pass re-draws the scene, and 5,200
    // tufts are not worth doubling it for.
    this.groundCover = instance(buildTuftGeometry(), groundMaterial, groundPoints, false);
    this.groundCover.name = 'ground-cover';
  }

  dispose(): void {
    for (const m of [this.treeFerns, this.groundCover]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
