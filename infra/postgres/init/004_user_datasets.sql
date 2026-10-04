CREATE TABLE datasets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 200),
    license text NOT NULL CHECK (char_length(license) BETWEEN 1 AND 100),
    crs text NOT NULL CHECK (crs = 'EPSG:4326'),
    coordinate_unit text NOT NULL CHECK (coordinate_unit = 'degrees'),
    point_count integer NOT NULL CHECK (point_count BETWEEN 2 AND 500),
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 65536),
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX datasets_owner_created_idx ON datasets(owner_id, created_at DESC);

ALTER TABLE calculation_jobs
    ADD COLUMN dataset_id uuid REFERENCES datasets(id) ON DELETE RESTRICT;
