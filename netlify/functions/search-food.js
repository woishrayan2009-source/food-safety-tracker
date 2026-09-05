// netlify/functions/search-food.js
//
// Full-text/fuzzy search against the `food_database` table.
//
// TODO (manual): this table needs to be seeded — see Prompt 4b for the seed script. It also
// needs the pg_trgm extension and a trigram index/RPC for fuzzy matching on partial or
// misspelled queries, e.g. in a Supabase SQL migration:
//
//   create extension if not exists pg_trgm;
//   create index food_database_name_trgm_idx on food_database using gin (name gin_trgm_ops);
//
//   create or replace function search_food_database(search_query text, match_limit int)
//   returns setof food_database as $$
//     select *
//     from food_database
//     where name % search_query
//     order by similarity(name, search_query) desc
//     limit match_limit;
//   $$ language sql stable;
//
// Until that RPC exists, this function falls back to a plain ILIKE substring match so the
// Manual Search tab still works.

import { createClient } from "@supabase/supabase-js";

const MAX_RESULTS = 20;

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

function mapRowToFoodItem(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || undefined,
    serving_size: row.serving_size || undefined,
    calories_per_serving: row.calories_per_serving ?? 0,
    sodium_mg: row.sodium_mg ?? 0,
    added_sugars_g: row.added_sugars_g ?? 0,
    saturated_fat_g: row.saturated_fat_g ?? 0,
    trans_fat_g: row.trans_fat_g ?? 0,
    ingredients_list: row.ingredients_list ?? [],
    product_type: row.product_type,
    source: "manual",
  };
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

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("search-food: server misconfigured —", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly." }),
    };
  }

  const trimmed = q.trim();

  // Preferred path: fuzzy trigram search via the search_food_database RPC (see TODO above).
  const { data: rpcResults, error: rpcError } = await supabaseAdmin.rpc(
    "search_food_database",
    { search_query: trimmed, match_limit: MAX_RESULTS }
  );

  if (!rpcError && rpcResults) {
    return {
      statusCode: 200,
      body: JSON.stringify({ results: rpcResults.map(mapRowToFoodItem) }),
    };
  }

  if (rpcError) {
    // Expected until the pg_trgm RPC/migration exists — fall back to substring matching.
    console.warn(
      "search-food: trigram RPC unavailable, falling back to ILIKE —",
      rpcError.message
    );
  }

  const { data: fallbackResults, error: fallbackError } = await supabaseAdmin
    .from("food_database")
    .select("*")
    .ilike("name", `%${trimmed}%`)
    .limit(MAX_RESULTS);

  if (fallbackError) {
    // Expected until the food_database table is seeded (Prompt 4b) — degrade to no results
    // rather than erroring, so the tab still renders.
    console.warn("search-food: food_database query failed —", fallbackError.message);
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      results: (fallbackResults || []).map(mapRowToFoodItem),
    }),
  };
};
