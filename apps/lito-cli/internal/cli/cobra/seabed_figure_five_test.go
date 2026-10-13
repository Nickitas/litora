package cobra

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	adaptivemodel "coastal-geometry/internal/domain/adaptive"
)

func figureFiveFixture(t *testing.T) expertSetResult {
	t.Helper()
	directory := t.TempDir()
	if err := os.MkdirAll(filepath.Join(directory, "cards"), 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := adaptivemodel.ExpertSetManifest{}
	for index, fragmentID := range figureFiveFragmentIDs {
		id := "E-" + []string{"019", "004", "087"}[index]
		path := filepath.Join(directory, "cards", id+".svg")
		if err := os.WriteFile(path, []byte("<svg><title>"+fragmentID+"</title></svg>"), 0o600); err != nil {
			t.Fatal(err)
		}
		manifest.Cards = append(manifest.Cards, adaptivemodel.ExpertSetCard{
			PresentationID: id, FragmentID: fragmentID, LevelID: "coarse", Algorithm: "delaunay",
			MeshSHA256: strings.Repeat("a", 64), SVGPath: "cards/" + id + ".svg", VisibleCells: 12,
		})
	}
	return expertSetResult{
		directory: directory, manifest: manifest,
		comparison: adaptivemodel.AdaptiveComparisonReport{Levels: []adaptivemodel.AdaptiveComparisonLevelReport{{
			Level: adaptivemodel.TargetLevel{ID: "coarse", MinimumSizeM: 125, MaximumSizeM: 250},
		}}},
	}
}

func TestFigureFiveSelectsFragmentsByStableIDNotAnonymousNumber(t *testing.T) {
	result := figureFiveFixture(t)
	path, err := writeFigureFiveForExpertSet(result, "coarse", "delaunay")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "Кызылырмакская коса") || !strings.Contains(string(data), "125–250 м") {
		t.Fatalf("неверная компоновка рисунка 5: %s", data)
	}
}

func TestFigureFiveRejectsMissingMixedOrUntrustedCards(t *testing.T) {
	result := figureFiveFixture(t)
	if _, err := writeFigureFiveForExpertSet(result, "missing", "delaunay"); err == nil {
		t.Fatal("неизвестный уровень принят")
	}
	if _, err := writeFigureFiveForExpertSet(result, "coarse", "frontal-quad"); err == nil {
		t.Fatal("отсутствующие карточки другого генератора приняты")
	}
	result.manifest.Cards[1].MeshSHA256 = strings.Repeat("b", 64)
	if _, err := writeFigureFiveForExpertSet(result, "coarse", "delaunay"); err == nil {
		t.Fatal("карточки разных MSH приняты")
	}
	result.manifest.Cards[1].MeshSHA256 = strings.Repeat("a", 64)
	result.manifest.Cards[1].MeshSHA256 = ""
	if _, err := writeFigureFiveForExpertSet(result, "coarse", "delaunay"); err == nil {
		t.Fatal("карточка без SHA-256 MSH принята")
	}
	result.manifest.Cards[1].MeshSHA256 = strings.Repeat("a", 64)
	result.manifest.Cards[1].SVGPath = "../outside.svg"
	if _, err := writeFigureFiveForExpertSet(result, "coarse", "delaunay"); err == nil {
		t.Fatal("путь карточки вне каталога принят")
	}
}
