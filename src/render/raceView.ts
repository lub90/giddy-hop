import * as THREE from 'three';
import type { Race } from '../game/race';
import { RiderCamera } from './cameras';
import { HorseModel } from './horseModel';
import { LAYER_OVERVIEW, playerLayer, setLayer } from './layers';
import { PlayerObstacles } from './obstacleViews';

const COATS = [
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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly race: Race,
    colors: readonly string[],
    fov: number,
    far: number,
  ) {
    const n = race.horses.length;
    this.models = race.horses.map((_, i) => {
      const c = COATS[i % COATS.length];
      const m = new HorseModel(c.coat, c.mane, colors[i]);
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
      model.sync(horse, race.track);
      this.cameras[i].sync(horse, model, race.track, time);
      this.obstacles[i].update(race.time, time);
      this.markers[i].position.set(model.root.position.x, 14 + Math.sin(time * 3 + i) * 1.5, model.root.position.z);
    });
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
