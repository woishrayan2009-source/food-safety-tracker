// TODO (manual): In your Supabase dashboard, enable Email auth under Authentication > Providers.
// If you want Google/social login later, add the provider there and extend signIn() below.

import { supabase } from "./supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthResult {
  user: User | null;
  session: Session | null;
  error: string | null;
}

/**
 * Creates a new Supabase auth user with email + password.
 * Does not create a health profile row — that happens during onboarding.
 */
export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  };
}

/**
 * Signs in an existing user with email + password.
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  };
}

/**
 * Signs the current user out.
 */
export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

/**
 * Returns the currently logged-in user, or null if no session exists.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
