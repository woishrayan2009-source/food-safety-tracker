// netlify/functions/update-profile.js
//
// Same shape/validation as save-profile.js, but for editing an existing profile from
// src/pages/Settings.tsx rather than creating one during onboarding: does an UPDATE against
// an existing `profiles` row instead of an upsert, and derives the user id from the caller's
// Supabase JWT rather than trusting an `id` in the request body.
//
// SECURITY NOTE: save-profile.js currently trusts whatever `id` is in its request body,
// which is fine for onboarding (a user can only create *their own* profile row right after
// signing up, and the id comes straight from getCurrentUser() client-side) but would NOT be
// fine here — this endpoint lets someone overwrite an *existing* profile, so it needs to
// prove who's calling. TODO (manual): consider backporting the same JWT-verification pattern
// to save-profile.js for defense in depth, even though the onboarding flow is lower-risk.
//
// TODO (manual): same `profiles` table as save-profile.js — see the TODO at the top of that
// file for the expected schema.

import { createClient } from "@supabase/supabase-js";

// NOTE: keep these in sync with the same sets in save-profile.js, the ALLERGEN_KEYWORDS map
// in risk-check.js, and the option lists in src/components/profile/constants.ts.
const VALID_GENDERS = new Set(["Male", "Female", "Other"]);
const VALID_HEALTH_CONDITIONS = new Set([
  "Diabetes",
  "Hypertension",
  "Chronic Kidney Disease",
  "Hyperlipidemia",
  "Acid Reflux",
]);
const VALID_ALLERGIES = new Set([
  "Gluten",
  "Dairy/Lactose",
  "Nuts",
  "Soy",
  "Shellfish",
]);
const VALID_FITNESS_GOALS = new Set([
  "Weight Loss",
  "Muscle Gain",
  "Maintenance",
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEnumArray(value, allowedSet) {
  return Array.isArray(value) && value.every((item) => allowedSet.has(item));
}

/**
 * Validates the raw request body against the editable UserProfile fields. Unlike
 * save-profile.js, `id` is NOT expected/read from the body — it comes from the verified JWT
 * instead — so it's not part of this validation.
 */
function validateProfilePayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object."];
  }

  if (!isNonEmptyString(body.name)) {
    errors.push("name is required.");
  }

  if (
    typeof body.age !== "number" ||
    !Number.isFinite(body.age) ||
    body.age <= 0 ||
    body.age > 120
  ) {
    errors.push("age must be a number between 1 and 120.");
  }

  if (!VALID_GENDERS.has(body.gender)) {
    errors.push("gender must be one of: Male, Female, Other.");
  }

  if (!isValidEnumArray(body.health_conditions, VALID_HEALTH_CONDITIONS)) {
    errors.push(
      "health_conditions must be an array drawn from the supported condition list."
    );
  }

  if (!isValidEnumArray(body.allergies_intolerances, VALID_ALLERGIES)) {
    errors.push(
      "allergies_intolerances must be an array drawn from the supported allergy list."
    );
  }

  if (!VALID_FITNESS_GOALS.has(body.fitness_goals)) {
    errors.push(
      "fitness_goals must be one of: Weight Loss, Muscle Gain, Maintenance."
    );
  }

  return errors;
}

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
  // Service-role key: server-side only, bypasses RLS. Never send this to the browser.
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
    console.error("update-profile: server misconfigured —", err.message);
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

  // If the client did send an id (e.g. reusing the same UserProfile object shape
  // save-profile.js expects), it must match the authenticated user — never let a caller
  // update someone else's row by passing a different id.
  if (body.id && body.id !== userId) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "You can only update your own profile." }),
    };
  }

  const validationErrors = validateProfilePayload(body);
  if (validationErrors.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: validationErrors.join(" ") }),
    };
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("update-profile: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const { error, count } = await supabaseAdmin
    .from("profiles")
    .update(
      {
        name: body.name.trim(),
        age: body.age,
        gender: body.gender,
        health_conditions: body.health_conditions,
        allergies_intolerances: body.allergies_intolerances,
        fitness_goals: body.fitness_goals,
      },
      { count: "exact" }
    )
    .eq("id", userId);

  if (error) {
    console.error("update-profile: Supabase update failed —", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to update profile." }),
    };
  }

  if (count === 0) {
    // No existing row to update — this endpoint is for editing, not creating. Onboarding
    // (save-profile.js) is what creates the initial row.
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: "No existing profile found for this account. Complete onboarding first.",
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};
