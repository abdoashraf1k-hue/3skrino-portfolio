import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector2 } from "three";
import type { HeroFilter } from "@/data/hero-config";

/**
 * Custom post-processing passes for the hero. Each is a plain `postprocessing`
 * Effect mounted with <primitive>; the composer merges / splits passes as
 * needed (rays sample neighbours → CONVOLUTION; the ripple warps UVs).
 */

/* ------------------------------------------------------------------ */
/* Light rays                                                          */
/* ------------------------------------------------------------------ */
const RAY_SAMPLES = 36;

const raysFragment = /* glsl */ `
  uniform vec2 sun;        // sun centre in screen UV
  uniform float intensity;
  uniform float time;

  // Screen-space god-rays: march from each pixel toward the sun, gathering
  // only the sun's own red glow (rim light and the lime grid are excluded by
  // hue and by distance to the sun) — so the silhouette, being dark, cuts
  // real shafts out of the light.
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 toSun = sun - uv;
    vec2 stepv = toSun / float(${RAY_SAMPLES}) * 0.92;
    vec2 p = uv;
    float decay = 1.0;
    float acc = 0.0;
    for (int i = 0; i < ${RAY_SAMPLES}; i++) {
      p += stepv;
      vec3 s = texture2D(inputBuffer, p).rgb;
      float red = max(0.0, s.r - max(s.g, s.b) * 0.6);
      vec2 d = (p - sun) * vec2(aspect, 1.0);
      float nearSun = smoothstep(0.3, 0.02, length(d));
      acc += red * nearSun * decay;
      decay *= 0.955;
    }
    acc /= float(${RAY_SAMPLES});
    // Slowly turning streaks, so the shafts breathe instead of sitting still.
    float ang = atan(toSun.y, toSun.x * aspect);
    float streak = 0.8 + 0.2 * sin(ang * 23.0 + time * 0.35) * sin(ang * 7.0 - time * 0.2);
    float r = length(toSun * vec2(aspect, 1.0));
    // Shafts start at the sun's rim (the disk itself stays crisp) and fade with distance.
    float fall = smoothstep(0.95, 0.0, r) * smoothstep(0.1, 0.24, r);
    vec3 rays = vec3(1.0, 0.42, 0.24) * acc * streak * fall * intensity * 2.6;
    outputColor = vec4(inputColor.rgb + rays, inputColor.a);
  }
`;

export class LightRaysEffect extends Effect {
  constructor() {
    super("LightRaysEffect", raysFragment, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["sun", new Uniform(new Vector2(0.5, 0.62))],
        ["intensity", new Uniform(0.5)],
        ["time", new Uniform(0)],
      ]),
    });
  }
  get sun(): Vector2 {
    return this.uniforms.get("sun")!.value as Vector2;
  }
  set intensity(v: number) {
    this.uniforms.get("intensity")!.value = v;
  }
  set time(v: number) {
    this.uniforms.get("time")!.value = v;
  }
}

/* ------------------------------------------------------------------ */
/* Grade: filters + hue shift                                          */
/* ------------------------------------------------------------------ */
export const FILTER_MODE: Record<HeroFilter, number> = { none: 0, warm: 1, cool: 2, vintage: 3, contrast: 4 };

const gradeFragment = /* glsl */ `
  uniform float mode;   // 0 none · 1 warm · 2 cool · 3 vintage · 4 high contrast
  uniform float hue;    // radians

  vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    if (abs(hue) > 0.0001) c = max(hueRotate(c, hue), 0.0);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    if (mode > 0.5 && mode < 1.5) {          // warm: amber highs, softer blues
      c *= vec3(1.09, 1.0, 0.84);
      c = mix(c, c * vec3(1.06, 0.98, 0.9), smoothstep(0.2, 1.0, lum));
    } else if (mode > 1.5 && mode < 2.5) {   // cool: teal shadows, crisp highs
      c *= vec3(0.86, 0.99, 1.14);
      c += vec3(0.0, 0.006, 0.014) * (1.0 - smoothstep(0.0, 0.3, lum));
    } else if (mode > 2.5 && mode < 3.5) {   // vintage: faded sepia, lifted blacks, soft vignette
      vec3 sepia = vec3(lum) * vec3(1.08, 0.93, 0.72);
      c = mix(c, sepia, 0.55);
      c = c * 0.86 + vec3(0.035, 0.03, 0.022);
      vec2 v = uv - 0.5;
      c *= 1.0 - dot(v, v) * 0.9;
    } else if (mode > 3.5) {                 // high contrast: S-curve + saturation
      c = clamp((c - 0.18) * 1.42 + 0.18, 0.0, 8.0);
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, 1.28);
    }
    outputColor = vec4(max(c, 0.0), inputColor.a);
  }
`;

export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", gradeFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["mode", new Uniform(0)],
        ["hue", new Uniform(0)],
      ]),
    });
  }
  set mode(v: number) {
    this.uniforms.get("mode")!.value = v;
  }
  set hue(v: number) {
    this.uniforms.get("hue")!.value = v;
  }
}

/* ------------------------------------------------------------------ */
/* Cursor ripple                                                       */
/* ------------------------------------------------------------------ */
const rippleFragment = /* glsl */ `
  uniform vec2 center;   // screen UV
  uniform float age;     // 0 → 1 over the ripple's life; >= 1 means idle

  float ring(vec2 uv) {
    vec2 d = (uv - center) * vec2(aspect, 1.0);
    float r = length(d);
    float radius = age * 0.55;
    return exp(-pow((r - radius) / 0.045, 2.0)) * (1.0 - age);
  }

  void mainUv(inout vec2 uv) {
    if (age >= 1.0) return;
    vec2 d = (uv - center) * vec2(aspect, 1.0);
    vec2 dir = d / max(length(d), 1e-4);
    uv -= dir / vec2(aspect, 1.0) * ring(uv) * 0.012;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float k = age < 1.0 ? ring(uv) : 0.0;
    outputColor = vec4(inputColor.rgb + inputColor.rgb * k * 0.35 + vec3(0.9, 1.0, 0.33) * k * 0.025, inputColor.a);
  }
`;

export class RippleEffect extends Effect {
  constructor() {
    super("RippleEffect", rippleFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["center", new Uniform(new Vector2(0.5, 0.5))],
        ["age", new Uniform(1)],
      ]),
    });
  }
  get center(): Vector2 {
    return this.uniforms.get("center")!.value as Vector2;
  }
  set age(v: number) {
    this.uniforms.get("age")!.value = v;
  }
}
