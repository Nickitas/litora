package coastline

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math"
	"os"

	"coastal-geometry/internal/domain/blacksea"
	"coastal-geometry/internal/domain/geometry"
)

// RegionSegment хранит самостоятельный участок исходной линии без соединения разрывов.
type RegionSegment struct {
	ID         string            `json:"id"`
	SourcePath int               `json:"source_path"`
	Points     []geometry.LatLon `json:"-"`
	PointCount int               `json:"point_count"`
	LengthKM   float64           `json:"length_km"`
	Closed     bool              `json:"closed"`
	File       string            `json:"file"`
}

// RegionSelection описывает воспроизводимое выделение области WGS84.
type RegionSelection struct {
	SchemaVersion  string          `json:"schema_version"`
	CRS            string          `json:"crs"`
	CoordinateUnit string          `json:"coordinate_unit"`
	Bounds         blacksea.Bounds `json:"bounds"`
	SourceSHA256   string          `json:"source_sha256"`
	SourcePaths    int             `json:"source_paths"`
	Segments       []RegionSegment `json:"segments"`
}

// SelectRegion обрезает каждый путь GeoJSON рамкой; не добавляет берег вдоль рамки
// и не объединяет разные острова или раздельные фрагменты побережья.
func SelectRegion(ctx context.Context, path string, bounds GeoBounds) (RegionSelection, error) {
	if err := ValidateRegionBounds(bounds); err != nil {
		return RegionSelection{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return RegionSelection{}, fmt.Errorf("чтение контура для области: %w", err)
	}
	if err := validateBundledBlackSea(path, data); err != nil {
		return RegionSelection{}, err
	}
	paths, err := parseGeoJSONSequences(data)
	if err != nil {
		return RegionSelection{}, fmt.Errorf("контур области должен быть GeoJSON: %w", err)
	}
	result := RegionSelection{SchemaVersion: "lito-coastline-region/v1", CRS: "EPSG:4326", CoordinateUnit: "degree", Bounds: blacksea.Bounds{MinLat: bounds.MinLat, MaxLat: bounds.MaxLat, MinLon: bounds.MinLon, MaxLon: bounds.MaxLon}, SourceSHA256: fmt.Sprintf("%x", sha256.Sum256(data)), SourcePaths: len(paths), Segments: []RegionSegment{}}
	for index, points := range paths {
		if err := ctx.Err(); err != nil {
			return RegionSelection{}, err
		}
		for i, point := range points {
			if !finiteRegion(point.Lat) || !finiteRegion(point.Lon) || !blacksea.Contains(point.Lat, point.Lon) {
				return RegionSelection{}, fmt.Errorf("путь %d, точка %d: требуются координаты WGS84 в области Чёрного моря", index+1, i+1)
			}
		}
		for _, part := range clipPolyline(points, bounds) {
			id := fmt.Sprintf("segment-%03d", len(result.Segments)+1)
			if len(result.Segments) >= 200 {
				return RegionSelection{}, fmt.Errorf("в области более 200 отдельных линий; уменьшите область")
			}
			result.Segments = append(result.Segments, RegionSegment{ID: id, SourcePath: index + 1, Points: part, PointCount: len(part), LengthKM: geometry.PolylineLength(part), Closed: sameRegionPoint(part[0], part[len(part)-1]), File: "region/segments/" + id + ".geojson"})
		}
	}
	if len(result.Segments) == 0 {
		return RegionSelection{}, fmt.Errorf("в выбранной области нет береговой линии; измените границы области")
	}
	return result, nil
}

// ValidateRegionBounds проверяет конечность и порядок границ в области Чёрного моря.
func ValidateRegionBounds(bounds GeoBounds) error {
	for _, value := range []float64{bounds.MinLat, bounds.MaxLat, bounds.MinLon, bounds.MaxLon} {
		if !finiteRegion(value) {
			return fmt.Errorf("границы области должны быть конечными числами")
		}
	}
	if bounds.MinLat >= bounds.MaxLat || bounds.MinLon >= bounds.MaxLon || !blacksea.Contains(bounds.MinLat, bounds.MinLon) || !blacksea.Contains(bounds.MaxLat, bounds.MaxLon) {
		return fmt.Errorf("задайте запад < восток и юг < север в пределах области Чёрного моря")
	}
	return nil
}

func finiteRegion(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func sameRegionPoint(a, b geometry.LatLon) bool {
	return math.Abs(a.Lat-b.Lat) < 1e-11 && math.Abs(a.Lon-b.Lon) < 1e-11
}

func clipPolyline(points []geometry.LatLon, bounds GeoBounds) [][]geometry.LatLon {
	parts := [][]geometry.LatLon{}
	var current []geometry.LatLon
	flush := func() {
		if len(current) >= 2 {
			parts = append(parts, current)
		}
		current = nil
	}
	for i := 1; i < len(points); i++ {
		a, b, ok := clipRegionEdge(points[i-1], points[i], bounds)
		if !ok {
			flush()
			continue
		}
		if sameRegionPoint(a, b) {
			continue
		}
		if len(current) > 0 && !sameRegionPoint(current[len(current)-1], a) {
			flush()
		}
		if len(current) == 0 {
			current = append(current, a)
		}
		current = append(current, b)
	}
	flush()
	// Начало замкнутого кольца — произвольная точка источника, а не разрыв берега.
	if len(parts) > 1 && len(points) > 1 && sameRegionPoint(points[0], points[len(points)-1]) && sameRegionPoint(parts[len(parts)-1][len(parts[len(parts)-1])-1], parts[0][0]) {
		merged := append(append([]geometry.LatLon{}, parts[len(parts)-1]...), parts[0][1:]...)
		parts[0] = merged
		parts = parts[:len(parts)-1]
	}
	return parts
}

// clipRegionEdge использует параметрическое отсечение Лианга — Барски.
func clipRegionEdge(a, b geometry.LatLon, bounds GeoBounds) (geometry.LatLon, geometry.LatLon, bool) {
	dx, dy := b.Lon-a.Lon, b.Lat-a.Lat
	t0, t1 := 0.0, 1.0
	p := []float64{-dx, dx, -dy, dy}
	q := []float64{a.Lon - bounds.MinLon, bounds.MaxLon - a.Lon, a.Lat - bounds.MinLat, bounds.MaxLat - a.Lat}
	for i := range p {
		if p[i] == 0 {
			if q[i] < 0 {
				return a, b, false
			}
			continue
		}
		r := q[i] / p[i]
		if p[i] < 0 {
			if r > t1 {
				return a, b, false
			}
			t0 = math.Max(t0, r)
		} else {
			if r < t0 {
				return a, b, false
			}
			t1 = math.Min(t1, r)
		}
	}
	return geometry.LatLon{Lon: a.Lon + t0*dx, Lat: a.Lat + t0*dy}, geometry.LatLon{Lon: a.Lon + t1*dx, Lat: a.Lat + t1*dy}, true
}
