# Deploy runbook — rampupcreative.com

Do these in order. Nothing here is destructive to the live WordPress site until the
very last step (DNS). You can build the whole thing on a `*.pages.dev` preview URL first.

Legend: 🖥️ = Cloudflare dashboard, ⌨️ = terminal in this repo.

---

## 0. Prereqs

- Cloudflare account with `rampupcreative.com` already added as a zone (it is — Pages
  and R2 are on the same account).
- ⌨️ `npm install` (gets `wrangler`) and `npx wrangler login` once.

---

## 1. R2 media  →  `media.rampupcreative.com`

### 1a. API token for uploads
🖥️ **R2 → API → "Manage API Tokens" → Create API token**
- Permissions: **Object Read & Write**
- Scope: bucket `rampupcreative-media` only
- Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID**
  (Account ID is on the R2 overview page).

### 1b. Upload the media
⌨️ from the repo:
```bash
pip install -r requirements-dev.txt

export R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx
export R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# (bucket name defaults to rampupcreative-media)

python scripts/upload_media.py            # optimises + uploads ~50 images + 3 videos
```
Re-runnable; it skips objects that already exist (`--force` to replace, `--skip-video`
for images only). It writes `media-manifest.json` (a record of what went where).

> **Hero video** is ~73 MB. The script warns about it. Ideally compress
> `source-materials/uploads/2025/08/EditedHeroVideo.mp4` to ~5–10 MB first
> (see README → "The hero video is large"), then run the upload.

### 1c. Custom domain on the bucket
🖥️ **R2 → `rampupcreative-media` → Settings → Public access → "Connect Domain"**
- Domain: `media.rampupcreative.com`
- Cloudflare adds the DNS record automatically (proxied). Wait for "Active".

Check: `https://media.rampupcreative.com/photos/hero/real-estate.jpg` loads in a browser.
The site already points at `https://media.rampupcreative.com` (`config.json → media_base`).

*(Alternative if you don't want the subdomain: enable the r2.dev URL instead and set
`media_base` in `config.json` to that URL. Not recommended for production — it's
rate-limited.)*

---

## 2. D1 database (contact form storage)

⌨️:
```bash
npx wrangler d1 create rampupcreative
```
Copy the `database_id` it prints into **`wrangler.toml`** (replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID`).

Load the schema into the **remote** database:
```bash
npx wrangler d1 execute rampupcreative --remote --file=./schema.sql
```

---

## 3. Turnstile (contact form anti-spam)

🖥️ **Turnstile → Add site**
- Domain: `rampupcreative.com` (add `*.pages.dev` too while testing)
- Widget mode: **Managed**
- Copy the **Site Key** and **Secret Key**.

Put the **Site Key** in `config.json → turnstile_site_key` (commit that — it's public).
The **Secret Key** goes in Pages env vars (step 5).

---

## 4. Resend (email notification on new inquiry)

🖥️ [resend.com](https://resend.com) → sign up → **Domains → Add** `rampupcreative.com`
→ add the DKIM/SPF DNS records it gives you into Cloudflare DNS → wait for "Verified".
Then **API Keys → Create** (Sending access). Copy the key.

- `NOTIFY_EMAIL` = `tyler@rampupcreative.com` (make sure that inbox actually receives
  mail — if it doesn't, use an address that does).
- `FROM_EMAIL` = something on the verified domain, e.g. `Ramp Up Creative <noreply@rampupcreative.com>`.

*(If you skip Resend, submissions are still saved and visible in `/admin` — you just
won't get an email. Leave `RESEND_API_KEY` unset.)*

---

## 5. Cloudflare Pages project

🖥️ **Workers & Pages → Create → Pages → Connect to Git** → pick
`tylery91young/rampupcreative-frontend` (after you've pushed it — see step 6).

Build settings:
| Field | Value |
|---|---|
| Production branch | `main` |
| Build command | `python3 scripts/build.py` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |

**Settings → Functions → D1 database bindings:** add binding **`DB`** → database `rampupcreative`.

**Settings → Environment variables** (Production — add to Preview too if you want the
preview URL fully working). Mark the secret ones as "Encrypt":

| Name | Value | Encrypt |
|---|---|---|
| `ADMIN_PASSWORD` | your admin password (start with `1291`, change later) | ✅ |
| `ADMIN_SECRET` | `python -c "import secrets;print(secrets.token_hex(32))"` | ✅ |
| `TURNSTILE_SECRET` | from step 3 | ✅ |
| `RESEND_API_KEY` | from step 4 (or omit) | ✅ |
| `NOTIFY_EMAIL` | `tyler@rampupcreative.com` | — |
| `FROM_EMAIL` | `Ramp Up Creative <noreply@rampupcreative.com>` | — |

Trigger a deploy (Deployments → Retry, or push a commit). You get a
`rampupcreative-frontend.pages.dev` URL — **test everything there first** (see checklist).

---

## 6. Push the repo

Only after the review in "Testing checklist" passes locally:
```bash
git add -A
git commit -m "Rebuild rampupcreative.com as a static Cloudflare Pages site"
git branch -M main
git push -u origin main
```
Then connect Pages (step 5) to the pushed repo.

---

## 7. Go live (DNS cutover)

Once the `.pages.dev` URL is fully working:

🖥️ **Pages project → Custom domains → Set up a custom domain** → `rampupcreative.com`
and `www.rampupcreative.com`. Cloudflare updates the DNS records from the old
WordPress host to the Pages project.

- The `_redirects` file already maps old WordPress paths (`/home/`, `/services/`,
  `/drone-photography-video-in-greenville-sc/`, …) to the new pages.
- Keep the old WordPress host up for a week in case you need to grab anything.

---

## 8. (Recommended) Lock down /admin with Cloudflare Access

🖥️ **Zero Trust → Access → Applications → Add → Self-hosted**
- Subdomain/path: `rampupcreative.com` `/admin`
- Also add a second app for `/api/admin` (same policy).
- Policy: **Allow** → Emails → `tyler64apache@gmail.com` (and any other you want).
- Session duration: 24h.

Now `/admin` requires a one-time email code before the page even loads — the `1291`
password becomes a second layer rather than the only one. Free for up to 50 users.

---

## Testing checklist (run on the `.pages.dev` URL before DNS cutover)

- [ ] Every page loads; header nav + mobile menu work.
- [ ] All images and the hero video load from `media.rampupcreative.com` (check dev
      tools → Network → no 404s).
- [ ] Real Estate gallery: thumbnails load, clicking opens the lightbox, arrows/Esc work.
- [ ] Contact form: Turnstile checkbox appears → submit → green success →
      row appears in D1 (`npx wrangler d1 execute rampupcreative --remote --command "SELECT * FROM submissions"`)
      → email arrives at `NOTIFY_EMAIL`.
- [ ] `/admin` → wrong password rejected → correct password shows the inbox →
      the test submission is there → triage buttons work.
- [ ] `/admin` is `noindex` and not in `sitemap.xml`; `/api/*` returns JSON only.
- [ ] Old URL redirects: visit `…/home/`, `…/services/`, `…/drone-photography-video-in-greenville-sc/`.
- [ ] Lighthouse (mobile) ≥ 90 performance — if not, the hero video is usually the cause.
- [ ] Submit ~6 rapid form posts → the 6th is rate-limited (HTTP 429).
