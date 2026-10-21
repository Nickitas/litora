CREATE INDEX calculation_jobs_dataset_validation_latest_idx
    ON calculation_jobs(user_id, (dataset_id::text), created_at DESC, id DESC)
    WHERE kind='dataset_validation' AND deletion_requested_at IS NULL;

CREATE INDEX calculation_jobs_coastline_validation_latest_idx
    ON calculation_jobs(user_id, (input->>'coastlineInputId'), created_at DESC, id DESC)
WHERE kind='coastline_validation' AND deletion_requested_at IS NULL;
