SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 10 CHECK (credits >= 0),
  tinyfish_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO wallets(user_id, credits)
SELECT p.user_id, GREATEST(0, 10 - (SELECT count(*)::int FROM searches s WHERE s.user_id = p.user_id AND NOT s.cache_hit))
FROM profiles p
ON CONFLICT (user_id) DO NOTHING;
