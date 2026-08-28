-- Ramp Up Creative — D1 schema
-- Apply locally:   wrangler d1 execute rampupcreative --local  --file=./schema.sql
-- Apply remote:    wrangler d1 execute rampupcreative --remote --file=./schema.sql
-- Or paste into the Cloudflare dashboard: Workers & Pages > D1 > (database) > Console.

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  message      TEXT NOT NULL,
  page         TEXT,
  source       TEXT NOT NULL DEFAULT 'website',
  ip           TEXT,
  user_agent   TEXT,
  turnstile_ok INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'new',   -- new | replied | spam
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status_created
  ON submissions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT,
  ok         INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_created
  ON auth_attempts (ip, created_at DESC);
