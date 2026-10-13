package adaptive

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"html"
	"io"
	"math"
	"os"
	"path/filepath"
)

const maxFigureFiveCardBytes = 32 * 1024 * 1024

// FigureFiveSVGConfig задаёт проверенные карточки AI-01 и параметры
// публикационной компоновки трёх фактических фрагментов сетки.
type FigureFiveSVGConfig struct {
	CardPaths    [3]string
	Algorithm    string
	MinimumSizeM float64
	MaximumSizeM float64
}

type figureFivePanel struct {
	name    string
	caption string
}

var figureFivePanels = [3]figureFivePanel{
	{name: "Кызылырмакская коса", caption: "сложный берег"},
	{name: "Батумский залив", caption: "береговая форма"},
	{name: "Анатолийский склон", caption: "глубоководный градиент"},
}

// WriteFigureFiveSVG создаёт самодостаточный SVG в макете архивного рисунка 5.
// Вложенные карточки не перерисовываются: их исходные байты входят в файл.
func WriteFigureFiveSVG(path string, config FigureFiveSVGConfig) error {
	algorithmNames := map[string]string{
		"delaunay":       "Delaunay",
		"frontal-quad":   "Frontal-Delaunay for Quads",
		"parallelograms": "Parallelograms",
	}
	algorithmName, known := algorithmNames[config.Algorithm]
	if !known || math.IsNaN(config.MinimumSizeM) || math.IsNaN(config.MaximumSizeM) ||
		math.IsInf(config.MinimumSizeM, 0) || math.IsInf(config.MaximumSizeM, 0) ||
		config.MinimumSizeM <= 0 || config.MaximumSizeM <= config.MinimumSizeM {
		return fmt.Errorf("рисунок 5 требует известный генератор и корректный диапазон размера ячеек")
	}
	for index, cardPath := range config.CardPaths {
		info, err := os.Stat(cardPath)
		if err != nil {
			return fmt.Errorf("карточка %d рисунка 5: %w", index+1, err)
		}
		if !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > maxFigureFiveCardBytes {
			return fmt.Errorf("карточка %d рисунка 5 должна быть обычным SVG до 32 МиБ", index+1)
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("создание каталога рисунка 5: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".figure-five-*.svg")
	if err != nil {
		return fmt.Errorf("временный файл рисунка 5: %w", err)
	}
	defer func() { _ = file.Close(); _ = os.Remove(file.Name()) }()
	writer := bufio.NewWriter(file)
	write := func(value string) error {
		_, err := writer.WriteString(value)
		return err
	}
	if err := write(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1800" height="760" viewBox="0 0 1800 760" role="img" aria-labelledby="figure-five-title figure-five-desc">` + "\n" +
		`<title id="figure-five-title">Фактические фрагменты адаптивной сетки</title>` + "\n" +
		`<desc id="figure-five-desc">Три карточки одной фактической сетки: Кызылырмакская коса, Батумский залив и Анатолийский склон.</desc>` + "\n" +
		`<rect width="1800" height="760" fill="#f8fbfc"/>` + "\n" +
		`<text x="44" y="52" font-family="Inter,Arial,sans-serif" font-size="31" font-weight="700" fill="#13283f">Фактические фрагменты адаптивной сетки</text>` + "\n" +
		fmt.Sprintf(`<text x="44" y="82" font-family="Inter,Arial,sans-serif" font-size="18" fill="#476074">%s · диапазон %g–%g м · изобаты и исходный берег поверх реальных ячеек</text>`+"\n", html.EscapeString(algorithmName), config.MinimumSizeM, config.MaximumSizeM)); err != nil {
		return fmt.Errorf("заголовок рисунка 5: %w", err)
	}
	for index, panel := range figureFivePanels {
		x := 28 + index*590
		if err := write(fmt.Sprintf(`<rect x="%d" y="112" width="564" height="614" rx="14" fill="#ffffff" stroke="#d7e2e8"/>`+"\n"+
			`<text x="%d" y="148" font-family="Inter,Arial,sans-serif" font-size="23" font-weight="700" fill="#13283f">%s</text>`+"\n"+
			`<text x="%d" y="174" font-family="Inter,Arial,sans-serif" font-size="16" fill="#476074">%s</text>`+"\n"+
			`<image x="%d" y="194" width="544" height="516" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/svg+xml;base64,`,
			x, x+18, html.EscapeString(panel.name), x+18, html.EscapeString(panel.caption), x+10)); err != nil {
			return fmt.Errorf("панель %d рисунка 5: %w", index+1, err)
		}
		input, err := os.Open(config.CardPaths[index])
		if err != nil {
			return fmt.Errorf("чтение карточки %d рисунка 5: %w", index+1, err)
		}
		encoded := base64.NewEncoder(base64.StdEncoding, writer)
		copied, copyErr := io.Copy(encoded, io.LimitReader(input, maxFigureFiveCardBytes+1))
		encodeErr := encoded.Close()
		closeErr := input.Close()
		if copyErr != nil || encodeErr != nil || closeErr != nil || copied > maxFigureFiveCardBytes {
			return fmt.Errorf("кодирование карточки %d рисунка 5: copy=%v, encode=%v, close=%v, bytes=%d", index+1, copyErr, encodeErr, closeErr, copied)
		}
		if err := write(`"/>` + "\n"); err != nil {
			return fmt.Errorf("завершение панели %d рисунка 5: %w", index+1, err)
		}
	}
	if err := write("</svg>\n"); err != nil {
		return fmt.Errorf("завершение рисунка 5: %w", err)
	}
	if err := writer.Flush(); err != nil {
		return fmt.Errorf("сохранение рисунка 5: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("закрытие рисунка 5: %w", err)
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return fmt.Errorf("публикация рисунка 5: %w", err)
	}
	return nil
}
