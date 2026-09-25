varying vec3 vLocal;

void main() {
  vLocal = normalize(position);
  // Dome is parented to the camera and never occludes: depth write is off and
  // the projection is forced to the far plane in the fragment stage.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
