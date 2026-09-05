// netlify/functions/weekly-digest.js
//
// THE AI WEEKLY DIGEST. Reuses get-summary.js's aggregation logic (./lib/weeklySummary.js —
// imported, not duplicated) to get the current user's 7-day nutrient rollup, then asks the
// AI to turn those numbers into a short "what went well / one thing to watch / for next
// week" digest.
//
// PRIVACY: the AI only ever sees the aggregated numbers (item counts, mg/g totals) plus
// general, non-personalized reference limits — never the user's name, email, individual
// food items, or health conditions. Same "AI only explains numbers it's handed, never sees
// raw PII" pattern as explain-result.js.
//
// This runs on-demand (Suggestions.tsx's initial load + its "Refresh" button), computed
// fresh every call rather than cached/stored anywhere.
//
// TODO (manual): if you want this to run automatically (e.g. every Sunday) rather than
// on-demand when the user visits the page, set up a Netlify Scheduled Function
// (netlify/functions/weekly-digest-cron.js with a `schedule` export) — see Netlify's
// scheduled functions docs. Requires a paid Netlify plan for scheduled functions.

import { createClient } from "@supabase/supabase-js";
import {
  getWeeklySummary,
  DEFAULT_WEEKLY_SODIUM_LIMIT_MG,
  DEFAULT_WEEKLY_SUGAR_LIMIT_G,
} from "./lib/weeklySummary.js";

// Using Google's Gemini API (generateContent). The model name is part of the URL path, not
// the request body — see the API key appended as a query param in generateAiDigest().
const AI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the user id. Mirrors
 * the same pattern used in get-summary.js / explain-result.js.
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

/**
 * Builds the AI prompt from ONLY the aggregated weekly numbers + general reference limits —
 * no name, email, individual food items, or health conditions ever reach the model.
 */
function buildDigestPrompt(summary) {
  return `You write short, plain-language weekly nutrition digests for a food-safety tracking
app. You are given ONLY one user's aggregated totals for the last 7 days — no name, no
individual food items, no health information — so treat these purely as statistics.

This week's totals:
- Items scanned: ${summary.totalItems}
- Items flagged high/critical risk: ${summary.flaggedCount}
- Total sodium: ${summary.sodiumTotal}mg (general weekly reference limit: ${DEFAULT_WEEKLY_SODIUM_LIMIT_MG}mg)
- Total added sugar: ${summary.sugarTotal}g (general weekly reference limit: ${DEFAULT_WEEKLY_SUGAR_LIMIT_G}g)
- Total saturated fat: ${summary.satFatTotal}g

Write a digest with exactly three short sentences, in this order:
1. What went well — grounded only in the numbers above. If totalItems is 0, say there's
   nothing to report yet instead of inventing a positive.
2. One thing to watch — name the single most notable number above (or say nothing stood out
   if everything looks reasonable). Don't repeat every number, just the most relevant one.
3. One concrete, general suggestion for next week — a food-choice habit, not a specific
   brand, product, or medical/clinical advice.

Strict instructions:
- Do NOT invent facts, foods, or numbers beyond what's given above.
- Do NOT give medical advice or diagnose anything.
- Plain language, second person ("you"), no headers, no markdown, no emoji.
- Keep the whole digest under 80 words.

Return ONLY a single JSON object — no prose, no markdown code fences — matching exactly:
{
  "digest": string
}`;
}

/**
 * Deterministic fallback used when the AI step is unavailable or fails — built straight from
 * the same summary numbers the AI would have used, so the page never has nothing to show.
 */
function buildFallbackDigest(summary) {
  if (summary.totalItems === 0) {
    return "You haven't logged any scans this week — scan a food item to start building your weekly digest.";
  }

  const sodiumOver = summary.sodiumTotal > DEFAULT_WEEKLY_SODIUM_LIMIT_MG;
  const sugarOver = summary.sugarTotal > DEFAULT_WEEKLY_SUGAR_LIMIT_G;

  const wentWell =
    summary.flaggedCount === 0
      ? `You logged ${summary.totalItems} item(s) this week with none flagged high or critical risk.`
      : `You logged ${summary.totalItems} item(s) this week, tracking your intake consistently.`;

  const watch = sodiumOver
    ? `Your total sodium (${summary.sodiumTotal}mg) is above the general weekly reference of ${DEFAULT_WEEKLY_SODIUM_LIMIT_MG}mg.`
    : sugarOver
    ? `Your total added sugar (${summary.sugarTotal}g) is above the general weekly reference of ${DEFAULT_WEEKLY_SUGAR_LIMIT_G}g.`
    : summary.flaggedCount > 0
    ? `${summary.flaggedCount} item(s) this week were flagged high or critical risk.`
    : "Nothing stood out as a concern this week.";

  const suggestion =
    sodiumOver || sugarOver
      ? "Try swapping one packaged snack for a fresh, unprocessed option next week."
      : "Keep logging your scans so trends stay easy to spot over time.";

  return `${wentWell} ${watch} ${suggestion}`;
}

/**
 * Calls the AI API and returns a digest string, or null if the call failed or the response
 * didn't match the expected shape. Callers should fall back to buildFallbackDigest() when
 * this returns null, so a missing/invalid AI_API_KEY or a flaky API never breaks the page.
 */
async function generateAiDigest(summary) {
  const aiApiKey = process.env.AI_API_KEY;
  if (!aiApiKey) {
    console.warn("weekly-digest: missing AI_API_KEY, using fallback digest.");
    return null;
  }

  let res;
  try {
    res = await fetch(`${AI_API_ENDPOINT}?key=${aiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildDigestPrompt(summary) }] }],
        generationConfig: { maxOutputTokens: 1200 },
      }),
    });
  } catch (err) {
    console.error("weekly-digest: AI request failed —", err.message);
    return null;
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`weekly-digest: AI request failed with status ${res.status} —`, errorBody);
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
    console.error("weekly-digest: AI response wasn't valid JSON.");
    return null;
  }

  if (typeof parsed.digest !== "string" || !parsed.digest.trim()) {
    console.error("weekly-digest: AI response didn't match the expected shape.");
    return null;
  }

  return parsed.digest.trim();
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
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
    console.error("weekly-digest: server misconfigured —", err.message);
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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("weekly-digest: missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const supabaseAdmin = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary = await getWeeklySummary(supabaseAdmin, userId);

  const aiDigest = await generateAiDigest(summary);
  const digest = aiDigest || buildFallbackDigest(summary);

  return {
    statusCode: 200,
    body: JSON.stringify({
      digest,
      summary,
      generatedAt: new Date().toISOString(),
    }),
  };
};
