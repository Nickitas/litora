package cli

import (
	"coastal-geometry/internal/domain/geometry"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"
)

const (
	shorelineChunkMaxFrames = 64
	shorelineChunkMaxBytes  = 4 * 1024 * 1024
	shorelineIndexMaxBytes  = 4 * 1024 * 1024
)

type shorelineFrameIndex struct {
	Index                    int      `json:"index"`
	Time                     *string  `json:"time"`
	ChunkID                  string   `json:"chunkId"`
	DurationHours            *float64 `json:"durationHours"`
	WaveHeightM              *float64 `json:"waveHeightM"`
	ErodedVolumeM3           *float64 `json:"erodedVolumeM3"`
	DepositedVolumeM3        *float64 `json:"depositedVolumeM3"`
	BalanceClosureResidualM3 *float64 `json:"balanceClosureResidualM3"`
}

type shorelineCell struct {
	PointIndex       int     `json:"pointIndex"`
	ShorelineChangeM float64 `json:"shorelineChangeM"`
}

type shorelineFrame struct {
	Index  int               `json:"index"`
	Points []geometry.LatLon `json:"points"`
	Cells  []shorelineCell   `json:"cells"`
}

type shorelineChunk struct {
	SchemaVersion int              `json:"schemaVersion"`
	ID            string           `json:"id"`
	Frames        []shorelineFrame `json:"frames"`
}

type shorelineIndex struct {
	SchemaVersion    int                   `json:"schemaVersion"`
	Mode             string                `json:"mode"`
	ScenarioStatus   string                `json:"scenarioStatus"`
	UsageLimitations []string              `json:"usageLimitations"`
	WaveSource       string                `json:"waveSource"`
	BathymetrySHA256 string                `json:"bathymetrySha256"`
	BathymetryStatus string                `json:"bathymetryStatus"`
	CRS              string                `json:"crs"`
	CoordinateUnit   string                `json:"coordinateUnit"`
	Bounds           [4]float64            `json:"bounds"`
	PointCount       int                   `json:"pointCount"`
	Frames           []shorelineFrameIndex `json:"frames"`
}

// WriteShorelineVisualization сохраняет ограниченные кадры карты из уже
// рассчитанного результата CERC, не изменяя научные значения модели.
func WriteShorelineVisualization(model geometry.LongshoreModelResult, output *OutputPathManager) error {
	if output == nil {
		return fmt.Errorf("не задан каталог вывода визуализации")
	}
	if len(model.Snapshots) != len(model.Steps)+1 || len(model.Snapshots[0]) < 2 {
		return fmt.Errorf("число снимков береговой линии не соответствует шагам CERC")
	}
	pointCount := len(model.Snapshots[0])
	index := shorelineIndex{
		SchemaVersion: 1, Mode: "steps", ScenarioStatus: model.ScenarioStatus,
		UsageLimitations: append([]string{}, model.UsageLimitations...), WaveSource: model.Climate.Source,
		BathymetrySHA256: model.BathymetrySHA256, BathymetryStatus: model.BathymetryStatus,
		CRS: "EPSG:4326", CoordinateUnit: "degrees",
		PointCount: pointCount, Frames: make([]shorelineFrameIndex, 0, len(model.Snapshots)),
	}
	if len(model.Steps) > 0 {
		allTimed := true
		for _, step := range model.Steps {
			if step.Condition.Time.IsZero() {
				allTimed = false
				break
			}
		}
		if allTimed {
			index.Mode = "calendar"
		}
	}

	minLon, minLat := math.Inf(1), math.Inf(1)
	maxLon, maxLat := math.Inf(-1), math.Inf(-1)
	target := output.ErosionPath("visualization")
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("удаление прежней визуализации: %w", err)
	}
	temporary, err := os.MkdirTemp(output.ErosionDir(), ".visualization-")
	if err != nil {
		return fmt.Errorf("создание временного каталога визуализации: %w", err)
	}
	defer os.RemoveAll(temporary)
	if err := os.Mkdir(filepath.Join(temporary, "chunks"), 0o755); err != nil {
		return fmt.Errorf("создание каталога кадров: %w", err)
	}
	chunk := shorelineChunk{SchemaVersion: 1}
	chunkBytes := 0
	chunkNumber := 0
	lastFrameTime := time.Time{}
	flush := func() error {
		if len(chunk.Frames) == 0 {
			return nil
		}
		data, err := json.Marshal(chunk)
		if err != nil {
			return fmt.Errorf("сериализация кадров: %w", err)
		}
		if len(data) > shorelineChunkMaxBytes {
			return fmt.Errorf("кадры визуализации превысили лимит размера")
		}
		path := filepath.Join(temporary, "chunks", chunk.ID+".json")
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return fmt.Errorf("запись кадров визуализации: %w", err)
		}
		chunk = shorelineChunk{SchemaVersion: 1}
		chunkBytes = 0
		return nil
	}
	for i, points := range model.Snapshots {
		if len(points) != pointCount {
			return fmt.Errorf("снимок %d содержит другое число точек", i)
		}
		for _, point := range points {
			if !point.IsValid() {
				return fmt.Errorf("снимок %d содержит некорректные координаты", i)
			}
			minLon = math.Min(minLon, point.Lon)
			minLat = math.Min(minLat, point.Lat)
			maxLon = math.Max(maxLon, point.Lon)
			maxLat = math.Max(maxLat, point.Lat)
		}
		frame := shorelineFrame{Index: i, Points: points, Cells: []shorelineCell{}}
		metadata := shorelineFrameIndex{Index: i}
		if i == 0 && index.Mode == "calendar" {
			lastFrameTime = model.Steps[0].Condition.Time
			value := model.Steps[0].Condition.Time.UTC().Format(time.RFC3339)
			metadata.Time = &value
		}
		if i > 0 {
			step := model.Steps[i-1]
			if step.Condition.DurationHours > 0 && !math.IsInf(step.Condition.DurationHours, 0) && !math.IsNaN(step.Condition.DurationHours) {
				duration := step.Condition.DurationHours
				metadata.DurationHours = &duration
			}
			frame.Cells = make([]shorelineCell, len(step.Cells))
			for j, cell := range step.Cells {
				if cell.PointIndex < 0 || cell.PointIndex >= pointCount || math.IsNaN(cell.ShorelineChangeM) || math.IsInf(cell.ShorelineChangeM, 0) {
					return fmt.Errorf("шаг %d содержит некорректную ячейку", i)
				}
				frame.Cells[j] = shorelineCell{PointIndex: cell.PointIndex, ShorelineChangeM: cell.ShorelineChangeM}
			}
			height, eroded, deposited, residual := step.Condition.SignificantWaveHeightM,
				step.ErodedVolumeM3, step.DepositedVolumeM3, step.BalanceClosureResidualM3
			metadata.WaveHeightM, metadata.ErodedVolumeM3 = &height, &eroded
			metadata.DepositedVolumeM3, metadata.BalanceClosureResidualM3 = &deposited, &residual
			if index.Mode == "calendar" {
				end := step.Condition.Time.Add(time.Duration(step.Condition.DurationHours * float64(time.Hour)))
				if step.Condition.Time.Before(lastFrameTime) || !end.After(step.Condition.Time) {
					return fmt.Errorf("шаг %d содержит перекрывающееся или пустое время", i)
				}
				lastFrameTime = end
				value := end.UTC().Format(time.RFC3339)
				metadata.Time = &value
			}
		}
		frameData, err := json.Marshal(frame)
		if err != nil {
			return fmt.Errorf("сериализация снимка %d: %w", i, err)
		}
		if len(frameData)+100 > shorelineChunkMaxBytes {
			return fmt.Errorf("снимок %d превысил лимит размера визуализации", i)
		}
		if len(chunk.Frames) >= shorelineChunkMaxFrames || chunkBytes+len(frameData)+100 > shorelineChunkMaxBytes {
			if err := flush(); err != nil {
				return err
			}
		}
		if len(chunk.Frames) == 0 {
			chunkNumber++
			chunk.ID = fmt.Sprintf("%06d", chunkNumber)
		}
		metadata.ChunkID = chunk.ID
		index.Frames = append(index.Frames, metadata)
		chunk.Frames = append(chunk.Frames, frame)
		chunkBytes += len(frameData) + 1
	}
	if err := flush(); err != nil {
		return err
	}
	index.Bounds = [4]float64{minLon, minLat, maxLon, maxLat}
	indexData, err := json.Marshal(index)
	if err != nil {
		return fmt.Errorf("сериализация индекса визуализации: %w", err)
	}
	if len(indexData) > shorelineIndexMaxBytes {
		return fmt.Errorf("индекс визуализации превысил лимит размера")
	}
	if err := os.WriteFile(filepath.Join(temporary, "index.json"), indexData, 0o644); err != nil {
		return fmt.Errorf("запись индекса визуализации: %w", err)
	}
	if err := os.Rename(temporary, target); err != nil {
		return fmt.Errorf("публикация визуализации: %w", err)
	}
	return nil
}
