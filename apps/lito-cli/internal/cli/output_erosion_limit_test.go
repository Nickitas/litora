package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"

	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/geometry"
)

func TestSelectErosionSVGStepsKeepsFirstAndLast(t *testing.T) {
	for _, test := range []struct {
		snapshots int
		maximum   int
		want      []int
	}{
		{snapshots: 10, maximum: 0, want: []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}},
		{snapshots: 10, maximum: 4, want: []int{0, 3, 6, 9}},
		{snapshots: 3, maximum: 8, want: []int{0, 1, 2}},
		{snapshots: 1, maximum: 2, want: []int{0}},
	} {
		got, err := selectErosionSVGSteps(test.snapshots, test.maximum)
		if err != nil || !reflect.DeepEqual(got, test.want) {
			t.Fatalf("selectErosionSVGSteps(%d, %d) = %v, %v; нужно %v", test.snapshots, test.maximum, got, err, test.want)
		}
	}
	for _, maximum := range []int{-1, 1} {
		if _, err := selectErosionSVGSteps(3, maximum); err == nil {
			t.Fatalf("лимит %d должен быть отклонён", maximum)
		}
	}
}

func TestWriteErosionSVGSeriesWithLimitPreservesStepNumbers(t *testing.T) {
	points := []geometry.LatLon{{Lat: 43.60, Lon: 39.70}, {Lat: 43.61, Lon: 39.71}, {Lat: 43.62, Lon: 39.72}}
	snapshots := make([][]geometry.LatLon, 10)
	for index := range snapshots {
		snapshots[index] = append([]geometry.LatLon(nil), points...)
	}
	output := NewOutputPathManager(t.TempDir())
	if err := WriteErosionSVGSeriesWithLimit(points, snapshots, 9, 0, 0, geometry.WaveErosionOptions{},
		output, "Сочи", "проверочный ряд", coastline.ValidationReport{}, 4); err != nil {
		t.Fatal(err)
	}
	for _, step := range []int{0, 3, 6, 9} {
		if _, err := os.Stat(output.SVGPath("erosion_step_" + strconv.Itoa(step) + ".svg")); err != nil {
			t.Fatalf("SVG шага %d не создан: %v", step, err)
		}
	}
	if _, err := os.Stat(output.SVGPath("erosion_step_1.svg")); !os.IsNotExist(err) {
		t.Fatalf("лишний SVG шага 1: %v", err)
	}
	data, err := os.ReadFile(output.MetricsPath("erosion.metrics.json"))
	if err != nil {
		t.Fatal(err)
	}
	var metrics erosionSeriesArtifactMetrics
	if err := json.Unmarshal(data, &metrics); err != nil {
		t.Fatal(err)
	}
	if metrics.TotalSnapshots != 10 || metrics.RenderedSVGCount != 4 || len(metrics.Steps) != 4 || metrics.Steps[3].Step != 9 {
		t.Fatalf("неверные метрики выборки SVG: %+v", metrics)
	}
}

func TestWriteLongshoreModelJSONStreamsCompleteResult(t *testing.T) {
	output := NewOutputPathManager(t.TempDir())
	if err := output.EnsureDirectories(); err != nil {
		t.Fatal(err)
	}
	model := geometry.LongshoreModelResult{
		ScenarioClassification: geometry.ScenarioClassification{ScenarioStatus: geometry.ScenarioStatusUnclassified, UsageLimitations: []string{"только тест"}},
		Model:                  "проверка", BasinID: "Чёрное море", BathymetrySource: "наблюдения",
		BathymetrySHA256: "abc", BathymetryPassport: "grid.metadata.json", BathymetryStatus: "проверен",
		Snapshots:       [][]geometry.LatLon{{{Lat: 43.6, Lon: 39.7}}, {{Lat: 43.7, Lon: 39.8}}},
		Steps:           []geometry.LongshoreStepResult{{Cells: []geometry.LongshoreCellResult{{PointIndex: 1}}}},
		SedimentSources: []geometry.LongshoreSedimentSource{{}},
		Structures:      []geometry.LongshoreStructure{{}},
	}
	if err := WriteLongshoreModelJSONStreaming(model, output); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(output.ErosionDir(), "longshore-cerc.json"))
	if err != nil {
		t.Fatal(err)
	}
	var parsed geometry.LongshoreModelResult
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Snapshots) != 2 || len(parsed.Steps) != 1 || parsed.Steps[0].Cells[0].PointIndex != 1 {
		t.Fatalf("полный численный результат потерян: %+v", parsed)
	}
	want, err := json.Marshal(model)
	if err != nil {
		t.Fatal(err)
	}
	var canonical map[string]any
	var streamed map[string]any
	if err := json.Unmarshal(want, &canonical); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &streamed); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(streamed, canonical) {
		t.Fatal("потоковая запись отличается от полного JSON-контракта")
	}
}
