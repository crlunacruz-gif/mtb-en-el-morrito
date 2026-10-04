import * as THREE from 'three';

/**
 * Condiciones de clima:
 *   nublado  cielo gris de Lima ("panza de burro"), luz difusa, sombras suaves
 *   sol      sol bajo y lateral, cielo celeste, sombras marcadas y nubes que pasan
 *   garua    llovizna fina: niebla cerrada, tierra húmeda y más oscura, gotas, menos grip
 *
 * Cambia cielo, niebla, luces, exposición, reflejos, humedad del suelo, partículas
 * de lluvia y el agarre (gripScale). Tecla C para ciclar, o ?clima=sol|nublado|garua.
 */
export const WEATHER = {
  nublado: {
    label: 'Nublado',
    horizon: '#d9d8d2', zenith: '#a9b3b8', fog: '#d3d3cd', fogNear: 60, fogFar: 4300,
    sun: '#fff0da', sunI: 2.1, sunOffset: [-70, 110, -55], sunGlow: 0.1,
    hemiSky: '#e4e8ea', hemiGround: '#9a8466', hemiI: 1.15, env: 0.55, exposure: 1.05,
    shadowRadius: 3, wet: 0, rain: 0, clouds: 0, gripScale: 1.0, ocean: '#566c76',
  },
  sol: {
    label: 'Sol y sombra',
    horizon: '#e9e3d4', zenith: '#86aac6', fog: '#dcdfe0', fogNear: 150, fogFar: 7500,
    sun: '#ffe6c2', sunI: 3.3, sunOffset: [-80, 70, 35], sunGlow: 0.55,
    hemiSky: '#cfe0ee', hemiGround: '#8a6448', hemiI: 0.7, env: 0.45, exposure: 1.0,
    shadowRadius: 1.2, wet: 0, rain: 0, clouds: 1, gripScale: 1.03, ocean: '#3f6b85',
  },
  garua: {
    label: 'Garúa',
    horizon: '#c3c6c5', zenith: '#a1a8ab', fog: '#bcc0bf', fogNear: 15, fogFar: 1300,
    sun: '#e9edf0', sunI: 0.8, sunOffset: [-40, 120, -30], sunGlow: 0,
    hemiSky: '#d2d7d9', hemiGround: '#6b5646', hemiI: 1.3, env: 0.65, exposure: 1.0,
    shadowRadius: 7, wet: 1, rain: 1, clouds: 0, gripScale: 0.84, ocean: '#56636a',
  },
};
export const WEATHER_ORDER = ['nublado', 'sol', 'garua'];

export class WeatherSystem {
  constructor(scene, renderer, env, terrain, tuning) {
    this.scene = scene;
    this.renderer = renderer;
    this.env = env;
    this.terrain = terrain;
    this.T = tuning;
    this.time = 0;
    this.rain = new RainParticles(scene);
    this.current = null;
  }

  set(id) {
    const w = WEATHER[id] || WEATHER.nublado;
    this.current = id in WEATHER ? id : 'nublado';
    const env = this.env;
    const sky = env.skyMat.uniforms;
    sky.uHorizon.value.set(w.horizon);
    sky.uZenith.value.set(w.zenith);
    sky.uSunGlow.value = w.sunGlow;
    const so = new THREE.Vector3(...w.sunOffset);
    env.sunOffset.copy(so);
    sky.uSunDir.value.copy(so).normalize();
    this.scene.background = new THREE.Color(w.fog);
    this.scene.fog.color.set(w.fog);
    this.scene.fog.near = w.fogNear;
    this.scene.fog.far = w.fogFar;
    env.sun.color.set(w.sun);
    env.sun.intensity = w.sunI;
    env.sun.shadow.radius = w.shadowRadius;
    env.hemi.color.set(w.hemiSky);
    env.hemi.groundColor.set(w.hemiGround);
    env.hemi.intensity = w.hemiI;
    env.oceanMat.color.set(w.ocean);
    this.scene.environmentIntensity = w.env;
    this.renderer.toneMappingExposure = w.exposure;
    env.refreshEnvMap();
    this.terrain.weatherU.uWet.value = w.wet;
    this.terrain.weatherU.uClouds.value = w.clouds;
    this.rain.setAmount(w.rain);
    this.T.weatherGripScale = w.gripScale;
    return w;
  }

  cycle() {
    const i = WEATHER_ORDER.indexOf(this.current);
    return this.set(WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length]);
  }

  update(dt, camera) {
    this.time += dt;
    this.terrain.weatherU.uTime.value = this.time;
    this.rain.update(dt, camera);
  }
}

/** Garúa: gotitas finas como trazos cortos alrededor de la cámara. */
class RainParticles {
  constructor(scene) {
    this.count = 1400;
    this.box = 16;
    const pos = new Float32Array(this.count * 6);
    this.drops = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      this.drops[i * 3] = (Math.random() * 2 - 1) * this.box;
      this.drops[i * 3 + 1] = Math.random() * this.box * 1.2 - 4;
      this.drops[i * 3 + 2] = (Math.random() * 2 - 1) * this.box;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#e8ecee', transparent: true, opacity: 0.5, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.origin = new THREE.Vector3();
  }

  setAmount(a) {
    this.amount = a;
    this.lines.visible = a > 0;
  }

  update(dt, camera) {
    if (!this.lines.visible) return;
    const d = this.drops;
    const B = this.box;
    const fall = 5.5 * dt, windX = 0.9 * dt, windZ = 0.4 * dt;
    const c = camera.position;
    const p = this.lines.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      d[i * 3] += windX; d[i * 3 + 1] -= fall; d[i * 3 + 2] += windZ;
      // envolver alrededor de la cámara (caja que la sigue)
      let x = d[i * 3], y = d[i * 3 + 1], z = d[i * 3 + 2];
      if (y < -5) y += B * 1.2;
      x = ((x - c.x + B) % (2 * B) + 2 * B) % (2 * B) - B + c.x;
      z = ((z - c.z + B) % (2 * B) + 2 * B) % (2 * B) - B + c.z;
      d[i * 3] = x; d[i * 3 + 1] = y; d[i * 3 + 2] = z;
      const wy = c.y + y;
      p[i * 6] = x; p[i * 6 + 1] = wy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - 0.08; p[i * 6 + 4] = wy + 0.42; p[i * 6 + 5] = z - 0.04;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
