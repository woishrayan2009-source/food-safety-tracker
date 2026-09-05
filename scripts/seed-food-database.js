// scripts/seed-food-database.js
//
// Manual, local-only script that seeds the Supabase `food_database` table (used by
// netlify/functions/search-food.js for the Manual Search tab) from a CSV file.
//
// This is NOT a Netlify function and is NOT deployed — it's a one-off/occasional tool you
// run yourself from your machine.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// SETUP (do this before running)
// ─────────────────────────────────────────────────────────────────────────────────────────
// 1. Install the extra dev dependencies this script needs (already declared in
//    package.json devDependencies): `npm install`.
//
// 2. Copy scripts/.env.local.example to scripts/.env.local and fill in your Supabase project
//    URL and SERVICE ROLE key (Project Settings > API in the Supabase dashboard):
//      cp scripts/.env.local.example scripts/.env.local
//    scripts/.env.local is gitignored — never commit it, the service-role key bypasses RLS.
//
// 3. TODO (manual): download a fast-food/packaged-food nutrition CSV (USDA FoodData Central
//    or a Kaggle fast-food nutrition dataset) and place it at scripts/data/foods.csv before
//    running this script. Expected header row / columns:
//
//      name, product_type, calories_per_serving, sodium_mg, added_sugars_g,
//      saturated_fat_g, trans_fat_g, ingredients_list
//
//    - name: required text, e.g. "Big Mac".
//    - product_type: one of "Packaged Goods", "Restaurant Item", "Fresh Produce",
//      "Home Cooked", "Other" (case-insensitive). Unrecognized/blank values fall back to
//      "Packaged Goods" with a warning — fix the CSV if that's not right for your dataset.
//    - calories_per_serving / sodium_mg / added_sugars_g / saturated_fat_g / trans_fat_g:
//      numbers. Blank or non-numeric values are treated as 0, with a warning.
//    - ingredients_list: since the file is comma-delimited, separate individual ingredients
//      with a SEMICOLON inside this cell, e.g. "enriched flour; sugar; palm oil; salt".
//      (A plain comma-separated list is also accepted as a fallback if no semicolons are
//      found in the cell, but semicolons are safer and recommended.)
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────────────────────────────────────────────────
//   node scripts/seed-food-database.js
//   npm run seed:food-db
//
// Options:
//   --file=path/to/other.csv   Use a CSV somewhere other than scripts/data/foods.csv
//   --batch-size=500           Rows per insert batch (default 500)
//   --clear                    Delete ALL existing rows in food_database before seeding
//   --yes                      Skip the confirmation prompt for --clear (for CI/non-interactive use)
//
// The `food_database` table is expected to already exist in Supabase (via a migration) with
// at least: id (uuid/serial, default), name (text), product_type (text), calories_per_serving
// (numeric), sodium_mg (numeric), added_sugars_g (numeric), saturated_fat_g (numeric),
// trans_fat_g (numeric), ingredients_list (text[]). See the TODO in
// netlify/functions/search-food.js for the pg_trgm search index/RPC this table also needs.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import readline from "node:readline";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, ".env.local") });

const VALID_PRODUCT_TYPES = [
  "Packaged Goods",
  "Restaurant Item",
  "Fresh Produce",
  "Home Cooked",
  "Other",
];
const DEFAULT_PRODUCT_TYPE = "Packaged Goods";
const NUMERIC_FIELDS = [
  "calories_per_serving",
  "sodium_mg",
  "added_sugars_g",
  "saturated_fat_g",
  "trans_fat_g",
];
const REQUIRED_COLUMNS = ["name", ...NUMERIC_FIELDS, "product_type", "ingredients_list"];

function parseArgs(argv) {
  const args = { file: null, batchSize: 500, clear: false, yes: false };
  for (const raw of argv) {
    if (raw === "--clear") args.clear = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--file=")) args.file = raw.slice("--file=".length);
    else if (raw.startsWith("--batch-size=")) {
      const n = Number.parseInt(raw.slice("--batch-size=".length), 10);
      if (Number.isFinite(n) && n > 0) args.batchSize = n;
    }
  }
  return args;
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Did you copy scripts/.env.local.example to scripts/.env.local and fill it in?"
    );
    process.exit(1);
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function loadCsvRows(csvPath) {
  if (!existsSync(csvPath)) {
    console.error(
      `Could not find a CSV at ${csvPath}\n\n` +
        "Download a fast-food/packaged-food nutrition CSV (USDA FoodData Central or a Kaggle\n" +
        "fast-food nutrition dataset) and place it at scripts/data/foods.csv, or pass a\n" +
        "different path with --file=path/to/your.csv. See the header comment in this script\n" +
        "for the expected columns."
    );
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf-8");
  let rows;
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    console.error(`Failed to parse CSV at ${csvPath}: ${err.message}`);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error(`${csvPath} has no data rows.`);
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    console.error(
      `CSV at ${csvPath} is missing expected column(s): ${missing.join(", ")}\n` +
        `Found columns: ${headers.join(", ")}\n` +
        `Expected columns: ${REQUIRED_COLUMNS.join(", ")}`
    );
    process.exit(1);
  }

  return rows;
}

function parseIngredients(value) {
  if (!value || !value.trim()) return [];
  const delimiter = value.includes(";") ? ";" : ",";
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeProductType(value, rowNumber, warnings) {
  const trimmed = (value || "").trim();
  const match = VALID_PRODUCT_TYPES.find(
    (t) => t.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match;
  warnings.push(
    `Row ${rowNumber}: product_type "${value}" not recognized, defaulting to "${DEFAULT_PRODUCT_TYPE}".`
  );
  return DEFAULT_PRODUCT_TYPE;
}

function normalizeNumber(value, field, rowNumber, warnings) {
  if (value === undefined || value === null || value.toString().trim() === "") return 0;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    warnings.push(`Row ${rowNumber}: ${field} "${value}" is not a number, defaulting to 0.`);
    return 0;
  }
  return n;
}

function transformRows(rawRows) {
  const warnings = [];
  const skipped = [];
  const foodRows = [];

  rawRows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const name = (row.name || "").trim();
    if (!name) {
      skipped.push(`Row ${rowNumber}: missing name, skipped.`);
      return;
    }

    foodRows.push({
      name,
      product_type: normalizeProductType(row.product_type, rowNumber, warnings),
      calories_per_serving: normalizeNumber(
        row.calories_per_serving,
        "calories_per_serving",
        rowNumber,
        warnings
      ),
      sodium_mg: normalizeNumber(row.sodium_mg, "sodium_mg", rowNumber, warnings),
      added_sugars_g: normalizeNumber(
        row.added_sugars_g,
        "added_sugars_g",
        rowNumber,
        warnings
      ),
      saturated_fat_g: normalizeNumber(
        row.saturated_fat_g,
        "saturated_fat_g",
        rowNumber,
        warnings
      ),
      trans_fat_g: normalizeNumber(row.trans_fat_g, "trans_fat_g", rowNumber, warnings),
      ingredients_list: parseIngredients(row.ingredients_list),
    });
  });

  return { foodRows, warnings, skipped };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question(question, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = resolve(process.cwd(), args.file || resolve(__dirname, "data/foods.csv"));

  console.log(`Reading CSV from ${csvPath} ...`);
  const rawRows = loadCsvRows(csvPath);
  console.log(`Parsed ${rawRows.length} data row(s).`);

  const { foodRows, warnings, skipped } = transformRows(rawRows);

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} warning(s) while normalizing rows:`);
    warnings.slice(0, 20).forEach((w) => console.warn(`  - ${w}`));
    if (warnings.length > 20) console.warn(`  ... and ${warnings.length - 20} more.`);
  }
  if (skipped.length > 0) {
    console.warn(`\n${skipped.length} row(s) skipped:`);
    skipped.slice(0, 20).forEach((s) => console.warn(`  - ${s}`));
    if (skipped.length > 20) console.warn(`  ... and ${skipped.length - 20} more.`);
  }

  if (foodRows.length === 0) {
    console.error("\nNo valid rows to insert. Exiting.");
    process.exit(1);
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (args.clear) {
    if (!args.yes) {
      const ok = await confirm(
        "\n--clear will DELETE ALL existing rows in food_database before seeding. Continue? [y/N] "
      );
      if (!ok) {
        console.log("Aborted.");
        process.exit(0);
      }
    }
    console.log("Clearing existing food_database rows...");
    // Match-all delete: id is never null, so this removes every row.
    const { error: deleteError } = await supabaseAdmin
      .from("food_database")
      .delete()
      .not("id", "is", null);
    if (deleteError) {
      console.error(`Failed to clear food_database: ${deleteError.message}`);
      process.exit(1);
    }
  }

  const batches = chunk(foodRows, args.batchSize);
  console.log(
    `\nInserting ${foodRows.length} row(s) in ${batches.length} batch(es) of up to ${args.batchSize}...`
  );

  let insertedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { error, data } = await supabaseAdmin
      .from("food_database")
      .insert(batch)
      .select("id");

    if (error) {
      failedCount += batch.length;
      console.error(`Batch ${i + 1}/${batches.length} failed: ${error.message}`);
    } else {
      const count = data?.length ?? batch.length;
      insertedCount += count;
      console.log(`Batch ${i + 1}/${batches.length}: inserted ${count} row(s).`);
    }
  }

  console.log("\nDone.");
  console.log(`  Rows read from CSV:  ${rawRows.length}`);
  console.log(`  Rows skipped:        ${skipped.length}`);
  console.log(`  Rows inserted:       ${insertedCount}`);
  console.log(`  Rows failed:         ${failedCount}`);

  if (failedCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
