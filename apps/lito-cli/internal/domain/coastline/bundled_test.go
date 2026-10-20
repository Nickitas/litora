package coastline

import (
	"os"
	"testing"
)

func TestBundledBlackSeaIntegrity(t *testing.T) {
	t.Chdir("../../..")
	result, err := Load(LoadOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Source != DefaultBlackSeaCoastlinePath || len(result.Points) != 9635 {
		t.Fatalf("ожидался полный архивный контур: %s, %d точек", result.Source, len(result.Points))
	}
	payload, err := os.ReadFile(DefaultBlackSeaCoastlinePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateBundledBlackSea(DefaultBlackSeaCoastlinePath, payload[:len(payload)-1]); err == nil {
		t.Fatal("усечённый снимок не должен проходить проверку полного контура")
	}
}
