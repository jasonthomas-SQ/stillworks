uniform vec3 uColour;

varying float vAlpha;

void main() {
  // Procedural round sprite. No texture: the whole game ships without one.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;

  float edge = 1.0 - smoothstep(0.12, 0.25, r);
  gl_FragColor = vec4(uColour, vAlpha * edge);

  #include <colorspace_fragment>
}
