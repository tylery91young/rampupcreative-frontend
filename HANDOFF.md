# Project handoff / resume notes

_Last updated: 2026-08-28. Rebuild of rampupcreative.com as a static Cloudflare Pages site._

## How to resume

1. Move this whole folder wherever you want. **Important:** `source-materials/` is
   **gitignored** — it is NOT in git history, so it only survives if you copy the
   folder itself (it holds the WordPress export + all original photos/videos).
2. Start a new Claude Code session **in this folder** and point it at this file plus
   `README.md` and `DEPLOY.md`. All the context needed to continue is in those three
   files + the code.
3. `git log` shows one commit: "Initial rebuild — static site + Pages Functions + admin".
   Nothing has been pushed to GitHub and Cloudflare Pages is not connected yet.

## State — what's done

- **Static site** built from the real WordPress content (no placeholder text):
  Home, About, Real Estate, Construction, Events, Contact, `/admin`, 404.
  Layout/fonts/style matched to the old-site screenshots in `source-materials/`.
- **Build system**: `scripts/build.py` (zero-dep Python), `scripts/serve.py` (local
  preview). Verified working — pages render, images/video load locally, mobile layout
  clean, no JS errors.
- **`scripts/upload_media.py`**: optimises + pushes the real media to R2. **Not run
  yet** — waiting on R2 API credentials.
- **Contact form**: `functions/api/contact.js` → D1 (`schema.sql`), Turnstile +
  honeypot + rate limit, email via Resend. Code complete, not yet tested against a
  real D1 (needs `wrangler` / Node, or a Cloudflare preview deploy).
- **`/admin`**: `functions/api/admin/*` — password login (server-side, signed cookie,
  rate-limited) + triage (replied / spam / notes). Code complete, same testing caveat.

## State — what's pending (in order)

1. **Decide: install Node?** — needed to run the contact form + `/admin` locally via
   `wrangler pages dev`. Alternative: test those on a `*.pages.dev` preview.
2. **Provide R2 credentials** → run `python scripts/upload_media.py` → verify
   `https://media.rampupcreative.com/...` resolves (needs the custom-domain step in
   DEPLOY.md §1c).
3. Review the site locally (`python scripts/serve.py`), tweak copy.
4. Follow **DEPLOY.md**: D1 create + schema, Turnstile keys, Resend domain + key,
   Pages project + env vars + D1 binding.
5. Test on the `.pages.dev` URL (checklist at bottom of DEPLOY.md).
6. **Only then**, with explicit OK: `git push` and connect Cloudflare Pages, then DNS.

## Open questions for Tyler (asked, not yet answered)

- Phone is still **(864) 561-2308** (a Greenville SC area code) — keep, or get a Utah number?
- Does **tyler@rampupcreative.com** actually receive mail? (form notifications + Resend sender)
- Admin password is **`1291`** (weak). Plan: env var now; upgrade to a passphrase or
  Cloudflare Access (DEPLOY.md §8).
- Hero video is **~73 MB** — compress before go-live (README).

## Decisions already made

- "Utah only" — Greenville SC page dropped; its old URL redirects to home (`static/_redirects`).
- Buttons: black primary, red accent on the contact "Send message" (old site was
  mid-redesign with inconsistent colors).
- Nav: About / Real Estate / Events / Contact (matches old live nav; Construction is
  linked from the home cards + footer).
- Media served from `https://media.rampupcreative.com` (set in `config.json`).

## Note on resuming THIS chat

The Claude Code transcript is keyed to the folder path it ran in. After you move the
folder, `claude --resume` from the new location won't auto-match it, but you may still
be able to pick it from the `--resume` list. Either way, this file + README + DEPLOY
carry everything forward.
