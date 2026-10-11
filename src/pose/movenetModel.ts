import * as tf from '@tensorflow/tfjs-core';
import modelJsonUrl from '../assets/models/movenet-multipose-lightning/model.json?url';
import shard1 from '../assets/models/movenet-multipose-lightning/group1-shard1of3.bin?url';
import shard2 from '../assets/models/movenet-multipose-lightning/group1-shard2of3.bin?url';
import shard3 from '../assets/models/movenet-multipose-lightning/group1-shard3of3.bin?url';

/**
 * MoveNet MultiPose Lightning, shipped with the game (Apache 2.0, see
 * src/assets/models/movenet-multipose-lightning/README.md) instead of being
 * downloaded from tfhub.dev: the game never contacts an external server.
 *
 * Vite bundles the files: as hashed files next to the page in the normal
 * build, inlined as data URLs in the single-file build.
 */
const SHARDS: Record<string, string> = {
  'group1-shard1of3.bin': shard1,
  'group1-shard2of3.bin': shard2,
  'group1-shard3of3.bin': shard3,
};

/** Model loader for pose-detection's `modelUrl` option. */
export function bundledMoveNet(): tf.io.IOHandler {
  return tf.io.http(modelJsonUrl, {
    weightUrlConverter: async (name: string) => {
      const url = SHARDS[name];
      if (!url) throw new Error(`Unknown MoveNet weight file: ${name}`);
      return url;
    },
  });
}
