import { getSql } from './client';

// Idempotent schema, applied automatically on first use (no manual migration step).
export const migrations = [
`SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  location_country_code TEXT NOT NULL DEFAULT '',
  seniority TEXT NOT NULL DEFAULT 'any' CHECK (seniority IN ('intern', 'new_grad', 'mid', 'any')),
  work_mode TEXT NOT NULL DEFAULT 'any' CHECK (work_mode IN ('onsite', 'hybrid', 'remote', 'any')),
  visa TEXT NOT NULL DEFAULT 'any' CHECK (visa IN ('needs_sponsorship', 'no', 'any')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 2097152),
  extracted_text TEXT NOT NULL DEFAULT '',
  file_data BYTEA NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active_per_user ON resumes(user_id);

CREATE TABLE IF NOT EXISTS searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  preference_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  error TEXT,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  search_count INTEGER NOT NULL DEFAULT 0,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  agent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS search_events (
  id BIGSERIAL PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('search', 'fetch', 'agent', 'parse', 'rank')),
  host TEXT,
  url TEXT,
  ok BOOLEAN NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  seniority TEXT NOT NULL DEFAULT 'unknown',
  work_mode TEXT NOT NULL DEFAULT 'unknown',
  visa_signal TEXT NOT NULL DEFAULT 'unknown',
  snippet TEXT NOT NULL DEFAULT '',
  apply_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  match_reasons TEXT[] NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden BOOLEAN NOT NULL DEFAULT false,
  hidden_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_search_dedupe ON listings(search_id, dedupe_key);
CREATE INDEX IF NOT EXISTS listings_user_fetched ON listings(user_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS search_events_search_created ON search_events(search_id, created_at);
CREATE INDEX IF NOT EXISTS search_events_host_created ON search_events(host, created_at DESC);
CREATE INDEX IF NOT EXISTS searches_user_created ON searches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  host TEXT PRIMARY KEY,
  last_ok_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  ok_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT false
);`,
`SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 10 CHECK (credits >= 0),
  tinyfish_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO wallets(user_id, credits)
SELECT p.user_id, GREATEST(0, 10 - (SELECT count(*)::int FROM searches s WHERE s.user_id = p.user_id AND NOT s.cache_hit))
FROM profiles p
ON CONFLICT (user_id) DO NOTHING;`,
`ALTER TABLE preferences ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS uncertainties TEXT[] NOT NULL DEFAULT '{}'`,
`CREATE TABLE IF NOT EXISTS credit_ledger (id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE, delta INTEGER NOT NULL, reason TEXT NOT NULL, search_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger(user_id, id);
INSERT INTO credit_ledger(user_id, delta, reason) SELECT w.user_id, w.credits, 'opening_balance' FROM wallets w WHERE NOT EXISTS (SELECT 1 FROM credit_ledger c WHERE c.user_id = w.user_id);
UPDATE searches SET status='error', error='Closed during upgrade: duplicate running hunt.', finished_at=now() WHERE status='running' AND id NOT IN (SELECT DISTINCT ON (user_id) id FROM searches WHERE status='running' ORDER BY user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_search_per_user ON searches(user_id) WHERE status='running';
CREATE UNIQUE INDEX IF NOT EXISTS search_request_once ON searches(user_id, (preference_snapshot->>'request_id')) WHERE preference_snapshot->>'request_id' IS NOT NULL`,
`CREATE TABLE IF NOT EXISTS hunt_jobs (
  search_id UUID PRIMARY KEY REFERENCES searches(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  checkpoint JSONB,
  workflow_id TEXT,
  dispatch_id TEXT,
  dispatch_token UUID,
  dispatch_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hunt_jobs_dispatch ON hunt_jobs(dispatch_after);
CREATE TABLE IF NOT EXISTS hunt_agents (
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  marker TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'launching' CHECK (status IN ('launching','pending','completed','failed','cancelled','unknown')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (search_id,url)
);
CREATE INDEX IF NOT EXISTS search_events_search_id ON search_events(search_id,id)`,
];

let ready: Promise<void> | undefined;
export function ensureSchema() {
  ready ??= (async () => {
    const sql = getSql();
    for (const migration of migrations) {
      await sql.transaction(migration.split(';').map(statement => statement.trim()).filter(Boolean).map(statement => sql.query(statement, [])));
    }
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
