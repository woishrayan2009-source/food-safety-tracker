// src/lib/api.ts
//
// Generic frontend helper for calling this app's own Netlify Functions
// (netlify/functions/*.js). Centralizes three things every call site needs: prefixing the
// path with /.netlify/functions/, attaching the current Supabase session's access token as a
// Bearer header, and turning a non-2xx response into a thrown error with the server's
// { error } message instead of a raw fetch Response.
//
// NOTE: most pages built in later prompts (Result.tsx, History.tsx, Suggestions.tsx,
// Settings.tsx, src/lib/foodLogs.ts, src/lib/profile.ts, ...) call
// fetch("/.netlify/functions/...") directly inline rather than through this helper, since
// they were built incrementally, page by page, before this consolidation existed. They all
// follow the same shape this file encodes (get the session, attach the Bearer token, check
// res.ok, read { error }). Treat this as the reference pattern for any *new* function call,
// and consider migrating the existing inline call sites here later for consistency.

import { supabase } from "./supabaseClient";

export interface CallFunctionOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /**
   * Attach the current Supabase session's access token as `Authorization: Bearer <token>`.
   * Defaults to true — nearly every function in this app verifies this server-side (see the
   * getUserIdFromAuthHeader() helper duplicated across netlify/functions/*.js). Set to false
   * only for a function that intentionally accepts anonymous/unauthenticated requests.
   */
  authenticated?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Calls one of this app's own Netlify Functions at /.netlify/functions/<name>.
 *
 * Throws ApiError on any non-2xx response or network failure (status 0 for network errors) —
 * callers should wrap this in try/catch and show a friendly message, the same way every
 * src/pages/*.tsx fetch call in this app already does, rather than surfacing err.message
 * straight to the UI.
 */
export async function callFunction<T = unknown>(
  name: string,
  options: CallFunctionOptions = {}
): Promise<T> {
  const { method = "GET", body, authenticated = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (authenticated) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(`/.netlify/functions/${name}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — please try again.", 0);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string })?.error || `Request to ${name} failed (${res.status}).`,
      res.status
    );
  }

  return data as T;
}
