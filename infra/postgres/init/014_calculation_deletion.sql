ALTER TABLE calculation_jobs ADD COLUMN deletion_requested_at timestamptz;

CREATE TABLE calculation_job_dependencies (
    dependent_job_id uuid NOT NULL REFERENCES calculation_jobs(id) ON DELETE CASCADE,
    source_job_id uuid NOT NULL REFERENCES calculation_jobs(id) ON DELETE RESTRICT,
    PRIMARY KEY (dependent_job_id, source_job_id),
    CHECK (dependent_job_id <> source_job_id)
);
CREATE INDEX calculation_job_dependencies_source_idx ON calculation_job_dependencies(source_job_id);

-- Старые задания ссылались на артефакты по UUID внутри input, без явного FK.
INSERT INTO calculation_job_dependencies(dependent_job_id, source_job_id)
SELECT DISTINCT job.id, artifact.job_id
FROM calculation_jobs job
CROSS JOIN LATERAL jsonb_each_text(job.input) field
JOIN calculation_artifacts artifact ON artifact.id::text = field.value
WHERE field.key LIKE '%InputId' AND artifact.job_id <> job.id
ON CONFLICT DO NOTHING;

CREATE TABLE calculation_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope text NOT NULL CHECK (scope IN ('single', 'all')),
    requested_count integer NOT NULL CHECK (requested_count >= 0),
    deleted_count integer NOT NULL DEFAULT 0 CHECK (deleted_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calculation_deletion_requests_owner_idx
    ON calculation_deletion_requests(user_id, created_at DESC);

CREATE TABLE calculation_deletion_items (
    request_id uuid NOT NULL REFERENCES calculation_deletion_requests(id) ON DELETE CASCADE,
    job_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'deleted')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    locked_at timestamptz,
    lock_token uuid,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    error_code text,
    PRIMARY KEY (request_id, job_id)
);
CREATE INDEX calculation_deletion_items_claim_idx
    ON calculation_deletion_items(status, next_attempt_at);

-- Старые завершённые задания считаются покинутыми worker только после окна
-- совместимости. Новый worker обнуляет worker_id в finally.
UPDATE calculation_jobs SET worker_id=NULL
WHERE status IN ('succeeded', 'failed', 'cancelled')
  AND finished_at < now() - interval '1 hour';
