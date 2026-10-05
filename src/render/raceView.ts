import * as THREE from 'three';
import type { Race } from '../game/race';
import { RiderCamera } from './cameras';
import { celebrationPose, rearingsStarted, type CelebrationTiming } from './celebration';
import { HorseModel } from './horseModel';
import { horseLayers, LAYER_OVERVIEW, playerLayer, setLayer, setLayers } from './layers';
import { PlayerObstacles } from './obstacleViews';

/** Coat and mane colors per player (also used for the drawn rider-view overlay). */
export const COATS = [
  { coat: '#8b5a2b', mane: '#2b1a0e' },
  { coat: '#efe9dc', mane: '#b8ab95' },
  { coat: '#2e2620', mane: '#111111' },
  { coat: '#c47a3a', mane: '#f0d9a8' },
];

/** All 3D objects that belong to one race; added on start, removed on dispose. */
export class RaceView {
  readonly cameras: RiderCamera[];
  private readonly models: HorseModel[];
  private readonly obstacles: PlayerObstacles[];
  private readonly markers: THREE.Mesh[];
  private readonly root = new THREE.Group();
  /** Wall-clock time when each horse was first seen finished. */
  private readonly finishedAt: (number | null)[];
  /** Number of rearing cycles started per horse (for the whinny sound). */
  private readonly rearCount: number[];

  /**
   * @param onRear called whenever a horse starts rearing up in its finish celebration.
   */
  constructor(
    private readonly scene: THREE.Scene,
    private readonly race: Race,
    colors: readonly string[],
    fov: number,
    far: number,
    private readonly timing: CelebrationTiming,
    private readonly onRear?: (player: number) => void,
  ) {
    const n = race.horses.length;
    this.finishedAt = race.horses.map(() => null);
    this.rearCount = race.horses.map(() => 0);
    this.models = race.horses.map((_, i) => {
      const c = COATS[i % COATS.length];
      const m = new HorseModel(c.coat, c.mane, colors[i]);
      // In its own rider view the horse is a drawn overlay (cheaper and prettier than the boxes).
      setLayers(m.root, horseLayers(i, n, false));
      this.root.add(m.root);
      return m;
    });
    this.cameras = race.horses.map((_, i) => new RiderCamera(i, fov, far));
    this.obstacles = race.obstacles.map((states, i) => {
      const o = new PlayerObstacles(race.track, states, playerLayer(i));
      this.root.add(o.group);
      return o;
    });
    // Big colored pins so the horses can be found in the overview.
    this.markers = Array.from({ length: n }, (_, i) => {
      const pin = new THREE.Mesh(new THREE.ConeGeometry(4.5, 10, 10), new THREE.MeshBasicMaterial({ color: colors[i] }));
      pin.rotation.x = Math.PI;
      setLayer(pin, LAYER_OVERVIEW);
      this.root.add(pin);
      return pin;
    });
    scene.add(this.root);
  }

  update(time: number): void {
    const { race } = this;
    race.horses.forEach((horse, i) => {
      const model = this.models[i];
      // Finish celebration runs on wall-clock time, so it continues after the race is over.
      if (horse.finished && this.finishedAt[i] === null) {
        this.finishedAt[i] = time;
        // The celebration camera flies around the horse: now its own view needs the 3D model.
        setLayers(model.root, horseLayers(i, race.horses.length, true));
      }
      const finishedAt = this.finishedAt[i];
      const celebrating = finishedAt === null ? null : time - finishedAt;
      const pose = celebrating === null ? null : celebrationPose(celebrating, this.timing);
      if (celebrating !== null) {
        const started = rearingsStarted(celebrating, this.timing);
        if (started > this.rearCount[i]) {
          this.rearCount[i] = started;
          this.onRear?.(i);
        }
      }
      model.sync(horse, race.track, pose);
      this.cameras[i].sync(horse, model, race.track, time, celebrating);
      this.obstacles[i].update(race.time, time);
      this.markers[i].position.set(model.root.position.x, 14 + Math.sin(time * 3 + i) * 1.5, model.root.position.z);
    });
  }

  /** Data for the drawn horse overlay in the rider view of `player`. */
  ego(player: number): { visible: boolean; bob: number } {
    return { visible: this.finishedAt[player] === null, bob: this.models[player].bob };
  }

  dispose(): void {
    this.scene.remove(this.root);
    // Obstacle geometries/materials are shared across races; horse models and markers are per race.
    const perRace = [...this.models.map((m) => m.root), ...this.markers];
    for (const obj of perRace) {
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
    }
  }
}
