package adaptive

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestWriteFigureFiveSVGEmbedsOriginalCardsInStableOrder(t *testing.T) {
	directory := t.TempDir()
	var paths [3]string
	var cards [3][]byte
	for index := range paths {
		paths[index] = filepath.Join(directory, "card-"+string(rune('1'+index))+".svg")
		cards[index] = []byte(`<svg xmlns="http://www.w3.org/2000/svg"><title>Карточка ` + string(rune('1'+index)) + `</title></svg>`)
		if err := os.WriteFile(paths[index], cards[index], 0o600); err != nil {
			t.Fatal(err)
		}
	}
	output := filepath.Join(directory, "fig_05_actual_mesh_fragments.svg")
	if err := WriteFigureFiveSVG(output, FigureFiveSVGConfig{
		CardPaths: paths, Algorithm: "delaunay", MinimumSizeM: 125, MaximumSizeM: 250,
	}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct{ XMLName xml.Name }
	if err := xml.Unmarshal(data, &parsed); err != nil || parsed.XMLName.Local != "svg" {
		t.Fatalf("составной SVG некорректен: %v", err)
	}
	for _, value := range []string{"Кызылырмакская коса", "Батумский залив", "Анатолийский склон", "125–250 м"} {
		if !strings.Contains(string(data), value) {
			t.Fatalf("в SVG отсутствует %q", value)
		}
	}
	encoded := regexp.MustCompile(`data:image/svg\+xml;base64,([^" ]+)`).FindAllSubmatch(data, -1)
	if len(encoded) != 3 {
		t.Fatalf("число вложенных SVG = %d, требуется 3", len(encoded))
	}
	for index, match := range encoded {
		decoded, err := base64.StdEncoding.DecodeString(string(match[1]))
		if err != nil || !bytes.Equal(decoded, cards[index]) {
			t.Fatalf("карточка %d не совпала с исходными байтами: %v", index+1, err)
		}
	}
}

func TestWriteFigureFiveSVGRejectsIncompleteInputs(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "figure.svg")
	if err := WriteFigureFiveSVG(path, FigureFiveSVGConfig{Algorithm: "unknown", MinimumSizeM: 125, MaximumSizeM: 250}); err == nil {
		t.Fatal("неизвестный генератор принят")
	}
	if err := WriteFigureFiveSVG(path, FigureFiveSVGConfig{Algorithm: "delaunay", MinimumSizeM: 125, MaximumSizeM: 250}); err == nil {
		t.Fatal("отсутствующие карточки приняты")
	}
	if err := WriteFigureFiveSVG(path, FigureFiveSVGConfig{Algorithm: "delaunay", MinimumSizeM: math.NaN(), MaximumSizeM: 250}); err == nil {
		t.Fatal("нечисловая граница диапазона принята")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("неполный рисунок не должен публиковаться: %v", err)
	}
}
