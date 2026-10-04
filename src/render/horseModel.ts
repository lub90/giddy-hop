import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Horse } from '../game/horse';
import type { Track } from '../game/track';
import { MAX_PITCH, type CelebrationPose } from './celebration';

interface Leg {
  pivot: THREE.Group;
  phase: number;
  front: boolean;
}

const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

/**
 * Low-poly horse built from boxes, facing -z in local space with its feet at y = 0.
 * Animated procedurally from the simulation state (gait phase, speed, jump).
 */
export class HorseModel {
  readonly root = new THREE.Group();
  /** Offset of the rider's eyes relative to `root` (local space, before bobbing). */
  static readonly EYE = new THREE.Vector3(0, 2.95, 0.45);
  /** Pivot for rearing up: the hind hips (local space). */
  static readonly HIND_HIP = new THREE.Vector3(0, 1.05, 0.75);

  /** Current vertical bob of the body (m), used by the rider camera. */
  bob = 0;
  /** Current yaw (radians, track heading + steering angle). */
  yaw = 0;

  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly legs: Leg[] = [];

  constructor(coat: string, mane: string, cloth: string) {
    const coatMat = new THREE.MeshLambertMaterial({ color: coat });
    const maneMat = new THREE.MeshLambertMaterial({ color: mane });
    const clothMat = new THREE.MeshLambertMaterial({ color: cloth });
    const leatherMat = new THREE.MeshLambertMaterial({ color: '#5a3518' });
    const hoofMat = new THREE.MeshLambertMaterial({ color: '#2a2018' });

    this.root.add(this.body);

    const torso = box(0.75, 0.8, 2.0, coatMat);
    torso.position.set(0, 1.35, 0);
    this.body.add(torso);

    const saddleCloth = box(0.82, 0.5, 0.75, clothMat);
    saddleCloth.position.set(0, 1.55, 0.15);
    this.body.add(saddleCloth);
    const saddle = box(0.55, 0.12, 0.6, leatherMat);
    saddle.position.set(0, 1.8, 0.15);
    this.body.add(saddle);

    // Neck pivots at the withers so it can nod.
    this.neck.position.set(0, 1.5, -0.85);
    this.body.add(this.neck);
    const neckMesh = box(0.3, 0.95, 0.4, coatMat);
    neckMesh.position.set(0, 0.4, -0.2);
    neckMesh.rotation.x = -0.75;
    this.neck.add(neckMesh);
    const maneMesh = box(0.07, 0.95, 0.14, maneMat);
    maneMesh.position.set(0, 0.5, -0.05);
    maneMesh.rotation.x = -0.75;
    this.neck.add(maneMesh);

    const head = box(0.32, 0.34, 0.75, coatMat);
    head.position.set(0, 0.7, -0.85);
    head.rotation.x = -0.45;
    this.neck.add(head);
    const muzzle = box(0.28, 0.26, 0.2, maneMat);
    muzzle.position.set(0, 0.55, -1.22);
    muzzle.rotation.x = -0.45;
    this.neck.add(muzzle);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), coatMat);
      ear.position.set(side * 0.1, 0.97, -0.6);
      this.neck.add(ear);
    }

    const tail = box(0.12, 0.8, 0.14, maneMat);
    tail.position.set(0, 1.15, 1.1);
    tail.rotation.x = 0.35;
    this.body.add(tail);

    const legSpecs: Array<[number, number, number, boolean]> = [
      [-0.25, -0.75, 0, true],
      [0.25, -0.75, 0.35, true],
      [-0.25, 0.75, Math.PI, false],
      [0.25, 0.75, Math.PI + 0.35, false],
    ];
    for (const [x, z, phase, front] of legSpecs) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.05, z);
      const leg = box(0.17, 1.0, 0.17, coatMat);
      leg.position.y = -0.5;
      const hoof = box(0.19, 0.1, 0.2, hoofMat);
      hoof.position.y = -1.0;
      pivot.add(leg, hoof);
      this.body.add(pivot);
      this.legs.push({ pivot, phase, front });
    }
  }

  /** Places and animates the model according to the simulation state. */
  sync(horse: Horse, track: Track, celebration: CelebrationPose | null = null): void {
    const w = track.toWorld(horse.s, horse.lateral);
    // Turn the horse a little in the direction it is moving sideways.
    this.yaw = w.heading + Math.atan2(horse.lateralVelocity, Math.max(horse.speed, 2)) * 0.8;
    this.root.position.set(w.x, horse.height, w.z);
    this.root.rotation.y = -this.yaw;

    const gait = clamp(horse.speed / 6, 0, 1);
    const phase = horse.gaitPhase;
    this.bob = horse.airborne ? 0 : Math.abs(Math.sin(phase)) * 0.12 * gait;
    this.body.position.set(0, this.bob, 0);
    this.body.rotation.x = horse.airborne ? 0.15 * Math.sign(horse.height - 0.5) : Math.sin(phase * 2) * 0.03 * gait;
    this.neck.rotation.x = Math.sin(phase * 2 + 0.6) * 0.08 * gait;

    for (const leg of this.legs) {
      leg.pivot.rotation.x = horse.airborne
        ? leg.front ? 1.1 : -0.7
        : Math.sin(phase + leg.phase) * 0.7 * gait;
    }
    this.neck.rotation.y = 0;
    if (celebration && celebration.pitch > 0.001) this.applyRearing(celebration);
  }

  /** Rearing up: the body rotates around the hind hips, hind legs stay on the ground. */
  private applyRearing(p: CelebrationPose): void {
    const { y: py, z: pz } = HorseModel.HIND_HIP;
    const c = Math.cos(p.pitch);
    const s = Math.sin(p.pitch);
    // Rotate around the hip point instead of the body origin.
    this.body.rotation.x = p.pitch;
    this.body.position.set(0, py - (py * c - pz * s), pz - (py * s + pz * c));
    this.bob = 0;
    for (const leg of this.legs) leg.pivot.rotation.x = leg.front ? p.frontLegs : -p.pitch;
    this.neck.rotation.y = p.headShake;
    this.neck.rotation.x = -0.25 * (p.pitch / MAX_PITCH);
  }
}
