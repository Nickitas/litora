package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"coastal-geometry/internal/domain/adaptive"
	"coastal-geometry/internal/domain/mesh"
)

func TestComparisonVisualReportsUsesCurrentArtifacts(t *testing.T) {
	root := t.TempDir()
	passport := visualTestFile(t, root, "comparison.json", `{"accepted":true}`)
	svg := visualTestFile(t, root, "seabed/adaptive/comparison/coarse/delaunay/mesh-preview.svg", "<svg/>")
	report := adaptive.AdaptiveComparisonReport{Levels: []adaptive.AdaptiveComparisonLevelReport{{
		Level: adaptive.TargetLevel{ID: "coarse", MinimumSizeM: 500.5, MaximumSizeM: 1000},
		Runs: []adaptive.GeneratorComparisonRun{
			{Algorithm: mesh.AlgorithmDelaunay, Success: true, Artifacts: adaptive.ComparisonArtifacts{MeshPreviewSVG: svg}},
			{Algorithm: mesh.AlgorithmFrontalQuad, Success: false, Artifacts: adaptive.ComparisonArtifacts{MeshPreviewSVG: "missing.svg"}},
		},
	}}}
	if err := WriteComparisonVisualReports(root, passport, report); err != nil {
		t.Fatal(err)
	}
	index := readVisualTestIndex(t, filepath.Join(root, "seabed/adaptive/comparison/comparison-visual-reports.json"))
	expected, _ := visualReportSHA256(passport)
	if index.ComparisonReportSHA256 != expected || len(index.Reports) != 1 {
		t.Fatalf("неверная привязка к текущему сравнению: %+v", index)
	}
	entry := index.Reports[0]
	checksum, _ := visualReportSHA256(svg)
	if entry.SHA256 != checksum || filepath.IsAbs(entry.Filename) || !strings.Contains(entry.Title, "500.5–1000 м") {
		t.Fatalf("индекс потерял SHA, относительный путь или диапазон: %+v", entry)
	}
	report.Levels[0].Runs[0].Artifacts.MeshPreviewSVG = visualTestFile(t, t.TempDir(), "outside.svg", "<svg/>")
	if err := WriteComparisonVisualReports(root, passport, report); err == nil {
		t.Fatal("принят SVG за пределами output")
	}
}

func TestExpertVisualReportsPreservesBlindnessAndChecksPassport(t *testing.T) {
	root := t.TempDir()
	passport := visualTestFile(t, root, "comparison.json", `{"accepted":true}`)
	visualTestFile(t, root, "seabed/expert-set/cards/E-009.svg", "<svg/>")
	checksum, _ := visualReportSHA256(passport)
	manifest := adaptive.ExpertSetManifest{
		ComparisonReport: passport, ComparisonReportSHA256: checksum, Seed: "secret-seed",
		Fragments: adaptive.DefaultExpertFragments(),
		Cards:     []adaptive.ExpertSetCard{{PresentationID: "E-009", FragmentID: "eval-kizilirmak-spit", SVGPath: "cards/E-009.svg", Algorithm: "delaunay", LevelID: "secret-level", MeshSHA256: "secret-mesh", VisibleCells: 25, VisibleContours: 7}},
	}
	if err := WriteExpertVisualReports(root, manifest); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "seabed/expert-set/expert-visual-reports.json")
	index := readVisualTestIndex(t, path)
	data, _ := os.ReadFile(path)
	for _, secret := range []string{"secret-seed", "secret-level", "secret-mesh", "delaunay", "organizer", "algorithm", "level_id", root} {
		if strings.Contains(string(data), secret) {
			t.Fatalf("индекс раскрывает %q", secret)
		}
	}
	if len(index.Reports) != 1 || !strings.Contains(index.Reports[0].Title, "Кызылырмакская коса") || !strings.Contains(index.Reports[0].Description, "28000 × 28000 м LAEA; 25 ячеек, 7") {
		t.Fatalf("нет паспорта окна текущей карточки: %+v", index)
	}
	manifest.ComparisonReportSHA256 = strings.Repeat("0", 64)
	if err := WriteExpertVisualReports(root, manifest); err == nil {
		t.Fatal("принят ключ другого ADAPT-03")
	}
	manifest.ComparisonReportSHA256 = checksum
	manifest.Cards[0].FragmentID = "unknown"
	if err := WriteExpertVisualReports(root, manifest); err == nil {
		t.Fatal("принят неизвестный фрагмент")
	}
}

func visualTestFile(t *testing.T, root, path, contents string) string {
	t.Helper()
	path = filepath.Join(root, path)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func readVisualTestIndex(t *testing.T, path string) AdaptiveVisualReports {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var index AdaptiveVisualReports
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}
	return index
}
