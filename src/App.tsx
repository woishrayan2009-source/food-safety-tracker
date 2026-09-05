import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Capture from "./pages/Capture";
import Result from "./pages/Result";
import History from "./pages/History";
import Suggestions from "./pages/Suggestions";
import Settings from "./pages/Settings";

export default function App() {
  // NOTE: there's no centralized auth guard component here — each protected page
  // (Dashboard.tsx, Capture.tsx, Result.tsx, History.tsx, Suggestions.tsx, Settings.tsx,
  // Onboarding.tsx) independently calls getCurrentUser() from src/lib/auth.ts on mount and
  // redirects to /login if there's no session. That satisfies the original
  // "TODO (manual): wrap this in an auth guard once Supabase Auth is wired up in Prompt 1"
  // in spirit, but per-page rather than as a single wrapping component/route guard here. If
  // you add more protected pages, remember to repeat that same check — or refactor this into
  // a real <RequireAuth> wrapper around the routes below so it can't be forgotten.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/result/:id" element={<Result />} />
        <Route path="/history" element={<History />} />
        <Route path="/suggestions" element={<Suggestions />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}
