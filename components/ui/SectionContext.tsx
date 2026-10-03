"use client";

import { createContext, useContext } from "react";
import type { BentoPattern } from "@/data/site-config";

/** What the home layout tells each section: its running number and bento preset. */
export type SectionInfo = { index: string; pattern: BentoPattern };

export const SectionContext = createContext<SectionInfo | null>(null);

export function useSectionInfo(): SectionInfo | null {
  return useContext(SectionContext);
}
