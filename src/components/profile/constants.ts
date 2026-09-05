import type { AllergyIntolerance, FitnessGoal, HealthCondition } from "../../types";

// Shared source of truth for the profile form fields, used by both Onboarding.tsx (create)
// and Settings.tsx (edit) via the step components in this folder, so the two flows can never
// drift out of sync with each other.

export const HEALTH_CONDITIONS: HealthCondition[] = [
  "Diabetes",
  "Hypertension",
  "Chronic Kidney Disease",
  "Hyperlipidemia",
  "Acid Reflux",
];

// NOTE: this list drives the Critical Alert engine in the risk-check function — keep option
// values here in sync with the ALLERGEN_KEYWORDS map in netlify/functions/risk-check.js and
// the VALID_ALLERGIES set in netlify/functions/save-profile.js / update-profile.js.
export const ALLERGIES_INTOLERANCES: AllergyIntolerance[] = [
  "Gluten",
  "Dairy/Lactose",
  "Nuts",
  "Soy",
  "Shellfish",
];

export const FITNESS_GOALS: FitnessGoal[] = [
  "Weight Loss",
  "Muscle Gain",
  "Maintenance",
];

export function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
