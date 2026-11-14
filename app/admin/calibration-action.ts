"use server";

import type { HeroConfig } from "@/data/hero-config";
import { CALIBRATION_RANGE } from "@/data/hero-defaults";
import { isValidAdminKey } from "@/lib/admin/auth";
import { readHero, writeHero } from "@/lib/admin/hero-file";

/**
 * Sprint 15.5 — persists the Genesis mouse → angle calibration on its own:
 * reads data/hero-config.ts from the branch head, changes only
 * genesis.calibrationOffset, and commits it through the same validated
 * writer as the admin's Save (with its backup). Other unsaved admin edits
 * are not part of this commit. Server Functions are reachable by direct POST,
 * so the admin key is checked here.
 */
export type CalibrationResult = { ok: true; config: HeroConfig; offset: number } | { ok: false; error: string };

export async function saveCalibration(adminKey: string, offset: number): Promise<CalibrationResult> {
  if (!isValidAdminKey(adminKey)) return { ok: false, error: "Unauthorized" };
  if (typeof offset !== "number" || !Number.isFinite(offset)) return { ok: false, error: "Calibration must be a number of degrees" };
  const value = Math.round(Math.min(CALIBRATION_RANGE, Math.max(-CALIBRATION_RANGE, offset)) * 2) / 2;
  try {
    const { config } = await readHero();
    const next: HeroConfig = { ...config, genesis: { ...config.genesis, calibrationOffset: value } };
    const saved = await writeHero(next, `admin: calibrate hero (${value > 0 ? "+" : ""}${value}°)`);
    return { ok: true, config: saved.config, offset: value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the calibration" };
  }
}
