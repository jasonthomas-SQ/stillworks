// Every tunable in the game. Nothing that a visual check might want moved lives
// anywhere else. Values sourced from the World Bible (grid, clock, palette) and
// the Character Bible (Shim's dimensions and speeds).

const solarNoonHour = (4.5 + 19.5) / 2;

export const CONFIG = {
  units: {
    cell: 10,
    gridCells: 12,
    /** Metres per heightfield sample. 120 x 120 quads over the island. */
    sampleSpacing: 1,
    /** Pool and sea surface. The gorge mouth is open, so they are one plane. */
    waterY: 0.9,
  },

  hero: {
    walkSpeed: 2.4,
    runSpeed: 4.8,
    accelDamp: 12,
    yawDamp: 14,
    /** Character Bible: the click-step slows about fifteen per cent in water. */
    waterSpeedFactor: 0.85,
    /** Rise over run. Strict: a step at exactly this value is rejected. */
    slopeLimit: 0.6,
    strideLength: 0.55,
    height: 0.9,
  },

  camera: {
    pitchDeg: 60,
    /** Parameterised from day one so a later 90-degree rotate is a config change. */
    yawDeg: 0,
    distance: 16,
    fovDeg: 38,
    posDamp: 6,
    lookAhead: 1.2,
    near: 0.5,
    far: 400,
  },

  clock: {
    /** World Bible 7: a full cycle is 12 real minutes. */
    dayLengthSec: 720,
    startHour: 8,
  },

  sun: {
    sunriseHour: 4.5,
    sunsetHour: 19.5,
    solarNoonHour,
    /** Tunable. Apex elevation at solar noon; never 90 or noon casts no shadow. */
    arcApexElevationDeg: 76,
    /** Tunable. Rotates the whole arc; negative rises NE and sets SW. */
    arcAzimuthOffsetDeg: -45,
  },

  render: {
    dprCap: 1.5,
    shadowMapSize: 2048,
    shadowBoxHalf: 45,
    /** Flat-shaded geometry acnes badly without this. */
    shadowNormalBias: 0.03,
  },

  terrain: {
    /** fBm detail on gentle ground, gradient-gated so ramps stay walkable. */
    detailAmplitude: 0.12,
    detailScale: 6,
    cliffAmplitude: 1.5,
    cliffScale: 9,
    /** Height returned south of the island: the sea floor drops away. */
    seaFloorY: -12,
    /** Height returned off the other three edges: solid rim. */
    outsideRimY: 36,
  },

  palette: {
    fernDeep: '#2E4A38',
    mossLight: '#7FA35C',
    brassWarm: '#C8973F',
    steamGrey: '#D7DCD6',
    rustBloom: '#A7563B',
    ruinBrass: '#8C7346',
  },

  sky: {
    dawn: '#E3C4AE',
    noon: '#BFD7D2',
    dusk: '#C98A6B',
    night: '#16222A',
  },

  budget: {
    drawCallsM1: 25,
    trianglesM1: 80_000,
    drawCallsM2: 60,
    trianglesM2: 300_000,
  },

  seed: 20260925,
} as const;

export type Config = typeof CONFIG;
