// REDESIGN NOTES (Suggestions):
// - Added <AppHeader />, removed the page's own back-link and the now-unused
//   `Link` import.
// - No other structural changes — the digest text and disclaimer inherit the
//   new type and rule styling from .result-explanation / .result-disclaimer.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import AppHeader from "../components/AppHeader";
import { usePageLoading } from "../lib/pageLoading";
import { getCurrentUser } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import type { WeeklyDigestResponse } from "../types";

// Every click on "Refresh" is a billed AI API call (weekly-digest.js), so this is
// rate-limited client-side: the button stays disabled for this long after each fetch,
// counting down so the user knows why. This is a UX/cost guardrail, not a security
// boundary — a real abuse-prevention limit would also need to live server-side.
const REFRESH_COOLDOWN_SECONDS = 60;

export default function Suggestions() {
  const navigate = useNavigate();
  const done = usePageLoading();

  const [digest, setDigest] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  function startCooldown() {
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    setCooldown(REFRESH_COOLDOWN_SECONDS);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const fetchDigest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("You need to be signed in to see your weekly digest.");
        return;
      }

      const res = await fetch("/.netlify/functions/weekly-digest", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`weekly-digest failed (${res.status})`);
      const data = (await res.json()) as WeeklyDigestResponse;
      setDigest(data.digest);
      setGeneratedAt(data.generatedAt);
    } catch {
      setError(
        "We couldn't put together your weekly digest right now. Please try again later."
      );
    } finally {
      setLoading(false);
      startCooldown();
    }
  }, [navigate]);

  useEffect(() => {
    fetchDigest().finally(done);
    // Only run once on mount — fetchDigest is stable enough (only depends on navigate) that
    // re-running it on every render would defeat the point of the cooldown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, fetchDigest]);

  return (
    <>
      <AppHeader />
      <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ margin: 0 }}>This week's AI check-in</h1>
          <p style={{ margin: "4px 0 0", color: "var(--ink-soft)" }}>
            A short digest of your last 7 days, put together from your logged scans.
          </p>
        </div>
      </div>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 24 }}>
        {loading ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Putting together your digest…
          </p>
        ) : error ? (
          <div className="form-error" style={{ marginBottom: 0 }}>
            {error}
          </div>
        ) : (
          <>
            <p className="result-explanation" style={{ margin: 0 }}>
              {digest}
            </p>
            {generatedAt && (
              <p
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 12,
                  marginTop: 12,
                  marginBottom: 0,
                }}
              >
                Generated {new Date(generatedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </>
        )}

        <Button
          type="button"
          style={{ width: "auto", marginTop: 20 }}
          disabled={loading || cooldown > 0}
          onClick={fetchDigest}
        >
          {cooldown > 0 ? `Refresh (${cooldown}s)` : "Refresh"}
        </Button>

        {/* TODO (manual): review this disclaimer wording with a legal/compliance person
            before any public launch — this is a placeholder, not vetted copy. */}
        <p className="result-disclaimer">
          This digest is informational, generated from your aggregated weekly totals only,
          and is not a substitute for medical advice.
        </p>
      </Card>
      </div>
    </>
  );
}
