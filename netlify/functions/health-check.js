// netlify/functions/health-check.js
//
// Simple no-auth, no-dependency test function used to confirm Netlify Functions are wired up
// and reachable at all. Hit /.netlify/functions/health-check after `netlify dev` or a deploy
// and expect { status: "ok" }. Deliberately touches no secrets, no Supabase, no AI API — so
// if this ever fails, the problem is "Functions aren't running," not application logic.

export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: "ok" }),
  };
};
