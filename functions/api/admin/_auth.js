/* Shared admin auth helpers (not a route — underscore prefix). */

const COOKIE = "ru_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function secretKey(env) {
  return env.ADMIN_SECRET || env.ADMIN_PASSWORD || "ru-dev-secret-change-me";
}

const enc = new TextEncoder();

async function hmac(env, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secretKey(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function makeSessionCookie(env) {
  const issued = Date.now();
  const sig = await hmac(env, `${COOKIE}|${issued}`);
  const value = `${issued}.${sig}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

export async function isAuthed(context) {
  const raw = readCookie(context.request, COOKIE);
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return false;
  const issued = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(issued)) return false;
  if (Date.now() - issued > MAX_AGE * 1000) return false;
  const expected = await hmac(context.env, `${COOKIE}|${issued}`);
  return timingSafeEqual(sig, expected);
}

export async function requireAdmin(context) {
  return (await isAuthed(context)) ? null : json({ ok: false, error: "Not authorized." }, 401);
}

export function checkPassword(env, supplied) {
  const real = env.ADMIN_PASSWORD || "1291";
  return timingSafeEqual(String(supplied || ""), String(real));
}
