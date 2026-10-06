package svg

import (
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"coastal-geometry/internal/domain/geometry"
	mesh2d "coastal-geometry/internal/domain/mesh"
)

func TestDrawAdaptiveWindowSVGCreatesBothFiguresFromActualCells(t *testing.T) {
	projection := mesh2d.EqualAreaProjection{ReferenceLat: 42, ReferenceLon: 36}
	center := projection.Project(geometry.LatLon{Lat: 41.75, Lon: 35.90})
	center.X += 4300
	center.Y -= 1850
	mesh := mesh2d.Mesh{
		Nodes: []mesh2d.Point{{},
			{X: center.X - 100, Y: center.Y - 100},
			{X: center.X + 100, Y: center.Y - 100},
			{X: center.X + 100, Y: center.Y + 100},
			{X: center.X - 100, Y: center.Y + 100},
		},
		Cells: []mesh2d.Cell{{Nodes: [4]int{1, 2, 3, 4}, NodeCount: 4}},
	}
	directory := t.TempDir()
	detail := filepath.Join(directory, "detail.svg")
	publication := filepath.Join(directory, "publication.svg")
	rendered, err := DrawAdaptiveWindowSVG(mesh2d.PreparedDomain{Projection: projection}, mesh,
		AdaptiveWindowOptions{Algorithm: mesh2d.AlgorithmDelaunay, MinSizeM: 125, MaxSizeM: 250, Preset: "kizilirmak"}, detail, publication)
	if err != nil || !rendered {
		t.Fatalf("окно не построено: rendered=%t, err=%v", rendered, err)
	}
	for _, path := range []string{detail, publication} {
		data, readErr := os.ReadFile(path)
		if readErr != nil || !strings.Contains(string(data), "<polygon") || !strings.Contains(string(data), "Qср: 1.000") {
			t.Fatalf("SVG не содержит фактическую ячейку и качество: %s, %v", path, readErr)
		}
		if parseErr := xml.Unmarshal(data, new(struct{})); parseErr != nil {
			t.Fatalf("SVG не является корректным XML: %s: %v", path, parseErr)
		}
	}
}

func TestDrawAdaptiveWindowSVGSkipsEmptyWindow(t *testing.T) {
	directory := t.TempDir()
	detail := filepath.Join(directory, "detail.svg")
	publication := filepath.Join(directory, "publication.svg")
	rendered, err := DrawAdaptiveWindowSVG(mesh2d.PreparedDomain{}, mesh2d.Mesh{},
		AdaptiveWindowOptions{Preset: "kizilirmak"}, detail, publication)
	if err != nil || rendered {
		t.Fatalf("пустое окно должно пропускаться: rendered=%t, err=%v", rendered, err)
	}
	if _, statErr := os.Stat(detail); !os.IsNotExist(statErr) {
		t.Fatalf("пустое окно создало файл: %v", statErr)
	}
}
