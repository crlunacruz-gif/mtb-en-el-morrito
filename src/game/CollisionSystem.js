/**
 * Colisiones con rocas.
 *
 *  - Rocas "rodables" (altura sobre el suelo < solidHeight): se suman al suelo
 *    como un domo; la rueda sube y baja, y el cambio brusco genera un golpe (jolt).
 *  - Rocas "sólidas" (≥ solidHeight): no se pueden rodar. Si la rueda delantera
 *    entra en su radio por debajo de su cima → choque (crash si vas rápido).
 *  - Los bordes y el terreno lateral se resuelven en BikeController con la
 *    distancia al corredor (dOut) y la superficie (grip/rugosidad).
 */
export class CollisionSystem {
  constructor(solidHeight = 0.42) {
    this.solidHeight = solidHeight;
    this.cell = 2;
    this.map = new Map();
    this.rocks = [];
  }

  key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  /** hAbove = altura de la roca sobre el suelo local; top = y absoluta de la cima. */
  addRock(x, z, r, hAbove, top) {
    const rock = { x, z, r, hAbove, top, solid: hAbove >= this.solidHeight, id: this.rocks.length };
    this.rocks.push(rock);
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const k = this.key(i, j);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(rock);
      }
    }
    return rock;
  }

  near(x, z) {
    return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
  }

  /** Altura extra por rocas rodables en (x,z). Devuelve 0 si no hay. */
  bumpAt(x, z) {
    const list = this.near(x, z);
    if (!list) return 0;
    let h = 0;
    for (const r of list) {
      if (r.solid) continue;
      const d2 = ((x - r.x) ** 2 + (z - r.z) ** 2) / (r.r * r.r);
      if (d2 >= 1) continue;
      h = Math.max(h, r.hAbove * Math.pow(1 - d2, 1.4)); // perfil suave: se rueda, no se "despega"
    }
    return h;
  }

  /** Roca sólida que la rueda (en x,z con base en wheelY) está chocando, o null. */
  solidHit(x, z, wheelY) {
    const list = this.near(x, z);
    if (!list) return null;
    for (const r of list) {
      if (!r.solid) continue;
      const d2 = (x - r.x) ** 2 + (z - r.z) ** 2;
      const rr = r.r * 0.82 + 0.06;
      if (d2 < rr * rr && wheelY < r.top - 0.15) return r;
    }
    return null;
  }

  /** ¿Hay una roca (rodable alta o sólida) en los próximos `dist` metros? */
  rockAhead(x, z, dirX, dirZ, dist, minH = 0.12) {
    for (let d = 0.5; d <= dist; d += 0.5) {
      const px = x + dirX * d, pz = z + dirZ * d;
      const list = this.near(px, pz);
      if (!list) continue;
      for (const r of list) {
        if (r.hAbove < minH) continue;
        if ((px - r.x) ** 2 + (pz - r.z) ** 2 < r.r * r.r) return { rock: r, dist: d };
      }
    }
    return null;
  }
}
