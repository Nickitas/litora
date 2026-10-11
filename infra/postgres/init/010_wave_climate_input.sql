ALTER TABLE scientific_inputs DROP CONSTRAINT scientific_inputs_role_check;
ALTER TABLE scientific_inputs ADD CONSTRAINT scientific_inputs_role_check
  CHECK (role IN (
    'coastline_geojson', 'flat_mesh_msh', 'seabed_msh',
    'bathymetry_grid_json', 'bathymetry_grid_metadata_json',
    'relief_reference_passport_json', 'export_metadata_json',
    'bathymetry_source_json', 'adaptive_field_csv',
    'adaptive_field_report_json', 'wave_climate'
  ));
