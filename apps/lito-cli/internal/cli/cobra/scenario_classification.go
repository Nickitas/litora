package cobra

import (
	"fmt"

	"coastal-geometry/internal/domain/geometry"
)

// classifyLongshoreScenario формирует явный статус интерпретации расчёта.
// Явные входы сами по себе не подтверждают научную пригодность результата.
func classifyLongshoreScenario() geometry.ScenarioClassification {
	return geometry.ScenarioClassification{
		ScenarioStatus: geometry.ScenarioStatusUnclassified,
		UsageLimitations: []string{
			"Lito не подтверждает исследовательскую пригодность пользовательского набора автоматически.",
		},
	}
}

// printScenarioClassification выводит статус отдельно от сообщения об
// успешном завершении численного расчёта.
func printScenarioClassification(classification geometry.ScenarioClassification) {
	fmt.Printf("Статус сценария: %s\n", classification.ScenarioStatus)
	for _, limitation := range classification.UsageLimitations {
		fmt.Printf("Ограничение: %s\n", limitation)
	}
}
