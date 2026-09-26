uniform float uTime;
uniform float uDensity;
uniform float uRiseSpeed;
uniform float uRiseHeight;
uniform float uWobble;
uniform float uSizeStart;
uniform float uSizeEnd;
uniform float uPixelScale;
uniform float uMaxPixels;
uniform float uFadeStart;

attribute float aPhase;
attribute float aSpawnY;

varying float vAlpha;

void main() {
  // One mote's whole life on the GPU. No CPU work per particle.
  float cycle = uRiseHeight / uRiseSpeed;
  float t = mod(uTime + aPhase * cycle, cycle);
  float life = t / cycle;
  float rise = t * uRiseSpeed;

  vec3 p = position;
  p.y = aSpawnY + rise;

  // World Bible §3: hushspores "rise dead straight, never drifting sideways by
  // more than a hand's width". Bounded sines only — no term accumulates, so the
  // net sideways travel over a whole life is exactly zero.
  p.x += sin(uTime * 0.9 + aPhase * 31.0) * uWobble;
  p.z += cos(uTime * 0.7 + aPhase * 17.0) * uWobble;

  float fadeIn = smoothstep(0.0, 0.08, life);
  float fadeOut = 1.0 - smoothstep(uFadeStart, 1.0, life);
  vAlpha = fadeIn * fadeOut * uDensity;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // TRUE world-scale attenuation. A mote of diameter d metres at view depth z
  // covers d * (viewportHeight / (2 * tan(fov/2))) / z pixels — that whole
  // bracket arrives as uPixelScale, computed once from the drawing buffer, so
  // the device pixel ratio is applied exactly once.
  //
  // The first version used a bare magic constant with no viewport or FOV term,
  // so nothing was world-scaled: a 0.06 m spore drew at 22 px instead of 2.6.
  float size = mix(uSizeStart, uSizeEnd, life);
  gl_PointSize = clamp(size * uPixelScale / max(-mvPosition.z, 0.001), 1.0, uMaxPixels);
}
