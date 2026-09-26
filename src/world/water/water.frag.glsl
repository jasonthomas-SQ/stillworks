uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform float uSunIntensity;

varying float vWave;
varying vec3 vWorld;

#include <fog_pars_fragment>

void main() {
  // Quantise the wave height into three bands. No specular, no reflection:
  // the brief rules out glossy materials, so depth is carried by colour steps.
  float w = clamp(vWave * 5.5 + 0.5, 0.0, 1.0);
  float band = floor(w * 3.0) / 2.0;

  vec3 colour = mix(uDeep, uShallow, band);
  colour = mix(colour, uCrest, step(0.95, band) * 0.6);

  // One banded Lambert term against the sun, so the water darkens as the day
  // ends rather than staying lit at midnight.
  float lambert = max(dot(vec3(0.0, 1.0, 0.0), normalize(uSunDir)), 0.0);
  float lit = floor(lambert * 3.0 + 0.5) / 3.0;
  colour *= 0.55 + 0.45 * lit * clamp(uSunIntensity / 3.0, 0.0, 1.0);
  colour += uSunColour * lit * 0.06 * clamp(uSunIntensity / 3.0, 0.0, 1.0);

  gl_FragColor = vec4(colour, 0.88);

  #include <fog_fragment>
}
