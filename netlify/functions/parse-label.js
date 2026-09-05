// netlify/functions/parse-label.js
//
// Step 1: send the uploaded label image to a cloud OCR API to extract raw text.
// Step 2: send that raw text to the AI API with a strict "JSON only" prompt, and validate
// the result before returning it to the frontend.
//
// TODO (manual) — Netlify Function timeout: this function makes TWO sequential external
// calls (OCR, then the AI API) before it can respond, so its total latency is additive. The
// default Netlify Functions timeout is 10s (26s on paid plans/Netlify Pro+); if the OCR step
// or the AI step is slow — a large image, a cold provider, a big label with lots of text —
// this can realistically exceed 10s. If you see 502/504s from this function in production,
// that's the first thing to check: either speed up a step, or move the site to a plan with
// the longer function timeout.

import { randomUUID } from "node:crypto";

// Using OCR.space (https://ocr.space/ocrapi) — free tier, no Google Cloud project/billing
// required. OCR_API_KEY should be the key from your OCR.space signup email.
const OCR_API_ENDPOINT = "https://api.ocr.space/parse/imageurl";

// Using Google's Gemini API (generateContent). The model name is part of the URL path, not
// the request body — see the API key appended as a query param in extractFoodItemFromText().
const AI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const REQUIRED_FOOD_ITEM_FIELDS = [
  "name",
  "calories_per_serving",
  "sodium_mg",
  "added_sugars_g",
  "saturated_fat_g",
  "trans_fat_g",
  "ingredients_list",
  "product_type",
];

const NUMERIC_FOOD_ITEM_FIELDS = [
  "calories_per_serving",
  "sodium_mg",
  "added_sugars_g",
  "saturated_fat_g",
  "trans_fat_g",
];

/**
 * Validates a candidate object against the FoodItem shape before trusting it.
 */
function isValidFoodItem(candidate) {
  if (!candidate || typeof candidate !== "object") return false;

  for (const field of REQUIRED_FOOD_ITEM_FIELDS) {
    if (!(field in candidate)) return false;
  }

  if (typeof candidate.name !== "string" || !candidate.name.trim()) return false;

  for (const field of NUMERIC_FOOD_ITEM_FIELDS) {
    if (typeof candidate[field] !== "number" || !Number.isFinite(candidate[field])) {
      return false;
    }
  }

  if (!Array.isArray(candidate.ingredients_list)) return false;
  if (typeof candidate.product_type !== "string") return false;

  return true;
}

/**
 * Step 1 — OCR: sends the label image URL to the OCR provider and returns raw extracted text.
 */
async function extractTextFromImage(imageUrl) {
  const ocrApiKey = process.env.OCR_API_KEY;
  if (!ocrApiKey) {
    throw new Error("Missing OCR_API_KEY in the function's environment.");
  }

  // OCR.space's imageurl endpoint takes the image URL + api key as query params (GET-style,
  // though POST with query params works fine too and avoids URL-length edge cases).
  const params = new URLSearchParams({
    apikey: ocrApiKey,
    url: imageUrl,
    OCREngine: "2", // engine 2 tends to do better on structured/tabular label text
    isOverlayRequired: "false",
    scale: "true",
  });

  const res = await fetch(`${OCR_API_ENDPOINT}?${params.toString()}`, {
    method: "GET",
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("parse-label: OCR error body —", errorBody);
    throw new Error(`OCR request failed with status ${res.status}`);
  }

  const data = await res.json();

  // OCR.space returns 200 even for some internal failures — check its own error flag too.
  if (data.IsErroredOnProcessing) {
    const message = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join("; ")
      : data.ErrorMessage || "Unknown OCR.space processing error.";
    console.error("parse-label: OCR.space reported an error —", message);
    throw new Error(`OCR.space processing error: ${message}`);
  }

  const rawText = data?.ParsedResults?.[0]?.ParsedText ?? "";

  return rawText;
}

/**
 * Step 2 — AI structuring: sends the raw OCR text to the AI API with a prompt that demands
 * bare JSON matching the FoodItem shape (no prose, no markdown fences).
 */
async function extractFoodItemFromText(rawText) {
  const aiApiKey = process.env.AI_API_KEY;
  if (!aiApiKey) {
    throw new Error("Missing AI_API_KEY in the function's environment.");
  }

  const prompt = `You will be given raw OCR text extracted from a nutrition facts label photo.

Return ONLY a single JSON object — no prose, no markdown code fences, no explanation before or
after it — matching exactly this shape:

{
  "name": string,
  "brand": string | null,
  "serving_size": string | null,
  "calories_per_serving": number,
  "sodium_mg": number,
  "added_sugars_g": number,
  "saturated_fat_g": number,
  "trans_fat_g": number,
  "ingredients_list": string[],
  "product_type": "Packaged Goods"
}

If a value isn't present in the text, use 0 for numbers and an empty array for ingredients_list.

OCR text:
"""
${rawText}
"""`;

  const res = await fetch(`${AI_API_ENDPOINT}?key=${aiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1000 },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("parse-label: Gemini error body —", errorBody);
    throw new Error(`AI request failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawOutput = (
    data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  ).trim();

  // Defensive cleanup in case the model doesn't follow the "no markdown fences" instruction.
  const cleaned = rawOutput.replace(/^```json\s*|^```\s*|```$/gm, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
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

  const imageUrl = body.imageUrl;
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "imageUrl is required." }),
    };
  }

  let rawText;
  try {
    rawText = await extractTextFromImage(imageUrl);
  } catch (err) {
    console.error("parse-label: OCR step failed —", err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: "Couldn't read that label. Please try again or enter it manually.",
      }),
    };
  }

  if (!rawText || !rawText.trim()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ found: false, rawText: "" }),
    };
  }

  let candidate;
  try {
    candidate = await extractFoodItemFromText(rawText);
  } catch (err) {
    console.error("parse-label: AI extraction step failed —", err.message);
    return { statusCode: 200, body: JSON.stringify({ found: false, rawText }) };
  }

  if (!isValidFoodItem(candidate)) {
    // AI output didn't match the expected shape — let the frontend fall back to manual entry,
    // pre-filled with whatever raw text OCR did manage to extract.
    return { statusCode: 200, body: JSON.stringify({ found: false, rawText }) };
  }

  const item = {
    id: randomUUID(),
    name: candidate.name.trim(),
    brand: candidate.brand || undefined,
    serving_size: candidate.serving_size || undefined,
    calories_per_serving: candidate.calories_per_serving,
    sodium_mg: candidate.sodium_mg,
    added_sugars_g: candidate.added_sugars_g,
    saturated_fat_g: candidate.saturated_fat_g,
    trans_fat_g: candidate.trans_fat_g,
    ingredients_list: candidate.ingredients_list,
    product_type: candidate.product_type || "Packaged Goods",
    source: "ocr",
  };

  return { statusCode: 200, body: JSON.stringify({ found: true, item }) };
};
