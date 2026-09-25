// Shim's body: twelve primitives, exactly the Character Bible §1 shapes table.
// Three limbs — two legs and one folding tool-arm. Nothing here decides how
// Shim moves; it only writes the pose shimPose computed.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Pose } from './shimPose';

const P = CONFIG.palette;

/** Darken a palette colour to a fraction of its value, per the bible's table. */
function value(hex: string, factor: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, hsl.l * factor);
  return c;
}

const flat = (color: THREE.Color | string): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, flatShading: true });

function capsule(radius: number, length: number, colour: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 2, 8), colour);
  mesh.castShadow = true;
  return mesh;
}

export class ShimView {
  readonly root = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly collar: THREE.Mesh;
  private readonly tuft: THREE.Mesh;
  private readonly lensDisc: THREE.Mesh;
  private readonly armUpper: THREE.Group;
  private readonly armFore: THREE.Group;
  private readonly legPivots: THREE.Group[] = [];
  private readonly shinPivots: THREE.Group[] = [];
  private readonly feet: THREE.Mesh[] = [];

  constructor() {
    const brass = flat(P.brassWarm);
    const dark = flat(P.fernDeep);
    const legMat = flat(value(P.fernDeep, 0.8));
    const lensMat = flat(value(P.brassWarm, 0.6));
    const ringMat = flat(P.steamGrey);

    this.root.name = 'shim';

    // ---- body: a squashed sphere, the egg ----
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), brass);
    body.scale.set(1, 0.88, 0.94);
    body.castShadow = true;
    this.bodyPivot.add(body);

    // ---- collar: dark and generous, what separates Shim from the ruins ----
    this.collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 6, 14), dark);
    this.collar.rotation.x = Math.PI / 2 - THREE.MathUtils.degToRad(8);
    this.collar.position.y = 0.02;
    this.collar.castShadow = true;
    this.bodyPivot.add(this.collar);

    // ---- moss tuft: on the collar's rear, lags every turn ----
    this.tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 7), dark);
    this.tuft.position.set(0, 0.04, 0.2);
    this.tuft.castShadow = true;
    this.bodyPivot.add(this.tuft);

    // ---- lens: offset forward, and that offset IS the facing cue ----
    this.lensDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.02, 12),
      lensMat,
    );
    this.lensDisc.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(12);
    this.lensDisc.position.set(0, 0.02, -0.15);
    this.lensDisc.castShadow = true;
    this.bodyPivot.add(this.lensDisc);

    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 5, 12), ringMat);
    lensRing.rotation.copy(this.lensDisc.rotation);
    lensRing.position.copy(this.lensDisc.position);
    lensRing.castShadow = true;
    this.bodyPivot.add(lensRing);

    // ---- tool-arm: folded against the right flank at rest ----
    this.armUpper = new THREE.Group();
    this.armUpper.position.set(0.14, 0, 0.02);
    const upper = capsule(0.028, 0.11, brass);
    upper.position.y = -0.055;
    this.armUpper.add(upper);

    this.armFore = new THREE.Group();
    this.armFore.position.y = -0.11;
    const fore = capsule(0.024, 0.1, brass);
    fore.position.y = -0.05;
    this.armFore.add(fore);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.04), brass);
    hand.position.y = -0.105;
    hand.castShadow = true;
    this.armFore.add(hand);

    this.armUpper.add(this.armFore);
    this.bodyPivot.add(this.armUpper);

    this.bodyPivot.position.y = 0.45;
    this.root.add(this.bodyPivot);

    // ---- legs: TWO legs, four capsules. Not four legs. ----
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, 0.45, 0);

      const thigh = capsule(0.032, 0.19, legMat);
      thigh.position.y = -0.095;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.19;
      const shin = capsule(0.026, 0.18, legMat);
      shin.position.y = -0.09;
      knee.add(shin);

      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.022, 8),
        legMat,
      );
      foot.position.y = -0.19;
      foot.castShadow = true;
      knee.add(foot);

      hip.add(knee);
      this.root.add(hip);
      this.legPivots.push(hip);
      this.shinPivots.push(knee);
      this.feet.push(foot);
    }
  }

  /** Writes a pose. No allocation per frame. */
  write(pose: Pose, x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;

    this.bodyPivot.position.y = pose.bodyY;
    this.bodyPivot.rotation.x = pose.bodyPitch;

    this.tuft.rotation.y = pose.tuftYaw;
    this.tuft.rotation.x = pose.tuftPitch;

    // The iris: the inner disc shrinks and opens. The ring does not move.
    this.lensDisc.scale.set(pose.irisScale, 1, pose.irisScale);

    // Folded flat against the flank at 0, reaching down to a leg joint at 1.
    this.armUpper.rotation.z = -0.35 + pose.armFold * 0.9;
    this.armUpper.rotation.x = pose.armFold * 0.5;
    this.armFore.rotation.x = -2.2 + pose.armFold * 1.5;

    for (let i = 0; i < 2; i++) {
      const leg = pose.legs[i]!;
      this.legPivots[i]!.rotation.x = leg.thighPitch;
      this.shinPivots[i]!.rotation.x = leg.shinPitch;
      this.feet[i]!.position.y = -0.19 + leg.footY;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
