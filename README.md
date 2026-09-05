# Food Safety Tracker

## Stack
- Frontend: Vite + React + TypeScript, deployed to Netlify as a static site
- Backend: Netlify Functions (`netlify/functions/*.js`) — one file per endpoint, no long-lived server
- Database/Auth: Supabase (Postgres + Auth)
- AI calls: made only from Netlify Functions, never from the browser, so API keys never reach the client

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase project URL + anon key
3. In your Supabase dashboard, enable Email auth under Authentication > Providers
4. `npm run dev`

## Structure
- `src/pages/Login.tsx`, `src/pages/Signup.tsx` — auth screens (Supabase Auth directly, no backend function)
- `src/lib/auth.ts` — signUp / signIn / signOut / getCurrentUser wrappers
- `src/pages/Onboarding.tsx` — health profile form (placeholder, next step)
- `src/pages/Dashboard.tsx` — main app screen (placeholder, next step)
- `netlify/functions/` — serverless endpoints (AI calls go here later)
