// REDESIGN NOTES (History):
// - Added <AppHeader /> and removed the page's own "← Back to dashboard" link
//   (AppHeader's Dashboard nav item covers this, and highlights as active).
// - No structural changes below this point — History leans entirely on the
//   shared .dashboard / .history-* classes in index.css, so it inherits the
//   new look for free (ruled scan rows, sharp-edged risk badges, etc.).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import AppHeader from "../components/AppHeader";
import { getCurrentUser } from "../lib/auth";
import { getHistoryPage } from "../lib/foodLogs";
import type { FoodLogEntry, RiskLevel } from "../types";

// TODO (manual): decide whether re-scanning the same product later (e.g. after the user
// adds a new allergy) should re-run risk-check.js on old entries or leave history untouched
// — current implementation leaves history untouched; add a "Re-check with current profile"
// button here later if you want the other behavior.

const PAGE_SIZE = 10;

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

const RISK_FILTER_OPTIONS: { value: RiskLevel | "all"; label: string }[] = [
  { value: "all", label: "All risk levels" },
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function History() {
  const navigate = useNavigate();

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Reset back to page 1 whenever a filter changes, since the old offset may no longer make
  // sense against a smaller filtered result set.
  function updateRiskFilter(value: RiskLevel | "all") {
    setRiskFilter(value);
    setOffset(0);
  }
  function updateStartDate(value: string) {
    setStartDate(value);
    setOffset(0);
  }
  function updateEndDate(value: string) {
    setEndDate(value);
    setOffset(0);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const page = await getHistoryPage(PAGE_SIZE, offset, {
        riskLevel: riskFilter === "all" ? undefined : riskFilter,
        // Dates come from <input type="date"> as "YYYY-MM-DD"; treat endDate as end-of-day
        // so the day the user picks is fully included rather than cut off at midnight.
        startDate: startDate || undefined,
        endDate: endDate ? `${endDate}T23:59:59.999` : undefined,
      });

      if (cancelled) return;
      setEntries(page.entries);
      setTotal(page.total);
      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        setLoadError("Something went wrong loading your history.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, offset, riskFilter, startDate, endDate]);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <>
      <AppHeader />
      <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ margin: 0 }}>History</h1>
          <p style={{ margin: "4px 0 0", color: "var(--ink-soft)" }}>
            Every item you've scanned, with the verdict from when you scanned it.
          </p>
        </div>
      </div>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 24 }}>
        <div className="history-filters">
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="history-risk-filter">Risk level</label>
            <select
              id="history-risk-filter"
              value={riskFilter}
              onChange={(e) =>
                updateRiskFilter(e.target.value as RiskLevel | "all")
              }
            >
              {RISK_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="history-start-date">From</label>
            <input
              id="history-start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => updateStartDate(e.target.value)}
            />
          </div>

          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="history-end-date">To</label>
            <input
              id="history-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => updateEndDate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 16 }}>
        {loadError ? (
          <div className="form-error" style={{ marginBottom: 0 }}>
            {loadError}
          </div>
        ) : loading ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            No scans match these filters yet.
          </p>
        ) : (
          <>
            <ul className="scan-list history-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link to={`/result/${entry.id}`} className="scan-item history-item">
                    <span className="history-item-main">
                      <span className="history-item-name">{entry.food_name}</span>
                      <span className="history-item-date">
                        {formatTimestamp(entry.created_at)}
                      </span>
                    </span>
                    <span className={`risk-badge risk-${entry.risk_level}`}>
                      {RISK_LABELS[entry.risk_level]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="history-pagination">
              <span className="history-pagination-label">
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!hasPrev}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!hasNext}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
      </div>
    </>
  );
}
