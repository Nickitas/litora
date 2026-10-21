package coastline

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"time"

	"coastal-geometry/internal/domain/fractal"
	"coastal-geometry/internal/domain/geometry"
)

// ResearchWay хранит закреплённую картографическую геометрию OSM без персональных полей автора.
// Дата правки way не является датой измерения положения берега.
type ResearchWay struct {
	ID          int64        `json:"id"`
	Version     int          `json:"version"`
	EditedAt    string       `json:"editedAt"`
	NodeIDs     []int64      `json:"nodeIds"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// ResearchSnapshot сохраняет полный геометрический ответ ограниченного запроса coastline.
type ResearchSnapshot struct {
	SchemaVersion  int           `json:"schemaVersion"`
	Query          string        `json:"query"`
	Endpoint       string        `json:"endpoint"`
	RetrievedAt    string        `json:"retrievedAt"`
	OSMBaseTime    string        `json:"osmBaseTime"`
	ResponseSHA256 string        `json:"responseSha256"`
	Ways           []ResearchWay `json:"ways"`
}

// ResearchCandidate описывает выбор одного неизменённого сегмента для малого набора.
// StartPoint/EndPoint — номера координат обрезанного сегмента с единицы.
type ResearchCandidate struct {
	Geometry           json.RawMessage `json:"-"`
	SourceWayID        int64           `json:"sourceWayId"`
	SourceWayVersion   int             `json:"sourceWayVersion"`
	SourceWayEditedAt  string          `json:"sourceWayEditedAt"`
	SourcePath         int             `json:"sourcePath"`
	RegionSegment      string          `json:"regionSegment"`
	Chunk              int             `json:"chunk"`
	StartPoint         int             `json:"startPoint"`
	EndPoint           int             `json:"endPoint"`
	SubdivisionLevel   int             `json:"subdivisionLevel"`
	PointCount         int             `json:"pointCount"`
	LengthKM           float64         `json:"lengthKm"`
	Dimension          float64         `json:"dimension"`
	RegressionRSquared float64         `json:"regressionRSquared"`
	StableAcrossScales bool            `json:"stableAcrossScales"`
	RejectedCandidates []string        `json:"rejectedCandidates"`
}

// DecodeResearchWays извлекает natural=coastline из ответа Overpass без перестановки узлов.
func DecodeResearchWays(data []byte) (string, []ResearchWay, error) {
	var response struct {
		Remark string `json:"remark"`
		OSM3S  struct {
			Timestamp string `json:"timestamp_osm_base"`
		} `json:"osm3s"`
		Elements []struct {
			Type      string            `json:"type"`
			ID        int64             `json:"id"`
			Version   int               `json:"version"`
			Timestamp string            `json:"timestamp"`
			Nodes     []int64           `json:"nodes"`
			Tags      map[string]string `json:"tags"`
			Geometry  []struct {
				Lat *float64 `json:"lat"`
				Lon *float64 `json:"lon"`
			} `json:"geometry"`
		} `json:"elements"`
	}
	if len(data) > 4*1024*1024 {
		return "", nil, fmt.Errorf("ответ OSM превышает 4 МиБ")
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return "", nil, fmt.Errorf("ответ OSM: %w", err)
	}
	if response.Remark != "" || response.OSM3S.Timestamp == "" {
		return "", nil, fmt.Errorf("OSM вернул неполный ответ или не указал время среза")
	}
	if _, err := time.Parse(time.RFC3339, response.OSM3S.Timestamp); err != nil {
		return "", nil, fmt.Errorf("неверное время среза OSM")
	}
	ways := []ResearchWay{}
	seen := map[int64]bool{}
	for _, element := range response.Elements {
		if element.Type != "way" || element.Tags["natural"] != "coastline" {
			return "", nil, fmt.Errorf("ответ содержит объект вне запроса natural=coastline")
		}
		if element.ID <= 0 || element.Version <= 0 || element.Timestamp == "" || seen[element.ID] || len(element.Nodes) < 2 || len(element.Nodes) != len(element.Geometry) {
			return "", nil, fmt.Errorf("неполная геометрия или версия OSM way %d", element.ID)
		}
		seen[element.ID] = true
		if _, err := time.Parse(time.RFC3339, element.Timestamp); err != nil {
			return "", nil, fmt.Errorf("OSM way %d: неверное время версии", element.ID)
		}
		way := ResearchWay{ID: element.ID, Version: element.Version, EditedAt: element.Timestamp, NodeIDs: element.Nodes, Coordinates: make([][2]float64, len(element.Nodes))}
		for i, point := range element.Geometry {
			if element.Nodes[i] <= 0 {
				return "", nil, fmt.Errorf("OSM way %d: неверный ID узла", element.ID)
			}
			if point.Lat == nil || point.Lon == nil || !finiteRegion(*point.Lat) || !finiteRegion(*point.Lon) {
				return "", nil, fmt.Errorf("OSM way %d: отсутствуют координаты узла %d", element.ID, i+1)
			}
			way.Coordinates[i] = [2]float64{*point.Lon, *point.Lat}
		}
		ways = append(ways, way)
	}
	if len(ways) == 0 {
		return "", nil, fmt.Errorf("в поисковом окне нет OSM coastline")
	}
	sort.Slice(ways, func(i, j int) bool { return ways[i].ID < ways[j].ID })
	return response.OSM3S.Timestamp, ways, nil
}

// PrepareResearchSegment выделяет ROI существующим Go-методом, затем выбирает
// самый длинный пригодный фрагмент до 500 точек. Длинные пути делятся с общей
// граничной точкой, без упрощения и соединения разных OSM ways.
// Если основные фрагменты не приняты, проверяются их непрерывные подчасти.
func PrepareResearchSegment(ctx context.Context, snapshot ResearchSnapshot, bounds GeoBounds) (ResearchCandidate, error) {
	if snapshot.SchemaVersion != 1 || len(snapshot.Ways) == 0 {
		return ResearchCandidate{}, fmt.Errorf("требуется закреплённый снимок OSM v1")
	}
	coordinates := make([][][2]float64, len(snapshot.Ways))
	for i, way := range snapshot.Ways {
		if way.ID <= 0 || way.Version <= 0 || way.EditedAt == "" || len(way.Coordinates) < 2 || len(way.NodeIDs) != len(way.Coordinates) ||
			(i > 0 && snapshot.Ways[i-1].ID >= way.ID) {
			return ResearchCandidate{}, fmt.Errorf("неполный или неупорядоченный закреплённый снимок OSM")
		}
		coordinates[i] = way.Coordinates
	}
	data, err := json.Marshal(struct {
		Type        string         `json:"type"`
		Coordinates [][][2]float64 `json:"coordinates"`
	}{"MultiLineString", coordinates})
	if err != nil {
		return ResearchCandidate{}, err
	}
	directory, err := os.MkdirTemp("", "litora-research-geometry-")
	if err != nil {
		return ResearchCandidate{}, err
	}
	defer os.RemoveAll(directory)
	path := filepath.Join(directory, "source.geojson")
	if err := os.WriteFile(path, data, 0600); err != nil {
		return ResearchCandidate{}, err
	}
	region, err := SelectRegion(ctx, path, bounds)
	if err != nil {
		return ResearchCandidate{}, err
	}
	type part struct {
		segment RegionSegment
		points  []geometry.LatLon
		chunk   int
		length  float64
		first   int
		level   int
	}
	parts := []part{}
	for _, segment := range region.Segments {
		for first, chunk := 0, 1; first < len(segment.Points)-1; first, chunk = first+499, chunk+1 {
			last := first + 500
			if last > len(segment.Points) {
				last = len(segment.Points)
			}
			points := segment.Points[first:last]
			parts = append(parts, part{segment: segment, points: points, chunk: chunk, length: geometry.PolylineLength(points), first: first})
		}
	}
	baseParts := append([]part(nil), parts...)
	rejected := []string{}
	for phase := 0; phase < 2; phase++ {
		if phase == 1 {
			parts = nil
			for _, base := range baseParts {
				for size, level := (len(base.points)+1)/2, 1; size >= 8; size, level = (size+1)/2, level+1 {
					for first := 0; first < len(base.points)-1; first += size - 1 {
						last := first + size
						if last > len(base.points) {
							last = len(base.points)
						}
						points := base.points[first:last]
						parts = append(parts, part{segment: base.segment, points: points, chunk: base.chunk, length: geometry.PolylineLength(points), first: base.first + first, level: level})
					}
				}
			}
		}
		sort.SliceStable(parts, func(i, j int) bool { return parts[i].length > parts[j].length })
		for _, candidate := range parts {
			if err := ctx.Err(); err != nil {
				return ResearchCandidate{}, err
			}
			label := fmt.Sprintf("%s / часть %d / точки %d–%d", candidate.segment.ID, candidate.chunk, candidate.first+1, candidate.first+len(candidate.points))
			if len(candidate.points) < 8 || candidate.length < 0.2 {
				rejected = append(rejected, label+": меньше 8 точек или 200 м для анализа масштабов")
				continue
			}
			pairs := make([][2]float64, len(candidate.points))
			for i, point := range candidate.points {
				pairs[i] = [2]float64{point.Lon, point.Lat}
			}
			geometryData, err := json.Marshal(struct {
				Type        string       `json:"type"`
				Coordinates [][2]float64 `json:"coordinates"`
			}{"LineString", pairs})
			if err != nil {
				return ResearchCandidate{}, err
			}
			geometryData = append(geometryData, '\n')
			check, err := CheckSourceGeometryBytes(ctx, geometryData)
			if err != nil {
				return ResearchCandidate{}, err
			}
			if !check.Accepted {
				rejected = append(rejected, label+": геометрия не прошла строгую проверку")
				continue
			}
			if err := os.WriteFile(path, geometryData, 0600); err != nil {
				return ResearchCandidate{}, err
			}
			loaded, validation, err := LoadFromJSON(path)
			if err != nil || len(validation.Fixes) > 0 || !slices.Equal(loaded, candidate.points) {
				rejected = append(rejected, label+": dimension потребовал бы нормализацию исходной геометрии")
				continue
			}
			analysis := fractal.AnalyzeBoxCounting(candidate.points)
			if !analysis.Valid || math.IsNaN(analysis.Dimension) || math.IsInf(analysis.Dimension, 0) {
				rejected = append(rejected, label+": недостаточный диапазон box-counting")
				continue
			}
			way := snapshot.Ways[candidate.segment.SourcePath-1]
			return ResearchCandidate{Geometry: geometryData, SourceWayID: way.ID, SourceWayVersion: way.Version,
				SourceWayEditedAt: way.EditedAt, SourcePath: candidate.segment.SourcePath, RegionSegment: candidate.segment.ID,
				Chunk: candidate.chunk, PointCount: len(candidate.points), LengthKM: candidate.length,
				StartPoint: candidate.first + 1, EndPoint: candidate.first + len(candidate.points), SubdivisionLevel: candidate.level,
				Dimension: analysis.Dimension, RegressionRSquared: analysis.RegressionRSquared,
				StableAcrossScales: analysis.StableAcrossScales, RejectedCandidates: rejected}, nil
		}
	}
	return ResearchCandidate{}, fmt.Errorf("ни один из %d кандидатов не пригоден без изменения геометрии; причин: %v", len(rejected), rejected)
}
