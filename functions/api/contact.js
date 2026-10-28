/* POST /api/contact — validate, anti-spam, store in D1, notify by email. */

const MAX = { name: 120, email: 200, phone: 40, message: 4000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Known spam phone numbers (digits only). Extra numbers can be added without a
// code change via a comma-separated BLOCKED_PHONES env var in the Pages dashboard.
const BLOCKED_PHONES = ["3072076448"];

const digits = (v) => String(v || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

function isSpam(env, { phone, message }) {
  const blocked = BLOCKED_PHONES.concat(
    String(env.BLOCKED_PHONES || "").split(",").map(digits).filter(Boolean)
  );
  if (phone && blocked.includes(digits(phone))) return true;
  if (blocked.some((n) => digits(message).includes(n))) return true;
  // A "message" that is nothing but a phone number is a bot, not an inquiry.
  if (/^[\d\s()+.-]+$/.test(message) && digits(message).length >= 7) return true;
  return false;
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  return handle(context);
}

async function handle(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Honeypot — bots fill hidden fields. Pretend everything is fine.
  if (body.company_website && String(body.company_website).trim() !== "") {
    return json({ ok: true });
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const message = String(body.message || "").trim();
  const page = String(body.page || "").trim().slice(0, 120);

  if (!name || !email || !message) {
    return json({ ok: false, error: "Please fill in your name, email, and a message." }, 400);
  }
  if (name.length > MAX.name || email.length > MAX.email || phone.length > MAX.phone || message.length > MAX.message) {
    return json({ ok: false, error: "One of the fields is too long." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: "That email address doesn't look right." }, 400);
  }

  if (!env.DB) {
    return json({ ok: false, error: "Storage is not configured yet." }, 500);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 400);

  // Basic per-IP flood control: max 5 submissions / 10 minutes.
  if (ip) {
    try {
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-10 minutes')"
      ).bind(ip).first();
      if (recent && recent.n >= 5) {
        return json({ ok: false, error: "Too many messages from this connection. Please try again shortly." }, 429);
      }
    } catch (_) { /* table may not exist yet in dev */ }
  }

  // Cloudflare Turnstile
  let turnstileOk = 0;
  if (env.TURNSTILE_SECRET) {
    const token = String(body.turnstileToken || "");
    if (!token) {
      return json({ ok: false, error: "Please complete the verification checkbox." }, 400);
    }
    try {
      const form = new FormData();
      form.append("secret", env.TURNSTILE_SECRET);
      form.append("response", token);
      if (ip) form.append("remoteip", ip);
      const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: form,
      });
      const outcome = await verify.json();
      turnstileOk = outcome.success ? 1 : 0;
      if (!outcome.success) {
        return json({ ok: false, error: "Verification failed. Please try again." }, 400);
      }
    } catch {
      return json({ ok: false, error: "Verification service unavailable. Please try again." }, 503);
    }
  }

  // Known spam: store it already marked as spam, skip the email, and answer like
  // a success so the bot has nothing to adapt to.
  const spam = isSpam(env, { phone, message });

  let id;
  try {
    const res = await env.DB.prepare(
      "INSERT INTO submissions (name, email, phone, message, page, ip, user_agent, turnstile_ok, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(name, email, phone || null, message, page || null, ip || null, ua || null, turnstileOk, spam ? "spam" : "new").run();
    id = res.meta && res.meta.last_row_id;
  } catch (err) {
    return json({ ok: false, error: "Could not save your message. Please email tyler@rampupcreative.com." }, 500);
  }

  // Email notification (non-blocking, best effort).
  if (env.RESEND_API_KEY && !spam) {
    context.waitUntil(sendEmail(env, { id, name, email, phone, message, page, ip }));
  }

  return json({ ok: true, id });
}

async function sendEmail(env, s) {
  const to = env.NOTIFY_EMAIL || "tyler@rampupcreative.com";
  const from = env.FROM_EMAIL || "Ramp Up Creative <noreply@rampupcreative.com>";
  const esc = (v) => String(v || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const html = `
    <h2>New inquiry — rampupcreative.com</h2>
    <p><strong>Name:</strong> ${esc(s.name)}<br>
       <strong>Email:</strong> ${esc(s.email)}<br>
       <strong>Phone:</strong> ${esc(s.phone) || "—"}<br>
       <strong>Page:</strong> ${esc(s.page) || "—"}<br>
       <strong>Received:</strong> ${new Date().toISOString()}<br>
       <strong>IP:</strong> ${esc(s.ip) || "—"}</p>
    <p style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px">${esc(s.message)}</p>
    <p style="color:#888;font-size:13px">Submission #${s.id} · view all at rampupcreative.com/admin</p>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: s.email,
        subject: `New inquiry from ${s.name}`,
        html,
      }),
    });
  } catch (_) { /* best effort */ }
}
