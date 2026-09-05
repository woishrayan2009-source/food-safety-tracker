// netlify/functions/lib/weeklySummary.js
//
// Shared 7-day `food_logs` aggregation, used by both get-summary.js (Dashboard) and
// weekly-digest.js (AI weekly digest) so the two call sites can never drift — one query,
// one reduce, reused rather than duplicated. Pulled out of get-summary.js in Prompt 7.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// General, non-personalized reference limits (AHA daily sodium/added-sugar guidance × 7).
// Kept in sync by hand with the DEFAULT_WEEKLY_* constants in src/lib/thresholds.ts — this
// file intentionally does NOT compute the condition-tightened limits thresholds.ts does,
// since that would require reading health_conditions, and weekly-digest.js is deliberately
// restricted to numbers with no health/PII context attached (see its file header).
const DEFAULT_WEEKLY_SODIUM_LIMIT_MG = 2300 * 7;
const DEFAULT_WEEKLY_SUGAR_LIMIT_G = 36 * 7;

const EMPTY_SUMMARY = {
  totalItems: 0,
  flaggedCount: 0,
  sodiumTotal: 0,
  sugarTotal: 0,
  satFatTotal: 0,
};

/**
 * Returns the 7-day nutrient rollup for a single user, or a zeroed-out summary if the query
 * fails (e.g. the `food_logs` table/migration doesn't exist yet) — callers should treat that
 * the same as "no scans this week" rather than surfacing an error, matching the existing
 * get-summary.js behavior.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin - service-role client
 * @param {string} userId
 */
async function getWeeklySummary(supabaseAdmin, userId) {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const { data: entries, error } = await supabaseAdmin
    .from("food_logs")
    .select("sodium_mg, added_sugars_g, saturated_fat_g, risk_level")
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    // Expected until the food_logs table/migration exists — degrade gracefully.
    console.warn("weeklySummary: food_logs query failed —", error.message);
    return { ...EMPTY_SUMMARY };
  }

  return (entries || []).reduce(
    (acc, entry) => {
      acc.totalItems += 1;
      acc.sodiumTotal += entry.sodium_mg || 0;
      acc.sugarTotal += entry.added_sugars_g || 0;
      acc.satFatTotal += entry.saturated_fat_g || 0;
      if (entry.risk_level === "high" || entry.risk_level === "critical") {
        acc.flaggedCount += 1;
      }
      return acc;
    },
    { ...EMPTY_SUMMARY }
  );
}

export {
  getWeeklySummary,
  EMPTY_SUMMARY,
  DEFAULT_WEEKLY_SODIUM_LIMIT_MG,
  DEFAULT_WEEKLY_SUGAR_LIMIT_G,
};
