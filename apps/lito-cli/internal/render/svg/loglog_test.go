package svg

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLogLogUsesReportedCoverageAndRegression(t *testing.T) {
	path := filepath.Join(t.TempDir(), "regression.svg")
	options := LogLogPlotOptions{
		Points: []LogLogPoint{
			{LogInverseScale: 1, LogBoxes: math.Log(20.5), BoxSizeMeters: 200, BoxesCovered: 21, InRegression: true},
			{LogInverseScale: 2, LogBoxes: math.Log(50), BoxSizeMeters: 100, BoxesCovered: 50, InRegression: true},
		},
		Dimension: 1, RSquared: 0.99, RegressionIntercept: 2,
		RegressionFrom: 0, RegressionTo: 1,
	}
	if err := DrawLogLogSVG(options, path); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, marker := range []string{"N(ε)≈21 (округлено)", `data-intercept="2"`, `data-dimension="1"`, "ln(1/ε_rel)"} {
		if !strings.Contains(string(data), marker) {
			t.Errorf("нет согласованной подписи или регрессии: %s", marker)
		}
	}
	// Для выбранного окна крайние X равны 1 и 2. Прямая y=x+2
	// начинается в y=3, а не в исходном ln(20.5).
	minY, maxY := paddedRange(math.Log(20.5), math.Log(50))
	expectedY := 100 + 530 - (3-minY)/(maxY-minY)*530
	if !strings.Contains(string(data), fmt.Sprintf(`y1="%.2f"`, expectedY)) {
		t.Fatal("прямая не использует переданный свободный член")
	}
}

func TestLogLogRejectsNonFiniteAndMissingCoverage(t *testing.T) {
	for _, invalid := range []LogLogPoint{
		{LogInverseScale: math.NaN(), LogBoxes: 1, BoxSizeMeters: 10, BoxesCovered: 3},
		{LogInverseScale: 1, LogBoxes: math.Inf(1), BoxSizeMeters: 10, BoxesCovered: 3},
		{LogInverseScale: 1, LogBoxes: 1, BoxSizeMeters: 0, BoxesCovered: 3},
		{LogInverseScale: 1, LogBoxes: 1, BoxSizeMeters: 10},
	} {
		options := LogLogPlotOptions{Points: []LogLogPoint{invalid, {LogInverseScale: 2, LogBoxes: 2, BoxSizeMeters: 5, BoxesCovered: 7}}}
		if err := DrawLogLogSVG(options, filepath.Join(t.TempDir(), "bad.svg")); err == nil {
			t.Errorf("принята некорректная точка: %+v", invalid)
		}
	}
}
