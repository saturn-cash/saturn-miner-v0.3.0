export const RING_INNER = 1.28
export const RING_OUTER = 2.35

const noise = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`

const noise3 = /* glsl */ `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise3(p); p *= 2.02; a *= 0.5; }
  return v;
}
`

/*
 * Optical depth across the main rings, radius mapped 0..1 from the inner edge of the C ring to just past
 * the F ring. Laid out like the real thing: faint C ring, dense bright B ring, the Cassini Division,
 * the A ring with the Encke and Keeler gaps, and the thin F ring outside.
 */
const ringDensity = /* glsl */ `
float ringDensity(float r) {
  float t = (r - ${RING_INNER.toFixed(2)}) / (${RING_OUTER.toFixed(2)} - ${RING_INNER.toFixed(2)});
  if (t < 0.0 || t > 1.0) return 0.0;
  // fine ringlets: a few incommensurate frequencies read as hundreds of grooves without looking periodic
  float fine = 0.5 + 0.5 * sin(t * 410.0) * sin(t * 173.0 + 0.7) * sin(t * 61.0 + 2.1);
  float d = 0.0;
  // C ring: dim and translucent
  d += 0.28 * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.17, 0.185, t)) * (0.7 + 0.3 * fine);
  // B ring: the dense bright one, with a slightly darker inner third
  float b = smoothstep(0.17, 0.19, t) * (1.0 - smoothstep(0.555, 0.565, t));
  d += b * mix(0.78, 0.96, smoothstep(0.19, 0.32, t)) * (0.84 + 0.16 * fine);
  // Cassini Division: not empty, a dusting of material
  d += 0.09 * smoothstep(0.56, 0.57, t) * (1.0 - smoothstep(0.615, 0.625, t));
  // A ring
  float a = smoothstep(0.615, 0.63, t) * (1.0 - smoothstep(0.905, 0.915, t));
  d += a * mix(0.72, 0.6, smoothstep(0.63, 0.9, t)) * (0.86 + 0.14 * fine);
  // Encke gap and Keeler gap
  d *= 1.0 - 0.95 * (smoothstep(0.856, 0.86, t) - smoothstep(0.868, 0.872, t));
  d *= 1.0 - 0.85 * (smoothstep(0.898, 0.9, t) - smoothstep(0.902, 0.904, t));
  // F ring: a thin bright thread
  d += 0.45 * exp(-pow((t - 0.965) * 220.0, 2.0));
  return clamp(d, 0.0, 1.0);
}
`

export const planetVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/*
 * Saturn, the way Cassini photographed it: low-contrast cream and tan belts whose edges wave with the
 * zonal winds, a bright equatorial zone, grey-blue polar regions, the north-pole hexagon as a thin jet,
 * ring shadows across the day side, gas-giant limb darkening and a thin haze at the edge.
 */
export const planetFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSunLocal;
uniform vec3 uSunWorld;
uniform float uEnergy;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise}
${ringDensity}

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.8660254, 0.5)), p.y);
}

void main() {
  vec3 p = normalize(vLocal);
  float lat = p.y;
  float lon = atan(p.z, p.x);
  float drift = uTime * (0.008 + uEnergy * 0.012);

  // zonal winds shear the band edges into gentle waves
  float shear = fbm(vec2(lon * 1.6 + drift, lat * 9.0)) - 0.5;
  float y = lat + shear * 0.05;
  // belts and zones: incommensurate latitude frequencies so the widths look irregular
  float belts = sin(y * 21.0) * 0.5 + sin(y * 47.0 + 1.7) * 0.3 + sin(y * 9.0 + 0.6) * 0.4 + sin(y * 113.0 + 2.3) * 0.12;
  belts = belts * 0.38 + 0.5;
  // small eddies inside the bands
  float eddy = fbm(vec2(lon * 6.0 + drift * 2.0, y * 42.0)) - 0.5;

  vec3 zone = vec3(0.95, 0.86, 0.68);
  vec3 belt = vec3(0.76, 0.58, 0.38);
  vec3 col = mix(belt, zone, smoothstep(0.2, 0.85, belts + eddy * 0.45));
  // the equatorial zone is the widest and brightest
  col = mix(col, vec3(0.97, 0.9, 0.72), exp(-pow(y * 6.5, 2.0)) * 0.55);
  // mid latitudes turn ochre, high latitudes grey-blue
  col = mix(col, vec3(0.8, 0.66, 0.48), smoothstep(0.3, 0.7, abs(y)) * 0.45);
  col = mix(col, vec3(0.47, 0.54, 0.62), smoothstep(0.7, 0.95, abs(lat)) * 0.8);

  // --- the hexagon: a six-sided jet stream around the north pole ---
  float colat = acos(clamp(p.y, -1.0, 1.0));
  float spin = uTime * 0.02;
  vec2 polar = vec2(cos(lon + spin), sin(lon + spin)) * colat;
  float wobble = fbm(polar * 8.0 + vec2(uTime * 0.02, 0.0)) - 0.5;
  float hd = hexDist(polar + wobble * 0.025);
  float hexR = 0.40;
  float north = step(0.0, p.y);
  float inside = (1.0 - smoothstep(hexR - 0.02, hexR + 0.02, hd)) * north;
  float jet = exp(-pow((hd - hexR) * 60.0, 2.0)) * north;
  float swirl = fbm(polar * 14.0 + vec2(uTime * 0.015, 0.0));
  vec3 storm = mix(vec3(0.36, 0.44, 0.54), vec3(0.52, 0.58, 0.66), swirl);
  col = mix(col, storm, inside * 0.85);
  // the vortex eye
  col = mix(col, vec3(0.28, 0.34, 0.42), (1.0 - smoothstep(0.0, 0.07, colat)) * north);
  col += vec3(0.22, 0.24, 0.26) * jet * 0.6;

  // --- lighting ---
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunWorld);
  float diff = max(ndl, 0.0);
  float terminator = smoothstep(-0.06, 0.28, ndl);
  float ndv = max(dot(n, vViewDir), 0.0);
  float limb = 0.5 + 0.5 * pow(ndv, 0.55);

  // ring shadow: trace toward the sun, find where the ray crosses the ring plane
  float shadow = 1.0;
  if (abs(uSunLocal.y) > 0.001) {
    float t = -vLocal.y / uSunLocal.y;
    if (t > 0.0) {
      vec3 hit = vLocal + uSunLocal * t;
      float rr = length(hit.xz);
      // tiny penumbra so the edge is not razor sharp
      float sh = (ringDensity(rr) + ringDensity(rr + 0.006) + ringDensity(rr - 0.006)) / 3.0;
      shadow = 1.0 - sh * 0.9;
    }
  }

  vec3 lit = col * diff * 1.12 * shadow * limb * terminator;
  lit += col * 0.012;
  // the rings bounce a little sunlight onto the night side
  lit += col * 0.045 * (1.0 - terminator);
  // thin high haze catches the sun at the limb, day side only
  float rim = pow(1.0 - ndv, 4.0);
  lit += vec3(0.9, 0.8, 0.64) * rim * diff * 0.4;
  gl_FragColor = vec4(lit, 1.0);
}
`

/* Aurora: curtains of light around both poles; brighter as hashrate climbs. */
export const auroraFragment = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise}
void main() {
  vec3 p = normalize(vLocal);
  float lat = abs(p.y);
  float lon = atan(p.z, p.x);
  float band = exp(-pow((lat - 0.93) * 22.0, 2.0));
  float curtain = fbm(vec2(lon * 6.0 + uTime * 0.35 * sign(p.y), uTime * 0.2));
  curtain = pow(curtain, 2.2) * 2.6;
  float flick = 0.8 + 0.2 * sin(uTime * 3.0 + lon * 11.0);
  // Saturn's aurora is ultraviolet; shown here as a faint cool white-blue curtain
  vec3 col = mix(vec3(0.6, 0.85, 1.0), vec3(0.85, 0.9, 1.0), smoothstep(0.88, 0.97, lat));
  float facing = pow(1.0 - abs(dot(normalize(vNormalW), vViewDir)), 1.4);
  float a = band * curtain * flick * (0.03 + uEnergy * 0.3) * (0.35 + facing);
  gl_FragColor = vec4(col * a, a);
}
`

export const ringVertex = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

export const ringFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSunLocal;
uniform float uEnergy;
uniform float uPulse;
uniform float uPulseAge;
varying vec3 vLocal;
${noise}
${ringDensity}
void main() {
  vec2 xz = vLocal.xy;
  float r = length(xz);
  float d = ringDensity(r);
  if (d < 0.004) discard;
  float ang = atan(xz.y, xz.x);
  // faint azimuthal clumping, barely there
  float grain = noise(vec2(r * 300.0, ang * 2.0));
  d *= 0.92 + grain * 0.16;
  float t = (r - ${RING_INNER.toFixed(2)}) / (${RING_OUTER.toFixed(2)} - ${RING_INNER.toFixed(2)});

  // the planet's shadow across the rings, with a soft edge
  vec3 p3 = vec3(xz, 0.0);
  vec3 L = normalize(uSunLocal);
  float b = dot(p3, L);
  float c = dot(p3, p3) - 1.0;
  float disc = b * b - c;
  float inShadow = b < 0.0 ? smoothstep(-0.05, 0.03, disc) : 0.0;
  float shadow = mix(1.0, 0.05, inShadow);

  // which face are we looking at? The sunlit face is bright; the other face only shows light that
  // filters through the thinner parts (so the C ring and Cassini Division glow, the B ring goes dark)
  bool sunSide = uSunLocal.z > 0.0;
  bool litFace = gl_FrontFacing == sunSide;
  float elev = abs(L.z);
  float light = litFace ? (0.4 + 0.7 * sqrt(elev)) : mix(0.5, 0.1, d) * (0.3 + 0.5 * elev);

  // C ring grey, B ring pale cream (brightest), A ring a touch darker and warmer
  vec3 col = mix(vec3(0.58, 0.55, 0.52), vec3(0.93, 0.87, 0.76), smoothstep(0.15, 0.22, t));
  col = mix(col, vec3(0.86, 0.78, 0.66), smoothstep(0.6, 0.66, t));
  col *= 0.95 + 0.05 * grain;

  // one soft wave rolls outward through the rings for each accepted share
  float wave = 0.0;
  if (uPulseAge < 2.5) {
    float front = ${RING_INNER.toFixed(2)} + uPulseAge * 0.6;
    wave = exp(-pow((r - front) * 16.0, 2.0)) * (1.0 - uPulseAge / 2.5) * uPulse;
  }
  // a slow shimmer that only appears as the hashrate climbs
  float shimmer = 0.5 + 0.5 * sin(ang * 3.0 - uTime * 0.5 + t * 4.0);
  float glow = shimmer * shimmer * uEnergy * 0.08;

  vec3 lit = col * light * shadow;
  lit += vec3(1.0, 0.92, 0.78) * wave * 0.9;
  lit += col * glow;
  gl_FragColor = vec4(lit, clamp(d * 1.15, 0.0, 1.0) * (0.95 + wave * 0.2));
}
`

export const glowFragment = /* glsl */ `
uniform float uEnergy;
uniform float uFlash;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  float i = pow(clamp(-dot(normalize(vNormalW), vViewDir), 0.0, 1.0), 2.2) * 1.2;
  vec3 col = mix(vec3(0.95, 0.85, 0.7), vec3(1.0, 0.96, 0.9), uFlash);
  gl_FragColor = vec4(col, clamp(i, 0.0, 1.0) * (0.16 + uEnergy * 0.25 + uFlash * 2.0));
}
`

/* Titan: thick orange haze, no visible surface. */
export const titanFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSunWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise}
void main() {
  vec3 p = normalize(vLocal);
  float haze = fbm(vec2(atan(p.z, p.x) * 3.0 + uTime * 0.01, p.y * 6.0));
  vec3 col = mix(vec3(0.75, 0.42, 0.14), vec3(0.95, 0.66, 0.3), haze);
  col = mix(col, vec3(0.5, 0.32, 0.2), smoothstep(0.6, 0.95, p.y) * 0.5);
  vec3 n = normalize(vNormalW);
  float diff = smoothstep(-0.25, 0.8, dot(n, uSunWorld));
  float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 2.4);
  vec3 lit = col * (0.02 + diff * 1.0) + vec3(0.95, 0.62, 0.3) * rim * (0.1 + diff * 0.45);
  gl_FragColor = vec4(lit, 1.0);
}
`

/* Icy moon (Enceladus): bright, cracked with blue "tiger stripes". */
export const iceFragment = /* glsl */ `
uniform vec3 uSunWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise}
void main() {
  vec3 p = normalize(vLocal);
  float cr = fbm(vec2(atan(p.z, p.x) * 5.0, p.y * 9.0));
  float stripes = (1.0 - smoothstep(0.0, 0.03, abs(fract(p.x * 6.0 + cr * 0.6) - 0.5) - 0.44)) * (1.0 - smoothstep(-0.75, -0.2, p.y));
  vec3 col = mix(vec3(0.86, 0.92, 0.98), vec3(1.0), cr);
  col = mix(col, vec3(0.35, 0.7, 0.95), stripes * 0.8);
  vec3 n = normalize(vNormalW);
  float diff = max(dot(n, uSunWorld), 0.0);
  float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 3.0);
  gl_FragColor = vec4(col * (0.04 + diff * 1.1) + vec3(0.6, 0.85, 1.0) * rim * 0.35, 1.0);
}
`

export const nebulaVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const nebulaFragment = /* glsl */ `
uniform float uTime;
uniform float uFlash;
varying vec3 vDir;
${noise3}
void main() {
  vec3 d = normalize(vDir);
  // the Milky Way: a soft band of unresolved starlight with dark dust lanes through it
  vec3 galN = normalize(vec3(0.3, 1.0, -0.2));
  float h = dot(d, galN);
  float band = exp(-pow(h * 3.2, 2.0));
  float core = exp(-pow(h * 6.0, 2.0)) * smoothstep(-0.2, 0.8, dot(d, normalize(vec3(-0.8, 0.0, 0.5))));
  float cloud = fbm3(d * 3.0 + vec3(1.7, 0.0, 4.1));
  float dust = fbm3(d * 6.5 + vec3(9.2, 3.3, 0.0));
  float lanes = 1.0 - 0.75 * smoothstep(0.45, 0.7, dust) * band;
  vec3 starlight = vec3(0.62, 0.66, 0.74);
  vec3 warm = vec3(0.72, 0.6, 0.48);
  vec3 col = vec3(0.004, 0.005, 0.009);
  col += starlight * band * (0.02 + 0.06 * smoothstep(0.35, 0.8, cloud)) * lanes;
  col += warm * core * 0.05 * lanes;
  // a very faint, large-scale haze so the void is not a flat black
  col += vec3(0.02, 0.022, 0.03) * smoothstep(0.5, 0.95, fbm3(d * 1.4 + 2.0));
  col *= 1.0 + uFlash * 2.5;
  gl_FragColor = vec4(col, 1.0);
}
`

export const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
varying float vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // gentle twinkle; stars never go dark
  vAlpha = 0.72 + 0.28 * sin(uTime * (0.6 + aPhase) + aPhase * 30.0);
  vTint = aPhase;
  gl_PointSize = aSize * uPixelRatio * (520.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

export const starFragment = /* glsl */ `
varying float vAlpha;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.0, 0.5, d));
  a = a * a * a;
  // mostly white, with a few warm orange giants and cool blue-white stars like a real sky
  vec3 col = vTint > 0.9 ? vec3(1.0, 0.85, 0.65) : vTint > 0.75 ? vec3(0.82, 0.88, 1.0) : vec3(0.96, 0.97, 1.0);
  gl_FragColor = vec4(col, a * vAlpha);
}
`

/* Warp tunnel: streaks in camera space that stretch with warp factor. */
export const warpVertex = /* glsl */ `
attribute float aSeed;
attribute float aEnd;
attribute float aSide;
uniform float uTravel;
uniform float uWarp;
varying float vAlpha;
varying float vSeed;
void main() {
  float depth = 60.0;
  float z = -mod(aSeed * depth + uTravel, depth) - 0.3;
  float len = 0.5 + uWarp * uWarp * 22.0 * (0.6 + fract(aSeed * 13.7) * 0.8);
  float zEnd = z - aEnd * len;
  // thin sliver: widen sideways (perpendicular to the radial direction) in proportion to depth
  vec2 radial = normalize(position.xy);
  vec2 perp = vec2(-radial.y, radial.x);
  float width = (0.0007 + uWarp * 0.0011) * -zEnd * mix(1.0, 0.3, aEnd);
  vec3 pos = vec3(position.xy + perp * aSide * width, zEnd);
  float far = smoothstep(-depth, -depth * 0.85, z);
  vAlpha = mix(0.9, 0.35, aEnd) * far;
  vSeed = aSeed;
  gl_Position = projectionMatrix * vec4(pos, 1.0);
}
`

export const warpFragment = /* glsl */ `
uniform float uWarp;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 col = fract(vSeed * 31.0) > 0.85 ? vec3(1.0, 0.85, 0.65) : vec3(0.85, 0.92, 1.0);
  gl_FragColor = vec4(col * 1.1, vAlpha * 0.5 * smoothstep(0.05, 0.5, uWarp));
}
`

/* Comet streak: a quad whose U runs tail(0) -> head(1). */
export const cometVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // modelMatrix is used as a camera-space transform: comets live on the "glass" of the sky
  gl_Position = projectionMatrix * modelMatrix * vec4(position, 1.0);
}
`

export const cometFragment = /* glsl */ `
uniform float uLife;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float core = exp(-pow((vUv.y - 0.5) * 7.0, 2.0));
  float tail = pow(vUv.x, 2.6);
  float head = exp(-pow((vUv.x - 0.985) * 40.0, 2.0)) * exp(-pow((vUv.y - 0.5) * 3.0, 2.0)) * 2.0;
  float fade = sin(uLife * 3.14159);
  float a = (core * tail + head) * fade;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), head * 0.6) * a, a);
}
`

/* Supernova shockwave in the ring plane. */
export const shockFragment = /* glsl */ `
uniform float uAge;
varying vec3 vLocal;
void main() {
  float r = length(vLocal.xy);
  float front = uAge * 9.0 + 1.2;
  float w = exp(-pow((r - front) * 2.4, 2.0));
  float inner = exp(-pow((r - front * 0.7) * 1.4, 2.0)) * 0.35;
  float life = 1.0 - smoothstep(0.0, 2.6, uAge);
  vec3 col = mix(vec3(1.0, 0.85, 0.6), vec3(0.7, 0.85, 1.0), smoothstep(2.0, 14.0, r));
  float a = (w + inner) * life;
  gl_FragColor = vec4(col * a, a);
}
`

/* ------------------------------------------------------------------ */
/* Moons                                                               */
/* ------------------------------------------------------------------ */

const cells = /* glsl */ `
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// crater field: negative = bowl floor, positive = raised rim
float craters(vec3 p, float scale, float seed) {
  p = p * scale + seed;
  vec3 i = floor(p);
  vec3 f = fract(p);
  float res = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    if (o.y > 0.7) continue;
    vec3 r = g + o - f;
    float rad = 0.22 + 0.3 * o.x;
    float t = length(r) / rad;
    float bowl = 1.0 - smoothstep(0.0, 0.9, t);
    float rim = exp(-pow((t - 1.0) * 5.0, 2.0));
    res += -0.5 * bowl + 0.35 * rim;
  }
  return res;
}
`

export const rockVertex = /* glsl */ `
uniform float uBump;
uniform float uSeed;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise3}
void main() {
  vec3 pos = position;
  if (uBump > 0.0) {
    float n = fbm3(normalize(position) * 1.8 + uSeed);
    pos *= 1.0 + (n - 0.5) * uBump;
  }
  vLocal = position;
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/*
 * One shader for every rocky/icy moon; uFeature picks the signature terrain:
 * 0 craters · 1 Mimas (Herschel) · 2 Iapetus (two-tone + ridge) · 3 Hyperion (sponge)
 * 4 Tethys (Odysseus + Ithaca Chasma) · 5 Dione (wispy cliffs) · 6 Rhea (dense craters) · 7 dark (Phoebe)
 */
export const moonFragment = /* glsl */ `
uniform vec3 uSunWorld;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFeature;
uniform float uSeed;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
${noise3}
${cells}
void main() {
  vec3 p = normalize(vLocal);
  float tone = fbm3(p * 3.0 + uSeed);
  vec3 col = mix(uColorB, uColorA, smoothstep(0.25, 0.75, tone));
  float shade = craters(p, 3.0, uSeed) * 0.5 + craters(p, 7.0, uSeed + 4.0) * 0.3;
  int f = int(uFeature + 0.5);

  if (f == 1) {
    // Herschel: a crater a third of the moon's width, with a central peak
    vec3 H = normalize(vec3(0.25, 0.15, 1.0));
    float t = acos(clamp(dot(p, H), -1.0, 1.0)) / 0.55;
    shade += -0.6 * (1.0 - smoothstep(0.0, 0.95, t)) + 0.5 * exp(-pow((t - 1.0) * 4.0, 2.0)) + 0.5 * exp(-pow(t * 9.0, 2.0));
  } else if (f == 2) {
    // Iapetus: leading hemisphere coated in dark material, plus the equatorial ridge
    float lead = dot(p, vec3(1.0, 0.0, 0.0)) + (tone - 0.5) * 0.5;
    float dark = smoothstep(-0.25, 0.2, lead);
    col = mix(uColorA, uColorB, dark);
    shade *= mix(1.0, 0.4, dark);
    shade += exp(-pow(p.y * 30.0, 2.0)) * 0.35 * dark;
  } else if (f == 3) {
    // Hyperion: deep sponge pits everywhere
    float pits = craters(p, 10.0, uSeed + 9.0);
    shade = shade * 0.5 + pits * 0.9;
    col *= 0.9 + 0.2 * tone;
  } else if (f == 4) {
    vec3 O = normalize(vec3(-0.6, 0.5, 0.6));
    float t = acos(clamp(dot(p, O), -1.0, 1.0)) / 0.75;
    shade += -0.3 * (1.0 - smoothstep(0.0, 0.95, t)) + 0.3 * exp(-pow((t - 1.0) * 4.0, 2.0));
    vec3 N = normalize(vec3(0.2, 0.35, -0.9));
    shade -= exp(-pow(dot(p, N) * 22.0, 2.0)) * 0.55 * smoothstep(-0.2, 0.4, dot(p, O.zxy));
  } else if (f == 5) {
    float w = 1.0 - abs(fbm3(p * 5.0 + uSeed) * 2.0 - 1.0);
    w = smoothstep(0.82, 0.98, w) * smoothstep(0.1, -0.3, p.x);
    col = mix(col, vec3(1.0), w * 0.8);
  } else if (f == 6) {
    shade += craters(p, 12.0, uSeed + 2.0) * 0.35;
  } else if (f == 7) {
    shade *= 0.6;
  }

  col *= 1.0 + shade * 0.45;
  vec3 n = normalize(vNormalW);
  float diff = max(dot(n, uSunWorld), 0.0);
  float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 3.0);
  // faint Saturn-shine keeps night sides from going pure black
  vec3 lit = col * (0.045 + diff * 1.08) + uColorA * rim * 0.18 * (0.3 + diff);
  gl_FragColor = vec4(lit, 1.0);
}
`

export const orbitVertex = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
export const orbitFragment = /* glsl */ `
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), uOpacity);
}
`

export const swarmVertex = /* glsl */ `
attribute vec4 aOrb;   // radius, inclination, node, phase
attribute float aW;    // angular speed (negative = retrograde)
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
varying float vA;
void main() {
  float a = aOrb.w + aW * uTime;
  vec3 p = vec3(cos(a) * aOrb.x, 0.0, sin(a) * aOrb.x);
  float ci = cos(aOrb.y), si = sin(aOrb.y);
  p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
  float cn = cos(aOrb.z), sn = sin(aOrb.z);
  p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uPixelRatio * clamp(aSize * 60.0 / -mv.z, 1.0, 3.5);
  vA = clamp(30.0 / -mv.z, 0.35, 0.9);
  gl_Position = projectionMatrix * mv;
}
`
export const swarmFragment = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.2, 0.5, d)) * vA;
  gl_FragColor = vec4(vec3(0.78, 0.72, 0.64) * a, a);
}
`
