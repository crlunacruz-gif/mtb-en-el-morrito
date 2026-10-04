import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post-proceso "de consola":
 *   baja  → render directo (sin post)
 *   alta  → MSAA ×4 · bloom suave · grading (contraste, calidez, viñeta, grano, aberración leve)
 *   ultra → + oclusión ambiental (GTAO) en el terreno, rocas y bici
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uContrast: { value: 1.06 },
    uSat: { value: 1.06 },
    uWarm: { value: 0.015 },
    uAberr: { value: 0.0012 },
    uSpeedBlur: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uContrast, uSat, uWarm, uAberr, uSpeedBlur;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // aberración cromática leve hacia los bordes
      vec2 off = c * uAberr * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // desenfoque radial de velocidad en los bordes
      if (uSpeedBlur > 0.001) {
        vec3 acc = col;
        for (int i = 1; i <= 5; i++) acc += texture2D(tDiffuse, vUv - c * float(i) * 0.006 * uSpeedBlur).rgb;
        col = mix(col, acc / 6.0, smoothstep(0.04, 0.22, r2));
      }
      // grading
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(uWarm, uWarm * 0.4, -uWarm);
      // viñeta
      col *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2 * 1.6);
      // grano de película
      col += (rand(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, camera, quality = 'alta') {
    this.renderer = renderer;
    this.quality = quality;
    this.enabled = quality !== 'baja';
    this.time = 0;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), camera);
    this.composer.addPass(this.renderPass);
    if (quality === 'ultra') {
      this.gtao = new GTAOPass(new THREE.Scene(), camera, size.x, size.y);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.6, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** speed01: 0..1 (activa un leve desenfoque radial a alta velocidad). */
  render(scene, camera, dt = 0, speed01 = 0) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.time += dt;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.gtao) { this.gtao.scene = scene; this.gtao.camera = camera; }
    const u = this.grade.uniforms;
    u.uTime.value = this.time % 100;
    u.uSpeedBlur.value = THREE.MathUtils.smoothstep(speed01, 0.55, 1.0);
    this.composer.render(dt);
  }

  dispose() {
    this.composer?.dispose();
  }
}
