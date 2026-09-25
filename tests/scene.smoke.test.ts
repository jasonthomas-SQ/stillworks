import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildIslandMesh } from '../src/world/island/islandMesh';
import { FollowCamera } from '../src/core/camera/followCamera';
import { initialHeroState } from '../src/entities/shim/heroController';
import { CONFIG } from '../src/config';

// Scene-assembly smoke tests. These import three, so they are not pure — they
// run headless in Node because nothing here touches WebGL or the DOM: building
// geometry, computing bounds and testing a frustum are all CPU maths.
//
// Honest note on scope, after the M1 visual check: these assertions would NOT
// have caught the bug that failed it. The island's bounds, position and height
// were all correct; every triangle was simply wound backwards, so FrontSide
// culling removed it. The assertion that catches that lives in
// islandMesh.test.ts ("winds every triangle so its normal points up"). These
// tests cover a different and also-real failure mode — geometry built in the
// wrong coordinate frame, or framed out of view — and both are worth having.

describe('scene assembly at the start cell', () => {
  const island = buildIslandMesh();
  island.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(island);
  const hero = initialHeroState();

  it('puts the island where the world grid says it is', () => {
    expect(bounds.min.x).toBeCloseTo(0, 1);
    expect(bounds.min.z).toBeCloseTo(0, 1);
    expect(bounds.max.x).toBeCloseTo(120, 1);
    expect(bounds.max.z).toBeCloseTo(120, 1);
  });

  it('contains the hero start position in XZ', () => {
    expect(hero.x).toBeGreaterThan(bounds.min.x);
    expect(hero.x).toBeLessThan(bounds.max.x);
    expect(hero.z).toBeGreaterThan(bounds.min.z);
    expect(hero.z).toBeLessThan(bounds.max.z);
  });

  it('puts the hero on the island surface, not above or below it', () => {
    expect(hero.y).toBeGreaterThan(bounds.min.y);
    expect(hero.y).toBeLessThan(bounds.max.y);
  });

  it('gives the island a bounding sphere that covers every vertex', () => {
    // A wrong or stale bounding sphere frustum-culls the whole mesh. Checked
    // against real vertices, not Box3 corners — a box corner is a composite of
    // three extremes and need not be a vertex at all.
    const sphere = island.geometry.boundingSphere;
    expect(sphere).not.toBeNull();

    const pos = island.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < pos.count; i += 13) {
      v.fromBufferAttribute(pos, i);
      worst = Math.max(worst, sphere!.center.distanceTo(v));
    }
    expect(worst).toBeLessThanOrEqual(sphere!.radius + 1e-3);
  });

  it('frames the island in the camera frustum at start', () => {
    const follow = new FollowCamera();
    follow.snapTo(hero);
    follow.camera.aspect = 16 / 9;
    follow.camera.updateProjectionMatrix();
    follow.camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        follow.camera.projectionMatrix,
        follow.camera.matrixWorldInverse,
      ),
    );
    expect(frustum.intersectsBox(bounds)).toBe(true);
    expect(frustum.intersectsObject(island)).toBe(true);
  });

  it('points the camera at ground the hero is standing on', () => {
    const follow = new FollowCamera();
    follow.snapTo(hero);
    follow.camera.updateMatrixWorld(true);

    // The camera sits above and behind, looking down and forward at the hero.
    expect(follow.camera.position.y).toBeGreaterThan(hero.y);
    const toHero = new THREE.Vector3(hero.x, hero.y, hero.z).sub(follow.camera.position);
    expect(toHero.length()).toBeLessThan(CONFIG.camera.distance + 2);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(follow.camera.quaternion);
    expect(forward.dot(toHero.normalize())).toBeGreaterThan(0.9);
  });

  it('keeps the island inside the camera far plane', () => {
    const follow = new FollowCamera();
    follow.snapTo(hero);
    const furthest = Math.max(
      follow.camera.position.distanceTo(bounds.min),
      follow.camera.position.distanceTo(bounds.max),
    );
    expect(furthest).toBeLessThan(CONFIG.camera.far);
  });

  it('renders the island as a front-facing, shadow-receiving surface', () => {
    const material = island.material as THREE.MeshLambertMaterial;
    expect(material.side).toBe(THREE.FrontSide);
    expect(island.receiveShadow).toBe(true);
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(true);
  });
});
