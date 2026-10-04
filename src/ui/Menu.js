import { ROUTES, ROUTE_ORDER } from '../game/routes/index.js';
import { FRAME_COLORS, ACCENT_COLORS, DEFAULT_BIKE_COLORS } from '../game/bike/BikeParts.js';
import { RIDER_KITS } from '../game/BikeModel.js';
import { BikePreview } from './BikePreview.js';

const KEY = 'rtl-setup-v2';

/** Carga la configuración guardada (ruta, colores, kit, clima). */
export function loadSetup(cfg) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return;
    if (s.route in ROUTES) cfg.route = s.route;
    if (s.bikeColors) cfg.bikeColors = { ...DEFAULT_BIKE_COLORS, ...s.bikeColors };
    if (s.kit in RIDER_KITS) cfg.cockpit.riderKit = s.kit;
    if (s.weather) cfg.weather = s.weather;
    if (['baja', 'alta', 'ultra'].includes(s.quality)) cfg.quality = s.quality;
  } catch { /* sin storage: valores por defecto */ }
}
function saveSetup(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ route: cfg.route, bikeColors: cfg.bikeColors, kit: cfg.cockpit.riderKit, weather: cfg.weather, quality: cfg.quality }));
  } catch { /* nada */ }
}

const OPTION_ROWS = [
  { key: 'frame', label: 'Cuadro', opts: FRAME_COLORS.map((c) => ({ id: c.id, label: c.label, hex: c.hex })) },
  { key: 'accent', label: 'Detalles', opts: ACCENT_COLORS.map((c) => ({ id: c.id, label: c.label, hex: c.hex })) },
  { key: 'fork', label: 'Horquilla', opts: [{ id: 'negro', label: 'Negra', hex: '#1e1f22' }, { id: 'blanco', label: 'Blanca', hex: '#e6e6e2' }] },
  { key: 'stanchions', label: 'Barras', opts: [{ id: 'dorado', label: 'Doradas', hex: '#c9a24a' }, { id: 'negro', label: 'Negras', hex: '#202124' }] },
  { key: 'tires', label: 'Llantas', opts: [{ id: 'negro', label: 'Negras', hex: '#26251f' }, { id: 'tan', label: 'Costado café', hex: '#9a7550' }] },
  { key: 'rims', label: 'Aros', opts: [{ id: 'negro', label: 'Negros', hex: '#18191b' }, { id: 'gris', label: 'Grises', hex: '#5b5e62' }] },
];

const ROUTE_TAGS = {
  morro: ['Vista al mar', 'Rock garden', 'Drop', '3 peraltes'],
  pachacamac: ['Arena suelta', '5 peraltes', 'Dunas', 'Drop del templo'],
  molina: ['Granito', 'La Caseta', 'Peraltes de madera', 'Pircas'],
};

/** Silueta de cerro (SVG) para la tarjeta de cada ruta. */
function ridgeSVG(id, pal) {
  let seed = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layer = (base, amp, col, op) => {
    let d = `M0 100 L0 ${base}`;
    let y = base;
    for (let x = 0; x <= 200; x += 8) {
      y = Math.max(15, Math.min(95, y + (rnd() - 0.55) * amp));
      d += ` L${x} ${y.toFixed(1)}`;
    }
    return `<path d="${d} L200 100 Z" fill="${col}" opacity="${op}"/>`;
  };
  const c = (a, k = 1) => `rgb(${a.map((v) => Math.round(Math.min(1, v * k) * 255)).join(',')})`;
  return `<svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
    ${layer(55, 14, c(pal.rocky, 0.9), 0.55)}${layer(68, 12, c(pal.terra, 0.85), 0.8)}${layer(82, 8, c(pal.base, 0.7), 1)}
  </svg>`;
}

export class Menu {
  /**
   * @param root   contenedor (overlay de intro)
   * @param cfg    CONFIG (se modifica en vivo)
   * @param hooks  { onRoute(id), onBike(), onKit(), onWeather(id) }
   */
  constructor(root, cfg, hooks) {
    this.root = root;
    this.cfg = cfg;
    this.hooks = hooks;
    this.tab = 'ruta';
    this.row = 0;

    root.innerHTML = `
      <div class="menu">
        <header class="menu-top">
          <div class="brand"><span class="brand-main">RIDE THE LINE</span><span class="brand-sub">MTB · PERÚ</span></div>
          <nav class="menu-tabs" role="tablist">
            <kbd>Q</kbd>
            <button type="button" role="tab" data-tab="ruta">Ruta</button>
            <button type="button" role="tab" data-tab="garage">Garage</button>
            <kbd>E</kbd>
          </nav>
          <div class="menu-status"><span class="dot"></span><span class="loading">Generando el cerro…</span></div>
        </header>

        <section class="tab tab-ruta">
          <div class="route-cards">
            ${ROUTE_ORDER.map((id, i) => {
              const r = ROUTES[id];
              return `<button type="button" class="route-card" data-route="${id}">
                <div class="rc-art">${ridgeSVG(id, r.theme.palette)}<span class="rc-num">0${i + 1}</span></div>
                <div class="rc-body">
                  <div class="rc-place">${r.place}</div>
                  <div class="rc-name">${r.name}</div>
                  <p class="rc-blurb">${r.blurb}</p>
                  <div class="rc-tags">${(ROUTE_TAGS[id] || []).map((t) => `<span>${t}</span>`).join('')}</div>
                  <div class="rc-stats">
                    <span>Desnivel <b>${r.elevationDrop} m</b></span>
                    <span class="rc-diff">Dificultad ${[1, 2, 3, 4].map((n) => `<i class="${n <= r.difficulty ? 'on' : ''}"></i>`).join('')}</span>
                  </div>
                </div>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section class="tab tab-garage" hidden>
          <div class="garage-stage">
            <canvas class="garage-canvas"></canvas>
            <div class="garage-hint">Arrastra para girar</div>
          </div>
          <div class="garage-panel">
            <div class="gp-title">Tu bici</div>
            ${OPTION_ROWS.map((row, i) => `
              <div class="gp-row" data-row="${i}">
                <div class="gp-label">${row.label}<span class="gp-value"></span></div>
                <div class="gp-swatches">
                  ${row.opts.map((o) => `<button type="button" class="sw" data-key="${row.key}" data-id="${o.id}" title="${o.label}" style="--c:${o.hex}"></button>`).join('')}
                </div>
              </div>`).join('')}
            <div class="gp-row" data-row="${OPTION_ROWS.length}">
              <div class="gp-label">Rider<span class="gp-value"></span></div>
              <div class="gp-swatches gp-kits">
                ${Object.entries(RIDER_KITS).map(([id, k]) => `<button type="button" class="kit" data-kit="${id}" style="--c:${k.sleeve};--g:${k.glove}"><i></i>${k.label}</button>`).join('')}
              </div>
            </div>
          </div>
        </section>

        <footer class="menu-bottom">
          <div class="weather-pick" role="group" aria-label="Clima">
            <span class="wp-label">Clima</span>
            <button type="button" data-w="nublado">Nublado</button>
            <button type="button" data-w="sol">Sol y sombra</button>
            <button type="button" data-w="garua">Garúa</button>
          </div>
          <div class="weather-pick quality-pick" role="group" aria-label="Gráficos">
            <span class="wp-label">Gráficos</span>
            <button type="button" data-q="baja">Baja</button>
            <button type="button" data-q="alta">Alta</button>
            <button type="button" data-q="ultra">Ultra</button>
          </div>
          <div class="controls">
            <span><b>A</b><b>D</b> dirección</span><span><b>S</b> freno</span><span><b>SPACE</b> pop</span>
            <span><b>W</b><b>S</b> aire</span><span><b>R</b> reiniciar</span>
          </div>
          <button type="button" class="btn-start" hidden>DROP IN <kbd>Enter</kbd></button>
        </footer>
      </div>`;

    const q = (s) => root.querySelector(s);
    this.startBtn = q('.btn-start');
    this.loadingEl = q('.loading');
    this.statusEl = q('.menu-status');
    this.weatherBtns = [...root.querySelectorAll('.weather-pick button[data-w]')];
    this.qualityBtns = [...root.querySelectorAll('.quality-pick button')];
    for (const b of this.qualityBtns) b.addEventListener('click', () => {
      this.cfg.quality = b.dataset.q;
      this.refresh();
      saveSetup(this.cfg);
      this.hooks.onQuality?.(b.dataset.q);
    });
    this.tabBtns = [...root.querySelectorAll('.menu-tabs button')];
    this.cards = [...root.querySelectorAll('.route-card')];
    this.rows = [...root.querySelectorAll('.gp-row')];

    for (const b of this.tabBtns) b.addEventListener('click', () => this.setTab(b.dataset.tab));
    for (const c of this.cards) c.addEventListener('click', () => this.pickRoute(c.dataset.route));
    root.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => this.pickColor(b.dataset.key, b.dataset.id)));
    root.querySelectorAll('.kit').forEach((b) => b.addEventListener('click', () => this.pickKit(b.dataset.kit)));
    for (const b of this.weatherBtns) b.addEventListener('click', () => { saveSetup(this.cfg); });
    this.rows.forEach((r, i) => r.addEventListener('pointerenter', () => this.setRow(i)));

    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler, true);
    this.setTab('ruta');
    this.refresh();
  }

  get visible() {
    return !this.root.hidden;
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of this.tabBtns) {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab);
    }
    this.root.querySelector('.tab-ruta').hidden = tab !== 'ruta';
    this.root.querySelector('.tab-garage').hidden = tab !== 'garage';
    if (tab === 'garage') {
      if (!this.preview) {
        try { this.preview = new BikePreview(this.root.querySelector('.garage-canvas'), this.cfg); } catch (e) { console.warn(e); }
      }
      this.preview?.start();
      this.setRow(this.row);
    } else {
      this.preview?.stop();
    }
  }

  setVisible(v) {
    if (!v) this.preview?.stop();
    else if (this.tab === 'garage') this.preview?.start();
  }

  setRow(i) {
    this.row = Math.max(0, Math.min(this.rows.length - 1, i));
    this.rows.forEach((r, k) => r.classList.toggle('focus', k === this.row));
  }

  pickRoute(id) {
    if (this.cfg.route === id) { this.refresh(); return; }
    this.cfg.route = id;
    this.cfg.weather = ROUTES[id].theme.defaultWeather || this.cfg.weather;
    this.refresh();
    saveSetup(this.cfg);
    this.hooks.onRoute?.(id);
  }

  pickColor(key, id) {
    this.cfg.bikeColors = { ...this.cfg.bikeColors, [key]: id };
    this.refresh();
    saveSetup(this.cfg);
    this.preview?.rebuild();
    this.hooks.onBike?.();
  }

  pickKit(id) {
    this.cfg.cockpit.riderKit = id;
    this.refresh();
    saveSetup(this.cfg);
    this.hooks.onBike?.();
  }

  refresh() {
    for (const c of this.cards) c.classList.toggle('on', c.dataset.route === this.cfg.route);
    for (const b of this.qualityBtns) b.classList.toggle('on', b.dataset.q === this.cfg.quality);
    const sel = { ...DEFAULT_BIKE_COLORS, ...this.cfg.bikeColors };
    OPTION_ROWS.forEach((row, i) => {
      const r = this.rows[i];
      r.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.id === sel[row.key]));
      r.querySelector('.gp-value').textContent = row.opts.find((o) => o.id === sel[row.key])?.label || '';
    });
    const kr = this.rows[OPTION_ROWS.length];
    kr.querySelectorAll('.kit').forEach((b) => b.classList.toggle('on', b.dataset.kit === this.cfg.cockpit.riderKit));
    kr.querySelector('.gp-value').textContent = '';
  }

  setLoading(text) {
    this.statusEl.classList.add('busy');
    this.loadingEl.textContent = text;
    this.startBtn.hidden = true;
  }

  setReady() {
    this.statusEl.classList.remove('busy');
    const r = ROUTES[this.cfg.route];
    this.loadingEl.textContent = `${r.name} · listo`;
    this.startBtn.hidden = false;
  }

  /** Navegación tipo consola: Q/E pestañas, flechas, Enter = DROP IN (lo maneja Game). */
  onKey(e) {
    if (!this.visible) return;
    const k = e.code;
    if (k === 'KeyQ' || k === 'KeyE' || (k === 'Tab' && !e.altKey)) {
      e.preventDefault();
      this.setTab(this.tab === 'ruta' ? 'garage' : 'ruta');
      return;
    }
    const dx = k === 'ArrowRight' || k === 'KeyD' ? 1 : k === 'ArrowLeft' || k === 'KeyA' ? -1 : 0;
    const dy = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0;
    if (this.tab === 'ruta' && dx) {
      e.preventDefault();
      const i = ROUTE_ORDER.indexOf(this.cfg.route);
      this.pickRoute(ROUTE_ORDER[(i + dx + ROUTE_ORDER.length) % ROUTE_ORDER.length]);
    } else if (this.tab === 'garage') {
      if (dy) { e.preventDefault(); this.setRow(this.row + dy); }
      if (dx) {
        e.preventDefault();
        if (this.row < OPTION_ROWS.length) {
          const row = OPTION_ROWS[this.row];
          const cur = (this.cfg.bikeColors || {})[row.key] ?? DEFAULT_BIKE_COLORS[row.key];
          const i = row.opts.findIndex((o) => o.id === cur);
          this.pickColor(row.key, row.opts[(i + dx + row.opts.length) % row.opts.length].id);
        } else {
          const ids = Object.keys(RIDER_KITS);
          const i = ids.indexOf(this.cfg.cockpit.riderKit);
          this.pickKit(ids[(i + dx + ids.length) % ids.length]);
        }
      }
    }
  }
}
