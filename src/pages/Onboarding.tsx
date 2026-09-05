// REDESIGN NOTES (Onboarding):
// - Added the same .auth-wordmark treatment as Login/Signup, as a plain
//   <span> instead of a <Link> since there's nowhere useful to navigate to
//   mid-onboarding.
// - Progress track/labels and step nav buttons are unchanged in markup —
//   they pick up the new flat, square-cornered look purely from index.css.
import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import BasicInfoStep, {
  BasicInfoErrors,
} from "../components/profile/BasicInfoStep";
import ConditionsAllergiesStep from "../components/profile/ConditionsAllergiesStep";
import GoalsStep from "../components/profile/GoalsStep";
import { toggleInList } from "../components/profile/constants";
import { getCurrentUser } from "../lib/auth";
import { usePageLoading } from "../lib/pageLoading";
import type {
  UserProfile,
  Gender,
  HealthCondition,
  AllergyIntolerance,
  FitnessGoal,
} from "../types";

const STEP_LABELS = ["Basic Info", "Conditions & Allergies", "Goals"];

export default function Onboarding() {
  const navigate = useNavigate();
  const done = usePageLoading();
  const [authChecked, setAuthChecked] = useState(false);

  const [step, setStep] = useState(0);

  // Step 1 — Basic Info
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [stepOneErrors, setStepOneErrors] = useState<BasicInfoErrors>({});

  // Step 2 — Conditions & Allergies
  const [healthConditions, setHealthConditions] = useState<HealthCondition[]>(
    []
  );
  const [allergiesIntolerances, setAllergiesIntolerances] = useState<
    AllergyIntolerance[]
  >([]);

  // Step 3 — Goals
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | "">("");
  const [stepThreeError, setStepThreeError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate("/login");
          return;
        }
        setAuthChecked(true);
      } finally {
        done();
      }
    }

    checkSession().catch(() => {
      navigate("/login");
    });
  }, []);

  function validateStepOne(): boolean {
    const errors: BasicInfoErrors = {};
    const ageNum = Number(age);

    if (!name.trim()) {
      errors.name = "Name is required.";
    }

    if (!age.trim()) {
      errors.age = "Age is required.";
    } else if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 120) {
      errors.age = "Enter a valid age.";
    }

    if (!gender) {
      errors.gender = "Please select a gender.";
    }

    setStepOneErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNext() {
    if (step === 0 && !validateStepOne()) return;
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setStepThreeError(null);

    if (!fitnessGoal) {
      setStepThreeError("Please select a fitness goal.");
      return;
    }

    setSubmitting(true);

    const user = await getCurrentUser();
    if (!user) {
      setSubmitting(false);
      setFormError("Your session expired. Please log in again.");
      navigate("/login");
      return;
    }

    const profile: UserProfile = {
      id: user.id,
      name: name.trim(),
      age: Number(age),
      gender: gender as Gender,
      health_conditions: healthConditions,
      allergies_intolerances: allergiesIntolerances,
      fitness_goals: fitnessGoal,
    };

    try {
      const res = await fetch("/.netlify/functions/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error || "Something went wrong saving your profile.");
        setSubmitting(false);
        return;
      }

      navigate("/dashboard");
    } catch {
      setFormError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  const progressPct = ((step + 1) / STEP_LABELS.length) * 100;

  if (!authChecked) {
    return (
      <div className="page-center">
        <p style={{ color: "var(--ink-soft)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="auth-wrap">
        <span className="auth-wordmark">
          Food Safety <span>Tracker</span>
        </span>
        <Card style={{ maxWidth: 480 }}>
        <h1 style={{ marginTop: 0, marginBottom: 4 }}>
          Set up your health profile
        </h1>
        <p style={{ marginTop: 0, color: "var(--ink-soft)", fontSize: 14 }}>
          This helps us flag foods that aren't safe for you.
        </p>

        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-labels">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={
                i === step
                  ? "progress-label active"
                  : i < step
                  ? "progress-label done"
                  : "progress-label"
              }
            >
              {label}
            </span>
          ))}
        </div>

        {formError && <div className="form-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {step === 0 && (
            <BasicInfoStep
              idPrefix="ob"
              name={name}
              age={age}
              gender={gender}
              errors={stepOneErrors}
              onNameChange={setName}
              onAgeChange={setAge}
              onGenderChange={setGender}
            />
          )}

          {step === 1 && (
            <ConditionsAllergiesStep
              healthConditions={healthConditions}
              allergiesIntolerances={allergiesIntolerances}
              onToggleCondition={(condition) =>
                setHealthConditions((list) => toggleInList(list, condition))
              }
              onToggleAllergy={(allergy) =>
                setAllergiesIntolerances((list) => toggleInList(list, allergy))
              }
            />
          )}

          {step === 2 && (
            <GoalsStep
              idPrefix="ob"
              fitnessGoal={fitnessGoal}
              error={stepThreeError}
              onFitnessGoalChange={(goal) => {
                setFitnessGoal(goal);
                setStepThreeError(null);
              }}
            />
          )}

          <div className="onboarding-nav">
            {step > 0 ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleBack}
                disabled={submitting}
              >
                Back
              </button>
            ) : (
              <span />
            )}

            {step < STEP_LABELS.length - 1 ? (
              <Button type="button" style={{ width: "auto" }} onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button type="submit" style={{ width: "auto" }} loading={submitting}>
                Finish
              </Button>
            )}
          </div>
        </form>
        </Card>
      </div>
    </div>
  );
}
