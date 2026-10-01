package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestResultManifest(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "result.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(directory, "link")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "manifest.json")
	for range 2 {
		if err := WriteResultManifest(path, "lito dimension"); err != nil {
			t.Fatal(err)
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var result ResultManifest
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	if result.SchemaVersion != 2 || result.Method == nil || result.Method.ID != "box-counting" || result.Method.Revision != "baseline-1" {
		t.Fatalf("неверная ревизия метода в манифесте: %+v", result)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Path != "result.json" || result.Artifacts[0].SizeBytes != 2 || len(result.Artifacts[0].SHA256) != 64 {
		t.Fatalf("некорректный манифест: %+v", result)
	}
}

func TestMethodForCommand(t *testing.T) {
	for command, expected := range map[string]string{
		"lito dimension": "box-counting",
		"lito map":       "black-sea-overview",
		"lito erosion":   "cerc-one-line",
	} {
		method := methodForCommand(command)
		if method == nil || method.ID != expected || method.Revision == "" {
			t.Fatalf("%s: неверная ревизия метода: %+v", command, method)
		}
	}
	if methodForCommand("lito seabed build") != nil {
		t.Fatal("неаттестованная команда не должна получать ревизию метода")
	}
}

func TestEmptyManifestFails(t *testing.T) {
	if err := WriteResultManifest(filepath.Join(t.TempDir(), "manifest.json"), "test"); err == nil {
		t.Fatal("ожидалась ошибка отсутствия артефактов")
	}
}
