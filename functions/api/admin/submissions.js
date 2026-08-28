/* /api/admin/submissions
   GET  ?status=new|replied|spam|all   -> { ok, submissions, counts }
   PATCH { id, status?, note? }        -> { ok }
   Requires a valid admin session cookie. */
import { json, requireAdmin } from "./_auth.js";

const STATUSES = ["new", "replied", "spam"];

export async function onRequest(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "Storage is not configured yet." }, 500);

  if (request.method === "GET") return list(context);
  if (request.method === "PATCH") return patch(context);
  return json({ ok: false, error: "Method not allowed." }, 405);
}

async function list(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status") || "new";

  let rows;
  if (status === "all") {
    rows = await env.DB.prepare(
      "SELECT * FROM submissions ORDER BY created_at DESC LIMIT 500"
    ).all();
  } else {
    const s = STATUSES.includes(status) ? status : "new";
    rows = await env.DB.prepare(
      "SELECT * FROM submissions WHERE status = ? ORDER BY created_at DESC LIMIT 500"
    ).bind(s).all();
  }

  const countRows = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM submissions GROUP BY status"
  ).all();
  const counts = { new: 0, replied: 0, spam: 0, all: 0 };
  for (const r of countRows.results || []) {
    counts[r.status] = r.n;
    counts.all += r.n;
  }

  return json({ ok: true, submissions: rows.results || [], counts });
}

async function patch(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch {}
  const id = Number(body.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "Missing id." }, 400);

  const sets = [];
  const binds = [];
  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) return json({ ok: false, error: "Bad status." }, 400);
    sets.push("status = ?");
    binds.push(body.status);
  }
  if (typeof body.note === "string") {
    sets.push("note = ?");
    binds.push(body.note.slice(0, 2000) || null);
  }
  if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 400);

  binds.push(id);
  await env.DB.prepare(`UPDATE submissions SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return json({ ok: true });
}
