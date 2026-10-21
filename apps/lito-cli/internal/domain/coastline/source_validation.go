package coastline

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"coastal-geometry/internal/domain/blacksea"
	"coastal-geometry/internal/domain/geometry"
)

const maxValidationBytes = 16 * 1024 * 1024
const maxValidationPathPoints = 20_000
const maxValidationTotalPoints = 50_000
const maxValidationIssues = 200

// SourceValidationIssue описывает замечание к исходной геометрии; индексы начинаются с 1.
type SourceValidationIssue struct {
	Severity     string `json:"severity"`
	Code         string `json:"code"`
	Message      string `json:"message"`
	Path         int    `json:"path,omitempty"`
	Point        int    `json:"point,omitempty"`
	Segment      int    `json:"segment,omitempty"`
	OtherSegment int    `json:"otherSegment,omitempty"`
}

// SourceValidationReport хранит проверку всех исходных путей без изменения координат.
// Принятие геометрии не аттестует точность съёмки и пригодность для прогноза.
type SourceValidationReport struct {
	SchemaVersion string                  `json:"schemaVersion"`
	Accepted      bool                    `json:"accepted"`
	SourceSHA256  string                  `json:"sourceSha256"`
	SourceBytes   int                     `json:"sourceBytes"`
	PathCount     int                     `json:"pathCount"`
	PointCount    int                     `json:"pointCount"`
	Truncated     bool                    `json:"truncated"`
	Issues        []SourceValidationIssue `json:"issues"`
}

func (report *SourceValidationReport) add(issue SourceValidationIssue) {
	if issue.Severity == "error" {
		report.Accepted = false
	}
	if len(report.Issues) >= maxValidationIssues {
		report.Truncated = true
		report.Accepted = false
		return
	}
	if message := []rune(issue.Message); len(message) > 500 {
		issue.Message = string(message[:500]) + "…"
	}
	report.Issues = append(report.Issues, issue)
}

// CheckSourceGeometry проверяет GeoJSON в ограниченных ресурсах, не исправляя исходник.
func CheckSourceGeometry(ctx context.Context, path string) (SourceValidationReport, error) {
	if err := ctx.Err(); err != nil {
		return SourceValidationReport{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return SourceValidationReport{}, fmt.Errorf("открытие береговой линии: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxValidationBytes+1))
	if err != nil {
		return SourceValidationReport{}, fmt.Errorf("чтение береговой линии: %w", err)
	}
	if len(data) > maxValidationBytes {
		return SourceValidationReport{}, fmt.Errorf("GeoJSON для проверки превышает 16 МиБ")
	}
	return CheckSourceGeometryBytes(ctx, data)
}

// CheckSourceGeometryBytes проверяет самостоятельные линии и кольца GeoJSON в Go.
func CheckSourceGeometryBytes(ctx context.Context, data []byte) (SourceValidationReport, error) {
	if err := ctx.Err(); err != nil {
		return SourceValidationReport{}, err
	}
	report := SourceValidationReport{SchemaVersion: "litora-coastline-validation/v1", Accepted: true,
		SourceSHA256: fmt.Sprintf("%x", sha256.Sum256(data)), SourceBytes: len(data), Issues: []SourceValidationIssue{}}
	if len(data) > maxValidationBytes {
		report.add(SourceValidationIssue{Severity: "error", Code: "byte_limit", Message: "Проверка принимает GeoJSON до 16 МиБ"})
		return report, nil
	}
	if err := checkValidationDimensions(data, 0); err != nil {
		report.add(SourceValidationIssue{Severity: "error", Code: "invalid_geojson", Message: "Требуется двумерный GeoJSON WGS84: " + err.Error()})
		return report, nil
	}
	paths, err := parseGeoJSONSequences(data)
	if err != nil {
		report.add(SourceValidationIssue{Severity: "error", Code: "invalid_geojson", Message: "Не удалось прочитать линии GeoJSON: " + err.Error()})
		return report, nil
	}
	report.PathCount = len(paths)
	if len(paths) == 0 {
		report.add(SourceValidationIssue{Severity: "error", Code: "empty", Message: "В GeoJSON нет береговых линий"})
	}
	for index, points := range paths {
		if err := ctx.Err(); err != nil {
			return SourceValidationReport{}, err
		}
		report.PointCount += len(points)
		if report.PointCount > maxValidationTotalPoints || len(points) > maxValidationPathPoints {
			report.add(SourceValidationIssue{Severity: "error", Code: "point_limit", Path: index + 1,
				Message: "Ресурсный предел проверки: до 20 000 точек в линии и 50 000 всего; разделите исходник на участки"})
			report.Truncated = true
			return report, nil
		}
		if err := checkSourcePath(ctx, points, index+1, &report); err != nil {
			return SourceValidationReport{}, err
		}
		if report.Truncated {
			return report, nil
		}
	}
	return report, nil
}

func checkValidationDimensions(data json.RawMessage, depth int) error {
	if depth > 8 {
		return fmt.Errorf("превышена вложенность геометрии")
	}
	var object struct {
		Type        string            `json:"type"`
		Geometry    json.RawMessage   `json:"geometry"`
		Features    []json.RawMessage `json:"features"`
		Coordinates json.RawMessage   `json:"coordinates"`
		CRS         json.RawMessage   `json:"crs"`
	}
	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}
	if len(object.CRS) > 0 && string(object.CRS) != "null" {
		var crs struct {
			Type       string `json:"type"`
			Properties struct {
				Name string `json:"name"`
			} `json:"properties"`
		}
		if err := json.Unmarshal(object.CRS, &crs); err != nil || crs.Type != "name" ||
			(crs.Properties.Name != "EPSG:4326" && crs.Properties.Name != "urn:ogc:def:crs:EPSG::4326") {
			return fmt.Errorf("явно заданная система координат должна быть EPSG:4326")
		}
	}
	switch object.Type {
	case "FeatureCollection":
		for _, feature := range object.Features {
			if err := checkValidationDimensions(feature, depth+1); err != nil {
				return err
			}
		}
		return nil
	case "Feature":
		return checkValidationDimensions(object.Geometry, depth+1)
	case "Polygon":
		if err := checkValidationRings(object.Coordinates); err != nil {
			return err
		}
		return checkCoordinateDimensions(object.Coordinates, 0)
	case "MultiPolygon":
		var polygons []json.RawMessage
		if err := json.Unmarshal(object.Coordinates, &polygons); err != nil {
			return err
		}
		for _, polygon := range polygons {
			if err := checkValidationRings(polygon); err != nil {
				return err
			}
		}
		return checkCoordinateDimensions(object.Coordinates, 0)
	case "LineString", "MultiLineString":
		return checkCoordinateDimensions(object.Coordinates, 0)
	default:
		return fmt.Errorf("поддерживаются линии и кольца GeoJSON")
	}
}

func checkValidationRings(data json.RawMessage) error {
	var rings [][][]float64
	if err := json.Unmarshal(data, &rings); err != nil {
		return err
	}
	for _, ring := range rings {
		if len(ring) < 4 || len(ring[0]) != 2 || len(ring[len(ring)-1]) != 2 ||
			ring[0][0] != ring[len(ring)-1][0] || ring[0][1] != ring[len(ring)-1][1] {
			return fmt.Errorf("кольцо Polygon должно содержать минимум четыре координаты и точно замыкаться")
		}
	}
	return nil
}

func checkCoordinateDimensions(data json.RawMessage, depth int) error {
	if depth > 4 {
		return fmt.Errorf("неподдерживаемая вложенность координат")
	}
	var values []json.RawMessage
	if err := json.Unmarshal(data, &values); err != nil {
		return err
	}
	if len(values) == 0 {
		return fmt.Errorf("пустые координаты")
	}
	if len(values[0]) > 0 && values[0][0] == '[' {
		for _, value := range values {
			if err := checkCoordinateDimensions(value, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if len(values) != 2 {
		return fmt.Errorf("каждая координата должна быть парой [долгота, широта]")
	}
	for _, value := range values {
		if len(value) == 0 || string(value) == "null" {
			return fmt.Errorf("координаты должны быть конечными числами")
		}
		var number float64
		if err := json.Unmarshal(value, &number); err != nil || !finiteRegion(number) {
			return fmt.Errorf("координаты должны быть конечными числами")
		}
	}
	return nil
}

func checkSourcePath(ctx context.Context, points []geometry.LatLon, path int, report *SourceValidationReport) error {
	if len(points) < 2 {
		report.add(SourceValidationIssue{Severity: "error", Code: "too_few_points", Path: path, Message: "Линия должна содержать минимум две точки"})
		return nil
	}
	closed := isClosedPolyline(points)
	seen := make(map[string]int)
	validCoordinates := true
	for i, point := range points {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !finiteRegion(point.Lat) || !finiteRegion(point.Lon) || !blacksea.Contains(point.Lat, point.Lon) {
			validCoordinates = false
			report.add(SourceValidationIssue{Severity: "error", Code: "outside_black_sea", Path: path, Point: i + 1,
				Message: fmt.Sprintf("Линия %d, точка %d: требуются конечные координаты WGS84 в области Чёрного моря", path, i+1)})
		}
		if closed && i == len(points)-1 {
			continue
		}
		key := pointKey(point)
		if first, exists := seen[key]; exists {
			report.add(SourceValidationIssue{Severity: "error", Code: "duplicate_point", Path: path, Point: i + 1,
				Message: fmt.Sprintf("Линия %d: точки %d и %d совпадают с точностью ядра до 6 знаков координат", path, first, i+1)})
		} else {
			seen[key] = i + 1
		}
		if report.Truncated {
			return nil
		}
	}
	if len(seen) < 2 {
		report.add(SourceValidationIssue{Severity: "error", Code: "too_few_unique_points", Path: path, Message: "После учёта совпадающих координат осталось меньше двух точек"})
		return nil
	}
	if !validCoordinates {
		return nil
	}
	for i := 0; i < len(points)-1; i++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		for j := i + 2; j < len(points)-1; j++ {
			if j%256 == 0 {
				if err := ctx.Err(); err != nil {
					return err
				}
			}
			if closed && i == 0 && j == len(points)-2 {
				continue
			}
			if segmentsIntersect(points[i], points[i+1], points[j], points[j+1]) {
				report.add(SourceValidationIssue{Severity: "error", Code: "self_intersection", Path: path, Segment: i + 1, OtherSegment: j + 1,
					Message: fmt.Sprintf("Линия %d: пересекаются сегменты %d и %d", path, i+1, j+1)})
				if report.Truncated {
					return nil
				}
			}
		}
	}
	for _, warning := range longSegmentWarnings(points, longSegmentWarningKM) {
		report.add(SourceValidationIssue{Severity: "warning", Code: "long_segment", Path: path, Message: warning})
	}
	return nil
}
