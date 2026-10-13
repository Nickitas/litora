package cobra

import (
	"fmt"
	"path/filepath"
	"regexp"

	adaptivemodel "coastal-geometry/internal/domain/adaptive"
	renderadaptive "coastal-geometry/internal/render/adaptive"
)

const figureFiveFilename = "fig_05_actual_mesh_fragments.svg"

var figureFiveFragmentIDs = [3]string{
	"eval-kizilirmak-spit",
	"eval-batumi-bay",
	"eval-anatolian-isobaths",
}

var figureFivePresentationID = regexp.MustCompile(`^E-[0-9]{3}$`)
var figureFiveSHA256 = regexp.MustCompile(`^[a-f0-9]{64}$`)

func validateFigureFiveFlags(enabled bool, levelID, algorithm string) error {
	if !enabled && (levelID != "" || algorithm != "") {
		return fmt.Errorf("--figure-five-level и --figure-five-generator требуют --figure-five")
	}
	if enabled && (levelID == "" || algorithm == "") {
		return fmt.Errorf("для --figure-five укажите --figure-five-level и --figure-five-generator")
	}
	return nil
}

func writeFigureFiveForExpertSet(result expertSetResult, levelID, algorithm string) (string, error) {
	if err := validateFigureFiveFlags(true, levelID, algorithm); err != nil {
		return "", err
	}
	var selectedLevel *adaptivemodel.TargetLevel
	for index := range result.comparison.Levels {
		level := &result.comparison.Levels[index].Level
		if level.ID == levelID {
			selectedLevel = level
			break
		}
	}
	if selectedLevel == nil {
		return "", fmt.Errorf("уровень %q не найден в принятом отчёте ADAPT-03", levelID)
	}
	var paths [3]string
	meshSHA := ""
	for index, fragmentID := range figureFiveFragmentIDs {
		found := false
		for _, card := range result.manifest.Cards {
			if card.FragmentID != fragmentID || card.LevelID != levelID || card.Algorithm != algorithm {
				continue
			}
			if found || !figureFivePresentationID.MatchString(card.PresentationID) ||
				!figureFiveSHA256.MatchString(card.MeshSHA256) ||
				card.SVGPath != "cards/"+card.PresentationID+".svg" || card.VisibleCells < 1 {
				return "", fmt.Errorf("карточка фрагмента %q рисунка 5 имеет неверный паспорт", fragmentID)
			}
			if meshSHA != "" && meshSHA != card.MeshSHA256 {
				return "", fmt.Errorf("карточки рисунка 5 относятся к разным MSH")
			}
			meshSHA = card.MeshSHA256
			paths[index] = filepath.Join(result.directory, "cards", card.PresentationID+".svg")
			found = true
		}
		if !found {
			return "", fmt.Errorf("для рисунка 5 нет карточки %q уровня %q и генератора %q", fragmentID, levelID, algorithm)
		}
	}
	path := filepath.Join(result.directory, figureFiveFilename)
	if err := renderadaptive.WriteFigureFiveSVG(path, renderadaptive.FigureFiveSVGConfig{
		CardPaths: paths, Algorithm: algorithm,
		MinimumSizeM: selectedLevel.MinimumSizeM, MaximumSizeM: selectedLevel.MaximumSizeM,
	}); err != nil {
		return "", fmt.Errorf("сборка рисунка 5: %w", err)
	}
	return path, nil
}
