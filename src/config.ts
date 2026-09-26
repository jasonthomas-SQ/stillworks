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

  /**
   * Camera, chosen by measurement rather than by eye — see framing.ts.
   *
   * The first pass (60 deg / 16 m / 38 deg) put Shim at 8.2% of frame height
   * and, at the start cell, Fernwell and Spool Yard, rendered ZERO rock: the
   * frame was floor edge to edge, which is what the M1 check reported. These
   * numbers put Shim at 3.7% — inside the 3-5% target taken from the reference
   * art — and put rock in frame at every named spot except Fernwell, where the
   * terrain is 80 m of level ground and no camera can reach a wall (see the
   * geometry note in framing.test.ts).
   */
  camera: {
    pitchDeg: 47,
    /** Parameterised from day one so a later 90-degree rotate is a config change. */
    yawDeg: 0,
    distance: 32,
    fovDeg: 42,
    posDamp: 6,
    /** Scaled with distance: 1.2 m looked right at 16 m, so 2.4 m at 32 m. */
    lookAhead: 2.4,
    near: 0.5,
    far: 400,
    /** Metres the camera keeps above the ground under it. */
    groundClearance: 2,
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
    arcAzimuthOffsetDeg: -40,
    /**
     * Peak sun irradiance at solar noon.
     *
     * The architecture's post-cutover convention of ~3 is a PBR figure. This
     * world is flat Lambert with no tone mapping and a bright palette: Moss
     * Light's green channel is 0.64, so total irradiance above about 1.55
     * clips it to pure white. Measured — at 3.0 the noon floor was 255,255,255.
     *
     * Keeping NoToneMapping and lowering the sun is the faithful choice here:
     * the brief asks for flat colours and a frame that looks like a poster, and
     * a poster has no film curve. A clipping assertion holds this honest.
     */
    peakIntensity: 1,
  },

  render: {
    /**
     * Fog. The camera now sits 32 m back and sees roughly 35 m past the hero,
     * so the old 60 m fog start was fogging ground barely beyond Shim.
     */
    fogNear: 90,
    fogFar: 340,
    dprCap: 1.5,
    shadowMapSize: 2048,
    shadowBoxHalf: 45,
    /**
     * Flat-shaded geometry acnes badly without this, and the terrain now
     * shadows itself, which is the hard case: too little and the facets
     * stripe, too much and shadows detach from what casts them. Tuned by eye
     * at the next check — these are a starting point, not a result.
     */
    shadowNormalBias: 0.06,
    shadowBias: -0.0005,
  },

  terrain: {
    /** fBm detail on gentle ground, gradient-gated so ramps stay walkable. */
    detailAmplitude: 0.12,
    detailScale: 6,
    /**
     * Width of a cut cliff face, in metres. The height change between a
     * walkable cell and a cliff cell is compressed into this band at the cell
     * boundary, leaving flat ground either side. A 10 m rise over 4 m is about
     * 68 degrees, which reads as cut rock rather than an eroded slope.
     *
     * Keep it an EVEN multiple of units.sampleSpacing: the ramp's two kinks then
     * land on mesh vertices and the drawn triangles reproduce the field exactly.
     */
    cliffFaceWidth: 4,
    cliffAmplitude: 1.5,
    cliffScale: 20,
    /** Height returned south of the island: the sea floor drops away. */
    seaFloorY: -12,
    /** Height returned off the other three edges: solid rim. */
    outsideRimY: 36,
  },

  vegetation: {
    treeFernCount: 96,
    groundCoverCount: 5200,
    /** World Bible §4-B: eleven tree ferns in a ring wide enough to be a room. */
    cathedralCount: 11,
    cathedralRadius: 8.5,
    /** §7: fronds sway on a long slow cycle; trunks do not move. */
    treeSway: { amplitude: 0.42, period: 7.5 },
    /** Washing and ground cover move faster than anything else on the island. */
    groundSway: { amplitude: 0.09, period: 3.1 },
  },

  water: {
    /** One plane for the pool and the open sea: the gorge mouth is open. */
    planeSize: 420,
    /** Shortest sine is 2.6 m, so quads coarser than half that alias it away. */
    planeSegments: 140,
  },

  particles: {
    /** Steam is vapour: at higher alpha the plume covered half the frame. */
    steamDensity: 0.16,
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

  /**
   * The active milestone's budget. `renderer.info` counts the shadow pass as
   * well as the main pass, so the overlay compares against the incl-shadow
   * ceilings — comparing a combined figure against a main-pass ceiling reported
   * a false OVER.
   *
   * M2 ceilings. Measured occupancy after sky, cliffs and water: 18 main calls
   * and 32 including the shadow pass, 70,434 triangles. The headroom is for
   * vegetation, hushspores and steam, which are still to come.
   */
  budget: {
    drawCallsMainPass: 60,
    drawCallsInclShadow: 100,
    triangles: 300_000,
  },

  seed: 20260925,
} as const;

export type Config = typeof CONFIG;
