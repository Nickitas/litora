package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"coastal-geometry/internal/domain/adaptive"
)

// AdaptiveVisualReport содержит открытую подпись SVG и его контрольную сумму.
// Сведения о генераторе и уровне карточек AI-01 сюда не переносятся.
type AdaptiveVisualReport struct {
	ReportType  string `json:"report_type"`
	Filename    string `json:"filename"`
	SHA256      string `json:"sha256"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

// AdaptiveVisualReports связывает SVG с паспортом текущего сравнения ADAPT-03.
type AdaptiveVisualReports struct {
	SchemaVersion          string                 `json:"schema_version"`
	ComparisonReportSHA256 string                 `json:"comparison_report_sha256"`
	Reports                []AdaptiveVisualReport `json:"reports"`
}

// WriteComparisonVisualReports сохраняет индекс обзоров и окон из паспорта Go.
func WriteComparisonVisualReports(root, comparisonPath string, report adaptive.AdaptiveComparisonReport) error {
	index, err := newAdaptiveVisualReports(comparisonPath)
	if err != nil {
		return err
	}
	for _, level := range report.Levels {
		for _, run := range level.Runs {
			if !run.Success {
				continue
			}
			title := fmt.Sprintf("%s · %s · %g–%g м", run.Algorithm.RussianName(), level.Level.ID, level.Level.MinimumSizeM, level.Level.MaximumSizeM)
			for _, view := range []struct{ kind, path, title, description string }{
				{"adaptive_mesh_overviews", run.Artifacts.MeshPreviewSVG, title, "Обзор построенной сетки. Параметры, контроль общей границы и рейтинг — в паспорте ADAPT-03 этого расчёта."},
				{"adaptive_mesh_windows", run.Artifacts.MeshWindowSVG, title + " · подробное окно", "Кызылырмакская коса, окно 4,2 × 2,6 км. Представление ADAPT-03 отличается от карточки AI-01."},
				{"adaptive_mesh_windows", run.Artifacts.MeshWindowPublicationSVG, title + " · публикационный вариант", "То же подробное окно ADAPT-03 с публикационным оформлением."},
			} {
				if view.path == "" {
					continue
				}
				if err := index.appendSVG(root, view.path, view.kind, view.title, view.description); err != nil {
					return err
				}
			}
		}
	}
	return writeAdaptiveVisualReports(filepath.Join(root, "seabed", "adaptive", "comparison", "comparison-visual-reports.json"), index)
}

// WriteExpertVisualReports сохраняет открытый индекс AI-01 из текущего ключа.
// Индекс не раскрывает алгоритм, уровень, seed, MSH и путь к закрытому ключу.
func WriteExpertVisualReports(root string, manifest adaptive.ExpertSetManifest) error {
	index, err := newAdaptiveVisualReports(manifest.ComparisonReport)
	if err != nil {
		return err
	}
	if index.ComparisonReportSHA256 != manifest.ComparisonReportSHA256 {
		return fmt.Errorf("SHA-256 ADAPT-03 не совпадает с ключом AI-01")
	}
	fragments := make(map[string]adaptive.ExpertFragment, len(manifest.Fragments))
	for _, fragment := range manifest.Fragments {
		fragments[fragment.ID] = fragment
	}
	for _, card := range manifest.Cards {
		fragment, ok := fragments[card.FragmentID]
		if !ok {
			return fmt.Errorf("карточка %s ссылается на неизвестный фрагмент AI-01", card.PresentationID)
		}
		path := filepath.Join(root, "seabed", "expert-set", filepath.FromSlash(card.SVGPath))
		title := fmt.Sprintf("Карточка %s · %s", card.PresentationID, fragment.Name)
		description := fmt.Sprintf("Окно %g × %g м LAEA; %d ячеек, %d сегментов изобат. Генератор и уровень скрыты. Номер карточки относится только к этому набору.", fragment.WidthM, fragment.HeightM, card.VisibleCells, card.VisibleContours)
		if err := index.appendSVG(root, path, "expert_fragment_cards", title, description); err != nil {
			return err
		}
	}
	return writeAdaptiveVisualReports(filepath.Join(root, "seabed", "expert-set", "expert-visual-reports.json"), index)
}

func newAdaptiveVisualReports(comparisonPath string) (AdaptiveVisualReports, error) {
	checksum, err := visualReportSHA256(comparisonPath)
	return AdaptiveVisualReports{SchemaVersion: "lito-adaptive-visual-reports/v1", ComparisonReportSHA256: checksum, Reports: []AdaptiveVisualReport{}}, err
}

func (index *AdaptiveVisualReports) appendSVG(root, path, kind, title, description string) error {
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("каталог индекса SVG: %w", err)
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("путь SVG индекса: %w", err)
	}
	relative, err := filepath.Rel(absoluteRoot, absolutePath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.Ext(relative) != ".svg" {
		return fmt.Errorf("SVG индекса должен находиться в каталоге результатов")
	}
	checksum, err := visualReportSHA256(path)
	if err != nil {
		return err
	}
	index.Reports = append(index.Reports, AdaptiveVisualReport{ReportType: kind, Filename: filepath.ToSlash(relative), SHA256: checksum, Title: title, Description: description})
	return nil
}

func visualReportSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("чтение файла индекса SVG: %w", err)
	}
	defer func() { _ = file.Close() }()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("SHA-256 файла индекса SVG: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeAdaptiveVisualReports(path string, index AdaptiveVisualReports) error {
	data, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return fmt.Errorf("кодирование индекса SVG: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("каталог индекса SVG: %w", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("сохранение индекса SVG: %w", err)
	}
	return nil
}
