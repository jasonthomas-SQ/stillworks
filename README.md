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

## Status

Milestone 1 (foundation) complete: the Kettle heightfield, kinematic movement with one slope rule, Shim's procedural body, the fixed follow camera and the stats overlay. Milestone 2 (living world) is next.
