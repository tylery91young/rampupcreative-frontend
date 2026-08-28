/* POST /api/admin/login  { password }  -> sets session cookie */
import { json, makeSessionCookie, checkPassword } from "./_auth.js";

const WINDOW_MIN = 15;
const MAX_TRIES = 8;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const ip = request.headers.get("CF-Connecting-IP") || "";

  // Lockout: too many recent attempts from this IP.
  if (env.DB && ip) {
    try {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM auth_attempts
         WHERE ip = ? AND ok = 0 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-${WINDOW_MIN} minutes')`
      ).bind(ip).first();
      if (row && row.n >= MAX_TRIES) {
        return json({ ok: false, error: "Too many attempts. Wait 15 minutes and try again." }, 429);
      }
    } catch (_) {}
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const ok = checkPassword(env, body.password);

  if (env.DB) {
    context.waitUntil(
      env.DB.prepare("INSERT INTO auth_attempts (ip, ok) VALUES (?, ?)")
        .bind(ip || null, ok ? 1 : 0).run().catch(() => {})
    );
  }

  if (!ok) return json({ ok: false, error: "Incorrect password." }, 401);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": await makeSessionCookie(env),
    },
  });
}
