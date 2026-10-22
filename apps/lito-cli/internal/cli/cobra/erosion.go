package cobra

import (
	"fmt"
	"os"
	"text/tabwriter"

	"coastal-geometry/internal/cli"
	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/geometry"

	"github.com/spf13/cobra"
)

var (
	erosionInput                  string
	erosionSourceURL              string
	erosionRefresh                bool
	erosionOutput                 string
	erosionSteps                  int
	erosionMaxWaveConditions      int
	erosionMaxCoastPoints         int
	erosionMaxSVGFrames           int
	erosionSeed                   int64
	erosionStrength               float64
	erosionWaveDirection          float64
	erosionWindSpeed              float64
	erosionFetchSpread            float64
	erosionFetchSamples           int
	erosionMaxFetchKM             float64
	erosionDepthScale             float64
	erosionExposurePower          float64
	erosionBathymetry             string
	erosionBathymetryResolution   float64
	erosionLeftBoundaryTransport  float64
	erosionRightBoundaryTransport float64
	erosionSedimentSources        string
	erosionStructures             string
	erosionLithology              string
	erosionEnableLithology        bool
	erosionTargetYears            int
	erosionYearsPerStep           float64
	erosionStormProbability       float64
	erosionStormIntensity         float64
	erosionSeaLevelRise           float64
	erosionEnableSeasonality      bool
	erosionSeasonalPhase          float64
	erosionOutputCSV              string
	erosionCSVFormat              string
	erosionOutputGIF              string
	erosionGIFFPS                 int
	erosionGIFSkip                int
	erosionWaveInput              string
	erosionWaveSource             string
	erosionBreakingIndex          float64
	erosionBermHeight             float64
	erosionClosureDepth           float64
	erosionPorosity               float64
	erosionCERCCoefficient        float64
	erosionOffshoreDistance       float64
	erosionMaxChange              float64
	erosionMaxBathymetryGap       float64
)

var erosionCmd = &cobra.Command{
	Use:   "erosion",
	Short: "Одномерная вдольбереговая модель транспорта наносов CERC",
	Long: `Выполняет инженерную one-line модель CERC по загруженному волновому ряду.
Расчёт включает дисперсию, рефракцию, shoaling, разрушение волн и
уравнение неразрывности вдольберегового транспорта. Батиметрия и волновой ряд
обязательны. Явно укажите --input (или --source-url), --wave-input и --bathymetry.
Отсутствующие входы не подставляются и не генерируются. Пригодность данных
и параметров для прогноза требует независимой проверки.`,
	RunE: runErosion,
}

func init() {
	rootCmd.AddCommand(erosionCmd)

	// Input options
	erosionCmd.Flags().StringVar(&erosionInput, "input", "", "путь к локальному JSON/GeoJSON береговой линии")
	erosionCmd.Flags().StringVar(&erosionSourceURL, "source-url", "", "явно включить удалённый GeoJSON-источник")
	erosionCmd.Flags().BoolVar(&erosionRefresh, "refresh", false, "принудительное обновление удалённого кэша")
	erosionCmd.Flags().StringVar(&erosionOutput, "output", "", "каталог для вывода (по умолчанию: ./output)")

	// Erosion parameters
	erosionCmd.Flags().IntVar(&erosionSteps, "steps", 0, "ограничить число первых состояний волнового ряда (0 — использовать все)")
	erosionCmd.Flags().IntVar(&erosionMaxWaveConditions, "max-wave-conditions", 0, "предельное число состояний волн до расчёта (0 — без лимита)")
	erosionCmd.Flags().IntVar(&erosionMaxCoastPoints, "max-coast-points", 0, "предельное число точек берега до расчёта (0 — без лимита)")
	erosionCmd.Flags().IntVar(&erosionMaxSVGFrames, "svg-max-frames", 0, "сохранить не более N SVG, включая начальный и конечный шаги (0 — все)")
	erosionCmd.Flags().StringVar(&erosionBathymetry, "bathymetry", "", "путь к JSON батиметрии")
	erosionCmd.Flags().Float64Var(&erosionBathymetryResolution, "bathymetry-resolution", 0, "шаг регулярной батиметрической сетки Чёрного моря в градусах")
	erosionCmd.Flags().StringVar(&erosionWaveInput, "wave-input", "", "путь к волновому ряду наблюдений, реанализа или прогноза в CSV/JSON (обязателен)")
	erosionCmd.Flags().StringVar(&erosionWaveSource, "wave-source", "", "источник волнового ряда, если он не указан в JSON")
	erosionCmd.Flags().Float64Var(&erosionBreakingIndex, "breaking-index", 0.78, "индекс разрушения H_b/h_b")
	erosionCmd.Flags().Float64Var(&erosionBermHeight, "berm-height", 2, "высота бермы активного профиля, м")
	erosionCmd.Flags().Float64Var(&erosionClosureDepth, "closure-depth", 8, "глубина замыкания активного профиля, м")
	erosionCmd.Flags().Float64Var(&erosionPorosity, "porosity", 0.4, "пористость наносов")
	erosionCmd.Flags().Float64Var(&erosionCERCCoefficient, "cerc-coefficient", 0.39, "безразмерный коэффициент CERC")
	erosionCmd.Flags().Float64Var(&erosionOffshoreDistance, "offshore-sample-distance", 300, "расстояние отбора глубины от берега, м")
	erosionCmd.Flags().Float64Var(&erosionMaxChange, "max-shoreline-change", 25, "максимальное смещение берега за одно состояние волн, м")
	erosionCmd.Flags().Float64Var(&erosionMaxBathymetryGap, "max-bathymetry-gap", 1500, "максимальная дистанция до реальной точки глубины, м")
	erosionCmd.Flags().Float64Var(&erosionLeftBoundaryTransport, "left-boundary-transport", 0, "поток наносов через левую границу, м³/с; положительный направлен внутрь сегмента")
	erosionCmd.Flags().Float64Var(&erosionRightBoundaryTransport, "right-boundary-transport", 0, "поток наносов через правую границу, м³/с; положительный направлен из сегмента")
	erosionCmd.Flags().StringVar(&erosionSedimentSources, "sediment-sources", "", "JSON внешних источников и стоков наносов по ячейкам")
	erosionCmd.Flags().StringVar(&erosionStructures, "structures", "", "JSON сооружений, изменяющих пропуск потока между ячейками")

	// Export options
	erosionCmd.Flags().StringVar(&erosionOutputCSV, "output-csv", "", "путь к CSV файлу для экспорта метрик")
	erosionCmd.Flags().StringVar(&erosionCSVFormat, "csv-format", "long", "формат CSV: long или wide")
	erosionCmd.Flags().StringVar(&erosionOutputGIF, "output-gif", "", "путь к GIF файлу для анимации")
	erosionCmd.Flags().IntVar(&erosionGIFFPS, "gif-fps", 10, "кадров в секунду для GIF")
	erosionCmd.Flags().IntVar(&erosionGIFSkip, "gif-skip", 1, "пропускать каждые N кадров")
}

func runErosion(_ *cobra.Command, _ []string) error {
	if err := validateCERCInputs(erosionInput, erosionSourceURL, erosionBathymetry, erosionWaveInput); err != nil {
		return err
	}

	result, err := coastline.Load(coastline.LoadOptions{
		LocalPath: erosionInput,
		RemoteURL: erosionSourceURL,
		Refresh:   erosionRefresh,
	})
	if err != nil {
		return fmt.Errorf("загрузка береговой линии: %w", err)
	}

	fmt.Printf("Загружено: %s (%d точек)\n", result.Source, len(result.Points))

	modelInputs, err := loadModelInputs(erosionBathymetry, erosionLithology, erosionEnableLithology, erosionBathymetryResolution)
	if err != nil {
		return err
	}
	printModelInputWarnings(modelInputs)
	if modelInputs.BathymetryGrid != nil {
		fmt.Printf("✓ Батиметрия загружена: %s (%d точек, шаг %.6f°)\n", modelInputs.BathymetryPath, len(modelInputs.BathymetryGrid.Points), modelInputs.BathymetryGrid.Resolution)
	}
	if modelInputs.LithologyProfile != nil {
		fmt.Printf("✓ Литология загружена: %s (%d точек)\n", modelInputs.LithologyPath, len(modelInputs.LithologyProfile.Points))
	}
	sedimentSources, err := loadLongshoreSedimentSources(erosionSedimentSources)
	if err != nil {
		return err
	}
	structures, err := loadLongshoreStructures(erosionStructures)
	if err != nil {
		return err
	}

	climate, err := geometry.LoadWaveClimate(erosionWaveInput, erosionWaveSource)
	if err != nil {
		return err
	}
	if erosionSteps > 0 && erosionSteps < len(climate.Conditions) {
		climate.Conditions = climate.Conditions[:erosionSteps]
	}
	if err := validateCERCResourceLimits(len(climate.Conditions), len(result.Points), erosionMaxWaveConditions, erosionMaxCoastPoints, erosionMaxSVGFrames); err != nil {
		return err
	}
	scenario := classifyLongshoreScenario()
	model, err := geometry.RunLongshoreCERC(result.Points, climate, geometry.LongshoreModelConfig{
		Scenario:                  scenario,
		Bathymetry:                modelInputs.BathymetryGrid,
		BathymetrySource:          modelInputs.BathymetryPath,
		BathymetrySHA256:          modelInputs.BathymetrySHA256,
		BathymetryPassport:        modelInputs.BathymetryPassportPath,
		BathymetryStatus:          modelInputs.BathymetryStatus,
		SedimentSources:           sedimentSources,
		Structures:                structures,
		LeftBoundaryTransportM3S:  erosionLeftBoundaryTransport,
		RightBoundaryTransportM3S: erosionRightBoundaryTransport,
		BreakingIndex:             erosionBreakingIndex,
		BermHeightMeters:          erosionBermHeight,
		ClosureDepthMeters:        erosionClosureDepth,
		Porosity:                  erosionPorosity,
		CERCCoefficient:           erosionCERCCoefficient,
		OffshoreSampleDistanceM:   erosionOffshoreDistance,
		MaxShorelineChangeMeters:  erosionMaxChange,
		MaxBathymetryGapMeters:    erosionMaxBathymetryGap,
	})
	if err != nil {
		return fmt.Errorf("расчёт вдольберегового транспорта: %w", err)
	}
	snapshots := model.Snapshots
	firstCondition := climate.Conditions[0]
	waveOptions := geometry.WaveErosionOptions{WindSourceDirectionDeg: firstCondition.DirectionFromDeg, BathymetryGrid: modelInputs.BathymetryGrid}

	fmt.Printf("Волновой ряд: %s (%d состояний)\n", climate.Source, len(climate.Conditions))
	table := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(table, "Шаг\tHs, м\tTp, с\tРазмыв, м³\tАккумуляция, м³\tГраница, м³\tИсточники, м³\tНевязка, м³")
	fmt.Fprintln(table, "---\t-----\t-----\t----------\t----------------\t------------\t--------------\t-----------")
	for i, step := range model.Steps {
		fmt.Fprintf(table, "%d\t%.2f\t%.2f\t%.3f\t%.3f\t%.3f\t%.3f\t%.9f\n", i+1, step.Condition.SignificantWaveHeightM, step.Condition.PeakPeriodSeconds, step.ErodedVolumeM3, step.DepositedVolumeM3, step.BoundaryNetVolumeM3, step.ExternalSedimentVolumeM3, step.BalanceClosureResidualM3)
	}
	table.Flush()
	printLongshoreInputQuality(model.InputQuality)
	printScenarioClassification(model.ScenarioClassification)

	fmt.Println("\n✓ Моделирование эрозии завершено")

	// Create SVG visualizations
	outputMgr := cli.NewOutputPathManager(erosionOutput)
	if err := outputMgr.EnsureDirectories(); err != nil {
		return fmt.Errorf("подготовка каталогов вывода: %w", err)
	}
	simulationSteps := len(snapshots) - 1
	if simulationSteps < 0 {
		simulationSteps = 0
	}
	if err := cli.WriteErosionSVGSeriesWithLimit(result.Points, snapshots, simulationSteps, 0, 0,
		waveOptions, outputMgr, result.DatasetName, result.Source, result.Validation, erosionMaxSVGFrames, model.ScenarioClassification); err != nil {
		return fmt.Errorf("создание отчёта эрозии: %w", err)
	}
	writeModel := cli.WriteLongshoreModelJSON
	if erosionSteps == 0 {
		writeModel = cli.WriteLongshoreModelJSONStreaming
	}
	if err := writeModel(model, outputMgr); err != nil {
		return fmt.Errorf("сохранение баланса наносов: %w", err)
	}
	if err := cli.WriteShorelineVisualization(model, outputMgr); err != nil {
		return fmt.Errorf("создание интерактивной карты: %w", err)
	}
	if err := exportErosionArtifacts(outputMgr, snapshots, nil, erosionOutputCSV, erosionCSVFormat, erosionOutputGIF, erosionGIFFPS, erosionGIFSkip); err != nil {
		return err
	}
	return nil
}
