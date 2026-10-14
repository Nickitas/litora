package cli

import (
	"coastal-geometry/internal/domain/geometry"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWriteShorelineVisualizationCalendarAndChunks(t *testing.T) {
	output := NewOutputPathManager(t.TempDir())
	if err := output.EnsureDirectories(); err != nil {
		t.Fatal(err)
	}
	start := time.Date(2024, 12, 31, 23, 0, 0, 0, time.UTC)
	model := geometry.LongshoreModelResult{
		ScenarioClassification: geometry.ScenarioClassification{ScenarioStatus: "unclassified"},
		Climate:                geometry.WaveClimate{Source: "Проверенный волновой ряд"},
		Snapshots:              make([][]geometry.LatLon, 66),
		Steps:                  make([]geometry.LongshoreStepResult, 65),
	}
	for i := range model.Snapshots {
		model.Snapshots[i] = []geometry.LatLon{{Lat: 43, Lon: 39}, {Lat: 43.01, Lon: 39.01}, {Lat: 43.02, Lon: 39.02}}
		if i == 0 {
			continue
		}
		model.Steps[i-1] = geometry.LongshoreStepResult{
			Condition:      geometry.WaveCondition{Time: start.Add(time.Duration(i-1) * time.Hour), DurationHours: 1, SignificantWaveHeightM: 1.5},
			Cells:          []geometry.LongshoreCellResult{{PointIndex: 0, ShorelineChangeM: -0.25}},
			ErodedVolumeM3: 4,
		}
	}
	if err := WriteShorelineVisualization(model, output); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output.ErosionPath("visualization/index.json"))
	if err != nil {
		t.Fatal(err)
	}
	var index shorelineIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}
	if index.Mode != "calendar" || index.Frames[0].Time == nil || *index.Frames[0].Time != "2024-12-31T23:00:00Z" {
		t.Fatalf("неверное начало ряда: %+v", index.Frames[0])
	}
	if index.Frames[1].Time == nil || *index.Frames[1].Time != "2025-01-01T00:00:00Z" {
		t.Fatalf("неверная граница года: %+v", index.Frames[1])
	}
	if index.Frames[0].DurationHours != nil || index.Frames[1].DurationHours == nil || *index.Frames[1].DurationHours != 1 {
		t.Fatal("длительность шага не сохранена в индексе")
	}
	if index.Frames[63].ChunkID == index.Frames[64].ChunkID {
		t.Fatal("ряд из 66 кадров не разбит на ограниченные части")
	}
	chunkData, err := os.ReadFile(filepath.Join(output.ErosionDir(), "visualization", "chunks", index.Frames[1].ChunkID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var chunk shorelineChunk
	if err := json.Unmarshal(chunkData, &chunk); err != nil {
		t.Fatal(err)
	}
	if chunk.Frames[1].Cells[0].ShorelineChangeM != -0.25 || index.Frames[1].ErodedVolumeM3 == nil || *index.Frames[1].ErodedVolumeM3 != 4 {
		t.Fatal("визуализация изменила значения результата CERC")
	}
}

func TestWriteShorelineVisualizationWithoutDates(t *testing.T) {
	output := NewOutputPathManager(t.TempDir())
	if err := output.EnsureDirectories(); err != nil {
		t.Fatal(err)
	}
	points := []geometry.LatLon{{Lat: 43, Lon: 39}, {Lat: 43.01, Lon: 39.01}}
	model := geometry.LongshoreModelResult{
		Snapshots: [][]geometry.LatLon{points, points},
		Steps:     []geometry.LongshoreStepResult{{Condition: geometry.WaveCondition{DurationHours: 1}}},
	}
	if err := WriteShorelineVisualization(model, output); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output.ErosionPath("visualization/index.json"))
	if err != nil {
		t.Fatal(err)
	}
	var index shorelineIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}
	if index.Mode != "steps" || index.Frames[0].Time != nil || index.Frames[1].Time != nil {
		t.Fatal("ряду без дат назначена вымышленная календарная шкала")
	}
	if index.Frames[1].DurationHours == nil || *index.Frames[1].DurationHours != 1 {
		t.Fatal("ряд без дат потерял длительность шага")
	}
}

func TestWriteShorelineVisualizationLongSeriesBudget(t *testing.T) {
	output := NewOutputPathManager(t.TempDir())
	if err := output.EnsureDirectories(); err != nil {
		t.Fatal(err)
	}
	points := make([]geometry.LatLon, 200)
	for i := range points {
		points[i] = geometry.LatLon{Lat: 43 + float64(i)*0.0001, Lon: 39 + float64(i)*0.0001}
	}
	model := geometry.LongshoreModelResult{
		Snapshots: make([][]geometry.LatLon, 10_001),
		Steps:     make([]geometry.LongshoreStepResult, 10_000),
	}
	for i := range model.Snapshots {
		model.Snapshots[i] = points
	}
	if err := WriteShorelineVisualization(model, output); err != nil {
		t.Fatal(err)
	}
	indexData, err := os.ReadFile(output.ErosionPath("visualization/index.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(indexData) > shorelineIndexMaxBytes {
		t.Fatalf("индекс слишком большой: %d", len(indexData))
	}
	entries, err := os.ReadDir(output.ErosionPath("visualization/chunks"))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 || len(entries) > 512 {
		t.Fatalf("неожиданное число файлов кадров: %d", len(entries))
	}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			t.Fatal(err)
		}
		if info.Size() > shorelineChunkMaxBytes {
			t.Fatalf("файл %s превышает лимит: %d", entry.Name(), info.Size())
		}
	}
}
