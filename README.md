# Stillworks

A cosy low-poly 3D exploration game that runs in the browser. You steer Shim, a small brass service automaton, around Kettle, a green gorge where a clockwork age politely ended. No combat, no dying. Wander, meet the four people who live there, fill the journal.

Built with Three.js, TypeScript and Vite. Deployed to GitHub Pages.

## Run it

```
npm install
npm run dev
```

Other scripts: `npm test` (Vitest, pure logic only), `npm run typecheck`, `npm run build`, `npm run preview`.

## Design source of truth

The world, characters, dialogue, reference art and UI spec live in the studio vault, not in this repo. Every character and creature is built in code from simple shapes; there are no rigged model files.

## Controls

Move with WASD or the arrow keys. Hold Shift to run. Backtick (`` ` ``) toggles the stats overlay. Gamepad is wired (left stick, A/B/X/Y, Start) but has not been tested on hardware.

## Debugging

The engineer on this project cannot see the screen, so these two hooks are how an observer with a browser reports back. **They are permanent — do not remove them.**

### `?debug=1`

Append it to any URL, local or deployed:

```
https://jasonthomas-sq.github.io/stillworks/?debug=1
```

It forces the stats overlay on from the first frame (no key press needed) and keeps the render loop running while the tab is hidden, so automated and background-tab checks still draw.

### `window.__stillworks`

Available on every build, with or without `?debug=1`. Read-only inspection of the live scene from the console:

| member | what it gives you |
|---|---|
| `scene` | the `THREE.Scene`; `scene.getObjectByName('island')`, `'water-standin'`, `'shim'` |
| `camera` | the live `THREE.PerspectiveCamera` |
| `renderer` | the `WebGLRenderer`; `renderer.info.render.calls` and `.triangles` |
| `hero` | live hero state — `x`, `z`, `y`, `yaw`, `speed`, `inWater`, `distanceTravelled` |
| `input` | live merged input state, including `lastDevice` |
| `config` | every tunable |
| `islandBounds()` | the island's world-space `THREE.Box3` |
| `toggleStats()` | show or hide the overlay without a key press |

Useful one-liners:

```js
// Is the island where the hero is standing?
const b = __stillworks.islandBounds(), h = __stillworks.hero;
console.log(b.min, b.max, h.x, h.y, h.z);

// Is anything actually being drawn?
console.log(__stillworks.renderer.info.render);

// Where is the hero, in Kettle's own terms?
console.log(__stillworks.hero.x / 10, __stillworks.hero.z / 10);
```

## Status

Milestone 1 (foundation) complete: the Kettle heightfield, kinematic movement with one slope rule, Shim's procedural body, the fixed follow camera and the stats overlay. Milestone 2 (living world) is next.
