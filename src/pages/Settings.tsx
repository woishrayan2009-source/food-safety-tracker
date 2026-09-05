// REDESIGN NOTES (Settings):
// - Added <AppHeader />, removed the page's own back-link and the unused
//   `Link` import that went with it.
// - Section headings ("Health profile", "Export my data") now use
//   .panel-title for the ruled-underline treatment.
// - "Danger zone" heading keeps its red color but now also colors the rule
//   itself (borderBottomColor) so the warning reads through the whole header,
//   not just the text.
import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import AppHeader from "../components/AppHeader";
import { usePageLoading } from "../lib/pageLoading";
import BasicInfoStep, {
  BasicInfoErrors,
} from "../components/profile/BasicInfoStep";
import ConditionsAllergiesStep from "../components/profile/ConditionsAllergiesStep";
import GoalsStep from "../components/profile/GoalsStep";
import { toggleInList } from "../components/profile/constants";
import { getCurrentUser, signOut } from "../lib/auth";
import { getProfile, updateProfile } from "../lib/profile";
import { supabase } from "../lib/supabaseClient";
import type {
  Gender,
  HealthCondition,
  AllergyIntolerance,
  FitnessGoal,
} from "../types";

const DELETE_CONFIRM_PHRASE = "DELETE";

export default function Settings() {
  const navigate = useNavigate();
  const done = usePageLoading();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Same fields as Onboarding.tsx, pre-filled from the existing profile below.
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [basicInfoErrors, setBasicInfoErrors] = useState<BasicInfoErrors>({});

  const [healthConditions, setHealthConditions] = useState<HealthCondition[]>(
    []
  );
  const [allergiesIntolerances, setAllergiesIntolerances] = useState<
    AllergyIntolerance[]
  >([]);

  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | "">("");
  const [goalError, setGoalError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate("/login");
          return;
        }

        const profile = await getProfile(user.id);
        if (!profile) {
          // Nothing to edit yet — send them through onboarding to create a profile first.
          navigate("/onboarding");
          return;
        }

        if (cancelled) return;
        setName(profile.name);
        setAge(String(profile.age));
        setGender(profile.gender);
        setHealthConditions(profile.health_conditions);
        setAllergiesIntolerances(profile.allergies_intolerances);
        setFitnessGoal(profile.fitness_goals);
        setLoading(false);
      } finally {
        done();
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setLoadError("Something went wrong loading your profile.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function validateBasicInfo(): boolean {
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

    setBasicInfoErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(false);
    setGoalError(null);

    const basicInfoValid = validateBasicInfo();

    if (!fitnessGoal) {
      setGoalError("Please select a fitness goal.");
    }

    if (!basicInfoValid || !fitnessGoal) return;

    setSaving(true);

    const { error } = await updateProfile({
      name: name.trim(),
      age: Number(age),
      gender: gender as Gender,
      health_conditions: healthConditions,
      allergies_intolerances: allergiesIntolerances,
      fitness_goals: fitnessGoal,
    });

    setSaving(false);

    if (error) {
      setFormError(error);
      return;
    }

    setSaveSuccess(true);
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setExportError("Your session expired. Please log in again.");
        return;
      }

      const res = await fetch("/.netlify/functions/export-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error(`export-data failed (${res.status})`);
      }

      // Build the download client-side: a fetch response's Content-Disposition header
      // (set by export-data.js) only triggers a browser download on direct navigation, not
      // on a JS fetch — so we turn the response into a Blob and drive the download from a
      // throwaway <a download> element instead.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `food-safety-tracker-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("We couldn't export your data right now. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function openDeleteModal() {
    setDeleteError(null);
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    if (deleting) return; // don't let the modal be dismissed mid-request
    setShowDeleteModal(false);
  }

  async function handleConfirmDelete() {
    setDeleteError(null);
    setDeleting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setDeleteError("Your session expired. Please log in again.");
        setDeleting(false);
        return;
      }

      const res = await fetch("/.netlify/functions/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(data.error || "Something went wrong deleting your account.");
        setDeleting(false);
        return;
      }

      // The account (and its session) no longer exists server-side — clear the local
      // session too and send them to a logged-out screen.
      await signOut();
      navigate("/signup");
    } catch {
      setDeleteError("Network error — please try again.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p style={{ color: "var(--ink-soft)" }}>Loading your profile…</p>
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

  return (
    <>
      <AppHeader />
      <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ margin: 0 }}>Settings</h1>
          <p style={{ margin: "4px 0 0", color: "var(--ink-soft)" }}>
            Update your health profile, export your data, or delete your account.
          </p>
        </div>
      </div>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 24 }}>
        <h2 className="panel-title">Health profile</h2>

        {saveSuccess && <div className="success-banner">Your profile has been updated.</div>}
        {formError && <div className="form-error">{formError}</div>}

        <form onSubmit={handleSave} noValidate>
          <BasicInfoStep
            idPrefix="settings"
            name={name}
            age={age}
            gender={gender}
            errors={basicInfoErrors}
            onNameChange={(v) => {
              setName(v);
              setSaveSuccess(false);
            }}
            onAgeChange={(v) => {
              setAge(v);
              setSaveSuccess(false);
            }}
            onGenderChange={(v) => {
              setGender(v);
              setSaveSuccess(false);
            }}
          />

          <ConditionsAllergiesStep
            healthConditions={healthConditions}
            allergiesIntolerances={allergiesIntolerances}
            onToggleCondition={(condition) => {
              setHealthConditions((list) => toggleInList(list, condition));
              setSaveSuccess(false);
            }}
            onToggleAllergy={(allergy) => {
              setAllergiesIntolerances((list) => toggleInList(list, allergy));
              setSaveSuccess(false);
            }}
          />

          <GoalsStep
            idPrefix="settings"
            fitnessGoal={fitnessGoal}
            error={goalError}
            onFitnessGoalChange={(goal) => {
              setFitnessGoal(goal);
              setGoalError(null);
              setSaveSuccess(false);
            }}
          />

          <Button type="submit" style={{ width: "auto", marginTop: 8 }} loading={saving}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 16 }}>
        <h2 className="panel-title">Export my data</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 0 }}>
          Download everything this app stores about you — your health profile and your full
          scan history — as a single JSON file.
        </p>
        {exportError && <div className="form-error">{exportError}</div>}
        <button
          type="button"
          className="btn-secondary"
          disabled={exporting}
          onClick={handleExport}
        >
          {exporting ? "Preparing export…" : "Export my data"}
        </button>
      </Card>

      <Card
        style={{ maxWidth: "none", width: "100%", marginTop: 16 }}
        className="danger-zone"
      >
        <h2 className="panel-title" style={{ color: "var(--danger)", borderBottomColor: "var(--danger)" }}>
          Danger zone
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 0 }}>
          Permanently deletes your account, health profile, and full scan history. This
          cannot be undone.
        </p>
        <button type="button" className="btn-danger" onClick={openDeleteModal}>
          Delete my account
        </button>
      </Card>

      {/* TODO (manual): if you plan to launch beyond a personal/demo project, check what
          data privacy law applies in your target market (e.g. India's DPDP Act) — this
          affects consent language and the export/delete features above. */}

      {showDeleteModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <Card style={{ maxWidth: 420 }}>
            <h2 style={{ marginTop: 0, fontSize: 16, color: "var(--danger)" }}>
              Delete your account?
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              This permanently deletes your account, health profile, and every scan in your
              history. This cannot be undone.
            </p>

            <div className="form-field">
              <label htmlFor="delete-confirm-input">
                Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoComplete="off"
                disabled={deleting}
              />
            </div>

            {deleteError && <div className="form-error">{deleteError}</div>}

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDeleteModal}
                disabled={deleting}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                style={{ flex: 1 }}
                disabled={deleting || deleteConfirmText !== DELETE_CONFIRM_PHRASE}
                onClick={handleConfirmDelete}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </Card>
        </div>
      )}
      </div>
    </>
  );
}
