/**
 * Contextos de skills: dice CUÁNDO una acción tendría sentido.
 * Milestone 2 sólo implementa el pop (SPACE) para bunny hop / jump / drop.
 * Roost, manual, whip y tabletop quedan detectados aquí para el próximo milestone.
 *
 *   roost      curva + velocidad + tierra suelta + steering activo
 *   manual     velocidad suficiente + terreno estable + en el suelo
 *   bunnyHop   en el suelo + obstáculo (roca / escalón) cerca adelante
 *   jump       en el suelo + takeoff apropiado (kicker/table/roller) adelante
 *   drop       en el suelo + borde de drop adelante + approach correcto
 *   whip       en el aire
 *   tabletop   en el aire con airtime suficiente
 */
export class SkillContext {
  constructor(trail, collision) {
    this.trail = trail;
    this.collision = collision;
    this.flags = { roost: false, manual: false, bunnyHop: false, jump: false, drop: false, whip: false, tabletop: false };
    this._smp = {};
  }

  update(bike) {
    const f = this.flags;
    const tr = this.trail;
    const smp = tr.sampleAt(bike.s, this._smp);
    const ground = !bike.airborne;
    const v = bike.v;
    const curve = Math.abs(smp.kappa) > 0.035;
    f.roost = ground && curve && v > 6 && bike.surface.loose > 0.35 && Math.abs(bike.steer) > 0.3;
    f.manual = ground && v > 5 && bike.surface.rough < 0.5 && Math.abs(bike.slip) < 0.1;
    const look = Math.max(2, v * 0.35);
    const fa = tr.featureAhead(bike.s, bike.o, look, ['ledge', 'table', 'roller']);
    const rock = this.collision.rockAhead(bike.pos.x, bike.pos.z, Math.sin(bike.yaw), -Math.cos(bike.yaw), look, 0.12);
    f.jump = ground && !!fa && (fa.feature.type === 'table' || (fa.feature.type === 'roller' && fa.feature.h >= 0.3)) && v > 4;
    f.drop = ground && !!fa && fa.feature.type === 'ledge' && fa.feature.h >= 0.6 && v > 4 && v < 14;
    f.bunnyHop = ground && v > 2.5 && (!!rock || (!!fa && fa.feature.type === 'ledge'));
    f.whip = bike.airborne && bike.airTime > 0.2;
    f.tabletop = bike.airborne && (bike.airTime > 0.35 || bike.vy > 2.5);
    this.featureAhead = fa;
    this.rockAhead = rock;
    return f;
  }

  list() {
    return Object.entries(this.flags).filter(([, v]) => v).map(([k]) => k);
  }
}
