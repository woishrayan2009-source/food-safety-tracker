import { useCallback, useContext, useEffect, useRef } from "react";
import { PageLoadingContext } from "../lib/pageLoading";

const MINIMUM_DISPLAY_TIME = 1100;

export default function BootLoaderGate() {
  const context = useContext(PageLoadingContext);
  const pendingCountRef = useRef(context?.pendingCount ?? 0);
  const minimumElapsedRef = useRef(false);
  const hiddenRef = useRef(false);

  if (!context) {
    throw new Error("BootLoaderGate must be used inside PageLoadingProvider");
  }

  pendingCountRef.current = context.pendingCount;

  const hideWhenReady = useCallback(() => {
    if (
      hiddenRef.current ||
      !minimumElapsedRef.current ||
      pendingCountRef.current !== 0
    ) {
      return;
    }

    const loader = document.getElementById("initial-loader");
    if (!loader) {
      hiddenRef.current = true;
      return;
    }

    hiddenRef.current = true;
    loader.classList.add("is-hidden");
    window.setTimeout(() => loader.remove(), 400);
  }, []);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => {
      minimumElapsedRef.current = true;
      hideWhenReady();
    }, MINIMUM_DISPLAY_TIME);

    hideWhenReady();

    return () => window.clearTimeout(minimumTimer);
  }, [hideWhenReady]);

  useEffect(() => {
    hideWhenReady();
  }, [context.pendingCount, hideWhenReady]);

  return null;
}