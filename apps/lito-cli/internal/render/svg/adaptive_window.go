package svg

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"coastal-geometry/internal/domain/geometry"
	mesh2d "coastal-geometry/internal/domain/mesh"
)

// AdaptiveWindowOptions задаёт воспроизводимое окно для сравнения фактических сеток.
type AdaptiveWindowOptions struct {
	Algorithm mesh2d.Algorithm
	MinSizeM  float64
	MaxSizeM  float64
	Preset    string
}

type adaptiveWindowCell struct {
	points   [4]mesh2d.Point
	quality  float64
	meanEdge float64
}

// DrawAdaptiveWindowSVG создаёт подробный и публикационный SVG одного окна.
// false означает, что в заданном окне нет ячеек; файлы тогда не создаются.
func DrawAdaptiveWindowSVG(domain mesh2d.PreparedDomain, generated mesh2d.Mesh, options AdaptiveWindowOptions, detailedPath, publicationPath string) (bool, error) {
	if options.Preset != "kizilirmak" {
		return false, fmt.Errorf("неизвестное окно детализации %q", options.Preset)
	}
	center := domain.Projection.Project(geometry.LatLon{Lat: 41.75, Lon: 35.90})
	center.X += 4300
	center.Y -= 1850
	const windowWidth, windowHeight = 4200.0, 2625.0
	minX, minY := center.X-windowWidth/2, center.Y-windowHeight/2
	cells := make([]adaptiveWindowCell, 0, 1024)
	for _, cell := range generated.Cells {
		if cell.NodeCount != 4 {
			continue
		}
		var item adaptiveWindowCell
		cx, cy := 0.0, 0.0
		valid := true
		for index, nodeID := range cell.Nodes {
			if nodeID <= 0 || nodeID >= len(generated.Nodes) {
				valid = false
				break
			}
			point := generated.Nodes[nodeID]
			item.points[index] = point
			cx += point.X / 4
			cy += point.Y / 4
			nextID := cell.Nodes[(index+1)%4]
			if nextID <= 0 || nextID >= len(generated.Nodes) {
				valid = false
				break
			}
			item.meanEdge += math.Hypot(point.X-generated.Nodes[nextID].X, point.Y-generated.Nodes[nextID].Y) / 4
		}
		if !valid || cx < minX || cx > minX+windowWidth || cy < minY || cy > minY+windowHeight {
			continue
		}
		item.quality = mesh2d.QuadrilateralQuality(generated.Nodes, cell)
		cells = append(cells, item)
	}
	if len(cells) == 0 {
		return false, nil
	}
	const previewLimit = 50000
	stride := int(math.Ceil(float64(len(cells)) / previewLimit))
	if stride < 1 {
		stride = 1
	}
	for _, target := range []struct {
		path        string
		publication bool
	}{{detailedPath, false}, {publicationPath, true}} {
		if err := writeAdaptiveWindow(target.path, cells, minX, minY, windowWidth, windowHeight, stride, options, target.publication); err != nil {
			return false, err
		}
	}
	return true, nil
}

func writeAdaptiveWindow(path string, cells []adaptiveWindowCell, minX, minY, windowWidth, windowHeight float64, stride int, options AdaptiveWindowOptions, publication bool) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("создать каталог подробной сетки: %w", err)
	}
	const width, plotX, plotY = 1500.0, 70.0, 180.0
	plotW := 1100.0
	if publication {
		plotW = 1360
	}
	plotH := plotW * windowHeight / windowWidth
	height := plotY + plotH + 105
	var b strings.Builder
	b.Grow(len(cells)/stride*130 + 4000)
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" role="img" aria-label="Фактическая адаптивная сетка: %s, Кызылырмакская коса">`, width, height, escapeText(options.Algorithm.RussianName()))
	b.WriteString(`<rect width="100%" height="100%" fill="#f8fafc"/>`)
	fmt.Fprintf(&b, `<text x="70" y="66" fill="#142d3b" font-family="sans-serif" font-size="34" font-weight="700">Кызылырмакская коса — %s</text>`, escapeText(options.Algorithm.RussianName()))
	fmt.Fprintf(&b, `<text x="70" y="111" fill="#526874" font-family="sans-serif" font-size="22">Фактическая сетка %.0f–%.0f м · окно %.1f × %.1f км</text>`, options.MinSizeM, options.MaxSizeM, windowWidth/1000, windowHeight/1000)
	b.WriteString(`<defs><clipPath id="mesh-window"><rect x="70" y="180" width="`)
	fmt.Fprintf(&b, `%.0f" height="%.0f"/></clipPath></defs>`, plotW, plotH)
	fmt.Fprintf(&b, `<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="#e5f3f5" stroke="#526874" stroke-width="2"/>`, plotX, plotY, plotW, plotH)
	b.WriteString(`<g clip-path="url(#mesh-window)">`)
	qualitySum, edgeSum := 0.0, 0.0
	for index, cell := range cells {
		qualitySum += cell.quality
		edgeSum += cell.meanEdge
		if index%stride != 0 {
			continue
		}
		b.WriteString(`<polygon points="`)
		for _, point := range cell.points {
			x := plotX + (point.X-minX)/windowWidth*plotW
			y := plotY + (minY+windowHeight-point.Y)/windowHeight*plotH
			fmt.Fprintf(&b, `%.2f,%.2f `, x, y)
		}
		fmt.Fprintf(&b, `" fill="%s" stroke="#31566a" stroke-width="0.9"/>`, adaptiveEdgeColor(cell.meanEdge, options.MinSizeM, options.MaxSizeM))
	}
	b.WriteString(`</g>`)
	fmt.Fprintf(&b, `<text x="70" y="%.0f" fill="#526874" font-family="sans-serif" font-size="18">LAEA · ячеек в окне: %d · среднее ребро: %.0f м · Qср: %.3f</text>`, plotY+plotH+42, len(cells), edgeSum/float64(len(cells)), qualitySum/float64(len(cells)))
	if stride > 1 {
		fmt.Fprintf(&b, `<text x="70" y="%.0f" fill="#854d0e" font-family="sans-serif" font-size="16">SVG прорежен 1:%d; полный набор ячеек сохранён в MSH.</text>`, plotY+plotH+72, stride)
	}
	if !publication {
		b.WriteString(`<text x="1210" y="222" fill="#142d3b" font-family="sans-serif" font-size="22" font-weight="700">Длина ребра</text>`)
		for i := 0; i < 8; i++ {
			value := options.MinSizeM + (options.MaxSizeM-options.MinSizeM)*float64(i)/7
			fmt.Fprintf(&b, `<rect x="1210" y="%.0f" width="38" height="38" fill="%s" stroke="#31566a"/>`, 250+float64(i)*48, adaptiveEdgeColor(value, options.MinSizeM, options.MaxSizeM))
			fmt.Fprintf(&b, `<text x="1260" y="%.0f" fill="#526874" font-family="sans-serif" font-size="17">%.0f м</text>`, 276+float64(i)*48, value)
		}
	}
	b.WriteString(`</svg>`)
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		return fmt.Errorf("запись подробной сетки: %w", err)
	}
	return nil
}

func adaptiveEdgeColor(edge, minimum, maximum float64) string {
	position := 0.0
	if maximum > minimum {
		position = math.Max(0, math.Min(1, (edge-minimum)/(maximum-minimum)))
	}
	from, to := [3]float64{205, 226, 251}, [3]float64{13, 54, 107}
	return fmt.Sprintf("#%02x%02x%02x",
		int(math.Round(from[0]+position*(to[0]-from[0]))),
		int(math.Round(from[1]+position*(to[1]-from[1]))),
		int(math.Round(from[2]+position*(to[2]-from[2]))))
}
