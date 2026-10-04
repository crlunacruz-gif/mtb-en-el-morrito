// ============================================================================
//  RIDE THE LINE: MORRO SOLAR — PARÁMETROS (Milestone 2 · Full Trail System)
// ----------------------------------------------------------------------------
//  TUNING reúne los parámetros principales. Lo demás está agrupado por sistema.
//  Unidades: metros, segundos, m/s, grados (salvo que se indique otra cosa).
//  Muchos valores se pueden tocar en vivo con el panel de ajustes (tecla G).
//  El diseño de cada sección (curvas, líneas, rocas, drops, saltos) está en
//  src/game/routes/*.js
// ============================================================================

export const TUNING = {
  trailLength: 0.9,          // multiplica el largo de todas las secciones (0.9 ≈ 700 m ≈ 80–90 s)
  elevationDrop: 150,        // metros que baja el trail de principio a fin
  trailWidth: 1.0,           // multiplica el ancho de todas las líneas
  curveIntensity: 1.0,       // multiplica el ángulo de todas las curvas
  steeringAssist: 0.15,      // 0–0.15: fracción de la curva que la bici sigue sola (NO es autopilot)
  grip: 1.0,                 // agarre en tierra compacta (en g)
  looseGrip: 0.62,           // agarre en tierra suelta (en g)
  brakingStrength: 6.5,      // desaceleración máxima con S (m/s²) en tierra compacta
  rockDensity: 1.0,          // multiplica las rocas (visuales y de colisión)
  rockGardenDifficulty: 1.0, // 0.5 fácil · 1 normal · 1.5 difícil (tamaño de rocas y escalones, ancho de huecos)
  dropHeight: 1.2,           // altura del drop directo (Línea B)
  jumpHeight: 1.1,           // altura del kicker/table principal
  jumpLength: 5.0,           // largo del table (plano superior) del salto principal
  suspensionStrength: 1.0,   // >1 más firme y absorbe más golpes · <1 más blanda
  maxSpeed: 17.0,            // m/s (≈ 61 km/h)
};

export const CONFIG = {
  seed: 29,
  tuning: TUNING,
  route: 'morro',             // morro · pachacamac · molina
  weather: 'nublado',        // nublado · sol · garua   (tecla C para cambiar)

  trail: {
    startElevation: 185,     // endElevation = startElevation − elevationDrop
    curvatureSmoothing: 6,   // metros de transición recta → curva
    finishRunout: 55,        // metros después de la meta para frenar
  },

  terrain: {
    innerCell: 1.15,         // resolución de la malla general (el sendero usa una cinta más fina)
    innerMargin: 60,
    outerExtent: 2600,
    ridgeFalloff: 0.16,
    ridgeFalloffQuad: 0.0045,
    bankWidth: 1.3,          // hombro entre el corredor del trail y la ladera
  },

  bike: {
    gravityScale: 1.0,
    dragCoef: 0.0105,        // resistencia del aire (define la velocidad tope en cada pendiente)
    rollResistance: 0.18,    // m/s²
    roughDrag: 1.6,          // m/s² extra en terreno rugoso (rock garden)
    offTrailDrag: 1.6,       // m/s² extra fuera de las líneas
    startSpeed: 3.0,
    minSpeed: 0.0,

    steerResponse: 5.0,      // progresividad del input
    maxYawRate: 2.3,         // rad/s de giro a baja velocidad
    yawSpeedRef: 5.0,        // maxYaw / (1 + v / yawSpeedRef) → más delicado a alta velocidad
    yawInertia: 6.0,
    travelFollow: 9.0,       // qué tan rápido la trayectoria sigue a la dirección si hay grip
    slipScrub: 3.5,          // frenado por derrape
    slipCrash: 0.85,         // rad de derrape que termina en caída
    cornerAssist: 0.0,       // 0–1 auto-frenado antes de curvas cerradas (apagado: frena tú)

    popStrength: 1.7,        // m/s verticales del bunny hop (SPACE) → ~15 cm en plano
    lipAbsorb: 0.8,          // fracción del impulso vertical del labio que se conserva (resto lo absorbe el cuerpo)
    airGravity: 1.12,        // gravedad en el aire (un poco más firme = saltos menos "flotantes")
    popCooldown: 0.45,
    airPitchControl: 1.6,    // rad/s de corrección en el aire (W nariz arriba, S nariz abajo)

    // Aterrizajes
    landCleanImpact: 4.5,    // m/s de impacto vertical para aterrizaje limpio
    landCrashImpact: 9.0,    // m/s → crash
    landCleanPitch: 0.38,    // rad de diferencia bici/suelo para aterrizaje limpio
    landCrashNose: 0.8,      // rad nariz abajo → crash (endo)
    landCrashTail: 1.0,      // rad nariz arriba → crash

    // Golpes y colisiones
    joltSmall: 1.6,          // cambio de velocidad vertical (m/s) de la rueda: menor = sólo vibración
    joltCrash: 6.0,          // mayor = crash
    solidCrashSpeed: 4.2,    // chocar una roca grande a más de esto = crash
    offTrailCrash: 4.0,      // metros fuera del borde del corredor = crash
    stabilityRecover: 0.45,  // recuperación de equilibrio por segundo
  },

  camera: {
    height: 1.62,
    forwardOffset: -0.02,
    tiltDeg: -13,
    fov: 70,
    fovHighSpeed: 78,
    fovSpeedRef: 15,
    leanFactor: 0.38,
    lookAhead: 7,
    lookAheadWeight: 0.45,
    airPitchWeight: 0.55,    // cuánto sigue la cámara el pitch de la bici en el aire
    shake: 1.0,
    headDamping: 9.0,
  },

  quality: 'alta',            // baja (sin post) · alta (bloom + grading + MSAA) · ultra (+ oclusión ambiental)

  // colores de la bici (se eligen en el menú): ver src/game/bike/BikeParts.js
  bikeColors: { frame: 'negro', accent: 'naranja', fork: 'negro', stanchions: 'dorado', tires: 'negro', rims: 'negro' },

  cockpit: {
    barWidth: 0.78,
    barForward: 0.56,
    barHeight: 1.08,
    showArms: true,
    riderKit: 'naranja',     // naranja · gris · negro
  },

  fx: {
    speedParticles: 260,
    dustParticles: 420,
    audio: true,
  },
};
