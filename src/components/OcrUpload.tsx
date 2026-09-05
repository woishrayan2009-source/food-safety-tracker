import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCurrentUser } from "../lib/auth";
import type { FoodItem } from "../types";

interface OcrUploadProps {
  onResolved: (item: FoodItem) => void;
  /** Called when the AI couldn't confidently parse the label — hands the raw OCR text
   *  back up so the parent can fall back to manual entry/search. */
  onFallback: (rawText: string) => void;
}

type UploadStatus = "idle" | "uploading" | "parsing" | "error";

// TODO (manual): create a public Supabase Storage bucket named "nutrition-labels"
// (Storage > New bucket) before this upload will succeed.
const STORAGE_BUCKET = "nutrition-labels";

export default function OcrUpload({ onResolved, onFallback }: OcrUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus("uploading");

    try {
      const user = await getCurrentUser();
      if (!user) {
        setStatus("error");
        setError("You must be logged in to upload a label.");
        return;
      }

      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        setStatus("error");
        setError("Couldn't upload that photo. Please try again.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      setStatus("parsing");

      const res = await fetch("/.netlify/functions/parse-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      const data = await res.json();

      if (!res.ok || !data.found) {
        setStatus("idle");
        onFallback(data.rawText ?? "");
        return;
      }

      setStatus("idle");
      onResolved(data.item as FoodItem);
    } catch (err) {
      console.error("OcrUpload: failed to process label", err);
      setStatus("error");
      setError("Something went wrong reading that label. Please try again.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="ocr-panel">
      <label className="ocr-dropzone" htmlFor="ocr-file-input">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Uploaded nutrition label"
            className="ocr-preview"
          />
        ) : (
          <span>Take a photo or upload a nutrition label</span>
        )}
      </label>
      <input
        id="ocr-file-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {status === "uploading" && (
        <p className="scanner-status">Uploading photo…</p>
      )}
      {status === "parsing" && (
        <p className="scanner-status">Reading the label…</p>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
