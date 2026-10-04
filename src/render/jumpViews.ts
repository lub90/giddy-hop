import * as THREE from 'three';
import type { JumpType, Track } from '../game/track';
import { brickTexture, stripeTexture } from './textures';

/**
 * 3D models of the jump obstacles. All jumps span the sand track (local x axis)
 * and face the approaching rider (local -z = riding direction).
 * `hit(f)` plays the knock-down animation, f = 0..1.
 */
export interface JumpView {
  group: THREE.Group;
  hit(f: number): void;
}

// Geometries and materials are shared by all players and races (never disposed).
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
const standardGeo = new THREE.BoxGeometry(0.18, 1.6, 0.18);
const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);
const splashGeo = new THREE.IcosahedronGeometry(0.25, 1);
const standardMat = new THREE.MeshLambertMaterial({ color: '#2a5fa8' });
const pillarMat = new THREE.MeshLambertMaterial({ color: '#f2efe6' });
const hedgeMat = new THREE.MeshLambertMaterial({ color: '#2f6b2e' });
const bushMat = new THREE.MeshLambertMaterial({ color: '#3c7f34', flatShading: true });
const waterMat = new THREE.MeshPhongMaterial({ color: '#4fb6f2', emissive: '#0d3a5c', shininess: 90, specular: '#e6f8ff' });
const edgeMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
const splashMat = new THREE.MeshLambertMaterial({ color: '#e6f6ff' });
let poleMat: THREE.MeshLambertMaterial | null = null;
let brickMat: THREE.MeshLambertMaterial | null = null;

const POLE_HEIGHTS = [0.45, 0.75, 1.0];

const box = (mat: THREE.Material, w: number, h: number, d: number, x = 0, y = h / 2, z = 0) => {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
};

/** Width of a jump: the sand plus a little overlap into the side hedges. */
const jumpWidth = (track: Track) => track.halfWidth * 2 + 0.4;

/** Classic show-jumping fence: striped poles between two standards. Poles fall down. */
function buildFence(track: Track): JumpView {
  poleMat ??= new THREE.MeshLambertMaterial({ map: stripeTexture('#d62828') });
  const group = new THREE.Group();
  const width = jumpWidth(track);
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
  return {
    group,
    hit: (f) =>
      poles.forEach((p, i) => {
        p.position.y = POLE_HEIGHTS[i] + (0.08 - POLE_HEIGHTS[i]) * f;
        p.position.z = f * (0.4 + i * 0.25);
      }),
  };
}

/** Brick wall with white pillars. The loose top bricks fall off. */
function buildWall(track: Track): JumpView {
  brickMat ??= new THREE.MeshLambertMaterial({ map: brickTexture() });
  const group = new THREE.Group();
  const width = jumpWidth(track);
  const base = box(brickMat, width, 0.75, 0.6);
  group.add(base);
  for (const side of [-1, 1]) group.add(box(pillarMat, 0.4, 1.3, 0.7, (side * (width + 0.4)) / 2));

  const count = Math.max(4, Math.round(width / 0.9));
  const bw = width / count;
  const blocks = Array.from({ length: count }, (_, i) => {
    const b = box(brickMat!, bw - 0.04, 0.25, 0.6, -width / 2 + bw * (i + 0.5), 0.875);
    group.add(b);
    return b;
  });
  return {
    group,
    hit: (f) =>
      blocks.forEach((b, i) => {
        // Every other block falls, alternating forwards and backwards.
        if (i % 2) return;
        const dir = i % 4 === 0 ? 1 : -1;
        b.position.y = 0.875 - 0.75 * f;
        b.position.z = dir * f * 0.7;
        b.rotation.x = dir * f * 1.2;
      }),
  };
}

/** Thick hedge with a bushy top. The bushes get squashed. */
function buildHedge(track: Track): JumpView {
  const group = new THREE.Group();
  const width = jumpWidth(track);
  group.add(box(hedgeMat, width, 0.8, 1.0));
  const count = Math.max(4, Math.round(width / 0.8));
  const bushes = Array.from({ length: count }, (_, i) => {
    const b = new THREE.Mesh(bushGeo, bushMat);
    b.position.set(-width / 2 + (width * (i + 0.5)) / count, 0.85, ((i % 2) - 0.5) * 0.15);
    b.scale.set(0.85, 0.6 + (i % 3) * 0.08, 0.85);
    group.add(b);
    return b;
  });
  const baseScale = bushes.map((b) => b.scale.y);
  return {
    group,
    hit: (f) =>
      bushes.forEach((b, i) => {
        b.scale.y = baseScale[i] * (1 - 0.6 * f);
        b.position.y = 0.85 - 0.2 * f;
      }),
  };
}

/** Water ditch with a very low brush in front and marker posts. A splash erupts. */
function buildWater(track: Track): JumpView {
  const group = new THREE.Group();
  const width = jumpWidth(track);
  const depth = 3.5;
  // The water lies just behind the take-off point (riding direction = -z).
  const water = new THREE.Mesh(planeGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(width, depth, 1);
  water.position.set(0, 0.06, -depth / 2);
  group.add(water);
  for (const z of [0, -depth]) group.add(box(edgeMat, width, 0.1, 0.15, 0, 0.05, z));
  // Very low brush at the take-off side, so the water stays visible from afar.
  group.add(box(hedgeMat, width, 0.22, 0.35, 0, 0.11, 0.3));
  // Blue/white marker posts on both sides make the ditch recognizable from a distance.
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(standardGeo, standardMat);
    post.position.set((side * width) / 2, 0.8, 0);
    const cap = box(pillarMat, 0.24, 0.25, 0.24, (side * width) / 2, 1.65);
    group.add(post, cap);
  }

  const splash = Array.from({ length: 7 }, (_, i) => {
    const s = new THREE.Mesh(splashGeo, splashMat);
    s.visible = false;
    s.userData.angle = (i / 7) * Math.PI * 2;
    group.add(s);
    return s;
  });
  return {
    group,
    hit: (f) =>
      splash.forEach((s) => {
        const a = s.userData.angle as number;
        s.visible = f < 1;
        const r = 0.3 + f * 1.4;
        s.position.set(Math.cos(a) * r, 0.2 + Math.sin(f * Math.PI) * 1.4, -1.5 + Math.sin(a) * r * 0.6);
        s.scale.setScalar(1.4 * (1 - f) + 0.2);
      }),
  };
}

const BUILDERS: Record<JumpType, (track: Track) => JumpView> = {
  fence: buildFence,
  wall: buildWall,
  hedge: buildHedge,
  water: buildWater,
};

export function buildJump(type: JumpType, track: Track): JumpView {
  return BUILDERS[type](track);
}
