import { createNoise2D, mulberry32, clamp, lerp, smoothstep } from '../utils/noise.js';
import { ROUTES } from './routes/index.js';

const DEG = Math.PI / 180;

/**
 * Trail completo (Milestone 2).
 *
 * - Eje central 3D por secciones (curvatura suavizada + pendiente reescalada).
 * - Micro-líneas físicas: se separan del eje y vuelven a juntarse (sin UI).
 * - Relieve en coordenadas del trail (s, o): rollers, ledges (escalones/drops),
 *   tables (kicker + mesa + landing), huecos, surcos, peralte, camber, divisores.
 * - Propiedades de superficie por punto: grip, tierra suelta, rugosidad.
 *
 * Convenciones:
 *   heading θ = 0 mira hacia −Z; θ positivo gira a la derecha (+X)
 *   dir = (sin θ, 0, −cos θ) · right = (cos θ, 0, sin θ) · o > 0 = derecha
 */
export class TrailGenerator {
  constructor(config, tuning, seed = 1, route = ROUTES.morro) {
    this.route = route;
    this.cfg = config;
    this.T = tuning;
    this.seed = seed;
    this.noise = createNoise2D(seed * 7 + 3);
    this.ds = 0.5;
    this._lines = [];
    for (let i = 0; i < 8; i++) this._lines.push({});
    this.build();
  }

  build() {
    const T = this.T;
    const cfg = this.cfg;
    const ds = this.ds;
    this.L = T.trailLength * (this.route.lengthScale || 1);
    const L = this.L;
    const route = this.route;
    const FINISH_SECTION = route.finish;
    this.finishGrade = FINISH_SECTION.grade;
    const sections = [...route.buildSections(T), { ...FINISH_SECTION, path: [['S', 10 + cfg.finishRunout]] }];
    this.sections = sections;
    const finishIdx = sections.length - 1;

    // 1) Curvatura cruda por muestra
    const kRaw = [];
    const secIdx = [];
    const sectionStarts = [];
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      sectionStarts.push(kRaw.length * ds);
      const scale = si === finishIdx ? 1 : L;
      for (const cmd of sec.path) {
        if (cmd[0] === 'S') {
          const n = Math.max(1, Math.round((cmd[1] * scale) / ds));
          for (let i = 0; i < n; i++) { kRaw.push(0); secIdx.push(si); }
        } else {
          const ang = cmd[1] * DEG * T.curveIntensity;
          const radius = Math.max(3.5, cmd[2] * scale);
          const n = Math.max(1, Math.round((Math.abs(ang) * radius) / ds));
          const k = ang / (n * ds);
          for (let i = 0; i < n; i++) { kRaw.push(k); secIdx.push(si); }
        }
      }
    }
    const N = kRaw.length + 1;
    this.count = N;
    this.length = (N - 1) * ds;
    this.sectionStarts = sectionStarts;
    this.finishS = sectionStarts[finishIdx] + 10;
    this.finishSection = finishIdx;
    const finishCount = Math.round(sectionStarts[finishIdx] / ds);

    const boxSmooth = (arr, windowM) => {
      const w = Math.max(1, Math.round(windowM / ds / 2));
      const out = new Float32Array(arr.length);
      const pre = new Float64Array(arr.length + 1);
      for (let i = 0; i < arr.length; i++) pre[i + 1] = pre[i] + arr[i];
      for (let i = 0; i < arr.length; i++) {
        const a = Math.max(0, i - w), b = Math.min(arr.length, i + w + 1);
        out[i] = (pre[b] - pre[a]) / (b - a);
      }
      return out;
    };
    let kappa = boxSmooth(kRaw, cfg.curvatureSmoothing);
    kappa = boxSmooth(Array.from(kappa), cfg.curvatureSmoothing * 0.5);

    const prop = (fn) => {
      const a = new Array(N);
      for (let i = 0; i < N; i++) a[i] = fn(sections[secIdx[Math.min(i, N - 2)]], i);
      return a;
    };
    this.halfW = boxSmooth(prop((s) => (s.width * T.trailWidth) / 2), 8);
    this.rough = boxSmooth(prop((s) => s.rough), 8);
    this.loose = boxSmooth(prop((s) => s.loose), 10);
    this.camber = boxSmooth(prop((s) => s.camber || 0), 16);
    this.ruts = boxSmooth(prop((s) => (s.ruts ? 1 : 0)), 10);
    this.expL = boxSmooth(prop((s) => s.exposure[0]), 20);
    this.expR = boxSmooth(prop((s) => s.exposure[1]), 20);
    this.rockDensity = boxSmooth(prop((s) => s.rockDensity), 10);
    const gradeRel = boxSmooth(prop((s, i) => (i >= finishCount ? 0 : s.grade)), 14);

    // 2) Planta
    const x = new Float32Array(N), z = new Float32Array(N), y = new Float32Array(N);
    const theta = new Float32Array(N);
    let th = 0, px = 0, pz = 0;
    for (let i = 0; i < N; i++) {
      x[i] = px; z[i] = pz; theta[i] = th;
      const k = kappa[Math.min(i, N - 2)];
      const thMid = th + k * ds * 0.5;
      px += Math.sin(thMid) * ds;
      pz -= Math.cos(thMid) * ds;
      th += k * ds;
    }

    // 3) Elevación: pendientes relativas reescaladas para cumplir elevationDrop
    let sumG = 0;
    for (let i = 0; i < finishCount; i++) sumG += gradeRel[i] * ds;
    const gScale = sumG > 0 ? T.elevationDrop / sumG : 0;
    const grade = new Float32Array(N);
    let py = route.startElevation ?? cfg.startElevation;
    for (let i = 0; i < N; i++) {
      y[i] = py;
      const g = i < finishCount ? gradeRel[i] * gScale : FINISH_SECTION.grade;
      grade[i] = g;
      py -= g * ds;
    }
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      const fade = clamp(s / 20, 0, 1) * (1 - smoothstep(this.finishS - 20, this.finishS, s));
      y[i] += fade * this.rough[i] * (0.18 * this.noise(s / 11, 3.7) + 0.06 * this.noise(s / 4.5, 9.1));
    }
    this.x = x; this.y = y; this.z = z; this.theta = theta;
    this.kappa = Float32Array.from([...kappa, kappa[kappa.length - 1]]);
    this.grade = grade;
    this.secIdx = Int16Array.from([...secIdx, secIdx[secIdx.length - 1]]);
    this.gradeScale = gScale;

    this.buildLines();
    this.buildFeatures();
    this.buildExtents();

    this.sectionStats = sections.map((sec, si) => {
      const a = Math.round(sectionStarts[si] / ds);
      const b = si + 1 < sections.length ? Math.round(sectionStarts[si + 1] / ds) : N - 1;
      return { name: sec.name, start: sectionStarts[si], length: (b - a) * ds, grade: si === finishIdx ? this.finishGrade : sec.grade * gScale, dropM: y[a] - y[b] };
    });

    this.buildBounds();
    this.buildSpatialHash();
    this.buildCoarseSegments();
  }

  // ---------------------------------------------------------------------------
  //  Líneas
  // ---------------------------------------------------------------------------
  buildLines() {
    const T = this.T;
    const L = this.L;
    this.lines = [];
    this.groups = {};
    this.sections.forEach((sec, si) => {
      const s0 = this.sectionStarts[si];
      for (const l of sec.lines || []) {
        const line = {
          id: l.id, name: l.name, group: l.group, section: si,
          s0: s0 + l.from * L, s1: s0 + l.to * L, blend: (l.blend ?? 5) * L,
          offset: l.offset, hw: l.hw * T.trailWidth, height: l.height || 0,
          rough: l.rough ?? sec.rough, loose: l.loose ?? sec.loose, grip: l.grip || 0, berm: l.berm || 0,
          wiggle: l.wiggle ? { amp: l.wiggle.amp, period: l.wiggle.period * L } : null,
        };
        this.lines.push(line);
        const g = this.groups[l.group] || (this.groups[l.group] = { id: l.group, section: si, s0: line.s0, s1: line.s1, lines: [], divider: 0 });
        g.lines.push(line);
        g.s0 = Math.min(g.s0, line.s0); g.s1 = Math.max(g.s1, line.s1);
      }
      for (const d of sec.dividers || []) if (this.groups[d.group]) this.groups[d.group].divider = d.height;
    });
    this.groupList = Object.values(this.groups);
  }

  lineAmount(line, s) {
    if (s <= line.s0 || s >= line.s1) return 0;
    return smoothstep(line.s0, line.s0 + line.blend, s) * (1 - smoothstep(line.s1 - line.blend, line.s1, s));
  }

  lineCenter(line, s, a = this.lineAmount(line, s)) {
    let c = line.offset * a;
    if (line.wiggle) c += line.wiggle.amp * Math.sin((2 * Math.PI * (s - line.s0)) / line.wiggle.period) * a * a;
    return c;
  }

  /**
   * Líneas activas en s. Cada una: { id, line, c (centro lateral), hw, h, rough, loose, grip, berm, a }.
   * La línea principal (id 'main') se angosta y desaparece donde hay micro-líneas.
   */
  linesAt(s, out = []) {
    out.length = 0;
    const i = clamp(Math.floor(s / this.ds), 0, this.count - 1);
    const hwMain = this.halfW[i];
    let maxA = 0;
    let k = 0;
    for (const line of this.lines) {
      const a = this.lineAmount(line, s);
      if (a <= 0.001) continue;
      maxA = Math.max(maxA, a);
      const o = this._lines[k] || (this._lines[k] = {});
      o.id = line.id; o.line = line; o.a = a;
      o.c = this.lineCenter(line, s, a);
      o.hw = lerp(hwMain, line.hw, a);
      o.h = line.height * a;
      o.rough = lerp(this.rough[i], line.rough, a);
      o.loose = lerp(this.loose[i], line.loose, a);
      o.grip = line.grip * a;
      o.berm = line.berm * a;
      out.push(o);
      k++;
    }
    const presence = 1 - maxA;
    if (presence > 0.02) {
      const o = this._lines[k] || (this._lines[k] = {});
      o.id = 'main'; o.line = null; o.a = presence;
      o.c = 0; o.hw = hwMain * smoothstep(0, 0.6, presence); o.h = 0;
      o.rough = this.rough[i]; o.loose = this.loose[i]; o.grip = 0; o.berm = 0;
      out.push(o);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  //  Features de relieve
  // ---------------------------------------------------------------------------
  buildFeatures() {
    const L = this.L;
    this.features = [];
    this.sections.forEach((sec, si) => {
      const s0 = this.sectionStarts[si];
      for (const f of sec.features || []) {
        const g = { ...f, section: si, s: s0 + f.at * L, o: f.o ?? 0, w: f.w ?? 12, soft: f.soft ?? 0.8 };
        if (f.type === 'roller' || f.type === 'hole') { g.len = f.len * L; g.sMin = g.s; g.sMax = g.s + g.len; }
        if (f.type === 'ledge') { g.rise = f.rise * L; g.edge = f.edge ?? 0.25; g.landing = f.landing || 0; g.sMin = g.s - g.rise; g.sMax = g.s + g.edge + (g.landing ? 14 : 0); }
        if (f.type === 'table') { g.ramp = f.ramp * L; g.top = f.top * L; g.land = f.land * L; g.sMin = g.s - g.ramp; g.sMax = g.s + g.top + g.land; }
        if (f.type === 'berm') { g.len = f.len * L; g.sMin = g.s; g.sMax = g.s + g.len; g.w = 99; }
        this.features.push(g);
      }
    });
    this.features.sort((a, b) => a.sMin - b.sMin);
  }

  /** Altura aportada por los features en (s, o). */
  featureHeight(s, o) {
    let h = 0;
    for (const f of this.features) {
      if (f.sMin > s) break;
      if (s > f.sMax) continue;
      const lat = 1 - smoothstep(f.w, f.w + f.soft, Math.abs(o - f.o));
      if (lat <= 0) continue;
      const u = s - f.s;
      let fh = 0;
      if (f.type === 'roller') fh = f.h * 0.5 * (1 - Math.cos((2 * Math.PI * u) / f.len));
      else if (f.type === 'hole') fh = -f.h * 0.5 * (1 - Math.cos((2 * Math.PI * u) / f.len));
      else if (f.type === 'ledge') {
        if (u <= 0) fh = f.h * smoothstep(-f.rise, -f.rise * 0.3, u);
        else fh = f.h * (1 - smoothstep(0, f.edge, u));
        // zona de aterrizaje más empinada (se compensa suavemente después)
        if (f.landing && u > 0) fh -= f.landing * (smoothstep(0.2, 5, u) - smoothstep(5, 14, u));
      } else if (f.type === 'berm') {
        fh = this.bermProfile(f, s, o).h;
      } else if (f.type === 'table') {
        if (u <= 0) { const t = (u + f.ramp) / f.ramp; fh = f.h * t * t; }
        else if (u <= f.top) fh = f.h;
        else fh = f.h * (1 - smoothstep(f.top, f.top + f.land, u));
      }
      h += fh * lat;
    }
    return h;
  }

  /** Pircas (muros de piedra) en s: { lo, hi } offsets de los muros, o null. */
  wallsAt(s) {
    const si = this.sectionAt(s);
    const sec = this.sections[si];
    if (!sec || !sec.walls) return null;
    const s0 = this.sectionStarts[si];
    const L = this.L;
    if (s < s0 + sec.walls.from * L || s > s0 + sec.walls.to * L) return null;
    const p = this.sampleAt(s, this._wallSmp || (this._wallSmp = {}));
    return { lo: p.extL - 0.4, hi: p.extR + 0.4 };
  }

  /**
   * Peralte: el lado exterior de la curva sube como una rampa lateral.
   * Devuelve { h (altura), bank (0–1, cuánto estás "arriba" del peralte), wallO (offset del muro) }.
   */
  bermProfile(f, s, o) {
    const u = s - f.s;
    const env = smoothstep(0, 4, u) * (1 - smoothstep(f.len - 4, f.len, u));
    const hw = this.halfW[clamp(Math.floor(s / this.ds), 0, this.count - 1)];
    const x = o * f.dir; // distancia hacia el exterior
    const t = clamp((x + hw) / (2 * hw + 0.6), 0, 1.25);
    return { h: f.h * env * Math.pow(t, 1.4), bank: env * clamp(t, 0, 1), wallO: f.dir * (hw + 0.75), env };
  }

  /** ¿La rueda está sobre una construcción de madera en (s, o)? */
  woodAt(s, o) {
    for (const f of this.features) {
      if (!f.wood || s < f.sMin - 4 || s > f.sMax + 4) continue;
      const u = s - f.s;
      if (f.type === 'berm') {
        if (u < 0.4 || u > f.len - 0.4) continue;
        const bp = this.bermProfile(f, s, o);
        const hw = Math.abs(bp.wallO) - 0.75;
        const x = o * f.dir;
        if (x > -hw - 0.05 && x < hw + 0.75) return true;
      } else if (f.type === 'table') {
        if (u > -f.ramp && u < f.top && Math.abs(o - f.o) < f.w + 0.12) return true;
      } else if (f.type === 'ledge') {
        const a = f.rockBase ? -f.rise : -f.rise * 0.7, b = f.rockBase ? -1.1 : 0;
        if (u > a && u < b + 0.1 && Math.abs(o - f.o) < f.w + 0.05) return true;
      }
    }
    return false;
  }

  /** Peralte activo en s (o null). */
  bermAt(s) {
    for (const f of this.features) {
      if (f.type !== 'berm') continue;
      if (s > f.sMin && s < f.sMax) return f;
    }
    return null;
  }

  /** Próximo feature adelante (para contextos de skills y bots). */
  featureAhead(s, o, maxDist, types) {
    let best = null, bestD = Infinity;
    for (const f of this.features) {
      if (f.sMin > s + maxDist + 20) break;
      if (types && !types.includes(f.type)) continue;
      const edgeS = f.type === 'roller' ? f.s + f.len * 0.5 : f.s; // lip / cresta
      const d = edgeS - s;
      if (d < -0.5 || d > maxDist) continue;
      if (Math.abs(o - f.o) > f.w + 0.3) continue;
      if (d < bestD) { bestD = d; best = f; }
    }
    return best ? { feature: best, dist: bestD } : null;
  }

  // ---------------------------------------------------------------------------
  //  Altura del corredor (relativa a y(s)) y superficie
  // ---------------------------------------------------------------------------
  /**
   * Devuelve la altura relativa del corredor en (s,o) y datos de superficie en out:
   *   out.e     distancia al borde de la línea más cercana (≤ 0 = dentro de una línea)
   *   out.line  línea más cercana · out.dOut distancia fuera del corredor (≥0)
   */
  corridorHeight(s, o, out) {
    const lines = this.linesAt(s, this._tmpLines || (this._tmpLines = []));
    const i = clamp(Math.floor(s / this.ds), 0, this.count - 1);
    let best = null, bestE = Infinity;
    let wSum = 0, hSum = 0;
    let lo = Infinity, hi = -Infinity;
    for (const l of lines) {
      const e = Math.abs(o - l.c) - l.hw;
      if (e < bestE) { bestE = e; best = l; }
      const w = 1 / ((Math.max(e, 0) + 0.3) ** 2);
      wSum += w; hSum += w * l.h;
      lo = Math.min(lo, l.c - l.hw); hi = Math.max(hi, l.c + l.hw);
    }
    let h = wSum > 0 ? hSum / wSum : 0;
    h += this.camber[i] * o;
    // divisores entre líneas de un grupo
    for (const g of this.groupList) {
      if (!g.divider || s <= g.s0 || s >= g.s1) continue;
      let cmin = Infinity, cmax = -Infinity, a = 0, eMin = Infinity;
      for (const l of lines) {
        if (!l.line || l.line.group !== g.id) continue;
        cmin = Math.min(cmin, l.c); cmax = Math.max(cmax, l.c); a = Math.max(a, l.a);
        eMin = Math.min(eMin, Math.abs(o - l.c) - l.hw);
      }
      if (o > cmin && o < cmax) h += g.divider * a * smoothstep(0.05, 0.9, eMin);
    }
    if (best) {
      const inBand = 1 - smoothstep(-0.05, 0.25, bestE);
      if (best.berm) h += -best.berm * (o - best.c) * inBand;
      const rut = this.ruts[i];
      if (rut > 0) {
        const d1 = (o - best.c - 0.2) / 0.09, d2 = (o - best.c + 0.2) / 0.09;
        h -= rut * 0.06 * (Math.exp(-d1 * d1) + Math.exp(-d2 * d2)) * inBand;
      }
    }
    h += this.featureHeight(s, o);
    if (out) {
      out.e = bestE; out.line = best;
      out.dOut = o > hi ? o - hi : o < lo ? lo - o : 0;
      out.lo = lo; out.hi = hi;
    }
    return h;
  }

  /** Propiedades de superficie en (s,o): grip, loose, rough, lineId, dOut. */
  surfaceAt(s, o, out = {}) {
    const c = this._surfTmp || (this._surfTmp = {});
    this.corridorHeight(s, o, c);
    const T = this.T;
    const l = c.line;
    const onLine = 1 - smoothstep(-0.05, 0.3, c.e);
    const lineGrip = l ? lerp(T.grip, T.looseGrip, l.loose) + l.grip : T.grip;
    const offGrip = c.dOut > 0 ? T.looseGrip * 0.75 : T.looseGrip * 0.88;
    out.grip = lerp(offGrip, lineGrip, onLine) * (T.weatherGripScale ?? 1);
    // peralte: mientras más arriba vas, más agarre lateral
    const berm = this.bermAt(s);
    out.bank = 0;
    if (berm) {
      const bp = this.bermProfile(berm, s, o);
      out.bank = bp.bank;
      out.grip += 0.45 * bp.bank * (berm.h / 0.8);
    }
    out.loose = l ? lerp(0.8, l.loose, onLine) : 0.8;
    out.rough = l ? lerp(c.dOut > 0 ? 1.4 : 1.1, l.rough, onLine) : 1.4;
    // madera (peraltes, kickers, rampas): lisa, sin tierra suelta
    out.wood = this.woodAt(s, o);
    if (out.wood) { out.rough = Math.min(out.rough, 0.15); out.loose = 0.05; }
    out.onLine = onLine > 0.5;
    out.lineId = onLine > 0.5 && l ? l.id : null;
    out.line = l;
    out.e = c.e;
    out.dOut = c.dOut;
    return out;
  }

  buildExtents() {
    const N = this.count;
    this.extL = new Float32Array(N);
    this.extR = new Float32Array(N);
    const tmp = [];
    for (let i = 0; i < N; i++) {
      const lines = this.linesAt(i * this.ds, tmp);
      let lo = 0, hi = 0;
      for (const l of lines) { lo = Math.min(lo, l.c - l.hw); hi = Math.max(hi, l.c + l.hw); }
      this.extL[i] = lo; this.extR[i] = hi;
    }
    this.maxExtent = Math.max(...this.extR, ...Array.from(this.extL, (v) => -v));
  }

  // ---------------------------------------------------------------------------
  //  Rocas del diseño (explícitas + campos aleatorios), en coordenadas (s, o)
  // ---------------------------------------------------------------------------
  buildRockSpecs() {
    const T = this.T;
    const L = this.L;
    const rng = mulberry32(this.seed * 53 + 17);
    const specs = [];
    const lineById = Object.fromEntries(this.lines.map((l) => [l.id, l]));
    this.sections.forEach((sec, si) => {
      const s0 = this.sectionStarts[si];
      for (const r of sec.rocks || []) {
        const s = s0 + r.at * L;
        let o = r.o;
        if (r.line) {
          const line = lineById[r.line];
          const a = this.lineAmount(line, s);
          const c = this.lineCenter(line, s, a);
          const wig = line.wiggle ? Math.sin((2 * Math.PI * (s - line.s0)) / line.wiggle.period) : 1;
          const side = r.avoid ? -Math.sign(wig || 1) : 1;
          o = c + side * (line.hw + r.r + 0.3);
        }
        specs.push({ s, o, r: r.r, h: r.h, designed: true });
      }
      for (const f of sec.rockFields || []) {
        const n = Math.round(f.count * T.rockDensity);
        for (let k = 0; k < n; k++) {
          const s = s0 + lerp(f.from, f.to, rng()) * L;
          let o;
          if (f.line) {
            const line = lineById[f.line];
            const a = this.lineAmount(line, s);
            if (a < 0.6) continue;
            o = this.lineCenter(line, s, a) + (rng() * 2 - 1) * f.spread;
          } else o = lerp(f.o0, f.o1, rng());
          const h = lerp(f.hMin, f.hMax, Math.pow(rng(), 1.5));
          specs.push({ s, o, r: Math.max(0.08, h * (1.1 + rng() * 0.6)), h, designed: true });
        }
      }
    });
    // seguridad: las rocas grandes nunca invaden una línea (salvo las que el diseño pone al borde)
    const tmp = [];
    return specs.filter((r) => {
      if (r.h < 0.3) return true;
      // no poner bloques donde las líneas todavía se están abriendo/cerrando
      for (const line of this.lines) {
        const a = this.lineAmount(line, r.s);
        if (a > 0 && a < 0.9 && !r.designed2) return false;
      }
      for (const l of this.linesAt(r.s, tmp)) {
        if (Math.abs(r.o - l.c) - l.hw - r.r * 0.8 < 0) return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  //  Geometría auxiliar
  // ---------------------------------------------------------------------------
  buildBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.count; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  buildSpatialHash() {
    const cell = 7;
    const b = this.bounds;
    const ox = b.minX - 30, oz = b.minZ - 30;
    const nx = Math.ceil((b.maxX - b.minX + 60) / cell) + 1;
    const nz = Math.ceil((b.maxZ - b.minZ + 60) / cell) + 1;
    const cells = new Array(nx * nz);
    for (let i = 0; i < this.count; i++) {
      const cx = Math.floor((this.x[i] - ox) / cell);
      const cz = Math.floor((this.z[i] - oz) / cell);
      const k = cz * nx + cx;
      (cells[k] || (cells[k] = [])).push(i);
    }
    this.hash = { cell, ox, oz, nx, nz, cells };
  }

  buildCoarseSegments() {
    const step = 8;
    const segs = [];
    const extra = 12;
    const th0 = this.theta[0];
    const pre = { x: this.x[0] - Math.sin(th0) * extra, z: this.z[0] + Math.cos(th0) * extra, y: this.y[0] + 0.3 };
    let prev = pre, prevI = 0;
    for (let i = 0; i < this.count; i += step) {
      const cur = { x: this.x[i], z: this.z[i], y: this.y[i] };
      segs.push(this.makeSeg(prev, cur, i === 0 ? 0 : prevI, i));
      prev = cur; prevI = i;
    }
    const iL = this.count - 1;
    const thL = this.theta[iL];
    const last = { x: this.x[iL], z: this.z[iL], y: this.y[iL] };
    segs.push(this.makeSeg(prev, last, prevI, iL));
    let p = last;
    for (let k = 1; k <= 12; k++) {
      const n = { x: last.x + Math.sin(thL) * 10 * k, z: last.z - Math.cos(thL) * 10 * k, y: last.y - 10 * k * (0.12 + k * 0.03) };
      segs.push(this.makeSeg(p, n, iL, iL));
      p = n;
    }
    this.segs = segs;
  }

  makeSeg(a, b, ia, ib) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = Math.max(1e-6, dx * dx + dz * dz);
    const len = Math.sqrt(len2);
    return {
      ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, dx, dz, len2,
      rx: -dz / len, rz: dx / len,
      expL: (this.expL[ia] + this.expL[ib]) / 2, expR: (this.expR[ia] + this.expR[ib]) / 2,
    };
  }

  sampleAt(s, out = {}) {
    const f = clamp(s / this.ds, 0, this.count - 1.0001);
    const i = Math.floor(f);
    const t = f - i;
    const j = i + 1;
    out.s = s;
    out.x = lerp(this.x[i], this.x[j], t);
    out.y = lerp(this.y[i], this.y[j], t);
    out.z = lerp(this.z[i], this.z[j], t);
    out.theta = lerp(this.theta[i], this.theta[j], t);
    out.kappa = lerp(this.kappa[i], this.kappa[j], t);
    out.halfW = lerp(this.halfW[i], this.halfW[j], t);
    out.rough = lerp(this.rough[i], this.rough[j], t);
    out.loose = lerp(this.loose[i], this.loose[j], t);
    out.extL = lerp(this.extL[i], this.extL[j], t);
    out.extR = lerp(this.extR[i], this.extR[j], t);
    out.grade = (this.y[i] - this.y[j]) / this.ds;
    out.section = this.secIdx[i];
    out.dirX = Math.sin(out.theta);
    out.dirZ = -Math.cos(out.theta);
    out.rightX = Math.cos(out.theta);
    out.rightZ = Math.sin(out.theta);
    return out;
  }

  /** Punto más cercano del eje a (x,z) en un radio de ~7 m (null si está lejos). */
  nearest(px, pz, out = {}) {
    const h = this.hash;
    const cx = Math.floor((px - h.ox) / h.cell);
    const cz = Math.floor((pz - h.oz) / h.cell);
    let best = -1, bestD = Infinity;
    for (let jz = cz - 1; jz <= cz + 1; jz++) {
      if (jz < 0 || jz >= h.nz) continue;
      for (let jx = cx - 1; jx <= cx + 1; jx++) {
        if (jx < 0 || jx >= h.nx) continue;
        const list = h.cells[jz * h.nx + jx];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const dx = px - this.x[i], dz = pz - this.z[i];
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    if (best < 0) return null;
    let bi = best, bt = 0, bd = bestD;
    for (const [a, b] of [[best - 1, best], [best, best + 1]]) {
      if (a < 0 || b >= this.count) continue;
      const ex = this.x[b] - this.x[a], ez = this.z[b] - this.z[a];
      const l2 = ex * ex + ez * ez;
      const t = clamp(((px - this.x[a]) * ex + (pz - this.z[a]) * ez) / l2, 0, 1);
      const qx = this.x[a] + ex * t, qz = this.z[a] + ez * t;
      const d = (px - qx) ** 2 + (pz - qz) ** 2;
      if (d <= bd) { bd = d; bi = a; bt = t; }
    }
    const j = Math.min(bi + 1, this.count - 1);
    const th = lerp(this.theta[bi], this.theta[j], bt);
    const cxp = lerp(this.x[bi], this.x[j], bt);
    const czp = lerp(this.z[bi], this.z[j], bt);
    out.s = (bi + bt) * this.ds;
    out.o = (px - cxp) * Math.cos(th) + (pz - czp) * Math.sin(th);
    out.d = Math.sqrt(bd);
    out.i = bi;
    return out;
  }

  /** Punto seguro para reaparecer después de un crash: unos metros adelante, sobre una línea, sin features. */
  safeRespawn(s, o, ahead = 6) {
    let s2 = Math.min(s + ahead, this.finishS - 2);
    for (let tries = 0; tries < 80; tries++) {
      const busy = this.features.some((f) => s2 > f.sMin - 1.5 && s2 < f.sMax + 1.5 && Math.abs(o - f.o) < f.w + f.soft + 1);
      if (!busy) break;
      s2 += 1;
    }
    s2 = Math.min(s2, this.length - 5);
    const lines = this.linesAt(s2, []);
    let best = 0, bd = Infinity;
    for (const l of lines) { const d = Math.abs(l.c - o); if (d < bd) { bd = d; best = l.c; } }
    return { s: s2, o: best };
  }

  /** Convierte (s, o) a (x, z) del mundo. */
  toWorld(s, o, out = {}) {
    const p = this.sampleAt(s, this._tw || (this._tw = {}));
    out.x = p.x + p.rightX * o;
    out.z = p.z + p.rightZ * o;
    return out;
  }

  sectionAt(s) {
    return this.secIdx[clamp(Math.floor(s / this.ds), 0, this.count - 1)];
  }
}
