import * as THREE from 'three';

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Banner with large centered text (start/finish gate). */
export function bannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = fg;
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
  });
}

/** Yellow board with black chevrons pointing into the curve. */
export function chevronTexture(direction: 1 | -1): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) {
      const cx = 60 + i * 68;
      const d = direction * 26;
      ctx.beginPath();
      ctx.moveTo(cx - d, 18);
      ctx.lineTo(cx + d, 64);
      ctx.lineTo(cx - d, 110);
      ctx.lineTo(cx - d + direction * -22, 110);
      ctx.lineTo(cx + d - direction * 22, 64);
      ctx.lineTo(cx - d - direction * 22, 18);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** Red/white stripes for show-jumping poles. */
export function stripeTexture(color: string): THREE.CanvasTexture {
  const tex = canvasTexture(64, 16, (ctx) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : color;
      ctx.fillRect(i * 16, 0, 16, 16);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Black and white checkers for the finish line. */
export function checkerTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(64, 16, (ctx) => {
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#111' : '#fff';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
