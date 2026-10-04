import * as THREE from 'three';

/**
 * Materiales "hiperrealistas" (dentro de lo que permite el navegador) para la piel y el guante.
 * Todo procedural, sin fotos: mapa de color con pecas/variación, mapa normal con poros,
 * pliegues finos y venas superficiales del dorso del antebrazo, y "sheen" rojizo que
 * imita la dispersión subsuperficial en los bordes.
 */

let skinCache = null;

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

/** Textura de altura de la piel (u = alrededor del brazo, v = muñeca→codo). */
function skinHeight(W, H) {
  const h = new Float32Array(W * H);
  // venas: curvas suaves que suben por el dorso del antebrazo y se ramifican
  const veins = [];
  const rnd = (i) => hash(i * 3.1, 7.7);
  for (let i = 0; i < 5; i++) {
    veins.push({ u0: 0.18 + rnd(i) * 0.22, amp: 0.03 + rnd(i + 9) * 0.04, freq: 1.5 + rnd(i + 3) * 2, w: 0.012 + rnd(i + 5) * 0.008, v0: rnd(i + 11) * 0.3, v1: 0.55 + rnd(i + 13) * 0.45 });
  }
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // poros (alta frecuencia, hundidos)
      const pore = Math.max(0, vnoise(x * 0.9, y * 0.9) - 0.72) * -1.6;
      // micro-pliegues en diagonal
      const crease = (fbm(u * 60 + v * 30, v * 18, 3) - 0.5) * 0.35;
      // relieve muscular suave
      const soft = (fbm(u * 6, v * 4, 3) - 0.5) * 0.6;
      let vein = 0;
      for (const vn of veins) {
        if (v < vn.v0 || v > vn.v1) continue;
        const uc = vn.u0 + Math.sin(v * vn.freq * 6.28 + vn.u0 * 9) * vn.amp;
        const d = Math.abs(u - uc) / vn.w;
        const fade = Math.min(1, (v - vn.v0) * 8, (vn.v1 - v) * 8);
        vein = Math.max(vein, Math.exp(-d * d) * fade);
      }
      h[y * W + x] = pore + crease + soft + vein * 1.4;
    }
  }
  return h;
}

function heightToNormal(h, W, H, strength) {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = h[y * W + ((x - 1 + W) % W)], r = h[y * W + ((x + 1) % W)];
      const d = h[((y - 1 + H) % H) * W + x], u = h[((y + 1) % H) * W + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * W + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
  }
  return data;
}

function skinTextures() {
  if (skinCache) return skinCache;
  const W = 256, H = 512;
  const h = skinHeight(W, H);
  const normal = new THREE.DataTexture(heightToNormal(h, W, H, 1.3), W, H);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.colorSpace = THREE.NoColorSpace;
  normal.generateMipmaps = true;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;
  normal.needsUpdate = true;
  // color: manchas suaves, pecas, venas azuladas tenues, vello sugerido (trazos finos oscuros)
  const col = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const blot = fbm(u * 8, v * 5, 4);
      const freck = Math.max(0, vnoise(x * 0.35 + 50, y * 0.35) - 0.8) * 3;
      const hair = Math.max(0, Math.sin((u * 140 + fbm(u * 30, v * 60) * 8) * 6.28) - 0.96) * 6 * fbm(u * 3, v * 3);
      const hv = h[y * W + x];
      const vein = Math.max(0, hv - 0.6) * 0.5;
      let r = 1 - 0.07 * blot - 0.18 * freck - 0.1 * hair - 0.05 * vein;
      let g = 1 - 0.1 * blot - 0.24 * freck - 0.12 * hair - 0.02 * vein;
      let b = 1 - 0.12 * blot - 0.28 * freck - 0.12 * hair + 0.05 * vein;
      r += 0.03 * (fbm(u * 20, v * 20) - 0.5); // rojeces
      const i = (y * W + x) * 4;
      col[i] = Math.min(255, r * 255); col[i + 1] = Math.min(255, g * 255); col[i + 2] = Math.min(255, b * 255); col[i + 3] = 255;
    }
  }
  const color = new THREE.DataTexture(col, W, H);
  color.wrapS = color.wrapT = THREE.RepeatWrapping;
  color.colorSpace = THREE.SRGBColorSpace;
  color.generateMipmaps = true;
  color.minFilter = THREE.LinearMipmapLinearFilter;
  color.magFilter = THREE.LinearFilter;
  color.needsUpdate = true;
  skinCache = { normal, color };
  return skinCache;
}

export function makeSkinMaterial(hex) {
  const { normal, color } = skinTextures();
  const base = new THREE.Color(hex);
  const mat = new THREE.MeshPhysicalMaterial({
    color: base,
    map: color,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: 0.52,
    metalness: 0,
    vertexColors: true,
    sheen: 0.25,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#a8604a'),
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    specularIntensity: 0.55,
  });
  // dispersión subsuperficial aproximada: "wrap lighting" + tinte rojizo en el terminador
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       {
         float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
         vec3 sss = vec3(0.5, 0.18, 0.1) * pow(1.0 - ndv, 2.0) * 0.25;
         reflectedLight.indirectDiffuse += diffuseColor.rgb * sss;
       }`,
    );
  };
  return mat;
}

let gloveCache = null;
/** Mapa normal de tela técnica (malla + costuras) para el guante y la manga. */
export function fabricNormal() {
  if (gloveCache) return gloveCache;
  const W = 128, H = 128;
  const h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const weave = Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.35;
      const seam = Math.exp(-(((x % 64) - 32) ** 2) / 3) * 1.2;
      h[y * W + x] = weave + seam + (vnoise(x * 0.5, y * 0.5) - 0.5) * 0.3;
    }
  }
  const t = new THREE.DataTexture(heightToNormal(h, W, H, 1.2), W, H);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  gloveCache = t;
  return t;
}

export function makeFabricMaterial(hex, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: opts.roughness ?? 0.85,
    normalMap: fabricNormal(),
    normalScale: new THREE.Vector2(0.4, 0.4),
    sheen: opts.sheen ?? 0.5,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.25),
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
}
