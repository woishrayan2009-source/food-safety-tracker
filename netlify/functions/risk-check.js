// netlify/functions/risk-check.js
//
// THE DETERMINISTIC RULE ENGINE. No AI calls anywhere in this file — every decision here is
// a plain, explainable rule against fixed thresholds, so it's cheap, fast, and (critically)
// unit-testable without mocking a network call. explain-result.js is the only place that talks
// to an AI, and it's only allowed to *explain* what this file already decided, never to
// override it.
//
// Exports `assessRisk(userProfile, foodItem)` as a pure function (no I/O) for unit tests, plus
// the Netlify `handler` that wraps it for HTTP.

// ── Step 1: Critical Alerts (allergens) ─────────────────────────────────────────────────────
//
// TODO (manual): expand ALLERGEN_KEYWORDS carefully for your target market's ingredient naming
// conventions (e.g. Indian packaged food labels often use different terms, like "maida" for
// refined wheat flour, or "til" for sesame). This keyword list is the single most
// safety-critical part of the app — a missed synonym here means a real allergic reaction slips
// through as "safe". Review it by hand with someone who knows the target market's labeling
// conventions before relying on it for anything beyond a demo.
//
// Keep the keys in sync with the AllergyIntolerance type in src/types/index.ts and the
// VALID_ALLERGIES set in netlify/functions/save-profile.js.
const ALLERGEN_KEYWORDS = {
  Nuts: [
    "peanut",
    "peanuts",
    "almond",
    "almonds",
    "cashew",
    "cashews",
    "walnut",
    "walnuts",
    "pecan",
    "pecans",
    "pistachio",
    "pistachios",
    "hazelnut",
    "hazelnuts",
    "macadamia",
    "brazil nut",
    "pine nut",
    "nut butter",
  ],
  "Dairy/Lactose": [
    "milk",
    "cream",
    "butter",
    "cheese",
    "whey",
    "casein",
    "lactose",
    "yogurt",
    "ghee",
  ],
  Gluten: [
    "wheat",
    "barley",
    "rye",
    "malt",
    "gluten",
    "semolina",
    "spelt",
    "farina",
    "triticale",
  ],
  Soy: ["soy", "soybean", "soya", "edamame", "tofu", "tempeh"],
  Shellfish: [
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "crawfish",
    "crayfish",
    "scallop",
    "oyster",
    "clam",
    "mussel",
    "squid",
    "octopus",
  ],
};

// ── Step 2: Chronic Condition Matching ──────────────────────────────────────────────────────
//
// Reference-only single-item thresholds (NOT clinical guidance — see the disclaimer shown on
// the Result page). Named constants so these are easy to tune later without hunting through
// logic.
const DAILY_SODIUM_LIMIT_MG = 2300; // AHA general daily sodium guidance
const HYPERTENSION_SODIUM_THRESHOLD_PCT = 0.2; // flag a single item over 20% of that daily limit
const HYPERTENSION_SODIUM_THRESHOLD_MG =
  DAILY_SODIUM_LIMIT_MG * HYPERTENSION_SODIUM_THRESHOLD_PCT; // 460mg

const DIABETES_ADDED_SUGAR_THRESHOLD_G = 15; // single-item added-sugar flag for diabetic users

const SODIUM_SENSITIVE_CONDITIONS = ["Hypertension", "Chronic Kidney Disease"];
const SUGAR_SENSITIVE_CONDITIONS = ["Diabetes", "Hyperlipidemia"];

// ── Step 3: General Long-Term Risk (no matching chronic condition triggered) ───────────────
//
// Fallback thresholds applied when Step 2 didn't already flag the item — either because the
// user has no relevant condition on file, or because this particular item didn't cross a
// condition-specific threshold. Every item still gets checked against general long-term-risk
// factors so nothing with, say, a full day's trans fat in one serving slips through as "low".
const TRANS_FAT_FLAG_G = 0.5; // FDA rounds <0.5g to "0g" on labels; treat >=0.5g as present
const HIGH_SATURATED_FAT_G = 6; // ~30% of a 20g/day reference intake, in a single serving
const HIGH_CALORIE_DENSITY = 600; // calories in a single serving

const RISK_LEVEL_RANK = { low: 0, moderate: 1, high: 2, critical: 3 };

/**
 * Returns the triggered allergen rule, or null if none of the user's allergies/intolerances
 * appear in the food's ingredient list.
 */
function checkCriticalAllergens(userProfile, foodItem) {
  const allergies = userProfile?.allergies_intolerances || [];
  const ingredients = foodItem?.ingredients_list || [];

  for (const allergy of allergies) {
    const keywords = ALLERGEN_KEYWORDS[allergy];
    if (!keywords) continue; // Unknown allergy label — nothing to match against.

    for (const ingredient of ingredients) {
      const ingredientLower = String(ingredient).toLowerCase();
      const matchedKeyword = keywords.find((keyword) =>
        ingredientLower.includes(keyword)
      );
      if (matchedKeyword) {
        return {
          rule: "allergen_match",
          riskLevel: "critical",
          message: `Ingredient "${ingredient}" appears to contain ${allergy.toLowerCase()} (matched "${matchedKeyword}"), which is on your allergy/intolerance list.`,
        };
      }
    }
  }

  return null;
}

/**
 * Returns all triggered chronic-condition rules (there can be more than one, e.g. a user
 * with both Diabetes and Hypertension eating something high in both sodium and sugar).
 */
function checkChronicConditions(userProfile, foodItem) {
  const conditions = userProfile?.health_conditions || [];
  const rules = [];

  const hasSodiumSensitiveCondition = conditions.some((c) =>
    SODIUM_SENSITIVE_CONDITIONS.includes(c)
  );
  if (
    hasSodiumSensitiveCondition &&
    (foodItem?.sodium_mg || 0) > HYPERTENSION_SODIUM_THRESHOLD_MG
  ) {
    rules.push({
      rule: "chronic_sodium",
      riskLevel: "high",
      message: `Sodium content (${foodItem.sodium_mg}mg) is above ${Math.round(
        HYPERTENSION_SODIUM_THRESHOLD_PCT * 100
      )}% of the general daily limit (${HYPERTENSION_SODIUM_THRESHOLD_MG}mg) — flagged because your profile lists a sodium-sensitive condition.`,
    });
  }

  const hasSugarSensitiveCondition = conditions.some((c) =>
    SUGAR_SENSITIVE_CONDITIONS.includes(c)
  );
  if (
    hasSugarSensitiveCondition &&
    (foodItem?.added_sugars_g || 0) > DIABETES_ADDED_SUGAR_THRESHOLD_G
  ) {
    rules.push({
      rule: "chronic_added_sugar",
      riskLevel: "high",
      message: `Added sugar content (${foodItem.added_sugars_g}g) is above the ${DIABETES_ADDED_SUGAR_THRESHOLD_G}g single-item threshold — flagged because your profile lists a sugar-sensitive condition.`,
    });
  }

  return rules;
}

/**
 * Returns all triggered general long-term-risk rules, evaluated against fixed thresholds
 * that apply regardless of the user's specific health conditions.
 */
function checkGeneralRisk(foodItem) {
  const rules = [];

  if ((foodItem?.trans_fat_g || 0) >= TRANS_FAT_FLAG_G) {
    rules.push({
      rule: "general_trans_fat",
      riskLevel: "high",
      message: `Contains ${foodItem.trans_fat_g}g of trans fat. Trans fat has no established safe intake level.`,
    });
  }

  if ((foodItem?.saturated_fat_g || 0) > HIGH_SATURATED_FAT_G) {
    rules.push({
      rule: "general_saturated_fat",
      riskLevel: "moderate",
      message: `Saturated fat content (${foodItem.saturated_fat_g}g) is high for a single serving (over ${HIGH_SATURATED_FAT_G}g).`,
    });
  }

  if ((foodItem?.calories_per_serving || 0) > HIGH_CALORIE_DENSITY) {
    rules.push({
      rule: "general_calorie_density",
      riskLevel: "moderate",
      message: `Calorie content (${foodItem.calories_per_serving} cal) is high for a single serving (over ${HIGH_CALORIE_DENSITY} cal).`,
    });
  }

  return rules;
}

function highestRiskLevel(rules) {
  return rules.reduce(
    (highest, rule) =>
      RISK_LEVEL_RANK[rule.riskLevel] > RISK_LEVEL_RANK[highest]
        ? rule.riskLevel
        : highest,
    "low"
  );
}

/**
 * Pure, deterministic risk assessment. No I/O, no randomness, no AI calls — safe to unit test
 * directly with plain objects.
 *
 * @param {object} userProfile - Shape of src/types/index.ts UserProfile.
 * @param {object} foodItem - Shape of src/types/index.ts FoodItem.
 * @returns {{ riskLevel: "low"|"moderate"|"high"|"critical", triggeredRules: object[], rawFoodItem: object }}
 */
function assessRisk(userProfile, foodItem) {
  // Step 1 — Critical Alerts. Any allergen match wins immediately; skip everything else.
  const allergenRule = checkCriticalAllergens(userProfile, foodItem);
  if (allergenRule) {
    return {
      riskLevel: "critical",
      triggeredRules: [allergenRule],
      rawFoodItem: foodItem,
    };
  }

  // Step 2 — Chronic Condition Matching.
  const chronicRules = checkChronicConditions(userProfile, foodItem);
  if (chronicRules.length > 0) {
    return {
      riskLevel: highestRiskLevel(chronicRules),
      triggeredRules: chronicRules,
      rawFoodItem: foodItem,
    };
  }

  // Step 3 — General Long-Term Risk (nothing condition-specific fired above).
  const generalRules = checkGeneralRisk(foodItem);
  return {
    riskLevel: highestRiskLevel(generalRules),
    triggeredRules: generalRules,
    rawFoodItem: foodItem,
  };
}

function isValidFoodItemForRiskCheck(foodItem) {
  if (!foodItem || typeof foodItem !== "object") return false;
  if (typeof foodItem.name !== "string" || !foodItem.name.trim()) return false;
  if (!Array.isArray(foodItem.ingredients_list)) return false;
  const numericFields = [
    "calories_per_serving",
    "sodium_mg",
    "added_sugars_g",
    "saturated_fat_g",
    "trans_fat_g",
  ];
  return numericFields.every(
    (field) =>
      typeof foodItem[field] === "number" && Number.isFinite(foodItem[field])
  );
}

function isValidUserProfileForRiskCheck(userProfile) {
  if (!userProfile || typeof userProfile !== "object") return false;
  return (
    Array.isArray(userProfile.health_conditions) &&
    Array.isArray(userProfile.allergies_intolerances)
  );
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Request body must be valid JSON." }),
    };
  }

  const { userProfile, foodItem } = body;

  if (!isValidUserProfileForRiskCheck(userProfile)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "userProfile is required and must include health_conditions and allergies_intolerances arrays.",
      }),
    };
  }

  if (!isValidFoodItemForRiskCheck(foodItem)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "foodItem is required and must include name, ingredients_list, and numeric nutrition fields.",
      }),
    };
  }

  const result = assessRisk(userProfile, foodItem);

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};

// Exported for unit tests (e.g. `import { assessRisk } from "./risk-check.js"`).
export { assessRisk, ALLERGEN_KEYWORDS };
