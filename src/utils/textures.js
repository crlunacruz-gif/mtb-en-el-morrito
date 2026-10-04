import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Ruido de valor periódico (tileable) para texturas procedurales.
function tileableValueNoise(size, period, rng) {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period, fy = (y / size) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
      const a = lattice[y0 * period + x0], b = lattice[y0 * period + x1];
      const c = lattice[y1 * period + x0], d = lattice[y1 * period + x1];
      out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

/**
 * Textura de detalle del suelo: grano de tierra seca + piedritas.
 * Neutra (≈ gris claro) porque multiplica a los vertex colors.
 * Es clave para percibir la velocidad: sin grano, el suelo "no corre".
 */
export function makeGroundDetailTexture(seed = 1) {
  const size = 512;
  const rng = mulberry32(seed * 1013 + 7);
  const n1 = tileableValueNoise(size, 8, rng);
  const n2 = tileableValueNoise(size, 32, rng);
  const n3 = tileableValueNoise(size, 128, rng);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const grain = rng();
    let v = 0.84 + (n1[i] - 0.5) * 0.1 + (n2[i] - 0.5) * 0.12 + (n3[i] - 0.5) * 0.14 + (grain - 0.5) * 0.16;
    v = Math.max(0, Math.min(1, v));
    const c = Math.round(v * 255);
    img.data[i * 4] = c;
    img.data[i * 4 + 1] = Math.round(c * 0.985);
    img.data[i * 4 + 2] = Math.round(c * 0.96);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // gravilla: puntitos claros y oscuros + piedritas con sombra suave (tileable)
  const wrapDraw = (x, y, r, fn) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = x + ox, py = y + oy;
        if (px < -r * 3 || px > size + r * 3 || py < -r * 3 || py > size + r * 3) continue;
        fn(px, py);
      }
    }
  };
  for (let i = 0; i < 9000; i++) {
    const r = 0.5 + rng() * 1.1;
    const light = rng() < 0.55;
    const a = 0.25 + rng() * 0.35;
    ctx.fillStyle = light ? `rgba(255,248,235,${a})` : `rgba(70,58,48,${a})`;
    wrapDraw(rng() * size, rng() * size, r, (px, py) => { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); });
  }
  for (let i = 0; i < 520; i++) {
    const r = 1.5 + Math.pow(rng(), 2.5) * 4.5;
    const tone = 150 + rng() * 90;
    const rot = rng() * Math.PI;
    wrapDraw(rng() * size, rng() * size, r, (px, py) => {
      ctx.fillStyle = 'rgba(60,48,38,0.22)';
      ctx.beginPath(); ctx.ellipse(px + r * 0.2, py + r * 0.25, r * 1.05, r * 0.85, rot, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${tone},${Math.round(tone * 0.96)},${Math.round(tone * 0.9)})`;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.75, rot, 0, Math.PI * 2); ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Normal map para el océano (ondas suaves, tileable). */
export function makeWaterNormalTexture(seed = 3) {
  const size = 256;
  const rng = mulberry32(seed * 77 + 1);
  const a = tileableValueNoise(size, 8, rng);
  const b = tileableValueNoise(size, 24, rng);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.6 + b[i] * 0.4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const nx = -hx * 6, ny = -hy * 6, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      img.data[i * 4] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Ruido suave de baja frecuencia (sombras de nubes que pasan). */
export function makeCloudTexture(seed = 11) {
  const size = 256;
  const rng = mulberry32(seed * 31 + 3);
  const a = tileableValueNoise(size, 4, rng);
  const b = tileableValueNoise(size, 9, rng);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((a[i] * 0.7 + b[i] * 0.3) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
