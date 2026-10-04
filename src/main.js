import './styles.css';
import { Game } from './game/Game.js';
import { CONFIG } from './config.js';
import { loadSetup } from './ui/Menu.js';

loadSetup(CONFIG);

const game = new Game(document.getElementById('app'), document.getElementById('hud'), CONFIG);
// deja pintar el overlay de carga antes de generar el terreno (~1 s)
requestAnimationFrame(() => setTimeout(() => game.init(), 30));

// accesible desde la consola para experimentar: __game.cfg, __game.buildWorld()
window.__game = game;
