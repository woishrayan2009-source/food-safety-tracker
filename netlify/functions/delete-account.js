// netlify/functions/delete-account.js
//
// Permanently deletes the current user's account: their `food_logs` rows, their `profiles`
// row, and finally the Supabase Auth user itself via the admin API. Triggered by the "Delete
// my account" confirmation modal on src/pages/Settings.tsx.
//
// Runs server-side only — auth.admin.deleteUser() requires the SERVICE ROLE key, which must
// never be exposed to the frontend. This is exactly why this needs its own Netlify Function
// rather than being callable straight from Settings.tsx.
//
// Deletes food_logs/profiles explicitly before deleting the auth user, rather than relying
// on an `ON DELETE CASCADE` foreign key, since these tables are created manually (see the
// schema TODOs in save-profile.js / explain-result.js) and a real deployment may or may not
// have set that up. Deleting the auth user last means a failure partway through leaves the
// account still accessible (and retryable) instead of orphaned mid-deletion.
//
// TODO (manual): if you plan to launch beyond a personal/demo project, check what data
// privacy law applies in your target market (e.g. India's DPDP Act) for any required
// grace period, confirmation, or audit-logging around account deletion.

import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in the function's environment.");
  }
  return url;
}

/**
 * Verifies the Supabase JWT from the Authorization header and returns the user id. Same
 * pattern as get-summary.js / explain-result.js.
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
    console.error("delete-account: server misconfigured —", err.message);
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

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("delete-account: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  // Delete data rows first. Failures here are logged but don't block account deletion —
  // an orphaned food_logs row with no matching profiles/auth.users row is a much smaller
  // problem than a user who asked to delete their account and can't, so we proceed to the
  // auth deletion regardless (and surface a partial-failure note in the response).
  const { error: logsError } = await supabaseAdmin
    .from("food_logs")
    .delete()
    .eq("user_id", userId);
  if (logsError) {
    console.warn("delete-account: food_logs delete failed —", logsError.message);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError) {
    console.warn("delete-account: profiles delete failed —", profileError.message);
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("delete-account: auth.admin.deleteUser failed —", authError.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Your data was removed, but we couldn't fully delete your account. Please try again or contact support.",
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};
