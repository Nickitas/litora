package cobra

import (
	"encoding/json"
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/geometry"
)

func TestRunMapCreatesScientificGridWithoutSidebar(t *testing.T) {
	t.Chdir("../../..")
	oldInput, oldSource, oldRefresh, oldOutput := mapInput, mapSourceURL, mapRefresh, mapOutput
	t.Cleanup(func() { mapInput, mapSourceURL, mapRefresh, mapOutput = oldInput, oldSource, oldRefresh, oldOutput })
	mapInput, mapSourceURL, mapRefresh, mapOutput = "", "", false, t.TempDir()
	if err := runMap(mapCmd, []string{"black-sea"}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(mapOutput, "svg/black-sea-coast.svg"))
	if err != nil {
		t.Fatal(err)
	}
	for _, useful := range []string{"EPSG:4326", "9635 вершин", "6398.2 км", "MarineRegions", "OX — долгота", "Масштаб"} {
		if !strings.Contains(string(data), useful) {
			t.Fatalf("в карте нет научных сведений: %s", useful)
		}
	}
	for _, noise := range []string{"фрактальные итерации", "Предупреждени", "локальную съёмку", "Данные карты", "Слои и длины"} {
		if strings.Contains(string(data), noise) {
			t.Fatalf("в карту попал служебный текст: %s", noise)
		}
	}
	var document struct {
		Groups []struct {
			ID     string `xml:"id,attr"`
			Clip   string `xml:"clip-path,attr"`
			Layers []struct {
				Points string `xml:"points,attr"`
			} `xml:"polyline"`
			Grids []struct {
				ID    string     `xml:"id,attr"`
				Lines []struct{} `xml:"line"`
			} `xml:"g"`
		} `xml:"g"`
	}
	if err := xml.Unmarshal(data, &document); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, group := range document.Groups {
		if group.ID != "map-data" {
			continue
		}
		if group.Clip != "url(#map-clip)" || len(group.Layers) != 2 || len(strings.Fields(group.Layers[0].Points)) != 9635 {
			t.Fatal("карта должна содержать полный контур и участок Сочи внутри рамки")
		}
		for _, grid := range group.Grids {
			if grid.ID == "coordinate-grid" && len(grid.Lines) >= 4 {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("в рамке научной карты нет координатной сетки")
	}
}

func TestWriteBlackSeaMapGeoJSONWritesBothLayers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "black-sea.geojson")
	contour := coastline.LoadResult{
		Source: "открытый источник",
		Points: []geometry.LatLon{{Lat: 42, Lon: 30}, {Lat: 43, Lon: 31}},
	}
	sochi := coastline.LoadResult{
		Source: "локальный участок",
		Points: []geometry.LatLon{{Lat: 43.6, Lon: 39.7}, {Lat: 43.61, Lon: 39.71}},
	}
	if err := writeBlackSeaMapGeoJSON(path, contour, sochi); err != nil {
		t.Fatalf("writeBlackSeaMapGeoJSON: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("чтение результата: %v", err)
	}
	var result blackSeaMapGeoJSON
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("разбор GeoJSON: %v", err)
	}
	if result.Type != "FeatureCollection" || len(result.Features) != 2 {
		t.Fatalf("неверная структура GeoJSON: %#v", result)
	}
	if got := result.Features[0].Geometry.Coordinates[0]; got[0] != 30 || got[1] != 42 {
		t.Fatalf("ожидался порядок GeoJSON [долгота, широта], получено %#v", got)
	}
}
