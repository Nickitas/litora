package cobra

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"text/tabwriter"
	"time"

	"coastal-geometry/internal/domain/geometry"
	"coastal-geometry/internal/domain/shorelinehistory"

	"github.com/spf13/cobra"
)

var (
	shorelineAuditObservations    string
	shorelineAuditWaveInput       string
	shorelineAuditWaveSource      string
	shorelineAuditOutput          string
	shorelineAuditValidationStart string
)

var shorelineDataAuditCmd = &cobra.Command{
	Use:   "shoreline-data-audit",
	Short: "Проверить временное покрытие наблюдений берега и волн",
	Long: `Сохраняет фактические даты, пустые годы и пробелы входных рядов.
Не рассчитывает скорость эрозии или прогноз и не объявляет данные пригодными
для прогноза без ретроспективной проверки и научной оценки.`,
	Args: cobra.NoArgs,
	RunE: runShorelineDataAudit,
}

func init() {
	rootCmd.AddCommand(shorelineDataAuditCmd)
	shorelineDataAuditCmd.Flags().StringVar(&shorelineAuditObservations, "observations", "", "локальный GeoJSON датированных контуров CoastSat в EPSG:4326 (обязателен)")
	shorelineDataAuditCmd.Flags().StringVar(&shorelineAuditWaveInput, "wave-input", "", "необязательный локальный CSV/JSON волнового ряда")
	shorelineDataAuditCmd.Flags().StringVar(&shorelineAuditWaveSource, "wave-source", "", "источник волнового ряда, если он не указан в JSON")
	shorelineDataAuditCmd.Flags().StringVar(&shorelineAuditOutput, "output", "", "каталог для отчёта (по умолчанию: ./output)")
	shorelineDataAuditCmd.Flags().StringVar(&shorelineAuditValidationStart, "validation-start", "", "необязательная дата начала поздней независимой проверки UTC (ГГГГ-ММ-ДД)")
}

func runShorelineDataAudit(cmd *cobra.Command, args []string) error {
	if shorelineAuditObservations == "" {
		return fmt.Errorf("для аудита обязателен --observations")
	}
	observations, err := shorelinehistory.LoadObservations(shorelineAuditObservations)
	if err != nil {
		return err
	}
	observationHash, err := sha256File(shorelineAuditObservations)
	if err != nil {
		return fmt.Errorf("контрольная сумма наблюдений: %w", err)
	}
	var waves []shorelinehistory.WaveInterval
	var waveSource, waveHash string
	if shorelineAuditWaveInput != "" {
		climate, loadErr := geometry.LoadWaveClimate(shorelineAuditWaveInput, shorelineAuditWaveSource)
		if loadErr != nil {
			return fmt.Errorf("волновой ряд: %w", loadErr)
		}
		waveSource = climate.Source
		waveHash, err = sha256File(shorelineAuditWaveInput)
		if err != nil {
			return fmt.Errorf("контрольная сумма волн: %w", err)
		}
		waves = make([]shorelinehistory.WaveInterval, len(climate.Conditions))
		for i, condition := range climate.Conditions {
			waves[i] = shorelinehistory.WaveInterval{Start: condition.Time, DurationHours: condition.DurationHours}
		}
	}
	var validationStart *time.Time
	if shorelineAuditValidationStart != "" {
		parsed, parseErr := time.Parse("2006-01-02", shorelineAuditValidationStart)
		if parseErr != nil || parsed.Format("2006-01-02") != shorelineAuditValidationStart {
			return fmt.Errorf("--validation-start: ожидается календарная дата UTC в формате ГГГГ-ММ-ДД")
		}
		validationStart = &parsed
	}
	audit, err := shorelinehistory.AnalyzeWithTemporalSplit(observations, waveSource, waves, validationStart)
	if err != nil {
		return fmt.Errorf("аудит данных: %w", err)
	}
	outputDir := shorelineAuditOutput
	if outputDir == "" {
		outputDir = "output"
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("создание каталога вывода: %w", err)
	}
	output := struct {
		shorelinehistory.Audit
		ObservationSHA256 string `json:"observationSha256"`
		WaveSHA256        string `json:"waveSha256,omitempty"`
	}{Audit: audit, ObservationSHA256: observationHash, WaveSHA256: waveHash}
	data, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return fmt.Errorf("сериализация аудита: %w", err)
	}
	path := filepath.Join(outputDir, "shoreline-data-audit.json")
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("запись аудита: %w", err)
	}
	if !quiet {
		table := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 0, 2, ' ', 0)
		fmt.Fprintln(table, "Показатель\tЗначение")
		fmt.Fprintf(table, "Контуров\t%d\n", audit.ObservationCount)
		fmt.Fprintf(table, "Период UTC\t%s — %s\n", audit.FirstObservation.Format("2006-01-02"), audit.LastObservation.Format("2006-01-02"))
		fmt.Fprintf(table, "Максимальный пробел, дни\t%.1f\n", audit.LongestObservationGapDays)
		fmt.Fprintf(table, "Без uncertainty_m\t%d\n", audit.MissingUncertaintyCount)
		fmt.Fprintf(table, "Контуров в рамке пилота Сочи\t%d\n", audit.PilotCoverage.IntersectingCount)
		fmt.Fprintf(table, "Контуров вне рамки пилота Сочи\t%d\n", audit.PilotCoverage.OutsideCount)
		if audit.TemporalSplit != nil {
			fmt.Fprintf(table, "Ранняя часть / проверка\t%d / %d контуров\n", audit.TemporalSplit.TrainingCount, audit.TemporalSplit.ValidationCount)
		}
		if audit.Waves != nil && audit.Waves.MissingObservationHours != nil {
			fmt.Fprintf(table, "Непокрыто волнами, ч\t%.1f\n", *audit.Waves.MissingObservationHours)
		} else if audit.Waves != nil {
			fmt.Fprintln(table, "Непокрыто волнами, ч\tнеизвестно: нет дат волн")
		}
		if err := table.Flush(); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Отчёт: %s\n", path)
	}
	return nil
}

func sha256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
