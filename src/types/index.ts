export type Gender = "Male" | "Female" | "Other";

export type HealthCondition =
  | "Diabetes"
  | "Hypertension"
  | "Chronic Kidney Disease"
  | "Hyperlipidemia"
  | "Acid Reflux";

// NOTE: this list drives the Critical Alert engine in the risk-check function later — keep
// values here in sync with the ALLERGEN_KEYWORDS map in netlify/functions/risk-check.js
// (built in Prompt 5).
export type AllergyIntolerance =
  | "Gluten"
  | "Dairy/Lactose"
  | "Nuts"
  | "Soy"
  | "Shellfish";

export type FitnessGoal = "Weight Loss" | "Muscle Gain" | "Maintenance";

export interface UserProfile {
  /** Supabase auth user id — also the primary key of the `profiles` table. */
  id: string;
  name: string;
  age: number;
  gender: Gender;
  health_conditions: HealthCondition[];
  allergies_intolerances: AllergyIntolerance[];
  fitness_goals: FitnessGoal;
}

export type RiskLevel = "low" | "moderate" | "high" | "critical";

/**
 * A single row of the `food_logs` table (written by explain-result.js).
 * Declared here ahead of time so Dashboard.tsx, History.tsx, get-summary.js, and
 * get-history.js all agree on the shape.
 *
 * triggered_rules / explanation / alternatives are stored at scan time so that History.tsx
 * and Result.tsx can re-render the exact verdict the user saw, without re-running
 * risk-check.js (whose thresholds, or the user's profile, may have changed since). See the
 * TODO in History.tsx about an explicit "Re-check with current profile" action instead.
 */
export interface FoodLogEntry {
  id: string;
  user_id: string;
  food_name: string;
  created_at: string;
  risk_level: RiskLevel;
  sodium_mg: number;
  added_sugars_g: number;
  saturated_fat_g: number;
  triggered_rules: TriggeredRule[];
  explanation: string | null;
  alternatives: string[];
}

/** Response shape returned by netlify/functions/get-history.js. */
export interface PaginatedFoodLogs {
  entries: FoodLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Response shape returned by netlify/functions/get-summary.js */
export interface WeeklySummary {
  totalItems: number;
  flaggedCount: number;
  sodiumTotal: number;
  sugarTotal: number;
  satFatTotal: number;
}

/** Response shape returned by netlify/functions/weekly-digest.js */
export interface WeeklyDigestResponse {
  digest: string;
  summary: WeeklySummary;
  generatedAt: string;
}

export type ProductType =
  | "Packaged Goods"
  | "Restaurant Item"
  | "Fresh Produce"
  | "Home Cooked"
  | "Other";

export type FoodItemSource = "barcode" | "ocr" | "manual";

/**
 * The internal representation of a resolved food item, however it was captured
 * (barcode lookup, OCR label parse, or manual search). Produced by
 * lookup-barcode.js / parse-label.js / search-food.js and consumed by Capture.tsx.
 */
export interface FoodItem {
  /** Barcode for scanned items, a generated id for OCR results, or the food_database row id. */
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  serving_size?: string;
  calories_per_serving: number;
  sodium_mg: number;
  added_sugars_g: number;
  saturated_fat_g: number;
  trans_fat_g: number;
  ingredients_list: string[];
  product_type: ProductType;
  source: FoodItemSource;
}

/** A single rule fired by netlify/functions/risk-check.js's deterministic rule engine. */
export interface TriggeredRule {
  /** Machine-readable rule id, e.g. "allergen_match", "chronic_sodium", "general_trans_fat". */
  rule: string;
  riskLevel: RiskLevel;
  /** Human/AI-readable explanation of why this rule fired. */
  message: string;
}

/** Response shape returned by netlify/functions/risk-check.js. */
export interface RiskCheckResult {
  riskLevel: RiskLevel;
  triggeredRules: TriggeredRule[];
  rawFoodItem: FoodItem;
}

/** Response shape returned by netlify/functions/explain-result.js. */
export interface ExplainResultResponse {
  explanation: string;
  alternatives: string[];
  /** Whether the food_logs row was successfully written (false until Prompt 6's table exists). */
  logged: boolean;
}
