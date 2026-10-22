package cli

import (
	"math"
	"testing"

	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/fractal"
)

func TestArticleBoxCountingRegression(t *testing.T) {
	t.Chdir("../..")
	contour, err := coastline.Load(coastline.LoadOptions{})
	if err != nil {
		t.Fatal(err)
	}
	analysis := fractal.AnalyzeBoxCounting(contour.Points)
	if !analysis.Valid || !analysis.StableAcrossScales || len(analysis.Samples) != 13 ||
		math.Abs(analysis.Dimension-1.108395268193275) > 1e-10 ||
		math.Abs(analysis.RegressionRSquared-0.9999260180445332) > 1e-10 {
		t.Fatalf("box-counting не воспроизводит архивный рисунок 2: %+v", analysis)
	}
	residualSum := 0.0
	for _, sample := range analysis.Samples[analysis.RegressionStart : analysis.RegressionEnd+1] {
		residualSum += sample.LogBoxes - (analysis.Dimension*sample.LogInvScale + analysis.RegressionIntercept)
	}
	if math.Abs(residualSum) > 1e-10 {
		t.Fatalf("свободный член не принадлежит принятой регрессии: сумма остатков %g", residualSum)
	}
	plot := logLogPlotOptionsFromAnalysis(analysis)
	metrics := dimensionMetricsFromAnalysis(analysis)
	if plot.RegressionIntercept != metrics.RegressionIntercept || plot.Points[1].BoxesCovered != 21 ||
		plot.Points[1].BoxesCovered != metrics.Samples[1].BoxesCovered {
		t.Fatal("график и JSON не используют один результат анализа")
	}
}
