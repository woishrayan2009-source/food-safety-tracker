import { supabase } from "./supabaseClient";
import type { UserProfile } from "../types";

/**
 * Fetches the health profile row for a given Supabase auth user id.
 * Relies on the `profiles` table's row-level security to restrict this to the
 * caller's own row (uses the anon key, unlike save-profile.js which runs server-side
 * with the service-role key).
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfile;
}

export type EditableProfileFields = Omit<UserProfile, "id">;

/**
 * Calls netlify/functions/update-profile.js to save edits made on src/pages/Settings.tsx.
 * Unlike Onboarding's save-profile.js call, this requires the caller's Supabase access
 * token — update-profile.js derives the user id from that token rather than trusting one in
 * the request body, since this endpoint can overwrite an *existing* profile.
 *
 * Returns an error string on failure (network, auth, or validation), or null on success.
 */
export async function updateProfile(
  fields: EditableProfileFields
): Promise<{ error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { error: "Your session expired. Please log in again." };
  }

  try {
    const res = await fetch("/.netlify/functions/update-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(fields),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { error: data.error || "Something went wrong saving your profile." };
    }

    return { error: null };
  } catch {
    return { error: "Network error — please try again." };
  }
}
