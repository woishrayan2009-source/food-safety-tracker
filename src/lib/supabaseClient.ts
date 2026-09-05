import { createClient } from "@supabase/supabase-js";

// Only variables prefixed with VITE_ are readable here — Vite inlines them straight into the
// browser bundle at build time, so anything with this prefix is effectively public. That's
// fine for a project URL + anon key (the anon key is designed to be public; row-level
// security in Supabase is what actually protects data, not keeping this key secret).
//
// Server-only secrets — SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY, OCR_API_KEY — must NEVER be
// given a VITE_ prefix or referenced from src/. They're read only inside
// netlify/functions/*.js, which run server-side and are never bundled into the browser. If
// you ever see one of those three names show up with a VITE_ prefix, that's a bug — it would
// ship the secret to every visitor's browser.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev instead of silently making broken requests.
  // eslint-disable-next-line no-console
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
