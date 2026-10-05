SET LOCAL search_path = public;

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
);
