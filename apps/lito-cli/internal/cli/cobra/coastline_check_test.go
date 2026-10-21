package cobra

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestCoastlineCheckManifestOnAcceptanceAndRejection(t *testing.T) {
	command, _, err := rootCmd.Find([]string{"coastline-check"})
	if err != nil {
		t.Fatal(err)
	}
	oldManifest := manifestPath
	command.SetContext(context.Background())
	oldInput := command.Flags().Lookup("input").Value.String()
	oldOutput := command.Flags().Lookup("output").Value.String()
	oldWriter := command.OutOrStdout()
	t.Cleanup(func() {
		manifestPath = oldManifest
		_ = command.Flags().Set("input", oldInput)
		_ = command.Flags().Set("output", oldOutput)
		command.SetOut(oldWriter)
	})
	for _, accepted := range []bool{true, false} {
		t.Run(fmt.Sprint(accepted), func(t *testing.T) {
			directory := t.TempDir()
			input := filepath.Join(directory, "input.geojson")
			output := filepath.Join(directory, "output")
			data := []byte(`{"type":"LineString","coordinates":[[37,43],[38,43]]}`)
			if !accepted {
				data = []byte(`{"type":"LineString","coordinates":[[0,0],[1,1]]}`)
			}
			if err := os.WriteFile(input, data, 0600); err != nil {
				t.Fatal(err)
			}
			_ = command.Flags().Set("input", input)
			_ = command.Flags().Set("output", output)
			manifestPath = filepath.Join(output, "manifest.json")
			command.SetOut(&bytes.Buffer{})
			err := command.RunE(command, nil)
			if (err == nil) != accepted {
				t.Fatalf("accepted=%v, err=%v", accepted, err)
			}
			if accepted {
				if err := rootCmd.PersistentPostRunE(command, nil); err != nil {
					t.Fatal(err)
				}
			}
			var report struct {
				Accepted     bool   `json:"accepted"`
				SourceSHA256 string `json:"sourceSha256"`
			}
			reportData, err := os.ReadFile(filepath.Join(output, "coastline-validation.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(reportData, &report); err != nil {
				t.Fatal(err)
			}
			if report.Accepted != accepted || report.SourceSHA256 != fmt.Sprintf("%x", sha256.Sum256(data)) {
				t.Fatalf("Неверный отчёт: %+v", report)
			}
			manifestData, err := os.ReadFile(manifestPath)
			if err != nil {
				t.Fatal(err)
			}
			var manifest struct {
				Command   string `json:"command"`
				Method    struct{ ID, Revision string }
				Artifacts []struct {
					Path string `json:"path"`
				} `json:"artifacts"`
			}
			if err := json.Unmarshal(manifestData, &manifest); err != nil {
				t.Fatal(err)
			}
			if manifest.Command != "lito coastline-check" || manifest.Method.ID != "coastline-validation" || manifest.Method.Revision != "geometry-1" || len(manifest.Artifacts) != 1 || manifest.Artifacts[0].Path != "coastline-validation.json" {
				t.Fatalf("Неверный манифест: %+v", manifest)
			}
			after, err := os.ReadFile(input)
			if err != nil || !bytes.Equal(data, after) {
				t.Fatalf("Исходник изменился: %v", err)
			}
		})
	}
}
