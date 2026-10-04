import type { Object3D } from 'three';

/**
 * three.js layers decide which camera sees which object. One shared scene is
 * rendered from several cameras:
 *   0          – shared scenery and horses (all cameras)
 *   1..4       – per-player obstacles (fences/carrots have per-player state)
 *   OVERVIEW   – markers only visible in the overview camera
 */
export const LAYER_SHARED = 0;
export const LAYER_OVERVIEW = 5;
export const playerLayer = (index: number): number => 1 + index;

/** Layers are not inherited, so set them on the whole subtree. */
export function setLayer(root: Object3D, layer: number): void {
  root.traverse((o) => o.layers.set(layer));
}
