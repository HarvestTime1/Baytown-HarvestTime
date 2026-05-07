// htcb-magic-verify — leadership magic-link auth bridge.
//
// Two actions:
//   POST { action: "send", email, redirect_to } — checks ht_leadership for the
//       email and, if registered + active, asks Supabase Auth to email a magic
//       link. Always returns 200 to avoid leaking which emails are registered.
//
//   POST { action: "verify" } with Authorization: Bearer <user-session-jwt>
//       Validates the session JWT against Supabase Auth, looks up the email in
//       ht_leadership, returns { ok, name, role, access } or 403.
//
// Deployed with verify_jwt:false per CLAUDE.md (the new sb_publishable_* keys
// are not JWTs, so verify_jwt:true would break callers from the browser).
// Auth is enforced inside the function.

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("SB_URL") ||
  "";

const SECRET_KEY =
  Deno.env.get("SB_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SB_ANON_KEY") ||
  "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type LeaderRow = {
  name: string;
  role: string;
  access_level: string;
  is_active: boolean;
};

async function lookupLeader(email: string): Promise<LeaderRow | null> {
  if (!email) return null;
  const u = `${SUPABASE_URL}/rest/v1/ht_leadership` +
    `?select=name,role,access_level,is_active` +
    `&email=ilike.${encodeURIComponent(email)}` +
    `&limit=1`;
  const r = await fetch(u, {
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
    },
  });
  if (!r.ok) return null;
  const rows = (await r.json()) as LeaderRow[];
  if (!rows.length) return null;
  const row = rows[0];
  if (!row.is_active) return null;
  return row;
}

async function issueMagicLink(email: string, redirectTo: string) {
  const body: Record<string, unknown> = { email, create_user: true };
  if (redirectTo) body.email_redirect_to = redirectTo;
  await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

async function emailFromSession(token: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: ANON_KEY || SECRET_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) return "";
  const u = await r.json();
  return String(u?.email || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const action = String(body.action || "").toLowerCase();

  if (action === "send") {
    const email = String(body.email || "").trim();
    const redirectTo = String(body.redirect_to || "").trim();
    if (email) {
      try {
        const leader = await lookupLeader(email);
        if (leader) await issueMagicLink(email, redirectTo);
      } catch {
        // Swallow — never confirm or deny membership to anonymous callers.
      }
    }
    return json({ ok: true });
  }

  if (action === "verify") {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ ok: false }, 401);
    const email = await emailFromSession(token);
    if (!email) return json({ ok: false }, 401);
    const leader = await lookupLeader(email);
    if (!leader) return json({ ok: false }, 403);
    return json({
      ok: true,
      name: leader.name,
      role: leader.role,
      access: leader.access_level,
    });
  }

  return json({ error: "unknown action" }, 400);
});
