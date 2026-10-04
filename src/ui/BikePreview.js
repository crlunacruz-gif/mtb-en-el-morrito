import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bikeGeometry, makeBikeMaterials, resolveColors, buildCockpit, buildFrontEnd, buildFrame } from '../game/bike/BikeParts.js';

/**
 * Showroom 3D de la bici para el garage del menú: estudio con luz suave, piso con sombra,
 * la bici gira sola y se puede arrastrar para rotarla.
 */
export class BikePreview {
  constructor(canvas, config) {
    this.cfg = config;
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.camera.position.set(2.9, 1.1, -0.2);

    const key = new THREE.DirectionalLight('#fff4e6', 2.2);
    key.position.set(2.5, 4, 1.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
    key.shadow.camera.right = key.shadow.camera.top = 1.5;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc0ff', 1.2);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // sombra de contacto suave (además de la sombra direccional)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 128, 128);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.003;
    const disc = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.18, 96), new THREE.MeshBasicMaterial({ color: '#e9dcc6', transparent: true, opacity: 0.25 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.scene.add(disc);

    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.turn.add(this.contact);
    this.angle = 0.6;
    this.auto = true;
    this.running = false;
    this.rebuild();

    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, a: this.angle }; this.auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag) this.angle = drag.a + (e.clientX - drag.x) * 0.012; });
    const end = () => { drag = null; clearTimeout(this.autoT); this.autoT = setTimeout(() => (this.auto = true), 2500); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  rebuild() {
    if (this.bike) {
      this.turn.remove(this.bike);
      this.bike.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (this.mats) for (const k in this.mats) if (this.mats[k]?.isMaterial) this.mats[k].dispose();
    }
    const c = this.cfg;
    const G = bikeGeometry(c.cockpit, c.camera);
    const mats = makeBikeMaterials(resolveColors(c.bikeColors));
    this.mats = mats;
    const bike = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.copy(G.stemTop);
    buildCockpit(G, mats, pivot);
    const fw = buildFrontEnd(G, mats, pivot);
    this.front = fw.spin;
    pivot.quaternion.setFromAxisAngle(G.axis.clone().negate(), -0.18);
    bike.add(pivot);
    const frame = buildFrame(G, mats);
    this.rear = frame.userData.rearSpin;
    bike.add(frame);
    // centra la bici entre ejes
    const midZ = (G.frontAxle.z + G.rearAxle.z) / 2;
    bike.position.z = -midZ;
    bike.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { o.castShadow = true; } });
    this.turn.add(bike);
    this.bike = bike;
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio())) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // encuadre: la bici (~1.9 m) entra completa
    const dist = w / h < 1 ? 4.8 : 3.9;
    this.camera.position.set(Math.cos(0.15) * dist, 0.95, Math.sin(0.15) * dist);
    this.camera.lookAt(0, 0.52, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (this.auto) this.angle += dt * 0.35;
      this.turn.rotation.y = this.angle;
      if (this.front) this.front.rotation.x -= dt * 1.2;
      if (this.rear) this.rear.rotation.x -= dt * 1.2;
      this.resize();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Para tests sin rAF. */
  renderOnce() {
    this.turn.rotation.y = this.angle;
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }
}
