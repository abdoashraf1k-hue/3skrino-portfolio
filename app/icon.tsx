import { monogram } from "@/lib/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the "3" monogram in lime on black. */
export default function Icon() {
  return monogram(size.width);
}
