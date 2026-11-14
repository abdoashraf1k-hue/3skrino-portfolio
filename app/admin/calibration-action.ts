"use server";

import type { HeroConfig } from "@/data/hero-config";
import { CALIBRATION_RANGE, TURN_RANGE, TURN_WEIGHT } from "@/data/hero-defaults";
import { isValidAdminKey } from "@/lib/admin/auth";
import { readHero, writeHero } from "@/lib/admin/hero-file";

/**
 * Sprint 15.5 / 15.6 — persists the Genesis mouse → angle calibration on its
 * own: reads data/hero-config.ts from the branch head, changes only
 * genesis.calibrationOffset / turnRange / turnWeight, and commits it through the same validated
 * writer as the admin's Save (with its backup). Other unsaved admin edits
 * are not part of this commit. Server Functions are reachable by direct POST,
 * so the admin key is checked here.
 */
export type CalibrationResult = { ok: true; config: HeroConfig; offset: number; range: number; weight: number } | { ok: false; error: string };

export type TurnCalibration = { offset: number; range: number; weight: number };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function saveCalibration(adminKey: string, turn: TurnCalibration): Promise<CalibrationResult> {
  if (!isValidAdminKey(adminKey)) return { ok: false, error: "Unauthorized" };
  if (!turn || !finite(turn.offset) || !finite(turn.range) || !finite(turn.weight)) return { ok: false, error: "Calibration values must be numbers" };
  const offset = Math.round(clamp(turn.offset, -CALIBRATION_RANGE, CALIBRATION_RANGE) * 2) / 2;
  const range = Math.round(clamp(turn.range, TURN_RANGE.min, TURN_RANGE.max));
  const weight = Math.round(clamp(turn.weight, TURN_WEIGHT.min, TURN_WEIGHT.max));
  try {
    const { config } = await readHero();
    const next: HeroConfig = { ...config, genesis: { ...config.genesis, calibrationOffset: offset, turnRange: range, turnWeight: weight } };
    const saved = await writeHero(next, `admin: calibrate hero turn (${offset > 0 ? "+" : ""}${offset}°, ±${range}°, weight ${weight})`);
    return { ok: true, config: saved.config, offset, range, weight };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the calibration" };
  }
}
