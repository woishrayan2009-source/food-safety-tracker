// REDESIGN NOTES (Result):
// - Added <AppHeader /> to all three render branches (not-found, loading,
//   done) so the nav bar is present no matter which phase the page is in.
// - Kept the page's own "← Back to dashboard" link as-is (secondary,
//   in-content navigation is fine alongside the header's primary nav here).
// - risk-badge-large now renders as an outlined rectangle keyed to risk
//   color instead of a filled pill — see .risk-badge-large in index.css.
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Card from "../components/ui/Card";
import AppHeader from "../components/AppHeader";
import { usePageLoading } from "../lib/pageLoading";
import { getCurrentUser } from "../lib/auth";
import { getProfile } from "../lib/profile";
import { getLogEntry } from "../lib/foodLogs";
import { supabase } from "../lib/supabaseClient";
import type {
  ExplainResultResponse,
  FoodItem,
  RiskCheckResult,
  TriggeredRule,
} from "../types";

const RISK_LABELS: Record<RiskCheckResult["riskLevel"], string> = {
  low: "Low Risk",
  moderate: "Moderate Risk",
  high: "High Risk",
  critical: "Critical Alert",
};

type Phase =
  | "loading-item"
  | "checking-risk"
  | "generating-explanation"
  | "done"
  | "not-found";

/** Just the pieces of a verdict this page needs to render — a fresh risk-check.js result
 * has a full rawFoodItem too, but a replayed history entry only ever has a food_name. */
type DisplayVerdict = {
  riskLevel: RiskCheckResult["riskLevel"];
  triggeredRules: TriggeredRule[];
};

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const done = usePageLoading();

  const [phase, setPhase] = useState<Phase>("loading-item");
  const [foodName, setFoodName] = useState<string | null>(null);
  const [riskResult, setRiskResult] = useState<DisplayVerdict | null>(null);
  const [explanation, setExplanation] = useState<ExplainResultResponse | null>(
    null
  );
  const [explanationNote, setExplanationNote] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fresh scan just resolved by Capture.tsx: risk-check.js hasn't run yet, so run the
    // full pipeline (rule engine, then the AI explanation layer) and log the outcome.
    async function runFreshScan(foodItem: FoodItem) {
      if (!cancelled) setFoodName(foodItem.name);

      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const userProfile = await getProfile(user.id);
      if (!userProfile) {
        // No health profile yet — the risk engine has nothing to check against.
        navigate("/onboarding");
        return;
      }

      // Step 1 — the deterministic rule engine. This decides the risk level; nothing after
      // this point is allowed to change it, only explain it.
      if (!cancelled) setPhase("checking-risk");

      let riskCheckResult: RiskCheckResult;
      try {
        const res = await fetch("/.netlify/functions/risk-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProfile, foodItem }),
        });
        if (!res.ok) throw new Error(`risk-check failed (${res.status})`);
        riskCheckResult = (await res.json()) as RiskCheckResult;
      } catch {
        if (!cancelled) {
          setFatalError(
            "We couldn't check this item against your health profile right now. Please try again."
          );
          setPhase("done");
        }
        return;
      }

      if (cancelled) return;
      setRiskResult(riskCheckResult);

      // Step 2 — the AI explanation layer. Purely cosmetic on top of the verdict above; if
      // this fails, we still have triggeredRules to show directly. explain-result.js also
      // writes this verdict to food_logs, which is what History.tsx / the branch below reads.
      setPhase("generating-explanation");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      try {
        const res = await fetch("/.netlify/functions/explain-result", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ riskCheckResult }),
        });
        if (!res.ok) throw new Error(`explain-result failed (${res.status})`);
        const data = (await res.json()) as ExplainResultResponse;
        if (!cancelled) setExplanation(data);
      } catch {
        if (!cancelled) {
          setExplanationNote(
            "We got a risk verdict, but couldn't generate a plain-language explanation. Here's what was checked directly:"
          );
        }
      } finally {
        if (!cancelled) setPhase("done");
      }
    }

    // Historical entry (opened from Dashboard's recent scans or History.tsx): risk-check.js
    // already ran at scan time and explain-result.js already logged the verdict. Re-render
    // that stored verdict as-is rather than re-running risk-check.js against the user's
    // *current* profile — a past scan's verdict is meant to be immutable history. (See the
    // TODO in History.tsx if you want an explicit "Re-check with current profile" action
    // instead.)
    async function runHistoryEntry(userId: string) {
      if (!cancelled) setPhase("checking-risk");

      const logEntry = await getLogEntry(id as string, userId);
      if (!logEntry) {
        if (!cancelled) setPhase("not-found");
        return;
      }

      if (cancelled) return;
      setFoodName(logEntry.food_name);
      setRiskResult({
        riskLevel: logEntry.risk_level,
        triggeredRules: logEntry.triggered_rules ?? [],
      });

      if (logEntry.explanation) {
        setExplanation({
          explanation: logEntry.explanation,
          alternatives: logEntry.alternatives ?? [],
          logged: true,
        });
      } else {
        // Scanned before the AI step succeeded (or before food_logs stored it) — fall back
        // to the rules that were triggered at the time, same as the fresh-scan failure path.
        setExplanationNote(
          "Here's what was checked when this item was originally scanned:"
        );
      }
      setPhase("done");
    }

    async function run() {
      if (!id) {
        setPhase("not-found");
        return;
      }

      let foodItem: FoodItem | null = null;
      try {
        const raw = sessionStorage.getItem(`food-item:${id}`);
        foodItem = raw ? (JSON.parse(raw) as FoodItem) : null;
      } catch {
        foodItem = null;
      }

      if (foodItem) {
        await runFreshScan(foodItem);
        return;
      }

      // Not a fresh in-session scan — id must be a `food_logs` row id instead (from
      // Dashboard's recent scans or History.tsx).
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      await runHistoryEntry(user.id);
    }

    run()
      .catch(() => {
        if (!cancelled) {
          setFatalError("Something went wrong loading this result. Please try again.");
          setPhase("done");
        }
      })
      .finally(done);

    return () => {
      cancelled = true;
    };
  }, [done, id, navigate]);

  if (phase === "not-found") {
    return (
      <>
        <AppHeader />
        <div className="page-center">
        <Card style={{ maxWidth: 480 }}>
          <h1 style={{ marginTop: 0 }}>Result</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            We couldn't find that scan. A freshly-scanned item's link expires
            once the session ends, and a history entry may have been deleted —
            try scanning it again.
          </p>
          <p style={{ marginBottom: 0, marginTop: 20 }}>
            <Link to="/dashboard" style={{ color: "var(--brand)", fontSize: 14 }}>
              ← Back to dashboard
            </Link>
          </p>
        </Card>
        </div>
      </>
    );
  }

  if (
    phase === "loading-item" ||
    phase === "checking-risk" ||
    phase === "generating-explanation"
  ) {
    return (
      <>
        <AppHeader />
        <div className="result-page">
          <div className="result-loading">
            <div className="result-spinner" />
            <p>
              {phase === "checking-risk"
                ? "Checking this item against your health profile…"
                : phase === "generating-explanation"
                ? "Putting together a plain-language explanation…"
                : "Loading…"}
            </p>
          </div>
        </div>
      </>
    );
  }

  // phase === "done"
  const riskLevel = riskResult?.riskLevel;

  return (
    <>
      <AppHeader />
      <div className="result-page">
      <Card style={{ maxWidth: "none", width: "100%" }}>
        {foodName && (
          <h1 className="result-food-name">
            {foodName}
          </h1>
        )}

        {fatalError ? (
          <p className="result-error-banner">{fatalError}</p>
        ) : riskLevel ? (
          <>
            <div className={`result-verdict risk-${riskLevel}`}>
              <p className="eyebrow">Safety assessment</p>
              <span className="risk-badge-large">{RISK_LABELS[riskLevel]}</span>
            </div>

            {explanationNote && (
              <p className="result-explanation-fallback-note">{explanationNote}</p>
            )}

            {explanation ? (
              <p className="result-explanation">{explanation.explanation}</p>
            ) : (
              riskResult && (
                <ul className="result-rules-list">
                  {riskResult.triggeredRules.length > 0 ? (
                    riskResult.triggeredRules.map((rule) => (
                      <li key={rule.rule} className="result-rule-item">
                        {rule.message}
                      </li>
                    ))
                  ) : (
                    <li className="result-rule-item">
                      No specific risk factors were flagged for this item.
                    </li>
                  )}
                </ul>
              )
            )}

            {explanation && explanation.alternatives.length > 0 && (
              <div className="result-alternatives">
                <h3>Alternatives to consider</h3>
                <ul>
                  {explanation.alternatives.map((alt) => (
                    <li key={alt}>{alt}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}

        {/* TODO (manual): review this disclaimer wording with a legal/compliance person
            before any public launch — this is a placeholder, not vetted copy. */}
        <p className="result-disclaimer">
          This is informational and not a substitute for medical advice.
        </p>

        <p className="result-back-link">
          <Link to="/dashboard">
            ← Back to dashboard
          </Link>
        </p>
      </Card>
      </div>
    </>
  );
}
