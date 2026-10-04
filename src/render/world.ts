import * as THREE from 'three';
import type { Track } from '../game/track';
import { t } from '../i18n';
import { bannerTexture, checkerTexture, chevronTexture } from './textures';

export const SKY_COLOR = '#9fd3f0';
const GRASS = '#7cbf4f';
const SHOULDER = '#6aa843';
const SAND = '#dcbb83';

/** Deterministic random numbers so the scenery looks the same every time. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A flat strip along the track between two lateral offsets. */
function ribbon(track: Track, from: number, to: number, y: number, color: string): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  track.samples.forEach((p, i) => {
    const rx = Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    pos.push(p.x + rx * from, y, p.z + rz * from, p.x + rx * to, y, p.z + rz * to);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

/** Places a plane/object across the track at distance s, facing approaching riders. */
function placeAcross(obj: THREE.Object3D, track: Track, s: number, lateral = 0, y = 0): void {
  const w = track.toWorld(s, lateral);
  obj.position.set(w.x, y, w.z);
  obj.rotation.y = -w.heading;
}

/** Sky, fog and light – the same for every course. */
export function setupEnvironment(scene: THREE.Scene, viewDistance: number): void {
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, viewDistance * 0.35, viewDistance);

  scene.add(new THREE.HemisphereLight('#ffffff', '#55703a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4dc', 1.4);
  sun.position.set(40, 80, 30);
  scene.add(sun);
}

/** Course-specific scenery: ground, track, rails, trees, gates and curve signs. */
export function buildCourseScenery(track: Track, treeCount: number): THREE.Group {
  const scene = new THREE.Group();
  const b = track.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshLambertMaterial({ color: GRASS }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  scene.add(ground);

  scene.add(ribbon(track, -track.railOffset, track.railOffset, 0.01, SHOULDER));
  scene.add(ribbon(track, -track.halfWidth, track.halfWidth, 0.02, SAND));

  addRails(scene, track);
  addTrees(scene, track, treeCount);
  addGates(scene, track);
  addCurveSigns(scene, track);
  return scene;
}

/**
 * Frees GPU resources of a subtree. Meshes flagged with `userData.shared`
 * use geometries/materials that are reused across courses and are kept.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.shared) return;
    o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
  });
}

function addRails(scene: THREE.Object3D, track: Track): void {
  const spacing = 3;
  const offset = track.railOffset + 0.2;
  const count = Math.floor(track.totalLength / spacing) + 1;
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), mat, count * 2);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.1, 1), mat, count * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let p = 0;
  let r = 0;
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1]) {
      const a = track.toWorld(i * spacing, side * offset);
      q.setFromAxisAngle(up, -a.heading);
      posts.setMatrixAt(p++, m.compose(pos.set(a.x, 0.5, a.z), q, scl.set(1, 1, 1)));
      if (i === count - 1) continue;
      const b = track.toWorld((i + 1) * spacing, side * offset);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      q.setFromAxisAngle(up, -Math.atan2(b.x - a.x, -(b.z - a.z)));
      for (const h of [0.55, 0.9]) {
        rails.setMatrixAt(r++, m.compose(pos.set((a.x + b.x) / 2, h, (a.z + b.z) / 2), q, scl.set(1, 1, len)));
      }
    }
  }
  posts.count = p;
  rails.count = r;
  scene.add(posts, rails);
}

function addTrees(scene: THREE.Object3D, track: Track, count: number): void {
  const rnd = mulberry32(42);
  const b = track.bounds;
  const margin = 70;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.28, 2, 6),
    new THREE.MeshLambertMaterial({ color: '#7a5230' }),
    count,
  );
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4, 7), new THREE.MeshLambertMaterial(), count);
  const greens = ['#3f7f35', '#4d8f3a', '#2f6b2e', '#5a9a3f'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 20; tries++) {
    const x = b.minX - margin + rnd() * (b.maxX - b.minX + 2 * margin);
    const z = b.minZ - margin + rnd() * (b.maxZ - b.minZ + 2 * margin);
    if (track.distanceToCenterLine(x, z) < track.railOffset + 5) continue;
    const s = 0.7 + rnd() * 0.8;
    trunks.setMatrixAt(n, m.compose(pos.set(x, s, z), q, scl.set(s, s, s)));
    crowns.setMatrixAt(n, m.compose(pos.set(x, s * 3.8, z), q, scl.set(s, s, s)));
    crowns.setColorAt(n, greens[Math.floor(rnd() * greens.length)]);
    n++;
  }
  trunks.count = n;
  crowns.count = n;
  scene.add(trunks, crowns);
}

function addGates(scene: THREE.Object3D, track: Track): void {
  const width = track.railOffset * 2;
  const postMat = new THREE.MeshLambertMaterial({ color: '#8a5a2b' });
  const gate = (s: number, text: string, bg: string) => {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.8, 8), postMat);
      post.position.set(side * (width / 2 + 0.2), 2.4, 0);
      g.add(post);
    }
    // Two one-sided planes back to back, so the text is readable from both sides
    // (the finish celebration camera looks at the finish gate from behind).
    const bannerGeo = new THREE.PlaneGeometry(width, 1.3);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(text, bg, '#ffffff') });
    for (const turn of [0, Math.PI]) {
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.y = 4.3;
      banner.rotation.y = turn;
      g.add(banner);
    }
    placeAcross(g, track, s);
    scene.add(g);
  };
  gate(2, t('gate.start'), '#2f7d32');
  gate(track.length, t('gate.finish'), '#c0392b');

  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 1),
    new THREE.MeshLambertMaterial({ map: checkerTexture() }),
  );
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(line);
  placeAcross(holder, track, track.length, 0, 0.03);
  scene.add(holder);
}

/** Chevron boards on the outside of every curve, pointing into the turn. */
function addCurveSigns(scene: THREE.Object3D, track: Track): void {
  const tex = { 1: chevronTexture(1), [-1]: chevronTexture(-1) } as Record<1 | -1, THREE.Texture>;
  const geo = new THREE.PlaneGeometry(1.6, 0.8);
  const postGeo = new THREE.BoxGeometry(0.08, 1.2, 0.08);
  const postMat = new THREE.MeshLambertMaterial({ color: '#444' });
  for (const seg of track.segments) {
    if (seg.def.kind !== 'curve') continue;
    const dir = Math.sign(seg.def.angle) as 1 | -1;
    const mat = new THREE.MeshLambertMaterial({ map: tex[dir], side: THREE.DoubleSide });
    for (let s = seg.start + 4; s < seg.end - 2; s += 8) {
      const sign = new THREE.Group();
      const board = new THREE.Mesh(geo, mat);
      board.position.y = 1.5;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 0.6;
      sign.add(board, post);
      // Outside of the curve: left for right turns, right for left turns.
      placeAcross(sign, track, s, -dir * (track.railOffset + 1));
      // Turn the board a bit towards the approaching rider.
      sign.rotation.y += dir * 0.5;
      scene.add(sign);
    }
  }
}

