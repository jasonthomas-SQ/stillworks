uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform float uSunIntensity;

varying float vWave;
varying vec3 vWorld;

#include <fog_pars_fragment>

void main() {
  // TWO tones inside a narrow value range, not three wide wedges. The first
  // version banded Fern Deep to Steam Grey, which read as a painted stripe or
  // a wall rather than water — far too much contrast, and darker than the moss
  // beside it.
  float w = clamp(vWave * 6.0 + 0.5, 0.0, 1.0);
  float band = step(0.5, w);
  vec3 tint = mix(uDeep, uShallow, band);

  // Lit by the same terms as everything else, so the water darkens with the
  // sky instead of staying bright while the gorge goes black at night.
  float lambert = max(dot(vec3(0.0, 1.0, 0.0), normalize(uSunDir)), 0.0);
  vec3 light = uAmbient + uSunColour * uSunIntensity * lambert;

  gl_FragColor = vec4(clamp(tint * light, 0.0, 1.0), 0.86);

  #include <colorspace_fragment>

  #include <fog_fragment>
}
