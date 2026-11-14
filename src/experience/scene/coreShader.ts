/**
 * The Core: a ray-marched liquid chrome object.
 *
 * Rendered on the back faces of a bounding sphere, marched in object space, and written to the
 * depth buffer so it composites correctly with particles and the glass stack. Six approved states
 * are signed-distance fields that blend into each other:
 *   0 Spark   – (drop field, scaled to a point by the mesh, glowing)
 *   1 Drop    – liquid chrome with a droplet pulling away; uSplit separates Muse's three directions
 *   2 Form    – a twisted chrome ribbon
 *   3 Lattice – a gyroid structure with violet light inside
 *   4 Orbit   – a sphere with rings and satellites
 *   5 Universe – (orbit field, collapsing to a star while the particles become a galaxy)
 * The environment is the same studio rig used for the Stage 01 key frames.
 */

export const coreVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const coreFragment = /* glsl */ `
precision highp float;

// three binds projectionMatrix for us; the Core's own frame comes in as uModel / uInvModel
uniform mat4 projectionMatrix;
uniform mat4 uModel;
uniform float uBound;

uniform float uTime;
uniform float uMorph;
uniform float uSplit;
uniform mat4 uInvModel;
uniform vec3 uRipplePos;
uniform float uRippleT;
uniform float uRippleAmp;
uniform vec3 uHoverPos;
uniform float uHoverAmp;
uniform float uKey;
uniform float uViolet;
uniform float uCobalt;
uniform float uCyan;
uniform float uGlow;
uniform float uFilm;
uniform float uLiquid;
uniform float uRough;

varying vec3 vWorld;

#ifndef MAX_STEPS
#define MAX_STEPS 96
#endif
#ifndef AO_STEPS
#define AO_STEPS 4
#endif

const vec3 SILVER = vec3(0.7157, 0.7231, 0.7682);
const vec3 VIOLET = vec3(0.2582, 0.1620, 0.8388);
const vec3 COBALT = vec3(0.0423, 0.1248, 0.6867);
const vec3 CYAN   = vec3(0.1221, 0.5776, 0.6939);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }

float sdDrop(vec3 p) {
  float t = uTime;
  float d = sdSphere(p, 1.0);
  vec3 a = vec3(0.74, 0.72, 0.12) + 0.05 * vec3(sin(t * 0.9), cos(t * 0.7), sin(t * 0.5));
  d = smin(d, sdSphere(p - a, 0.34), 0.32);
  vec3 b = vec3(1.18, 1.22, 0.18) + 0.06 * vec3(sin(t * 1.3), cos(t * 1.1), sin(t * 0.7));
  d = min(d, sdSphere(p - b, 0.11));
  if (uSplit > 0.001) {
    float k = 0.38 * (1.0 - uSplit) + 0.06;
    vec3 s1 = mix(vec3(-0.25, 0.0, 0.0), vec3(-1.55, 0.42, 0.25), uSplit);
    vec3 s2 = mix(vec3(0.05, -0.2, 0.0), vec3(-0.25, -1.5, 0.35), uSplit);
    float r = mix(0.62, 0.38, uSplit);
    d = smin(d, sdSphere(p - s1, r), k);
    d = smin(d, sdSphere(p - s2, r * 0.92), k);
  }
  d += uLiquid * 0.02 * sin(5.3 * p.x + t * 1.1) * sin(4.7 * p.y + 0.4 + t * 0.8) * sin(5.1 * p.z + 2.1 + t * 0.9);
  return d;
}

float sdForm(vec3 p) {
  vec3 q = p;
  q.yz = rot(0.95) * q.yz;
  q.xy = rot(0.35 + uTime * 0.05) * q.xy;
  float th = atan(q.z, q.x);
  float R = 1.0 + 0.08 * sin(2.0 * th + uTime * 0.6);
  float a = length(q.xz) - R;
  float b = q.y;
  float tw = th * 1.5 + uTime * 0.35;
  float c = cos(tw), s = sin(tw);
  float u = c * a - s * b;
  float v = s * a + c * b;
  vec2 e = vec2(0.42, 0.11);
  float k = length(vec2(u / e.x, v / e.y));
  return (k - 1.0) * min(e.x, e.y) * 0.9;
}

float sdLattice(vec3 p) {
  vec3 q = p;
  q.xz = rot(0.5 + uTime * 0.08) * q.xz;
  q.yz = rot(0.35) * q.yz;
  const float K = 5.4;
  vec3 g = q * K;
  float gy = sin(g.x) * cos(g.y) + sin(g.y) * cos(g.z) + sin(g.z) * cos(g.x);
  float dg = (abs(gy) - 0.24) / (K * 1.75);
  float ds = length(p) - 1.0;
  return max(dg, ds);
}

float ring(vec3 p, float R, float r, float ax, float az, float speed, float off, float sr) {
  vec3 q = p;
  q.yz = rot(ax) * q.yz;
  q.xy = rot(az) * q.xy;
  float d = sdTorus(q, vec2(R, r));
  float a = uTime * speed + off;
  d = min(d, sdSphere(q - vec3(R * cos(a), 0.0, R * sin(a)), sr));
  float a2 = a + 2.6;
  d = min(d, sdSphere(q - vec3(R * cos(a2), 0.0, R * sin(a2)), sr * 0.7));
  return d;
}

float sdOrbit(vec3 p) {
  float d = sdSphere(p, 0.72) + 0.018 * sin(4.0 * p.x + uTime) * sin(4.0 * p.y + 1.0) * sin(4.0 * p.z + 2.0);
  d = min(d, ring(p, 1.45, 0.012, 0.35, 0.2, 0.45, 0.6, 0.075));
  d = min(d, ring(p, 1.75, 0.009, -0.55, 0.9, -0.32, 1.9, 0.06));
  d = min(d, ring(p, 2.1, 0.007, 0.15, -0.5, 0.22, 3.4, 0.05));
  return d;
}

float sdState(int i, vec3 p) {
  if (i <= 1) return sdDrop(p);
  if (i == 2) return sdForm(p);
  if (i == 3) return sdLattice(p);
  return sdOrbit(p);
}

float map(vec3 p) {
  float m = clamp(uMorph, 1.0, 4.0);
  int i = int(floor(m));
  float f = m - float(i);
  float d;
  if (f < 0.002 || i >= 4) {
    d = sdState(i, p);
  } else {
    float e = f * f * (3.0 - 2.0 * f);
    d = mix(sdState(i, p), sdState(i + 1, p), e);
    // organic in-between: the surface boils gently while it changes shape
    float boil = sin(e * 3.14159);
    d += boil * 0.06 * sin(3.1 * p.x + uTime * 2.0) * sin(2.7 * p.y + uTime * 1.6) * sin(3.3 * p.z + uTime * 1.8);
  }
  if (uHoverAmp > 0.001) {
    vec3 h = p - uHoverPos;
    d -= uHoverAmp * 0.09 * exp(-dot(h, h) * 3.5);
  }
  if (uRippleAmp > 0.001) {
    float dist = length(p - uRipplePos);
    d += uRippleAmp * 0.035 * exp(-dist * 2.0) * sin(dist * 18.0 - uRippleT * 10.0) * exp(-uRippleT * 1.4);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0016;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float ao(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= AO_STEPS; i++) {
    float h = 0.045 * float(i);
    occ += (h - map(p + n * h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

float area(vec3 d, vec3 c, vec2 size, float soft) {
  vec3 up = abs(c.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 rx = normalize(cross(up, c));
  vec3 ry = cross(c, rx);
  float f = dot(d, c);
  if (f <= 0.0) return 0.0;
  float u = dot(d, rx) / max(f, 1e-3);
  float v = dot(d, ry) / max(f, 1e-3);
  return smoothstep(size.x + soft, size.x - soft, abs(u)) * smoothstep(size.y + soft, size.y - soft, abs(v));
}

vec3 env(vec3 d) {
  float y = d.y;
  vec3 col = vec3(0.004 + 0.05 * pow(smoothstep(-0.05, 1.0, y), 1.5)) * SILVER;
  col += exp(-pow((y + 0.015) / 0.018, 2.0)) * SILVER * 0.55;
  col += area(d, normalize(vec3(-0.45, 0.85, 0.45)), vec2(0.6, 0.45), 0.35 + uRough) * SILVER * 1.9 * uKey;
  col += area(d, normalize(vec3(0.92, 0.1, 0.3)), vec2(0.035, 1.1), 0.025 + uRough) * SILVER * 3.6 * uKey;
  col += area(d, normalize(vec3(-0.95, 0.05, 0.1)), vec2(0.025, 0.9), 0.02 + uRough) * SILVER * 2.2 * uKey;
  col += area(d, normalize(vec3(0.55, 0.3, -0.85)), vec2(0.7, 0.55), 0.45 + uRough) * VIOLET * 1.25 * uViolet;
  col += area(d, normalize(vec3(-0.7, -0.15, -0.7)), vec2(0.5, 0.25), 0.4 + uRough) * COBALT * 0.95 * uCobalt;
  col += area(d, normalize(vec3(0.35, 0.9, 0.2)), vec2(0.06, 0.06), 0.04 + uRough) * CYAN * 3.0 * uCyan;
  col *= (y < -0.03) ? 0.3 : 1.0;
  col += exp(-pow((y + 0.12) / 0.12, 2.0)) * step(y, -0.03) * VIOLET * 0.035 * uViolet;
  return col;
}

void main() {
  vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
  vec3 pw = (uInvModel * vec4(vWorld, 1.0)).xyz;
  vec3 rd = normalize(pw - ro);

  // entry and exit of the bounding sphere
  float b = dot(ro, rd);
  float c = dot(ro, ro) - uBound * uBound;
  float h = b * b - c;
  if (h < 0.0) discard;
  h = sqrt(h);
  float t = max(-b - h, 0.0);
  float tEnd = -b + h;

  bool hit = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0009 * (1.0 + t)) { hit = true; break; }
    t += d * 0.72;
    if (t > tEnd) break;
  }
  if (!hit) discard;

  vec3 pO = ro + rd * t;
  vec3 nO = calcNormal(pO);
  vec3 hitW = (uModel * vec4(pO, 1.0)).xyz;
  vec3 nW = normalize(mat3(uModel) * nO);
  vec3 rdW = normalize(hitW - cameraPosition);

  vec3 r = reflect(rdW, nW);
  float cosv = clamp(-dot(rdW, nW), 0.0, 1.0);
  float fres = 0.86 + 0.14 * pow(1.0 - cosv, 5.0);
  float film = pow(1.0 - cosv, 3.0) * uFilm;
  vec3 tint = mix(vec3(0.96, 0.965, 1.0), 0.6 * VIOLET / 0.8388 + 0.4 * CYAN / 0.6939, film);
  vec3 col = env(r) * tint * fres;
  col *= 0.35 + 0.65 * ao(pO, nO);

  // violet light living inside the lattice
  float lw = 1.0 - min(abs(uMorph - 3.0), 1.0);
  if (lw > 0.0) {
    float dist = length(pO);
    float facing = clamp(-dot(nO, normalize(pO)), 0.0, 1.0);
    col += lw * (VIOLET * 1.1 * exp(-dist * 3.2) * (0.1 + facing) + CYAN * 0.25 * exp(-dist * 6.0) * facing);
  }
  // spark and universe: the object is mostly light
  col = mix(col, vec3(1.0, 0.97, 1.05) * 3.0, uGlow * (0.4 + 0.6 * cosv));

  vec4 clip = projectionMatrix * viewMatrix * vec4(hitW, 1.0);
  gl_FragDepth = clamp(0.5 * (clip.z / clip.w) + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
