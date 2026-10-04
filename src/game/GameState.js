/**
 * Estado de la partida (Milestone 2):
 *   intro → riding ⇄ crashed → countdown → riding … → finishing → complete
 */
export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'intro';
    this.phaseT = 0;
    this.time = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.crashes = 0;
    this.landings = { clean: 0, sketchy: 0 };
    this.bestAir = 0;
    this.lastCrash = null;
  }

  set(phase) {
    this.phase = phase;
    this.phaseT = 0;
  }

  get riding() {
    return this.phase === 'riding' || this.phase === 'finishing';
  }

  tick(dt, speed) {
    this.phaseT += dt;
    if (this.phase === 'intro' || this.phase === 'complete') return;
    if (this.phase !== 'finishing') this.time += dt; // el crono corre también durante crash/countdown
    if (this.phase === 'riding') {
      this.maxSpeed = Math.max(this.maxSpeed, speed);
      this.speedSum += speed * dt;
    }
  }

  get avgSpeed() {
    return this.time > 0 ? this.speedSum / this.time : 0;
  }
}
