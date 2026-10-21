package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"coastal-geometry/internal/domain/coastline"
)

func TestLoadSnapshotUsesPinnedSourceAndRejectsQueryMismatch(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source.json")
	if _, _, err := loadSnapshot(context.Background(), path, "unused", "query", false); err == nil {
		t.Fatal("Сеть не должна включаться неявно")
	}
	data, err := json.Marshal(coastline.ResearchSnapshot{SchemaVersion: 1, Query: "query", Endpoint: endpoint, OSMBaseTime: "2026-10-21T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := loadSnapshot(context.Background(), path, "unused", "different", true); err == nil {
		t.Fatal("Изменённый запрос не должен молча заменять закреплённый источник")
	}
	if _, _, err := loadSnapshot(context.Background(), path, "unused", "query", false); err != nil {
		t.Fatal(err)
	}
}
