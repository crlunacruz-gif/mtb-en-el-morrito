/**
 * PARQUE ECOLÓGICO LA MOLINA — cerros de granito con bloques redondeados,
 * bike park con construcciones: peraltes de madera, la caseta sobre el cerro de rocas
 * y el drop clásico (rampa de tablas que sube a una roca y cae), pircas de piedra.
 * (mismo formato que routes/morroSolar.js)
 */
export function buildMolinaSections(T) {
  const D = T.rockGardenDifficulty;
  const J = T.jumpHeight / 1.1;
  return [
    // -------------------------------------------------------------- 1 SALIDA
    {
      id: 'salida', name: 'Salida',
      path: [['S', 15], ['T', 25, 35], ['S', 15], ['T', -24, 40], ['S', 10]],
      width: 1.6, grade: 0.14, rough: 0.45, loose: 0.35, camber: 0, exposure: [1, 1], rockDensity: 1.0,
      features: [
        { type: 'roller', at: 8, len: 4, h: 0.2 },
        { type: 'berm', at: 44, len: 20, h: 0.7, dir: 1, wood: true },
      ],
      rockFields: [{ from: 4, to: 70, o0: -0.7, o1: 0.7, count: 8, hMin: 0.04, hMax: 0.1 }],
    },

    // -------------------------------------------------------------- 2 GRANITO (rock garden de bloques)
    {
      id: 'granito', name: 'Granito',
      path: [['S', 14], ['T', -10, 50], ['S', 30]],
      width: 1.5, grade: 0.13, rough: 0.95, loose: 0.2, camber: 0, exposure: [1, 1], rockDensity: 1.8,
      lines: [
        { id: 'gr-smooth', name: 'Granito · Smooth', group: 'gr', from: 4, to: 50, blend: 6, offset: -2.2, hw: 0.6, rough: 0.6, loose: 0.4, wiggle: { amp: 0.45, period: 14 } },
        { id: 'gr-send', name: 'Granito · Send', group: 'gr', from: 4, to: 50, blend: 6, offset: 1.6, hw: 0.55, rough: 0.7, loose: 0.1 },
      ],
      dividers: [{ group: 'gr', height: 0.4 }],
      features: [
        { type: 'ledge', at: 18, o: 1.6, w: 0.75, h: 0.4 * D, rise: 3.5 },
        { type: 'ledge', at: 34, o: 1.6, w: 0.75, h: 0.5 * D, rise: 4 },
      ],
      rocks: [
        ...[13.5, 20.5, 27.5, 34.5, 41.5].map((at, i) => ({ at, line: 'gr-smooth', avoid: true, r: 0.55, h: 0.8 + 0.1 * (i % 2) })),
        { at: 25, o: 1.5, r: 0.5, h: 0.3 * D },
      ],
      rockFields: [
        { from: 6, to: 48, line: 'gr-send', spread: 0.4, count: 6 * D, hMin: 0.08, hMax: 0.2 * D },
        { from: 6, to: 48, o0: -0.9, o1: 0.4, count: 8 * D, hMin: 0.5, hMax: 1.1 },
      ],
    },

    // -------------------------------------------------------------- 3 PERALTES DE MADERA (flow)
    {
      id: 'flow', name: 'Peraltes de Madera',
      path: [['S', 6], ['T', -75, 11], ['S', 6], ['T', 80, 11], ['S', 6], ['T', -70, 12], ['S', 8]],
      width: 1.6, grade: 0.13, rough: 0.3, loose: 0.3, camber: 0, exposure: [1, 1], rockDensity: 0.8,
      features: [
        { type: 'berm', at: 4, len: 18, h: 1.0, dir: 1, wood: true },
        { type: 'berm', at: 23, len: 19, h: 1.05, dir: -1, wood: true },
        { type: 'berm', at: 46, len: 18, h: 1.0, dir: 1, wood: true },
      ],
    },

    // -------------------------------------------------------------- 4 LA CASETA (drop clásico)
    {
      id: 'caseta', name: 'La Caseta',
      path: [['S', 30], ['T', 15, 50], ['S', 26]],
      width: 1.7, grade: 0.12, rough: 0.45, loose: 0.3, camber: 0, exposure: [1, 1.2], rockDensity: 1.2,
      landmark: { type: 'caseta', at: 26, o: 7.5 },
      lines: [
        { id: 'cas-a', name: 'Caseta · Rodeo', group: 'cas', from: 10, to: 52, blend: 7, offset: -2.4, hw: 0.6, rough: 0.5, loose: 0.4, replacesMain: true, wiggle: { amp: 0.3, period: 22 } },
        { id: 'cas-b', name: 'Caseta · Drop', group: 'cas', from: 10, to: 52, blend: 7, offset: 1.3, hw: 0.62, rough: 0.3, loose: 0.15, replacesMain: true },
      ],
      dividers: [{ group: 'cas', height: 0.8 }],
      features: [
        // rampa de tablas que sube sobre la roca y cae (como en la foto del parque)
        { type: 'ledge', at: 30, o: 1.3, w: 0.75, soft: 0.8, h: T.dropHeight * 1.1, rise: 4.5, edge: 0.3, landing: 0.6, wood: true, rockBase: true },
      ],
      rockFields: [{ from: 14, to: 48, o0: -1.4, o1: -0.3, count: 6, hMin: 0.5, hMax: 1.0 }],
    },

    // -------------------------------------------------------------- 5 PIRCAS (angosto entre muros)
    {
      id: 'pircas', name: 'Pircas',
      path: [['S', 18], ['T', -25, 30], ['S', 18], ['T', 22, 30], ['S', 10]],
      width: 1.25, grade: 0.16, rough: 0.6, loose: 0.4, camber: 0, ruts: true, exposure: [0.9, 0.9], rockDensity: 0.9,
      walls: { from: 4, to: 70 }, // pircas de piedra a ambos lados
      features: [{ type: 'ledge', at: 30, o: 0, w: 0.7, h: 0.22 * D, rise: 2.5 }],
      rockFields: [{ from: 4, to: 70, o0: -0.5, o1: 0.5, count: 6, hMin: 0.05, hMax: 0.12 }],
    },

    // -------------------------------------------------------------- 6 JUMP LINE
    {
      id: 'jumpline', name: 'Jump Line',
      path: [['S', 64], ['T', 12, 60], ['S', 14]],
      width: 2.1, grade: 0.12, rough: 0.25, loose: 0.2, camber: 0, exposure: [1.2, 1.2], rockDensity: 0.6,
      features: [
        { type: 'table', at: 12, h: 0.85 * J, ramp: 3.2, top: 2.2, land: 5, w: 0.8, soft: 0.5, wood: true },
        { type: 'table', at: 33, h: 1.1 * J, ramp: 4, top: T.jumpLength * 0.8, land: 6, w: 1.5 },
        { type: 'ledge', at: 56, o: 0, w: 0.9, soft: 0.6, h: 0.75, rise: 4, edge: 0.3, landing: 0.5, wood: true },
      ],
    },

    // -------------------------------------------------------------- 7 FINAL
    {
      id: 'final', name: 'Final',
      path: [['S', 14], ['T', -45, 20], ['S', 20]],
      width: 1.6, grade: 0.18, rough: 0.4, loose: 0.45, camber: 0, exposure: [1, 1], rockDensity: 0.9,
      features: [{ type: 'berm', at: 12, len: 20, h: 0.95, dir: 1, wood: true }],
    },
  ];
}
