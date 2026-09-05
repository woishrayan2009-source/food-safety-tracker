// netlify/functions/save-profile.js
//
// Receives the onboarding form payload from src/pages/Onboarding.tsx and upserts it into the
// `profiles` table in Supabase. Runs server-side only — this is the one place allowed to use
// the Supabase SERVICE ROLE key, since that key bypasses row-level security.
//
// TODO (manual): In Supabase, create a `profiles` table with columns matching UserProfile
// (id uuid primary key references auth.users, name text, age int, gender text,
// health_conditions text[], allergies_intolerances text[], fitness_goals text), and add
// SUPABASE_SERVICE_ROLE_KEY to Netlify's environment variables (server-side only, never
// expose this key to the frontend).

import { createClient } from "@supabase/supabase-js";

// NOTE: this list drives the Critical Alert engine in the risk-check function later — keep
// values here in sync with the ALLERGEN_KEYWORDS map in netlify/functions/risk-check.js
// (built in Prompt 5).
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
  return (
    Array.isArray(value) && value.every((item) => allowedSet.has(item))
  );
}

/**
 * Validates the raw request body against the UserProfile shape.
 * Returns an array of human-readable error strings (empty array = valid).
 */
function validateProfilePayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object."];
  }

  if (!isNonEmptyString(body.id)) {
    errors.push("id is required.");
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

  if (
    !isValidEnumArray(body.allergies_intolerances, VALID_ALLERGIES)
  ) {
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

function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function's environment."
    );
  }

  // Service-role key: server-side only, bypasses RLS. Never send this to the browser.
  return createClient(supabaseUrl, serviceRoleKey, {
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Request body must be valid JSON." }),
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
    console.error("save-profile: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: body.id,
        name: body.name.trim(),
        age: body.age,
        gender: body.gender,
        health_conditions: body.health_conditions,
        allergies_intolerances: body.allergies_intolerances,
        fitness_goals: body.fitness_goals,
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("save-profile: Supabase upsert failed —", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to save profile." }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};
