# Ride the Line: Morro Solar — Milestone 2 · Full Trail System

Descenso POV de MTB en navegador (Vite + Three.js). Trail de 8 secciones (~700 m, 80–100 s) con líneas físicas, rock garden, drop, saltos, colisiones, crash con respawn y RUN COMPLETE.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173/mtb-en-el-morrito/
npm run build    # → dist/ (se publica en GitHub Pages con .github/workflows/deploy.yml)
```

## Controles

| Tecla | Acción |
|---|---|
| A / D (← / →) | dirección |
| S (↓) | freno · en el aire: nariz abajo |
| W (↑) | en el aire: nariz arriba |
| SPACE | pop / bunny hop (saltar rocas, drops y kickers) |
| R | reiniciar · M sonido · G ajustes + debug |

## URL de prueba

- `?s=250` arranca en ese metro del trail (ver inicios de sección en la consola)
- `?bot=0` / `?bot=1` / `?bot=2` piloto de pruebas que toma la línea 0, 1 o 2 de cada grupo (sólo desarrollo)
- `?q=low` sin sombras ni antialias · `?gui` abre el panel

## Parámetros

- `src/config.js` → `TUNING`: trailLength, elevationDrop, trailWidth, curveIntensity, steeringAssist, grip, looseGrip, brakingStrength, rockDensity, rockGardenDifficulty, dropHeight, jumpHeight, jumpLength, suspensionStrength, maxSpeed. Más abajo, física fina (`bike`), cámara y terreno.
- `src/game/trail/TrailSections.js` → diseño de cada sección: curvas, líneas, rocas, ledges, tables, rollers.

## Sistemas

TrailGenerator (+ trail/TrailSections) · Terrain · CollisionSystem · BikeController · SuspensionSystem · LineSystem · SkillContext · CameraRig · FXSystem · TrailProps · GameState · HUD
