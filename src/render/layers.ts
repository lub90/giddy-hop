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

/** Makes a subtree visible exactly to the cameras that have one of the given layers. */
export function setLayers(root: Object3D, layers: readonly number[]): void {
  root.traverse((o) => {
    o.layers.disableAll();
    for (const l of layers) o.layers.enable(l);
  });
}

/**
 * Layers on which the horse of `player` is visible: everyone else's rider view and
 * the overview – but not its own rider view, where a drawn overlay is shown instead
 * (unless `includeOwn`, e.g. during the finish celebration when the camera flies around it).
 */
export function horseLayers(player: number, playerCount: number, includeOwn: boolean): number[] {
  const layers = [LAYER_OVERVIEW];
  for (let j = 0; j < playerCount; j++) if (j !== player || includeOwn) layers.push(playerLayer(j));
  return layers;
}
