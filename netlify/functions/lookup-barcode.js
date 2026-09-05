// netlify/functions/lookup-barcode.js
//
// Looks up a barcode against Open Food Facts, maps the result into our internal FoodItem
// shape, and caches it in Supabase's `food_cache` table so repeat scans of the same product
// skip the external call.
//
// TODO (manual): the `food_cache` table doesn't exist yet — create it in Supabase with columns
// (barcode text primary key, food_item jsonb, cached_at timestamptz) before caching will take
// effect. Until then this function still works, it just calls Open Food Facts on every scan.

import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function round(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Maps an Open Food Facts `product` object into our internal FoodItem shape.
 * Prefers per-serving nutriment values where present, falling back to per-100g.
 */
function mapOffProductToFoodItem(product, barcode) {
  const nutriments = product.nutriments || {};

  const caloriesPerServing =
    nutriments["energy-kcal_serving"] ?? nutriments["energy-kcal_100g"] ?? 0;

  // Open Food Facts stores sodium in grams; our FoodItem shape wants milligrams.
  const sodiumG = nutriments["sodium_serving"] ?? nutriments["sodium_100g"] ?? 0;

  const addedSugarsG =
    nutriments["sugars_serving"] ?? nutriments["sugars_100g"] ?? 0;

  const saturatedFatG =
    nutriments["saturated-fat_serving"] ?? nutriments["saturated-fat_100g"] ?? 0;

  const transFatG =
    nutriments["trans-fat_serving"] ?? nutriments["trans-fat_100g"] ?? 0;

  const ingredientsList = (product.ingredients_text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: barcode,
    name: product.product_name || "Unknown product",
    brand: product.brands || undefined,
    barcode,
    serving_size: product.serving_size || undefined,
    calories_per_serving: round(caloriesPerServing),
    sodium_mg: round(sodiumG * 1000),
    added_sugars_g: round(addedSugarsG),
    saturated_fat_g: round(saturatedFatG),
    trans_fat_g: round(transFatG),
    ingredients_list: ingredientsList,
    product_type: "Packaged Goods",
    source: "barcode",
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  const code = event.queryStringParameters?.code;
  if (!code || !code.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing ?code= query parameter." }),
    };
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("lookup-barcode: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  // Check the cache before calling out to Open Food Facts.
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from("food_cache")
    .select("food_item")
    .eq("barcode", code)
    .maybeSingle();

  if (cacheError) {
    // Expected until the food_cache table exists yet — fall through to a live lookup.
    console.warn("lookup-barcode: cache read failed —", cacheError.message);
  }

  if (cached?.food_item) {
    return {
      statusCode: 200,
      body: JSON.stringify({ found: true, item: cached.food_item }),
    };
  }

  const offBaseUrl = process.env.OPENFOODFACTS_BASE_URL;
  if (!offBaseUrl) {
    console.error("lookup-barcode: missing OPENFOODFACTS_BASE_URL");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  let offResponse;
  try {
    offResponse = await fetch(
      `${offBaseUrl}/product/${encodeURIComponent(code)}.json`
    );
  } catch (err) {
    console.error("lookup-barcode: Open Food Facts request failed —", err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Couldn't reach the product database." }),
    };
  }

  if (!offResponse.ok) {
    return { statusCode: 200, body: JSON.stringify({ found: false }) };
  }

  const offData = await offResponse.json();

  // status !== 1 or a missing product means Open Food Facts has no match for this barcode —
  // respond with found: false so the frontend can send the user to OCR or manual search.
  if (offData.status !== 1 || !offData.product) {
    return { statusCode: 200, body: JSON.stringify({ found: false }) };
  }

  const item = mapOffProductToFoodItem(offData.product, code);

  const { error: upsertError } = await supabaseAdmin.from("food_cache").upsert(
    { barcode: code, food_item: item, cached_at: new Date().toISOString() },
    { onConflict: "barcode" }
  );

  if (upsertError) {
    console.warn("lookup-barcode: failed to write cache —", upsertError.message);
  }

  return { statusCode: 200, body: JSON.stringify({ found: true, item }) };
};
