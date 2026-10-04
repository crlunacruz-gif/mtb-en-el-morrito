/**
 * DISEÑO DEL TRAIL — Milestone 2
 *
 * Cada sección define:
 *   path      ['S', m] recta · ['T', grados, radio] curva (+ derecha, − izquierda)
 *   width     ancho de la línea principal (m)
 *   grade     pendiente relativa (se reescala para cumplir elevationDrop)
 *   rough     0–1+ rugosidad (vibración, pérdida de velocidad)
 *   loose     0–1 tierra suelta (menos grip)
 *   camber    inclinación lateral (m de altura por m lateral; + = derecha más alta)
 *   ruts      surcos en el centro de las líneas
 *   exposure  [izq, der] caída del cerro a cada lado
 *   lines     micro-líneas: se separan de la principal y vuelven a juntarse
 *   dividers  relieve/rocas entre líneas de un mismo grupo
 *   features  relieve: roller, ledge (escalón/drop natural), table (kicker+mesa+landing), hole,
 *             berm (peralte: dir = lado exterior de la curva, wood = muro de tablas)
 *   rocks     rocas puestas a mano (h ≥ 0.42 m = roca sólida: se esquiva o se salta)
 *   rockFields rocas aleatorias en una franja (s, o)
 *
 * Todas las posiciones (at, from, to) están en metros desde el inicio de la sección,
 * y se multiplican por TUNING.trailLength. Los offsets laterales (o) en metros (+ derecha).
 */
export function buildMorroSections(T) {
  const D = T.rockGardenDifficulty;
  return [
    // -------------------------------------------------------------- 1 DROP IN
    {
      id: 'dropin', name: 'Drop In',
      path: [['S', 16], ['T', 22, 40], ['S', 12], ['T', -26, 36], ['S', 10]],
      width: 1.8, grade: 0.12, rough: 0.35, loose: 0.15, camber: 0, exposure: [1.6, 0.8], rockDensity: 0.8,
      features: [
        { type: 'roller', at: 18, len: 3.5, h: 0.18 },
        { type: 'roller', at: 31, len: 3, h: 0.14 },
        { type: 'roller', at: 50, len: 4, h: 0.2 },
        // primer peralte de madera (curva a la izquierda → sube el lado derecho)
        { type: 'berm', at: 40, len: 22, h: 0.6, dir: 1, wood: true },
      ],
      rockFields: [{ from: 8, to: 66, o0: -0.8, o1: 0.8, count: 9, hMin: 0.04, hMax: 0.09 }],
    },

    // -------------------------------------------------------------- 2 ZETAS
    {
      id: 'zetas', name: 'Zetas',
      path: [['S', 5], ['T', -60, 10], ['S', 11], ['T', 130, 7], ['S', 11], ['T', -130, 7], ['S', 10], ['T', 60, 11], ['S', 6]],
      width: 1.35, grade: 0.15, rough: 0.5, loose: 0.55, camber: 0, ruts: true, exposure: [1, 1], rockDensity: 1.5,
      lines: [
        // switchback 1 (derecha): inside = derecha
        { id: 'z1-inside', name: 'Zeta 1 · Inside', group: 'z1', from: 21, to: 48, blend: 5, offset: 1.5, hw: 0.5, rough: 1.0, loose: 0.3, replacesMain: true },
        { id: 'z1-outside', name: 'Zeta 1 · Outside', group: 'z1', from: 21, to: 48, blend: 5, offset: -1.7, hw: 0.62, rough: 0.25, loose: 0.35, grip: 0.12, berm: 0.18, replacesMain: true },
        // switchback 2 (izquierda): inside = izquierda
        { id: 'z2-inside', name: 'Zeta 2 · Inside', group: 'z2', from: 50, to: 76, blend: 5, offset: -1.5, hw: 0.5, rough: 1.0, loose: 0.3, replacesMain: true },
        { id: 'z2-outside', name: 'Zeta 2 · Outside', group: 'z2', from: 50, to: 76, blend: 5, offset: 1.7, hw: 0.62, rough: 0.25, loose: 0.35, grip: 0.12, berm: -0.18, replacesMain: true },
      ],
      dividers: [{ group: 'z1', height: 0.45 }, { group: 'z2', height: 0.45 }],
      features: [
        { type: 'ledge', at: 33, o: 1.5, w: 0.6, h: 0.2 * D, rise: 2.5 },
        { type: 'ledge', at: 62, o: -1.5, w: 0.6, h: 0.22 * D, rise: 2.5 },
      ],
      rockFields: [
        { from: 25, to: 44, line: 'z1-inside', spread: 0.45, count: 6, hMin: 0.1 * D, hMax: 0.24 * D },
        { from: 54, to: 72, line: 'z2-inside', spread: 0.45, count: 6, hMin: 0.1 * D, hMax: 0.24 * D },
        { from: 0, to: 96, o0: -0.7, o1: 0.7, count: 6, hMin: 0.04, hMax: 0.09 },
      ],
    },

    // -------------------------------------------------------------- 3 ROCK GARDEN
    {
      id: 'rockgarden', name: 'Rock Garden',
      path: [['S', 12], ['T', -14, 45], ['S', 22], ['T', 12, 45], ['S', 14]],
      width: 1.5, grade: 0.12, rough: 1.0, loose: 0.25, camber: 0, exposure: [1.1, 1.1], rockDensity: 1.8,
      lines: [
        { id: 'rg-smooth', name: 'Rock Garden · Smooth', group: 'rg', from: 4, to: 62, blend: 6, offset: -2.5, hw: 0.62, rough: 0.7, loose: 0.55, wiggle: { amp: 0.55, period: 15 } },
        { id: 'rg-center', name: 'Rock Garden · Center', group: 'rg', from: 4, to: 62, blend: 6, offset: 0, hw: 0.45 / Math.sqrt(D), rough: 0.9, loose: 0.15 },
        { id: 'rg-send', name: 'Rock Garden · Send', group: 'rg', from: 4, to: 62, blend: 6, offset: 2.5, hw: 0.55, rough: 0.6, loose: 0.1 },
      ],
      mainAlias: 'rg-center',
      dividers: [{ group: 'rg', height: 0.35 }],
      features: [
        // escalones naturales de la línea Send (suben suave, caen seco)
        { type: 'ledge', at: 18, o: 2.5, w: 0.8, h: 0.35 * D, rise: 3.5 },
        { type: 'ledge', at: 31, o: 2.5, w: 0.8, h: 0.42 * D, rise: 4 },
        { type: 'ledge', at: 45, o: 2.5, w: 0.8, h: 0.48 * D, rise: 4.5 },
        // huecos y escalones menores en el centro y en smooth
        { type: 'hole', at: 12, len: 1.4, h: 0.14 * D, o: 0, w: 0.5 },
        { type: 'ledge', at: 24, o: 0, w: 0.5, h: 0.22 * D, rise: 2.5 },
        { type: 'hole', at: 36, len: 1.2, h: 0.12 * D, o: 0.1, w: 0.45 },
        { type: 'ledge', at: 50, o: 0, w: 0.5, h: 0.25 * D, rise: 2.5 },
        { type: 'hole', at: 20, len: 1.8, h: 0.1, o: -2.5, w: 0.7 },
        { type: 'roller', at: 40, len: 2.5, h: 0.16, o: -2.5, w: 1.2 },
      ],
      rocks: [
        // Center: pares de rocas grandes con un hueco estrecho entre ellas
        ...[15, 28, 41, 54].flatMap((at, i) => {
          const gap = 0.46 / Math.sqrt(D);
          const r = 0.36 + 0.05 * (i % 2);
          return [
            { at, o: -(gap + r), r, h: 0.65 + 0.1 * D },
            { at: at + 0.4, o: gap + r, r, h: 0.6 + 0.12 * D },
          ];
        }),
        // Send: losas para pasar por encima (requieren pop si vas rápido)
        { at: 25, o: 2.4, r: 0.55, h: 0.3 * D },
        { at: 38, o: 2.6, r: 0.5, h: 0.32 * D },
        // Smooth: rocas grandes en el lado contrario de cada vaivén (la línea las rodea)
        ...[15.25, 22.75, 30.25, 37.75, 45.25, 52.75].map((at, i) => (
          { at, line: 'rg-smooth', avoid: true, r: 0.5 + 0.05 * (i % 2), h: 0.75 + 0.1 * (i % 3) }
        )),
      ],
      rockFields: [
        { from: 6, to: 60, line: 'rg-center', spread: 0.35, count: 9 * D, hMin: 0.06, hMax: 0.18 * D },
        { from: 6, to: 60, line: 'rg-smooth', spread: 0.5, count: 12, hMin: 0.04, hMax: 0.1 },
        { from: 6, to: 60, line: 'rg-send', spread: 0.45, count: 6 * D, hMin: 0.08, hMax: 0.2 * D },
        // bloques entre líneas
        { from: 6, to: 60, o0: -1.6, o1: -1.0, count: 7 * D, hMin: 0.45, hMax: 0.9 },
        { from: 6, to: 60, o0: 1.0, o1: 1.7, count: 7 * D, hMin: 0.45, hMax: 0.9 },
      ],
    },

    // -------------------------------------------------------------- 4 DROP SECTION
    {
      id: 'drop', name: 'Drop Section',
      path: [['S', 12], ['T', 18, 40], ['S', 26], ['T', -22, 40], ['S', 12]],
      width: 1.7, grade: 0.14, rough: 0.45, loose: 0.2, camber: 0, exposure: [1.3, 1.8], rockDensity: 1.0,
      lines: [
        { id: 'drop-a', name: 'Drop · Línea A (rodeo)', group: 'drop', from: 22, to: 58, blend: 7, offset: -2.6, hw: 0.6, rough: 0.5, loose: 0.35, replacesMain: true, wiggle: { amp: 0.4, period: 26 } },
        { id: 'drop-b', name: 'Drop · Línea B (drop)', group: 'drop', from: 22, to: 58, blend: 7, offset: 1.4, hw: 0.62, rough: 0.3, loose: 0.1, replacesMain: true },
      ],
      dividers: [{ group: 'drop', height: 0.7 }],
      features: [
        // repisa de roca natural: sube suave 12 m y cae de golpe (el drop)
        { type: 'ledge', at: 41, o: 1.4, w: 1.05, soft: 1.4, h: T.dropHeight, rise: 12, edge: 0.3, landing: 0.6 },
      ],
      rocks: [
        { at: 40.6, o: 0.05, r: 0.45, h: 1.0 }, { at: 39, o: -0.6, r: 0.5, h: 0.9 },
        { at: 43, o: -0.2, r: 0.45, h: 0.7 },
      ],
      rockFields: [
        { from: 22, to: 58, line: 'drop-a', spread: 0.5, count: 8, hMin: 0.05, hMax: 0.14 },
        { from: 26, to: 56, o0: -1.6, o1: -0.4, count: 6, hMin: 0.4, hMax: 0.85 },
      ],
    },

    // -------------------------------------------------------------- 5 FAST RIDGE
    {
      id: 'fastridge', name: 'Fast Ridge',
      path: [['S', 25], ['T', -18, 80], ['S', 30], ['T', 22, 75], ['S', 28], ['T', -12, 90]],
      width: 2.0, grade: 0.2, rough: 0.3, loose: 0.1, camber: 0.03, exposure: [2.2, 0.9], rockDensity: 0.8,
      features: [
        { type: 'roller', at: 30, len: 7, h: 0.3 },
        { type: 'roller', at: 44, len: 7, h: 0.3 },
        { type: 'roller', at: 110, len: 8, h: 0.35 },
        // peralte rápido de madera (curva a la derecha → sube el lado izquierdo)
        { type: 'berm', at: 77, len: 34, h: 0.85, dir: -1, wood: true },
        // kicker de madera en la recta
        { type: 'table', at: 58, h: 0.8 * (T.jumpHeight / 1.1), ramp: 3, top: 2.2, land: 4.5, w: 0.75, soft: 0.5, wood: true },
        // drop de roca con rampa de madera (se sube por las tablas y se cae de la roca)
        { type: 'ledge', at: 138, o: 0, w: 0.7, soft: 0.6, h: 0.95 * (T.dropHeight / 1.2), rise: 4.5, edge: 0.3, landing: 0.45, wood: true, rockBase: true },
      ],
      rocks: [
        { at: 70, o: -0.3, r: 0.3, h: 0.16 }, { at: 92, o: 0.4, r: 0.3, h: 0.15 }, { at: 128, o: 0, r: 0.32, h: 0.17 },
      ],
      rockFields: [{ from: 5, to: 150, o0: -1, o1: 1, count: 12, hMin: 0.04, hMax: 0.08 }],
    },

    // -------------------------------------------------------------- 6 PARALLEL LINES
    {
      id: 'parallel', name: 'Parallel Lines',
      path: [['S', 12], ['T', -10, 70], ['S', 40], ['T', 12, 70], ['S', 32]],
      width: 1.8, grade: 0.14, rough: 0.45, loose: 0.2, camber: 0, exposure: [1.2, 1.2], rockDensity: 1.2,
      lines: [
        { id: 'par-upper', name: 'Paralela · Superior', group: 'par', from: 10, to: 98, blend: 10, offset: 3.0, hw: 0.68, height: 0.9, rough: 0.2, loose: 0.1, replacesMain: true },
        { id: 'par-lower', name: 'Paralela · Inferior', group: 'par', from: 10, to: 98, blend: 10, offset: -3.0, hw: 0.6, height: -0.45, rough: 1.0, loose: 0.3, replacesMain: true },
      ],
      dividers: [{ group: 'par', height: 1.0 }],
      features: [
        // mini jump de la línea superior
        { type: 'table', at: 52, o: 3.0, w: 0.9, h: 0.75 * (T.jumpHeight / 1.1), ramp: 3, top: 3, land: 4 },
        // mini rock garden de la línea inferior
        { type: 'ledge', at: 44, o: -3.0, w: 0.7, h: 0.25 * D, rise: 3 },
        { type: 'hole', at: 50, len: 1.3, h: 0.12, o: -3.0, w: 0.6 },
        { type: 'ledge', at: 58, o: -3.0, w: 0.7, h: 0.3 * D, rise: 3 },
        { type: 'hole', at: 66, len: 1.2, h: 0.12, o: -2.9, w: 0.6 },
      ],
      rockFields: [
        { from: 38, to: 74, line: 'par-lower', spread: 0.45, count: 9 * D, hMin: 0.08, hMax: 0.22 * D },
        { from: 16, to: 92, o0: -1.2, o1: 1.2, count: 14, hMin: 0.45, hMax: 1.0 },
      ],
    },

    // -------------------------------------------------------------- 7 JUMP SECTION
    {
      id: 'jumps', name: 'Jump Section',
      path: [['S', 18], ['T', 10, 70], ['S', 45], ['T', -12, 70], ['S', 16]],
      width: 2.2, grade: 0.11, rough: 0.25, loose: 0.1, camber: 0, exposure: [1.3, 1.3], rockDensity: 0.7,
      features: [
        { type: 'roller', at: 8, len: 7, h: 0.45 },
        { type: 'roller', at: 18, len: 7, h: 0.45 },
        { type: 'table', at: 46, h: T.jumpHeight, ramp: 4, top: T.jumpLength, land: 6.5, w: 1.6 },
        // kicker de madera (tablas) con mesa corta
        { type: 'table', at: 80, h: 0.7 * (T.jumpHeight / 1.1), ramp: 2.8, top: 1.6, land: 4, w: 0.8, soft: 0.5, wood: true },
      ],
      rockFields: [{ from: 0, to: 100, o0: -1.1, o1: 1.1, count: 5, hMin: 0.04, hMax: 0.07 }],
    },

    // -------------------------------------------------------------- 8 FINAL CHUTE
    {
      id: 'chute', name: 'Final Chute',
      path: [['S', 14], ['T', -14, 50], ['S', 24], ['T', 60, 14], ['S', 12]],
      width: 1.3, grade: 0.26, rough: 0.65, loose: 0.8, camber: 0, ruts: true, exposure: [1.6, 1.4], rockDensity: 1.4,
      features: [
        { type: 'hole', at: 20, len: 1.5, h: 0.1, o: 0.2, w: 0.5 },
        { type: 'ledge', at: 33, o: 0, w: 0.8, h: 0.2, rise: 2.5 },
        // peralte final con muro de tablas (curva a la derecha)
        { type: 'berm', at: 46, len: 22, h: 1.1, dir: -1, wood: true },
      ],
      rockFields: [{ from: 4, to: 76, o0: -0.6, o1: 0.6, count: 10, hMin: 0.05, hMax: 0.12 }],
    },
  ];
}

// Zona de meta: terreno más plano y ancho, sin reescalado de pendiente.
export const MORRO_FINISH = {
  id: 'finish', name: 'Finish',
  width: 3.0, grade: 0.025, rough: 0.2, loose: 0.1, camber: 0, exposure: [1, 1], rockDensity: 0.4,
};
