import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/**
 * Elementos del trail: arco de meta con cinta, postes con cinta a lo largo de la
 * zona de meta y una pequeña rampa de salida. Cierre visual claro del recorrido.
 */
export function buildTrailProps(scene, trail, terrain) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 0.9 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#d0621c', roughness: 0.6, side: THREE.DoubleSide });
  const smp = {};

  // --- Arco de meta
  trail.sampleAt(trail.finishS, smp);
  const hw = Math.max(-smp.extL, smp.extR) + 1.1;
  const posts = [];
  for (const side of [-1, 1]) {
    const x = smp.x + smp.rightX * hw * side;
    const z = smp.z + smp.rightZ * hw * side;
    const y = terrain.heightAt(x, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), wood);
    post.position.set(x, y + 1.6, z);
    post.castShadow = true;
    group.add(post);
    posts.push(post.position);
  }
  const bannerW = hw * 2 + 0.3;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, 0.75), new THREE.MeshStandardMaterial({ map: makeBannerTexture(`FINISH · ${trail.route.name.toUpperCase()}`), roughness: 0.8, side: THREE.DoubleSide }));
  banner.position.set((posts[0].x + posts[1].x) / 2, Math.max(posts[0].y, posts[1].y) + 1.25, (posts[0].z + posts[1].z) / 2);
  banner.rotation.y = -smp.theta;
  banner.castShadow = true;
  group.add(banner);

  // --- Postes con cinta a ambos lados de la zona de meta (embudo)
  const postGeo = new THREE.CylinderGeometry(0.035, 0.04, 1.0, 6);
  for (const side of [-1, 1]) {
    const pts = [];
    for (let s = trail.finishS - 25; s < trail.length - 4; s += 5) {
      trail.sampleAt(s, smp);
      const off = (side > 0 ? smp.extR : smp.extL) + side * 0.9;
      const x = smp.x + smp.rightX * off, z = smp.z + smp.rightZ * off;
      const y = terrain.heightAt(x, z);
      const p = new THREE.Mesh(postGeo, wood);
      p.position.set(x, y + 0.5, z);
      group.add(p);
      pts.push(new THREE.Vector3(x, y + 0.9, z));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.06), tapeMat);
      tape.position.copy(a).lerp(b, 0.5);
      tape.lookAt(b);
      tape.rotateY(Math.PI / 2);
      group.add(tape);
    }
  }
  buildWoodFeatures(group, trail, terrain);
  scene.add(group);
  return group;
}

/** Acumula tablas/postes y los dibuja con instancing (cientos de piezas = 2 draw calls). */
class WoodBatch {
  constructor() { this.items = []; }
  add(pos, quat, sx, sy, sz, tone) { this.items.push({ pos: pos.clone(), quat: quat.clone(), sx, sy, sz, tone }); }
  build(group, material) {
    if (!this.items.length) return;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, this.items.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    this.items.forEach((it, i) => {
      m.compose(it.pos, it.quat, new THREE.Vector3(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.setRGB(it.tone, it.tone * 0.97, it.tone * 0.93));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
}

/** Cubierta de peralte: 4 tablas por repetición (vetas a lo ancho, juntas oscuras entre tablas). */
function makeDeckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const tones = ['#9c7a58', '#8a6b4d', '#a68462', '#7d6148'];
  for (let p = 0; p < 4; p++) {
    const y0 = p * 128;
    g.fillStyle = tones[p];
    g.fillRect(0, y0, 512, 128);
    // gris de intemperie
    g.fillStyle = `rgba(120,115,105,${0.1 + Math.random() * 0.15})`;
    g.fillRect(0, y0, 512, 128);
    for (let i = 0; i < 26; i++) {
      const y = y0 + 6 + Math.random() * 116;
      g.strokeStyle = `rgba(55,38,24,${0.12 + Math.random() * 0.2})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i + p) * 2.5);
      g.stroke();
    }
    // nudos y clavos
    g.fillStyle = 'rgba(60,40,25,0.5)';
    g.beginPath(); g.ellipse(80 + Math.random() * 350, y0 + 30 + Math.random() * 70, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,38,36,0.8)';
    for (const x of [24, 488]) for (const dy of [40, 88]) { g.beginPath(); g.arc(x, y0 + dy, 3, 0, Math.PI * 2); g.fill(); }
    // junta entre tablas
    g.fillStyle = 'rgba(25,18,12,0.85)';
    g.fillRect(0, y0, 512, 7);
    g.fillStyle = 'rgba(255,240,220,0.12)';
    g.fillRect(0, y0 + 7, 512, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Textura de madera (vetas) procedural para tablas. */
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#a07a55';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 64;
    g.strokeStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 25},${25},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 0.5 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) { // nudos
    g.fillStyle = 'rgba(70,45,28,0.5)';
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 64, 4 + Math.random() * 5, 2 + Math.random() * 2, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boulderGeometry(rng, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let u = rng() * 2 - 1, v = rng() * 2 - 1, w = rng() * 2 - 1;
    const l = Math.hypot(u, v, w) || 1;
    const r = 0.82 + rng() * 0.18;
    pts.push(new THREE.Vector3((u / l) * r, Math.max(-0.4, (v / l) * r), (w / l) * r));
  }
  const g = new ConvexGeometry(pts).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/**
 * Construcciones del trail:
 *  - peraltes de madera (superficie de tablas peraltada + muro con postes)
 *  - kickers de madera (tablas sobre la cara de la rampa + patas)
 *  - rampas de tablas que suben a una roca y caen (drop clásico)
 *  - caseta sobre cerro de rocas (Parque Ecológico) · pircas · letreros de sección
 */
function buildWoodFeatures(group, trail, terrain) {
  const tex = makeWoodTexture();
  const plankMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, color: '#ffffff' });
  const postMat = new THREE.MeshStandardMaterial({ color: '#6a4d35', roughness: 0.92 });
  const deckMat = new THREE.MeshStandardMaterial({ map: makeDeckTexture(), roughness: 0.82, side: THREE.DoubleSide });
  const planks = new WoodBatch();
  const posts = new WoodBatch();
  const smp = {};
  const w = {};
  const rng = mulberry(7);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const v = new THREE.Vector3();
  const tone = () => 0.8 + rng() * 0.35;
  const groundAt = (s, o) => { trail.toWorld(s, o, w); return terrain.heightAt(w.x, w.z); };

  for (const f of trail.features) {
    // ---- Peralte de madera: cubierta CONTINUA de tablas transversales (como un wallride),
    //      cada tabla va de adentro hacia el borde exterior; debajo, estructura de postes
    if (f.type === 'berm' && f.wood) {
      const step = 0.12;   // ancho de cada tabla (a lo largo de la curva)
      const N = 14;        // subdivisiones a lo ancho (curvatura del peralte)
      const sA = f.s + 0.4, sB = f.s + f.len - 0.4;
      const rows = Math.max(2, Math.round((sB - sA) / step) + 1);
      const pos = new Float32Array(rows * (N + 1) * 3);
      const uv = new Float32Array(rows * (N + 1) * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        const s = sA + (r / (rows - 1)) * (sB - sA);
        const bp = trail.bermProfile(f, s, 0);
        const hw = Math.abs(bp.wallO) - 0.75;
        const oIn = -f.dir * (hw + 0.05), oOut = bp.wallO;
        for (let k = 0; k <= N; k++) {
          const o = oIn + ((oOut - oIn) * k) / N;
          trail.toWorld(s, o, w);
          const i = r * (N + 1) + k;
          pos[i * 3] = w.x; pos[i * 3 + 1] = terrain.heightAt(w.x, w.z) + 0.035; pos[i * 3 + 2] = w.z;
          uv[i * 2] = k / N; uv[i * 2 + 1] = (s - sA) / (step * 4);
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let k = 0; k < N; k++) {
          const a0 = r * (N + 1) + k, a1 = a0 + 1, b0 = a0 + N + 1, b1 = b0 + 1;
          if (f.dir > 0) idx.push(a0, a1, b0, a1, b1, b0); else idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const deck = new THREE.Mesh(geo, deckMat);
      deck.receiveShadow = true;
      deck.castShadow = true;
      group.add(deck);

      // estructura bajo el borde exterior: postes hasta el suelo de afuera + larguero
      for (let s = sA; s <= sB; s += 0.7) {
        const bp = trail.bermProfile(f, s, 0);
        trail.sampleAt(s, smp);
        const top = groundAt(s, bp.wallO) + 0.02;
        const below = Math.min(top - 0.15, groundAt(s, bp.wallO + f.dir * 0.4));
        const hPost = top - below + 0.15;
        trail.toWorld(s, bp.wallO + f.dir * 0.04, w);
        e.set(0, -smp.theta, 0); q.setFromEuler(e);
        v.set(w.x, top - hPost / 2, w.z);
        posts.add(v, q, 0.09, hPost, 0.09, 0.9);
      }
      for (let s = sA; s < sB - 0.05; s += 0.5) {
        const sm = Math.min(sB, s + 0.5);
        const bp = trail.bermProfile(f, (s + sm) / 2, 0);
        trail.sampleAt((s + sm) / 2, smp);
        trail.toWorld((s + sm) / 2, bp.wallO + f.dir * 0.05, w);
        const y = groundAt((s + sm) / 2, bp.wallO) - 0.05;
        e.set(0, -smp.theta, 0); q.setFromEuler(e);
        v.set(w.x, y, w.z);
        planks.add(v, q, 0.05, 0.1, sm - s + 0.03, 0.7);
      }
    }

    // ---- Kicker de madera
    if (f.type === 'table' && f.wood) {
      const plankW = 0.14;
      const width = (f.w + 0.12) * 2;
      for (let u = -f.ramp + 0.08; u <= f.top; u += plankW + 0.012) {
        const s = f.s + u;
        trail.sampleAt(s, smp);
        const y = groundAt(s, f.o) + 0.02;
        const pitch = Math.atan2(groundAt(s - 0.1, f.o) - groundAt(s + 0.1, f.o), 0.2);
        trail.toWorld(s, f.o, w);
        e.set(pitch, -smp.theta, 0); q.setFromEuler(e);
        v.set(w.x, y, w.z);
        planks.add(v, q, width, 0.035, plankW, tone());
      }
      for (const side of [-1, 1]) {
        for (let u = -f.ramp * 0.6; u <= f.top + 0.01; u += Math.max(0.6, f.ramp * 0.3)) {
          const s = f.s + u;
          trail.sampleAt(s, smp);
          trail.toWorld(s, f.o + side * (width / 2 - 0.06), w);
          const top = terrain.heightAt(w.x, w.z);
          const hLeg = Math.max(0.12, u <= 0 ? f.h * ((u + f.ramp) / f.ramp) ** 2 : f.h);
          e.set(0, -smp.theta, 0); q.setFromEuler(e);
          v.set(w.x, top - hLeg / 2, w.z);
          posts.add(v, q, 0.08, hLeg, 0.08, 0.9);
        }
      }
    }

    // ---- Rampa de tablas que sube a una roca y cae (drop clásico)
    if (f.type === 'ledge' && f.wood) {
      const width = (f.w + 0.05) * 2;
      const rampStart = f.rockBase ? -f.rise : -f.rise * 0.7;
      const rampEnd = f.rockBase ? -1.1 : 0;
      for (let u = rampStart + 0.05; u <= rampEnd; u += 0.155) {
        const s = f.s + u;
        trail.sampleAt(s, smp);
        const y = groundAt(s, f.o) + 0.025;
        const pitch = Math.atan2(groundAt(s - 0.1, f.o) - groundAt(s + 0.1, f.o), 0.2);
        trail.toWorld(s, f.o, w);
        e.set(pitch, -smp.theta, 0); q.setFromEuler(e);
        v.set(w.x, y, w.z);
        planks.add(v, q, width, 0.035, 0.14, tone());
        if (Math.round(u / 0.155) % 4 === 0) {
          for (const side of [-1, 1]) {
            trail.toWorld(s, f.o + side * (width / 2 - 0.05), w);
            const gy = groundAt(s, f.o) - 0.0;
            const legH = Math.max(0.1, f.h * smoothstepJS(-f.rise, -f.rise * 0.3, u));
            e.set(0, -smp.theta, 0); q.setFromEuler(e);
            v.set(w.x, gy - legH / 2, w.z);
            posts.add(v, q, 0.08, legH, 0.08, 0.9);
          }
        }
      }
      if (f.rockBase) {
        // la roca grande bajo el borde del drop
        const geo = boulderGeometry(rng, 46);
        const rockMat = new THREE.MeshStandardMaterial({ color: terrain.theme.rocks.colors[1].length ? new THREE.Color().setRGB(...terrain.theme.rocks.colors[1], THREE.SRGBColorSpace) : '#8a8075', roughness: 0.95, flatShading: true });
        const rock = new THREE.Mesh(geo, rockMat);
        trail.sampleAt(f.s - 0.7, smp);
        trail.toWorld(f.s - 0.7, f.o, w);
        const gy = groundAt(f.s + 1.5, f.o);
        rock.scale.set(width * 0.75, f.h + 0.25, 1.3);
        rock.position.set(w.x, gy + (f.h + 0.25) * 0.35, w.z);
        rock.rotation.set(0, -smp.theta, 0);
        rock.castShadow = rock.receiveShadow = true;
        group.add(rock);
        // rocas apiladas a los lados
        for (let k = 0; k < 4; k++) {
          const side = k % 2 ? 1 : -1;
          const r2 = new THREE.Mesh(geo, rockMat);
          const sz = 0.4 + rng() * 0.4;
          trail.toWorld(f.s - 1.2 + rng() * 1.6, f.o + side * (width / 2 + 0.3 + rng() * 0.4), w);
          r2.scale.set(sz, sz * 0.8, sz);
          r2.position.set(w.x, terrain.heightAt(w.x, w.z) + sz * 0.2, w.z);
          r2.rotation.y = rng() * 6;
          r2.castShadow = true;
          group.add(r2);
        }
      }
    }
  }

  // ---- Pircas, caseta y letreros (por sección)
  trail.sections.forEach((sec, si) => {
    const s0 = trail.sectionStarts[si];
    const L = trail.L;
    if (sec.walls) buildPircas(group, trail, terrain, s0 + sec.walls.from * L, s0 + sec.walls.to * L, rng);
    if (sec.landmark && sec.landmark.type === 'caseta') buildCaseta(group, trail, terrain, s0 + sec.landmark.at * L, sec.landmark.o, rng);
    if (si > 0 && sec.id !== 'finish') buildSign(group, trail, terrain, s0 + 2, sec.name, posts);
  });

  planks.build(group, plankMat);
  posts.build(group, postMat);
}

function smoothstepJS(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Pircas: muros bajos de piedra seca a ambos lados del sendero. */
function buildPircas(group, trail, terrain, sA, sB, rng) {
  const geo = boulderGeometry(rng, 14);
  const pts = [];
  const smp = {};
  for (let s = sA; s < sB; s += 0.45) {
    trail.sampleAt(s, smp);
    for (const side of [-1, 1]) {
      const o = (side > 0 ? smp.extR : smp.extL) + side * 0.55;
      for (let row = 0; row < 3; row++) {
        const x = smp.x + smp.rightX * o + (rng() - 0.5) * 0.12;
        const z = smp.z + smp.rightZ * o + (rng() - 0.5) * 0.12;
        const y = terrain.heightAt(x, z) + 0.12 + row * 0.24;
        pts.push({ x, y, z, s: 0.17 + rng() * 0.08, r: rng() * 6, th: smp.theta });
      }
    }
  }
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), pts.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  pts.forEach((p, i) => {
    d.position.set(p.x, p.y, p.z); d.rotation.set(rng() * 0.4, p.r, rng() * 0.4); d.scale.set(p.s * 1.4, p.s, p.s * 1.1); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    const t = 0.5 + rng() * 0.18;
    im.setColorAt(i, c.setRGB(t, t * 0.95, t * 0.9, THREE.SRGBColorSpace));
  });
  im.castShadow = true; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  group.add(im);
}

/** La caseta del Parque Ecológico: mirador sobre un cerro de rocas apiladas. */
function buildCaseta(group, trail, terrain, s, o, rng) {
  const smp = trail.sampleAt(s, {});
  const x = smp.x + smp.rightX * o, z = smp.z + smp.rightZ * o;
  const gy = terrain.heightAt(x, z);
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#9b948a', roughness: 0.95, flatShading: true });
  const geo = boulderGeometry(rng, 30);
  // cerro de rocas
  for (let i = 0; i < 16; i++) {
    const r = 0.8 + rng() * 1.1;
    const a = rng() * Math.PI * 2, d = rng() * 2.4;
    const m = new THREE.Mesh(geo, rockMat);
    m.scale.set(r * 1.2, r * 0.9, r);
    m.position.set(Math.cos(a) * d, r * 0.5 + (2.4 - d) * 0.6, Math.sin(a) * d);
    m.rotation.y = rng() * 6;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const white = new THREE.MeshStandardMaterial({ color: '#ecebe4', roughness: 0.8 });
  const green = new THREE.MeshStandardMaterial({ color: '#6f9a3c', roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#3d4a52', roughness: 0.15, metalness: 0.5 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.9 });
  const baseY = 3.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 4.2), green);
  deck.position.y = baseY;
  g.add(deck);
  const room = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 2.8), white);
  room.position.y = baseY + 1.3;
  g.add(room);
  for (const [px, pz, ry] of [[0, 1.41, 0], [0, -1.41, 0], [1.41, 0, Math.PI / 2], [-1.41, 0, Math.PI / 2]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.0), glass);
    win.position.set(px, baseY + 1.75, pz);
    win.rotation.y = ry;
    if (pz < 0 || px < 0) win.rotation.y += Math.PI;
    g.add(win);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.06), green);
    trim.position.set(px * 1.01, baseY + 1.22, pz * 1.01);
    trim.rotation.y = ry;
    g.add(trim);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 4.6), roofMat);
  roof.position.y = baseY + 2.65;
  roof.rotation.x = 0.08;
  g.add(roof);
  // baranda verde
  for (let i = 0; i < 4; i++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.06), green);
    rail.position.set(0, baseY + 0.95, 0);
    rail.rotation.y = (i * Math.PI) / 2;
    rail.translateZ(2.08);
    g.add(rail);
    for (let k = -2; k <= 2; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), green);
      p.position.set(0, baseY + 0.5, 0);
      p.rotation.y = (i * Math.PI) / 2;
      p.translateZ(2.08); p.translateX(k);
      g.add(p);
    }
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(x, gy - 0.4, z);
  g.rotation.y = -smp.theta + 0.3;
  group.add(g);
}

/** Letrero de madera al inicio de cada sección. */
function buildSign(group, trail, terrain, s, name, posts) {
  const smp = trail.sampleAt(s, {});
  const o = smp.extR + 1.0;
  const x = smp.x + smp.rightX * o, z = smp.z + smp.rightZ * o;
  const y = terrain.heightAt(x, z);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9c7650'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * 22, 512, 2);
  g.fillStyle = '#2b1d12';
  g.font = '700 54px "Barlow Condensed", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name.toUpperCase(), 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.04), [
    new THREE.MeshStandardMaterial({ color: '#8a6745' }), new THREE.MeshStandardMaterial({ color: '#8a6745' }),
    new THREE.MeshStandardMaterial({ color: '#8a6745' }), new THREE.MeshStandardMaterial({ color: '#8a6745' }),
    new THREE.MeshStandardMaterial({ map: t }), new THREE.MeshStandardMaterial({ map: t }),
  ]);
  board.position.set(x, y + 1.0, z);
  board.rotation.y = -smp.theta + Math.PI / 2 - 0.5;
  board.castShadow = true;
  group.add(board);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -smp.theta, 0));
  posts.add(new THREE.Vector3(x, y + 0.45, z), q, 0.08, 1.0, 0.08, 0.85);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBannerTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#e9dcc6';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1d1a16';
  for (let i = 0; i < c.width; i += 40) { g.fillRect(i, 0, 20, 14); g.fillRect(i + 20, c.height - 14, 20, 14); }
  let size = 84;
  g.font = `800 ${size}px "Barlow Condensed", system-ui, sans-serif`;
  while (g.measureText(text).width > c.width - 60 && size > 40) { size -= 4; g.font = `800 ${size}px "Barlow Condensed", system-ui, sans-serif`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
