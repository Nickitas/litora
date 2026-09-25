ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS access_token_hash text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_access_idx ON auth_sessions(access_token_hash);
ALTER TABLE calculation_jobs ADD COLUMN IF NOT EXISTS worker_id uuid;
ALTER TABLE calculation_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
CREATE TABLE IF NOT EXISTS auth_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL);
