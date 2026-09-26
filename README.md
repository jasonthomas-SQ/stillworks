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

Move with WASD or the arrow keys. Hold Shift to run. Backtick (`` ` ``) toggles the stats overlay. `[` and `]` step the day clock back and forward an hour, `P` pauses it — these ship, because they are how the day-night check is run. Gamepad is wired (left stick, A/B/X/Y, Start) but has not been tested on hardware.

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
| `teleport(x, z)` | put the hero at a world position, snapped to the ground |
| `teleportCell(c, r)` | put the hero at the centre of a 1-based grid cell |
| `simulate(code, sec, dt?)` | simulate holding a `KeyboardEvent.code` for `sec` of game time; **synchronous**, returns hero state |
| `occlusion()` | is terrain between the camera and the hero right now? |
| `framing()` | what is in frame: Shim's size as a fraction of the viewport, ground extents, share of frame that is rock |
| `setHour(h)` | jump the day clock to an hour, 0-24; returns the hour set |
| `hour` | current hour, 0-24 |
| `setClockRunning(b)` | pause or resume the day clock |

`hero` is a live read-only snapshot. **To move the hero, use `teleport` — do not assign to `hero`.**

`simulate` injects straight into the input state rather than dispatching a `KeyboardEvent`, because synthetic events do not reach the listeners in every automation setup. It is **synchronous and drives the loop itself**: an earlier Promise-and-`setTimeout` version could not work in a hidden tab, where Chrome starves `requestAnimationFrame` and clamps timers to roughly once a minute, so awaiting it hung. `simulate` cannot hang and gives the same result whatever the tab is doing. It renders only the final frame, so a two-second walk costs about as much as two frames.

Useful one-liners:

```js
// Is the island where the hero is standing?
const b = __stillworks.islandBounds(), h = __stillworks.hero;
console.log(b.min, b.max, h.x, h.y, h.z);

// Is anything actually being drawn?
console.log(__stillworks.renderer.info.render);

// Where is the hero, in Kettle's own terms?
console.log(__stillworks.hero.x / 10, __stillworks.hero.z / 10);

// Walk north for two seconds and report where you ended up.
console.log(__stillworks.simulate('KeyW', 2));

// Is the composition right here?
console.log(__stillworks.framing());

// Walk the day. Dawn, noon, dusk, night.
for (const h of [6.3, 12, 18.5, 23]) { __stillworks.setHour(h); /* screenshot */ }
// -> { shimFraction: 0.037, groundWidthM: 45, groundDepthM: 35,
//      rockFraction: 0.04, highestRiseM: 7, skyVisible: false, ... }

// Stand at Bram's spot on the Warm Stones and check the camera has a clear view.
__stillworks.teleportCell(11, 7);
console.log(__stillworks.occlusion());

// Visit every zone and report any where the camera is blocked.
const spots = { A: [5, 12], B: [7, 7], C: [11, 7], D: [7, 3], E: [3, 6], F: [2, 2] };
for (const [zone, [c, r]] of Object.entries(spots)) {
  __stillworks.teleportCell(c, r);
  console.log(zone, __stillworks.occlusion());
}
```

Camera occlusion is also swept offline across all 74 walkable cells by
`src/core/camera/occlusion.test.ts`, so `occlusion()` is for spot-checking a
position by hand rather than the primary guard.

## Status

Milestone 1 (foundation) complete: the Kettle heightfield, kinematic movement with one slope rule, Shim's procedural body, the fixed follow camera and the stats overlay. Milestone 2 (living world) is next.
