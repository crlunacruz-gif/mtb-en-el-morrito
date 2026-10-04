import * as THREE from 'three';
import { bikeGeometry, makeBikeMaterials, resolveColors, buildCockpit, buildFrontEnd, buildFrame } from './bike/BikeParts.js';
import { makeSkinMaterial, makeFabricMaterial } from './bike/Skin.js';

/** Kits del rider: manga del jersey, puño, guantes y short. */
export const RIDER_KITS = {
  naranja: { label: 'Naranja · manga corta', sleeve: '#d0652b', cuff: '#ecebe6', glove: '#1f2023', glovePanel: '#ecebe6', shorts: '#4a3a31', bareArms: true, skin: '#b07a58' },
  gris: { label: 'Gris · manga corta', sleeve: '#b9bcc4', cuff: '#3c3f46', glove: '#1b1c1f', glovePanel: '#6a6d74', shorts: '#1d1e21', bareArms: true, skin: '#8a5a3e' },
  negro: { label: 'Negro · manga larga', sleeve: '#26282c', cuff: '#d0621c', glove: '#1a1b1d', glovePanel: '#e3e1db', shorts: '#1a1b1d', bareArms: false, skin: '#c89a78' },
};

/**
 * Bici + manos/brazos del rider vistos desde el POV.
 * Las piezas de la bici vienen de bike/BikeParts.js (las mismas del showroom del menú).
 * Coordenadas locales de la bici: origen en el suelo bajo el pedalier, −Z adelante, +Y arriba.
 */
export class BikeModel {
  constructor(config) {
    this.cfg = config;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.steerPivot = new THREE.Group(); // rota con el manubrio
    this.build();
  }

  build() {
    const c = this.cfg.cockpit;
    const cam = this.cfg.camera;
    const W = c.barWidth;
    const kit = RIDER_KITS[c.riderKit] || RIDER_KITS.naranja;
    const G = bikeGeometry(c, cam);
    const mats = makeBikeMaterials(resolveColors(this.cfg.bikeColors));
    this.mats = mats;
    const barZ = G.barZ, barY = G.barY;

    this.steerPivot.position.copy(G.stemTop);
    this.steerAxis = G.axis.clone().negate(); // apunta arriba-atrás
    this.group.add(this.steerPivot);
    const P = (x, y, z) => new THREE.Vector3(x, y, z).sub(G.stemTop); // bici → pivote

    buildCockpit(G, mats, this.steerPivot);
    const fw = buildFrontEnd(G, mats, this.steerPivot);
    this.wheel = fw.spin;
    this.wheelRadius = fw.radius;
    const frame = buildFrame(G, mats, { rearWheel: true, pov: true });
    this.rearWheel = frame.userData.rearSpin;
    this.group.add(frame);

    // ---- materiales del rider
    const mSkin = makeSkinMaterial(kit.skin || '#b07a58');
    const mGlove = makeFabricMaterial(kit.glove, { roughness: 0.8 });
    const mGlovePanel = makeFabricMaterial(kit.glovePanel, { roughness: 0.6, sheen: 0.2 });
    const mGrip = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
    const mSleeve = makeFabricMaterial(kit.sleeve, { roughness: 0.92, side: THREE.DoubleSide, vertexColors: true });
    const mCuff = makeFabricMaterial(kit.cuff, { roughness: 0.9 });
    void mCuff;

    for (const side of [-1, 1]) {
      const gx = side * (W / 2 - 0.065);
      const gc = P(gx, barY + 0.021, barZ + 0.032); // centro del puño
      // codo: algo más abierto que la mano y casi a la altura del manubrio → antebrazo recto hacia atrás,
      // perpendicular al manubrio, y muñeca neutra (la mano sigue la línea del antebrazo)
      const elbowPos = P(side * (W / 2 + 0.05), barY - 0.045, barZ + 0.33);
      const hand = buildGloveHand(gc, side, W, P(side * (W / 2 - 0.125), barY + 0.012, barZ - 0.03), elbowPos, mGlove, mGlovePanel, mGrip);
      this.steerPivot.add(hand.group);

      if (c.showArms) {
        const wrist = hand.wrist;
        // codos abiertos y flexionados (posición de ataque)
        const elbow = elbowPos;
        const forearm = makeForearm(wrist, elbow, side, kit.bareArms ? mSkin : mSleeve);
        this.steerPivot.add(forearm);
        const shoulder = P(side * 0.24, barY + 0.42, barZ + 0.62);
        const armMat = kit.bareArms ? mSkin : mSleeve;
        // brazo: sólo el tramo junto al codo (sin manga visible: en el POV se confundía con las piernas)
        const upper = makeLimb(elbow.clone().lerp(shoulder, 0.02), elbow.clone().lerp(shoulder, 0.3),
          [[0, 0], [0.03, 0.043], [0.3, 0.045], [0.75, 0.044], [0.92, 0.036], [1, 0]], armMat);
        this.steerPivot.add(upper);
        const ballGeo = new THREE.SphereGeometry(0.046, 20, 14);
        ballGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ballGeo.getAttribute('position').count * 3).fill(0.95), 3));
        const elbowBall = new THREE.Mesh(ballGeo, armMat);
        elbowBall.scale.set(1, 0.95, 0.9);
        elbowBall.position.copy(elbow);
        this.steerPivot.add(elbowBall);

        // puño elástico del guante sobre la muñeca
        const wdir = elbow.clone().sub(wrist).normalize();
        const gcuff = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.03, 6, 22), mGlove);
        gcuff.position.copy(wrist).addScaledVector(wdir, 0.012);
        gcuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wdir);
        gcuff.scale.set(1.08, 1, 0.74);
        this.steerPivot.add(gcuff);
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, 0.005), mGlove);
        tab.position.copy(wrist).addScaledVector(wdir, 0.016).add(new THREE.Vector3(0, 0.022, 0));
        tab.quaternion.copy(gcuff.quaternion);
        this.steerPivot.add(tab);
      }
    }

    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
  }

  /** steerAngle en radianes (+ = derecha), speed m/s. */
  update(dt, steerAngle, speed) {
    this.steerPivot.quaternion.setFromAxisAngle(this.steerAxis, -steerAngle);
    const w = (speed / this.wheelRadius) * dt;
    this.wheel.rotation.x -= w;
    if (this.rearWheel) this.rearWheel.rotation.x -= w;
  }
}

// ---------------------------------------------------------------------------
//  Mano con guante agarrando el puño
// ---------------------------------------------------------------------------
function capsuleBetween(a, b, r, mat, seg = 10) {
  const dir = b.clone().sub(a);
  const len = Math.max(0.001, dir.length());
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/**
 * Mano derecha/izquierda: dorso, 3 dedos (medio, anular, meñique) con 3 falanges que
 * envuelven el puño, índice extendido sobre la maneta (frenado con un dedo), pulgar
 * por debajo, protecciones de nudillos y palma acolchada.
 * El puño corre en X; los dedos rodean el eje del puño.
 */
function buildGloveHand(gc, side, W, leverTip, elbow, mGlove, mPanel, mGrip) {
  const g = new THREE.Group();
  // protecciones de goma: tono del guante, un poco más brillantes
  const mPad = mGlove.clone();
  mPad.color = mGlove.color.clone().lerp(mPanel.color, 0.05).multiplyScalar(0.85);
  mPad.roughness = 0.5;
  mPad.sheen = 0.1;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const R = 0.0165 + 0.0095; // radio puño + medio dedo
  const around = (x, ang, r = R) => gc.clone().add(v(x, Math.cos(ang) * r, -Math.sin(ang) * r)); // ang 0 = arriba, π/2 = adelante
  // dedos: offset x (hacia el extremo del manubrio = side+), longitudes de falanges, grosor
  const fingers = [
    { dx: -0.008, L: [0.046, 0.03, 0.024], r: 0.0098 },  // medio
    { dx: 0.013, L: [0.043, 0.028, 0.022], r: 0.0094 },  // anular
    { dx: 0.032, L: [0.034, 0.022, 0.019], r: 0.0084 },  // meñique
  ];
  for (const f of fingers) {
    const x = side * f.dx;
    // nudillo (MCP) arriba-atrás del puño; cada falange avanza un ángulo alrededor del puño
    let ang = -0.25;
    let p = around(x, ang, R + 0.004);
    const joints = [p];
    for (let i = 0; i < 3; i++) {
      ang += f.L[i] / R;
      const q = around(x, ang, R - i * 0.0012);
      joints.push(q);
    }
    for (let i = 0; i < 3; i++) {
      const rr = f.r * (1 - i * 0.1);
      g.add(capsuleBetween(joints[i], joints[i + 1], rr, mGlove));
    }
    // nudillo con protección
    const kn = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.95, 12, 8), mPad);
    kn.position.copy(joints[0]).add(v(0, 0.004, 0.002));
    kn.scale.set(1, 0.55, 1);
    g.add(kn);
    // protección de la falange media (gel)
    const mid = joints[1].clone().lerp(joints[2], 0.5);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(f.r * 1.02, 10, 8), mPad);
    pad.position.copy(mid).add(mid.clone().sub(gc).setX(0).normalize().multiplyScalar(0.003));
    pad.scale.set(0.9, 0.6, 0.9);
    g.add(pad);
  }

  // índice extendido sobre la maneta: MCP en el borde interior, 3 falanges hacia la punta de la maneta
  const iMcp = around(side * -0.03, -0.1, R + 0.004);
  const iPip = gc.clone().add(v(side * -0.033, 0.016, -0.04));
  const iDip = leverTip.clone().add(v(side * -0.018, 0.012, 0.004));
  const iTip = leverTip.clone().add(v(side * -0.006, -0.002, -0.012));
  g.add(capsuleBetween(iMcp, iPip, 0.0098, mGlove));
  g.add(capsuleBetween(iPip, iDip, 0.0088, mGlove));
  g.add(capsuleBetween(iDip, iTip, 0.008, mGlove));
  const ik = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), mPad);
  ik.position.copy(iMcp).add(v(0, 0.004, 0));
  ik.scale.set(1, 0.7, 1);
  g.add(ik);

  // dorso de la mano alineado con el antebrazo (muñeca recta): nudillos sobre el puño → muñeca
  const knRow = gc.clone().add(v(side * 0.006, R * 0.92, -0.002));
  const d = elbow.clone().sub(knRow).normalize();
  const wrist = knRow.clone().addScaledVector(d, 0.078);
  const n = v(0, 1, 0).sub(d.clone().multiplyScalar(d.y)).normalize(); // "arriba" de la mano
  const backGeo = new THREE.SphereGeometry(1, 24, 16);
  const orient = (m) => {
    const x = new THREE.Vector3().crossVectors(n, d).normalize();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, d));
  };
  const back = new THREE.Mesh(backGeo, mGlove);
  back.position.copy(knRow).lerp(wrist, 0.5).addScaledVector(n, -0.002);
  orient(back);
  back.scale.set(0.045, 0.017, 0.05);
  g.add(back);
  // palma: debajo del dorso, envolviendo la parte trasera del puño
  const palm = new THREE.Mesh(backGeo, mGlove);
  palm.position.copy(knRow).lerp(wrist, 0.55).addScaledVector(n, -0.024);
  orient(palm);
  palm.scale.set(0.043, 0.02, 0.045);
  g.add(palm);
  // eminencia tenar + pulgar (rodea el puño por abajo, del lado interior)
  const tBase = wrist.clone().add(v(side * -0.03, 0, 0)).addScaledVector(n, -0.022).addScaledVector(d, -0.015);
  const tMid = gc.clone().add(v(side * -0.047, -0.02, 0.014));
  const tTip = gc.clone().add(v(side * -0.04, -0.027, -0.016));
  g.add(capsuleBetween(tBase, tMid, 0.0128, mGlove));
  g.add(capsuleBetween(tMid, tTip, 0.0105, mGlove));
  const thenar = new THREE.Mesh(backGeo, mGlove);
  thenar.position.copy(tBase).lerp(knRow, 0.35).add(v(side * -0.006, 0, 0));
  orient(thenar);
  thenar.scale.set(0.02, 0.02, 0.03);
  g.add(thenar);
  void mGrip;
  return { group: g, wrist: wrist.clone().addScaledVector(n, -0.012) };
}
// ---------------------------------------------------------------------------
//  Anatomía del antebrazo
// ---------------------------------------------------------------------------
const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const lobe = (theta, center, sharp) => Math.pow(Math.max(0, Math.cos(theta - center)), sharp);

/**
 * Antebrazo en pronación (agarrando el manubrio), visto desde el casco.
 * Sección elíptica que pasa de muñeca plana y ancha (tendones) a un vientre muscular
 * redondeado en el tercio superior:
 *   - braquiorradial: masa en el borde del pulgar, cerca del codo (la más visible desde arriba)
 *   - extensores: masa dorsal (arriba), algo hacia afuera
 *   - flexores: masa ventral (abajo)
 *   - apófisis estiloides del cúbito: pequeño relieve en la muñeca
 *   - cresta del cúbito: borde recto y más plano en el lado del meñique
 * Coordenadas locales: y = muñeca→codo, z = dorso, x = lado del pulgar (radial).
 */
function makeForearm(wrist, elbow, side, material) {
  const dir = elbow.clone().sub(wrist);
  const len = dir.length();
  const nt = 40, na = 40;
  const pos = new Float32Array((nt + 1) * (na + 1) * 3);
  const col = new Float32Array((nt + 1) * (na + 1) * 3);
  const uv = new Float32Array((nt + 1) * (na + 1) * 2);
  const base = new THREE.Color(material.color);
  let k = 0;
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const s1 = THREE.MathUtils.smoothstep(t, 0.04, 0.62);
    const a = THREE.MathUtils.lerp(0.029, 0.046, s1);    // semi-ancho (lado a lado)
    const b = THREE.MathUtils.lerp(0.019, 0.041, THREE.MathUtils.smoothstep(t, 0.08, 0.7)); // semi-grosor
    const eBR = 0.0125 * bump(t, 0.78, 0.2);            // braquiorradial
    const eEx = 0.009 * bump(t, 0.7, 0.24);             // extensores
    const eFl = 0.011 * bump(t, 0.66, 0.26);            // flexores
    const styl = 0.0045 * bump(t, 0.06, 0.05);          // estiloides del cúbito
    for (let j = 0; j <= na; j++) {
      const th = (j / na) * Math.PI * 2;
      let x = a * Math.cos(th), z = b * Math.sin(th);
      const rad = Math.hypot(x, z) || 1;
      const nx = x / rad, nz = z / rad;
      let extra = eBR * lobe(th, 0.45, 3) + eEx * lobe(th, 1.75, 2.5) + eFl * lobe(th, -1.6, 2) + styl * lobe(th, -2.6, 6);
      extra -= 0.004 * lobe(th, -2.4, 4) * THREE.MathUtils.smoothstep(t, 0.2, 0.9); // cresta plana del cúbito
      x += nx * extra; z += nz * extra;
      // pequeña torsión (pronación): los músculos giran alrededor del eje hacia la muñeca
      const tw = (1 - t) * 0.35;
      const xr = x * Math.cos(tw) - z * Math.sin(tw), zr = x * Math.sin(tw) + z * Math.cos(tw);
      pos[k * 3] = xr * -side; // lado del pulgar hacia adentro
      pos[k * 3 + 1] = t * len;
      pos[k * 3 + 2] = zr;
      // tono de piel: dorso más tostado, ventral y muñeca más claros
      const tan = 0.92 + 0.12 * Math.max(0, Math.sin(th)) - 0.05 * bump(t, 0.05, 0.1);
      col[k * 3] = tan; col[k * 3 + 1] = tan * 0.98; col[k * 3 + 2] = tan * 0.96;
      uv[k * 2] = j / na; uv[k * 2 + 1] = t;
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < na; j++) {
      const p0 = i * (na + 1) + j, p1 = p0 + 1, p2 = p0 + na + 1, p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // orientación: y → dirección del antebrazo, z (dorso) → arriba y un poco hacia afuera
  const mesh = new THREE.Mesh(geo, material);
  orientLimb(mesh, wrist, dir, new THREE.Vector3(side * 0.35, 1, 0.15));
  void base;
  return mesh;
}

/** Segmento de extremidad redondo con perfil de radio [[t, r], …]. */
function makeLimb(from, to, profile, material) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const pts = profile.map(([t, r]) => new THREE.Vector2(r, t * len));
  const geo = new THREE.LatheGeometry(pts, 28);
  if (material.vertexColors) {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  const mesh = new THREE.Mesh(geo, material);
  orientLimb(mesh, from, dir, new THREE.Vector3(0, 1, 0));
  return mesh;
}

function orientLimb(mesh, origin, dir, upHint) {
  const d = dir.clone().normalize();
  const zAxis = upHint.clone().sub(d.clone().multiplyScalar(upHint.dot(d))).normalize();
  const xAxis = new THREE.Vector3().crossVectors(d, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, d, zAxis);
  mesh.quaternion.setFromRotationMatrix(m);
  mesh.position.copy(origin);
}
