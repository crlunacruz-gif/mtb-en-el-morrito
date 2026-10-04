import * as THREE from 'three';
import { createNoise2D, fbm, mulberry32, clamp, lerp, smoothstep } from '../utils/noise.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { makeGroundDetailTexture, makeCloudTexture } from '../utils/textures.js';

/**
 * Sistema de terreno del Morro (Milestone 2).
 *
 * Capas:
 *  - Cerro: el eje del trail es la cresta y el terreno cae a cada lado hasta el mar.
 *  - Corredor del trail: líneas, divisores, camber, features (rollers, ledges, tables,
 *    huecos), surcos y micro-relieve. Se mezcla con el cerro en el hombro (bankWidth).
 *  - Superficie: tierra compacta (dirt), tierra suelta (loose), cascajo fuera de línea.
 *  - Rocas: visuales instanciadas + registradas en CollisionSystem.
 *
 * Mallas: grilla no uniforme para el cerro + cinta fina alineada al corredor.
 */
export class Terrain {
  constructor(trail, config, seed, tuning) {
    this.trail = trail;
    this.cfg = config;
    this.T = tuning;
    this.seed = seed;
    this.noise = createNoise2D(seed * 13 + 1);
    this.noise2 = createNoise2D(seed * 31 + 5);
    this._near = {};
    this._sample = {};
    this._corr = {};
    // uniforms de clima compartidos por suelo y rocas (WeatherSystem los modifica)
    this.weatherU = { uWet: { value: 0 }, uClouds: { value: 0 }, uTime: { value: 0 }, uCloudTex: { value: null } };

    const b = trail.bounds;
    this.theme = trail.route.theme;
    const th = this.theme;
    const y0 = trail.y[0];
    const midZ = (b.minZ + b.maxZ) / 2;
    if (th.landmark === 'cross') {
      this.peaks = [
        { x: trail.x[0] + 60, z: trail.z[0] + 150, h: y0 + 60, r: 160 },
        { x: b.minX - 330, z: midZ - 60, h: 150, r: 280, landmark: true },
      ];
    } else if (th.scenery === 'lurin') {
      // lomas anchas y arenosas a ambos lados + el cerro del santuario
      this.peaks = [
        { x: trail.x[0] + 40, z: trail.z[0] + 160, h: y0 + 40, r: 220 },
        { x: b.maxX + 330, z: midZ + 40, h: y0 - 40, r: 400 },
        { x: b.minX - 300, z: b.minZ - 200, h: 70, r: 200, landmark: true },
      ];
    } else {
      // La Molina: cerros de granito alrededor del parque, valle plano abajo
      this.peaks = [
        { x: trail.x[0] + 30, z: trail.z[0] + 200, h: y0 + 45, r: 320 },
        { x: b.minX - 320, z: midZ, h: y0 - 35, r: 460 },
        { x: b.maxX + 340, z: midZ - 60, h: y0 - 45, r: 420 },
      ];
    }
  }

  falloff(d) {
    const r = this.theme.ridge || { falloff: this.cfg.ridgeFalloff, quad: this.cfg.ridgeFalloffQuad };
    return r.falloff * d + r.quad * d * d;
  }

  envelope(x, z) {
    const segs = this.trail.segs;
    let best = -1e9, minD = 1e9;
    for (let k = 0; k < segs.length; k++) {
      const g = segs[k];
      let t = ((x - g.ax) * g.dx + (z - g.az) * g.dz) / g.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (g.ax + g.dx * t);
      const ez = z - (g.az + g.dz * t);
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d < minD) minD = d;
      const side = ex * g.rx + ez * g.rz;
      const expo = side > 0 ? g.expR : g.expL;
      const e = g.ay + (g.by - g.ay) * t - this.falloff(d) * expo;
      if (e > best) best = e;
    }
    return [best, minD];
  }

  baseHeight(x, z) {
    const [env, minD] = this.envelope(x, z);
    const n = this.noise, n2 = this.noise2;
    let h = env;
    h += fbm(n, x / 70, z / 70, 4) * 16 * smoothstep(10, 90, minD);
    h -= Math.abs(n2(x / 34, z / 34)) * 7 * smoothstep(12, 70, minD);
    h += fbm(n2, x / 8, z / 8, 3) * (0.35 + 1.2 * smoothstep(2.5, 25, minD));
    h += fbm(n, x / 2.2, z / 2.2, 2) * 0.12 * smoothstep(1, 4, minD);
    for (const p of this.peaks) {
      const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
      const ph = p.h * Math.exp(-d2 * 1.6) + fbm(n, x / 40, z / 40, 3) * 10 * Math.exp(-d2);
      h = smax(h, ph - 25 * (1 - Math.exp(-d2)), 14);
    }
    // valle sin mar: el terreno lejano se apoya en un piso (con ondulación suave)
    if (this.theme.floor != null) {
      const fl = this.theme.floor + fbm(n, x / 120, z / 120, 3) * 6;
      h = smax(h, fl, 8);
    } else if (this.theme.scenery === 'lurin') {
      // valle de Lurín: llano a la derecha del trail; el mar queda lejos a la izquierda
      const b = this.trail.bounds;
      const land = smoothstep(b.minX - 900, b.minX - 300, x);
      const fl = 3 + fbm(n, x / 140, z / 140, 3) * 4;
      h = lerp(h, smax(h, fl, 6), land);
    }
    return [h, minD];
  }

  /**
   * Altura del terreno en (x,z). info (opcional) recibe:
   *   s, o (coords del trail), e (distancia al borde de línea, ≤0 dentro), dOut (fuera del corredor),
   *   onTrail, rough, loose, inCorridor
   */
  heightAt(x, z, info) {
    const [base, minD] = this.baseHeight(x, z);
    const near = this.trail.nearest(x, z, this._near);
    let h = base;
    if (info) {
      info.s = -1; info.o = 0; info.e = minD; info.dOut = minD; info.onTrail = false;
      info.rough = 1.4; info.loose = 0.8; info.inCorridor = false;
    }
    if (!near) return h;
    const tr = this.trail;
    const smp = tr.sampleAt(near.s, this._sample);
    const o = near.o;
    const dOut = o > smp.extR ? o - smp.extR : o < smp.extL ? smp.extL - o : 0;
    const bank = this.cfg.bankWidth;
    if (dOut < bank + 0.6) {
      const c = this._corr;
      const rel = tr.corridorHeight(near.s, o, c);
      const l = c.line;
      const rough = l ? l.rough : smp.rough;
      const e = c.e;
      const inLine = 1 - smoothstep(-0.05, 0.35, e);
      // micro-relieve: sendero (bumps finos) vs cascajo (irregular)
      const u = l ? (o - l.c) / Math.max(0.2, l.hw) : 1;
      const dish = Math.abs(u) < 1 ? -0.035 * (1 - u * u) : 0;
      const treadMicro = rough * (0.05 * this.noise(near.s * 0.45, o * 0.8) + 0.022 * this.noise2(near.s * 1.7, o * 2.3)) + dish;
      const rubbleMicro = 0.1 * fbm(this.noise2, x * 1.3, z * 1.3, 2) + 0.05;
      const tread = smp.y + rel + lerp(rubbleMicro, treadMicro, inLine);
      const t = smoothstep(0, bank, dOut);
      h = lerp(tread, base, t);
      if (info) {
        info.e = e; info.dOut = dOut; info.onTrail = e <= 0;
        info.rough = l ? lerp(1.1, l.rough, inLine) : 1.2;
        info.loose = l ? lerp(0.8, l.loose, inLine) : 0.8;
        info.inCorridor = dOut <= 0;
      }
    } else if (info) {
      info.dOut = dOut;
      info.e = dOut;
    }
    if (info) { info.s = near.s; info.o = o; }
    return h;
  }

  // ---------------------------------------------------------------------------
  //  Color (vertex colors) + atributo aRubble (textura de cascajo vs tierra compacta)
  // ---------------------------------------------------------------------------
  colorAt(x, z, h, slope, e, dOut, loose, rough, out) {
    const n = this.noise, n2 = this.noise2;
    // paleta de la ruta (tierra del Morro ocre-rojiza, arena de Pachacamac, granito de La Molina)
    const P = this.theme.palette;
    let r = P.base[0], g = P.base[1], b = P.base[2];
    const terra = smoothstep(0.15, 0.6, n(x / 45 + 11, z / 45 - 3));
    r = lerp(r, P.terra[0], terra * 0.7); g = lerp(g, P.terra[1], terra * 0.7); b = lerp(b, P.terra[2], terra * 0.7);
    const rocky = clamp(smoothstep(-0.25, 0.55, fbm(n2, x / 16, z / 16, 3)) * 0.8 + slope * 1.4, 0, 1);
    r = lerp(r, P.rocky[0], rocky * 0.7); g = lerp(g, P.rocky[1], rocky * 0.7); b = lerp(b, P.rocky[2], rocky * 0.7);
    const rubbleBand = smoothstep(0.05, 0.7, e) * (1 - smoothstep(9, 22, e));
    const rubble = Math.max(rubbleBand, rocky * 0.8, 0.35);
    r = lerp(r, P.rubble[0], rubbleBand * 0.5); g = lerp(g, P.rubble[1], rubbleBand * 0.5); b = lerp(b, P.rubble[2], rubbleBand * 0.5);
    const v = 1 + 0.07 * n(x / 3.1, z / 3.1);
    r *= v; g *= v; b *= v;
    if (e < 0.9) {
      const w = 1 - smoothstep(-0.15, 0.6, e);
      // tierra compacta clara; tierra suelta más amarilla y granulada; roca → gris
      let tr = P.tread[0], tg = P.tread[1], tb = P.tread[2];
      tr = lerp(tr, P.treadLoose[0], loose * 0.6); tg = lerp(tg, P.treadLoose[1], loose * 0.6); tb = lerp(tb, P.treadLoose[2], loose * 0.6);
      const grey = clamp((rough - 0.6) * 1.2, 0, 0.7);
      tr = lerp(tr, 0.7, grey); tg = lerp(tg, 0.6, grey); tb = lerp(tb, 0.52, grey);
      const center = smoothstep(-0.25, -0.02, -Math.abs(e + 0.3));
      tr -= center * 0.03; tg -= center * 0.03; tb -= center * 0.03;
      r = lerp(r, tr, w); g = lerp(g, tg, w); b = lerp(b, tb, w);
      out[3] = lerp(rubble, clamp(loose * 0.55 + grey * 0.6, 0, 1), w);
    } else out[3] = rubble;
    // chacras verdes del valle de Lurín / parques del valle de La Molina
    const sc = this.theme.scenery;
    if ((sc === 'lurin' && h > 0.8 && h < 16) || (sc === 'molina' && h < this.theme.floor + 6)) {
      const flat = 1 - smoothstep(0.05, 0.25, slope);
      const cell = Math.sin(Math.floor(x / 55) * 12.9898 + Math.floor(z / 40) * 78.233) * 43758.5453;
      const pick = cell - Math.floor(cell);
      const green = flat * (sc === 'lurin' ? (pick < 0.7 ? 1 : 0.3) : (pick < 0.35 ? 0.9 : 0));
      const gr = sc === 'lurin' ? [0.42 + pick * 0.12, 0.55 + pick * 0.08, 0.3] : [0.45, 0.52, 0.36];
      r = lerp(r, gr[0], green * 0.85); g = lerp(g, gr[1], green * 0.85); b = lerp(b, gr[2], green * 0.85);
    }
    if (this.theme.ocean && h < 3) {
      const wet = 1 - smoothstep(0.3, 3, h);
      r = lerp(r, 0.5, wet * 0.8); g = lerp(g, 0.47, wet * 0.8); b = lerp(b, 0.42, wet * 0.8);
      const foam = 1 - smoothstep(-0.1, 0.5, Math.abs(h - 0.15));
      r = lerp(r, 0.9, foam * 0.7); g = lerp(g, 0.9, foam * 0.7); b = lerp(b, 0.88, foam * 0.7);
    }
    out[0] = Math.pow(r, 2.2); out[1] = Math.pow(g, 2.2); out[2] = Math.pow(b, 2.2);
  }

  // ---------------------------------------------------------------------------
  //  Mallas
  // ---------------------------------------------------------------------------
  build(scene, collision) {
    this.collision = collision;
    const tex = makeGroundDetailTexture(this.seed);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.96, metalness: 0 });
    if (typeof document !== 'undefined') this.weatherU.uCloudTex.value = makeCloudTexture(this.seed);
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.weatherU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRubble;\nvarying float vRubble;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRubble = aRubble;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRubble;\nuniform float uWet; uniform float uClouds; uniform float uTime; uniform sampler2D uCloudTex;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.4 * uWet;')
        .replace(
          '#include <map_fragment>',
          `
        #ifdef USE_MAP
          vec4 texA = texture2D( map, vMapUv );
          vec4 texC = texture2D( map, vMapUv * 2.3 + vec2(0.11, 0.53) );
          vec4 texB = texture2D( map, vMapUv * 0.173 + vec2(0.37, 0.71) );
          float contrast = mix(0.6, 1.9, vRubble);
          vec3 detail = mix(vec3(0.84), texA.rgb, contrast);
          detail *= mix(vec3(1.0), texC.rgb * 1.18, vRubble * 0.8);
          diffuseColor.rgb *= detail * mix(0.82, 1.18, texB.r);
          // suelo húmedo (garúa): más oscuro y un poco más saturado
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.6, 0.56), uWet);
          // sombras de nubes que pasan (sol)
          float cl = texture2D(uCloudTex, vMapUv * 0.012 + uTime * vec2(0.0035, 0.0018)).r;
          diffuseColor.rgb *= 1.0 - smoothstep(0.48, 0.62, cl) * 0.45 * uClouds;
        #endif
        `,
        );
    };
    const grid = this.buildGrid();
    const ribbon = this.buildRibbon();
    grid.receiveShadow = true;
    ribbon.receiveShadow = true;
    scene.add(grid);
    scene.add(ribbon);
    this.gridMesh = grid;
    this.ribbonMesh = ribbon;
    this.buildRocks(scene);
  }

  axisCoords(min, max, cell, extent, center) {
    const inner = [];
    const n = Math.ceil((max - min) / cell);
    for (let i = 0; i <= n; i++) inner.push(min + (i * (max - min)) / n);
    const lo = [], hi = [];
    let step = cell, p = min;
    while (p > center - extent) { step *= 1.1; p -= step; lo.unshift(p); }
    step = cell; p = max;
    while (p < center + extent) { step *= 1.1; p += step; hi.push(p); }
    return [...lo, ...inner, ...hi];
  }

  buildGrid() {
    const b = this.trail.bounds;
    const m = this.cfg.innerMargin;
    const cell = this.cfg.innerCell;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const xs = this.axisCoords(b.minX - m, b.maxX + m, cell, this.cfg.outerExtent, cx);
    const zs = this.axisCoords(b.minZ - m, b.maxZ + m, cell, this.cfg.outerExtent, cz);
    const nx = xs.length, nz = zs.length;
    const count = nx * nz;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const meta = new Float32Array(count * 4);
    const info = {};
    let k = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = xs[i], z = zs[j];
        let h = this.heightAt(x, z, info);
        // bajo el corredor la grilla se hunde: la cinta fina dibuja el trail
        if (info.s >= 0 && info.dOut < 0.2) h -= 0.45;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
        meta[k * 4] = info.e; meta[k * 4 + 1] = info.dOut; meta[k * 4 + 2] = info.loose; meta[k * 4 + 3] = info.rough;
        k++;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, bb = a + 1, c = a + nx, d = c + 1;
        if ((i + j) & 1) idx.set([a, c, bb, bb, c, d], q);
        else idx.set([a, c, d, a, d, bb], q);
        q += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.getAttribute('normal');
    const col = new Float32Array(count * 3);
    const rub = new Float32Array(count);
    const c4 = [0, 0, 0, 0];
    for (let v = 0; v < count; v++) {
      this.colorAt(pos[v * 3], pos[v * 3 + 2], pos[v * 3 + 1], 1 - nrm.getY(v), meta[v * 4], meta[v * 4 + 1], meta[v * 4 + 2], meta[v * 4 + 3], c4);
      col[v * 3] = c4[0]; col[v * 3 + 1] = c4[1]; col[v * 3 + 2] = c4[2];
      rub[v] = c4[3];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRubble', new THREE.BufferAttribute(rub, 1));
    geo.computeBoundingSphere();
    this.gridInfo = { nx, nz, vertices: count };
    return new THREE.Mesh(geo, this.material);
  }

  /** Cinta fina que cubre el corredor completo (todas las líneas + hombros). */
  buildRibbon() {
    const tr = this.trail;
    const extra = this.cfg.bankWidth + 0.5;
    const sideCols = 8, midCols = 27;
    const cols = sideCols * 2 + midCols;
    const rowStep = 0.3;
    const rows = Math.floor(tr.length / rowStep) + 1;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const col = new Float32Array(rows * cols * 3);
    const rub = new Float32Array(rows * cols);
    const smp = {};
    const info = {};
    const c4 = [0, 0, 0, 0];
    const lateral = (c, lo, hi) => {
      if (c < sideCols) return lo - extra + (extra * c) / sideCols;
      if (c < sideCols + midCols) return lo + ((hi - lo) * (c - sideCols)) / (midCols - 1);
      return hi + (extra * (c - sideCols - midCols + 1)) / sideCols;
    };
    for (let r = 0; r < rows; r++) {
      const s = Math.min(r * rowStep, tr.length);
      tr.sampleAt(s, smp);
      const lo = smp.extL, hi = smp.extR;
      for (let c = 0; c < cols; c++) {
        const o = lateral(c, lo, hi);
        const x = smp.x + smp.rightX * o;
        const z = smp.z + smp.rightZ * o;
        let h = this.heightAt(x, z, info);
        const dOut = o > hi ? o - hi : o < lo ? lo - o : 0;
        h += 0.015 - smoothstep(extra * 0.55, extra, dOut) * 0.16;
        const k = r * cols + c;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
        this.colorAt(x, z, h, dOut > 0 ? 0.15 : 0.02, info.e, dOut, info.loose, info.rough, c4);
        col[k * 3] = c4[0]; col[k * 3 + 1] = c4[1]; col[k * 3 + 2] = c4[2];
        rub[k] = c4[3];
      }
    }
    const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
    let q = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
        idx.set([a, b, cc, b, d, cc], q);
        q += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRubble', new THREE.BufferAttribute(rub, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    if (geo.getAttribute('normal').getY(Math.floor(cols / 2)) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.computeVertexNormals();
    }
    return new THREE.Mesh(geo, this.material);
  }

  // ---------------------------------------------------------------------------
  //  Rocas: visuales instanciadas + colisión
  // ---------------------------------------------------------------------------
  /**
   * Roca angular fracturada (casco convexo de puntos aleatorios), como las piedras
   * partidas del Morro: caras planas, aristas vivas, base plana para asentarse.
   *   kind: 'boulder' (bloque irregular) · 'slab' (laja plana) · 'shard' (esquirla alargada) · 'pebble'
   */
  makeRockGeometry(rng, kind) {
    const pts = [];
    const granite = this.theme.rocks.style === 'granite';
    const n = kind === 'pebble' ? 11 : kind === 'boulder' ? (granite ? 60 : 26) : granite ? 34 : 18;
    const dims = {
      boulder: [1, 0.8, 0.88], slab: [1, 0.5, 0.8], shard: [1, 0.62, 0.55], pebble: [1, 0.65, 0.85],
    }[kind];
    for (let i = 0; i < n; i++) {
      // dirección aleatoria, radio irregular y un leve empuje hacia "caja" → caras planas irregulares
      let u = rng() * 2 - 1, v = rng() * 2 - 1, w = rng() * 2 - 1;
      const l = Math.hypot(u, v, w) || 1;
      u /= l; v /= l; w /= l;
      const r = granite ? 0.86 + rng() * 0.14 : 0.68 + rng() * 0.32; // granito: bloques redondeados por erosión
      const box = granite ? 0.08 : 0.22;
      const px = u * r * (1 - box) + Math.sign(u) * box * 0.8;
      const pz = w * r * (1 - box) + Math.sign(w) * box * 0.8;
      pts.push(new THREE.Vector3(px * dims[0], v * r * dims[1], pz * dims[2]));
    }
    // cara inferior plana (la roca se apoya/entierra)
    for (const p of pts) if (p.y < -dims[1] * 0.55) p.y = -dims[1] * 0.55;
    // bisel: aplasta un poco la cima para que no sea pirámide
    for (const p of pts) if (p.y > dims[1] * 0.8) p.y = dims[1] * (0.8 + (p.y / dims[1] - 0.8) * 0.4);
    let geo = new ConvexGeometry(pts);
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.computeVertexNormals(); // non-indexed → normales por cara (facetado)
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y - (bb.max.y - bb.min.y) * 0.25, -(bb.min.z + bb.max.z) / 2);
    geo.computeBoundingBox();
    const b2 = geo.boundingBox;
    geo.userData.top = b2.max.y;
    geo.userData.bottom = b2.min.y;
    geo.userData.ext = Math.max(-b2.min.x, b2.max.x, -b2.min.z, b2.max.z);
    return geo;
  }

  /** Material de roca: grano en triplanar, polvo sobre las caras de arriba, base más oscura. */
  makeRockMaterial() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
    if (typeof document === 'undefined') return mat; // (simulación sin navegador)
    const tex = this.material?.map || makeGroundDetailTexture(this.seed + 5);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGrain = { value: tex };
      Object.assign(shader.uniforms, this.weatherU);
      shader.uniforms.uDust = { value: new THREE.Color(this.theme.rocks.dust).convertSRGBToLinear() };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRockWorld; varying float vUpDot; varying float vLocalY;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLocalY = position.y;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 rw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          rw = modelMatrix * rw;
          vRockWorld = rw.xyz;
          vec3 nW = objectNormal;
          #ifdef USE_INSTANCING
            nW = mat3(instanceMatrix) * nW;
          #endif
          vUpDot = normalize(mat3(modelMatrix) * nW).y;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uGrain; uniform vec3 uDust;
          uniform float uWet; uniform float uClouds; uniform float uTime; uniform sampler2D uCloudTex;
          varying vec3 vRockWorld; varying float vUpDot; varying float vLocalY;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // grano triplanar (evita estiramientos en caras verticales)
          vec3 wp = vRockWorld * 1.7;
          float gx = texture2D(uGrain, wp.zy).r, gy = texture2D(uGrain, wp.xz).r, gz = texture2D(uGrain, wp.xy).r;
          float up = clamp(vUpDot, 0.0, 1.0);
          float side = 1.0 - up;
          float grain = mix(mix(gx, gz, 0.5), gy, up);
          diffuseColor.rgb *= mix(0.62, 1.34, grain);
          // vetas/manchas oscuras (óxido, líquen seco) de baja frecuencia
          float blot = texture2D(uGrain, vRockWorld.xz * 0.23 + vRockWorld.y * 0.11).r;
          diffuseColor.rgb *= mix(0.82, 1.08, smoothstep(0.55, 0.95, blot));
          // polvo del trail sobre las caras que miran arriba
          float dust = smoothstep(0.55, 0.95, up) * smoothstep(0.35, 0.8, grain + 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDust, dust * 0.3);
          // base más oscura: contacto con el suelo / tierra pegada
          float base = 1.0 - smoothstep(-0.05, 0.28, vLocalY);
          diffuseColor.rgb *= 1.0 - base * 0.35;
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;
          float cl = texture2D(uCloudTex, vRockWorld.xz / 3.0 * 0.012 + uTime * vec2(0.0035, 0.0018)).r;
          diffuseColor.rgb *= 1.0 - smoothstep(0.48, 0.62, cl) * 0.45 * uClouds;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.45 * uWet;');
    };
    return mat;
  }

  buildRocks(scene) {
    const rng = mulberry32(this.seed * 97 + 11);
    const tr = this.trail;
    const T = this.T;
    const col = this.collision;
    // variedad de formas: piedras chicas (bajo costo) y bloques/lajas/esquirlas grandes
    const kindsSmall = ['pebble', 'pebble', 'shard', 'slab'];
    const kindsBig = ['boulder', 'boulder', 'boulder', 'shard', 'slab', 'boulder'];
    const geos = [...kindsSmall, ...kindsBig].map((k) => this.makeRockGeometry(rng, k));
    const nSmall = kindsSmall.length;
    // paleta: roca gris, gris-beige, marrón y ocre oxidado (piedra del Morro)
    const palette = this.theme.rocks.colors;
    const near = geos.map(() => []);
    const far = geos.map(() => []);
    const info = {};
    const w = {};

    const add = (list, x, z, r, hAbove, collide) => {
      const g = this.heightAt(x, z, info);
      const vi = hAbove < 0.16 ? Math.floor(rng() * nSmall) : nSmall + Math.floor(rng() * (geos.length - nSmall));
      const geo = geos[vi];
      // la parte bajo tierra de la geometría queda enterrada: la roca "sale" del suelo
      const sxz = r / geo.userData.ext;
      const sy = hAbove / geo.userData.top;
      const tilt = hAbove < 0.4 ? 0.28 : 0.12;
      list[vi].push({
        x, y: g, z, sx: sxz * (0.85 + rng() * 0.3), sz: sxz * (0.85 + rng() * 0.3), sy,
        ry: rng() * Math.PI * 2, rx: (rng() - 0.5) * tilt, rz: (rng() - 0.5) * tilt,
        c: palette[Math.floor(rng() * palette.length)], v: 0.86 + rng() * 0.28,
      });
      if (collide && col) col.addRock(x, z, r * 0.92, hAbove, g + hAbove);
    };

    // 1) Rocas del diseño del trail — con colisión. Las grandes traen piedras sueltas alrededor.
    for (const spec of tr.buildRockSpecs()) {
      tr.toWorld(spec.s, spec.o, w);
      add(near, w.x, w.z, spec.r, spec.h, true);
      if (spec.h >= 0.35) {
        const k = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < k; i++) {
          const a = rng() * Math.PI * 2, d = spec.r * (1.05 + rng() * 0.5);
          const px = w.x + Math.cos(a) * d, pz = w.z + Math.sin(a) * d;
          const n = tr.nearest(px, pz, this._near);
          if (n) {
            const lines = tr.linesAt(n.s, this._tmpL || (this._tmpL = []));
            if (lines.some((l) => Math.abs(n.o - l.c) < l.hw + 0.1)) continue; // nunca sobre una línea
          }
          const sz = 0.06 + rng() * 0.12;
          add(near, px, pz, sz, sz * 0.6, false);
        }
      }
    }

    // 2) Rocas sueltas a los lados del corredor (bordes y campos, en racimos)
    const dens = T.rockDensity;
    const smp = {};
    for (let s = 0; s < tr.length; s += 0.5) {
      tr.sampleAt(s, smp);
      const rd = tr.rockDensity[Math.floor(s / tr.ds)] * dens;
      for (const side of [-1, 1]) {
        const edge = side > 0 ? smp.extR : smp.extL;
        const nEdge = Math.floor(1.3 * rd + rng());
        for (let i = 0; i < nEdge; i++) {
          const o = edge + side * (0.12 + Math.pow(rng(), 1.6) * 1.2);
          const size = 0.05 + Math.pow(rng(), 2.4) * 0.24 * Math.min(rd, 1.3);
          this.placeScatter(add, near, smp, o, size, rng, true);
        }
        const nField = Math.floor(4.5 * rd + rng());
        for (let i = 0; i < nField; i++) {
          const o = edge + side * (0.8 + Math.pow(rng(), 1.9) * 16);
          const big = rng() < 0.05 && Math.abs(o - edge) > 3;
          const size = big ? 0.45 + rng() * 0.5 : 0.07 + Math.pow(rng(), 2.4) * 0.38;
          const inReach = Math.abs(o - edge) < 5;
          this.placeScatter(add, inReach ? near : far, smp, o, size, rng, inReach);
        }
      }
    }
    // 3) pedrones en las laderas (con piedras alrededor)
    const b = tr.bounds;
    const m = this.cfg.innerMargin;
    const farCount = Math.floor(2400 * dens * (this.theme.farRocks ?? 1));
    const farScale = this.theme.rocks.style === 'granite' ? 1.6 : 1;
    for (let i = 0; i < farCount; i++) {
      const x = lerp(b.minX - m, b.maxX + m, rng());
      const z = lerp(b.minZ - m, b.maxZ + m, rng());
      const n = tr.nearest(x, z, this._near);
      if (n && n.d < tr.maxExtent + 4) continue;
      const size = (0.3 + Math.pow(rng(), 2.5) * 1.4) * farScale;
      add(far, x, z, size, size * 0.6, false);
      if (size > 0.8) for (let k = 0; k < 3; k++) {
        const a = rng() * Math.PI * 2, d = size * (1.1 + rng() * 0.8);
        add(far, x + Math.cos(a) * d, z + Math.sin(a) * d, size * (0.15 + rng() * 0.2), size * 0.12, false);
      }
    }

    const mat = this.makeRockMaterial();
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const make = (lists, cast) => {
      lists.forEach((list, vi) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geos[vi], mat, list.length);
        list.forEach((r, k) => {
          dummy.position.set(r.x, r.y, r.z);
          dummy.rotation.set(r.rx, r.ry, r.rz, 'YXZ');
          dummy.scale.set(r.sx, r.sy, r.sz);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
          color.setRGB(r.c[0] * r.v, r.c[1] * r.v, r.c[2] * r.v, THREE.SRGBColorSpace);
          im.setColorAt(k, color);
        });
        im.castShadow = cast;
        im.receiveShadow = true;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        scene.add(im);
      });
    };
    make(near, true);
    make(far, false);
    this.rockCounts = {
      near: near.reduce((a, l) => a + l.length, 0),
      far: far.reduce((a, l) => a + l.length, 0),
      collision: col ? col.rocks.length : 0,
    };
  }

  placeScatter(add, list, smp, o, size, rng, collide) {
    const x = smp.x + smp.rightX * o + (rng() - 0.5) * 0.5;
    const z = smp.z + smp.rightZ * o + (rng() - 0.5) * 0.5;
    // nada de rocas sueltas sobre otra línea del corredor
    const n = this.trail.nearest(x, z, this._near);
    if (n) {
      const p = this.trail.sampleAt(n.s, this._sample);
      if (n.o > p.extL - 0.1 && n.o < p.extR + 0.1) return;
    }
    const hAbove = size * 0.7;
    add(list, x, z, size, hAbove, collide);
  }
}

function smax(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(a, b, h) + k * h * (1 - h);
}
