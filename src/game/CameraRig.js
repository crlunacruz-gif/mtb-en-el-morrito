import * as THREE from 'three';
import { clamp, damp, createNoise2D, smoothstep } from '../utils/noise.js';

/**
 * Cámara POV tipo GoPro en casco (Milestone 2).
 *  - La bici (cockpit) sigue al suelo / trayectoria de aire y a la suspensión.
 *  - La cabeza filtra el terreno (las piernas absorben), baja al comprimir en landings.
 *  - Pitch sigue a la bici en el aire (drops, saltos) de forma suavizada.
 *  - Micro-vibración por terreno, inclinación suave en curvas, FOV dinámico leve.
 *  - Animación de caída (crash) de ~1.2 s.
 */
export class CameraRig {
  constructor(camera, bikeModel, bike, trail, config) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    this.model = bikeModel;
    this.bike = bike;
    this.trail = trail;
    this.cfg = config;
    this.noise = createNoise2D(777);
    this._smp = {};
    this.fov = config.camera.fov;
    this.idleT = 0;
    this.reset();
  }

  reset() {
    this.headBase = null;
    this.prevY = null;
    this.trendV = 0;
    this.yawLook = 0;
    this.pitchSm = 0;
    this.crashT = -1;
    this.model.group.visible = true;
  }

  startCrash() {
    this.crashT = 0;
    const c = this.camera;
    this.crashFrom = { pos: c.position.clone(), rot: c.rotation.clone(), groundY: this.bike.gC ?? this.bike.pos.y };
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1);
  }

  update(dt) {
    if (this.crashT >= 0) { this.updateCrash(dt); return; }
    const cc = this.cfg.camera;
    const b = this.bike;
    const m = this.model.group;
    const v = b.v;
    const susp = b.suspension;
    this.idleT += dt;

    // ---------------- Vibración (frecuencia ∝ distancia recorrida)
    const rough = b.roughness;
    const speedF = clamp(v / 9, 0, 1.4);
    const dist = b.distance;
    const n = this.noise;
    const amp = cc.shake * (0.0025 + 0.011 * rough) * speedF;
    const vibY = amp * (n(dist * 2.1, 0.3) * 0.7 + n(dist * 5.3, 4.1) * 0.3);
    const vibRoll = amp * 1.6 * n(dist * 1.7, 8.8);
    const vibPitch = amp * 1.8 * n(dist * 2.6, 12.4);

    // ---------------- Bici / cockpit (con suspensión)
    m.position.set(b.pos.x, b.pos.y - susp.fork * 0.6 + vibY * 1.4, b.pos.z);
    // el rider se mantiene erguido: la cabina (manubrio + brazos) sólo toma parte del pitch de la bici,
    // si no, en bajadas muy empinadas los brazos "suben" hacia la cámara
    m.rotation.set(-b.pitch * 0.3 - susp.dive + vibPitch * 1.4, -b.yaw, -b.lean * 0.6 + vibRoll * 1.2);
    const steerVis = clamp(b.steer * 0.12 + b.slip * 0.4, -0.3, 0.3);
    this.model.update(dt, steerVis, v);

    // ---------------- Cabeza
    const y = b.pos.y;
    if (this.headBase === null) { this.headBase = y; this.prevY = y; }
    if (dt > 0) {
      const inst = (y - this.prevY) / dt;
      this.trendV = damp(this.trendV, inst, b.airborne ? 12 : 3.5, dt);
      this.prevY = y;
      const lam = b.airborne ? 16 : cc.headDamping;
      this.headBase = damp(this.headBase, y + this.trendV / lam, lam, dt);
    }
    const idle = b.running ? 0 : Math.sin(this.idleT * 1.3) * 0.006;
    const yaw = b.yaw;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = Math.sin(yaw);
    const leanShift = Math.sin(b.lean * 0.75) * cc.height * 0.5;
    const cam = this.camera;
    cam.position.set(
      b.pos.x + fx * cc.forwardOffset + rx * leanShift,
      this.headBase + cc.height + vibY * 0.6 + idle - susp.comp * 1.1,
      b.pos.z + fz * cc.forwardOffset + rz * leanShift,
    );

    // ---------------- Orientación
    const look = this.lookIntoTurn(cc.lookAhead + v * 0.35);
    this.yawLook = damp(this.yawLook, look, 4, dt || 1);
    const slopeAhead = b.slopeAhead(cc.lookAhead);
    let pitchBase;
    if (b.airborne) pitchBase = b.pitch * cc.airPitchWeight + slopeAhead * (1 - cc.airPitchWeight);
    else pitchBase = b.pitch * (1 - cc.lookAheadWeight) + slopeAhead * cc.lookAheadWeight;
    // en pendientes muy fuertes el rider levanta la cabeza: la mirada no baja más de ~14°
    const pitchLim = 0.24 + Math.max(0, pitchBase - 0.24) * 0.25;
    this.pitchSm = damp(this.pitchSm, Math.min(pitchBase, pitchLim), b.airborne ? 5 : 10, dt || 1);
    const tilt = THREE.MathUtils.degToRad(cc.tiltDeg);
    cam.rotation.set(
      tilt - this.pitchSm + vibPitch - susp.comp * 0.25,
      -(yaw + this.yawLook * 0.4),
      clamp(-b.lean * cc.leanFactor, -0.3, 0.3) + vibRoll,
    );

    // ---------------- FOV dinámico
    const tFov = cc.fov + (cc.fovHighSpeed - cc.fov) * Math.pow(clamp(v / cc.fovSpeedRef, 0, 1), 1.6);
    this.fov = damp(this.fov, tFov, 2.5, dt || 1);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  updateCrash(dt) {
    this.crashT += dt;
    const t = smoothstep(0, 1.1, this.crashT);
    const c = this.camera;
    const f = this.crashFrom;
    const ground = f.groundY + 0.45;
    c.position.set(f.pos.x, f.pos.y + (ground - f.pos.y) * t + Math.sin(t * Math.PI) * 0.35, f.pos.z);
    c.rotation.set(
      f.rot.x + (-0.55 - f.rot.x) * t,
      f.rot.y + this.crashSpin * 0.9 * t,
      f.rot.z + this.crashSpin * 1.1 * t,
    );
    // la bici se va de la vista
    const m = this.model.group;
    m.position.y -= dt * 1.5;
    m.rotation.z += this.crashSpin * dt * 2.4;
    if (this.crashT > 0.6) m.visible = false;
  }

  lookIntoTurn(dist) {
    const b = this.bike;
    const p = this.trail.sampleAt(b.s + dist, this._smp);
    const o = b.o * 0.6;
    const tx = p.x + p.rightX * o - b.pos.x;
    const tz = p.z + p.rightZ * o - b.pos.z;
    const target = Math.atan2(tx, -tz);
    let d = target - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return clamp(d, -0.9, 0.9);
  }
}
