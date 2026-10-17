package shorelinehistory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadObservationsCoastSatAndDuplicateDate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "observations.geojson")
	data := `{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:4326"}},"features":[` +
		`{"type":"Feature","geometry":{"type":"LineString","coordinates":[[39.7,43.5],[39.8,43.6]]},"properties":{"date":"2022-01-02 03:00:00","satname":"L8","uncertainty_m":4,"tide_corrected":true}},` +
		`{"type":"Feature","geometry":{"type":"LineString","coordinates":[[39.7,43.5],[39.8,43.6]]},"properties":{"date":"2020-01-02T03:00:00Z","satname":"L7"}}]}`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	observations, err := LoadObservations(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(observations) != 2 || observations[0].Time.Year() != 2020 || observations[1].UncertaintyM == nil || *observations[1].UncertaintyM != 4 {
		t.Fatalf("неожиданные наблюдения: %+v", observations)
	}
	duplicate := strings.Replace(data, "2022-01-02 03:00:00", "2020-01-02T03:00:00Z", 1)
	if err := os.WriteFile(path, []byte(duplicate), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadObservations(path); err == nil || !strings.Contains(err.Error(), "уникальными") {
		t.Fatalf("ожидалась ошибка совпадающих дат, получено %v", err)
	}
	zeroUncertainty := strings.Replace(data, `"uncertainty_m":4`, `"uncertainty_m":0`, 1)
	if err := os.WriteFile(path, []byte(zeroUncertainty), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadObservations(path); err == nil || !strings.Contains(err.Error(), "uncertainty_m") {
		t.Fatalf("нулевая неопределённость не должна считаться измеренной: %v", err)
	}
}

func TestAnalyzePreservesEmptyYearsAndWaveGap(t *testing.T) {
	start := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2022, 1, 1, 0, 0, 0, 0, time.UTC)
	report, err := Analyze([]Observation{{Time: start}, {Time: end}}, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Years) != 3 || report.Years[1].Year != 2021 || report.Years[1].Count != 0 {
		t.Fatalf("пустой год потерян: %+v", report.Years)
	}
	if report.MissingUncertaintyCount != 2 || report.UnknownTideStatusCount != 2 || report.Waves != nil {
		t.Fatalf("неполнота данных не отражена: %+v", report)
	}
	shortEnd := start.Add(48 * time.Hour)
	waveReport, err := Analyze([]Observation{{Time: start}, {Time: shortEnd}}, "проверочный ряд", []WaveInterval{
		{Start: start, DurationHours: 24},
		{Start: shortEnd, DurationHours: 24},
	})
	if err != nil {
		t.Fatal(err)
	}
	if waveReport.Waves == nil || waveReport.Waves.CoveredObservationHours == nil || *waveReport.Waves.CoveredObservationHours != 24 ||
		waveReport.Waves.MissingObservationHours == nil || *waveReport.Waves.MissingObservationHours != 24 {
		t.Fatalf("волновой пробел рассчитан неверно: %+v", waveReport.Waves)
	}
}

func TestAnalyzeRejectsOverlappingWaves(t *testing.T) {
	start := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	_, err := Analyze([]Observation{{Time: start}, {Time: start.Add(72 * time.Hour)}}, "ряд", []WaveInterval{
		{Start: start, DurationHours: 48},
		{Start: start.Add(24 * time.Hour), DurationHours: 24},
	})
	if err == nil || !strings.Contains(err.Error(), "перекрываются") {
		t.Fatalf("ожидалась ошибка перекрытия волн, получено %v", err)
	}
}

func TestAnalyzeDoesNotCallUndatedWavesComplete(t *testing.T) {
	start := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	report, err := Analyze([]Observation{{Time: start}, {Time: start.Add(48 * time.Hour)}}, "ряд без дат", []WaveInterval{{DurationHours: 48}})
	if err != nil {
		t.Fatal(err)
	}
	if report.Waves == nil || report.Waves.MissingObservationHours != nil || report.Waves.FirstTime != nil {
		t.Fatalf("недатированный ряд ошибочно сопоставлен с наблюдениями: %+v", report.Waves)
	}
}

func TestTemporalSplitSeparatesDatesWithoutFutureLeakage(t *testing.T) {
	first := time.Date(2019, 6, 1, 12, 0, 0, 0, time.UTC)
	second := time.Date(2020, 7, 1, 12, 0, 0, 0, time.UTC)
	third := time.Date(2022, 1, 1, 12, 0, 0, 0, time.UTC)
	last := time.Date(2023, 7, 1, 12, 0, 0, 0, time.UTC)
	observations := []Observation{{Time: last}, {Time: first}, {Time: third}, {Time: second}}
	boundary := time.Date(2022, 1, 1, 0, 0, 0, 0, time.UTC)
	report, err := AnalyzeWithTemporalSplit(observations, "", nil, &boundary)
	if err != nil {
		t.Fatal(err)
	}
	split := report.TemporalSplit
	if report.SchemaVersion != 2 || split == nil || split.TrainingCount != 2 || split.ValidationCount != 2 ||
		!split.TrainingLastTime.Equal(second) || !split.ValidationFirstTime.Equal(third) ||
		split.BoundaryGapDays <= 0 {
		t.Fatalf("хронологическое разделение некорректно: %+v", report)
	}
	for _, invalid := range []time.Time{
		first.Add(-24 * time.Hour), last.Add(24 * time.Hour),
		time.Date(2022, 1, 1, 12, 0, 0, 0, time.UTC),
	} {
		if _, err := AnalyzeWithTemporalSplit(observations, "", nil, &invalid); err == nil {
			t.Fatalf("ожидалась ошибка границы %s", invalid)
		}
	}
}
