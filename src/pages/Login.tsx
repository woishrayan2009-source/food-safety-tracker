// REDESIGN NOTES (Login):
// - No <AppHeader /> here on purpose — there's nothing to navigate to yet
//   pre-auth. Instead, added a small .auth-wordmark above the card so the
//   brand still shows up on this screen, wrapped in a new .auth-wrap div.
import { useState, FormEvent } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { signIn } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

interface FieldErrors {
  email?: string;
  password?: string;
}

type ConfirmationBanner = {
  email: string | null;
  message: string;
};

type LoginLocationState = {
  justSignedUp?: boolean;
  email?: string;
};

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state as LoginLocationState | null) ?? null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationBanner, setConfirmationBanner] =
    useState<ConfirmationBanner | null>(() =>
      locationState?.justSignedUp
        ? {
            email: locationState.email?.trim() || null,
            message: locationState.email?.trim()
              ? `We've sent a confirmation link to ${locationState.email.trim()}. Please confirm your email before logging in.`
              : "We've sent a confirmation link. Please confirm your email before logging in.",
          }
        : null
    );
  const [resendStatus, setResendStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setConfirmationBanner(null);
    setResendStatus("idle");

    if (!validate()) return;

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      if (error.toLowerCase().includes("email not confirmed")) {
        setConfirmationBanner({
          email: email.trim() || null,
          message:
            "Please confirm your email before logging in — check your inbox for the confirmation link.",
        });
        return;
      }
      setFormError(error);
      return;
    }

    navigate("/dashboard");
  }

  async function handleResendConfirmation() {
    const resendEmail = confirmationBanner?.email;
    if (!resendEmail) return;

    setResendStatus("sending");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
      });
      setResendStatus(error ? "error" : "success");
    } catch {
      setResendStatus("error");
    }
  }

  function dismissConfirmationBanner() {
    setConfirmationBanner(null);
    setResendStatus("idle");
  }

  return (
    <div className="page-center">
      <div className="auth-wrap">
        <Link to="/login" className="auth-wordmark">
          Food Safety <span>Tracker</span>
        </Link>
        <Card>
        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Welcome back</h1>
        <p style={{ marginTop: 0, color: "var(--ink-soft)", fontSize: 14 }}>
          Log in to check what's safe for you to eat.
        </p>

        {confirmationBanner && (
          <div className="info-banner" role="status">
            <div>{confirmationBanner.message}</div>
            {confirmationBanner.email && (
              <button
                type="button"
                className="info-banner-action"
                onClick={handleResendConfirmation}
                disabled={resendStatus === "sending"}
              >
                {resendStatus === "sending"
                  ? "Resending…"
                  : "Resend confirmation email"}
              </button>
            )}
            {resendStatus === "success" && (
              <span className="info-banner-feedback">
                Confirmation email resent.
              </span>
            )}
            {resendStatus === "error" && (
              <span className="info-banner-feedback">
                We couldn't resend the confirmation email. Please try again.
              </span>
            )}
            <button
              type="button"
              className="info-banner-dismiss"
              onClick={dismissConfirmationBanner}
              aria-label="Dismiss confirmation message"
            >
              Dismiss
            </button>
          </div>
        )}

        {formError && <div className="form-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <Button type="submit" loading={loading}>
            Log in
          </Button>
        </form>

        <div className="auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </div>
        </Card>
      </div>
    </div>
  );
}
