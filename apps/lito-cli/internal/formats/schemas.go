// Package formats описывает фиксированные структуры научных входов Lito.
// Схемы отражают Go-типы; проверку совместимости и научных критериев выполняет ядро.
package formats

import (
	"reflect"
	"strings"
	"time"

	"coastal-geometry/internal/domain/adaptive"
	"coastal-geometry/internal/domain/geometry"
	"coastal-geometry/internal/domain/seabed"
)

// Specification задаёт версию структуры, размер и формат одного входного файла.
type Specification struct {
	Role          string         `json:"role"`
	SchemaVersion int            `json:"schemaVersion"`
	Format        string         `json:"format"`
	Schema        map[string]any `json:"schema"`
	Columns       []string       `json:"columns,omitempty"`
	Description   string         `json:"description"`
	MaxBytes      int            `json:"maxBytes"`
}

func object(properties map[string]any, required ...string) map[string]any {
	return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
}
func array(items any, minimum int) map[string]any {
	return map[string]any{"type": "array", "items": items, "minItems": minimum}
}
func number(minimum, maximum float64) map[string]any {
	return map[string]any{"type": "number", "minimum": minimum, "maximum": maximum}
}

// JSONSchema строит draft-07-схему по структуре JSON-маршалинга Go, запрещая
// неизвестные поля. Нулевые slices/maps и указатели допускают JSON null.
func JSONSchema(value any) map[string]any { return schemaType(reflect.TypeOf(value)) }

func schemaType(t reflect.Type) map[string]any {
	if t == reflect.TypeOf(time.Time{}) {
		return map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$`}
	}
	if t.Kind() == reflect.Pointer {
		return map[string]any{"anyOf": []any{schemaType(t.Elem()), map[string]any{"type": "null"}}}
	}
	switch t.Kind() {
	case reflect.Struct:
		properties := map[string]any{}
		required := []string{}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			tag := strings.Split(f.Tag.Get("json"), ",")
			if !f.IsExported() || tag[0] == "-" {
				continue
			}
			name := tag[0]
			if name == "" {
				name = f.Name
			}
			properties[name] = schemaType(f.Type)
			if !strings.Contains(f.Tag.Get("json"), "omitempty") {
				required = append(required, name)
			}
		}
		return object(properties, required...)
	case reflect.Slice, reflect.Array:
		s := array(schemaType(t.Elem()), 0)
		if t.Kind() == reflect.Array {
			s["minItems"] = t.Len()
			s["maxItems"] = t.Len()
			return s
		}
		return map[string]any{"anyOf": []any{s, map[string]any{"type": "null"}}}
	case reflect.Map:
		return map[string]any{"anyOf": []any{map[string]any{"type": "object", "additionalProperties": schemaType(t.Elem())}, map[string]any{"type": "null"}}}
	case reflect.String:
		return map[string]any{"type": "string"}
	case reflect.Bool:
		return map[string]any{"type": "boolean"}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return map[string]any{"type": "integer"}
	case reflect.Float32, reflect.Float64:
		return map[string]any{"type": "number"}
	case reflect.Interface:
		return map[string]any{}
	default:
		panic("неподдерживаемый Go-тип формата: " + t.String())
	}
}

// CoastlineSchema описывает GeoJSON WGS84 с двумерными координатами области
// Чёрного моря; стандартные properties Feature остаются метаданными источника.
func CoastlineSchema() map[string]any {
	position := map[string]any{"type": "array", "items": []any{number(27, 42.5), number(40.5, 47.5)}, "minItems": 2, "maxItems": 2, "additionalItems": false}
	line := array(position, 2)
	ring := array(position, 4)
	polygon := array(ring, 1)
	geometries := []any{}
	for _, entry := range []struct {
		name        string
		coordinates any
	}{{"LineString", line}, {"MultiLineString", array(line, 1)}, {"Polygon", polygon}, {"MultiPolygon", array(polygon, 1)}} {
		geometries = append(geometries, object(map[string]any{"type": map[string]any{"const": entry.name}, "coordinates": entry.coordinates}, "type", "coordinates"))
	}
	feature := object(map[string]any{"type": map[string]any{"const": "Feature"}, "geometry": map[string]any{"$ref": "#/$defs/geometry"}, "properties": map[string]any{"type": []string{"object", "null"}}, "id": map[string]any{"type": []string{"string", "number"}}}, "type", "geometry", "properties")
	crs := object(map[string]any{"type": map[string]any{"const": "name"}, "properties": object(map[string]any{"name": map[string]any{"enum": []string{"EPSG:4326", "urn:ogc:def:crs:EPSG::4326", "urn:ogc:def:crs:OGC:1.3:CRS84"}}}, "name")}, "type", "properties")
	collection := object(map[string]any{"type": map[string]any{"const": "FeatureCollection"}, "features": array(map[string]any{"$ref": "#/$defs/feature"}, 1), "name": map[string]any{"type": "string"}, "crs": crs, "totalFeatures": map[string]any{"type": "integer"}, "numberMatched": map[string]any{"type": "integer"}, "numberReturned": map[string]any{"type": "integer"}, "timeStamp": map[string]any{"type": "string"}}, "type", "features")
	return map[string]any{"oneOf": []any{map[string]any{"$ref": "#/$defs/geometry"}, map[string]any{"$ref": "#/$defs/feature"}, collection}, "$defs": map[string]any{"geometry": map[string]any{"oneOf": geometries}, "feature": feature}}
}

// Catalog возвращает все фиксированные входные форматы. Тип отчёта плоской
// сетки передаёт адаптер CLI, пока этот DTO находится в пакете Cobra.
func Catalog(meshReport any) []Specification {
	jsonTypes := []struct {
		role    string
		value   any
		version string
	}{
		{"bathymetry_grid_metadata_json", geometry.BathymetryPassport{}, "1.0"},
		{"export_metadata_json", seabed.ExportMetadata{}, seabed.SeabedMSHSchemaVersion},
		{"relief_reference_passport_json", seabed.ReliefReferencePassport{}, seabed.ReliefReferencePassportSchemaVersion},
		{"adaptive_field_report_json", adaptive.Report{}, adaptive.SchemaVersion},
		{"mesh_comparison_report_json", meshReport, "lito-mesh-comparison/v1"},
		{"adaptive_comparison_report_json", adaptive.AdaptiveComparisonReport{}, adaptive.ComparisonSchemaVersion},
		{"expert_organizer_key_json", adaptive.ExpertSetManifest{}, adaptive.ExpertSetSchemaVersion},
	}
	result := []Specification{}
	add := func(role string, schema map[string]any) {
		schema["$schema"] = "http://json-schema.org/draft-07/schema#"
		schema["$id"] = "urn:litora:input:" + role + ":v1"
		result = append(result, Specification{Role: role, SchemaVersion: 1, Format: "json", Schema: schema, Description: "Фиксированная структура Lito; научную совместимость проверяет Go.", MaxBytes: 64 * 1024 * 1024})
	}
	for _, entry := range jsonTypes {
		s := JSONSchema(entry.value)
		if entry.version != "" {
			s["properties"].(map[string]any)["schema_version"] = map[string]any{"const": entry.version}
		}
		add(entry.role, s)
	}
	add("coastline_geojson", CoastlineSchema())
	add("bathymetry_grid_json", array(object(map[string]any{"lat": number(40.5, 47.5), "lon": number(27, 42.5), "depth": map[string]any{"type": "number"}}, "lat", "lon", "depth"), 1))
	add("wave_climate", object(map[string]any{"source": map[string]any{"type": "string", "minLength": 1}, "conditions": array(JSONSchema(geometry.WaveCondition{}), 1)}, "source", "conditions"))
	observations := array(JSONSchema(geometry.ShorelineRateObservation{}), 1)
	add("shoreline_observations_json", map[string]any{"oneOf": []any{observations, object(map[string]any{"observations": observations}, "observations")}})
	add("longshore_sediment_sources_json", array(JSONSchema(geometry.LongshoreSedimentSource{}), 0))
	add("longshore_structures_json", array(JSONSchema(geometry.LongshoreStructure{}), 0))
	add("bathymetry_source_json", map[string]any{"anyOf": []any{object(map[string]any{"attribution": map[string]any{"type": "string", "minLength": 1}, "dataset_sha256": map[string]any{"type": "string", "pattern": "^[a-fA-F0-9]{64}$"}}, "attribution", "dataset_sha256"), JSONSchema(geometry.BathymetryPassport{})}})
	// CoastSat/наблюдения: свойства измерения фиксированы отдельно от обычного GeoJSON.
	series := CoastlineSchema()
	feature := series["$defs"].(map[string]any)["feature"].(map[string]any)
	feature["properties"].(map[string]any)["geometry"] = object(map[string]any{"type": map[string]any{"const": "LineString"}, "coordinates": array(map[string]any{"type": "array", "items": []any{number(27, 42.5), number(40.5, 47.5)}, "minItems": 2, "maxItems": 2, "additionalItems": false}, 2)}, "type", "coordinates")
	feature["properties"].(map[string]any)["properties"] = object(map[string]any{"date": map[string]any{"type": "string"}, "satname": map[string]any{"type": []string{"string", "null"}}, "geoaccuracy": map[string]any{"type": []string{"number", "null"}}, "cloud_cover": map[string]any{"type": []string{"number", "null"}}, "uncertainty_m": map[string]any{"type": []string{"number", "null"}}, "tide_corrected": map[string]any{"type": []string{"boolean", "null"}}, "water_level_correction": map[string]any{"type": []string{"object", "null"}}}, "date")
	series["oneOf"] = []any{object(map[string]any{"type": map[string]any{"const": "FeatureCollection"}, "features": array(map[string]any{"$ref": "#/$defs/feature"}, 2)}, "type", "features")}
	add("shoreline_timeseries_geojson", series)
	for _, entry := range []struct {
		role, format, description string
		columns                   []string
	}{
		{"flat_mesh_msh", "msh2", "MSH 2.2 ASCII: узлы и двумерные элементы; для построения дна нужна full-quad сетка.", nil},
		{"seabed_msh", "msh2", "MSH 2.2 ASCII с маркерами lito_model_kind=seabed и lito_schema_version=lito-seabed/v1.", nil},
		{"adaptive_field_csv", "csv", "Таблица ADAPT-01 с фиксированными колонками.", []string{"schema_version", "node_id", "x_m", "y_m", "longitude_deg", "latitude_deg", "water_depth_m", "depth_available", "distance_to_coast_m", "coast_curvature_deg", "depth_gradient_deg", "effective_gradient_deg", "gradient_available", "base_size_m", "distance_refinement_m", "curvature_refinement_m", "gradient_refinement_m", "raw_target_size_m", "target_size_m", "growth_limited", "zone"}},
		{"expert_ratings_tsv", "tsv", "Лист AI-01, две строки заголовка и восемь TSV-полей оценки.", []string{"presentation_id", "expert_id", "decision", "geometry", "bathymetry", "suitability", "confidence", "comment"}},
	} {
		result = append(result, Specification{Role: entry.role, SchemaVersion: 1, Format: entry.format, Description: entry.description, Columns: entry.columns, MaxBytes: 512 * 1024 * 1024})
	}
	for i := range result {
		switch result[i].Role {
		case "coastline_geojson", "wave_climate", "shoreline_observations_json", "shoreline_timeseries_geojson":
			result[i].MaxBytes = 16 * 1024 * 1024
		case "longshore_sediment_sources_json", "longshore_structures_json":
			result[i].MaxBytes = 1024 * 1024
		case "mesh_comparison_report_json", "adaptive_comparison_report_json", "expert_organizer_key_json", "expert_ratings_tsv":
			result[i].MaxBytes = 2 * 1024 * 1024
		}
	}
	return result
}
