package cobra

import (
	"strings"
	"testing"
)

func TestValidateCERCResourceLimits(t *testing.T) {
	for _, test := range []struct {
		name       string
		conditions int
		points     int
		maxWaves   int
		maxPoints  int
		maxSVG     int
		wantError  string
	}{
		{name: "годовой ряд в бюджете", conditions: 8766, points: 200, maxWaves: 10000, maxPoints: 200, maxSVG: 64},
		{name: "старый CLI без лимитов", conditions: 12000, points: 500, maxWaves: 0, maxPoints: 0, maxSVG: 0},
		{name: "слишком много состояний", conditions: 10001, points: 10, maxWaves: 10000, maxPoints: 200, maxSVG: 64, wantError: "волновой ряд"},
		{name: "слишком много точек", conditions: 100, points: 201, maxWaves: 10000, maxPoints: 200, maxSVG: 64, wantError: "береговая линия"},
		{name: "один SVG недопустим", conditions: 100, points: 10, maxSVG: 1, wantError: "лимит SVG"},
		{name: "отрицательный лимит недопустим", conditions: 100, points: 10, maxWaves: -1, wantError: "лимиты"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateCERCResourceLimits(test.conditions, test.points, test.maxWaves, test.maxPoints, test.maxSVG)
			if test.wantError == "" && err != nil {
				t.Fatalf("неожиданная ошибка: %v", err)
			}
			if test.wantError != "" && (err == nil || !strings.Contains(err.Error(), test.wantError)) {
				t.Fatalf("ошибка = %v, нужна подстрока %q", err, test.wantError)
			}
		})
	}
}
