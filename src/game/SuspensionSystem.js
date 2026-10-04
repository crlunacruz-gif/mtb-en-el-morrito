import { clamp } from '../utils/noise.js';

/**
 * Suspensión simplificada (visual + sensación).
 * Un resorte-amortiguador para el cuerpo (compresión en m) excitado por:
 *   - aceleraciones verticales del suelo (bumps, piedras, rollers)
 *   - aterrizajes (impulso)
 *   - frenado (hundimiento de la horquilla)
 * Salidas: comp (compresión del cuerpo), fork (compresión de horquilla), dive (pitch extra).
 */
export class SuspensionSystem {
  constructor(tuning) {
    this.T = tuning;
    this.reset();
  }

  reset() {
    this.comp = 0;
    this.vel = 0;
    this.fork = 0;
    this.dive = 0;
    this.prevVyG = null;
  }

  /** Golpe de aterrizaje (m/s de impacto vertical). */
  landing(impact) {
    this.vel += impact * 0.55;
  }

  /** Golpe puntual (piedra). */
  hit(severity) {
    this.vel += severity * 0.12;
  }

  update(dt, vyGround, airborne, brake) {
    if (dt <= 0) return;
    const strength = this.T.suspensionStrength;
    const k = 180 * strength;
    const c = 2 * Math.sqrt(k) * 0.6;
    let force = 0;
    if (!airborne && this.prevVyG !== null) {
      const accel = clamp((vyGround - this.prevVyG) / dt, -80, 80);
      force = accel * 0.35; // el suelo sube bruscamente → comprime
    }
    this.prevVyG = airborne ? null : vyGround;
    // en el aire la suspensión se extiende (comp → leve negativo)
    const rest = airborne ? -0.02 : 0;
    const acc = -k * (this.comp - rest) - c * this.vel + force;
    this.vel += acc * dt;
    this.comp += this.vel * dt;
    const maxComp = 0.17;
    if (this.comp > maxComp) { this.comp = maxComp; this.vel = Math.min(0, this.vel); }
    if (this.comp < -0.04) { this.comp = -0.04; this.vel = Math.max(0, this.vel); }
    const brakeDive = airborne ? 0 : brake * 0.035;
    this.fork = clamp(this.comp + brakeDive, -0.04, 0.17);
    this.dive = brakeDive * 0.6;
  }
}
