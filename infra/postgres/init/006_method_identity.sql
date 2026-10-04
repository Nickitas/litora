ALTER TABLE calculation_jobs
    ADD COLUMN method_id text,
    ADD COLUMN method_revision text,
    ADD CONSTRAINT calculation_jobs_method_pair_check
        CHECK ((method_id IS NULL) = (method_revision IS NULL));

-- Старые результаты не получают вымышленную ревизию задним числом.
