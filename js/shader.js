// GLSL ES 1.00 so one pair of shaders runs on both WebGL2 and WebGL1 contexts.
export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;      // canvas size in pixels
uniform vec2 uCover;    // cover-fit UV scale
uniform vec2 uTilt;     // smoothed device tilt, -1..1
uniform float uTime;    // seconds
uniform float uGrain;   // 0..1
uniform vec4 uRipples[8]; // x, y, age, strength

// Mirrored tiling (triangle wave) so any aspect ratio covers with no seams.
vec2 mirror(vec2 p) {
  return 1.0 - abs(mod(p, 2.0) - 1.0);
}

vec3 tex(vec2 p) {
  return texture2D(uTex, mirror(p)).rgb;
}

// Slow, always-moving liquid warp: two layers of drifting sines.
vec2 flow(vec2 p, float t) {
  vec2 q = p;
  q += 0.040 * vec2(sin(p.y * 3.1 + t * 0.31), cos(p.x * 2.7 - t * 0.27));
  q += 0.022 * vec2(sin(q.y * 6.3 - t * 0.45 + 1.7), cos(q.x * 5.9 + t * 0.38));
  return q - p;
}

// Rotate hue around the grey axis (Rodrigues).
vec3 hue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * uCover + 0.5;

  p += flow(p, uTime);
  p += uTilt * 0.05;

  // ripples: decaying rings that push the image outward and split the colour
  vec2 push = vec2(0.0);
  float rip = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    if (r.w > 0.0) {
      vec2 d = (vUv - r.xy) * asp;
      float dist = length(d);
      float env = exp(-dist * 3.2) * r.w;
      float wave = sin(dist * 30.0 - r.z * 8.0);
      // fade the push to zero at the centre, where the direction flips (pinch)
      push += normalize(d + 1e-4) * wave * env * 0.045 * smoothstep(0.0, 0.09, dist);
      rip += env;
    }
  }
  p += push * uCover;

  // chromatic split: a faint constant fringe, much stronger inside ripples
  vec2 dir = normalize(vUv - 0.5 + 1e-4) * uCover;
  vec2 off = dir * (0.0025 + min(rip, 1.0) * 0.022);
  vec3 c = vec3(tex(p + off).r, tex(p).g, tex(p - off).b);

  // soft glow from the bright nodal lines
  vec3 g = (tex(p + vec2(0.012, 0.0)) + tex(p - vec2(0.012, 0.0)) +
            tex(p + vec2(0.0, 0.012)) + tex(p - vec2(0.0, 0.012))) * 0.25;
  c += max(g - 0.55, 0.0) * 0.55;

  // slow hue drift (aurora <-> ember), pushed further inside ripples
  c = hue(c, sin(uTime * 0.07) * 1.1 + min(rip, 1.0) * 0.6);

  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.05 * uGrain;

  float v = 1.0 - smoothstep(0.3, 1.0, length(vUv - 0.5) * 1.4);
  c *= mix(0.5, 1.0, v);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
