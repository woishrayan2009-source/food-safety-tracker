import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { getCurrentUser } from "../lib/auth";
import { getProfile } from "../lib/profile";
import { getRecentScans } from "../lib/foodLogs";
import { getWeeklyThresholds } from "../lib/thresholds";
import { supabase } from "../lib/supabaseClient";
import type { FoodLogEntry, UserProfile, WeeklySummary } from "../types";

const EMPTY_SUMMARY: WeeklySummary = {
  totalItems: 0,
  flaggedCount: 0,
  sodiumTotal: 0,
  sugarTotal: 0,
  satFatTotal: 0,
};

const RISK_LABELS: Record<FoodLogEntry["risk_level"], string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export default function Dashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<WeeklySummary>(EMPTY_SUMMARY);
  const [recentScans, setRecentScans] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const userProfile = await getProfile(user.id);
      if (!userProfile) {
        // No health profile yet — send them through onboarding first.
        navigate("/onboarding");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const [summaryResult, scansResult] = await Promise.all([
        fetchWeeklySummary(session?.access_token),
        getRecentScans(user.id, 5),
      ]);

      if (cancelled) return;

      setProfile(userProfile);
      setSummary(summaryResult ?? EMPTY_SUMMARY);
      setRecentScans(scansResult);
      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        setLoadError("Something went wrong loading your dashboard.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function fetchWeeklySummary(
    accessToken: string | undefined
  ): Promise<WeeklySummary | null> {
    if (!accessToken) return null;

    try {
      const res = await fetch("/.netlify/functions/get-summary", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as WeeklySummary;
    } catch {
      return null;
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p style={{ color: "var(--muted)" }}>Loading your dashboard…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-center">
        <div className="form-error">{loadError}</div>
      </div>
    );
  }

  const thresholds = getWeeklyThresholds(profile?.health_conditions ?? []);
  const sodiumOverLimit = summary.sodiumTotal > thresholds.sodiumLimitMg;
  const sugarOverLimit = summary.sugarTotal > thresholds.sugarLimitG;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ margin: 0 }}>Hi, {profile?.name ?? "there"} 👋</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
            Here's how your week is looking.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/settings" style={{ color: "var(--accent)", fontSize: 14 }}>
            Settings
          </Link>
          <Link to="/capture" style={{ textDecoration: "none" }}>
            <Button style={{ width: "auto" }}>Scan a food item</Button>
          </Link>
        </div>
      </div>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>This week</h2>

        <div className="summary-grid">
          <div className="stat-box">
            <span className="stat-value">{summary.flaggedCount}</span>
            <span className="stat-label">Flagged items</span>
          </div>
          <div className="stat-box">
            <span
              className={
                sodiumOverLimit ? "stat-value trend-over" : "stat-value trend-ok"
              }
            >
              {summary.sodiumTotal.toLocaleString()} mg
            </span>
            <span className="stat-label">
              Sodium {sodiumOverLimit ? "— over your target" : "— on track"}
            </span>
          </div>
          <div className="stat-box">
            <span
              className={
                sugarOverLimit ? "stat-value trend-over" : "stat-value trend-ok"
              }
            >
              {summary.sugarTotal.toLocaleString()} g
            </span>
            <span className="stat-label">
              Added sugar {sugarOverLimit ? "— over your target" : "— on track"}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{summary.totalItems}</span>
            <span className="stat-label">Items logged</span>
          </div>
        </div>
      </Card>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 16 }}>
        <div className="section-header-row">
          <h2 style={{ margin: 0, fontSize: 16 }}>Recent scans</h2>
          <Link to="/history" style={{ color: "var(--accent)", fontSize: 13 }}>
            View all →
          </Link>
        </div>

        {recentScans.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            No scans yet — scan a food item to get started.
          </p>
        ) : (
          <ul className="scan-list">
            {recentScans.map((scan) => (
              <li key={scan.id}>
                <Link to={`/result/${scan.id}`} className="scan-item">
                  <span>{scan.food_name}</span>
                  <span className={`risk-badge risk-${scan.risk_level}`}>
                    {RISK_LABELS[scan.risk_level]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link to="/suggestions" className="checkin-link">
        This week's AI check-in →
      </Link>
    </div>
  );
}
