import * as THREE from 'three';
import type { Rect } from './layout';

export interface View {
  camera: THREE.PerspectiveCamera;
  rect: Rect;
}

/**
 * One WebGL context, several viewports. Much cheaper than four canvases:
 * geometry and textures exist once, and the GPU switches context only once.
 */
export class SplitRenderer {
  readonly renderer: THREE.WebGLRenderer;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement, opts: { antialias: boolean; pixelRatio: number }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(opts.pixelRatio);
    this.resize();
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
  }

  render(scene: THREE.Scene, views: readonly View[]): void {
    const r = this.renderer;
    // Clear everything first so the gaps between viewports become dark separators.
    r.setScissorTest(false);
    r.setClearColor('#14100c');
    r.clear();
    r.setScissorTest(true);
    for (const { camera, rect } of views) {
      // three.js viewports start bottom left, our rects top left.
      const y = this.height - rect.y - rect.h;
      r.setViewport(rect.x, y, rect.w, rect.h);
      r.setScissor(rect.x, y, rect.w, rect.h);
      const aspect = rect.w / rect.h;
      if (Math.abs(camera.aspect - aspect) > 1e-3) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      r.render(scene, camera);
    }
    r.setScissorTest(false);
  }
}
