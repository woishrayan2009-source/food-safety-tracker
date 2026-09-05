import { useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageLoadingContext } from "../lib/pageLoading";

export default function RouteLoader() {
  const { pathname } = useLocation();
  const context = useContext(PageLoadingContext);
  const previousPathname = useRef(pathname);
  const [isVisible, setIsVisible] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  if (!context) {
    throw new Error("RouteLoader must be used inside PageLoadingProvider");
  }

  const { pendingCount } = context;

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setIsVisible(true);
    setMinimumElapsed(false);
    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), 300);

    return () => window.clearTimeout(minimumTimer);
  }, [pathname]);

  useEffect(() => {
    if (isVisible && minimumElapsed && pendingCount === 0) {
      setIsVisible(false);
    }
  }, [isVisible, minimumElapsed, pendingCount]);

  if (!isVisible) return null;

  return (
    <div className="route-loader" role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <svg className="route-loader-icon" viewBox="0 0 240 240" aria-hidden="true">
        <path
          className="route-loader-shield"
          d="M120 18 L196 46 V112 C196 165 165 202 120 222 C75 202 44 165 44 112 V46 Z"
        />
        <circle cx="150" cy="150" r="30" fill="#22C55E" />
        <path
          d="M137 150 L146 159 L164 139"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  );
}