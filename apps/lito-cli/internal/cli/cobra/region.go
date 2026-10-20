package cobra

import (
	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/render/svg"
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
	"os"
	"path/filepath"
)

func init() {
	var input, output string
	var west, south, east, north float64
	command := &cobra.Command{Use: "region", Short: "Выделить все участки берега внутри области Чёрного моря", RunE: func(cmd *cobra.Command, _ []string) error {
		selection, err := coastline.SelectRegion(cmd.Context(), input, coastline.GeoBounds{MinLat: south, MaxLat: north, MinLon: west, MaxLon: east})
		if err != nil {
			return err
		}
		layers := make([]svg.Layer, 0, len(selection.Segments))
		features := []any{}
		for _, segment := range selection.Segments {
			coordinates := make([][2]float64, len(segment.Points))
			for i, p := range segment.Points {
				coordinates[i] = [2]float64{p.Lon, p.Lat}
			}
			geometry := map[string]any{"type": "LineString", "coordinates": coordinates}
			if err = writeRegionJSON(filepath.Join(output, segment.File), geometry); err != nil {
				return err
			}
			features = append(features, map[string]any{"type": "Feature", "properties": segment, "geometry": geometry})
			layers = append(layers, svg.Layer{Label: segment.ID, Points: segment.Points, LengthKM: segment.LengthKM, Stroke: "#136f83", StrokeWidth: 2, Opacity: 1})
		}
		if err = writeRegionJSON(filepath.Join(output, "region/selection.json"), selection); err != nil {
			return err
		}
		if err = writeRegionJSON(filepath.Join(output, "region/coastline.geojson"), map[string]any{"type": "FeatureCollection", "features": features}); err != nil {
			return err
		}
		if err = os.MkdirAll(filepath.Join(output, "svg"), 0o755); err != nil {
			return err
		}
		if err = svg.DrawEnhancedSVG(svg.EnhancedDocument{MinimalMap: true, GridOptions: &svg.GridOptions{Show: true, ShowLatLabels: true, ShowLonLabels: true}, Document: svg.Document{
			Title: "Выбранный участок побережья Чёрного моря", Subtitle: fmt.Sprintf("WGS84 · %.5f–%.5f° в.д. · %.5f–%.5f° с.ш. · отдельных линий: %d · SHA-256 источника: %.16s", west, east, south, north, len(layers), selection.SourceSHA256), Layers: layers,
		}}, filepath.Join(output, "svg/coastline-region.svg")); err != nil {
			return fmt.Errorf("карта выбранного участка: %w", err)
		}
		if !quiet {
			fmt.Fprintf(cmd.OutOrStdout(), "Выделено самостоятельных линий: %d; паспорт: %s\n", len(selection.Segments), filepath.Join(output, "region/selection.json"))
		}
		return nil
	}}
	command.Flags().StringVar(&input, "input", coastline.DefaultBlackSeaCoastlinePath, "GeoJSON полного или своего контура")
	command.Flags().StringVar(&output, "output", "output/coastline-region", "корневой каталог результатов")
	command.Flags().Float64Var(&west, "west", 27, "западная долгота области")
	command.Flags().Float64Var(&east, "east", 42.5, "восточная долгота области")
	command.Flags().Float64Var(&south, "south", 40.5, "южная широта области")
	command.Flags().Float64Var(&north, "north", 47.5, "северная широта области")
	rootCmd.AddCommand(command)
}

func writeRegionJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err = os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("сохранение участка: %w", err)
	}
	return nil
}
