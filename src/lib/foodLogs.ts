import { supabase } from "./supabaseClient";
import type { FoodLogEntry, PaginatedFoodLogs, RiskLevel } from "../types";

// NOTE: the `food_logs` table doesn't exist yet — it's created in Prompt 6's backend
// (log-food.js). Until that migration runs, this will simply return an empty array
// (Supabase returns an error for a missing table, which we swallow below) so the
// Dashboard can render its empty state instead of crashing.

/**
 * Fetches the current user's most recent food log entries, newest first.
 */
export async function getRecentScans(
  userId: string,
  limit = 5
): Promise<FoodLogEntry[]> {
  const { data, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as FoodLogEntry[];
}

/**
 * Fetches a single food_logs row by id, scoped to the given user, so Result.tsx can
 * re-render a historical scan's stored verdict (see the TODO in History.tsx) instead of
 * re-running risk-check.js. Returns null if the row doesn't exist, doesn't belong to this
 * user, or the table/query fails for any reason (e.g. table not created yet).
 */
export async function getLogEntry(
  id: string,
  userId: string
): Promise<FoodLogEntry | null> {
  const { data, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as FoodLogEntry;
}

export interface HistoryFilters {
  riskLevel?: RiskLevel;
  /** ISO date/datetime string — inclusive lower bound on created_at. */
  startDate?: string;
  /** ISO date/datetime string — inclusive upper bound on created_at. */
  endDate?: string;
}

/**
 * Calls netlify/functions/get-history.js for a page of the current user's food log, newest
 * first. Goes through the function (rather than querying Supabase directly like
 * getRecentScans above) so pagination/count and filtering happen server-side against the
 * service-role client, consistent with get-summary.js.
 *
 * Returns an empty page (rather than throwing) on any network/auth failure, so History.tsx
 * can show its own error state instead of crashing.
 */
export async function getHistoryPage(
  limit: number,
  offset: number,
  filters: HistoryFilters = {}
): Promise<PaginatedFoodLogs> {
  const emptyPage: PaginatedFoodLogs = { entries: [], total: 0, limit, offset };

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return emptyPage;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);

  try {
    const res = await fetch(`/.netlify/functions/get-history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return emptyPage;
    return (await res.json()) as PaginatedFoodLogs;
  } catch {
    return emptyPage;
  }
}
