import * as THREE from 'three';
import GUI from 'lil-gui';
import { TrailGenerator } from './TrailGenerator.js';
import { ROUTES } from './routes/index.js';
import { Terrain } from './Terrain.js';
import { CollisionSystem } from './CollisionSystem.js';
import { Environment } from './Environment.js';
import { buildTrailProps } from './TrailProps.js';
import { WeatherSystem, WEATHER } from './WeatherSystem.js';
import { BikeController } from './BikeController.js';
import { BikeModel } from './BikeModel.js';
import { CameraRig } from './CameraRig.js';
import { LineSystem } from './LineSystem.js';
import { SkillContext } from './SkillContext.js';
import { FXSystem } from './FXSystem.js';
import { AudioSystem } from './AudioSystem.js';
import { GameState } from './GameState.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { TestRider } from './dev/TestRider.js';
import { HUD } from '../ui/HUD.js';
import { PostFX } from './PostFX.js';

const IDLE_INPUT = { steer: 0, brake: 0, pop: false, lean: 0 };

export class Game {
  constructor(container, hudRoot, config) {
    this.cfg = config;
    this.container = container;
    this.params = new URLSearchParams(location.search);

    // calidad gráfica: baja · alta · ultra  (?q=low|baja, ?q=ultra, o desde el menú)
    const qp = this.params.get('q');
    if (qp) config.quality = qp === 'low' ? 'baja' : qp;
    this.lowQuality = config.quality === 'baja';
    const renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowQuality ? 1 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !this.lowQuality;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.03, 12000);
    this.post = new PostFX(renderer, this.camera, config.quality);
    this.post.setSize(window.innerWidth, window.innerHeight);
    this.hud = new HUD(hudRoot, config, {
      onRoute: () => this.changeRoute(),
      onBike: () => this.rebuildBike(),
      onQuality: (q) => this.setQuality(q),
    });
    this.state = new GameState();
    this.input = new KeyboardInput();
    this.audio = new AudioSystem(config.fx.audio);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.fps = 60;
    this.log = [];

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.hud.startBtn.addEventListener('click', () => this.startRide());
    this.hud.againBtn.addEventListener('click', () => this.restart());
    this.hud.menuBtn.addEventListener('click', () => this.toMenu());
    for (const b of this.hud.weatherBtns) b.addEventListener('click', () => this.setWeather(b.dataset.w));
    const ruta = this.params.get('ruta');
    if (ruta && ROUTES[ruta]) { config.route = ruta; config.weather = ROUTES[ruta].theme.defaultWeather; }
    const w = this.params.get('clima');
    if (w && w in WEATHER) config.weather = w;
  }

  setWeather(id, announce = false) {
    const w = this.weather.set(id);
    this.cfg.weather = this.weather.current;
    this.hud.setWeather(this.weather.current);
    if (announce) this.hud.toast(w.label.toUpperCase());
  }

  /** Construye (o reconstruye) el mundo a partir de la configuración. */
  buildWorld() {
    const t0 = performance.now();
    const cfg = this.cfg;
    const T = cfg.tuning;
    if (this.scene) this.disposeScene(this.scene);
    const scene = new THREE.Scene();
    this.scene = scene;

    this.route = ROUTES[cfg.route] || ROUTES.morro;
    T.elevationDrop = this.route.elevationDrop;
    this.trail = new TrailGenerator(cfg.trail, T, cfg.seed, this.route);
    this.collision = new CollisionSystem();
    this.terrain = new Terrain(this.trail, cfg.terrain, cfg.seed, T);
    this.terrain.build(scene, this.collision);
    this.env = new Environment(scene, this.renderer, this.terrain, this.trail, cfg.seed);
    buildTrailProps(scene, this.trail, this.terrain);
    this.weather = new WeatherSystem(scene, this.renderer, this.env, this.terrain, T);
    this.bike = new BikeController(this.trail, this.terrain, this.collision, cfg.bike, T);
    this.lines = new LineSystem(this.trail);
    this.skills = new SkillContext(this.trail, this.collision);
    this.model = new BikeModel(cfg);
    scene.add(this.model.group);
    this.rig = new CameraRig(this.camera, this.model, this.bike, this.trail, cfg);
    this.fx = new FXSystem(scene, cfg);
    scene.add(this.camera);
    this.setWeather(cfg.weather);
    if (this.params.has('bot')) this.bot = new TestRider(this.trail, this.collision, this.params.get('bot') || 0);

    this.rig.update(0);
    this.buildTime = performance.now() - t0;
    console.info(
      `[RideTheLine] mundo generado en ${this.buildTime.toFixed(0)} ms · trail ${this.trail.finishS.toFixed(0)} m · ` +
      `terreno ${this.terrain.gridInfo.vertices} vértices · rocas ${this.terrain.rockCounts.near + this.terrain.rockCounts.far} ` +
      `(${this.terrain.rockCounts.collision} con colisión)`,
    );
    console.table(this.trail.sectionStats.map((s) => ({
      sección: s.name, inicio_m: s.start.toFixed(0), largo_m: s.length.toFixed(0),
      pendiente: `${(s.grade * 100).toFixed(0)} %`, desnivel_m: s.dropM.toFixed(1),
    })));
  }

  disposeScene(scene) {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
      }
    });
    if (scene.environment) scene.environment.dispose();
  }

  init() {
    this.buildWorld();
    this.hud.setReady();
    this.hud.showIntro(true);
    if (this.params.has('gui')) this.toggleGui();
    if (this.params.has('s')) {
      // atajo de testeo: ?s=250 arranca en ese metro del trail
      const r = this.trail.safeRespawn(parseFloat(this.params.get('s')) - 6, 0);
      this.bike.reset(r.s, r.o);
      this.rig.reset();
    }
    if (this.params.has('autostart')) this.startRide();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Cambio de ruta desde el menú: regenera el mundo con un overlay de carga. */
  changeRoute() {
    this.loading = true;
    this.hud.setLoading(`Generando ${ROUTES[this.cfg.route].name}…`);
    clearTimeout(this.routeT);
    this.routeT = setTimeout(() => {
      this.buildWorld();
      this.state.reset();
      this.loading = false;
      this.hud.setReady();
    }, 60);
  }

  setQuality(q) {
    this.cfg.quality = q;
    this.post.dispose();
    this.post = new PostFX(this.renderer, this.camera, q);
    this.post.setSize(window.innerWidth, window.innerHeight);
    const shadows = q !== 'baja';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    }
  }

  toMenu() {
    this.bike.reset();
    this.rig.reset();
    this.lines.reset();
    this.state.reset();
    this.hud.hideFinish();
    this.hud.center(null);
    this.hud.lastSection = -1;
    this.hud.showIntro(true);
  }

  startRide() {
    if (this.state.phase !== 'intro' || this.loading) return;
    this.audio.start();
    this.hud.showIntro(false);
    this.hud.hideFinish();
    this.state.set('riding');
    this.bike.start();
  }

  restart() {
    this.bike.reset();
    this.rig.reset();
    this.lines.reset();
    this.state.reset();
    this.hud.hideFinish();
    this.hud.center(null);
    this.hud.lastSection = -1;
    this.state.set('intro');
    this.startRide();
  }

  onKey(e) {
    if (e.code === 'Enter' && this.state.phase === 'intro') this.startRide();
    if (e.code === 'KeyR' && this.state.phase !== 'intro') this.restart();
    if (e.code === 'Escape' && this.state.phase !== 'intro') this.toMenu();
    if (e.code === 'KeyM') this.audio.toggleMute();
    if (e.code === 'KeyG') this.toggleGui();
    if (e.code === 'KeyC') { this.weather.cycle(); this.setWeather(this.weather.current, true); }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------------------
  //  Loop
  // ---------------------------------------------------------------------------
  frame() {
    this.timer.update();
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    this.fps = this.fps * 0.95 + (1 / Math.max(rawDt, 1e-4)) * 0.05;
    const st = this.state;
    const bike = this.bike;
    const input = this.bot && st.riding ? this.bot.read(bike) : this.input.read();
    st.tick(dt, bike.v);

    switch (st.phase) {
      case 'riding':
      case 'finishing':
        bike.update(dt, input);
        this.lines.update(dt, bike.s, bike.surface.lineId);
        this.skills.update(bike);
        this.handleEvents();
        if (st.phase === 'finishing' && (bike.stopped || st.phaseT > 7)) {
          st.set('complete');
          this.hud.showFinish(st, this.lines.results, this.route.name);
        }
        break;
      case 'crashed':
        if (st.phaseT > 1.3) {
          const r = this.trail.safeRespawn(st.lastCrash.s, st.lastCrash.o);
          bike.reset(r.s, r.o);
          this.rig.reset();
          st.set('countdown');
        }
        break;
      case 'countdown': {
        bike.update(dt, IDLE_INPUT);
        const t = st.phaseT;
        if (t < 2.1) this.hud.center(String(3 - Math.floor(t / 0.7)), 'count');
        else if (t < 2.8) this.hud.center('DROP BACK IN', 'go');
        else { this.hud.center(null); bike.start(1.6); st.set('riding'); } // reaparece casi detenido
        break;
      }
      default:
        bike.update(dt, IDLE_INPUT);
    }

    this.rig.update(dt);
    this.fx.update(dt, this.camera, bike.v);
    this.env.update(dt, bike.pos);
    this.weather.update(dt, this.camera);
    this.audio.update(dt, bike, st.riding);
    // ¡Yiu! al despegar en un salto o drop de verdad
    if (st.riding && bike.airborne && bike.airTime > 0.3 && !this.yelled && bike.v > 5) {
      this.yelled = true;
      this.audio.yell(Math.min(1.2, bike.v / 12));
    }
    if (!bike.airborne) this.yelled = false;
    this.hud.update(dt, bike, this.trail);
    this.updateDebug();
    this.post.render(this.scene, this.camera, dt, st.riding ? bike.v / this.cfg.tuning.maxSpeed : 0);
  }

  handleEvents() {
    const st = this.state;
    const bike = this.bike;
    for (const e of bike.drainEvents()) {
      if (e.type === 'land') {
        const strength = Math.min(1.4, e.impact / 5 + e.airTime * 0.6);
        this.fx.burst(e.x, e.y, e.z, strength);
        this.audio.impact(strength * 0.8, !!bike.surface.wood);
        st.bestAir = Math.max(st.bestAir, e.airTime);
        if (e.quality === 'clean') { st.landings.clean++; if (e.airTime > 0.45) this.hud.toast('CLEAN'); }
        if (e.quality === 'sketchy') { st.landings.sketchy++; this.lines.hit(1); this.hud.toast('SKETCHY'); }
      } else if (e.type === 'jolt') {
        if (e.severity > 2) { this.lines.hit(0.5); this.audio.impact(Math.min(1, e.severity / 6)); }
        if (e.severity > 2.5) this.fx.burst(bike.fx, bike.gF, bike.fz, 0.3);
      } else if (e.type === 'crash') {
        st.crashes++;
        st.lastCrash = e;
        st.set('crashed');
        this.rig.startCrash();
        this.fx.burst(bike.pos.x, bike.gC, bike.pos.z, 1.3);
        this.audio.impact(1.2);
        this.lines.hit(3);
        this.hud.center('CRASH', 'crash');
        this.log.push(`crash: ${e.reason} @ ${e.s.toFixed(0)} m`);
      } else if (e.type === 'finish') {
        st.set('finishing');
      }
    }
    for (const e of this.lines.drainEvents()) {
      this.log.push(e.type === 'lineCompleted' ? `línea: ${e.name} (${(e.quality * 100).toFixed(0)}%)` : `entra: ${e.name}`);
    }
    if (this.log.length > 6) this.log.splice(0, this.log.length - 6);
  }

  updateDebug() {
    const b = this.bike;
    const smp = this.trail.sampleAt(b.s);
    this.hud.updateDebug([
      `FPS ${this.fps.toFixed(0)}   fase ${this.state.phase}`,
      `sección ${this.trail.sections[b.section].name}   t ${this.state.time.toFixed(1)} s`,
      `s ${b.s.toFixed(1)} / ${this.trail.finishS.toFixed(0)} m   elev ${b.pos.y.toFixed(1)} m   pend ${(smp.grade * 100).toFixed(0)} %`,
      `o ${b.o.toFixed(2)} m   línea ${b.surface.lineId || '—'}   fuera ${b.surface.dOut.toFixed(1)} m`,
      `clima ${WEATHER[this.weather.current].label}   ` +
      `grip ${b.surface.grip.toFixed(2)} g   suelta ${b.surface.loose.toFixed(2)}   rugosidad ${b.surface.rough.toFixed(2)}`,
      `derrape ${(b.slip * 57.3).toFixed(0)}°   equilibrio ${(b.stability * 100).toFixed(0)} %`,
      `${b.airborne ? `EN EL AIRE ${b.airTime.toFixed(2)} s  pitch ${(b.pitch * 57.3).toFixed(0)}°` : 'en el suelo'}   susp ${(b.suspension.comp * 100).toFixed(0)} cm`,
      `contextos: ${this.skills.list().join(', ') || '—'}`,
      `crashes ${this.state.crashes}   landings ${this.state.landings.clean}/${this.state.landings.sketchy}`,
      ...this.log,
    ]);
  }

  // ---------------------------------------------------------------------------
  //  Panel de ajustes (tecla G)
  // ---------------------------------------------------------------------------
  toggleGui() {
    const on = this.hud.toggleDebug();
    document.body.classList.toggle('debug-on', on);
    if (!this.gui) this.buildGui();
    this.gui.show(on);
  }

  buildGui() {
    const c = this.cfg;
    const T = c.tuning;
    const gui = new GUI({ title: 'Ride the Line · ajustes' });
    const fl = gui.addFolder('Conducción (en vivo)');
    fl.add(T, 'steeringAssist', 0, 0.15, 0.01).name('steeringAssist');
    fl.add(T, 'grip', 0.5, 1.4, 0.01).name('grip');
    fl.add(T, 'looseGrip', 0.3, 1.0, 0.01).name('looseGrip');
    fl.add(T, 'brakingStrength', 2, 10, 0.1).name('brakingStrength');
    fl.add(T, 'suspensionStrength', 0.5, 1.8, 0.05).name('suspensionStrength');
    fl.add(T, 'maxSpeed', 8, 25, 0.5).name('maxSpeed (m/s)');
    fl.add(c.bike, 'maxYawRate', 1, 4, 0.05).name('giro máx');
    fl.add(c.bike, 'popStrength', 1, 4, 0.1).name('fuerza pop');
    const fv = gui.addFolder('Clima y estilo');
    fv.add(c, 'weather', { Nublado: 'nublado', 'Sol y sombra': 'sol', 'Garúa': 'garua' }).name('clima').onChange((v) => this.setWeather(v));
    fv.add(c.bikeColors, 'frame', ['negro', 'blanco', 'rojo', 'azul', 'verde', 'gris', 'naranja', 'arena']).name('cuadro').onChange(() => this.rebuildBike());
    fv.add(c.cockpit, 'riderKit', ['naranja', 'gris', 'negro']).name('kit rider').onChange(() => this.rebuildBike());
    const fc = gui.addFolder('Cámara (en vivo)');
    fc.add(c.camera, 'height', 1.2, 2.0, 0.01).name('altura');
    fc.add(c.camera, 'fov', 50, 100, 1).name('FOV');
    fc.add(c.camera, 'fovHighSpeed', 50, 110, 1).name('FOV alta vel.');
    fc.add(c.camera, 'tiltDeg', -35, 5, 0.5).name('inclinación');
    fc.add(c.camera, 'shake', 0, 3, 0.05).name('vibración');
    const ft = gui.addFolder('Trail (requiere regenerar)');
    ft.add(T, 'trailLength', 0.5, 1.6, 0.05).name('trailLength');
    ft.add(T, 'elevationDrop', 60, 250, 1).name('elevationDrop (m)');
    ft.add(T, 'trailWidth', 0.6, 2, 0.05).name('trailWidth');
    ft.add(T, 'curveIntensity', 0, 1.5, 0.05).name('curveIntensity');
    ft.add(T, 'rockDensity', 0, 2, 0.05).name('rockDensity');
    ft.add(T, 'rockGardenDifficulty', 0.5, 1.6, 0.05).name('rockGardenDifficulty');
    ft.add(T, 'dropHeight', 0.4, 2.2, 0.05).name('dropHeight (m)');
    ft.add(T, 'jumpHeight', 0.4, 2, 0.05).name('jumpHeight (m)');
    ft.add(T, 'jumpLength', 1, 9, 0.25).name('jumpLength (m)');
    ft.add(c, 'seed', 1, 999, 1).name('semilla');
    ft.add({ regen: () => this.regenerate() }, 'regen').name('↻ Regenerar trail');
    gui.add({ copy: () => {
      const out = JSON.stringify({ tuning: T, bike: c.bike, camera: c.camera }, null, 2);
      navigator.clipboard?.writeText(out).catch(() => {});
      console.log(out);
    } }, 'copy').name('Copiar valores (consola)');
    this.gui = gui;
  }

  rebuildBike() {
    this.scene.remove(this.model.group);
    this.model = new BikeModel(this.cfg);
    this.scene.add(this.model.group);
    this.rig.model = this.model;
  }

  regenerate() {
    this.buildWorld();
    this.state.reset();
    this.hud.center(null);
    this.hud.hideFinish();
    this.hud.showIntro(true);
    this.hud.setReady();
  }
}
