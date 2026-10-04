import * as THREE from 'three';
import type { ObstacleState } from '../game/race';
import type { Track, TrackObstacle } from '../game/track';
import { LAYER_SHARED, setLayer } from './layers';
import { stripeTexture } from './textures';

// Geometries and materials are shared by all players and races.
const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
const standardGeo = new THREE.BoxGeometry(0.18, 1.6, 0.18);
const carrotGeo = new THREE.ConeGeometry(0.13, 0.5, 8);
const leafGeo = new THREE.ConeGeometry(0.1, 0.25, 5);
const coneGeo = new THREE.ConeGeometry(0.35, 0.8, 12);
const stripeGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.12, 12);
const standardMat = new THREE.MeshLambertMaterial({ color: '#2a5fa8' });
const carrotMat = new THREE.MeshLambertMaterial({ color: '#ff8a1e', emissive: '#552200' });
const leafMat = new THREE.MeshLambertMaterial({ color: '#3fa34d' });
const coneMat = new THREE.MeshLambertMaterial({ color: '#ff6a1a' });
const whiteMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
const hedgeGeo = new THREE.BoxGeometry(1, 1, 1);
const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);
const hedgeMat = new THREE.MeshLambertMaterial({ color: '#2f6b2e' });
const bushMat = new THREE.MeshLambertMaterial({ color: '#3c7f34', flatShading: true });

const HEDGE_HEIGHT = 1.3;
const HEDGE_DEPTH = 1.0;
let poleMat: THREE.MeshLambertMaterial | null = null;

const POLE_HEIGHTS = [0.45, 0.75, 1.0];

function place(obj: THREE.Object3D, track: Track, o: TrackObstacle): void {
  const w = track.toWorld(o.s, o.lateral);
  obj.position.set(w.x, 0, w.z);
  obj.rotation.y = -w.heading;
}

function buildFence(track: Track): { group: THREE.Group; poles: THREE.Mesh[] } {
  poleMat ??= new THREE.MeshLambertMaterial({ map: stripeTexture('#d62828') });
  const group = new THREE.Group();
  // The striped poles span the sand only; hedges on the grass block the way around.
  const width = track.halfWidth * 2 + 0.4;
  for (const side of [-1, 1]) {
    const st = new THREE.Mesh(standardGeo, standardMat);
    st.position.set((side * width) / 2, 0.8, 0);
    group.add(st);
  }
  const poles = POLE_HEIGHTS.map((h) => {
    const pole = new THREE.Mesh(poleGeo, poleMat!);
    pole.rotation.z = Math.PI / 2;
    pole.scale.y = width;
    pole.position.y = h;
    group.add(pole);
    return pole;
  });
  return { group, poles };
}

function buildCarrot(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(carrotGeo, carrotMat);
  body.rotation.x = Math.PI;
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.y = 0.33;
  g.add(body, leaf);
  return g;
}

interface Item {
  state: ObstacleState;
  obj: THREE.Group;
  poles?: THREE.Mesh[];
}

/**
 * Fences and carrots of one player. They live on that player's layer, so a
 * fence knocked down by player 1 still stands for player 2.
 */
export class PlayerObstacles {
  readonly group = new THREE.Group();
  private readonly items: Item[] = [];

  constructor(track: Track, states: ObstacleState[], layer: number) {
    for (const state of states) {
      if (state.def.type === 'fence') {
        const { group, poles } = buildFence(track);
        place(group, track, state.def);
        this.items.push({ state, obj: group, poles });
        this.group.add(group);
      } else if (state.def.type === 'carrot') {
        const carrot = buildCarrot();
        place(carrot, track, state.def);
        this.items.push({ state, obj: carrot });
        this.group.add(carrot);
      }
    }
    setLayer(this.group, layer);
  }

  /** Animates carrots and falling poles. */
  update(raceTime: number, time: number): void {
    for (const it of this.items) {
      const age = raceTime - it.state.changedAt;
      if (it.poles) {
        if (it.state.result !== 'hit') continue;
        const f = Math.min(1, age / 0.4);
        it.poles.forEach((p, i) => {
          p.position.y = POLE_HEIGHTS[i] + (0.08 - POLE_HEIGHTS[i]) * f;
          p.position.z = f * (0.4 + i * 0.25);
        });
      } else {
        // Carrots float at rider-eye-friendly height and spin; collected ones pop and vanish.
        const y = 1.25 + Math.sin(time * 3 + it.state.def.s) * 0.1;
        it.obj.rotation.y = time * 2 + it.state.def.s;
        if (it.state.result === 'collected') {
          const f = Math.min(1, age / 0.3);
          it.obj.visible = f < 1;
          it.obj.scale.setScalar(1 + f * 1.5);
          it.obj.position.y = y + f;
        } else {
          it.obj.visible = it.state.result !== 'missed' || age < 2;
          it.obj.position.y = y;
        }
      }
    }
  }
}

function buildCone(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.4;
  const stripe = new THREE.Mesh(stripeGeo, whiteMat);
  stripe.position.y = 0.45;
  g.add(cone, stripe);
  return g;
}

/** Hedges on both grass strips next to a fence, from the sand edge to the rails. */
function buildHedges(track: Track): THREE.Group {
  const g = new THREE.Group();
  const inner = track.halfWidth + 0.35;
  const outer = track.railOffset + 0.2;
  const length = outer - inner;
  for (const side of [-1, 1]) {
    const center = (side * (inner + outer)) / 2;
    const hedge = new THREE.Mesh(hedgeGeo, hedgeMat);
    hedge.scale.set(length, HEDGE_HEIGHT * 0.8, HEDGE_DEPTH);
    hedge.position.set(center, (HEDGE_HEIGHT * 0.8) / 2, 0);
    g.add(hedge);
    // Bushy top so it reads as a hedge, not a wall.
    const bushes = Math.max(2, Math.round(length / 0.9));
    for (let i = 0; i < bushes; i++) {
      const bush = new THREE.Mesh(bushGeo, bushMat);
      const x = side * (inner + ((i + 0.5) / bushes) * length);
      bush.position.set(x, HEDGE_HEIGHT * 0.8, ((i % 2) - 0.5) * 0.15);
      bush.scale.set(0.9, 0.75 + (i % 3) * 0.1, HEDGE_DEPTH * 0.85);
      g.add(bush);
    }
  }
  return g;
}

/** Cones and the hedges beside the fences never change, so all players share them. */
export function buildStaticObstacles(scene: THREE.Scene, track: Track): void {
  for (const o of track.obstacles) {
    let g: THREE.Group;
    if (o.type === 'cone') g = buildCone();
    else if (o.type === 'fence') g = buildHedges(track);
    else continue;
    place(g, track, o);
    setLayer(g, LAYER_SHARED);
    scene.add(g);
  }
}
