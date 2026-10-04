import * as THREE from 'three';
import { mulberry32 } from '../utils/noise.js';

/**
 * Efectos:
 *  - polvo suspendido en el aire (parallax → sensación de velocidad)
 *  - nubes de tierra seca en aterrizajes, golpes y caídas (DustBursts)
 * El roost llega en el próximo milestone (usa el mismo emisor).
 */
export class FXSystem {
  constructor(scene, config) {
    this.count = config.fx.speedParticles;
    this.rng = mulberry32(99);
    const pos = new Float32Array(this.count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sprite = makeDotTexture();
    this.material = new THREE.PointsMaterial({
      size: 0.05,
      map: sprite,
      color: new THREE.Color('#efe3cf'),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.initialized = false;
    this.box = { side: 7, up: 3.5, ahead: 26, behind: 3 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.wind = new THREE.Vector3(0.6, 0.05, 0.25);
    this.dust = new DustBursts(scene, config.fx.dustParticles);
  }

  /** Nube de tierra en (x,y,z). amount 0–1+. */
  burst(x, y, z, amount = 1, dirX = 0, dirZ = 0) {
    this.dust.emit(x, y, z, amount, dirX, dirZ);
  }

  spawn(i, cam, anywhere) {
    const p = this.points.geometry.attributes.position.array;
    const r = this.rng;
    const b = this.box;
    const f = this._fwd, rt = this._right;
    const along = anywhere ? -b.behind + r() * (b.ahead + b.behind) : b.ahead * (0.7 + r() * 0.3);
    const side = (r() * 2 - 1) * b.side;
    const up = (r() * 2 - 1.1) * b.up;
    p[i * 3] = cam.position.x + f.x * along + rt.x * side;
    p[i * 3 + 1] = cam.position.y + f.y * along + up;
    p[i * 3 + 2] = cam.position.z + f.z * along + rt.z * side;
  }

  update(dt, camera, speed) {
    camera.getWorldDirection(this._fwd);
    this._right.set(-this._fwd.z, 0, this._fwd.x).normalize();
    const p = this.points.geometry.attributes.position.array;
    if (!this.initialized) {
      for (let i = 0; i < this.count; i++) this.spawn(i, camera, true);
      this.initialized = true;
    }
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const f = this._fwd;
    for (let i = 0; i < this.count; i++) {
      p[i * 3] += this.wind.x * dt;
      p[i * 3 + 1] += this.wind.y * dt * Math.sin(i + p[i * 3] * 0.3);
      p[i * 3 + 2] += this.wind.z * dt;
      const dx = p[i * 3] - cx, dy = p[i * 3 + 1] - cy, dz = p[i * 3 + 2] - cz;
      const along = dx * f.x + dy * f.y + dz * f.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (along < -this.box.behind || d2 > (this.box.ahead + 6) ** 2) this.spawn(i, camera, false);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = 0.25 + Math.min(0.45, speed / 25);
    this.dust.update(dt);
  }
}

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Partículas de tierra seca (no humo): suben poco, caen, se abren y se desvanecen rápido. */
class DustBursts {
  constructor(scene, count) {
    this.count = count;
    this.rng = mulberry32(7);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#c9b08e') } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 420.0 / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, amount, dirX, dirZ) {
    const n = Math.min(this.count, Math.round(24 + 60 * amount));
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const a = r() * Math.PI * 2;
      const sp = (0.6 + r() * 2.2) * (0.6 + amount * 0.6);
      this.pos[i * 3] = x + Math.cos(a) * 0.3;
      this.pos[i * 3 + 1] = y + 0.05;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.3;
      this.vel[i * 3] = Math.cos(a) * sp + dirX * 2;
      this.vel[i * 3 + 1] = 0.4 + r() * 1.6 * (0.5 + amount * 0.5);
      this.vel[i * 3 + 2] = Math.sin(a) * sp + dirZ * 2;
      this.max[i] = this.life[i] = 0.5 + r() * 0.7;
      this.size[i] = 0.12 + r() * 0.25 * (0.6 + amount * 0.4);
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      this.vel[i * 3 + 1] -= 3.2 * dt;
      const drag = Math.exp(-2.8 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += dt * 0.35;
      this.alpha[i] = Math.max(0, (1 - t) * 0.55 * Math.min(1, t * 8));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
