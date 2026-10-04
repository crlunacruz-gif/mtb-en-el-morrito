import { clamp, damp, smoothstep, createNoise2D } from '../utils/noise.js';
import { SuspensionSystem } from './SuspensionSystem.js';

const G = 9.81;

/**
 * Riding model "arcade believable" (Milestone 2).
 *
 * Estado en coordenadas del trail (Frenet):
 *   s, o     posición a lo largo del eje / lateral (+ derecha)
 *   psi      hacia dónde apunta la bici, relativo al eje
 *   phi      hacia dónde VIAJA la bici (momentum), relativo al eje
 *   slip     psi − phi → derrape lateral cuando el grip no alcanza
 *   v        velocidad horizontal · y, vy: altura y velocidad vertical
 *
 * Claves del feeling:
 *   - La bici NO sigue el trail sola: mantiene su rumbo en el mundo. Si no giras en
 *     una curva, te sales. La asistencia (steeringAssist) es como máximo 10–15 %.
 *   - Steering progresivo con inercia, más delicado a alta velocidad y según el grip.
 *   - El momentum lateral depende del grip: en tierra suelta la trayectoria se queda
 *     atrás del manubrio (drift). Frenar en curva reduce el grip lateral.
 *   - Gravedad por pendiente real bajo las ruedas (rollers, kickers y drops cuentan).
 *   - Despega sola cuando el suelo cae más rápido que la gravedad (lips, drops, rollers
 *     rápidos). SPACE = pop (bunny hop). En el aire: W nariz arriba, S nariz abajo.
 *   - Aterrizaje limpio / sketchy / crash según impacto vertical y ángulo.
 *   - Rocas: rodables (golpe, vibración, desvío) o sólidas (choque).
 *   - Equilibrio (stability): los golpes lo bajan; en 0 → crash. Se recupera solo.
 *
 * Input: { steer −1..1, brake 0..1, pop bool, lean −1..1 (W/S en el aire) }
 */
export class BikeController {
  constructor(trail, terrain, collision, config, tuning) {
    this.trail = trail;
    this.terrain = terrain;
    this.collision = collision;
    this.cfg = config;
    this.T = tuning;
    this.noise = createNoise2D(4242);
    this.suspension = new SuspensionSystem(tuning);
    this._smp = {};
    this._smpAhead = {};
    this._info = {};
    this._infoF = {};
    this.surface = {};
    this.events = [];
    this.reset();
  }

  reset(s = 0.5, o = 0) {
    this.s = s;
    this.o = o;
    this.psi = 0;
    this.phi = 0;
    this.v = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.brake = 0;
    this.lean = 0;
    this.pitch = 0;
    this.pitchRate = 0;
    this.dive = 0;
    this.y = null;
    this.vy = 0;
    this.ballY = null;
    this.ballVy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.distance = 0;
    this.stability = 1;
    this.controlLoss = 0;
    this.popCooldown = 0;
    this.lastPop = -10;
    this.prevPop = false;
    this.time = 0;
    this.progressS = s;
    this.progressT = 0;
    this.finished = false;
    this.stopped = false;
    this.running = false;
    this.crashed = null;
    this.lastRock = null;
    this.impact = 0;
    this.roughness = 0.3;
    this.onTrail = true;
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.slip = 0;
    this.prevGC = null;
    this.vyG = 0;
    this.suspension.reset();
    this.events.length = 0;
    this.updatePose(0);
  }

  start(v = this.cfg.startSpeed) {
    this.running = true;
    this.crashed = null;
    this.v = v;
    // el reloj de "atascado" empieza recién al arrancar (no cuenta la intro ni la cuenta regresiva)
    this.progressS = this.s;
    this.progressT = this.time;
  }

  groundAt(x, z, info) {
    return this.terrain.heightAt(x, z, info) + this.collision.bumpAt(x, z);
  }

  update(dt, input) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const popEdge = input.pop && !this.prevPop;
    this.prevPop = input.pop;
    for (let i = 0; i < steps; i++) {
      if (this.crashed) break;
      this.step(h, input, i === 0 && popEdge);
    }
    this.suspension.update(dt, this.vyG, this.airborne, this.brake);
    this.updatePose(dt);
  }

  emit(e) {
    this.events.push(e);
  }

  crash(reason) {
    if (this.crashed || this.finished) return;
    this.crashed = reason;
    this.running = false;
    this.emit({ type: 'crash', reason, s: this.s, o: this.o, v: this.v });
  }

  step(dt, input, popNow) {
    const c = this.cfg;
    const T = this.T;
    const tr = this.trail;
    this.time += dt;
    const smp = tr.sampleAt(this.s, this._smp);
    const surf = tr.surfaceAt(this.s, this.o, this.surface);
    const grip = surf.grip;
    const gripN = clamp(grip / T.grip, 0.3, 1.3);
    const v = this.v;
    const ground = !this.airborne || this.airTime < 0.08; // micro-saltos: sigue teniendo control

    // ---------------- INPUT ----------------
    this.controlLoss = Math.max(0, this.controlLoss - dt);
    const loss = clamp(this.controlLoss / 0.8, 0, 1);
    const wobble = loss * 0.6 * this.noise(this.time * 3.1, 7.7);
    const steerIn = clamp(input.steer * (1 - 0.6 * loss) + wobble, -1, 1);
    this.steer = damp(this.steer, steerIn, c.steerResponse * (0.6 + 0.4 * gripN), dt);
    this.brake = this.running ? damp(this.brake, input.brake, 12, dt) : 0;

    // ---------------- STEERING (heading) ----------------
    const maxYaw = (c.maxYawRate / (1 + v / c.yawSpeedRef)) * (0.55 + 0.45 * Math.min(1, gripN));
    const assist = clamp(T.steeringAssist, 0, 0.15);
    let target;
    if (ground) target = this.steer * maxYaw + assist * smp.kappa * v;
    else target = this.steer * maxYaw * 0.35; // algo de control en el aire (girar el cuerpo)
    this.yawRate = damp(this.yawRate, target, c.yawInertia, dt);

    // ---------------- MOMENTUM LATERAL (trayectoria vs dirección) ----------------
    let travelRate = 0;
    if (ground) {
      const brakeUse = clamp((this.brake * T.brakingStrength) / (grip * G), 0, 1);
      const latAvail = Math.sqrt(Math.max(0.12, 1 - 0.75 * brakeUse * brakeUse));
      const maxTurn = (grip * G * latAvail) / Math.max(v, 1.5);
      travelRate = clamp(this.yawRate + (this.psi - this.phi) * c.travelFollow, -maxTurn, maxTurn);
    }

    // ---------------- VELOCIDAD ----------------
    const slopeSin = Math.sin(this.groundPitch || 0);
    let a = -c.dragCoef * v * v;
    if (ground && this.running) {
      a += G * slopeSin * c.gravityScale;
      a -= c.rollResistance + c.roughDrag * Math.max(0, surf.rough - 0.3) * Math.min(1, v / 4);
      a -= c.offTrailDrag * smoothstep(0.05, 0.8, surf.e) * Math.min(1, v / 3);
      a -= this.brake * T.brakingStrength * Math.min(1, gripN + 0.15);
      a -= Math.abs(Math.sin(this.slip)) * c.slipScrub * Math.min(1, v / 5);
      if (c.cornerAssist > 0) {
        const k = this.lookAheadKappa(Math.max(5, v * 1.1));
        if (k > 0.02) {
          const vc = Math.sqrt((grip * G * 0.8) / k);
          if (v > vc) a -= (v - vc) * 3 * c.cornerAssist;
        }
      }
    }
    // a muy baja velocidad el rider empuja/pedalea para no quedarse varado
    if (ground && this.running && !this.finished && v < 1.8) a = Math.max(a, 1.4);
    if (this.finished) a -= 1.6 + v * 0.18;
    if (!this.running) a = -Math.max(3, v * 4);
    this.v = clamp(v + a * dt, 0, T.maxSpeed);

    // ---------------- CINEMÁTICA EN EL TRAIL ----------------
    const denom = Math.max(0.3, 1 - smp.kappa * this.o);
    const sDot = (this.v * Math.cos(this.phi)) / denom;
    this.psi += (this.yawRate - smp.kappa * sDot) * dt;
    this.phi += (travelRate - smp.kappa * sDot) * dt;
    this.psi = clamp(this.psi, -1.5, 1.5);
    this.phi = clamp(this.phi, -1.5, 1.5);
    this.slip = this.psi - this.phi;
    this.o += this.v * Math.sin(this.phi) * dt;
    this.s = Math.min(tr.length - 1, this.s + sDot * dt);
    this.distance += this.v * dt;

    // ---------------- VERTICAL: suelo, despegue, aire, aterrizaje ----------------
    this.computeGround();
    const gC = this.gC;
    if (this.y === null) this.y = gC;
    if (this.prevGC === null) this.prevGC = gC;
    // el suelo no puede empujar la bici hacia arriba más rápido que una rampa de ~37°
    // (evita "catapultas" irreales al pisar piedras o bordes)
    const vyG = dt > 0 ? clamp((gC - this.prevGC) / dt, -(this.v * 1.4 + 2), this.v * 0.75 + 0.4) : 0;
    this.prevGC = gC;
    this.popCooldown = Math.max(0, this.popCooldown - dt);

    if (!this.airborne) {
      // Trayectoria balística "fantasma": la suspensión se extiende hasta ~13 cm
      // para mantener las ruedas en el suelo; si el suelo cae más que eso, despegas.
      if (this.ballY === null) { this.ballY = gC; this.ballVy = vyG; }
      this.ballVy -= G * dt;
      this.ballY += this.ballVy * dt;
      if (gC >= this.ballY) { this.ballY = gC; this.ballVy = vyG; }
      if (popNow && this.running && this.popCooldown <= 0) {
        // pop: en plano levanta ~15 cm; sobre una rampa suma menos (ya vas subiendo)
        const base = Math.max(vyG, this.ballVy);
        this.vy = base + c.popStrength * (base > 0.8 ? 0.35 : 1);
        this.lastPop = this.time;
        this.popCooldown = c.popCooldown;
        this.takeoff('pop');
      } else if (this.running && gC < this.ballY - 0.13) {
        this.y = this.ballY;
        // cuerpo y suspensión absorben parte del impulso del labio (kickers)
        this.vy = this.ballVy > 0.8 ? this.ballVy * c.lipAbsorb : this.ballVy;
        this.takeoff(this.ballVy > 1 ? 'kicker' : 'drop');
      } else {
        this.y = gC;
        this.vy = vyG;
        this.vyG = vyG;
      }
    }
    if (this.airborne) {
      this.vy -= G * c.airGravity * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      // pitch en el aire: sigue la trayectoria + input (W/S) + impulso de despegue
      const traj = Math.atan2(-this.vy, Math.max(1, this.v));
      // el rider nivela solo la bici hacia la pendiente de abajo (accesible), W/S corrigen
      const level = traj * 0.4 + (this.groundPitch || 0) * 0.6;
      const want = (level - this.pitch) * 1.6 + (input.lean || 0) * c.airPitchControl;
      this.pitchRate = damp(this.pitchRate, want, 6, dt);
      this.dive *= Math.exp(-dt / 0.45);
      this.pitch += (this.pitchRate + this.dive) * dt;
      if (this.y <= gC) this.land(gC, vyG);
    } else {
      this.airTime = 0;
      this.pitch = damp(this.pitch, this.groundPitch, 22, dt);
    }

    if (!this.running) return;

    // ---------------- COLISIONES ----------------
    this.checkRocks();
    this.checkBermWall(tr);
    // derrape excesivo → caída
    if (ground && Math.abs(this.slip) > c.slipCrash && this.v > 3.5) this.crash('lowside');
    // salirse del corredor
    if (!this.finished && surf.dOut > c.offTrailCrash) this.crash('offtrail');
    // equilibrio
    this.stability = Math.min(1, this.stability + c.stabilityRecover * dt);
    if (this.stability <= 0) this.crash('balance');

    this.onTrail = surf.e <= 0.05;
    this.roughness = this.airborne ? 0 : surf.rough * (surf.e > 0.05 ? 1.1 : 0.6);

    if (!this.finished && this.s >= tr.finishS) {
      this.finished = true;
      this.emit({ type: 'finish' });
    }
    if (this.finished && this.v < 0.25) this.stopped = true;
    // atascado (contra una roca o fuera de línea sin avanzar) → cuenta como caída
    if (!this.finished && this.running) {
      if (this.s > this.progressS + 1) { this.progressS = this.s; this.progressT = this.time; }
      else if (this.time - this.progressT > 3) this.crash('stuck');
    }
  }

  computeGround() {
    const tr = this.trail;
    const smp = tr.sampleAt(this.s, this._smp);
    const x = smp.x + smp.rightX * this.o;
    const z = smp.z + smp.rightZ * this.o;
    const yaw = smp.theta + this.psi;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const wb = 0.6;
    this.fx = x + fx * wb; this.fz = z + fz * wb;
    this.px = x; this.pz = z;
    const gF = this.groundAt(x + fx * wb, z + fz * wb, this._infoF);
    const gR = this.groundAt(x - fx * wb, z - fz * wb, this._info);
    this.gF = gF; this.gR = gR;
    this.gC = (gF + gR) / 2;
    this.groundPitch = Math.atan2(gR - gF, wb * 2);
  }

  takeoff(kind) {
    this.airborne = true;
    this.airTime = 0;
    this.takeoffKind = kind;
    const popped = this.time - this.lastPop < 0.3;
    if (popped) this.dive = -0.35;
    else if (kind === 'drop') this.dive = 0.9 * clamp(1.3 - this.v / 12, 0.3, 1.0);
    else this.dive = 0;
    this.pitchRate = 0;
  }

  land(gC, vyG) {
    const c = this.cfg;
    const T = this.T;
    const vyGround = -Math.tan(this.groundPitch) * this.v;
    const impact = Math.max(0, vyGround - this.vy);
    const pitchDiff = this.pitch - this.groundPitch;
    const airTime = this.airTime;
    this.airborne = false;
    this.y = gC;
    this.vy = vyG;
    this.ballY = gC;
    this.ballVy = vyG;
    this.vyG = vyG;
    this.dive = 0;
    if (airTime < 0.15) { this.suspension.landing(impact * 0.5); return; }
    const susp = T.suspensionStrength;
    const hop = clamp(1.6 - airTime * 1.5, 1, 1.4); // saltitos cortos perdonan más el ángulo
    const cleanImpact = c.landCleanImpact * (0.75 + 0.25 * susp);
    const crashImpact = c.landCrashImpact * (0.8 + 0.2 * susp);
    let quality = 'clean';
    if (impact > crashImpact || pitchDiff > c.landCrashNose * hop || pitchDiff < -c.landCrashTail * hop || Math.abs(this.slip) > 0.75) {
      quality = 'crash';
    } else if (impact > cleanImpact || Math.abs(pitchDiff) > c.landCleanPitch * hop) {
      quality = 'sketchy';
      this.stability -= 0.35 + 0.1 * Math.max(0, impact - cleanImpact);
      this.controlLoss = Math.max(this.controlLoss, 0.65);
      this.v *= 0.88;
      this.psi += (this.noise(this.time, 3) * 0.12);
    } else {
      this.v *= 0.985;
    }
    this.suspension.landing(impact);
    this.impact = impact;
    this.emit({ type: 'land', quality, impact, pitchDiff, airTime, x: this.px, y: gC, z: this.pz, v: this.v });
    if (quality === 'crash') this.crash('landing');
  }

  checkRocks() {
    const c = this.cfg;
    const col = this.collision;
    // rocas sólidas: choque frontal con la rueda delantera
    const wheelY = this.airborne ? this.y : this.gF;
    const solid = col.solidHit(this.fx, this.fz, wheelY);
    if (solid && solid === this.lastSolid && this.time - this.lastSolidT < 1.2) {
      // ya rebotaste en esta roca: sólo te empuja fuera, sin nuevo castigo
      const dx = this.fx - solid.x, dz = this.fz - solid.z;
      const lat = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw);
      this.o += Math.sign(lat || 1) * 0.02;
      return;
    }
    if (solid) {
      this.lastSolid = solid;
      this.lastSolidT = this.time;
      if (this.v > c.solidCrashSpeed) { this.crash('rock'); return; }
      // a baja velocidad: rebote y desvío
      const side = Math.sign((this.fx - solid.x) * Math.cos(this.yaw) + (this.fz - solid.z) * Math.sin(this.yaw)) || 1;
      this.psi += side * 0.35;
      this.phi += side * 0.25;
      this.v *= 0.25;
      this.stability -= 0.3;
      this.controlLoss = Math.max(this.controlLoss, 0.6);
      this.suspension.hit(4);
      this.emit({ type: 'jolt', severity: 4, solid: true });
      return;
    }
    if (this.airborne) { this.lastRock = null; return; }
    // rocas rodables: golpe al entrar al radio de una roca nueva
    const list = col.near(this.fx, this.fz);
    let hitRock = null;
    if (list) {
      for (const r of list) {
        if (r.solid || r.hAbove < 0.035) continue;
        const d2 = (this.fx - r.x) ** 2 + (this.fz - r.z) ** 2;
        if (d2 < r.r * r.r) { hitRock = r; break; }
      }
    }
    if (hitRock && hitRock !== this.lastRock) {
      const susp = this.T.suspensionStrength;
      const sev = ((this.v * hitRock.hAbove) / (hitRock.r * 0.8 + 0.18)) * 0.7 / (0.6 + 0.4 * susp);
      if (sev > c.joltCrash) { this.crash('rock'); return; }
      if (sev > c.joltSmall) {
        this.stability -= 0.1 * sev;
        this.controlLoss = Math.max(this.controlLoss, 0.12 * sev);
        this.v *= 1 - 0.035 * sev;
        this.psi += (this.noise(this.time * 5, 1.3) > 0 ? 1 : -1) * 0.035 * sev;
      } else {
        this.psi += (this.noise(this.time * 5, 2.1)) * 0.02 * sev;
      }
      this.suspension.hit(sev);
      this.emit({ type: 'jolt', severity: sev, solid: false });
    }
    this.lastRock = hitRock;
  }

  /** Muro de tablas del peralte: te contiene (rebote suave), no te bota. */
  checkBermWall(tr) {
    // pircas: muros de piedra a ambos lados → rebote y golpe
    const walls = tr.wallsAt(this.s);
    if (walls && (this.o < walls.lo || this.o > walls.hi)) {
      const dir = this.o > walls.hi ? 1 : -1;
      this.o = dir > 0 ? walls.hi : walls.lo;
      if (this.phi * dir > 0) {
        const hit = Math.abs(Math.sin(this.phi)) * this.v;
        this.phi *= -0.2;
        this.psi = this.psi * 0.4 + this.phi * 0.6;
        this.v *= 0.85;
        if (hit > 3.5) { this.crash('rock'); return; }
        this.stability -= 0.12 * hit;
        this.emit({ type: 'jolt', severity: hit + 1, solid: true });
      }
    }
    const f = tr.bermAt(this.s);
    if (!f || !f.wood) return;
    const bp = tr.bermProfile(f, this.s, this.o);
    if (bp.env < 0.3) return;
    if ((this.o - bp.wallO) * f.dir > 0) {
      this.o = bp.wallO;
      if (this.phi * f.dir > 0) {
        const hit = Math.abs(Math.sin(this.phi)) * this.v;
        this.phi *= -0.15;
        this.psi = this.psi * 0.4 + this.phi * 0.6;
        this.v *= 0.94;
        if (hit > 1.5) {
          this.stability -= 0.08 * hit;
          this.suspension.hit(hit);
          this.emit({ type: 'jolt', severity: hit, solid: false, wall: true });
        }
      }
    }
  }

  lookAheadKappa(dist) {
    let k = 0;
    for (let d = 0; d <= dist; d += 1) k = Math.max(k, Math.abs(this.trail.sampleAt(this.s + d, this._smpAhead).kappa));
    return k;
  }

  updatePose(dt) {
    const tr = this.trail;
    const smp = tr.sampleAt(this.s, this._smp);
    if (this.gC === undefined || dt === 0) {
      this.computeGround();
      tr.surfaceAt(this.s, this.o, this.surface);
    }
    if (this.y === null) this.y = this.gC;
    this.pos.x = smp.x + smp.rightX * this.o;
    this.pos.z = smp.z + smp.rightZ * this.o;
    this.pos.y = this.y;
    this.yaw = smp.theta + this.psi;
    const leanTarget = this.airborne ? this.lean * 0.9 : clamp(Math.atan((this.v * this.yawRate) / G), -0.7, 0.7);
    this.lean = damp(this.lean, leanTarget, 6, dt || 1);
    this.section = smp.section;
    this.halfW = smp.halfW;
    this.elevation = this.y;
    this.impact = damp(this.impact, 0, 3, dt || 1);
  }

  /** Pendiente de la línea central más adelante (para la mirada de la cámara). */
  slopeAhead(dist) {
    const a = this.trail.sampleAt(this.s, this._smpAhead).y;
    const b = this.trail.sampleAt(this.s + dist, this._smpAhead).y;
    return Math.atan2(a - b, dist);
  }

  drainEvents() {
    const e = this.events.slice();
    this.events.length = 0;
    return e;
  }

  get speedKmh() {
    return this.v * 3.6;
  }
}
