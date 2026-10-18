CREATE TABLE worker_instances (
    id uuid PRIMARY KEY,
    resource_profile text NOT NULL CHECK (resource_profile IN ('standard', 'heavy')),
    started_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    stopped_at timestamptz
);

CREATE INDEX worker_instances_active_profile_seen_idx
    ON worker_instances(resource_profile, last_seen_at DESC)
    WHERE stopped_at IS NULL;

CREATE INDEX calculation_jobs_failed_profile_finished_idx
    ON calculation_jobs(resource_profile, finished_at DESC)
    WHERE status='failed' AND user_id IS NOT NULL;
