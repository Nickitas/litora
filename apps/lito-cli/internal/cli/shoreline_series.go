package cli

import (
	"coastal-geometry/internal/domain/geometry"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type shorelineSeriesGroup struct {
	SchemaVersion int          `json:"schemaVersion"`
	ID            string       `json:"id"`
	PointStart    int          `json:"pointStart"`
	Series        [][]*float64 `json:"series"`
}

func writeShorelinePointSeries(model geometry.LongshoreModelResult, pointCount int, temporary string) error {
	series := make([][]*float64, pointCount)
	for point := range series {
		series[point] = make([]*float64, len(model.Snapshots))
	}
	for stepIndex, step := range model.Steps {
		for _, cell := range step.Cells {
			value := cell.ShorelineChangeM
			series[cell.PointIndex][stepIndex+1] = &value
		}
	}
	seriesDir := filepath.Join(temporary, "series")
	if err := os.Mkdir(seriesDir, 0o755); err != nil {
		return fmt.Errorf("создание каталога временных рядов: %w", err)
	}
	for start := 0; start < pointCount; start += shorelineSeriesGroupSize {
		end := min(start+shorelineSeriesGroupSize, pointCount)
		id := fmt.Sprintf("%06d", start/shorelineSeriesGroupSize+1)
		group := shorelineSeriesGroup{
			SchemaVersion: 1,
			ID:            id,
			PointStart:    start,
			Series:        series[start:end],
		}
		data, err := json.Marshal(group)
		if err != nil {
			return fmt.Errorf("сериализация временных рядов %s: %w", id, err)
		}
		if len(data) > shorelineChunkMaxBytes {
			return fmt.Errorf("временные ряды %s превысили лимит размера", id)
		}
		if err := os.WriteFile(filepath.Join(seriesDir, id+".json"), data, 0o644); err != nil {
			return fmt.Errorf("запись временных рядов %s: %w", id, err)
		}
	}
	return nil
}
