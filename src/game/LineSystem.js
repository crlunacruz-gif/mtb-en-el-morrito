/**
 * Registro de micro-líneas (sin UI).
 *
 * Por cada grupo de líneas (p.ej. las 3 del rock garden) mide cuánto tiempo pasa
 * el rider dentro de cada línea mientras están separadas, y emite:
 *   lineEntered   { group, line, name }                 primera vez que entra a una línea
 *   lineCompleted { group, line, name, quality, hits }  al salir del grupo, con la línea dominante
 * quality (0–1) = fracción del tiempo dentro de esa línea × penalización por golpes/aterrizajes malos.
 * Queda listo para el scoring del próximo milestone.
 */
export class LineSystem {
  constructor(trail) {
    this.trail = trail;
    this.reset();
  }

  reset() {
    this.state = {};
    for (const g of this.trail.groupList) {
      this.state[g.id] = { time: {}, total: 0, entered: new Set(), hits: 0, completed: false, current: null };
    }
    this.results = [];
    this.events = [];
    this.current = null;
  }

  /** Registrar un golpe (roca, aterrizaje sketchy) en el grupo activo. */
  hit(weight = 1) {
    if (!this.activeGroup) return;
    this.state[this.activeGroup].hits += weight;
  }

  update(dt, s, lineId) {
    this.activeGroup = null;
    this.current = null;
    for (const g of this.trail.groupList) {
      const st = this.state[g.id];
      if (st.completed) continue;
      // zona "separada": sólo cuenta cuando las líneas ya se abrieron
      const inside = s > g.s0 + 3 && s < g.s1 - 3;
      if (inside) {
        this.activeGroup = g.id;
        st.total += dt;
        const line = g.lines.find((l) => l.id === lineId);
        if (line) {
          this.current = line;
          st.time[line.id] = (st.time[line.id] || 0) + dt;
          if (!st.entered.has(line.id)) {
            st.entered.add(line.id);
            this.events.push({ type: 'lineEntered', group: g.id, line: line.id, name: line.name });
          }
        }
      }
      if (s >= g.s1 - 3 && st.total > 0) {
        st.completed = true;
        let best = null, bestT = 0;
        for (const [id, t] of Object.entries(st.time)) if (t > bestT) { bestT = t; best = id; }
        const line = g.lines.find((l) => l.id === best);
        const inFrac = st.total > 0 ? bestT / st.total : 0;
        const quality = Math.max(0, Math.min(1, inFrac * (1 - Math.min(0.6, st.hits * 0.15))));
        const res = { type: 'lineCompleted', group: g.id, line: best, name: line ? line.name : 'Fuera de línea', quality, hits: st.hits };
        this.results.push(res);
        this.events.push(res);
      }
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
