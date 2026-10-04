import type { EffectId } from "@/data/site-config";

/** The cinematic toolbox, as the admin presents it (admin → Effects / Experiment Lab). */
export type EffectGroup = "Film" | "Lens" | "Video" | "Frame" | "Time";

export const EFFECT_META: Record<EffectId, { n: number; name: string; group: EffectGroup; blurb: string; help: string }> = {
  filmGrain: {
    n: 1,
    name: "Film grain",
    group: "Film",
    blurb: "Moving grain + dust over the whole site",
    help: "Replaces the theme's grain while on. Flicker = how many new grain frames per second (24 = film rate). Dust adds specks and the odd hair.",
  },
  chromatic: {
    n: 2,
    name: "Chromatic aberration",
    group: "Lens",
    blurb: "Red / cyan fringes on headlines and media",
    help: "Splits the colour channels of big type and images. Breathing slowly pulses the split. Per-section strengths live in admin → Sections.",
  },
  vhs: {
    n: 3,
    name: "VHS",
    group: "Video",
    blurb: "Scanlines, a rolling tracking band, colour bleed",
    help: "Scanlines darken every other line; tracking is the noisy band that rolls down the screen; bleeding smears red off the text.",
  },
  crt: {
    n: 4,
    name: "CRT monitor",
    group: "Video",
    blurb: "Curved, glowing tube with phosphor mask",
    help: "Curve darkens and rounds the corners, glow lights the edges, trails strengthens the RGB phosphor mask. Turn it on for single sections in admin → Sections.",
  },
  filmBurn: {
    n: 5,
    name: "Film burn",
    group: "Film",
    blurb: "A burn-through on page transitions",
    help: "Plays over the iris when a visitor moves between pages. Test it by clicking a link in the preview dock.",
  },
  lightLeaks: {
    n: 6,
    name: "Light leaks",
    group: "Frame",
    blurb: "Warm drifting leaks; a flare on hover",
    help: "Ambient: three warm radial leaks drift and flicker. Hover: a flare blooms where the pointer meets a link or button.",
  },
  glitch: {
    n: 7,
    name: "Glitch",
    group: "Video",
    blurb: "RGB split + displaced blocks, now and then",
    help: "Frequency goes from rare (about every 14s) to often (about every 1.5s). Block size is the height of the displaced strips.",
  },
  bars: {
    n: 8,
    name: "Cinematic bars",
    group: "Frame",
    blurb: "Top + bottom bars that slide in on load",
    help: "Height is a share of the screen. 'Hide on scroll' slides them away once the visitor scrolls past 20% of the screen.",
  },
  lut: {
    n: 9,
    name: "LUT / colour grade",
    group: "Film",
    blurb: "Grade every image and video",
    help: "Applies a colour grade to the site's images and videos (not the WebGL hero, which grades itself). Projects can override it below; sections in admin → Sections.",
  },
  cameraShake: {
    n: 10,
    name: "Camera shake",
    group: "Lens",
    blurb: "A hard scroll kicks the frame",
    help: "When the visitor scrolls faster than the threshold, the page shakes and settles. Lower threshold = easier to trigger.",
  },
  depthOfField: {
    n: 11,
    name: "Depth of field",
    group: "Lens",
    blurb: "Blur everything but the centre / the cursor",
    help: "A soft blur around a sharp focus spot. Centre keeps the middle of the screen sharp; cursor follows the pointer. Defaults to sections only (not the hero).",
  },
  motionBlur: {
    n: 12,
    name: "Motion blur",
    group: "Lens",
    blurb: "Blur that grows with scroll speed",
    help: "Stronger toward the top and bottom edges, so the line being read stays clearer.",
  },
  halation: {
    n: 13,
    name: "Halation",
    group: "Film",
    blurb: "Red glow bleeding around highlights",
    help: "The red-orange fringe film gets around bright areas. Applies to images and videos.",
  },
  bloom: {
    n: 14,
    name: "Bloom",
    group: "Film",
    blurb: "Bright areas glow",
    help: "Threshold sets how bright a pixel must be to glow (higher = only the brightest); intensity sets how strongly.",
  },
  letterbox: {
    n: 15,
    name: "Letterbox / aspect",
    group: "Frame",
    blurb: "Matte the screen to 2.39, 16:9, 4:3 or 1:1",
    help: "A matte over the screen in the chosen ratio (pillarbox when the screen is wider). Content isn't cropped — it scrolls under the matte. Per-section ratios live in admin → Sections.",
  },
  timeRemap: {
    n: 16,
    name: "Time remapping",
    group: "Time",
    blurb: "A speed ramp on the smooth scroll",
    help: "Scrolling fast makes the page respond faster; arriving at a section eases into slow motion. Needs smooth scrolling (off under reduced motion).",
  },
  shutterFlash: {
    n: 17,
    name: "Shutter flash",
    group: "Time",
    blurb: "A camera shutter on page transitions",
    help: "A white flash and a shutter blade when moving between pages — like a photo being taken.",
  },
  filmScratch: {
    n: 18,
    name: "Film scratch",
    group: "Film",
    blurb: "Hairline scratches flicker over the frame",
    help: "Mostly vertical scratches with the odd horizontal tear. Defaults to the hero only.",
  },
};

export const EFFECT_GROUPS: readonly EffectGroup[] = ["Film", "Lens", "Video", "Frame", "Time"];
