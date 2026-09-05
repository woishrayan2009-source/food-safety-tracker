// netlify/functions/get-history.js
//
// Returns a paginated, filterable page of the current user's `food_logs` rows for
// History.tsx. Each row already has its food name and full verdict (risk_level,
// triggered_rules, explanation, alternatives) cached on it from scan time by
// explain-result.js — there's no separate food-name table to join against, the name is
// denormalized onto food_logs precisely so History (and Result.tsx, for old entries) never
// needs to re-resolve or re-run risk-check.js against a food item that may have since
// changed in the food database.
//
// TODO (manual): the `food_logs` table doesn't exist yet — see the schema TODO at the top of
// netlify/functions/explain-result.js. Until it exists this responds with an empty page
// instead of erroring, so History.tsx can render its empty state during development.

import { createClient } from "@supabase/supabase-js";

const VALID_RISK_LEVELS = ["low", "moderate", "high", "critical"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const EMPTY_PAGE = (limit, offset) => ({
  entries: [],
  total: 0,
  limit,
  offset,
});

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the user id.
 * Returns null if the header is missing or the token is invalid/expired. Mirrors the same
 * pattern used in get-summary.js / explain-result.js — never trust a user id the client
 * might send in query params.
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
 * Parses/validates the query string into safe pagination + filter values. Invalid values
 * (non-numeric limit, out-of-range risk level, unparseable dates) are treated the same as
 * "not provided" rather than erroring the whole request — a bad filter should degrade to
 * "no filter", not a 400, since these are user-editable inputs on a list page.
 */
function parseQueryParams(query) {
  const rawLimit = Number.parseInt(query?.limit, 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rawOffset = Number.parseInt(query?.offset, 10);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const riskLevel = VALID_RISK_LEVELS.includes(query?.riskLevel)
    ? query.riskLevel
    : null;

  const startDate = isValidDateString(query?.startDate) ? query.startDate : null;
  const endDate = isValidDateString(query?.endDate) ? query.endDate : null;

  return { limit, offset, riskLevel, startDate, endDate };
}

function isValidDateString(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(new Date(value).getTime());
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
    console.error("get-history: server misconfigured —", err.message);
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
    console.error("get-history: missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const { limit, offset, riskLevel, startDate, endDate } = parseQueryParams(
    event.queryStringParameters || {}
  );

  const supabaseAdmin = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabaseAdmin
    .from("food_logs")
    .select(
      "id, user_id, food_name, created_at, risk_level, sodium_mg, added_sugars_g, saturated_fat_g, triggered_rules, explanation, alternatives",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (riskLevel) {
    query = query.eq("risk_level", riskLevel);
  }
  if (startDate) {
    query = query.gte("created_at", startDate);
  }
  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  const { data: entries, count, error } = await query;

  if (error) {
    // Expected until the food_logs table/migration exists — degrade gracefully instead of
    // breaking History.tsx.
    console.warn("get-history: food_logs query failed —", error.message);
    return {
      statusCode: 200,
      body: JSON.stringify(EMPTY_PAGE(limit, offset)),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      entries: entries || [],
      total: count ?? 0,
      limit,
      offset,
    }),
  };
};
