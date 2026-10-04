/**
 * PACHACAMAC — lomas de arena y gravilla volcánica frente al valle de Lurín.
 * Trail rápido y fluido, tierra muy suelta, peraltes de madera en serie,
 * dunas para saltar y un drop con rampa de tablas frente al Templo del Sol.
 * (mismo formato que routes/morroSolar.js)
 */
export function buildPachacamacSections(T) {
  const D = T.rockGardenDifficulty;
  const J = T.jumpHeight / 1.1;
  return [
    // -------------------------------------------------------------- 1 LOMAS
    {
      id: 'lomas', name: 'Lomas',
      path: [['S', 20], ['T', -15, 60], ['S', 20], ['T', 20, 50], ['S', 15]],
      width: 2.0, grade: 0.13, rough: 0.25, loose: 0.55, camber: 0, exposure: [1.2, 1.0], rockDensity: 0.35,
      features: [
        { type: 'roller', at: 12, len: 5, h: 0.22 },
        { type: 'roller', at: 22, len: 5, h: 0.22 },
        { type: 'berm', at: 53, len: 21, h: 0.7, dir: -1, wood: true },
      ],
      rockFields: [{ from: 5, to: 85, o0: -0.9, o1: 0.9, count: 6, hMin: 0.03, hMax: 0.06 }],
    },

    // -------------------------------------------------------------- 2 PERALTES DE ARENA (serie de 3)
    {
      id: 'peraltes', name: 'Peraltes de Arena',
      path: [['S', 8], ['T', 70, 12], ['S', 6], ['T', -80, 12], ['S', 6], ['T', 75, 12], ['S', 8]],
      width: 1.8, grade: 0.12, rough: 0.3, loose: 0.6, camber: 0, exposure: [1, 1], rockDensity: 0.3,
      features: [
        { type: 'berm', at: 6, len: 19, h: 0.95, dir: -1, wood: true },
        { type: 'berm', at: 26, len: 21, h: 1.0, dir: 1, wood: true },
        { type: 'berm', at: 49, len: 20, h: 0.95, dir: -1, wood: true },
      ],
    },

    // -------------------------------------------------------------- 3 ARENA SUELTA (whoops)
    {
      id: 'arena', name: 'Arena Suelta',
      path: [['S', 25], ['T', -12, 70], ['S', 25]],
      width: 1.6, grade: 0.17, rough: 0.35, loose: 0.85, camber: 0, exposure: [1.4, 1.1], rockDensity: 0.3,
      features: [6, 13, 20, 27, 34, 41].map((at) => ({ type: 'roller', at, len: 5, h: 0.24 })),
      rockFields: [{ from: 2, to: 60, o0: -0.7, o1: 0.7, count: 8, hMin: 0.03, hMax: 0.07 }],
    },

    // -------------------------------------------------------------- 4 DROP DEL TEMPLO
    {
      id: 'templo', name: 'Drop del Templo',
      path: [['S', 15], ['T', -20, 40], ['S', 32], ['T', 15, 50], ['S', 10]],
      width: 1.7, grade: 0.15, rough: 0.4, loose: 0.4, camber: 0, exposure: [1.2, 1.6], rockDensity: 0.7,
      lines: [
        { id: 'tem-a', name: 'Templo · Rodeo', group: 'tem', from: 16, to: 56, blend: 7, offset: -2.5, hw: 0.6, rough: 0.5, loose: 0.6, replacesMain: true, wiggle: { amp: 0.35, period: 24 } },
        { id: 'tem-b', name: 'Templo · Drop', group: 'tem', from: 16, to: 56, blend: 7, offset: 1.3, hw: 0.62, rough: 0.3, loose: 0.2, replacesMain: true },
      ],
      dividers: [{ group: 'tem', height: 0.6 }],
      features: [
        // rampa de tablas que sube a una roca y cae (drop)
        { type: 'ledge', at: 36, o: 1.3, w: 0.75, soft: 0.8, h: T.dropHeight * 1.05, rise: 5, edge: 0.3, landing: 0.6, wood: true, rockBase: true },
      ],
      rockFields: [{ from: 20, to: 52, o0: -1.5, o1: -0.4, count: 5, hMin: 0.4, hMax: 0.8 }],
    },

    // -------------------------------------------------------------- 5 DUNAS (línea de saltos)
    {
      id: 'dunas', name: 'Dunas',
      path: [['S', 72], ['T', 15, 60], ['S', 20]],
      width: 2.2, grade: 0.12, rough: 0.2, loose: 0.45, camber: 0, exposure: [1.3, 1.3], rockDensity: 0.2,
      features: [
        { type: 'table', at: 14, h: 0.9 * J, ramp: 3.5, top: 3, land: 5.5, w: 0.85, soft: 0.5, wood: true },
        { type: 'table', at: 36, h: 1.1 * J, ramp: 4, top: 4, land: 6, w: 1.5 },
        { type: 'table', at: 59, h: 0.8 * J, ramp: 3, top: 2, land: 5, w: 0.85, soft: 0.5, wood: true },
      ],
    },

    // -------------------------------------------------------------- 6 QUEBRADA (técnica)
    {
      id: 'quebrada', name: 'Quebrada',
      path: [['S', 10], ['T', -30, 25], ['S', 15], ['T', 35, 25], ['S', 10]],
      width: 1.4, grade: 0.18, rough: 0.9, loose: 0.35, camber: 0, ruts: true, exposure: [0.8, 0.8], rockDensity: 1.6,
      features: [
        { type: 'ledge', at: 14, o: 0, w: 0.8, h: 0.25 * D, rise: 2.5 },
        { type: 'ledge', at: 32, o: 0, w: 0.8, h: 0.3 * D, rise: 3 },
        { type: 'hole', at: 24, len: 1.4, h: 0.12, o: 0.1, w: 0.5 },
      ],
      rockFields: [
        { from: 4, to: 60, o0: -0.6, o1: 0.6, count: 10 * D, hMin: 0.06, hMax: 0.18 * D },
        { from: 4, to: 60, o0: -1.6, o1: -1.0, count: 6, hMin: 0.4, hMax: 0.8 },
        { from: 4, to: 60, o0: 1.0, o1: 1.6, count: 6, hMin: 0.4, hMax: 0.8 },
      ],
    },

    // -------------------------------------------------------------- 7 BAJADA AL VALLE
    {
      id: 'valle', name: 'Bajada al Valle',
      path: [['S', 18], ['T', -55, 18], ['S', 22]],
      width: 1.6, grade: 0.2, rough: 0.35, loose: 0.6, camber: 0, exposure: [1.2, 1.2], rockDensity: 0.5,
      features: [
        { type: 'berm', at: 15, len: 21, h: 1.0, dir: 1, wood: true },
        { type: 'roller', at: 42, len: 5, h: 0.25 },
      ],
    },
  ];
}
