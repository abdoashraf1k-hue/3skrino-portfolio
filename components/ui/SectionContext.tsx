"use client";

import { createContext, useContext } from "react";
import type { BentoPattern, SectionId } from "@/data/site-config";

/** What the home layout tells each section: its running number, bento preset and id (for per-section motion). */
export type SectionInfo = { index: string; pattern: BentoPattern; id?: SectionId };

export const SectionContext = createContext<SectionInfo | null>(null);

export function useSectionInfo(): SectionInfo | null {
  return useContext(SectionContext);
}
