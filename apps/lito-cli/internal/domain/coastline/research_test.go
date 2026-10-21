package coastline

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDecodeResearchWaysRequiresCompleteCoastlineSnapshot(t *testing.T) {
	valid := `{"osm3s":{"timestamp_osm_base":"2026-10-21T10:00:00Z"},"elements":[{"type":"way","id":12,"version":3,"timestamp":"2025-01-01T00:00:00Z","nodes":[1,2],"tags":{"natural":"coastline"},"geometry":[{"lat":43,"lon":37},{"lat":43.1,"lon":37.1}]}]}`
	base, ways, err := DecodeResearchWays([]byte(valid))
	if err != nil || base != "2026-10-21T10:00:00Z" || len(ways) != 1 || ways[0].Coordinates[0] != [2]float64{37, 43} || ways[0].Version != 3 {
		t.Fatalf("Неверный снимок: %s %+v %v", base, ways, err)
	}
	for _, data := range []string{
		`{`, strings.Replace(valid, `"coastline"`, `"water"`, 1),
		strings.Replace(valid, `"version":3`, `"version":0`, 1),
		strings.Replace(valid, `"lat":43,`, `"lat":null,`, 1),
		strings.Replace(valid, `"nodes":[1,2]`, `"nodes":[1]`, 1),
		strings.Replace(valid, `"nodes":[1,2]`, `"nodes":[0,2]`, 1),
		strings.Replace(valid, `2025-01-01T00:00:00Z`, `не дата`, 1),
		strings.Replace(valid, `"elements":`, `"remark":"runtime error","elements":`, 1),
	} {
		if _, _, err := DecodeResearchWays([]byte(data)); err == nil {
			t.Fatalf("Принят неполный снимок: %s", data)
		}
	}
}

func researchLine(id int64, count int, lon, step float64) ResearchWay {
	way := ResearchWay{ID: id, Version: 1, EditedAt: "2026-01-01T00:00:00Z", NodeIDs: make([]int64, count), Coordinates: make([][2]float64, count)}
	for i := 0; i < count; i++ {
		way.NodeIDs[i] = int64(i + 1)
		way.Coordinates[i] = [2]float64{lon + float64(i)*step, 43}
	}
	return way
}

func TestPrepareResearchSegmentSplitsWithoutSimplificationOrJoining(t *testing.T) {
	first := researchLine(1, 600, 37, 0.0001)
	second := researchLine(2, 50, 38, 0.0001)
	snapshot := ResearchSnapshot{SchemaVersion: 1, Ways: []ResearchWay{first, second}}
	bounds := GeoBounds{MinLon: 36.9, MaxLon: 38.1, MinLat: 42.9, MaxLat: 43.1}
	result, err := PrepareResearchSegment(context.Background(), snapshot, bounds)
	if err != nil {
		t.Fatal(err)
	}
	if result.PointCount != 500 || result.Chunk != 1 || result.SourceWayID != 1 {
		t.Fatalf("Выбран неверный фрагмент: %+v", result)
	}
	var geometry struct {
		Coordinates [][2]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(result.Geometry, &geometry); err != nil {
		t.Fatal(err)
	}
	for i, point := range geometry.Coordinates {
		if point != first.Coordinates[i] {
			t.Fatalf("Точка %d изменена или соединена с другим way", i)
		}
	}
	other, err := PrepareResearchSegment(context.Background(), snapshot, bounds)
	if err != nil || !bytes.Equal(result.Geometry, other.Geometry) {
		t.Fatal("Offline-повтор не воспроизводится")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := PrepareResearchSegment(ctx, snapshot, bounds); !errors.Is(err, context.Canceled) {
		t.Fatal("Отмена проигнорирована")
	}
}

func TestPrepareResearchSegmentRejectsUnavailableAnalysisAndCorruptSnapshot(t *testing.T) {
	bounds := GeoBounds{MinLon: 36.9, MaxLon: 38.1, MinLat: 42.9, MaxLat: 43.1}
	for _, snapshot := range []ResearchSnapshot{
		{SchemaVersion: 2, Ways: []ResearchWay{researchLine(1, 20, 37, 0.001)}},
		{SchemaVersion: 1, Ways: []ResearchWay{researchLine(1, 2, 37, 0.001)}},
		{SchemaVersion: 1, Ways: []ResearchWay{researchLine(1, 20, 37, 0)}},
		{SchemaVersion: 1, Ways: []ResearchWay{researchLine(2, 20, 37, 0.001), researchLine(1, 20, 37, 0.001)}},
	} {
		if _, err := PrepareResearchSegment(context.Background(), snapshot, bounds); err == nil {
			t.Fatal("Непригодный кандидат принят")
		}
	}
}

func TestPrepareResearchSegmentSelectsUnchangedSubpathInsteadOfNormalizingRing(t *testing.T) {
	way := ResearchWay{ID: 1, Version: 1, EditedAt: "2026-01-01T00:00:00Z"}
	for edge := 0; edge < 4; edge++ {
		for i := 0; i < 10; i++ {
			step := float64(i) / 100
			point := [2]float64{37 + step, 43}
			switch edge {
			case 1:
				point = [2]float64{37.1, 43 + step}
			case 2:
				point = [2]float64{37.1 - step, 43.1}
			case 3:
				point = [2]float64{37, 43.1 - step}
			}
			way.Coordinates = append(way.Coordinates, point)
			way.NodeIDs = append(way.NodeIDs, int64(len(way.NodeIDs)+1))
		}
	}
	way.Coordinates = append(way.Coordinates, way.Coordinates[0])
	way.NodeIDs = append(way.NodeIDs, way.NodeIDs[0])
	result, err := PrepareResearchSegment(context.Background(), ResearchSnapshot{SchemaVersion: 1, Ways: []ResearchWay{way}}, GeoBounds{MinLon: 36.9, MaxLon: 37.2, MinLat: 42.9, MaxLat: 43.2})
	if err != nil {
		t.Fatal(err)
	}
	if result.SubdivisionLevel == 0 || result.PointCount >= len(way.Coordinates) || len(result.RejectedCandidates) == 0 {
		t.Fatal("Ожидался явный подучасток после отказа нормализации кольца")
	}
	var output struct {
		Coordinates [][2]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(result.Geometry, &output); err != nil {
		t.Fatal(err)
	}
	for i, point := range output.Coordinates {
		if point != way.Coordinates[result.StartPoint-1+i] {
			t.Fatal("Координаты подучастка изменены")
		}
	}
}

func TestPinnedResearchCorpusReproducesFromSources(t *testing.T) {
	directory := filepath.Join("..", "..", "..", "..", "..", "packages", "generated-data", "research")
	configData, err := os.ReadFile(filepath.Join(directory, "regions.json"))
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		WindowDegrees [2]float64 `json:"windowDegrees"`
		Regions       []struct {
			ID            string     `json:"id"`
			Queue         int        `json:"queue"`
			Point         [2]float64 `json:"searchPoint"`
			WindowDegrees [2]float64 `json:"windowDegrees"`
		} `json:"regions"`
	}
	if err := json.Unmarshal(configData, &config); err != nil {
		t.Fatal(err)
	}
	if len(config.Regions) != 24 {
		t.Fatal("Ожидались 24 района")
	}
	queues := map[int]int{}
	for _, area := range config.Regions {
		t.Run(area.ID, func(t *testing.T) {
			queues[area.Queue]++
			var metadata struct {
				RegionID string `json:"regionId"`
				Queue    int    `json:"queue"`
				Source   struct {
					SnapshotSHA256 string `json:"snapshotSha256"`
					SnapshotFile   string `json:"snapshotFile"`
				} `json:"source"`
				File struct {
					SHA256     string `json:"sha256"`
					PointCount int    `json:"pointCount"`
					SizeBytes  int    `json:"sizeBytes"`
				} `json:"file"`
				Validation  SourceValidationReport `json:"validation"`
				Calculation struct {
					ExitCode  int  `json:"exitCode"`
					Unchanged bool `json:"normalizedGeometryUnchanged"`
				} `json:"calculation"`
				Accuracy struct {
					Status string   `json:"status"`
					RMSE   *float64 `json:"horizontalRmseM"`
				} `json:"accuracy"`
			}
			passport, err := os.ReadFile(filepath.Join(directory, area.ID+".metadata.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(passport, &metadata); err != nil {
				t.Fatal(err)
			}
			if !filepath.IsLocal(metadata.Source.SnapshotFile) || !strings.HasPrefix(metadata.Source.SnapshotFile, "sources/") {
				t.Fatal("Небезопасный путь снимка")
			}
			data, err := os.ReadFile(filepath.Join(directory, filepath.FromSlash(metadata.Source.SnapshotFile)))
			if err != nil {
				t.Fatal(err)
			}
			var snapshot ResearchSnapshot
			if err := json.Unmarshal(data, &snapshot); err != nil {
				t.Fatal(err)
			}
			if metadata.Source.SnapshotSHA256 != fmt.Sprintf("%x", sha256.Sum256(data)) {
				t.Fatal("Checksum снимка изменился")
			}
			window := config.WindowDegrees
			if area.WindowDegrees != [2]float64{} {
				window = area.WindowDegrees
			}
			bounds := GeoBounds{MinLon: area.Point[0] - window[0]/2, MaxLon: area.Point[0] + window[0]/2, MinLat: area.Point[1] - window[1]/2, MaxLat: area.Point[1] + window[1]/2}
			candidate, err := PrepareResearchSegment(context.Background(), snapshot, bounds)
			if err != nil {
				t.Fatal(err)
			}
			geometry, err := os.ReadFile(filepath.Join(directory, area.ID+".geojson"))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(candidate.Geometry, geometry) {
				t.Fatal("Геометрия не воспроизводится из источника")
			}
			if metadata.RegionID != area.ID || metadata.Queue != area.Queue || metadata.File.SHA256 != fmt.Sprintf("%x", sha256.Sum256(geometry)) || metadata.File.SizeBytes != len(geometry) ||
				len(geometry) > 65536 || metadata.File.PointCount != candidate.PointCount || candidate.PointCount > 500 || !metadata.Validation.Accepted || metadata.Validation.Truncated ||
				metadata.Validation.SourceSHA256 != metadata.File.SHA256 || metadata.Validation.PointCount != candidate.PointCount || metadata.Calculation.ExitCode != 0 || !metadata.Calculation.Unchanged {
				t.Fatal("Паспорт не подтверждает пригодность входа и ограничения API")
			}
			if metadata.Accuracy.Status != "not_independently_validated" || metadata.Accuracy.RMSE != nil {
				t.Fatal("Неизвестная точность подменена подтверждённой")
			}
		})
	}
	if queues[1] != 8 || queues[2] != 16 {
		t.Fatal("Очереди 8/16 не сохранены")
	}
}

func TestKalamitaOriginalSearchWindowRemainsRejected(t *testing.T) {
	directory := filepath.Join("..", "..", "..", "..", "..", "packages", "generated-data", "research")
	data, err := os.ReadFile(filepath.Join(directory, "sources", "kalamita-01.json"))
	if err != nil {
		t.Fatal(err)
	}
	var snapshot ResearchSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		t.Fatal(err)
	}
	if _, err := PrepareResearchSegment(context.Background(), snapshot, GeoBounds{MinLon: 33.45 - 0.16/2, MaxLon: 33.45 + 0.16/2, MinLat: 45.08 - 0.12/2, MaxLat: 45.08 + 0.12/2}); err == nil {
		t.Fatal("Первоначальный разреженный контур не должен получать статус подготовленного входа")
	}
}
