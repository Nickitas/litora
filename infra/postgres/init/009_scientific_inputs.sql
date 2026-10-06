CREATE TABLE scientific_inputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    role text NOT NULL CHECK (role IN (
        'coastline_geojson', 'flat_mesh_msh', 'seabed_msh',
        'bathymetry_grid_json', 'bathymetry_grid_metadata_json',
        'relief_reference_passport_json', 'export_metadata_json',
        'bathymetry_source_json', 'adaptive_field_csv',
        'adaptive_field_report_json'
    )),
    filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 160),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 536870912),
    source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 200),
    source_revision text CHECK (char_length(source_revision) BETWEEN 1 AND 120),
    license text NOT NULL CHECK (char_length(license) BETWEEN 1 AND 100),
    crs text NOT NULL CHECK (char_length(crs) BETWEEN 1 AND 80),
    coordinate_unit text NOT NULL CHECK (char_length(coordinate_unit) BETWEEN 1 AND 80),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'ready')),
    upload_started_at timestamptz,
    sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    ready_at timestamptz
);

CREATE INDEX scientific_inputs_owner_created_idx
    ON scientific_inputs(owner_id, created_at DESC);

ALTER TABLE calculation_jobs ADD COLUMN resource_profile text NOT NULL DEFAULT 'standard'
    CHECK (resource_profile IN ('standard', 'heavy'));
CREATE INDEX calculation_jobs_profile_queue_idx
    ON calculation_jobs(resource_profile, created_at) WHERE status='queued';
