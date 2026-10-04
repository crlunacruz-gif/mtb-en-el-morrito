import { buildMorroSections } from './morroSolar.js';
import { buildPachacamacSections } from './pachacamac.js';
import { buildMolinaSections } from './laMolina.js';

/**
 * Rutas disponibles. Cada una define su trail (secciones) y su tema visual:
 *   palette    colores de tierra (sRGB 0–1): base, terra, rocky, rubble, tread, treadLoose
 *   rocks      paleta de rocas + estilo ('angular' piedra partida · 'granite' bloques redondeados)
 *   ocean      si hay mar (y a qué distancia empieza la costa)
 *   floor      altura mínima del terreno lejano (valles sin mar)
 *   scenery    qué construir de fondo: 'lima' | 'lurin' | 'molina'
 *   landmark   hito principal: 'cross' | 'pachacamac' | (la caseta va dentro del trail)
 */
export const ROUTES = {
  morro: {
    id: 'morro',
    name: 'Morro Solar',
    place: 'Chorrillos · Lima',
    blurb: 'Cresta expuesta sobre el Pacífico: zetas, rock garden, drop, peraltes de madera y el chute final.',
    difficulty: 3,
    startElevation: 185,
    elevationDrop: 150,
    buildSections: buildMorroSections,
    finish: { id: 'finish', name: 'Finish', width: 3.0, grade: 0.025, rough: 0.2, loose: 0.1, camber: 0, exposure: [1, 1], rockDensity: 0.4 },
    theme: {
      palette: {
        base: [0.76, 0.6, 0.46], terra: [0.74, 0.5, 0.36], rocky: [0.55, 0.46, 0.4], rubble: [0.58, 0.5, 0.44],
        tread: [0.84, 0.67, 0.52], treadLoose: [0.88, 0.72, 0.55],
      },
      rocks: {
        style: 'angular',
        colors: [[0.45, 0.43, 0.41], [0.52, 0.48, 0.44], [0.4, 0.38, 0.36], [0.56, 0.46, 0.38], [0.55, 0.42, 0.33], [0.6, 0.5, 0.41], [0.48, 0.4, 0.34], [0.36, 0.34, 0.32]],
        dust: '#c9a888',
      },
      ridge: { falloff: 0.16, quad: 0.0045 },
      ocean: true,
      floor: null,
      scenery: 'lima',
      landmark: 'cross',
      powerLines: true,
      defaultWeather: 'nublado',
    },
  },

  pachacamac: {
    id: 'pachacamac',
    name: 'Pachacámac',
    place: 'Lomas de Pachacamac · Lurín',
    blurb: 'Arena suelta y lomas rápidas frente al valle de Lurín: serie de peraltes, dunas para saltar y el drop del templo.',
    difficulty: 2,
    startElevation: 150,
    elevationDrop: 115,
    buildSections: buildPachacamacSections,
    lengthScale: 1.45,
    finish: { id: 'finish', name: 'Finish', width: 3.2, grade: 0.025, rough: 0.2, loose: 0.4, camber: 0, exposure: [1, 1], rockDensity: 0.2 },
    theme: {
      palette: {
        base: [0.84, 0.71, 0.56], terra: [0.8, 0.62, 0.47], rocky: [0.5, 0.45, 0.41], rubble: [0.72, 0.62, 0.52],
        tread: [0.88, 0.77, 0.63], treadLoose: [0.91, 0.81, 0.67],
      },
      rocks: {
        style: 'angular',
        colors: [[0.32, 0.3, 0.29], [0.38, 0.35, 0.33], [0.45, 0.41, 0.38], [0.28, 0.27, 0.27], [0.5, 0.44, 0.38]],
        dust: '#d8c3a5',
      },
      ridge: { falloff: 0.09, quad: 0.0016 },
      ocean: true,
      floor: null,
      scenery: 'lurin',
      farRocks: 0.3,
      landmark: 'pachacamac',
      powerLines: false,
      defaultWeather: 'sol',
    },
  },

  molina: {
    id: 'molina',
    name: 'Parque Ecológico',
    place: 'La Molina · Lima',
    blurb: 'Bike park entre cerros de granito: peraltes de madera, la caseta, el drop clásico sobre la roca y las pircas.',
    difficulty: 3,
    startElevation: 330,
    elevationDrop: 110,
    buildSections: buildMolinaSections,
    lengthScale: 1.55,
    finish: { id: 'finish', name: 'Finish', width: 3.0, grade: 0.025, rough: 0.2, loose: 0.2, camber: 0, exposure: [1, 1], rockDensity: 0.6 },
    theme: {
      palette: {
        base: [0.68, 0.59, 0.49], terra: [0.62, 0.51, 0.41], rocky: [0.6, 0.57, 0.53], rubble: [0.63, 0.57, 0.5],
        tread: [0.8, 0.69, 0.56], treadLoose: [0.83, 0.73, 0.6],
      },
      rocks: {
        style: 'granite',
        colors: [[0.62, 0.6, 0.57], [0.68, 0.65, 0.61], [0.56, 0.54, 0.52], [0.6, 0.55, 0.49], [0.7, 0.67, 0.62], [0.52, 0.49, 0.46]],
        dust: '#c7b49b',
      },
      ridge: { falloff: 0.12, quad: 0.003 },
      ocean: false,
      floor: 205,
      scenery: 'molina',
      farRocks: 1.3,
      landmark: null,
      powerLines: true,
      defaultWeather: 'sol',
    },
  },
};

export const ROUTE_ORDER = ['morro', 'pachacamac', 'molina'];
