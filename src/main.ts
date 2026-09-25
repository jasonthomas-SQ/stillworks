// Bootstrap. Finds the canvas, builds the Game, starts the loop. Everything
// else lives behind game.ts.

import { Game, type StillworksDebug } from './game';
import { startLoop } from './core/loop';

declare global {
  interface Window {
    __stillworks?: StillworksDebug;
  }
}

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error('index.html must provide #game (canvas) and #ui (overlay root)');
}

// ?debug=1 forces the stats overlay on and keeps the loop running in a hidden
// tab, so an observer can inspect the build without fighting the page. See
// README, Debugging.
const debug = new URLSearchParams(window.location.search).get('debug') === '1';

const game = new Game(canvas, uiRoot, debug);
window.__stillworks = game.debugHandle();

const stop = startLoop((dt) => game.update(dt), { ignoreHidden: debug });

// Vite HMR: tear the old game down rather than stacking renderers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stop();
    game.dispose();
    delete window.__stillworks;
  });
}
