CREATE INDEX IF NOT EXISTS calculation_jobs_user_created_id_idx
    ON calculation_jobs (user_id, created_at DESC, id DESC);
