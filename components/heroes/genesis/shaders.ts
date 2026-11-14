import type { GenesisBackground } from "@/data/hero-config";

/**
 * Sprint 15 — the Genesis hero's GLSL. Written against the `shader-glsl`
 * skill's patterns: Ashima/Gustavson simplex noise + rotated-octave fbm +
 * IQ domain warping from its cookbook, constant loop bounds, branch-free hot
 * paths (mix / step / smoothstep), fwidth anti-aliasing, and a hash-based
 * film grain. Every shader is a pure function of its uniforms (uTime is the
 * only clock), so a frame is reproducible.
 *
 * Colour: uniforms arrive as THREE.Color (linear); each fragment ends with
 * three's <colorspace_fragment> so the canvas output is sRGB-correct.
 */

/* ------------------------------------------------------------------ */
/* Shared chunks                                                       */
/* ------------------------------------------------------------------ */

/** Full-screen pass: a 2×2 plane written straight to clip space. */
export const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** World-space varyings for geometry in the scene (the grid floor). */
export const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const common = /* glsl */ `
  uniform float uTime;
  uniform vec2 uRes;      // drawing-buffer size, px
  uniform vec2 uMouse;    // -1..1 over the hero, damped
  uniform vec3 uBg;
  uniform vec3 uTint;
  uniform vec3 uAccent;
  uniform vec3 uGlow;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Simplex noise 2D (Ashima / Gustavson, public domain) — skill cookbook.
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // fbm, 4 octaves rotated to hide the lattice (constant loop bound).
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p = rot * p * 2.0;
      a *= 0.5;
    }
    return v;
  }

  // Aspect-correct, centred coordinates (-aspect..aspect, -1..1).
  vec2 centred() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uRes.x / uRes.y;
    return p;
  }

  // Filmic shoulder: neon cores can exceed 1 without clipping flat.
  vec3 filmic(vec3 c) { return 1.0 - exp(-c * 1.15); }
`;

const outro = /* glsl */ `
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
`;

/* ------------------------------------------------------------------ */
/* 1. celestial-nebula — domain-warped simplex fbm, warps to the mouse  */
/* ------------------------------------------------------------------ */
const nebula = /* glsl */ `
  ${common}
  void main() {
    vec2 p = centred();
    float aspect = uRes.x / uRes.y;
    vec2 m = uMouse * vec2(aspect, 1.0);

    // Gravity well: space is pulled toward the cursor, strongest close to it.
    vec2 toM = m - p;
    float md = length(toM);
    vec2 pw = p + toM * 0.42 * exp(-md * 1.8);
    // A slow swirl around the well.
    float sw = 0.6 * exp(-md * 2.2);
    pw = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * (pw - m) + m;

    float t = uTime * 0.035;
    vec2 s = pw * 1.25;
    // IQ domain warping (skill cookbook): noise fed into noise, twice.
    vec2 q = vec2(fbm(s + vec2(0.0, t)), fbm(s + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(s + 3.6 * q + vec2(1.7, 9.2) + t * 1.4), fbm(s + 3.6 * q + vec2(8.3, 2.8) - t * 1.1));
    float n = fbm(s + 3.2 * r) * 0.5 + 0.5;

    vec3 col = uBg;
    col = mix(col, uTint * 0.75, smoothstep(0.32, 0.9, n));
    col = mix(col, uAccent * 0.8, smoothstep(0.45, 1.1, length(q)) * 0.7);
    col += uGlow * pow(clamp(n, 0.0, 1.0), 5.0) * 0.55;
    // Dust lanes: dark filaments where the warp folds.
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.35, abs(r.x - r.y) + 0.05);

    // Stars: sparse hashed points, twinkling, faint inside the gas.
    vec2 cell = floor(gl_FragCoord.xy / 2.0);
    float h = hash(cell);
    float star = step(0.9978, h) * (0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 80.0));
    col += vec3(star) * (1.0 - smoothstep(0.5, 1.0, n) * 0.7);

    // The well glows faintly.
    col += uGlow * 0.06 * exp(-md * 3.0);

    // Vignette, then grain against banding.
    col *= smoothstep(2.1, 0.35, length(p * vec2(0.75, 1.0)));
    col = filmic(col);
    col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.02;
    ${outro}
  }
`;

/* ------------------------------------------------------------------ */
/* 2. neon-ring-field — rotating elliptical neon rings + film grain      */
/* ------------------------------------------------------------------ */
const rings = /* glsl */ `
  ${common}
  void main() {
    vec2 p = centred();
    vec2 c = p - vec2(uMouse.x * 0.06, 0.08 + uMouse.y * 0.04); // a hint of parallax
    vec3 col = uBg;
    // One pixel in p units: AA width computed once — derivatives inside a loop are undefined (HLSL X3595).
    float aa = 3.0 / uRes.y;

    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      // Each ring: its own slow spin and tilt (a circle squashed into an ellipse).
      float a = uTime * (0.045 + 0.018 * fi) * (mod(fi, 2.0) * 2.0 - 1.0) + fi * 1.7;
      mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
      vec2 q = R * c;
      q.y *= 1.35 + 0.65 * sin(fi * 2.1 + uTime * 0.06);
      float radius = 0.28 + fi * 0.17;
      float d = abs(length(q) - radius);

      // Neon tube: an anti-aliased core + inverse-distance halo.
      float core = smoothstep(0.0035 + aa, 0.0, d);
      float halo = 0.0055 / (d + 0.0055);

      // Light runs around the ring in segments.
      float ang = atan(q.y, q.x);
      float seg = 0.35 + 0.65 * smoothstep(-0.2, 0.8, sin(ang * (2.0 + fi) + uTime * (0.35 + fi * 0.05)));
      float pulse = 0.65 + 0.35 * sin(uTime * 0.7 + fi * 1.3);

      vec3 neon = mix(uTint, uAccent, step(0.5, fract(fi * 0.5)));
      col += neon * (core * 1.4 + halo * 0.16) * seg * pulse;
    }

    // A soft core light behind the head.
    col += uGlow * 0.05 * exp(-length(c) * 2.5);
    col *= smoothstep(2.2, 0.4, length(p * vec2(0.7, 1.0)));
    col = filmic(col);

    // Cinematic film grain: hashed per pixel, re-rolled 24× a second.
    float grain = hash(gl_FragCoord.xy * 0.9 + floor(uTime * 24.0) * 17.31) - 0.5;
    col += grain * 0.07;
    ${outro}
  }
`;

/* ------------------------------------------------------------------ */
/* 3. liquid-metal — chrome height field, Fresnel, fake refraction       */
/* ------------------------------------------------------------------ */
const metal = /* glsl */ `
  ${common}

  float height(vec2 p) {
    float t = uTime * 0.12;
    vec2 q = p * 1.5;
    q += 0.35 * vec2(snoise(q * 0.7 + t), snoise(q * 0.7 - t + 3.1));   // time-based distortion
    return snoise(q + vec2(t * 0.6, -t * 0.4)) * 0.55 + snoise(q * 2.2 - t * 0.5) * 0.22;
  }

  // A studio environment: dark floor, bright softbox bands, the tint in the stripes.
  vec3 env(vec3 r) {
    float y = r.y;
    vec3 c = mix(uBg * 0.5, vec3(0.75), smoothstep(-0.15, 0.45, y));
    float bands = sin(r.x * 7.0 + r.y * 13.0 + uTime * 0.15) * 0.5 + 0.5;
    c = mix(c, uTint * 1.2, smoothstep(0.6, 0.95, bands) * 0.55);
    c = mix(c, uAccent, smoothstep(0.8, 1.0, sin(r.x * 3.0 - r.y * 5.0 - uTime * 0.1) * 0.5 + 0.5) * 0.35);
    return c;
  }

  void main() {
    vec2 p = centred();
    vec2 e = vec2(2.0 / uRes.y, 0.0) * 3.0;
    float h = height(p);
    float gx = (height(p + e.xy) - height(p - e.xy)) / (2.0 * e.x);
    float gy = (height(p + e.yx) - height(p - e.yx)) / (2.0 * e.x);
    vec3 n = normalize(vec3(-gx * 0.28, -gy * 0.28, 1.0));
    vec3 v = vec3(0.0, 0.0, 1.0);

    // Schlick Fresnel with a metal's high F0: grazing slopes go mirror-bright.
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fres = 0.55 + 0.45 * pow(1.0 - ndv, 5.0);

    vec3 refl = reflect(-v, n);
    vec3 col = env(refl) * fres;

    // Refraction: a glow behind the surface, bent by the normal.
    vec2 rp = p + n.xy * 0.45;
    col += uAccent * 0.18 * smoothstep(0.1, 0.9, snoise(rp * 0.8 + uTime * 0.05) * 0.5 + 0.5);

    // Specular hot spot that follows the mouse.
    vec3 L = normalize(vec3(uMouse * vec2(0.8, 0.6), 0.9));
    col += uGlow * pow(max(dot(refl, L), 0.0), 60.0) * 1.4;

    // Keep it a backdrop: crush toward the stage colour, deepest at the edges.
    col = mix(uBg, col, 0.62);
    col *= 0.45 + 0.55 * smoothstep(1.0, -0.6, h);
    col *= smoothstep(2.1, 0.3, length(p * vec2(0.75, 1.0)));
    col = filmic(col);
    col += (hash(gl_FragCoord.xy + fract(uTime) * 43.0) - 0.5) * 0.015;
    ${outro}
  }
`;

/* ------------------------------------------------------------------ */
/* 4. calm-dark — a slowly breathing radial gradient                    */
/* ------------------------------------------------------------------ */
const calm = /* glsl */ `
  ${common}
  void main() {
    vec2 p = centred();
    float breath = 0.5 + 0.5 * sin(uTime * 0.32);
    float r = length((p - vec2(0.0, 0.12)) * vec2(0.85, 1.0));
    vec3 col = uBg;
    col += uTint * 0.16 * smoothstep(1.35 + 0.18 * breath, 0.0, r);
    col += uGlow * 0.035 * smoothstep(0.75, 0.0, length(p - vec2(0.0, -0.35))) * (0.6 + 0.4 * breath);
    // Ordered-ish dither: a dark gradient bands without it.
    col += (hash(gl_FragCoord.xy) - 0.5) / 160.0;
    ${outro}
  }
`;

export const BACKGROUND_FRAGMENTS: Record<GenesisBackground, string> = {
  "celestial-nebula": nebula,
  "neon-ring-field": rings,
  "liquid-metal": metal,
  "calm-dark": calm,
};

/* ------------------------------------------------------------------ */
/* Retro grid floor                                                    */
/* ------------------------------------------------------------------ */

/** Anti-aliased lines scrolling toward the camera, dissolving into a glowing horizon. Additive. */
export const gridFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform vec3 uGrid;
  uniform vec3 uAccent;
  varying vec3 vWorld;

  // 0..1 line coverage for a unit grid, width in screen pixels (fwidth AA).
  float gridLines(vec2 p, float px) {
    vec2 w = fwidth(p) * px;
    vec2 g = abs(fract(p - 0.5) - 0.5) / max(w, 1e-4);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 p = vWorld.xz * vec2(0.9, 0.75);
    p.y += uTime * 0.7;
    float dist = length(vWorld.xz - cameraPosition.xz);

    float fade = smoothstep(46.0, 7.0, dist);        // lines dissolve into the horizon
    float near = smoothstep(2.5, 11.0, dist);        // and clear of the copy up front
    float far = smoothstep(12.0, 38.0, dist);

    float core = gridLines(p, 1.3);
    float halo = gridLines(p, 6.0);
    // Where a cell shrinks toward one pixel the lines alias into a solid band: fade them by screen-space density.
    vec2 fw = fwidth(p);
    float density = smoothstep(0.9, 0.2, max(fw.x, fw.y));
    vec3 line = mix(uGrid, uAccent, far * 0.8);
    vec3 col = line * (core * 1.4 + halo * 0.12 * density) * density * fade * mix(0.08, 1.0, near);

    // Floor haze: the far floor glows in the accent. It meets the horizon glow (below) at equal strength, so there's no seam.
    col += uAccent * smoothstep(14.0, 44.0, dist) * 0.2;
    col *= uIntro;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Horizon glow: a wall standing on the floor's far edge, brightest at its
 * foot and fading upward. Perspective squeezes any world-distance fade on
 * the floor into a few pixels at the horizon (a hard band); a vertical plane
 * fades in screen space instead.
 */
export const horizonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const horizonFragment = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uIntro;
  varying vec2 vUv;
  void main() {
    float a = pow(1.0 - vUv.y, 2.5) * 0.2;
    gl_FragColor = vec4(uAccent * a * uIntro, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* Watermark: glitch + chromatic aberration + neon glow                  */
/* ------------------------------------------------------------------ */

/**
 * Draws the logo (its alpha as a mask) in a screen rectangle: RGB-split
 * channels, row-sliced glitch bursts (skill: "row hash shift + RGB channel
 * offset"), a two-ring blur for the neon halo, scanlines and flicker. Pixels
 * outside the padded rectangle return at once (uniform-coherent branch).
 */
export const watermarkFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uRes;
  uniform vec4 uRect;      // x, y (bottom-left), w, h — in drawing-buffer px
  uniform float uTime;
  uniform float uGlitch;
  uniform float uOpacity;
  uniform float uGlowAmt;  // Sprint 15.6: halo strength, 0–2
  uniform float uSpeed;    // Sprint 15.6: glitch clock speed, 0.25–3
  uniform vec3 uGlow;
  uniform vec3 uAccent;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float mask(vec2 uv) {
    vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    // Explicit LOD: called in a loop, where implicit derivatives are undefined (HLSL X3595). The texture has no mips anyway.
    return textureLod(uTex, clamp(uv, 0.0, 1.0), 0.0).a * inside.x * inside.y;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - uRect.xy) / uRect.zw;
    if (uv.x < -0.2 || uv.x > 1.2 || uv.y < -0.5 || uv.y > 1.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    // The glitch clock runs at the admin's speed (bursts, slices, jitter and flicker together).
    float t = uTime * uSpeed;

    // Bursts: a few per ten seconds, more with uGlitch.
    float burst = step(0.86 - 0.32 * uGlitch, hash(vec2(floor(t * 2.5), 7.0)));
    float tick = floor(t * 24.0);
    float slice = floor(uv.y * 16.0 + hash(vec2(tick, 3.0)) * 4.0);
    float sliceOn = step(0.55, hash(vec2(slice * 1.7, tick + 3.0)));
    float jolt = (hash(vec2(slice, tick)) - 0.5) * 0.16 * burst * sliceOn;
    float jitter = (hash(vec2(floor(t * 9.0), 1.0)) - 0.5) * 0.005;
    vec2 g = uv + vec2((jolt + jitter) * uGlitch, 0.0);

    // Chromatic aberration: always a hair, wide during bursts.
    float ca = (0.003 + 0.022 * burst) * uGlitch + 0.0015;
    float r = mask(g + vec2(ca, 0.0));
    float gc = mask(g);
    float b = mask(g - vec2(ca, ca * 0.3));

    // Neon glow: two rings of taps (6px and 18px), 12 directions each.
    vec2 px = 1.0 / uRect.zw;
    float glow = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      vec2 o = vec2(cos(a), sin(a));
      glow += mask(g + o * px * 6.0) + mask(g + o * px * 18.0) * 0.6;
    }
    glow /= 19.2;

    float scan = 0.82 + 0.18 * sin(gl_FragCoord.y * 1.7 + t * 6.0);
    float flicker = 0.9 + 0.1 * sin(t * 31.0) * sin(t * 7.3) + burst * 0.25;

    vec3 core = vec3(r, gc, b) * mix(vec3(1.0), uGlow, 0.25) * scan;
    // Neon: the halo scales with the admin's glow (0 = a clean mark, 2 = a blazing sign); the core stays crisp.
    vec3 col = core * (0.9 + 0.15 * uGlowAmt) + (uGlow * glow * 0.95 + uAccent * glow * glow * 0.5) * uGlowAmt;
    col *= flicker * uOpacity;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* Sprint 15.5 — Hologram head                                          */
/* ------------------------------------------------------------------ */

/**
 * The 360° frame as a plane in the WebGL scene, tilted toward the cursor the
 * way the CSS portrait was (rotateX → rotateY about a pivot 42% down the
 * portrait box, a 1100px perspective, the gaze shift). Everything is in
 * drawing-buffer pixels, so the plane lands exactly where the DOM portrait
 * would have been.
 */
export const hologramVertex = /* glsl */ `
  uniform vec2 uRes;     // drawing buffer, px
  uniform vec4 uRect;    // the frame's drawn rect: x, y (bottom-left), w, h — px
  uniform vec2 uPivot;   // tilt pivot, px
  uniform vec2 uTilt;    // rotateX, rotateY (radians)
  uniform vec2 uShift;   // gaze shift, px (y up)
  uniform float uFocal;  // perspective distance, px
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec2 p = uRect.xy + uv * uRect.zw - uPivot;
    float cx = cos(uTilt.x), sx = sin(uTilt.x);
    float cy = cos(uTilt.y), sy = sin(uTilt.y);
    // rotateX: a positive angle tips the top away (as in CSS); then rotateY: the right side goes away.
    float y1 = p.y * cx;
    float z1 = -p.y * sx;
    float x2 = p.x * cy + z1 * sy;
    float z2 = -p.x * sy + z1 * cy;
    float persp = uFocal / (uFocal - z2);
    vec2 px = uPivot + vec2(x2, y1) * persp + uShift;
    gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  }
`;

/**
 * Holographic projection. Adapted from Anderson Mancini's
 * threejs-holographic-material (MIT, github.com/ektogamat/threejs-holographic-material):
 * its flicker() / random() helpers, scanline composition and Fresnel term
 * are kept; the `webgl` skill's moving fine scanlines are layered on top.
 *
 * A flat photo has no mesh normals, so the "surface" normal comes from the
 * gradient of the hologram's key (alpha × luminance): flat inside the
 * silhouette, steep at its edge — so the Fresnel rim lights the outline of
 * the head, where a real hologram's grazing angles would be. The same edge
 * strength drives the RGB split. The key is the frame's alpha — a black
 * photo backdrop is matted out at load by connectivity (never by brightness,
 * which would hollow out dark skin and hair), so the old CSS "screen" trick goes.
 */
export const hologramFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uMap2;    // Sprint 15.6: the neighbouring frame of the turn…
  uniform float uMix;         // …and how far we are into it (0 = all uMap)
  uniform vec2 uTexel;        // 1 / frame size
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uGlow;         // rim / Fresnel colour
  uniform vec3 uAccent;       // the rim's second colour (Fresnel gradient)
  uniform vec3 uTint;         // hologram colour
  uniform float uFresnel;     // 0–1
  uniform float uScan;        // 0–1
  uniform float uAberration;  // 0–1
  uniform float uGrain;       // 0–1
  uniform float uOpacity;
  varying vec2 vUv;

  // ektogamat
  float flicker(float amt, float time) { return clamp(fract(cos(time) * 43758.5453123), amt, 1.0); }
  float random(in float a, in float b) { return fract((cos(dot(vec2(a, b), vec2(12.9898, 78.233))) * 43758.5453)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Bitmaps upload top-down (flipY can't apply to an ImageBitmap): flip here, for every source alike.
  // Sprint 15.6: the two frames around the angle, cross-faded in premultiplied space (no dark fringes
  // where one frame is transparent and the other isn't).
  vec4 tap(vec2 uv) {
    vec2 st = vec2(uv.x, 1.0 - uv.y);
    vec4 a = texture(uMap, st);
    vec4 b = texture(uMap2, st);
    vec3 c = mix(a.rgb * a.a, b.rgb * b.a, uMix);
    float al = mix(a.a, b.a, uMix);
    return vec4(al > 1e-4 ? c / al : vec3(0.0), al);
  }

  // The key is the frame's alpha: a black photo backdrop was already removed at load by a
  // connectivity matte (lib/backdrop-matte), so dark skin and hair inside the silhouette stay solid.
  float keyOf(vec4 c) {
    return c.a;
  }

  void main() {
    // Sprint 15.6 — signal tear: once in a while a few scanline-thin slices jolt sideways.
    vec2 uv = vUv;
    float tearBurst = step(0.97, hash(vec2(floor(uTime * 2.0), 11.0)));
    float slice = floor(vUv.y * 48.0);
    float tearOn = step(0.72, hash(vec2(slice, floor(uTime * 18.0))));
    uv.x += (hash(vec2(slice, floor(uTime * 18.0) + 5.0)) - 0.5) * 0.035 * tearBurst * tearOn * uScan;

    vec4 base = tap(uv);
    float m = keyOf(base);

    // Pseudo-normal from the key's gradient (2 texels each way).
    vec2 d = uTexel * 2.0;
    float gx = keyOf(tap(uv + vec2(d.x, 0.0))) - keyOf(tap(uv - vec2(d.x, 0.0)));
    float gy = keyOf(tap(uv + vec2(0.0, d.y))) - keyOf(tap(uv - vec2(0.0, d.y)));
    vec3 normal = normalize(vec3(-gx, -gy, 0.35));
    float edge = clamp(length(vec2(gx, gy)) * 1.5, 0.0, 1.0);

    // Chromatic aberration, strongest on the edges.
    float ca = uTexel.x * (1.0 + 9.0 * edge) * 2.0 * uAberration;
    vec3 col = vec3(tap(uv + vec2(ca, 0.0)).r, base.g, tap(uv - vec2(ca, 0.0)).b);
    float mR = keyOf(tap(uv + vec2(ca, 0.0)));
    float mB = keyOf(tap(uv - vec2(ca, 0.0)));
    float cover = max(m, max(mR, mB) * 0.85);
    // Sprint 15.6: the projection fades out at its base (the photo crops the shoulders in a hard line).
    float beam = smoothstep(0.0, 0.14, vUv.y);
    cover *= beam;

    // Hologram colour. A projection emits light: lift the shadows with a tone curve first
    // (a dark subject's features live in linear 0.01–0.1), so faces read instead of
    // collapsing into a flat silhouette — then push the result toward the tint.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float lifted = pow(clamp(luma, 0.0, 1.0), 0.55);
    vec3 photo = col * (lifted / max(luma, 1e-4));
    col = mix(photo, uTint * (0.12 + lifted * 1.9), 0.42) + uGlow * 0.03;

    // Scanlines (ektogamat composition, screen space).
    vec2 myUV = gl_FragCoord.xy / uRes;
    float signalSpeed = 0.45;
    float scanlineSize = 8.0;
    float scanlines = 10.0;
    scanlines += 20.0 * sin(uTime * signalSpeed * 20.8 - myUV.y * 60.0 * scanlineSize);
    scanlines *= smoothstep(1.3 * cos(uTime * signalSpeed + myUV.y * scanlineSize), 0.78, 0.9);
    scanlines *= max(0.25, sin(uTime * signalSpeed));
    float r = random(vUv.x, vUv.y);
    float b = random(vUv.y * 0.9, vUv.y * 0.2);
    col += vec3(r * scanlines, b * scanlines, r) / 84.0 * uScan * cover;

    // Fine scanlines drifting upward (webgl skill: sin(y·k − t·speed)).
    // Fine and light, so they texture the projection instead of striping it.
    float fine = sin(gl_FragCoord.y * 2.2 - uTime * 9.0) * 0.5 + 0.5;
    col *= mix(1.0, 0.84 + 0.16 * fine, uScan);

    // Fresnel (ektogamat: clamp(amount − dot(view, normal)·(1.6 − opacity/2), 0, opacity)).
    float fresnelOpacity = 1.0;
    float fresnelAmount = 0.45 + 0.55 * uFresnel;
    float fres = clamp(fresnelAmount - dot(vec3(0.0, 0.0, 1.0), normal) * (1.6 - fresnelOpacity / 2.0), 0.0, fresnelOpacity);
    fres *= uFresnel;
    // Blink on the rim only (ektogamat's blinkFresnelOnly), softened.
    float blink = mix(1.0, flicker(0.6 - signalSpeed, uTime * signalSpeed * 0.02), 0.35);
    // Sprint 15.6: the rim runs glow → accent up the silhouette, slowly cycling.
    vec3 rim = mix(uGlow, uAccent, clamp(vUv.y * 0.8 + 0.2 * sin(uTime * 0.4), 0.0, 1.0));
    col += rim * fres * blink * 1.8 * beam;

    // Sprint 15.6: an interference band sweeping up the projection every ~8 s.
    float sweep = fract(uTime * 0.12) * 1.5 - 0.25;
    float band = exp(-pow((vUv.y - sweep) * 18.0, 2.0));
    col += uTint * band * 0.55 * cover * uScan + uGlow * band * fres * 0.6;

    // Projection grain, re-rolled 24× a second.
    col += (hash(gl_FragCoord.xy + floor(uTime * 24.0) * 13.1) - 0.5) * 0.14 * uGrain * cover;

    float alpha = clamp(cover + fres * 0.9 * beam, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
