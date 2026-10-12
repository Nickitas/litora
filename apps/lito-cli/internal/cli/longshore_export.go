package cli

import (
	"bufio"
	"coastal-geometry/internal/domain/geometry"
	"encoding/json"
	"fmt"
	"os"
)

// WriteLongshoreModelJSON сохраняет полный пространственный баланс CERC в
// output/erosion. Файл содержит исходный волновой ряд, снимки и объёмы по
// ячейкам, поэтому пригоден для независимой проверки расчёта.
func WriteLongshoreModelJSON(model geometry.LongshoreModelResult, output *OutputPathManager) error {
	if output == nil {
		return fmt.Errorf("не задан менеджер каталога вывода")
	}
	data, err := json.MarshalIndent(model, "", "  ")
	if err != nil {
		return fmt.Errorf("сериализация баланса CERC: %w", err)
	}
	path := output.ErosionPath("longshore-cerc.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("запись %q: %w", path, err)
	}
	return nil
}

// WriteLongshoreModelJSONStreaming сохраняет тот же полный численный контракт,
// сериализуя снимки и шаги по одному, чтобы годовой ряд не дублировался в памяти.
func WriteLongshoreModelJSONStreaming(model geometry.LongshoreModelResult, output *OutputPathManager) error {
	if output == nil {
		return fmt.Errorf("не задан менеджер каталога вывода")
	}
	path := output.ErosionPath("longshore-cerc.json")
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("создание %q: %w", path, err)
	}
	writer := bufio.NewWriterSize(file, 1024*1024)
	first := true
	writeField := func(name string, value any) error {
		data, marshalErr := json.Marshal(value)
		if marshalErr != nil {
			return fmt.Errorf("сериализация поля %q: %w", name, marshalErr)
		}
		if !first {
			if _, err := writer.WriteString(","); err != nil {
				return err
			}
		}
		first = false
		if _, err := fmt.Fprintf(writer, "%q:", name); err != nil {
			return err
		}
		_, err := writer.Write(data)
		return err
	}
	writeArray := func(name string, count int, item func(int) any) error {
		if !first {
			if _, err := writer.WriteString(","); err != nil {
				return err
			}
		}
		first = false
		if _, err := fmt.Fprintf(writer, "%q:[", name); err != nil {
			return err
		}
		for index := 0; index < count; index++ {
			if index > 0 {
				if _, err := writer.WriteString(","); err != nil {
					return err
				}
			}
			data, marshalErr := json.Marshal(item(index))
			if marshalErr != nil {
				return fmt.Errorf("сериализация %q[%d]: %w", name, index, marshalErr)
			}
			if _, err := writer.Write(data); err != nil {
				return err
			}
		}
		_, err := writer.WriteString("]")
		return err
	}
	writeErr := func() error {
		if _, err := writer.WriteString("{"); err != nil {
			return err
		}
		if err := writeField("scenario_status", model.ScenarioStatus); err != nil {
			return err
		}
		if len(model.UsageLimitations) > 0 {
			if err := writeField("usage_limitations", model.UsageLimitations); err != nil {
				return err
			}
		}
		for _, field := range []struct {
			name  string
			value any
		}{
			{"model", model.Model},
			{"basin_id", model.BasinID},
			{"bathymetry_source", model.BathymetrySource},
		} {
			if err := writeField(field.name, field.value); err != nil {
				return err
			}
		}
		for _, field := range []struct{ name, value string }{
			{"bathymetry_sha256", model.BathymetrySHA256},
			{"bathymetry_passport", model.BathymetryPassport},
			{"bathymetry_status", model.BathymetryStatus},
		} {
			if field.value != "" {
				if err := writeField(field.name, field.value); err != nil {
					return err
				}
			}
		}
		if err := writeField("climate", model.Climate); err != nil {
			return err
		}
		if model.Snapshots == nil {
			if err := writeField("snapshots", nil); err != nil {
				return err
			}
		} else if err := writeArray("snapshots", len(model.Snapshots), func(index int) any { return model.Snapshots[index] }); err != nil {
			return err
		}
		if model.Steps == nil {
			if err := writeField("steps", nil); err != nil {
				return err
			}
		} else if err := writeArray("steps", len(model.Steps), func(index int) any { return model.Steps[index] }); err != nil {
			return err
		}
		if err := writeField("input_quality", model.InputQuality); err != nil {
			return err
		}
		if len(model.SedimentSources) > 0 {
			if err := writeField("sediment_sources", model.SedimentSources); err != nil {
				return err
			}
		}
		if len(model.Structures) > 0 {
			if err := writeField("structures", model.Structures); err != nil {
				return err
			}
		}
		_, err := writer.WriteString("}")
		return err
	}()
	if writeErr == nil {
		writeErr = writer.Flush()
	}
	closeErr := file.Close()
	if writeErr != nil {
		return fmt.Errorf("запись %q: %w", path, writeErr)
	}
	if closeErr != nil {
		return fmt.Errorf("закрытие %q: %w", path, closeErr)
	}
	return nil
}
