// netlify/functions/explain-result.js
//
// THE AI EXPLANATION LAYER. Takes the output of risk-check.js (never raw food data alone —
// the AI only ever sees riskLevel + triggeredRules + the item's name, not the full nutrition
// breakdown) and asks the AI to turn it into a short, plain-language explanation plus 1-2
// alternative food suggestions. The AI is explicitly instructed to only explain the rules it's
// given, not invent new risk factors — risk-check.js already made every safety-relevant
// decision; this file just translates that decision into something a person can read.
//
// Also writes the food log entry to Supabase's `food_logs` table, since src/pages/Capture.tsx
// currently has nowhere durable to persist a resolved item (log-food.js from Prompt 6 doesn't
// exist yet). Dashboard.tsx and History read from `food_logs`, so this is the one place that
// needs to reliably write to it, regardless of whether the AI explanation step succeeds.
//
// TODO (manual): the `food_logs` table doesn't exist yet. Create it in the Supabase dashboard
// (or a migration) with at least these columns before logging will actually persist anything:
//   id uuid primary key default gen_random_uuid()
//   user_id uuid references auth.users not null
//   food_name text not null
//   risk_level text not null            -- "low" | "moderate" | "high" | "critical"
//   sodium_mg numeric not null default 0
//   added_sugars_g numeric not null default 0
//   saturated_fat_g numeric not null default 0
//   triggered_rules jsonb not null default '[]'   -- TriggeredRule[], for History/Result replay
//   explanation text                              -- null if the AI step failed/was skipped
//   alternatives jsonb not null default '[]'      -- string[]
//   created_at timestamptz not null default now()
// Also add RLS policies so a user can only select/insert their own rows (auth.uid() = user_id).
// Until this exists, this function still returns a real explanation, it just can't save the
// entry (see the try/catch around the Supabase insert below).

import { createClient } from "@supabase/supabase-js";

// Using Google's Gemini API (generateContent). The model name is part of the URL path, not
// the request body — see the API key appended as a query param in generateAiExplanation().
const AI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const VALID_RISK_LEVELS = ["low", "moderate", "high", "critical"];

const FALLBACK_ALTERNATIVES = [
  "a fresh, unprocessed option (fruit, vegetables, or a home-cooked meal)",
  "a lower-sodium or lower-sugar version of the same food, if one is available",
];

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the user id. Mirrors
 * the same pattern used in netlify/functions/get-summary.js — never trust a user id the
 * client sends in the request body, since this function writes data on the user's behalf.
 */
async function getUserIdFromAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY in the function's environment.");
  }

  const supabaseAuth = createClient(getSupabaseUrl(), anonKey);
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user.id;
}

function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in the function's environment.");
  }
  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isValidRiskCheckResult(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (!VALID_RISK_LEVELS.includes(candidate.riskLevel)) return false;
  if (!Array.isArray(candidate.triggeredRules)) return false;
  if (!candidate.rawFoodItem || typeof candidate.rawFoodItem.name !== "string") {
    return false;
  }
  return true;
}

/**
 * Builds the AI prompt from ONLY riskLevel + triggeredRules + the item's name — deliberately
 * withholding the rest of the raw nutrition data so the model can't reach past what
 * risk-check.js already decided and surface a "new" risk factor of its own.
 */
function buildExplanationPrompt(foodName, riskLevel, triggeredRules) {
  const rulesText =
    triggeredRules.length > 0
      ? triggeredRules.map((r) => `- ${r.message}`).join("\n")
      : "- No specific rules were triggered; this item is within general reference thresholds.";

  return `A food safety app already ran a deterministic rule engine on a food item and reached
a verdict. Your only job is to explain that verdict in plain, reassuring-but-honest language
for a general audience, and suggest 1-2 alternative TYPES of food (not specific brands).

Food item name: "${foodName}"
Risk level already decided: ${riskLevel}
Rules that were triggered (this is the ONLY evidence you may use):
${rulesText}

Strict instructions:
- Only explain the rules listed above. Do NOT invent, infer, or mention any risk factor,
  ingredient, or nutrition detail that isn't stated in those rules.
- Do not change or second-guess the risk level — treat it as already decided.
- Keep the explanation to 2-3 short sentences, plain language, no jargon.
- Suggest 1-2 alternative food TYPES (e.g. "a grilled chicken salad", not a brand name).

Return ONLY a single JSON object — no prose, no markdown code fences — matching exactly:
{
  "explanation": string,
  "alternatives": string[]
}`;
}

/**
 * Calls the AI API and returns { explanation, alternatives }, or null if the call failed or
 * the response didn't match the expected shape. Callers should fall back to a deterministic
 * explanation built directly from triggeredRules when this returns null, so a missing/invalid
 * AI_API_KEY or a flaky API never breaks the Result page.
 */
async function generateAiExplanation(foodName, riskLevel, triggeredRules) {
  const aiApiKey = process.env.AI_API_KEY;
  if (!aiApiKey) {
    console.warn("explain-result: missing AI_API_KEY, using fallback explanation.");
    return null;
  }

  let res;
  try {
    res = await fetch(`${AI_API_ENDPOINT}?key=${aiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildExplanationPrompt(foodName, riskLevel, triggeredRules) },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 500 },
      }),
    });
  } catch (err) {
    console.error("explain-result: AI request failed —", err.message);
    return null;
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`explain-result: AI request failed with status ${res.status} —`, errorBody);
    return null;
  }

  const data = await res.json();
  const rawOutput = (
    data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  ).trim();
  const cleaned = rawOutput.replace(/^```json\s*|^```\s*|```$/gm, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("explain-result: AI response wasn't valid JSON.");
    return null;
  }

  if (
    typeof parsed.explanation !== "string" ||
    !parsed.explanation.trim() ||
    !Array.isArray(parsed.alternatives)
  ) {
    console.error("explain-result: AI response didn't match the expected shape.");
    return null;
  }

  return {
    explanation: parsed.explanation.trim(),
    alternatives: parsed.alternatives.filter((a) => typeof a === "string" && a.trim()),
  };
}

/**
 * Deterministic fallback used when the AI step is unavailable or fails — built straight from
 * the same triggeredRules the AI would have explained, so the page never has nothing to show.
 */
function buildFallbackExplanation(riskLevel, triggeredRules) {
  const explanation =
    triggeredRules.length > 0
      ? triggeredRules.map((r) => r.message).join(" ")
      : `No specific risk factors were flagged for this item (risk level: ${riskLevel}).`;

  return { explanation, alternatives: FALLBACK_ALTERNATIVES };
}

/**
 * Writes the resolved food + verdict to `food_logs`. Failures are logged and swallowed rather
 * than thrown — the Result page should still show the verdict/explanation even if the log
 * table isn't set up yet (see the TODO at the top of this file).
 *
 * Stores triggered_rules/explanation/alternatives alongside the verdict, not just the risk
 * level — History.tsx and Result.tsx read these back verbatim for old entries (Prompt 6)
 * instead of re-running risk-check.js, so a scan's verdict stays a fixed point-in-time record
 * even if the user's profile or the rule thresholds change later.
 */
async function logFoodEntry(userId, riskCheckResult, explanation, alternatives) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("explain-result: server misconfigured —", err.message);
    return false;
  }

  const { rawFoodItem, riskLevel, triggeredRules } = riskCheckResult;

  const { error } = await supabaseAdmin.from("food_logs").insert({
    user_id: userId,
    food_name: rawFoodItem.name,
    risk_level: riskLevel,
    sodium_mg: rawFoodItem.sodium_mg ?? 0,
    added_sugars_g: rawFoodItem.added_sugars_g ?? 0,
    saturated_fat_g: rawFoodItem.saturated_fat_g ?? 0,
    triggered_rules: triggeredRules ?? [],
    explanation: explanation ?? null,
    alternatives: alternatives ?? [],
    created_at: new Date().toISOString(),
  });

  if (error) {
    // Expected until the food_logs table/migration from Prompt 6 exists.
    console.warn("explain-result: food_logs insert failed —", error.message);
    return false;
  }

  return true;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  let userId;
  try {
    userId = await getUserIdFromAuthHeader(
      event.headers.authorization || event.headers.Authorization
    );
  } catch (err) {
    console.error("explain-result: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Missing or invalid Authorization header." }),
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

  const { riskCheckResult } = body;
  if (!isValidRiskCheckResult(riskCheckResult)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "riskCheckResult is required and must be the object returned by risk-check.js.",
      }),
    };
  }

  const { riskLevel, triggeredRules, rawFoodItem } = riskCheckResult;

  const aiResult = await generateAiExplanation(rawFoodItem.name, riskLevel, triggeredRules);
  const { explanation, alternatives } =
    aiResult || buildFallbackExplanation(riskLevel, triggeredRules);

  const logged = await logFoodEntry(userId, riskCheckResult, explanation, alternatives);

  return {
    statusCode: 200,
    body: JSON.stringify({
      explanation,
      alternatives,
      logged,
    }),
  };
};
