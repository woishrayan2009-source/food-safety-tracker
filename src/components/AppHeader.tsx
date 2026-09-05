import { Link, useLocation } from "react-router-dom";

// Persistent chrome so every logged-in screen shares one wordmark, one place
// to find Dashboard/History/Settings, and one path back to scanning — instead
// of each page inventing its own back-link and button placement.
export default function AppHeader() {
  const { pathname } = useLocation();

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/dashboard" className="app-wordmark">
          <img
            src="/foodsafety-tracker-logo-horizontal.svg"
            alt="Food Safety Tracker"
          />
        </Link>
        <nav className="app-nav">
          <Link
            to="/dashboard"
            className={`app-nav-link${isActive("/dashboard") ? " is-active" : ""}`}
          >
            Dashboard
          </Link>
          <Link
            to="/history"
            className={`app-nav-link${isActive("/history") ? " is-active" : ""}`}
          >
            History
          </Link>
          <Link
            to="/settings"
            className={`app-nav-link${isActive("/settings") ? " is-active" : ""}`}
          >
            Settings
          </Link>
          <Link to="/capture" className="app-nav-scan">
            Scan a food item
          </Link>
        </nav>
      </div>
    </header>
  );
}
