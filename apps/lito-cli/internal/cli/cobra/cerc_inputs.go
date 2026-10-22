package cobra

import (
	"fmt"
	"strings"
)

// validateCERCInputs проверяет явный выбор входов до чтения файлов и сетевых запросов.
func validateCERCInputs(input, sourceURL, bathymetry, waves string) error {
	hasInput := strings.TrimSpace(input) != ""
	hasSource := strings.TrimSpace(sourceURL) != ""
	if hasInput && hasSource {
		return fmt.Errorf("укажите один источник контура: --input или --source-url")
	}
	var missing []string
	if !hasInput && !hasSource {
		missing = append(missing, "--input (или --source-url)")
	}
	if strings.TrimSpace(bathymetry) == "" {
		missing = append(missing, "--bathymetry")
	}
	if strings.TrimSpace(waves) == "" {
		missing = append(missing, "--wave-input")
	}
	if len(missing) > 0 {
		return fmt.Errorf("не заданы входные данные: %s; выберите реальные сохранённые данные, демонстрационный сценарий удалён", strings.Join(missing, ", "))
	}
	return nil
}
