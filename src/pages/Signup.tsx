// REDESIGN NOTES (Signup):
// - Same .auth-wordmark + .auth-wrap treatment as Login.tsx, for consistency
//   across both pre-auth screens.
import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../lib/auth";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function Signup() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!validate()) return;

    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);

    if (error) {
      setFormError(error);
      return;
    }

    navigate("/login", { state: { justSignedUp: true, email } });
  }

  return (
    <div className="page-center">
      <div className="auth-wrap">
        <Link to="/login" className="auth-wordmark">
          Food Safety <span>Tracker</span>
        </Link>
        <Card>
        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Create your account</h1>
        <p style={{ marginTop: 0, color: "var(--ink-soft)", fontSize: 14 }}>
          Start tracking food that's actually safe for you.
        </p>

        {formError && <div className="form-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="signup-confirm-password">Confirm password</label>
            <input
              id="signup-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && (
              <span className="field-error">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <Button type="submit" loading={loading}>
            Sign up
          </Button>
        </form>

        <div className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
        </Card>
      </div>
    </div>
  );
}
