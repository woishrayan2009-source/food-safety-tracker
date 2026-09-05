import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { FoodItem } from "../types";

interface BarcodeScannerProps {
  onResolved: (item: FoodItem) => void;
  onNotFound: () => void;
}

type ScanStatus = "starting" | "scanning" | "looking-up" | "error";

const SCANNER_ELEMENT_ID = "barcode-scanner-viewport";

export default function BarcodeScanner({
  onResolved,
  onNotFound,
}: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<ScanStatus>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    // TODO (manual): html5-qrcode requires HTTPS to access the camera — this works
    // automatically on Netlify's deployed URL, but for local dev use `netlify dev`
    // (not `vite dev` alone) or a tunneling tool, since plain localhost camera access
    // can be blocked on some browsers.
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          if (!cancelled) handleDecoded(decodedText);
        },
        () => {
          // Per-frame "nothing found this frame" callback — expected while the user is
          // still aiming the camera, so it's intentionally ignored.
        }
      )
      .then(() => {
        if (!cancelled) setStatus("scanning");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("BarcodeScanner: failed to start camera", err);
        setStatus("error");
        setError(
          "Couldn't access the camera. Check camera permissions and that you're on HTTPS."
        );
      });

    return () => {
      cancelled = true;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {
          // Scanner was never fully started or already stopped — nothing to clean up.
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecoded(code: string) {
    const scanner = scannerRef.current;
    try {
      scanner?.pause(true);
    } catch {
      /* already paused/stopped */
    }

    setStatus("looking-up");
    setError(null);

    try {
      const res = await fetch(
        `/.netlify/functions/lookup-barcode?code=${encodeURIComponent(code)}`
      );
      const data = await res.json();

      if (!res.ok || !data.found) {
        onNotFound();
        return;
      }

      onResolved(data.item as FoodItem);
    } catch (err) {
      console.error("BarcodeScanner: barcode lookup failed", err);
      setStatus("error");
      setError("Couldn't look up that barcode. Try again or use another tab.");
      resumeScanning();
    }
  }

  function resumeScanning() {
    try {
      scannerRef.current?.resume();
      setStatus("scanning");
    } catch {
      /* scanner not in a resumable state — leave it as-is */
    }
  }

  return (
    <div className="scanner-panel">
      <div id={SCANNER_ELEMENT_ID} className="scanner-viewport" />

      {status === "starting" && (
        <p className="scanner-status">Starting camera…</p>
      )}
      {status === "scanning" && (
        <p className="scanner-status">Point the camera at a barcode.</p>
      )}
      {status === "looking-up" && (
        <p className="scanner-status">Looking up that barcode…</p>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
