// Bootstrap. Finds the canvas, builds the Game, starts the loop. Everything
// else lives behind game.ts.

import { Game } from './game';
import { startLoop } from './core/loop';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error('index.html must provide #game (canvas) and #ui (overlay root)');
}

const game = new Game(canvas, uiRoot);
const stop = startLoop((dt) => game.update(dt));

// Vite HMR: tear the old game down rather than stacking renderers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stop();
    game.dispose();
  });
}
