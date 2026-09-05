// netlify/functions/export-data.js
//
// Returns a downloadable JSON export of everything this app stores about the current user:
// their `profiles` row and every `food_logs` row. Triggered by the "Export my data" button
// on src/pages/Settings.tsx.
//
// This exists as good practice for a health-data app, and is often a legal requirement
// depending on your region's data privacy law (a "right to data portability" / "right to
// access" request).
//
// TODO (manual): if you plan to launch beyond a personal/demo project, check what data
// privacy law applies in your target market (e.g. India's DPDP Act) — this affects consent
// language and this export/delete feature's requirements (response time limits, what counts
// as a complete export, etc.).

import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the authenticated
 * user's id + email, or null if the header is missing or the token is invalid/expired. Same
 * pattern as get-summary.js / explain-result.js — this endpoint hands back everything we
 * know about a user, so it especially must not trust a client-supplied id.
 */
async function getAuthenticatedUser(authHeader) {
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

  return { id: data.user.id, email: data.user.email ?? null };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  let userId;
  let userEmail = null;
  try {
    const authenticatedUser = await getAuthenticatedUser(
      event.headers.authorization || event.headers.Authorization
    );
    if (!authenticatedUser) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Missing or invalid Authorization header." }),
      };
    }
    userId = authenticatedUser.id;
    userEmail = authenticatedUser.email;
  } catch (err) {
    console.error("export-data: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("export-data: missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const supabaseAdmin = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [profileResult, logsResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("food_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    console.warn("export-data: profiles query failed —", profileResult.error.message);
  }
  if (logsResult.error) {
    console.warn("export-data: food_logs query failed —", logsResult.error.message);
  }

  const exportPayload = {
    exported_at: new Date().toISOString(),
    account: {
      id: userId,
      email: userEmail,
    },
    profile: profileResult.data ?? null,
    food_logs: logsResult.data ?? [],
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="food-safety-tracker-export.json"',
    },
    body: JSON.stringify(exportPayload, null, 2),
  };
};
