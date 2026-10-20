package cobra

import (
	"encoding/json"
	"fmt"
	"os"

	"coastal-geometry/internal/cli"
	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/geometry"
	"coastal-geometry/internal/render/svg"

	"github.com/spf13/cobra"
)

const defaultBlackSeaMapOutput = "output/black-sea-map"

var (
	mapInput     string
	mapSourceURL string
	mapRefresh   bool
	mapOutput    string
)

var mapCmd = &cobra.Command{
	Use:   "map black-sea",
	Short: "Постройте обзорную карту побережья Чёрного моря",
	Long: `Создаёт обзорную SVG-карту всего побережья Чёрного моря и GeoJSON-экспорт.
По умолчанию используется полный закреплённый контур MarineRegions без сети.
Стартовый участок Сочи отмечается отдельно. Эта карта даёт контекст
для исследования и не является входом одномерной модели CERC.`,
	Args: func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 || args[0] != "black-sea" {
			return fmt.Errorf("укажите единственный доступный объект: black-sea")
		}
		return nil
	},
	RunE: runMap,
}

func init() {
	rootCmd.AddCommand(mapCmd)
	mapCmd.Flags().StringVar(&mapInput, "input", "", "путь к локальному GeoJSON/JSON контуру вместо поставляемого снимка")
	mapCmd.Flags().StringVar(&mapSourceURL, "source-url", "", "URL GeoJSON контура вместо источника MarineRegions")
	mapCmd.Flags().BoolVar(&mapRefresh, "refresh", false, "обновить кэш открытого контура")
	mapCmd.Flags().StringVar(&mapOutput, "output", defaultBlackSeaMapOutput, "каталог результатов карты")
}

// runMap строит обзорную карту. Для автоматического режима он использует
// морской полигон MarineRegions, чья граница проходит по побережью и внешней
// границе моря; поэтому результат не следует применять как съёмочный контур.
func runMap(cmd *cobra.Command, args []string) error {
	contour, alerts, err := loadBlackSeaMapContour(mapInput, mapSourceURL, mapRefresh)
	if err != nil {
		return fmt.Errorf("загрузка контура Чёрного моря: %w", err)
	}
	sochi, err := coastline.Load(coastline.LoadOptions{LocalPath: blackSeaSochiCoastlinePath})
	if err != nil {
		return fmt.Errorf("загрузка стартового участка Сочи: %w", err)
	}

	output := cli.NewOutputPathManager(mapOutput)
	if err := output.EnsureDirectories(); err != nil {
		return fmt.Errorf("подготовка каталога карты: %w", err)
	}

	svgPath := output.SVGPath("black-sea-coast.svg")
	source := contour.DatasetName
	if contour.Source == coastline.DefaultBlackSeaCoastlinePath {
		source = "MarineRegions · MRGID 3319"
	}
	if err := svg.DrawEnhancedSVG(svg.EnhancedDocument{
		MinimalMap:  true,
		GridOptions: &svg.GridOptions{Show: true, LineColor: "#aebdc5", Opacity: 0.55},
		Document: svg.Document{
			Title: "Береговая линия Чёрного моря",
			Subtitle: fmt.Sprintf("WGS 84 (EPSG:4326) · %d вершин · длина %.1f км\nИсточник: %s\nСиний — контур моря; оранжевый — участок Сочи",
				len(contour.Points), geometry.PolylineLength(contour.Points), source),
			Layers: []svg.Layer{
				{
					Label:       "Побережье и граница Чёрного моря",
					Points:      contour.Points,
					LengthKM:    geometry.PolylineLength(contour.Points),
					Stroke:      "#176b87",
					StrokeWidth: 2.2,
					Opacity:     1,
				},
				{
					Label:       "Сочи: стартовый участок CERC",
					Points:      sochi.Points,
					LengthKM:    geometry.PolylineLength(sochi.Points),
					Stroke:      "#c2410c",
					StrokeWidth: 4.2,
					Opacity:     1,
				},
			},
		},
	}, svgPath); err != nil {
		return fmt.Errorf("создание SVG-карты: %w", err)
	}

	geoJSONPath := output.MetricsPath("black-sea-coast.geojson")
	if err := writeBlackSeaMapGeoJSON(geoJSONPath, contour, sochi); err != nil {
		return fmt.Errorf("сохранение GeoJSON-карты: %w", err)
	}

	fmt.Printf("✓ Контур Чёрного моря: %s (%d вершин)\n", contour.Source, len(contour.Points))
	for _, alert := range alerts {
		fmt.Printf("Предупреждение: %s\n", alert)
	}
	fmt.Printf("✓ SVG-карта: %s\n", svgPath)
	fmt.Printf("✓ GeoJSON-карта: %s\n", geoJSONPath)
	return nil
}

// loadBlackSeaMapContour использует закреплённый снимок, явный файл или
// явно запрошенный удалённый источник. Подмена неполной схемой запрещена.
func loadBlackSeaMapContour(input, sourceURL string, refresh bool) (coastline.LoadResult, []string, error) {
	if sourceURL == "" && input == "" {
		if refresh {
			sourceURL = coastline.DefaultCoastlineGeoJSONURL
		} else {
			input = coastline.DefaultBlackSeaCoastlinePath
		}
	}
	result, err := coastline.Load(coastline.LoadOptions{
		LocalPath:    input,
		RemoteURL:    sourceURL,
		RemoteBounds: coastline.DefaultBlackSeaBounds,
		Refresh:      refresh,
	})
	if err == nil {
		alerts := append([]string(nil), result.LoadWarnings...)
		return result, alerts, nil
	}
	return coastline.LoadResult{}, nil, err
}

type blackSeaMapGeoJSON struct {
	Type     string                  `json:"type"`
	Features []blackSeaMapGeoFeature `json:"features"`
}

type blackSeaMapGeoFeature struct {
	Type       string                 `json:"type"`
	Properties map[string]string      `json:"properties"`
	Geometry   blackSeaMapGeoGeometry `json:"geometry"`
}

type blackSeaMapGeoGeometry struct {
	Type        string      `json:"type"`
	Coordinates [][]float64 `json:"coordinates"`
}

// writeBlackSeaMapGeoJSON сохраняет контур и выделенный участок отдельными
// слоями GeoJSON, чтобы их можно было открыть в ГИС без ручного преобразования.
func writeBlackSeaMapGeoJSON(path string, contour, sochi coastline.LoadResult) error {
	payload := blackSeaMapGeoJSON{
		Type: "FeatureCollection",
		Features: []blackSeaMapGeoFeature{
			{
				Type: "Feature",
				Properties: map[string]string{
					"name":   "Побережье и граница Чёрного моря",
					"source": contour.Source,
					"usage":  "Обзорная карта; не использовать как локальный вход CERC",
				},
				Geometry: blackSeaMapGeoGeometry{Type: "LineString", Coordinates: geoJSONCoordinates(contour.Points)},
			},
			{
				Type: "Feature",
				Properties: map[string]string{
					"name":   "Сочи: стартовый участок CERC",
					"source": sochi.Source,
					"usage":  "Технический стартовый участок; не заменяет геодезическую съёмку",
				},
				Geometry: blackSeaMapGeoGeometry{Type: "LineString", Coordinates: geoJSONCoordinates(sochi.Points)},
			},
		},
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// geoJSONCoordinates преобразует внутренние широту-долготу в порядок
// GeoJSON: долгота, широта.
func geoJSONCoordinates(points []geometry.LatLon) [][]float64 {
	coordinates := make([][]float64, 0, len(points))
	for _, point := range points {
		coordinates = append(coordinates, []float64{point.Lon, point.Lat})
	}
	return coordinates
}
