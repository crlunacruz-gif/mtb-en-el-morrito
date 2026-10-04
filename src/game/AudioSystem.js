/**
 * Audio procedural (Web Audio, sin archivos):
 *   wind      viento, crece con la velocidad²
 *   roll      rodado grave de la llanta sobre tierra
 *   hiss      fricción de la llanta con la tierra ("shhh"), más con tierra suelta
 *   grit      granos y piedritas: clics cortos aleatorios (densidad ∝ velocidad × suelta/rugosidad)
 *   rocks     golpes de piedra más graves en rock gardens
 *   wood      traqueteo hueco al pasar sobre tablas (frecuencia = velocidad / ancho de tabla)
 *   skid      derrape (ruido medio-agudo ∝ ángulo de derrape)
 *   yell()    grito del rider en los saltos ("¡Yiu!") con síntesis de formantes
 * Se inicia tras la primera interacción del usuario (política de autoplay).
 */
export class AudioSystem {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.layers = {};
    this.muted = false;
    this.gritAcc = 0;
    this.rockAcc = 0;
    this.lastYell = -10;
  }

  start() {
    if (!this.enabled || this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    this.noiseBuf = this.makeNoiseBuffer(3, true);
    this.whiteBuf = this.makeNoiseBuffer(1, false);
    const L = this.layers;
    L.wind = this.addLayer(this.noiseBuf, 'bandpass', 700, 0.6);
    L.roll = this.addLayer(this.noiseBuf, 'lowpass', 200, 0.9);
    L.hiss = this.addLayer(this.whiteBuf, 'bandpass', 2200, 0.6);
    L.skid = this.addLayer(this.whiteBuf, 'bandpass', 1100, 1.4);

    // madera: ruido hueco (resonancia ~230 Hz) modulado en amplitud por el paso de las tablas
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 230;
    body.Q.value = 2.2;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking';
    body2.frequency.value = 900;
    body2.gain.value = 6;
    const vca = ctx.createGain();
    vca.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 40;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(vca.gain);
    const level = ctx.createGain();
    level.gain.value = 0;
    src.connect(body).connect(body2).connect(vca).connect(level).connect(this.master);
    src.start();
    lfo.start();
    L.wood = { lfo, gain: level };

    // eco corto de exterior para el grito
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.1;
    const echoLP = ctx.createBiquadFilter();
    echoLP.type = 'lowpass';
    echoLP.frequency.value = 1800;
    this.echo.connect(echoLP).connect(fb).connect(this.echo);
    echoLP.connect(this.master);
  }

  makeNoiseBuffer(seconds, brown) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; } else d[i] = w * 0.6;
    }
    return buf;
  }

  addLayer(buffer, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { src, filter, gain };
  }

  /** Clic corto de ruido filtrado (granos, piedras, tablas). */
  click(t, freq, q, dur, amp) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.02);
  }

  /** Golpe seco (aterrizaje, roca, caída). strength 0–1+. */
  impact(strength = 0.5, wood = false) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = wood ? 'bandpass' : 'lowpass';
    f.frequency.value = wood ? 260 : 220 + 500 * Math.min(1, strength);
    f.Q.value = wood ? 3 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(1.4, 0.35 + strength) * (wood ? 1.6 : 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + 0.2 * strength);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.6);
    // tierra que salpica tras el golpe
    if (!wood) for (let i = 0; i < 6 * strength; i++) this.click(t + 0.02 + Math.random() * 0.15, 2500 + Math.random() * 3000, 1.2, 0.03, 0.12 * strength);
  }

  /**
   * Grito del rider al despegar: "¡Yiu!" — fuente glotal (diente de sierra + aire)
   * por un banco de formantes que pasa de /i/ (y) a /u/ (uuu), con vibrato y eco.
   */
  yell(intensity = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this.lastYell < 2.2) return;
    this.lastYell = t;
    const k = 0.92 + Math.random() * 0.2;            // tono de voz
    const dur = 0.3 + 0.1 * Math.min(1, intensity) + Math.random() * 0.06; // "¡Yiu!" corto
    const f0 = 290 * k;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.07);   // sube en la "Y"
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.15, t + dur);   // cae rápido en la "iu"
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibG = ctx.createGain();
    vibG.gain.value = f0 * 0.012;
    vib.connect(vibG).connect(osc.frequency);
    // aire / ronquera
    const air = ctx.createBufferSource();
    air.buffer = this.whiteBuf;
    const airG = ctx.createGain();
    airG.gain.value = 0.08;
    air.connect(airG);

    const src = ctx.createGain();
    osc.connect(src);
    airG.connect(src);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6 * Math.min(1.2, 0.7 + intensity * 0.4), t + 0.025);
    out.gain.setValueAtTime(0.6, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // formantes: [F, Q, ganancia] para /i/ → /u/
    const I = [[300, 8, 1.0], [2250, 12, 0.45], [3000, 14, 0.25]];
    const U = [[340, 7, 1.0], [870, 9, 0.5], [2400, 12, 0.12]];
    for (let n = 0; n < 3; n++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = I[n][1];
      bp.frequency.setValueAtTime(I[n][0], t);
      bp.frequency.setValueAtTime(I[n][0], t + 0.05);
      bp.frequency.exponentialRampToValueAtTime(U[n][0], t + dur * 0.75);
      const g = ctx.createGain();
      g.gain.setValueAtTime(I[n][2] * 3, t);
      g.gain.linearRampToValueAtTime(U[n][2] * 3, t + dur * 0.75);
      src.connect(bp).connect(g).connect(out);
    }
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.18; // apenas un rebote, sin cola fantasmal
    out.connect(send).connect(this.echo);
    osc.start(t); vib.start(t); air.start(t, Math.random() * 0.5);
    osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); air.stop(t + dur + 0.05);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
  }

  /** bike: BikeController. Mezcla capas según velocidad y superficie. */
  update(dt, bike, active = true) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const L = this.layers;
    const speed = active ? bike.v : 0;
    const v = Math.min(1.3, speed / 15);
    const grounded = !bike.airborne;
    const s = bike.surface || {};
    const wood = grounded && !!s.wood;
    const dirt = grounded && !wood ? 1 : 0;
    const loose = s.loose ?? 0.3;
    const rough = bike.roughness ?? 0.3;
    const sp = Math.min(1, speed / 7);

    L.wind.gain.gain.setTargetAtTime(0.05 + 0.5 * v * v, t, 0.1);
    L.wind.filter.frequency.setTargetAtTime(400 + 900 * v, t, 0.2);
    L.roll.gain.gain.setTargetAtTime(dirt * sp * (0.3 + rough * 0.45), t, 0.05);
    L.roll.filter.frequency.setTargetAtTime(120 + 220 * v, t, 0.1);
    L.hiss.gain.gain.setTargetAtTime(dirt * sp * (0.05 + 0.16 * loose) * (bike.onTrail ? 1 : 1.5), t, 0.05);
    L.hiss.filter.frequency.setTargetAtTime(1500 + 1500 * v, t, 0.1);
    const slip = Math.abs(bike.slip || 0);
    const skid = grounded && speed > 2.5 ? Math.min(1, Math.max(0, slip - 0.08) * 4) * (0.4 + 0.6 * (bike.brake || 0)) : 0;
    L.skid.gain.gain.setTargetAtTime(skid * (wood ? 0.15 : 0.32) * sp, t, 0.04);
    L.skid.filter.frequency.setTargetAtTime(wood ? 1900 : 900 + 600 * loose, t, 0.05);
    L.wood.gain.gain.setTargetAtTime(wood ? Math.min(1, speed / 5) * 0.75 : 0, t, 0.03);
    L.wood.lfo.frequency.setTargetAtTime(Math.max(5, speed / 0.12), t, 0.03);

    if (!dirt || this.muted) return;
    // granos de tierra / piedritas
    this.gritAcc += dt * speed * (3 + 22 * loose + 10 * rough) * (bike.onTrail ? 1 : 1.6);
    let n = 0;
    while (this.gritAcc > 1 && n < 8) {
      this.gritAcc -= 1; n++;
      this.click(t + Math.random() * dt, 2200 + Math.random() * 4500, 1.5, 0.012 + Math.random() * 0.02, (0.03 + Math.random() * 0.07) * (0.5 + sp));
    }
    // piedras en zonas rugosas (rock gardens)
    this.rockAcc += dt * speed * Math.max(0, rough - 0.45) * 5;
    while (this.rockAcc > 1) {
      this.rockAcc -= 1;
      this.click(t + Math.random() * dt, 600 + Math.random() * 900, 4, 0.05 + Math.random() * 0.05, 0.15 + Math.random() * 0.2);
    }
  }
}
