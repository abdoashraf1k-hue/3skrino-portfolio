/**
 * Frame-loop signals from the hero's DOM layer (brand logos) to the WebGL
 * scene. Plain mutable state — read inside useFrame, never in render.
 */
export const heroSignals = {
  /** How many logos the pointer is over (0 or 1 in practice). */
  hover: 0,
  /** performance.now() of the last logo click — the scene flashes the rim. */
  pulseAt: -Infinity,
};
