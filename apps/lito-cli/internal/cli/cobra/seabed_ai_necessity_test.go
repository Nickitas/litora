package cobra

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	adaptivemodel "coastal-geometry/internal/domain/adaptive"
)

func TestAINecessityUsesRelocatedInputsOnlyWhenChecksumsMatch(t *testing.T) {
	directory := t.TempDir()
	paths := expertComparisonPaths{
		inputMSH: filepath.Join(directory, "model.msh"), exportMetadata: filepath.Join(directory, "export.json"), coastline: filepath.Join(directory, "coast.geojson"),
	}
	for path, contents := range map[string]string{
		paths.inputMSH: "модель", paths.exportMetadata: "паспорт", paths.coastline: "берег",
	} {
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	modelSHA, err := expertFileSHA256(paths.inputMSH)
	if err != nil {
		t.Fatal(err)
	}
	metadataSHA, err := expertFileSHA256(paths.exportMetadata)
	if err != nil {
		t.Fatal(err)
	}
	coastSHA, err := expertFileSHA256(paths.coastline)
	if err != nil {
		t.Fatal(err)
	}
	report := adaptivemodel.AdaptiveComparisonReport{Inputs: adaptivemodel.AdaptiveComparisonInputs{
		InputMSH: "/старый/job/model.msh", InputMSHSHA256: modelSHA,
		ExportMetadata: "/старый/job/export.json", ExportMetadataSHA256: metadataSHA,
		Coastline: "/старый/job/coast.geojson", CoastlineSHA256: coastSHA,
	}}
	if err := verifyExpertComparisonInputsAtPaths(report, paths); err != nil {
		t.Fatalf("перенесённые входы с исходными SHA-256 отклонены: %v", err)
	}
	if err := verifyExpertComparisonInputs(report); err == nil {
		t.Fatal("исторические пути не должны работать в новом каталоге")
	}
	if err := os.WriteFile(paths.coastline, []byte("другой берег"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := verifyExpertComparisonInputsAtPaths(report, paths); err == nil {
		t.Fatal("подмена исходного берега с неверным SHA-256 не отклонена")
	}
}

func TestAINecessityProducesReportFromRelocatedPrivateFiles(t *testing.T) {
	directory := t.TempDir()
	paths := expertComparisonPaths{
		inputMSH: filepath.Join(directory, "model.msh"), exportMetadata: filepath.Join(directory, "export.json"), coastline: filepath.Join(directory, "coast.geojson"),
	}
	for path, contents := range map[string]string{
		paths.inputMSH: "модель", paths.exportMetadata: "паспорт", paths.coastline: "берег",
	} {
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	sha := func(path string) string {
		value, err := expertFileSHA256(path)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	modelSHA := sha(paths.inputMSH)
	metadataSHA := sha(paths.exportMetadata)
	coastSHA := sha(paths.coastline)
	comparisonPath := filepath.Join(directory, "comparison.json")
	comparison := adaptivemodel.AdaptiveComparisonReport{
		SchemaVersion: adaptivemodel.ComparisonSchemaVersion,
		Inputs: adaptivemodel.AdaptiveComparisonInputs{
			InputMSH: "/неиспользуемый/job/model.msh", InputMSHSHA256: modelSHA,
			ExportMetadata: "/неиспользуемый/job/export.json", ExportMetadataSHA256: metadataSHA,
			Coastline: "/неиспользуемый/job/coast.geojson", CoastlineSHA256: coastSHA,
		},
	}
	if err := adaptivemodel.WriteComparisonJSON(comparisonPath, comparison); err != nil {
		t.Fatal(err)
	}
	comparisonSHA, err := expertFileSHA256(comparisonPath)
	if err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(directory, "organizer-key.json")
	key := adaptivemodel.ExpertSetManifest{
		SchemaVersion:    adaptivemodel.ExpertSetSchemaVersion,
		ComparisonReport: "/неиспользуемый/job/comparison.json", ComparisonReportSHA256: comparisonSHA,
		Seed: "test", Fragments: adaptivemodel.DefaultExpertFragments(),
		Cards: []adaptivemodel.ExpertSetCard{{
			PresentationID: "E-001", FragmentID: "train-tendra-spit", Feature: "коса", RegionID: "northwest-shelf",
			Split: adaptivemodel.ExpertSplitTraining, LevelID: "detailed", Algorithm: "delaunay",
			MeshSHA256: strings.Repeat("b", 64), SVGPath: "cards/E-001.svg", VisibleCells: 5,
		}},
	}
	if err := adaptivemodel.WriteExpertSetManifest(keyPath, key); err != nil {
		t.Fatal(err)
	}
	ratingsPath := filepath.Join(directory, "ratings.tsv")
	if err := adaptivemodel.WriteExpertAssignmentsTSV(ratingsPath, key.Cards); err != nil {
		t.Fatal(err)
	}
	result, err := executeSeabedAINecessity(aiNecessityOptions{
		OrganizerKeyPath: keyPath, RatingsPath: ratingsPath, ComparisonPath: comparisonPath,
		ComparisonInputs: paths, OutputRoot: filepath.Join(directory, "output"),
		Config: adaptivemodel.DefaultAINecessityConfig(),
	})
	if err != nil {
		t.Fatalf("AI-02 не выполнился с перенесёнными входами: %v", err)
	}
	if result.report.Inputs.ComparisonReport != comparisonPath || result.report.Decision.MLRecommended {
		t.Fatalf("неверный отчёт по неразмеченному набору: %#v", result.report)
	}
	for _, path := range []string{result.reportPath, result.tsvPath, result.modelPath, result.logPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("нет файла AI-02 %q: %v", path, err)
		}
	}
	if err := os.WriteFile(comparisonPath, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := executeSeabedAINecessity(aiNecessityOptions{
		OrganizerKeyPath: keyPath, RatingsPath: ratingsPath, ComparisonPath: comparisonPath,
		ComparisonInputs: paths, OutputRoot: filepath.Join(directory, "tampered-output"),
		Config: adaptivemodel.DefaultAINecessityConfig(),
	}); err == nil || !strings.Contains(err.Error(), "SHA-256 отчёта ADAPT-03") {
		t.Fatalf("подмена отчёта должна быть отклонена по ключу AI-01, получено: %v", err)
	}
}
