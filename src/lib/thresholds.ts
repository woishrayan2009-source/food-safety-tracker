import type { HealthCondition } from "../types";

/**
 * Reference-only weekly limits (mg/g), derived from general public-health guidance
 * (e.g. AHA daily sodium/added-sugar guidance × 7). These are NOT clinical thresholds —
 * they exist to give the user a directional "on track / over" signal on the dashboard,
 * not medical advice. A real deployment should let a clinician configure/override these
 * per user.
 */
const DEFAULT_WEEKLY_SODIUM_MG = 2300 * 7;
const DEFAULT_WEEKLY_SUGAR_G = 36 * 7;

// Conditions that warrant a stricter weekly sodium ceiling.
const SODIUM_SENSITIVE_CONDITIONS: HealthCondition[] = [
  "Hypertension",
  "Chronic Kidney Disease",
];
const REDUCED_WEEKLY_SODIUM_MG = 1500 * 7;

// Conditions that warrant a stricter weekly added-sugar ceiling.
const SUGAR_SENSITIVE_CONDITIONS: HealthCondition[] = [
  "Diabetes",
  "Hyperlipidemia",
];
const REDUCED_WEEKLY_SUGAR_G = 25 * 7;

export interface WeeklyThresholds {
  sodiumLimitMg: number;
  sugarLimitG: number;
}

/**
 * Returns the weekly sodium/sugar reference limits for a user, tightened when their
 * profile lists a relevant health condition.
 */
export function getWeeklyThresholds(
  healthConditions: HealthCondition[]
): WeeklyThresholds {
  const sodiumLimitMg = healthConditions.some((c) =>
    SODIUM_SENSITIVE_CONDITIONS.includes(c)
  )
    ? REDUCED_WEEKLY_SODIUM_MG
    : DEFAULT_WEEKLY_SODIUM_MG;

  const sugarLimitG = healthConditions.some((c) =>
    SUGAR_SENSITIVE_CONDITIONS.includes(c)
  )
    ? REDUCED_WEEKLY_SUGAR_G
    : DEFAULT_WEEKLY_SUGAR_G;

  return { sodiumLimitMg, sugarLimitG };
}
