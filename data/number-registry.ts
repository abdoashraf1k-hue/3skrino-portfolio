/**
 * Every editable number the site reads at runtime: key, bounds and default.
 * admin → Numbers stores only overrides (data/brand.ts → numbers);
 * components read through useNumber() from lib/brand.ts, so a change shows
 * everywhere at once (and instantly in the admin preview).
 */

export type NumberEntry = {
  key: string;
  group: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

const n = (key: string, label: string, def: number, min: number, max: number, step: number, unit?: string): NumberEntry => ({
  key,
  group: key.split(".")[0],
  label,
  default: def,
  min,
  max,
  step,
  unit,
});

export const NUMBER_REGISTRY: readonly NumberEntry[] = [
  n("logos.tiltYaw", "Logo ring yaw", 9, 0, 40, 0.5, "°"),
  n("logos.tiltPitch", "Logo ring pitch", 6, 0, 40, 0.5, "°"),
  n("logos.tiltEase", "Logo ring smoothing", 0.07, 0.01, 0.5, 0.01),
  n("logos.depth", "Logo ring depth", 140, 0, 600, 10, "px"),
  n("home.aiCount", "AI Cuts shown on home", 4, 1, 12, 1),
  n("confrontation.breathSeconds", "Breath cycle", 4.2, 2, 10, 0.1, "s"),
  n("confrontation.trackEase", "Head-tracking smoothing", 0.12, 0.02, 0.5, 0.01),
  n("confrontation.crossfade", "Pose crossfade", 180, 0, 800, 10, "ms"),
  n("interview.lipFlap", "Lip-flap interval", 140, 60, 400, 10, "ms"),
  n("interview.wordsPerSecond", "Subtitle speed without voice", 3.2, 1, 8, 0.1, "w/s"),
  n("interview.waveBars", "Waveform bars", 28, 8, 64, 1),
  n("signature.timecodeFps", "Timecode frame rate", 24, 12, 60, 1, "fps"),
  n("signature.magnetStrength", "Magnetic CTA pull", 0.25, 0, 0.6, 0.01),
];

export const NUMBER_BY_KEY: ReadonlyMap<string, NumberEntry> = new Map(NUMBER_REGISTRY.map((x) => [x.key, x]));
