import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

export default function RouteLoader() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setIsVisible(true);
    const hideLoader = window.setTimeout(() => setIsVisible(false), 550);

    return () => window.clearTimeout(hideLoader);
  }, [pathname]);

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