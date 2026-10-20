package cobra

import (
	"bytes"
	"coastal-geometry/internal/cli"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRegionCommandCreatesReusableLinesMapAndManifest(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.geojson")
	output := filepath.Join(dir, "output")
	if err := os.WriteFile(input, []byte(`{"type":"MultiLineString","coordinates":[[[31,43.2],[34,43.2]],[[31,43.8],[34,43.8]]]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	command, _, err := rootCmd.Find([]string{"region"})
	if err != nil {
		t.Fatal(err)
	}
	command.SetContext(context.Background())
	t.Cleanup(func() { command.SetContext(nil) })
	for flag, value := range map[string]string{"input": input, "output": output, "west": "32", "east": "33", "south": "43", "north": "44"} {
		old := command.Flags().Lookup(flag).Value.String()
		t.Cleanup(func() { _ = command.Flags().Set(flag, old) })
		if err := command.Flags().Set(flag, value); err != nil {
			t.Fatal(err)
		}
	}
	command.SetOut(&bytes.Buffer{})
	t.Cleanup(func() { command.SetOut(nil) })
	if err := command.RunE(command, nil); err != nil {
		t.Fatal(err)
	}
	manifest := filepath.Join(output, "manifest.json")
	if err := cli.WriteResultManifest(manifest, "lito region"); err != nil {
		t.Fatal(err)
	}
	var result cli.ResultManifest
	data, err := os.ReadFile(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Artifacts) != 5 || result.Method == nil || result.Method.ID != "coastline-region" {
		t.Fatalf("неполный результат: %+v", result)
	}
	for _, name := range []string{"region/selection.json", "region/coastline.geojson", "region/segments/segment-001.geojson", "region/segments/segment-002.geojson", "svg/coastline-region.svg"} {
		if info, err := os.Stat(filepath.Join(output, name)); err != nil || info.Size() == 0 {
			t.Fatalf("нет результата %s: %v", name, err)
		}
	}
}
