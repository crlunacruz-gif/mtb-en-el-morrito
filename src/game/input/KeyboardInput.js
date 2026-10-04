/**
 * Fuente de input por teclado.
 *
 * Todas las fuentes de input (teclado, giroscopio del celular, control remoto
 * vía WebSocket/WebRTC en el futuro) exponen la misma interfaz:
 *
 *   read() → { steer: -1..1, brake: 0..1, pop: bool, lean: -1..1, drift: bool, manual: bool }
 *
 * BikeController sólo conoce esa interfaz, así que para usar el celular como
 * manubrio basta con crear p.ej. DeviceOrientationInput con el mismo read().
 */
export class KeyboardInput {
  constructor(target = window) {
    this.keys = new Set();
    this.state = { steer: 0, brake: 0, drift: false, pop: false, lean: 0, manual: false };
    this._down = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    this._up = (e) => this.keys.delete(e.code);
    this._blur = () => this.keys.clear();
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
  }

  read() {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    this.state.steer = (right ? 1 : 0) - (left ? 1 : 0);
    this.state.brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    this.state.pop = k.has('Space');
    // en el aire: W = nariz arriba, S = nariz abajo
    this.state.lean = (this.state.brake ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    // reservados (contextos listos en SkillContext): SHIFT roost, W manual
    this.state.drift = k.has('ShiftLeft') || k.has('ShiftRight');
    this.state.manual = k.has('KeyW') || k.has('ArrowUp');
    return this.state;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}
