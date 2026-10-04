import type { LutPreset } from "@/data/site-config";

/**
 * Colour-grade presets (admin → Effects → LUT). Graded presets are an SVG
 * colour matrix plus a CSS filter tail; bleach bypass and noir are pure CSS.
 * Shared by the site's FX layer and the admin's swatches.
 */

/** Rows R, G, B, A (5 columns each). */
export const LUT_MATRIX: Partial<Record<LutPreset, string>> = {
  "teal-orange": "1.12 0.06 -0.08 0 0.01  -0.02 1.0 0.06 0 0  -0.12 0.12 1.02 0 0.03  0 0 0 1 0",
  kodak: "1.06 0.04 0 0 0.01  0.02 1.0 0 0 0  0 0.05 0.9 0 0.025  0 0 0 1 0",
  warm: "1.08 0.04 0 0 0.02  0 1.02 0 0 0.01  0 0 0.86 0 -0.01  0 0 0 1 0",
  cool: "0.88 0 0.02 0 0  0 0.99 0.03 0 0.01  0.02 0.05 1.12 0 0.03  0 0 0 1 0",
  vintage: "0.9 0.08 0.02 0 0.05  0.05 0.85 0.05 0 0.04  0.04 0.06 0.7 0 0.05  0 0 0 1 0",
};

export const LUT_CSS: Record<LutPreset, string> = {
  none: "",
  "teal-orange": "contrast(1.08) saturate(1.18)",
  bleach: "saturate(0.45) contrast(1.35) brightness(1.04)",
  kodak: "contrast(1.12) saturate(1.08)",
  noir: "grayscale(1) contrast(1.4) brightness(0.92)",
  warm: "saturate(1.08)",
  cool: "saturate(0.92) brightness(1.02)",
  vintage: "contrast(0.9) saturate(0.85)",
};

export const LUT_LABELS: Record<LutPreset, string> = {
  none: "None",
  "teal-orange": "Teal & Orange",
  bleach: "Bleach bypass",
  kodak: "Kodak 2383",
  noir: "Noir",
  warm: "Warm",
  cool: "Cool",
  vintage: "Vintage",
};

/** The CSS `filter` value for a preset (needs <LutDefs> on the page for the matrix part). */
export function lutFilter(preset: LutPreset): string {
  return [LUT_MATRIX[preset] ? `url(#fx-lut-${preset})` : "", LUT_CSS[preset]].filter(Boolean).join(" ");
}

/** The SVG colour matrices for `presets` (every graded preset when omitted). */
export function LutDefs({ presets }: { presets?: Iterable<LutPreset> }) {
  const list = presets ? [...new Set(presets)] : (Object.keys(LUT_MATRIX) as LutPreset[]);
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {list.map((p) =>
          LUT_MATRIX[p] ? (
            <filter key={p} id={`fx-lut-${p}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={LUT_MATRIX[p]} />
            </filter>
          ) : null,
        )}
      </defs>
    </svg>
  );
}
