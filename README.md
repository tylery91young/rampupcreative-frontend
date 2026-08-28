# Ramp Up Creative — website

Static site for **rampupcreative.com**, deployed on **Cloudflare Pages**.
Drone photo/video business, Provo & Utah County.

| Piece | Tech |
|---|---|
| Pages | Hand-written HTML/CSS/JS, assembled by a tiny Python builder (`scripts/build.py`). No Node, no framework. |
| Media (photos/video) | Cloudflare **R2** bucket `rampupcreative-media`, served from `https://media.rampupcreative.com`. Not stored in this repo. |
| Contact form | Cloudflare **Pages Function** (`functions/api/contact.js`) → **D1** database, with **Turnstile** anti-spam + email notification via **Resend**. |
| `/admin` | Password-protected inbox for form submissions, with light triage (mark replied / spam, add notes). |

Full go-live steps (R2, D1, Turnstile, Resend, DNS): see **[DEPLOY.md](DEPLOY.md)**.

---

## Repo layout

```
config.json            site-wide settings (URLs, phone, email, media host, Turnstile site key)
src/                    page bodies + shared header/footer  ← edit content here
  _partials/            base.html (shell), header.html, footer.html
  index.html about.html real-estate.html construction.html events.html contact.html admin.html 404.html
assets/                style.css, main.js, contact.js, admin.js   ← copied verbatim to dist/assets/
static/                robots.txt, sitemap.xml, favicon, _headers, _redirects  ← copied to dist/ root
functions/             Cloudflare Pages Functions (the /api/* endpoints)
schema.sql             D1 database tables
scripts/
  build.py             src/ + assets/ + static/  →  dist/
  serve.py             build + local media + preview server (for design/content work)
  upload_media.py      optimise + push real media to R2   (or build local copies for preview)
source-materials/      original WordPress export + media   (gitignored, never deployed)
dist/                  build output (gitignored — Cloudflare rebuilds it)
```

---

## Local development

### Requirements
- **Python 3.9+** — for the site build. That's all you need to work on layout/content.
- **Node 18+** — only if you want to run the contact form + `/admin` locally (they need the
  Cloudflare Functions runtime). See "Full local testing" below.

### 1. Preview the site (design + copy)

```bash
python scripts/serve.py
# → http://localhost:8000
```

`serve.py` builds the site, makes optimised **local** copies of the real photos into
`dist/media-local/`, and serves everything with clean URLs. Edit anything in `src/`,
`assets/`, or `static/`, then **re-run** the command to rebuild.

Flags: `--port 9000`, `--with-video` (also copy the large local video files),
`--no-media` (skip the local media step — fastest).

Add `?diag=1` to any URL to get a horizontal-overflow report at the bottom of the page.

> On Windows Git Bash, always use `serve.py` for previews. A manual
> `python scripts/build.py --media-base /media-local` can have its path argument
> mangled by MSYS; `serve.py` avoids this.

### 2. Full local testing (contact form + admin)

The form handler and `/admin` are Cloudflare Functions, so they need `wrangler`:

```bash
npm install                       # installs wrangler (dev-only)
cp .dev.vars.example .dev.vars     # then edit values (see below)

npm run db:local                  # one-time: create local D1 db + load schema.sql
npm run dev                       # builds, then runs wrangler pages dev
# → http://localhost:8788   (this one runs the /api/* routes)
```

`.dev.vars` values for local testing:

| var | local value |
|---|---|
| `ADMIN_PASSWORD` | `1291` (or whatever you want to test with) |
| `ADMIN_SECRET` | any long random string — `python -c "import secrets;print(secrets.token_hex(32))"` |
| `TURNSTILE_SECRET` | `1x0000000000000000000000000000000AA` (Cloudflare's "always passes" test key — pairs with the test site key already in `config.json`) |
| `RESEND_API_KEY` | leave blank — email is simply skipped locally |

Then test:
1. Open `http://localhost:8788/contact/`, submit the form → expect a green success message.
2. Open `http://localhost:8788/admin/` → enter `1291` → the submission appears under **New**.
3. Click **Mark replied** / **Mark spam** / **Add note** → row moves between tabs.
4. Submit the form with the hidden "Company website" field filled (via dev tools) → it should
   silently succeed but **not** create a row (honeypot working).

---

## Editing the site later

### Text / copy
Edit the relevant file in `src/` (e.g. `src/about.html`). The bit at the top between
`<!--meta ... -->` is the page title + description for search engines. Re-run
`python scripts/serve.py` to preview, commit, push — Cloudflare rebuilds automatically.

### Phone number, email, social links, copyright year
All in **`config.json`**. Change once, applies everywhere.

### Add photos to the Real Estate gallery
1. Put the new full-size JPGs in `source-materials/uploads/2025/09/` (or a new folder).
2. Add their names to the `GALLERY` list in `scripts/upload_media.py`.
3. Add matching `<a><img></a>` lines to the gallery in `src/real-estate.html`
   (`photos/re/NAME.jpg` for the link, `photos/re/NAME-thumb.jpg` for the image).
4. `python scripts/upload_media.py` to push them to R2.

### Change the admin password
It's the `ADMIN_PASSWORD` environment variable in the Cloudflare Pages project
(**Settings → Environment variables**). Change it there and redeploy — no code change.
`1291` is a weak 4-digit code; see **Security** below.

### The hero video is large
`source-materials/uploads/2025/08/EditedHeroVideo.mp4` is ~73 MB. `upload_media.py` uploads
it as-is and prints a warning. Before go-live, compress it (HandBrake, or
`ffmpeg -i in.mp4 -vf scale=1920:-2 -c:v libx264 -crf 24 -preset slow -an out.mp4`)
to roughly 5–10 MB and replace the source file. Same for the two event videos if needed.

---

## Security

- The contact form is protected by **Cloudflare Turnstile** + a honeypot field + a
  per-IP rate limit (5 submissions / 10 min). Your old form was getting bot-spammed;
  this should stop it.
- `/admin` login is checked **server-side** (the password never reaches the browser),
  the session is a signed `HttpOnly` cookie, and failed logins are rate-limited
  (8 tries / 15 min / IP).
- **`1291` is still weak.** Recommended, in order of effort:
  1. Set `ADMIN_PASSWORD` to a long passphrase (Pages env var, no redeploy of code).
  2. Better: put `/admin*` behind **Cloudflare Access** (free, emails you a one-time
     code, no password to manage). Steps in DEPLOY.md.

---

## Deploy

Nothing is pushed or connected yet. When you're ready, follow **[DEPLOY.md](DEPLOY.md)**.
