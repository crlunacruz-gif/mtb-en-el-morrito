import * as THREE from 'three';

/**
 * Piezas de una trail bike moderna de doble suspensión (29"), sin marcas ni logos.
 * Coordenadas de la bici: origen en el suelo bajo el pedalier, −Z adelante, +Y arriba, +X derecha.
 * Se usan tanto en el POV (BikeModel) como en el showroom del menú.
 */

export const FRAME_COLORS = [
  { id: 'negro', label: 'Negro mate', hex: '#1d1e21', rough: 0.62 },
  { id: 'blanco', label: 'Blanco', hex: '#e8e8e4', rough: 0.4 },
  { id: 'rojo', label: 'Rojo', hex: '#9a1f1c', rough: 0.38 },
  { id: 'azul', label: 'Azul', hex: '#1f4a8a', rough: 0.4 },
  { id: 'verde', label: 'Verde oliva', hex: '#4a5a34', rough: 0.55 },
  { id: 'gris', label: 'Gris', hex: '#5d6166', rough: 0.5 },
  { id: 'naranja', label: 'Naranja', hex: '#d0601d', rough: 0.4 },
  { id: 'arena', label: 'Arena', hex: '#b9a27e', rough: 0.55 },
];
export const ACCENT_COLORS = [
  { id: 'naranja', label: 'Naranja', hex: '#e06a1f' },
  { id: 'rojo', label: 'Rojo', hex: '#d22b25' },
  { id: 'azul', label: 'Azul', hex: '#2f6fd6' },
  { id: 'amarillo', label: 'Amarillo', hex: '#e4b521' },
  { id: 'lima', label: 'Lima', hex: '#9ccc2a' },
  { id: 'blanco', label: 'Blanco', hex: '#efefea' },
];

export const DEFAULT_BIKE_COLORS = {
  frame: 'negro',       // FRAME_COLORS.id
  accent: 'naranja',    // ACCENT_COLORS.id (potencia, abrazaderas, perillas, franja)
  fork: 'negro',        // negro | blanco
  stanchions: 'dorado', // dorado | negro
  tires: 'negro',       // negro | tan (costado café)
  rims: 'negro',        // negro | gris
};

export function resolveColors(sel = {}) {
  const c = { ...DEFAULT_BIKE_COLORS, ...sel };
  const frame = FRAME_COLORS.find((f) => f.id === c.frame) || FRAME_COLORS[0];
  const accent = ACCENT_COLORS.find((a) => a.id === c.accent) || ACCENT_COLORS[0];
  return {
    frame: frame.hex, frameRough: frame.rough,
    accent: accent.hex,
    fork: c.fork === 'blanco' ? '#e6e6e2' : '#1e1f22',
    stanchion: c.stanchions === 'negro' ? '#202124' : '#c9a24a',
    sidewall: c.tires === 'tan' ? '#9a7550' : '#26251f',
    rim: c.rims === 'gris' ? '#5b5e62' : '#18191b',
  };
}

export function makeBikeMaterials(col) {
  return {
    frame: new THREE.MeshPhysicalMaterial({ color: col.frame, roughness: col.frameRough, metalness: 0.1, clearcoat: col.frameRough < 0.5 ? 0.8 : 0.15, clearcoatRoughness: 0.25 }),
    accent: new THREE.MeshStandardMaterial({ color: col.accent, roughness: 0.32, metalness: 0.65 }),
    black: new THREE.MeshStandardMaterial({ color: '#19191b', roughness: 0.5, metalness: 0.35 }),
    alu: new THREE.MeshStandardMaterial({ color: '#8d8f92', roughness: 0.3, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: '#b8bbbf', roughness: 0.22, metalness: 1.0 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.96 }),
    tire: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, vertexColors: true }),
    knob: new THREE.MeshStandardMaterial({ color: '#232220', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: col.rim, roughness: 0.38, metalness: 0.7 }),
    spoke: new THREE.MeshStandardMaterial({ color: '#2a2b2d', roughness: 0.35, metalness: 0.9 }),
    rotor: new THREE.MeshStandardMaterial({ color: '#c8cacc', roughness: 0.25, metalness: 1.0, side: THREE.DoubleSide }),
    fork: new THREE.MeshPhysicalMaterial({ color: col.fork, roughness: 0.4, metalness: 0.2, clearcoat: 0.5 }),
    stanchion: new THREE.MeshStandardMaterial({ color: col.stanchion, roughness: 0.18, metalness: 0.95 }),
    saddle: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.7 }),
    chain: new THREE.MeshStandardMaterial({ color: '#4a4b4d', roughness: 0.4, metalness: 0.9 }),
    sidewall: col.sidewall,
  };
}

// ---------------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------------
const Y = new THREE.Vector3(0, 1, 0);

/** Tubo cónico entre dos puntos (rA en a, rB en b). oval escala la sección en X. */
export function tube(a, b, rA, rB, mat, oval = 1, seg = 20) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(rB, rA, dir.length(), seg, 1);
  g.scale(oval, 1, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(Y, dir.normalize());
  return m;
}

// ---------------------------------------------------------------------------
//  Rueda 29 x 2.4"
// ---------------------------------------------------------------------------
/**
 * Devuelve un Group con la rueda centrada en el eje (eje = X). El grupo `spin` gira.
 *  - neumático con sección real (balón), costado de color, 4 filas de tacos
 *  - aro con pared y canal, 28 rayos cruzados, buje con pestañas, disco de freno
 */
export function buildWheel(mats, opts = {}) {
  const R = 0.372;      // radio exterior
  const rimR = 0.311;   // radio del asiento del talón (aro 29" = 622 mm)
  const half = 0.031;   // medio ancho del neumático
  const spin = new THREE.Group();

  // --- carcasa del neumático (lathe del perfil alrededor de Y, luego Y→X)
  const prof = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI; // 0..π de un talón al otro
    const r = rimR + (R - 0.006 - rimR) * Math.sin(t);
    const y = half * Math.cos(t) * (1 + 0.15 * Math.sin(t));
    prof.push(new THREE.Vector2(r, y));
  }
  const tireGeo = new THREE.LatheGeometry(prof, 96);
  // costado de color / banda de rodadura negra
  const side = new THREE.Color(mats.sidewall).convertSRGBToLinear();
  const tread = new THREE.Color('#232220').convertSRGBToLinear();
  const pos = tireGeo.getAttribute('position');
  const colArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const k = THREE.MathUtils.smoothstep(r, 0.35, 0.36);
    const c = side.clone().lerp(tread, k);
    colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
  }
  tireGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  tireGeo.rotateZ(Math.PI / 2); // eje Y → X
  spin.add(new THREE.Mesh(tireGeo, mats.tire));

  // --- tacos: central (pares alternados), transición y laterales inclinados
  const knobGeo = new THREE.BoxGeometry(1, 1, 1);
  const rows = [
    { x: 0.007, n: 36, w: 0.011, d: 0.013, h: 0.0055, rr: 0.0, tilt: 0, phase: 0 },
    { x: -0.007, n: 36, w: 0.011, d: 0.013, h: 0.0055, rr: 0.0, tilt: 0, phase: 0.5 },
    { x: 0.019, n: 36, w: 0.009, d: 0.011, h: 0.005, rr: -0.004, tilt: 0.35, phase: 0.25 },
    { x: -0.019, n: 36, w: 0.009, d: 0.011, h: 0.005, rr: -0.004, tilt: -0.35, phase: 0.75 },
    { x: 0.029, n: 40, w: 0.008, d: 0.012, h: 0.0055, rr: -0.014, tilt: 0.85, phase: 0.1 },
    { x: -0.029, n: 40, w: 0.008, d: 0.012, h: 0.0055, rr: -0.014, tilt: -0.85, phase: 0.6 },
  ];
  const total = rows.reduce((a, r) => a + r.n, 0);
  const knobs = new THREE.InstancedMesh(knobGeo, mats.knob, total);
  const d = new THREE.Object3D();
  let k = 0;
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const a = ((i + row.phase) / row.n) * Math.PI * 2;
      const r = R - 0.003 + row.rr;
      d.position.set(row.x, Math.cos(a) * r, Math.sin(a) * r);
      d.rotation.set(a, 0, row.tilt, 'XYZ');
      d.scale.set(row.w, row.h, row.d);
      d.updateMatrix();
      knobs.setMatrixAt(k++, d.matrix);
    }
  }
  spin.add(knobs);

  // --- aro (perfil con paredes y canal)
  const rimProf = [
    [0.288, -0.0145], [0.303, -0.0155], [0.313, -0.015], [0.314, -0.011], [0.307, -0.009],
    [0.307, 0.009], [0.314, 0.011], [0.313, 0.015], [0.303, 0.0155], [0.288, 0.0145], [0.286, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  rimProf.push(rimProf[0].clone());
  const rimGeo = new THREE.LatheGeometry(rimProf, 72);
  rimGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(rimGeo, mats.rim));

  // --- buje
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.1, 18), mats.black);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 22), mats.alu);
    fl.rotation.z = Math.PI / 2;
    fl.position.x = sx * 0.03;
    spin.add(fl);
  }

  // --- 28 rayos cruzados (3x)
  const spokeGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 1, 4);
  const spokes = new THREE.InstancedMesh(spokeGeo, mats.spoke, 28);
  const q = new THREE.Quaternion();
  for (let i = 0; i < 28; i++) {
    const sx = i % 2 ? 1 : -1;
    const a0 = (i / 28) * Math.PI * 2;
    const lead = (i % 4 < 2 ? 1 : -1) * ((3 * Math.PI * 2) / 28) * 0.5;
    const hubP = new THREE.Vector3(sx * 0.03, Math.cos(a0 + lead) * 0.027, Math.sin(a0 + lead) * 0.027);
    const rimP = new THREE.Vector3(sx * 0.006, Math.cos(a0) * 0.289, Math.sin(a0) * 0.289);
    const dir = rimP.clone().sub(hubP);
    q.setFromUnitVectors(Y, dir.clone().normalize());
    d.position.copy(hubP).addScaledVector(dir, 0.5);
    d.quaternion.copy(q);
    d.scale.set(1, dir.length(), 1);
    d.updateMatrix();
    spokes.setMatrixAt(i, d.matrix);
  }
  spin.add(spokes);

  // --- disco de freno (lado izquierdo) con agujeros sugeridos por un anillo interno
  const rotor = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.1, 48), mats.rotor);
  rotor.rotation.y = Math.PI / 2;
  rotor.position.x = -0.052;
  spin.add(rotor);
  const spider = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.076, 6), mats.black);
  spider.rotation.y = Math.PI / 2;
  spider.position.x = -0.051;
  spin.add(spider);

  const group = new THREE.Group();
  group.add(spin);
  return { group, spin, radius: R };
}

// ---------------------------------------------------------------------------
//  Geometría de la bici (puntos clave)
// ---------------------------------------------------------------------------
export function bikeGeometry(cockpit, camera) {
  const barZ = -(camera.forwardOffset + cockpit.barForward);
  const barY = cockpit.barHeight;
  const headAngle = THREE.MathUtils.degToRad(64.5);
  const axis = new THREE.Vector3(0, -Math.sin(headAngle), -Math.cos(headAngle)); // abajo-adelante
  const stemTop = new THREE.Vector3(0, barY - 0.03, barZ + 0.05);
  const headTop = stemTop.clone().addScaledVector(axis, 0.04);
  const headBot = stemTop.clone().addScaledVector(axis, 0.17);
  const crown = stemTop.clone().addScaledVector(axis, 0.2);
  const axleY = 0.372;
  const tAxle = (axleY - stemTop.y) / axis.y;
  const frontAxle = stemTop.clone().addScaledVector(axis, tAxle).add(new THREE.Vector3(0, 0, -0.044));
  // pedalier adelantado: distancia entre ejes ~1.22 m (trail 29" moderna), vainas de 0.44 m
  const bb = new THREE.Vector3(0, 0.34, -0.085);
  const rearAxle = new THREE.Vector3(0, 0.372, 0.355);
  const seatTop = new THREE.Vector3(0, 0.81, 0.075);
  const seatJunction = new THREE.Vector3(0, 0.71, 0.055);
  return { barY, barZ, axis, stemTop, headTop, headBot, crown, frontAxle, bb, rearAxle, seatTop, seatJunction, width: cockpit.barWidth };
}

// ---------------------------------------------------------------------------
//  Cuadro + suspensión trasera + transmisión + sillín (todo fijo a la bici)
// ---------------------------------------------------------------------------
export function buildFrame(G, mats, opts = {}) {
  const g = new THREE.Group();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const lerpV = (p, q, t) => p.clone().lerp(q, t);
  const ball = (p, r, mat, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
    m.position.copy(p);
    m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  };

  // ---- triángulo delantero (trail/enduro moderno: tubos gruesos, top tube muy caído)
  // tubo de dirección cónico + tazas
  g.add(tube(G.headBot, G.headTop, 0.036, 0.03, mats.frame));
  g.add(tube(G.headTop.clone().addScaledVector(G.axis, -0.01), G.headTop.clone().addScaledVector(G.axis, 0.004), 0.032, 0.032, mats.black));
  g.add(tube(G.headBot.clone().addScaledVector(G.axis, -0.004), G.headBot.clone().addScaledVector(G.axis, 0.01), 0.038, 0.038, mats.black));
  // tubo de asiento (ángulo ~72°) y punto donde llega el top tube
  const stTop = G.seatTop;
  const stAt = (y) => lerpV(G.bb, stTop, (y - G.bb.y) / (stTop.y - G.bb.y));
  const ttEnd = stAt(0.71);
  // top tube: baja fuerte desde el tubo de dirección hasta el tubo de asiento
  const ttA = G.headTop.clone().addScaledVector(G.axis, 0.03).add(v(0, 0, 0.012));
  const ttMid = lerpV(ttA, ttEnd, 0.5).add(v(0, 0.012, 0));
  g.add(tube(ttA, ttMid, 0.029, 0.026, mats.frame, 1.05));
  g.add(tube(ttMid, ttEnd, 0.026, 0.022, mats.frame, 1.05));
  ball(ttMid, 0.0265, mats.frame, 1.05, 1, 1);
  // down tube: grueso y ovalado, de la parte baja del tubo de dirección al pedalier
  const dtA = G.headBot.clone().addScaledVector(G.axis, -0.035).add(v(0, 0, 0.012));
  const dtB = G.bb.clone().add(v(0, 0.045, -0.075));
  g.add(tube(dtA, dtB, 0.041, 0.037, mats.frame, 1.25, 24));
  ball(dtA, 0.04, mats.frame, 1.25, 1.05, 1.05);
  // pedalier: carcasa grande + protector bajo el down tube
  const bbShell = tube(G.bb.clone().add(v(-0.045, 0, 0)), G.bb.clone().add(v(0.045, 0, 0)), 0.03, 0.03, mats.frame);
  g.add(bbShell);
  ball(G.bb.clone().add(v(0, 0.02, -0.03)), 0.05, mats.frame, 0.95, 0.85, 1.25);
  g.add(tube(lerpV(dtA, dtB, 0.55).add(v(0, -0.035, 0)), dtB.clone().add(v(0, -0.03, 0.02)), 0.02, 0.02, mats.black, 1.6));
  g.add(tube(G.bb, stTop, 0.023, 0.019, mats.frame));
  // tija telescópica (extendida) + abrazadera + sillín
  const postTop = G.seatTop.clone().add(v(0, 0.2, 0.065));
  g.add(tube(stTop.clone().add(v(0, -0.01, -0.003)), stTop.clone().add(v(0, 0.014, 0.004)), 0.021, 0.021, mats.black));
  g.add(tube(stTop, lerpV(stTop, postTop, 0.45), 0.0175, 0.0175, mats.black));
  g.add(tube(lerpV(stTop, postTop, 0.45), postTop, 0.0158, 0.0158, mats.steel));
  if (!opts.pov) {
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 6, 14), mats.saddle);
    saddle.rotation.x = Math.PI / 2 + 0.05;
    saddle.scale.set(1.1, 1, 0.32);
    saddle.position.copy(postTop).add(v(0, 0.025, 0.02));
    g.add(saddle);
  }

  // ---- suspensión trasera: amortiguador bajo el top tube, bieleta en el tubo de asiento
  const rockPivot = stAt(0.655);
  const rockFront = rockPivot.clone().add(v(0, 0.004, -0.075));
  const rockRear = rockPivot.clone().add(v(0, 0.04, 0.075));
  const shA = lerpV(dtA, dtB, 0.52).add(v(0, 0.045, 0.004));
  // cuerpo (metálico) → cámara de aire → vástago brillante
  const shM = lerpV(shA, rockFront, 0.5);
  g.add(tube(shA, lerpV(shA, rockFront, 0.15), 0.013, 0.013, mats.black));
  g.add(tube(lerpV(shA, rockFront, 0.12), shM, 0.025, 0.025, mats.alu));
  g.add(tube(shM, lerpV(shA, rockFront, 0.72), 0.017, 0.017, mats.steel));
  g.add(tube(lerpV(shA, rockFront, 0.7), rockFront, 0.019, 0.019, mats.black));
  const reservoir = tube(lerpV(shA, rockFront, 0.18).add(v(0.03, 0.01, 0)), lerpV(shA, rockFront, 0.42).add(v(0.03, 0.01, 0)), 0.014, 0.014, mats.black);
  g.add(reservoir);
  g.add(tube(lerpV(shA, rockFront, 0.2).add(v(0.045, 0.01, 0)), lerpV(shA, rockFront, 0.2).add(v(0.055, 0.01, 0)), 0.008, 0.008, mats.accent));
  // bieleta (rocker) a ambos lados
  for (const sx of [-1, 1]) {
    const o = v(sx * 0.036, 0, 0);
    g.add(tube(rockFront.clone().add(o), rockPivot.clone().add(o), 0.013, 0.015, mats.frame, 0.5));
    g.add(tube(rockPivot.clone().add(o), rockRear.clone().add(o), 0.015, 0.012, mats.frame, 0.5));
  }
  g.add(tube(rockPivot.clone().add(v(-0.045, 0, 0)), rockPivot.clone().add(v(0.045, 0, 0)), 0.011, 0.011, mats.black));
  // vainas (chainstays) y tirantes (seatstays)
  const pivot = G.bb.clone().add(v(0, 0.09, 0.075));
  g.add(tube(pivot.clone().add(v(-0.05, 0, 0)), pivot.clone().add(v(0.05, 0, 0)), 0.014, 0.014, mats.black));
  for (const sx of [-1, 1]) {
    const ax = G.rearAxle.clone().add(v(sx * 0.07, 0, 0));
    const ds = ax.clone().add(v(0, 0.02, -0.03));
    // chainstay: desde el pivote principal, pasa sobre el plato, al eje
    const cs0 = pivot.clone().add(v(sx * 0.045, -0.035, 0));
    const csM = lerpV(cs0, ds, 0.5).add(v(sx * 0.008, -0.005, 0));
    g.add(tube(cs0, csM, 0.019, 0.016, mats.frame, 0.8));
    g.add(tube(csM, ds, 0.016, 0.013, mats.frame, 0.8));
    // seatstay: del eje a la bieleta
    const ss1 = rockRear.clone().add(v(sx * 0.036, 0, 0));
    g.add(tube(ds.clone().add(v(0, 0.01, 0.01)), ss1, 0.013, 0.015, mats.frame, 0.85));
    // puntera
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.06), mats.frame);
    drop.position.copy(ax);
    g.add(drop);
  }
  // puente entre seatstays (bajo el tubo de asiento)
  g.add(tube(lerpV(G.rearAxle, rockRear, 0.72).add(v(-0.04, 0, 0)), lerpV(G.rearAxle, rockRear, 0.72).add(v(0.04, 0, 0)), 0.01, 0.01, mats.frame));

  // ---- transmisión: plato (narrow-wide), bielas, pedales, cassette, cadena, desviador
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 40), mats.black);
  ring.rotation.y = Math.PI / 2;
  ring.position.copy(G.bb).add(v(0.052, 0, 0));
  g.add(ring);
  const ringDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.003, 32), mats.black);
  ringDisc.rotation.z = Math.PI / 2;
  ringDisc.position.copy(ring.position);
  g.add(ringDisc);
  for (const sx of [-1, 1]) {
    const ang = sx > 0 ? 0.9 : 0.9 + Math.PI;
    const end = G.bb.clone().add(v(sx * 0.078, Math.cos(ang) * 0.165, Math.sin(ang) * 0.165));
    g.add(tube(G.bb.clone().add(v(sx * 0.07, 0, 0)), end, 0.014, 0.011, mats.black, 0.7));
    if (!opts.pov) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.1), mats.black);
      pedal.position.copy(end).add(v(sx * 0.06, 0, 0));
      g.add(pedal);
    }
  }
  const cassette = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const r = 0.022 + i * 0.0042;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.002, 28), mats.steel);
    c.rotation.z = Math.PI / 2;
    c.position.set(0.054 - i * 0.0032, 0, 0);
    cassette.add(c);
  }
  cassette.position.copy(G.rearAxle);
  g.add(cassette);
  const chainPts = [
    G.bb.clone().add(v(0.052, 0.075, 0)), G.rearAxle.clone().add(v(0.047, 0.04, -0.01)),
    G.rearAxle.clone().add(v(0.047, 0.01, 0.042)), G.rearAxle.clone().add(v(0.047, -0.06, 0.02)),
    G.rearAxle.clone().add(v(0.047, -0.11, -0.03)), G.bb.clone().add(v(0.052, -0.075, 0)),
    G.bb.clone().add(v(0.052, 0, -0.075)),
  ];
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts, true), 90, 0.0035, 5, true), mats.chain));
  const der = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.085, 0.035), mats.black);
  der.position.copy(G.rearAxle).add(v(0.06, -0.075, 0.012));
  der.rotation.x = -0.25;
  g.add(der);
  for (const dy of [-0.03, -0.11]) {
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 14), mats.black);
    pulley.rotation.z = Math.PI / 2;
    pulley.position.copy(G.rearAxle).add(v(0.05, dy, dy * 0.3));
    g.add(pulley);
  }

  // ---- rueda trasera con disco y caliper
  if (opts.rearWheel !== false) {
    const rw = buildWheel(mats);
    rw.group.position.copy(G.rearAxle);
    g.add(rw.group);
    g.userData.rearSpin = rw.spin;
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.06), mats.black);
    cal.position.copy(G.rearAxle).add(v(-0.062, 0.075, -0.035));
    g.add(cal);
  }
  // franja de acento en el down tube (sin logos)
  const sA = lerpV(dtA, dtB, 0.25).add(v(0, 0.044, 0)), sB = lerpV(dtA, dtB, 0.45).add(v(0, 0.042, 0));
  g.add(tube(sA, sB, 0.004, 0.004, mats.accent, 1, 6));
  return g;
}

// ---------------------------------------------------------------------------
//  Horquilla + rueda delantera (en el pivote de dirección, coords relativas a stemTop)
// ---------------------------------------------------------------------------
export function buildFrontEnd(G, mats, pivot, opts = {}) {
  const rel = (p) => p.clone().sub(G.stemTop);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, G.axis.clone().negate());
  // tubo de dirección de la horquilla visible entre la taza y la corona
  pivot.add(tube(rel(G.headBot), rel(G.crown), 0.019, 0.019, mats.black));
  // corona
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.06), mats.fork);
  crown.position.copy(rel(G.crown));
  crown.quaternion.copy(q);
  pivot.add(crown);
  for (const sx of [-1, 1]) {
    const top = G.crown.clone().add(new THREE.Vector3(sx * 0.068, 0, 0));
    const bottom = G.frontAxle.clone().add(new THREE.Vector3(sx * 0.068, 0, 0));
    const mid = top.clone().lerp(bottom, 0.4);
    // tapa superior + perilla de ajuste
    const capTop = top.clone().addScaledVector(G.axis, -0.022);
    pivot.add(tube(rel(capTop), rel(top), 0.019, 0.019, mats.fork));
    const knob = tube(rel(capTop.clone().addScaledVector(G.axis, -0.012)), rel(capTop), 0.012, 0.013, mats.accent);
    pivot.add(knob);
    // barras (stanchions) y botellas (lowers)
    pivot.add(tube(rel(top), rel(mid), 0.0175, 0.0175, mats.stanchion));
    const seal = tube(rel(mid.clone().addScaledVector(G.axis, -0.008)), rel(mid.clone().addScaledVector(G.axis, 0.006)), 0.0215, 0.0215, mats.black);
    pivot.add(seal);
    pivot.add(tube(rel(mid), rel(bottom), 0.0235, 0.021, mats.fork));
    const dropout = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.045), mats.fork);
    dropout.position.copy(rel(bottom));
    dropout.quaternion.copy(q);
    pivot.add(dropout);
  }
  // arco
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.013, 10, 20, Math.PI), mats.fork);
  arch.position.copy(rel(G.crown.clone().lerp(G.frontAxle, 0.47)));
  arch.quaternion.copy(q);
  arch.rotateX(Math.PI / 2);
  arch.rotateZ(Math.PI);
  pivot.add(arch);
  // caliper delantero
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.06), mats.black);
  cal.position.copy(rel(G.frontAxle)).add(new THREE.Vector3(-0.075, 0.07, 0.05));
  pivot.add(cal);
  // rueda
  const fw = buildWheel(mats);
  fw.group.position.copy(rel(G.frontAxle));
  pivot.add(fw.group);
  return fw;
}

// ---------------------------------------------------------------------------
//  Cockpit: manubrio, potencia, puños, manetas, mangueras (en el pivote)
// ---------------------------------------------------------------------------
export function buildCockpit(G, mats, pivot) {
  const W = G.width;
  const P = (x, y, z) => new THREE.Vector3(x, y, z).sub(G.stemTop);
  const barY = G.barY, barZ = G.barZ;
  const barPts = [
    [-W / 2, 0.022, 0.035], [-W * 0.34, 0.02, 0.022], [-0.12, 0.004, 0.004], [-0.04, 0, 0],
    [0.04, 0, 0], [0.12, 0.004, 0.004], [W * 0.34, 0.02, 0.022], [W / 2, 0.022, 0.035],
  ].map(([x, y, z]) => P(x, barY + y, barZ + z));
  // manubrio con zona central más gruesa (35 mm)
  pivot.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 64, 0.0115, 12, false), mats.black));
  pivot.add(tube(P(-0.05, barY, barZ), P(0.05, barY, barZ), 0.0175, 0.0175, mats.black));
  // potencia corta con tornillos
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.04, 0.07), mats.accent);
  stem.position.copy(P(0, barY - 0.012, barZ + 0.035));
  pivot.add(stem);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.042, 0.012), mats.accent);
  face.position.copy(P(0, barY, barZ - 0.004));
  pivot.add(face);
  for (const bx of [-0.02, 0.02]) for (const by of [-0.012, 0.012]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8), mats.steel);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.copy(P(bx, barY + by, barZ - 0.011));
    pivot.add(bolt);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 18), mats.black);
  cap.position.copy(P(0, barY + 0.011, barZ + 0.065));
  pivot.add(cap);
  for (const side of [-1, 1]) {
    const gx = side * (W / 2 - 0.065);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.13, 14), mats.rubber);
    grip.rotation.z = Math.PI / 2;
    grip.position.copy(P(gx, barY + 0.021, barZ + 0.032));
    pivot.add(grip);
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), mats.accent);
    lock.rotation.z = Math.PI / 2;
    lock.position.copy(P(side * (W / 2 - 0.137), barY + 0.02, barZ + 0.03));
    pivot.add(lock);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.016), mats.black);
    lever.position.copy(P(side * (W / 2 - 0.17), barY + 0.012, barZ - 0.03));
    lever.rotation.y = side * 0.35;
    pivot.add(lever);
    const master = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.028, 0.03), mats.black);
    master.position.copy(P(side * (W / 2 - 0.2), barY + 0.028, barZ + 0.015));
    pivot.add(master);
    const hose = new THREE.CatmullRomCurve3([
      P(side * (W / 2 - 0.205), barY + 0.035, barZ + 0.0), P(side * 0.19, barY + 0.035, barZ - 0.06),
      P(side * 0.08, barY - 0.02, barZ - 0.1), P(side * 0.045, barY - 0.15, barZ - 0.11),
    ]);
    pivot.add(new THREE.Mesh(new THREE.TubeGeometry(hose, 28, 0.0028, 6), mats.black));
  }
  // palanca de la tija telescópica (izquierda, bajo el manubrio)
  const dropper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.03), mats.black);
  dropper.position.copy(P(-0.24, barY - 0.012, barZ + 0.02));
  pivot.add(dropper);
}
