package cobra

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"coastal-geometry/internal/domain/geometry"
)

func TestSochiOfflineRejectsMissingCacheWithoutNetwork(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.MkdirAll(filepath.Dir(blackSeaSochiCoastlinePath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(blackSeaSochiCoastlinePath, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := prepareBlackSeaSochiDataWithPolicy(false, true)
	if err == nil || !strings.Contains(err.Error(), "офлайн-режим") {
		t.Fatalf("ожидалась ошибка офлайн-кэша, получено %v", err)
	}
}

func TestSochiOfflineRejectsRefresh(t *testing.T) {
	_, err := prepareBlackSeaSochiDataWithPolicy(true, true)
	if err == nil || !strings.Contains(err.Error(), "--refresh") {
		t.Fatalf("ожидался запрет обновления офлайн-кэша, получено %v", err)
	}
}

func TestErosionOfflineModeOnlyAllowsLocalDemo(t *testing.T) {
	if err := validateErosionOfflineMode(true, true, ""); err != nil {
		t.Fatalf("ожидался допустимый офлайн-демо режим: %v", err)
	}
	if err := validateErosionOfflineMode(true, false, ""); err == nil {
		t.Fatal("офлайн-режим не должен обещать отсутствие сети для других входов")
	}
	if err := validateErosionOfflineMode(true, true, "https://example.test"); err == nil {
		t.Fatal("офлайн-режим не должен принимать удалённый источник")
	}
}

func TestMapOSMStructuresToSochiAppliesOnlyAttachedGroyne(t *testing.T) {
	coast := []geometry.LatLon{{Lat: 43.60, Lon: 39.70}, {Lat: 43.60, Lon: 39.71}, {Lat: 43.60, Lon: 39.72}}
	raw := []byte(`{
  "elements": [
    {"id": 10, "tags": {"man_made":"groyne"}, "geometry": [{"lat":43.60,"lon":39.71},{"lat":43.59,"lon":39.71}]},
    {"id": 11, "tags": {"man_made":"breakwater"}, "geometry": [{"lat":43.60,"lon":39.72},{"lat":43.59,"lon":39.72}]}
  ]
}`)
	structures, inventory, err := mapOSMStructuresToSochi(raw, coast, "2026-08-18T00:00:00Z")
	if err != nil {
		t.Fatalf("mapOSMStructuresToSochi вернула ошибку: %v", err)
	}
	if len(structures) != 1 {
		t.Fatalf("должна примениться только буна, получено %d: %s", len(structures), inventory)
	}
	if structures[0].LeftPointIndex != 1 || structures[0].TransmissionCoefficient != 0 {
		t.Fatalf("неверная привязка сооружения: %#v", structures[0])
	}
}
