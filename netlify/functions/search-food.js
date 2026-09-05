// netlify/functions/search-food.js
//
// Manual food search — queries Open Food Facts's public search API directly, the same
// provider netlify/functions/lookup-barcode.js already uses for barcode scans. This means
// Manual Search works immediately with real product data, no local `food_database` table to
// create or seed, and no separate API key to sign up for (Open Food Facts's API is free and
// keyless).
//
// Reuses OPENFOODFACTS_BASE_URL (already set for lookup-barcode.js) to derive the search
// endpoint's origin, so both functions stay pointed at the same Open Food Facts
// instance/mirror if that env var ever changes.
//
// FIX (Sept 2026): requests were coming back as 503s / ERR_CONNECTION_CLOSED under rapid
// typing. Two contributing causes:
//   1. Open Food Facts's API usage guidelines ask every client to identify itself with a
//      descriptive User-Agent header; requests without one are more likely to be
//      deprioritized or rejected under load. Added below.
//   2. The frontend was firing one request per keystroke with no debounce, which multiplies
//      the problem — that fix belongs in the search input component (e.g. src/pages/
//      Capture.tsx), not here, but is worth doing alongside this header fix.

const MAX_RESULTS = 20;

// Open Food Facts asks API clients to send a descriptive User-Agent identifying the app and
// (ideally) a contact — see https://openfoodfacts.github.io/openfoodfacts-server/api/. Requests
// without one are more likely to be rate-limited or dropped, which is what we were seeing as
// intermittent 503s and closed connections.
const OFF_USER_AGENT = "FoodSafetyTracker/1.0 (Netlify Function; search-food)";

function round(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Maps an Open Food Facts `product` object into our internal FoodItem shape. Mirrors
 * mapOffProductToFoodItem() in lookup-barcode.js — kept as a separate copy (rather than a
 * shared import) since these are independent Netlify Functions and this keeps each one
 * self-contained. Keep the two in sync if the FoodItem shape changes.
 */
function mapOffProductToFoodItem(product) {
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
    id: product.code || product._id || product.id,
    name: product.product_name || "Unknown product",
    brand: product.brands || undefined,
    barcode: product.code || undefined,
    serving_size: product.serving_size || undefined,
    calories_per_serving: round(caloriesPerServing),
    sodium_mg: round(sodiumG * 1000),
    added_sugars_g: round(addedSugarsG),
    saturated_fat_g: round(saturatedFatG),
    trans_fat_g: round(transFatG),
    ingredients_list: ingredientsList,
    product_type: "Packaged Goods",
    source: "manual",
  };
}

function getOffSearchEndpoint() {
  const offBaseUrl = process.env.OPENFOODFACTS_BASE_URL;
  if (!offBaseUrl) {
    throw new Error("Missing OPENFOODFACTS_BASE_URL in the function's environment.");
  }
  // OPENFOODFACTS_BASE_URL is typically "https://world.openfoodfacts.org/api/v0" (used for
  // barcode lookups) — the search endpoint lives at a different path on the same host, so we
  // derive the origin rather than hardcoding a second domain.
  const origin = new URL(offBaseUrl).origin;
  return `${origin}/cgi/search.pl`;
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  const q = event.queryStringParameters?.q;
  if (!q || !q.trim()) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  let searchEndpoint;
  try {
    searchEndpoint = getOffSearchEndpoint();
  } catch (err) {
    console.error("search-food: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const params = new URLSearchParams({
    search_terms: q.trim(),
    json: "1",
    page_size: String(MAX_RESULTS),
    action: "process",
  });

  let offResponse;
  try {
    offResponse = await fetch(`${searchEndpoint}?${params.toString()}`, {
      headers: { "User-Agent": OFF_USER_AGENT },
    });
  } catch (err) {
    console.error("search-food: Open Food Facts request failed —", err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Couldn't reach the product database." }),
    };
  }

  if (!offResponse.ok) {
    console.warn(`search-food: Open Food Facts responded with status ${offResponse.status}`);
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  const offData = await offResponse.json();
  const products = Array.isArray(offData.products) ? offData.products : [];

  // Skip entries with no usable name — Open Food Facts has plenty of sparse/incomplete
  // community-submitted products, and a nameless result isn't useful to show or select.
  const results = products
    .filter((p) => p.product_name && p.product_name.trim())
    .map(mapOffProductToFoodItem);

  return {
    statusCode: 200,
    body: JSON.stringify({ results }),
  };
};
