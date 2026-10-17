package cobra

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunShorelineDataAuditWritesProvenance(t *testing.T) {
	directory := t.TempDir()
	observations := filepath.Join(directory, "наблюдения.geojson")
	data := `{"type":"FeatureCollection","features":[` +
		`{"type":"Feature","geometry":{"type":"LineString","coordinates":[[39.6,43.6],[39.8,43.6]]},"properties":{"date":"2020-01-01T00:00:00Z","satname":"L8"}},` +
		`{"type":"Feature","geometry":{"type":"LineString","coordinates":[[39.6,43.6],[39.8,43.6]]},"properties":{"date":"2022-01-01T00:00:00Z","satname":"S2"}}]}`
	if err := os.WriteFile(observations, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	oldObservations, oldWaves, oldSource, oldOutput, oldValidationStart, oldQuiet := shorelineAuditObservations, shorelineAuditWaveInput, shorelineAuditWaveSource, shorelineAuditOutput, shorelineAuditValidationStart, quiet
	t.Cleanup(func() {
		shorelineAuditObservations, shorelineAuditWaveInput, shorelineAuditWaveSource, shorelineAuditOutput, shorelineAuditValidationStart, quiet = oldObservations, oldWaves, oldSource, oldOutput, oldValidationStart, oldQuiet
	})
	shorelineAuditObservations = observations
	shorelineAuditWaveInput = ""
	shorelineAuditWaveSource = ""
	shorelineAuditOutput = filepath.Join(directory, "output")
	shorelineAuditValidationStart = "2021-01-01"
	quiet = true
	if err := runShorelineDataAudit(shorelineDataAuditCmd, nil); err != nil {
		t.Fatal(err)
	}
	result, err := os.ReadFile(filepath.Join(shorelineAuditOutput, "shoreline-data-audit.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report struct {
		SchemaVersion     int    `json:"schemaVersion"`
		ObservationSHA256 string `json:"observationSha256"`
		PilotCoverage     struct {
			IntersectingCount int `json:"intersectingCount"`
			OutsideCount      int `json:"outsideCount"`
		} `json:"pilotCoverage"`
		TemporalSplit struct {
			TrainingCount   int `json:"trainingCount"`
			ValidationCount int `json:"validationCount"`
		} `json:"temporalSplit"`
		Years []struct {
			Year  int `json:"year"`
			Count int `json:"count"`
		} `json:"years"`
	}
	if err := json.Unmarshal(result, &report); err != nil {
		t.Fatal(err)
	}
	if report.SchemaVersion != 4 || len(report.ObservationSHA256) != 64 || len(report.Years) != 3 || report.Years[1].Count != 0 || report.TemporalSplit.TrainingCount != 1 || report.TemporalSplit.ValidationCount != 1 || report.PilotCoverage.IntersectingCount != 2 || report.PilotCoverage.OutsideCount != 0 {
		t.Fatalf("неполный отчёт аудита: %+v", report)
	}
}
