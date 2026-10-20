package coastline

import (
	"coastal-geometry/internal/domain/geometry"
	"context"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestRegionClipCrossesBoundsWithBothEndpointsOutside(t *testing.T) {
	b := GeoBounds{MinLon: 32, MaxLon: 33, MinLat: 43, MaxLat: 44}
	a, z, ok := clipRegionEdge(geometry.LatLon{Lon: 31, Lat: 42.5}, geometry.LatLon{Lon: 34, Lat: 44.5}, b)
	if !ok || math.Abs(a.Lon-32) > 1e-12 || math.Abs(a.Lat-(42.5+2.0/3)) > 1e-12 || math.Abs(z.Lon-33) > 1e-12 || math.Abs(z.Lat-(42.5+4.0/3)) > 1e-12 {
		t.Fatalf("неверное пересечение: %+v %+v %v", a, z, ok)
	}
}

func TestRegionPreservesSeparateVisitsAndRingWrap(t *testing.T) {
	b := GeoBounds{MinLon: 32, MaxLon: 33, MinLat: 43, MaxLat: 44}
	points := []geometry.LatLon{{Lon: 32.2, Lat: 43.2}, {Lon: 31, Lat: 43.4}, {Lon: 32.2, Lat: 43.8}, {Lon: 34, Lat: 43.8}}
	parts := clipPolyline(points, b)
	if len(parts) != 2 || len(parts[0]) != 2 || len(parts[1]) != 3 {
		t.Fatalf("разрывы исходной линии потеряны: %+v", parts)
	}
	ring := []geometry.LatLon{{Lon: 32.2, Lat: 43.2}, {Lon: 34, Lat: 43.2}, {Lon: 34, Lat: 43.8}, {Lon: 32.2, Lat: 43.8}, {Lon: 32.2, Lat: 43.2}}
	parts = clipPolyline(ring, b)
	if len(parts) != 1 || len(parts[0]) != 4 || parts[0][1] != ring[3] || parts[0][2] != ring[0] {
		t.Fatalf("начало кольца создало искусственный разрыв: %+v", parts)
	}
}

func TestSelectRegionKeepsAllSourcePathsAndRejectsEmptyArea(t *testing.T) {
	path := filepath.Join(t.TempDir(), "coast.geojson")
	data := []byte(`{"type":"MultiLineString","coordinates":[[[31,43.2],[34,43.2]],[[31,43.8],[34,43.8]]]}`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	r, err := SelectRegion(context.Background(), path, GeoBounds{MinLon: 32, MaxLon: 33, MinLat: 43, MaxLat: 44})
	if err != nil {
		t.Fatal(err)
	}
	if r.SourcePaths != 2 || len(r.Segments) != 2 || r.Segments[0].SourcePath != 1 || r.Segments[1].SourcePath != 2 || r.Segments[0].LengthKM <= 0 || len(r.SourceSHA256) != 64 {
		t.Fatalf("неверный паспорт области: %+v", r)
	}
	if _, err = SelectRegion(context.Background(), path, GeoBounds{MinLon: 35, MaxLon: 36, MinLat: 43, MaxLat: 44}); err == nil {
		t.Fatal("пустая область должна быть ошибкой")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = SelectRegion(ctx, path, GeoBounds{MinLon: 32, MaxLon: 33, MinLat: 43, MaxLat: 44}); err != context.Canceled {
		t.Fatalf("контекст не отменил выделение: %v", err)
	}
}

func TestRegionTangencyAndRepeatedVertexDoNotInventEdges(t *testing.T) {
	b := GeoBounds{MinLon: 32, MaxLon: 33, MinLat: 43, MaxLat: 44}
	if p := clipPolyline([]geometry.LatLon{{Lon: 31, Lat: 43}, {Lon: 32, Lat: 44}, {Lon: 31, Lat: 45}}, b); len(p) != 0 {
		t.Fatalf("касание рамки не является линией: %+v", p)
	}
	a, z := geometry.LatLon{Lon: 32.2, Lat: 43.2}, geometry.LatLon{Lon: 32.8, Lat: 43.8}
	if p := clipPolyline([]geometry.LatLon{a, a, z}, b); len(p) != 1 || len(p[0]) != 2 {
		t.Fatalf("дубликат вершины разорвал берег: %+v", p)
	}
	for _, bad := range []GeoBounds{{MinLon: 33, MaxLon: 32, MinLat: 43, MaxLat: 44}, {MinLon: 32, MaxLon: 33, MinLat: math.NaN(), MaxLat: 44}, {MinLon: 26, MaxLon: 33, MinLat: 43, MaxLat: 44}} {
		if ValidateRegionBounds(bad) == nil {
			t.Fatalf("приняты недопустимые границы: %+v", bad)
		}
	}
}
