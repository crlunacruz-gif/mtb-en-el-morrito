import { clamp } from '../../utils/noise.js';

/**
 * Piloto de pruebas (sólo desarrollo: ?bot=1). NO es asistencia de juego.
 * Sirve para verificar que cada línea es transitable y medir tiempos.
 *   pick: índice de línea a elegir en cada grupo (0, 1, 2…) o 'mix' para alternar.
 */
export class TestRider {
  constructor(trail, collision, pick = 0) {
    this.trail = trail;
    this.collision = collision;
    this.pick = pick;
    this._smp = {};
    this._w = {};
    this._tmp = [];
  }

  chooseLine(group, gi) {
    const n = group.lines.length;
    if (this.pick === 'mix') return group.lines[gi % n];
    return group.lines[Math.min(n - 1, Number(this.pick) || 0)];
  }

  targetOffset(s, o) {
    const tr = this.trail;
    const groups = tr.groupList;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (s > g.s0 && s < g.s1) {
        const line = this.chooseLine(g, gi);
        return tr.lineCenter(line, s);
      }
    }
    const lines = tr.linesAt(s, this._tmp);
    let best = 0, bd = Infinity;
    for (const l of lines) { const d = Math.abs(l.c - o); if (d < bd) { bd = d; best = l.c; } }
    return best;
  }

  read(bike) {
    const tr = this.trail;
    const v = bike.v;
    const smp = tr.sampleAt(bike.s, this._smp);
    const L = 2.2 + v * 0.42;
    const oT = this.targetOffset(bike.s + L, bike.o);
    const w = tr.toWorld(bike.s + L, oT, this._w);
    const dx = w.x - bike.pos.x, dz = w.z - bike.pos.z;
    const rel = Math.atan2(dx * smp.rightX + dz * smp.rightZ, dx * smp.dirX + dz * smp.dirZ);
    const steer = clamp((rel - bike.psi) * 2.6 - bike.slip * 0.8, -1, 1);

    // velocidad objetivo según curvas y secciones técnicas
    let kMax = 0;
    for (let d = 0; d < Math.max(8, v * 2); d += 1) kMax = Math.max(kMax, Math.abs(tr.sampleAt(bike.s + d, this._smp).kappa));
    let vt = kMax > 0.01 ? Math.sqrt((0.5 * (bike.surface.grip || 1) * 9.81) / kMax) : 30;
    const sec = tr.sections[bike.section]?.id;
    if (sec === 'rockgarden') vt = Math.min(vt, 6.2);
    if (sec === 'parallel' && bike.o < -1.5) vt = Math.min(vt, 7);
    const ledge = tr.featureAhead(bike.s, bike.o, 18, ['ledge']);
    if (ledge && ledge.feature.h > 0.6) vt = Math.min(vt, 8.5);
    const brake = bike.airborne ? 0 : clamp((v - vt) * 0.9, 0, 1);

    // pop: bordes de ledge, lips de table y rocas
    let pop = false;
    const near = tr.featureAhead(bike.s, bike.o, Math.max(0.6, v * 0.09), ['ledge', 'table']);
    if (near && (near.feature.type === 'table' || near.feature.h >= 0.3)) pop = true;
    const rock = this.collision.rockAhead(bike.fx, bike.fz, Math.sin(bike.yaw), -Math.cos(bike.yaw), Math.max(0.6, v * 0.1), 0.15);
    if (rock && !rock.rock.solid) pop = true;

    // en el aire: nivelar la bici con la pendiente
    let lean = 0;
    if (bike.airborne) {
      const target = Math.atan(smp.grade) + 0.05;
      lean = clamp((target - bike.pitch) * 3, -1, 1);
    }
    return { steer, brake, pop, lean, drift: false };
  }
}
