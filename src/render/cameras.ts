import * as THREE from 'three';
import type { Horse } from '../game/horse';
import type { Track } from '../game/track';
import { orbitProgress } from './celebration';
import { HorseModel } from './horseModel';
import { LAYER_OVERVIEW, playerLayer } from './layers';

/** First-person camera on the horse's back: you see neck, mane and ears in front of you. */
export class RiderCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private lastTime: number | null = null;

  /** Field of view grows by this factor during the carrot turbo (speed feeling). */
  static readonly TURBO_FOV = 1.15;
  /** Finish celebration: distance and height of the camera in front of the horse (m). */
  static readonly ORBIT_RADIUS = 7;
  static readonly ORBIT_HEIGHT = 2.6;

  private readonly focus = new THREE.Vector3();

  constructor(
    index: number,
    private readonly baseFov: number,
    far: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(baseFov, 1, 0.1, far);
    this.camera.layers.enable(playerLayer(index));
  }

  /**
   * @param celebrating seconds since this horse crossed the finish line, or null while racing.
   *   Then the camera orbits 180° around the horse and looks back along the track.
   */
  sync(horse: Horse, model: HorseModel, track: Track, time: number, celebrating: number | null = null): void {
    const dt = this.lastTime === null ? 0 : Math.min(0.1, time - this.lastTime);
    this.lastTime = time;
    const fov = this.baseFov * (horse.boost > 0 ? RiderCamera.TURBO_FOV : 1);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }

    model.root.updateMatrixWorld();
    this.eye.copy(HorseModel.EYE).applyMatrix4(model.root.matrixWorld);
    this.eye.y += model.bob * 0.8;
    this.camera.position.copy(this.eye);

    // Look ahead along the track so curves are visible early.
    const ahead = track.toWorld(horse.s + 12, horse.lateral * 0.7);
    this.target.set(ahead.x, 1.9 + horse.height * 0.6, ahead.z);

    if (celebrating !== null) this.orbit(model, celebrating);
    this.camera.lookAt(this.target);

    // Shake when the horse is stopped by an obstacle, fading out.
    if (horse.stumble > 0) this.camera.rotation.z += Math.sin(time * 40) * 0.04 * Math.min(1, horse.stumble);
  }

  /**
   * Finish celebration: starting at the rider's eye, the camera swings around
   * the horse (radius grows) until it stands in front of it, looking back at
   * the horse and the track behind it – where the others are still coming.
   */
  private orbit(model: HorseModel, elapsed: number): void {
    const k = orbitProgress(elapsed);
    const angle = k * Math.PI;
    const start = HorseModel.EYE;
    const r = start.z + (RiderCamera.ORBIT_RADIUS - start.z) * k;
    const h = start.y + (RiderCamera.ORBIT_HEIGHT - start.y) * k;
    // Horse space: +z is behind the horse, -z in front of it.
    this.eye.set(Math.sin(angle) * r, h, Math.cos(angle) * r).applyMatrix4(model.root.matrixWorld);
    this.camera.position.copy(this.eye);
    // Turn the view from "ahead along the track" to "at the horse".
    const w = Math.min(1, k * 1.6);
    this.focus.set(0, 1.7, 0).applyMatrix4(model.root.matrixWorld);
    this.target.lerp(this.focus, w);
  }
}

/** Camera high above the course: slowly orbiting in the registration, static as the spare quadrant. */
export class OverviewCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly center = new THREE.Vector3();
  private radius = 1;

  constructor(track: Track, far: number) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, far * 3);
    this.camera.layers.enable(LAYER_OVERVIEW);
    this.setTrack(track);
  }

  /** Frames the given course. */
  setTrack(track: Track): void {
    const b = track.bounds;
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 40);
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
