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
}
