import * as THREE from 'three';
import type { Horse } from '../game/horse';
import type { Track } from '../game/track';
import { HorseModel } from './horseModel';
import { LAYER_OVERVIEW, playerLayer } from './layers';

/** First-person camera on the horse's back: you see neck, mane and ears in front of you. */
export class RiderCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(index: number, fov: number, far: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, far);
    this.camera.layers.enable(playerLayer(index));
  }

  sync(horse: Horse, model: HorseModel, track: Track, time: number): void {
    model.root.updateMatrixWorld();
    this.eye.copy(HorseModel.EYE).applyMatrix4(model.root.matrixWorld);
    this.eye.y += model.bob * 0.8;
    this.camera.position.copy(this.eye);

    // Look ahead along the track so curves are visible early.
    const ahead = track.toWorld(horse.s + 12, horse.lateral * 0.7);
    this.target.set(ahead.x, 1.9 + horse.height * 0.6, ahead.z);
    this.camera.lookAt(this.target);

    // Small shake when stumbling over an obstacle.
    if (horse.stumble > 0) this.camera.rotation.z += Math.sin(time * 40) * 0.04 * horse.stumble;
  }
}

/** Camera high above the course: slowly orbiting in the registration, static as the spare quadrant. */
export class OverviewCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly center: THREE.Vector3;
  private readonly radius: number;

  constructor(track: Track, far: number) {
    const b = track.bounds;
    this.center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, far * 3);
    this.camera.layers.enable(LAYER_OVERVIEW);
  }

  /** Slow orbit for the start screen. */
  orbit(time: number): void {
    const a = time * 0.05;
    const r = this.radius * 0.9;
    this.camera.position.set(this.center.x + Math.sin(a) * r, this.radius * 0.55, this.center.z + Math.cos(a) * r);
    this.camera.lookAt(this.center);
  }

  /** Top-down-ish view of the whole course. */
  topDown(): void {
    this.camera.position.set(this.center.x, this.radius * 1.15, this.center.z + this.radius * 0.35);
    this.camera.lookAt(this.center);
  }
}
