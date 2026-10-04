import * as THREE from 'three';
import { mulberry32, lerp } from '../utils/noise.js';
import { makeWaterNormalTexture } from '../utils/textures.js';

// Cielo costero de Lima: gris perla, brillante y difuso (panza de burro).
export const SKY = {
  horizon: new THREE.Color('#d9d8d2'),
  zenith: new THREE.Color('#a9b3b8'),
  fog: new THREE.Color('#d3d3cd'),
};

/**
 * Cielo, niebla, luces, océano Pacífico, Lima estilizada al fondo,
 * isla en el horizonte y la cruz/antena en la cumbre (hito del Morro).
 */
export class Environment {
  constructor(scene, renderer, terrain, trail, seed) {
    this.scene = scene;
    this.renderer = renderer;
    this.terrain = terrain;
    this.trail = trail;
    this.rng = mulberry32(seed * 5 + 2);

    scene.background = SKY.fog.clone();
    scene.fog = new THREE.Fog(SKY.fog, 60, 4300);

    const th = trail.route.theme;
    this.theme = th;
    this.buildSky();
    this.buildLights();
    this.buildOcean(th.ocean);
    if (th.scenery === 'lima') this.buildLima();
    if (th.scenery === 'lurin') this.buildLurin();
    if (th.scenery === 'molina') this.buildMolinaCity();
    this.buildHorizon(th.scenery === 'molina');
    if (th.landmark === 'cross') this.buildLandmark();
    if (th.landmark === 'pachacamac') this.buildPachacamacTemple();
    if (th.powerLines) this.buildPowerLines();
  }

  /** Pueblo y chacras del valle de Lurín (verdes) a lo lejos. */
  buildLurin() {
    const rng = this.rng;
    const b = this.trail.bounds;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const N = 700;
    const houses = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const tones = ['#d9cdb8', '#c9b49a', '#e2d8c6', '#b9a07f', '#d6c3a6', '#9f8f7c'];
    let kh = 0, kt = 0;
    for (let i = 0; i < N * 3 && (kh < N || kt < N); i++) {
      const x = b.maxX + 300 + rng() * 1600;
      const z = b.minZ - 200 + (rng() - 0.5) * 2200;
      const y = this.terrain.heightAt(x, z);
      if (y > 18 || y < 1) continue;
      if (rng() < 0.45 && kh < N) {
        d.position.set(x, y - 0.2, z); d.scale.set(6 + rng() * 10, 3 + rng() * 5, 6 + rng() * 10); d.rotation.set(0, rng(), 0); d.updateMatrix();
        houses.setMatrixAt(kh, d.matrix); houses.setColorAt(kh++, c.set(tones[Math.floor(rng() * tones.length)]));
      } else if (kt < N) {
        const r = 2 + rng() * 3;
        d.position.set(x, y + r * 0.8, z); d.scale.set(r, r * 1.1, r); d.rotation.set(0, 0, 0); d.updateMatrix();
        trees.setMatrixAt(kt, d.matrix); trees.setColorAt(kt++, c.setHSL(0.24 + rng() * 0.06, 0.35, 0.22 + rng() * 0.1));
      }
    }
    houses.count = kh; trees.count = kt;
    for (const m of [houses, trees]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); this.scene.add(m); }
  }

  /** Templo del Sol (pirámide escalonada de adobe) y muros en ruinas sobre el cerro del santuario. */
  buildPachacamacTemple() {
    const peak = this.terrain.peaks.find((p) => p.landmark);
    if (!peak) return;
    const adobe = new THREE.MeshStandardMaterial({ color: '#b48a63', roughness: 1, flatShading: true });
    const adobeDark = new THREE.MeshStandardMaterial({ color: '#9b7552', roughness: 1, flatShading: true });
    const y = this.terrain.heightAt(peak.x, peak.z);
    const g = new THREE.Group();
    const levels = 6;
    for (let i = 0; i < levels; i++) {
      const w = 150 - i * 20, dpt = 95 - i * 13, h = 7;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), i % 2 ? adobe : adobeDark);
      tier.position.set(0, i * h + h / 2 - 2, 0);
      g.add(tier);
    }
    // rampa de acceso
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 70), adobeDark);
    ramp.position.set(-40, 12, 40);
    ramp.rotation.x = -0.45;
    g.add(ramp);
    // muros en ruinas alrededor
    const rng = this.rng;
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, r = 110 + rng() * 160;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(20 + rng() * 50, 2 + rng() * 4, 2.2), rng() < 0.5 ? adobe : adobeDark);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      wall.position.set(x, this.terrain.heightAt(peak.x + x, peak.z + z) - y + 1, z);
      wall.rotation.y = Math.round(rng() * 2) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
      g.add(wall);
    }
    g.position.set(peak.x, y, peak.z);
    g.rotation.y = 0.4;
    this.scene.add(g);
  }

  /** Valle urbano de La Molina: casas bajas, árboles y parques alrededor del cerro. */
  buildMolinaCity() {
    const rng = this.rng;
    const b = this.trail.bounds;
    const floor = this.theme.floor;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const N = 2200;
    const houses = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 1200);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const tones = ['#e8e2d6', '#d8cdb9', '#efe7d8', '#c9bfae', '#e0d0b8', '#b8b2a6', '#d7c6a8', '#c1cbd0'];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    let kh = 0, kt = 0;
    for (let i = 0; i < 9000 && (kh < N || kt < 1200); i++) {
      const a = rng() * Math.PI * 2, r = 380 + Math.pow(rng(), 0.7) * 2300;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z);
      if (y > floor + 8) continue;
      if (rng() < 0.7 && kh < N) {
        d.position.set(x, y - 0.3, z); d.scale.set(8 + rng() * 10, 4 + Math.pow(rng(), 2) * 9, 8 + rng() * 12); d.rotation.set(0, 0.3 + Math.round(rng()) * 0.02, 0); d.updateMatrix();
        houses.setMatrixAt(kh, d.matrix); houses.setColorAt(kh++, c.set(tones[Math.floor(rng() * tones.length)]));
      } else if (kt < 1200) {
        const rr = 2.5 + rng() * 3.5;
        d.position.set(x, y + rr * 0.9, z); d.scale.set(rr, rr * 1.15, rr); d.rotation.set(0, 0, 0); d.updateMatrix();
        trees.setMatrixAt(kt, d.matrix); trees.setColorAt(kt++, c.setHSL(0.23 + rng() * 0.07, 0.32, 0.2 + rng() * 0.1));
      }
    }
    houses.count = kh; trees.count = kt;
    for (const m of [houses, trees]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); this.scene.add(m); }
  }

  // Cables de alta tensión cruzando el cerro (como en las bajadas reales del Morro)
  buildPowerLines() {
    const tr = this.trail;
    const smp = {};
    const steel = new THREE.MeshStandardMaterial({ color: '#6d6e6c', roughness: 0.6, metalness: 0.5 });
    const cableMat = new THREE.LineBasicMaterial({ color: '#3a3b3c', transparent: true, opacity: 0.85 });
    const tower = (x, z) => {
      const g = new THREE.Group();
      const y = this.terrain.heightAt(x, z);
      const H = 26;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, H, 5), steel);
        leg.position.set(dx * 0.9, H / 2, dz * 0.9);
        leg.rotation.set(dz * 0.05, 0, -dx * 0.05);
        g.add(leg);
      }
      for (let k = 0; k < 6; k++) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(2.1 - k * 0.2, 0.12, 2.1 - k * 0.2), steel);
        ring.position.y = 3 + k * 4;
        g.add(ring);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 0.3), steel);
      arm.position.y = H - 1;
      g.add(arm);
      g.position.set(x, y - 0.5, z);
      this.scene.add(g);
      return { x, y: y - 0.5 + H - 1.3, z, g };
    };
    for (const sAt of [tr.length * 0.36, tr.length * 0.72]) {
      tr.sampleAt(sAt, smp);
      const a = tower(smp.x - smp.rightX * 70 - smp.dirX * 8, smp.z - smp.rightZ * 70 - smp.dirZ * 8);
      const b = tower(smp.x + smp.rightX * 75 + smp.dirX * 8, smp.z + smp.rightZ * 75 + smp.dirZ * 8);
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      a.g.rotation.y = ang + Math.PI / 2; b.g.rotation.y = ang + Math.PI / 2;
      for (const off of [-4, 0, 4]) {
        const pts = [];
        const px = Math.cos(ang) * off, pz = -Math.sin(ang) * off;
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const sag = 7 * 4 * t * (1 - t);
          pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + px, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t + pz));
        }
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
      }
    }
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(9500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: SKY.horizon.clone() },
        uZenith: { value: SKY.zenith.clone() },
        uSunDir: { value: new THREE.Vector3(-0.45, 0.55, -0.7).normalize() },
        uSunGlow: { value: 0.1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform float uSunGlow;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
          float d = max(dot(normalize(vDir), uSunDir), 0.0);
          col += vec3(1.0, 0.9, 0.7) * (pow(d, 6.0) * uSunGlow + pow(d, 400.0) * uSunGlow * 2.5);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat = mat;
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.scene.environmentIntensity = 0.55;
    this.refreshEnvMap();
  }

  /** Recalcula los reflejos a partir del cielo actual (se llama al cambiar el clima). */
  refreshEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envMat = this.skyMat.clone();
    envMat.uniforms.uHorizon.value = this.skyMat.uniforms.uHorizon.value.clone();
    envMat.uniforms.uZenith.value = this.skyMat.uniforms.uZenith.value.clone();
    envMat.uniforms.uSunDir.value = this.skyMat.uniforms.uSunDir.value.clone();
    envMat.uniforms.uSunGlow.value = this.skyMat.uniforms.uSunGlow.value;
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envMat));
    const old = this.scene.environment;
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    if (old) old.dispose();
    pmrem.dispose();
    envMat.dispose();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xe4e8ea, 0x9a8466, 1.15);
    this.scene.add(hemi);
    this.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xfff0da, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 32;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.sunOffset = new THREE.Vector3(-70, 110, -55);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  buildOcean(visible = true) {
    const normal = makeWaterNormalTexture(7);
    normal.repeat.set(900, 900);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#566c76'),
      roughness: 0.32,
      metalness: 0.0,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      envMapIntensity: 1.1,
    });
    const geo = new THREE.PlaneGeometry(40000, 40000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(geo, mat);
    ocean.position.y = 0;
    ocean.receiveShadow = false;
    ocean.visible = visible;
    this.oceanMat = mat;
    this.scene.add(ocean);
    this.ocean = ocean;
    this.waterNormal = normal;
  }

  // Lima: meseta con acantilados (Costa Verde) y ciudad de bloques, a la derecha-adelante.
  buildLima() {
    const rng = this.rng;
    const b = this.trail.bounds;
    const ox = b.maxX, oz = b.minZ; // referencia
    // borde costero (acantilado) de sur a norte
    const coast = [
      [ox + 900, oz + 320], [ox + 950, oz - 250], [ox + 1100, oz - 900],
      [ox + 1150, oz - 1600], [ox + 1700, oz - 2400], [ox + 2400, oz - 3200],
      [ox + 3300, oz - 3900], [ox + 4400, oz - 4500],
    ];
    const shape = new THREE.Shape();
    shape.moveTo(coast[0][0], -coast[0][1]);
    for (let i = 1; i < coast.length; i++) shape.lineTo(coast[i][0], -coast[i][1]);
    shape.lineTo(ox + 9000, -(oz - 4500));
    shape.lineTo(ox + 9000, -(oz + 320));
    shape.lineTo(coast[0][0], -coast[0][1]);
    const cliffH = 45;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: cliffH, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2); // shape XY → XZ (y del shape = −z)
    const mat = new THREE.MeshStandardMaterial({ color: '#94897a', roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const plateau = new THREE.Mesh(geo, mat);
    plateau.position.y = -2;
    this.scene.add(plateau);

    // playa al pie del acantilado
    // Ciudad: bloques instanciados
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const cityMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const N = 2600;
    const city = new THREE.InstancedMesh(box, cityMat, N);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const tones = ['#d6d2ca', '#c8c3b8', '#bab4a8', '#dcd6ca', '#aba7a0', '#c9bca7', '#b9bec2'];
    let k = 0;
    for (let i = 0; i < N; i++) {
      // punto a lo largo de la costa + distancia tierra adentro
      const t = rng() * (coast.length - 1.01);
      const ci = Math.floor(t), f = t - ci;
      const cx = lerp(coast[ci][0], coast[ci + 1][0], f);
      const cz = lerp(coast[ci][1], coast[ci + 1][1], f);
      const inland = 25 + Math.pow(rng(), 1.6) * 1400;
      const x = cx + inland * 0.93 + (rng() - 0.5) * 40;
      const z = cz + inland * 0.35 + (rng() - 0.5) * 40;
      const tower = inland < 160 && rng() < 0.16;
      const h = tower ? 28 + rng() * 45 : 4 + Math.pow(rng(), 2.5) * 16;
      const w = tower ? 14 + rng() * 14 : 12 + rng() * 26;
      dummy.position.set(x, cliffH - 2, z);
      dummy.scale.set(w, h, w * (0.7 + rng() * 0.6));
      dummy.rotation.y = 0.35 + (rng() - 0.5) * 0.2;
      dummy.updateMatrix();
      city.setMatrixAt(k, dummy.matrix);
      col.set(tones[Math.floor(rng() * tones.length)]);
      city.setColorAt(k, col);
      k++;
    }
    city.count = k;
    city.instanceMatrix.needsUpdate = true;
    city.computeBoundingSphere();
    this.scene.add(city);
  }

  // Cerros lejanos (estribaciones andinas) e isla en el horizonte.
  buildHorizon(full = false) {
    const rng = this.rng;
    const hazeMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
    const b = this.trail.bounds;
    const group = new THREE.Group();
    // cordillera detrás de Lima
    for (let i = 0; i < 26; i++) {
      const ang = (full ? lerp(-Math.PI, Math.PI, i / 25) : lerp(-0.15, 1.25, i / 25)) + (rng() - 0.5) * 0.08; // abanico a la derecha-adelante (o 360° en valles)
      const dist = 7800 + rng() * 1200;
      const x = b.maxX + Math.sin(ang) * dist;
      const z = b.minZ - Math.cos(ang) * dist;
      const r = 1100 + rng() * 1300;
      const h = 220 + rng() * 380;
      const g = new THREE.ConeGeometry(r, h, 5 + Math.floor(rng() * 3), 1);
      const far = i % 2;
      const m = new THREE.Mesh(g, hazeMat(far ? '#c6c8c5' : '#bfc1bd'));
      m.position.set(x, h / 2 - 20, z);
      m.rotation.y = rng() * Math.PI;
      group.add(m);
    }
    // isla (San Lorenzo) a la izquierda-adelante
    const isl = new THREE.SphereGeometry(1, 12, 6);
    const island = new THREE.Mesh(isl, hazeMat('#bfc2bf'));
    island.scale.set(2600, 260, 700);
    island.position.set(b.minX - 3200, -60, b.minZ - 5200);
    island.rotation.y = 0.6;
    if (this.theme.ocean) group.add(island);
    this.scene.add(group);
  }

  // Cruz blanca y antena sobre la cumbre secundaria (hito inspirado en el Morro Solar)
  buildLandmark() {
    const peak = this.terrain.peaks.find((p) => p.landmark);
    if (!peak) return;
    let best = { h: -1e9, x: peak.x, z: peak.z };
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const x = peak.x + i * 12, z = peak.z + j * 12;
        const h = this.terrain.heightAt(x, z);
        if (h > best.h) best = { h, x, z };
      }
    }
    const white = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.7 });
    const cross = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 22, 1.4), white);
    post.position.y = 11;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, 1.4), white);
    arm.position.y = 15.5;
    cross.add(post, arm);
    cross.position.set(best.x, best.h - 0.5, best.z);
    cross.rotation.y = 0.5;
    this.scene.add(cross);

    const mastMat = new THREE.MeshStandardMaterial({ color: '#8c8c8c', roughness: 0.6, metalness: 0.3 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 38, 5), mastMat);
    mast.position.set(best.x + 26, this.terrain.heightAt(best.x + 26, best.z + 10) + 18, best.z + 10);
    this.scene.add(mast);
    this.landmark = best;
  }

  update(dt, focus) {
    // sombra que sigue al rider (con snapping para evitar parpadeo)
    const sun = this.sun;
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    sun.target.position.set(fx, focus.y, fz);
    sun.position.set(fx, focus.y, fz).add(this.sunOffset);
    sun.target.updateMatrixWorld();
    // olas
    this.waterNormal.offset.x += dt * 0.004;
    this.waterNormal.offset.y += dt * 0.0025;
  }
}
