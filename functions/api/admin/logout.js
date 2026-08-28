/* POST /api/admin/logout — clears the session cookie */
import { clearSessionCookie } from "./_auth.js";

export async function onRequest() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
