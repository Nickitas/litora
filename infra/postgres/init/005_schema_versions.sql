ALTER TABLE calculation_jobs
    ADD COLUMN input_schema_version smallint,
    ADD COLUMN result_schema_version smallint,
    ADD CONSTRAINT calculation_jobs_input_schema_version_check
        CHECK (input_schema_version IS NULL OR input_schema_version > 0),
    ADD CONSTRAINT calculation_jobs_result_schema_version_check
        CHECK (result_schema_version IS NULL OR result_schema_version > 0);

-- Старые задания этих видов создавались по той же форме входа v1.
-- Старые результаты не маркируем: их формат нельзя подтвердить задним числом.
UPDATE calculation_jobs SET input_schema_version = 1
WHERE kind IN ('dimension', 'dimension_dataset', 'map', 'erosion');

ALTER TABLE datasets
    ADD COLUMN schema_version smallint NOT NULL DEFAULT 1
        CHECK (schema_version = 1);
