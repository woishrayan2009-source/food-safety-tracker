// REDESIGN NOTES (Capture):
// - Added <AppHeader /> above the page for consistent nav (this page previously
//   had no back-link at all, so this also fixes a navigation dead-end).
// - Tab bar, food-item stat grid, and search results all inherit the new
//   nutrition-label styling automatically via the shared CSS classes —
//   no markup changes were needed there.
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import AppHeader from "../components/AppHeader";
import OcrUpload from "../components/OcrUpload";
import ManualSearch from "../components/ManualSearch";
import type { FoodItem } from "../types";

// html5-qrcode is a large dependency — only load it once the Barcode tab is actually used.
const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

type CaptureTab = "barcode" | "ocr" | "manual";

const TABS: { id: CaptureTab; label: string }[] = [
  { id: "barcode", label: "Barcode Scan" },
  { id: "ocr", label: "Upload Label" },
  { id: "manual", label: "Manual Search" },
];

export default function Capture() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<CaptureTab>("barcode");
  const [resolvedItem, setResolvedItem] = useState<FoodItem | null>(null);
  const [manualPrefill, setManualPrefill] = useState("");
  const [saving, setSaving] = useState(false);

  function handleTabChange(tab: CaptureTab) {
    setActiveTab(tab);
    setResolvedItem(null);
  }

  function handleResolved(item: FoodItem) {
    setResolvedItem(item);
  }

  function handleBarcodeNotFound() {
    // Don't dead-end on a miss — send the user to another capture method.
    setResolvedItem(null);
    setActiveTab("manual");
  }

  function handleOcrFallback(rawText: string) {
    // The AI couldn't confidently parse the label — let the user fix it up manually,
    // pre-filling the search box with whatever raw text OCR did extract.
    setResolvedItem(null);
    setManualPrefill(rawText);
    setActiveTab("manual");
  }

  async function handleAnalyze() {
    if (!resolvedItem) return;
    setSaving(true);

    // TODO: netlify/functions/log-food.js (built in Prompt 6) will persist this FoodItem to
    // the `food_logs` table and return a durable row id. Until then we stash the resolved
    // item client-side under a generated id so /result/:id has something to read back.
    const id = resolvedItem.id || crypto.randomUUID();
    try {
      sessionStorage.setItem(`food-item:${id}`, JSON.stringify(resolvedItem));
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — /result/:id will show its
      // "couldn't find that item" state instead of crashing.
    }

    navigate(`/result/${id}`);
  }

  return (
    <>
      <AppHeader />
      <div className="capture-page">
      <h1 style={{ marginBottom: 4 }}>Scan a food item</h1>
      <p style={{ marginTop: 0, color: "var(--ink-soft)" }}>
        Scan a barcode, upload a nutrition label, or search manually.
      </p>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id ? "tab-button active" : "tab-button"
            }
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card style={{ maxWidth: "none", width: "100%", marginTop: 16 }}>
        {activeTab === "barcode" && (
          <Suspense
            fallback={<p className="scanner-status">Loading scanner…</p>}
          >
            <BarcodeScanner
              onResolved={handleResolved}
              onNotFound={handleBarcodeNotFound}
            />
          </Suspense>
        )}
        {activeTab === "ocr" && (
          <OcrUpload onResolved={handleResolved} onFallback={handleOcrFallback} />
        )}
        {activeTab === "manual" && (
          <ManualSearch onResolved={handleResolved} initialQuery={manualPrefill} />
        )}
      </Card>

      {resolvedItem && (
        <Card style={{ maxWidth: "none", width: "100%", marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>{resolvedItem.name}</h2>
          {resolvedItem.brand && (
            <p style={{ margin: "0 0 12px", color: "var(--ink-soft)", fontSize: 13 }}>
              {resolvedItem.brand}
            </p>
          )}

          <div className="food-item-stats">
            <div>
              <span className="stat-value">
                {resolvedItem.calories_per_serving}
              </span>
              <span className="stat-label">Calories</span>
            </div>
            <div>
              <span className="stat-value">{resolvedItem.sodium_mg} mg</span>
              <span className="stat-label">Sodium</span>
            </div>
            <div>
              <span className="stat-value">{resolvedItem.added_sugars_g} g</span>
              <span className="stat-label">Added sugar</span>
            </div>
            <div>
              <span className="stat-value">{resolvedItem.saturated_fat_g} g</span>
              <span className="stat-label">Sat. fat</span>
            </div>
          </div>

          {resolvedItem.ingredients_list.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 12 }}>
              Ingredients: {resolvedItem.ingredients_list.join(", ")}
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResolvedItem(null)}
            >
              Start over
            </button>
            <Button
              type="button"
              style={{ width: "auto" }}
              loading={saving}
              onClick={handleAnalyze}
            >
              Analyze this item
            </Button>
          </div>
        </Card>
      )}
      </div>
    </>
  );
}
