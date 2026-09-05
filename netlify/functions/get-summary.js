// netlify/functions/get-summary.js
//
// Returns a 7-day nutrient rollup for the current user, read from the `food_logs` table.
// The actual query + aggregation lives in ./lib/weeklySummary.js (shared with
// weekly-digest.js, Prompt 7) so both call sites always agree on what "this week" totals to.
//
// TODO (manual): the `food_logs` table doesn't exist yet — it's created in Prompt 6's
// backend (log-food.js). Run that migration/table creation before this function will
// return real data. Until then this function responds with a zeroed-out summary instead
// of erroring, so the Dashboard can render normally during development.

import { createClient } from "@supabase/supabase-js";
import { getWeeklySummary } from "./lib/weeklySummary.js";

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the user id.
 * Returns null if the header is missing or the token is invalid/expired.
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

  // <-- plug in server-side JWT verification here: supabase.auth.getUser(token)
  // validates the token against Supabase Auth and returns the user it belongs to,
  // without trusting any user id the client might send in the request body.
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user.id;
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
    console.error("get-summary: server misconfigured —", err.message);
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
    console.error("get-summary: missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const supabaseAdmin = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary = await getWeeklySummary(supabaseAdmin, userId);

  return {
    statusCode: 200,
    body: JSON.stringify(summary),
  };
};
