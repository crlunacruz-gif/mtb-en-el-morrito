# Ride the Line: Morro Solar — Prompt maestro para Claude

Quiero construir una experiencia web interactiva llamada **Ride the Line: Morro Solar**, inspirada en downhill / MTB en el Morro Solar, Lima, Perú.

La experiencia debe sentirse como un descenso real en primera persona, no como una pista arcade genérica.

## Objetivo general

Crear un **vertical slice jugable de 45–60 segundos** en POV, donde el jugador baja por un trail estrecho y técnico inspirado en Morro Solar.

El jugador debe sentir:

- pendiente real
- velocidad creciente
- terreno árido
- piedra suelta
- curvas cerradas
- exposición al borde
- vibración de la bicicleta
- decisiones de línea
- derrape / roost
- un salto o drop
- posibilidad de caída
- recuperación rápida

La experiencia debe correr directamente en navegador.

## Stack

Usar:

- Vite
- Three.js
- JavaScript o TypeScript
- HTML/CSS para HUD
- sin backend
- sin frameworks pesados adicionales salvo que sean necesarios

Organizar el código modularmente.

Idealmente:

```text
src/
  main.js
  game/
    Game.js
    BikeController.js
    TrailGenerator.js
    CameraRig.js
    CollisionSystem.js
    FXSystem.js
    GameState.js
  ui/
    HUD.js
  styles.css
```

## Referencia visual

Voy a adjuntar una imagen POV real de MTB en Morro Solar.

Usarla como referencia de:

- encuadre
- altura de cámara
- ancho de sendero
- terreno rocoso
- sensación de exposición
- curvas del trail
- presencia del manubrio
- descenso visible hacia adelante

**No copiar literalmente la imagen.**

La experiencia debe estar inspirada en ese tipo de trail.

## Dirección visual

Quiero una estética:

- realista estilizada
- low-poly / semi-realista
- limpia
- cinematográfica
- no cartoon
- no hiperrealista AAA

Paleta:

- beige
- arena
- marrón
- terracota
- roca gris
- océano azul-gris
- cielo costero de Lima

El escenario debe sentirse inequívocamente costero y árido.

Al fondo puede verse:

- océano Pacífico
- ciudad de Lima estilizada
- cerros
- alguna silueta o hito inspirado en Morro Solar

Sin necesidad de reconstrucción geográfica exacta.

## Cámara POV

La cámara debe estar montada como una GoPro de rider.

Debe verse:

- manubrio
- manos / guantes simplificados
- parte de la horquilla o rueda delantera
- trail adelante

La cámara debe reaccionar al terreno:

### En terreno suave
movimiento leve.

### Sobre piedras
micro-vibraciones.

### Curvas
inclinación ligera.

### Saltos
subida y caída de cámara.

### Aterrizaje
compresión y rebote.

Evitar cámara excesivamente temblorosa.

Debe sentirse inmersiva pero jugable.

## Trail

El trail debe construirse mediante una spline o secuencia de segmentos 3D.

Debe tener descenso real en el eje vertical.

No quiero que el jugador se mueva sobre una pista plana con fondo animado.

La bicicleta debe ir perdiendo elevación progresivamente.

Ejemplo:

```text
Start elevation: 100
End elevation: 35
```

La pendiente debe variar durante el trail.

## Trail design

### Sección 1 — Drop In
5–8 segundos

Sendero medio angosto.

Pendiente moderada.

Sirve para que el jugador entienda steering.

### Sección 2 — Zetas
10–12 segundos

Curvas cerradas.

Trail más angosto.

Roca lateral.

Aquí debe aparecer por primera vez el **roost**.

### Sección 3 — Technical Line
8–10 segundos.

Una sección corta donde aparecen dos posibles micro-líneas.

NO deben convertirse en dos caminos largos.

Las líneas se separan unos metros y vuelven a juntarse.

Ejemplo:

**Left line**
- más limpia
- curva un poco más larga
- menos riesgo
- mayor Control

**Right line**
- más directa
- piedra / pequeño drop
- más rápida
- mayor Send

Las dos vuelven al mismo trail después de unos segundos.

### Sección 4 — Fast Section
8–10 segundos.

Pendiente más fuerte.

Mayor velocidad.

Algunas piedras.

Sensación de bajar hacia el mar.

### Sección 5 — Jump / Drop
Últimos segundos.

Pequeño salto o drop.

El jugador debe hacer un input para levantar la bicicleta.

Luego aterrizaje.

Fin de bajada.

## Steering

Controles desktop iniciales:

```text
A / ← = izquierda
D / → = derecha
S = freno
SHIFT = derrape / roost
SPACE = bunny hop / pop
```

La bicicleta debe tener:

- inercia
- steering progresivo
- no girar instantáneamente
- mayor dificultad de giro a alta velocidad

## Velocidad

La velocidad depende de:

- pendiente
- freno
- terreno
- errores
- aterrizajes

La gravedad debe acelerar ligeramente la bicicleta en zonas más empinadas.

El jugador no necesita pedalear.

## Mecánica principal: ROOST

Esta mecánica es fundamental.

Cuando el jugador:

- entra a una curva
- tiene suficiente velocidad
- está girando
- presiona SHIFT

la rueda trasera derrapa y lanza polvo/tierra.

Visualmente:

- nube corta de polvo
- partículas
- pequeñas piedras
- skid mark temporal
- leve giro de la bicicleta
- cámara responde ligeramente

Debe durar aproximadamente:

```text
0.4–0.8 segundos
```

No debe parecer humo.

Debe sentirse como tierra seca.

### Roost exitoso

Si el timing es bueno:

```text
+ Flow
+ Send
+ Style
```

Mostrar discretamente:

**ROOST!**

### Roost demasiado agresivo

Si velocidad + giro + derrape exceden un límite:

- pérdida de control
- bicicleta cruza demasiado
- posible caída

## Física del Roost

Crear una variable conceptual:

```text
roostQuality
```

Calculada con algo parecido a:

```text
speed
× steeringIntensity
× curveAngle
× timing
```

Ejemplo:

```text
0–0.4 = weak
0.4–0.85 = clean
0.85–1.0 = perfect
>1.0 = unstable
```

No hace falta simulación física profesional.

Debe sentirse divertido y predecible.

## Obstáculos

Añadir pequeñas piedras y terreno irregular.

No quiero obstáculos arcade flotantes.

Deben parecer parte natural del trail.

Si el jugador pega una piedra:

- manubrio vibra
- cambia ligeramente trayectoria
- pierde Flow
- pequeña pérdida de velocidad

Si el impacto es fuerte:

- crash

## Jump / Drop

Antes del salto:

la geometría debe permitir anticiparlo visualmente.

No colocar un texto gigante diciendo “JUMP”.

El terreno debe comunicarlo.

El jugador pulsa:

```text
SPACE
```

en el momento correcto.

### Buen timing

- bici despega estable
- cámara sube
- aterrizaje suave
- polvo al aterrizar

### Mal timing

- nariz baja
- aterrizaje fuerte
- pérdida de control
- posible crash

## Crash system

La caída debe existir, pero no ser frustrante.

Triggers:

- salirse mucho del trail
- exceso de velocidad en curva
- roost demasiado agresivo
- choque fuerte
- aterrizaje muy malo

Animación:

- cámara gira
- polvo
- bicicleta/manubrio desaparece parcialmente
- 1–1.5 segundos

Mostrar:

**CRASH**

Después:

```text
3
2
1
DROP BACK IN
```

Reposicionar unos metros adelante.

No reiniciar toda la partida.

## HUD

Muy minimalista.

Mostrar:

```text
SPEED
FLOW
CONTROL
SEND
```

Nada más durante gameplay.

Evitar que el HUD quite inmersión.

## Métricas

### Control
Sube cuando:
- sigue buena línea
- gira suave
- aterriza correctamente

Baja cuando:
- sale de trail
- golpea piedras
- derrapa excesivamente

### Flow
Sube cuando:
- mantiene velocidad
- enlaza curvas
- buen roost
- buen landing

### Send
Sube cuando:
- toma líneas agresivas
- hace roost fuerte
- toma drops
- salta

## Resultado final

Al terminar mostrar:

```text
YOUR MORRO RIDE

CONTROL 82
FLOW 91
SEND 94
```

Y un perfil.

Ejemplos:

### LINE MASTER
Control alto.

### FLOW RIDER
Flow alto.

### WILD RIDER
Send alto pero Control menor.

### MORRO BANDIT
Send alto + Control alto.

### PACIFIC RIDER
Flow alto y conducción limpia.

Mostrar también:

```text
Roosts
Crashes
Best Roost
Best Jump
```

Botón:

**RIDE AGAIN**

## Efectos

Implementar:

### Dust particles
Para:
- curvas
- roost
- aterrizajes

### Camera shake
Muy sutil.

### Speed feeling
Usar:
- FOV dinámico leve
- partículas laterales
- velocidad visual del terreno

Ejemplo:

```text
FOV normal: 70
High speed: 78
```

No exagerar.

## Audio

Dejar preparado el sistema aunque inicialmente se utilicen placeholders.

Capas futuras:

- viento
- rueda sobre tierra
- piedras
- suspensión
- skid
- landing

## Mobile

No implementar todavía el giroscopio como requisito principal.

Pero diseñar la arquitectura de `BikeController` para poder reemplazar posteriormente:

```text
keyboard steering
```

por:

```text
device orientation
```

sin reescribir el juego.

## Future architecture

En una siguiente versión:

### Pantalla principal
Laptop / TV.

### Controller
Teléfono.

El teléfono enviará:

```text
tilt
rotation
acceleration
```

a la pantalla mediante WebSockets/WebRTC.

No implementar aún.

Solo evitar decisiones de arquitectura que lo hagan imposible.

## Performance

Objetivo:

```text
60 FPS desktop
```

Usar:

- geometría simple
- instancing para rocas
- partículas limitadas
- luces simples
- shadow maps moderados

No cargar modelos enormes.

## Prioridad absoluta

No intentar construir un juego completo.

Primero crear un **vertical slice excelente**.

Orden recomendado:

1. trail descendente
2. POV bike camera
3. steering
4. velocidad y gravedad
5. piedras / terrain
6. roost
7. jump
8. crash
9. scoring
10. polish

## Criterio de éxito

Al jugar los primeros 10 segundos debe sentirse:

> “Estoy bajando un trail de MTB.”

Al hacer una curva con roost:

> “Quiero volver a hacer eso.”

Al terminar:

> “Quiero intentar otra bajada.”

# Primera tarea

Empieza creando únicamente:

### Milestone 1
- proyecto Vite + Three.js
- escena
- terreno árido
- un trail 3D descendente con curvas
- cámara POV moviéndose automáticamente por la spline
- manubrio básico visible
- steering con A/D
- océano en el fondo

No implementes todavía scoring, roost, crashes ni salto.

Primero quiero revisar visualmente y jugar el **feeling del descenso**.

Al terminar Milestone 1, detente y muéstrame qué archivos fueron creados y qué parámetros puedo modificar para:

- ancho del trail
- pendiente
- velocidad
- intensidad de curvas
- altura de cámara
- FOV
- longitud del recorrido
