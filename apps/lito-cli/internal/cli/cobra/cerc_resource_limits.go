package cobra

import "fmt"

func validateCERCResourceLimits(conditions, coastPoints, maxConditions, maxCoastPoints, maxSVGFrames int) error {
	if maxConditions < 0 || maxCoastPoints < 0 || maxSVGFrames < 0 || maxSVGFrames == 1 {
		return fmt.Errorf("лимиты состояний волн, точек берега и SVG должны быть неотрицательными; лимит SVG — 0 или не меньше 2")
	}
	if maxConditions > 0 && conditions > maxConditions {
		return fmt.Errorf("волновой ряд содержит %d состояний, лимит запуска — %d", conditions, maxConditions)
	}
	if maxCoastPoints > 0 && coastPoints > maxCoastPoints {
		return fmt.Errorf("береговая линия содержит %d точек, лимит запуска — %d", coastPoints, maxCoastPoints)
	}
	return nil
}
