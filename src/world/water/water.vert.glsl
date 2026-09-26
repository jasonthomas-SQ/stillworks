uniform float uTime;

varying float vWave;
varying vec3 vWorld;

#include <fog_pars_vertex>

// Three summed sines, crossing at different angles so the pattern never
// obviously repeats. Cheap, deterministic, and the height is handed to the
// fragment stage as a varying so the bands can be cut there.
float waveAt(vec2 p, float t) {
  float w = 0.0;
  w += sin(dot(p, vec2(0.83, 0.56)) * 0.52 + t * 0.55) * 0.10;
  w += sin(dot(p, vec2(-0.32, 0.95)) * 1.26 + t * 0.83) * 0.05;
  w += sin(dot(p, vec2(0.71, -0.71)) * 2.42 + t * 1.31) * 0.02;
  return w;
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float wave = waveAt(world.xz, uTime);
  world.y += wave;

  vWave = wave;
  vWorld = world.xyz;

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
