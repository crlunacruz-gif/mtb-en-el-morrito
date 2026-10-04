import { Menu } from './Menu.js';

/**
 * HUD minimalista. Durante el gameplay sólo SPEED (FLOW/CONTROL/SEND llegan con el scoring).
 * Mensajes centrales sólo para CRASH / cuenta regresiva, un texto discreto de aterrizaje,
 * overlays de inicio y RUN COMPLETE, y panel de debug (tecla G).
 */
export class HUD {
  constructor(root, cfg, hooks = {}) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-speed"><span class="hud-speed-val">0</span><span class="hud-speed-unit">km/h</span></div>
      <div class="hud-progress"><div class="hud-progress-bar"></div></div>
      <div class="hud-section"></div>
      <div class="hud-center" hidden></div>
      <div class="hud-toast"></div>
      <div class="overlay overlay-intro"></div>
      <div class="overlay overlay-finish" hidden>
        <div class="overlay-inner">
          <div class="kicker finish-kicker">Ride the Line</div>
          <h2>RUN COMPLETE</h2>
          <p class="finish-time"></p>
          <p class="finish-stats"></p>
          <p class="finish-lines"></p>
          <div class="finish-btns"><button class="btn-again">RIDE AGAIN</button><button class="btn-menu ghost">MENÚ</button></div>
        </div>
      </div>
      <div class="debug" hidden></div>
    `;
    this.speedEl = root.querySelector('.hud-speed-val');
    this.progressEl = root.querySelector('.hud-progress-bar');
    this.sectionEl = root.querySelector('.hud-section');
    this.centerEl = root.querySelector('.hud-center');
    this.toastEl = root.querySelector('.hud-toast');
    this.intro = root.querySelector('.overlay-intro');
    this.finish = root.querySelector('.overlay-finish');
    this.menu = new Menu(this.intro, cfg, hooks);
    this.startBtn = this.menu.startBtn;
    this.menuBtn = root.querySelector('.btn-menu');
    this.againBtn = root.querySelector('.btn-again');

    this.debugEl = root.querySelector('.debug');
    this.weatherBtns = this.menu.weatherBtns;
    this.lastSection = -1;
  }

  setWeather(id) {
    for (const b of this.weatherBtns) b.classList.toggle('on', b.dataset.w === id);
  }

  setReady() {
    this.menu.setReady();
  }

  setLoading(text) {
    this.menu.setLoading(text);
  }

  showIntro(v) {
    this.intro.hidden = !v;
    this.menu.setVisible(v);
    document.body.classList.toggle('in-menu', v);
  }

  center(text, kind = '') {
    if (!text) { this.centerEl.hidden = true; return; }
    this.centerEl.hidden = false;
    this.centerEl.className = `hud-center ${kind}`;
    if (this.centerEl.textContent !== text) this.centerEl.textContent = text;
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  showFinish(state, lines, routeName = '') {
    this.finish.hidden = false;
    this.finish.querySelector('.finish-kicker').textContent = `Ride the Line · ${routeName}`;
    const t = state.time;
    const mm = Math.floor(t / 60), ss = (t % 60).toFixed(1).padStart(4, '0');
    this.finish.querySelector('.finish-time').innerHTML = `<b>${mm}:${ss}</b>`;
    this.finish.querySelector('.finish-stats').innerHTML =
      `Vel. máx <b>${(state.maxSpeed * 3.6).toFixed(0)} km/h</b> · Crashes <b>${state.crashes}</b> · ` +
      `Landings <b>${state.landings.clean}</b> limpios / <b>${state.landings.sketchy}</b> sketchy`;
    this.finish.querySelector('.finish-lines').innerHTML = lines.length
      ? `Líneas: ${lines.map((l) => `<span class="line-chip">${l.name.replace(/^.*· /, '')}</span>`).join(' ')}`
      : '';
    this.againBtn.focus();
  }

  hideFinish() { this.finish.hidden = true; }

  update(dt, bike, trail) {
    this.speedEl.textContent = Math.round(bike.speedKmh);
    this.progressEl.style.transform = `scaleX(${Math.min(1, bike.s / trail.finishS)})`;
    if (bike.running && bike.section !== this.lastSection) {
      this.lastSection = bike.section;
      this.sectionEl.textContent = trail.sections[bike.section].name.toUpperCase();
      this.sectionEl.classList.remove('show');
      void this.sectionEl.offsetWidth;
      this.sectionEl.classList.add('show');
    }
  }

  toggleDebug() { this.debugEl.hidden = !this.debugEl.hidden; return !this.debugEl.hidden; }

  updateDebug(lines) {
    if (this.debugEl.hidden) return;
    this.debugEl.textContent = lines.join('\n');
  }
}
