uniform vec3 uHorizon;
uniform vec3 uZenith;

varying vec3 vLocal;

void main() {
  // Vertical gradient. Banded rather than smooth, to match the flat-shaded
  // world: a smooth gradient reads as a different rendering technique.
  float h = clamp(vLocal.y * 0.5 + 0.5, 0.0, 1.0);
  float t = smoothstep(0.42, 0.98, h);
  float banded = floor(t * 5.0 + 0.5) / 5.0;
  gl_FragColor = vec4(mix(uHorizon, uZenith, banded), 1.0);
}
