uniform float uTime;
uniform float uDensity;
uniform float uRiseSpeed;
uniform float uRiseHeight;
uniform float uWobble;
uniform float uSize;
uniform float uSpread;

attribute float aPhase;
attribute float aSpawnY;

varying float vAlpha;

void main() {
  // One mote's whole life in four lines, on the GPU. No CPU work per particle:
  // 500 of these cost one draw call and nothing else.
  float cycle = uRiseHeight / uRiseSpeed;
  float t = mod(uTime + aPhase * cycle, cycle);
  float rise = t * uRiseSpeed;

  vec3 p = position;
  p.y = aSpawnY + rise;

  // World Bible §3: hushspores "rise dead straight, never drifting sideways by
  // more than a hand's width". A sine on each axis with no accumulating term,
  // so the net sideways drift over a lifetime is exactly zero.
  p.x += sin(uTime * 0.9 + aPhase * 31.0) * uWobble;
  p.z += cos(uTime * 0.7 + aPhase * 17.0) * uWobble;

  // Fade in off the moss and out at the top of the climb.
  float fadeIn = smoothstep(0.0, 0.08, t / cycle);
  float fadeOut = 1.0 - smoothstep(0.55, 1.0, t / cycle);
  vAlpha = fadeIn * fadeOut * uDensity;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uSpread / max(-mvPosition.z, 0.001);
}
