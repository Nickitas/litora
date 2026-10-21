package coastline

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func TestSourceGeometryChecksOriginalPaths(t *testing.T) {
	tests := []struct {
		name, data, issue string
		accepted          bool
	}{
		{"линия", `{"type":"LineString","coordinates":[[37,43],[37.1,43.1]]}`, "", true},
		{"кольцо", `{"type":"Polygon","coordinates":[[[37,43],[37.1,43],[37.1,43.1],[37,43.1],[37,43]]]}`, "", true},
		{"раздельные линии", `{"type":"MultiLineString","coordinates":[[[37,43],[37.1,43.1]],[[39,43],[39.1,43.1]]]}`, "", true},
		{"самопересечение", `{"type":"LineString","coordinates":[[37,43],[38,44],[37,44],[38,43]]}`, "self_intersection", false},
		{"повторы", `{"type":"LineString","coordinates":[[37,43],[37,43],[37.1,43.1]]}`, "duplicate_point", false},
		{"одна уникальная точка", `{"type":"LineString","coordinates":[[37,43],[37,43]]}`, "too_few_unique_points", false},
		{"другая акватория", `{"type":"LineString","coordinates":[[0,0],[1,1]]}`, "outside_black_sea", false},
		{"точность совпадений ядра", `{"type":"LineString","coordinates":[[37,43],[37.0000004,43.0000004]]}`, "too_few_unique_points", false},
		{"различимые координаты", `{"type":"LineString","coordinates":[[37,43],[37.0000011,43.0000011]]}`, "", true},
		{"ошибка во втором пути", `{"type":"MultiLineString","coordinates":[[[37,43],[38,43]],[[0,0],[1,1]]]}`, "outside_black_sea", false},
		{"некорректный JSON", `{`, "invalid_geojson", false},
		{"третья координата", `{"type":"LineString","coordinates":[[37,43,1],[38,43,2]]}`, "invalid_geojson", false},
		{"null вместо числа", `{"type":"LineString","coordinates":[[37,null],[38,43]]}`, "invalid_geojson", false},
		{"чужой CRS", `{"type":"LineString","crs":{"type":"name","properties":{"name":"EPSG:3857"}},"coordinates":[[37,43],[38,43]]}`, "invalid_geojson", false},
		{"незамкнутое кольцо", `{"type":"Polygon","coordinates":[[[37,43],[38,43],[38,44],[37,44]]]}`, "invalid_geojson", false},
		{"короткое кольцо", `{"type":"Polygon","coordinates":[[[37,43],[38,43],[37,43]]]}`, "invalid_geojson", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := []byte(tt.data)
			before := fmt.Sprintf("%x", sha256.Sum256(data))
			report, err := CheckSourceGeometryBytes(context.Background(), data)
			if err != nil {
				t.Fatal(err)
			}
			if report.Accepted != tt.accepted {
				t.Fatalf("accepted=%v, issues=%+v", report.Accepted, report.Issues)
			}
			if report.SourceSHA256 != before || fmt.Sprintf("%x", sha256.Sum256(data)) != before {
				t.Fatal("Исходник или checksum изменились")
			}
			if tt.issue != "" {
				found := false
				for _, issue := range report.Issues {
					if issue.Code == tt.issue {
						found = true
					}
				}
				if !found {
					t.Fatalf("Нет %s: %+v", tt.issue, report.Issues)
				}
			}
			if tt.name == "ошибка во втором пути" && (report.PathCount != 2 || report.Issues[0].Path != 2) {
				t.Fatalf("Проверен не каждый путь: %+v", report)
			}
		})
	}
}

func TestSourceGeometryResourceLimitsAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CheckSourceGeometryBytes(ctx, []byte(`{}`)); !errors.Is(err, context.Canceled) {
		t.Fatalf("Отмена потеряна: %v", err)
	}
	points := make([][2]float64, maxValidationPathPoints+1)
	for i := range points {
		points[i] = [2]float64{37 + float64(i)/1e6, 43}
	}
	data, err := json.Marshal(struct {
		Type        string       `json:"type"`
		Coordinates [][2]float64 `json:"coordinates"`
	}{"LineString", points})
	if err != nil {
		t.Fatal(err)
	}
	report, err := CheckSourceGeometryBytes(context.Background(), data)
	if err != nil || report.Accepted || !report.Truncated || report.Issues[0].Code != "point_limit" {
		t.Fatalf("Лимит не показан: %+v, %v", report, err)
	}
}
