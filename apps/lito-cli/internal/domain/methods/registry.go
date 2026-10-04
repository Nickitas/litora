// Package methods хранит ревизии вычислительных методов, публикуемые в результатах CLI.
package methods

// Identity задаёт стабильный идентификатор метода и его ревизию.
// Ревизия описывает реализацию, но не является научной аттестацией метода.
type Identity struct {
	ID       string `json:"id"`
	Revision string `json:"revision"`
}

// BoxCounting — текущая базовая ревизия оценки фрактальной размерности.
func BoxCounting() Identity {
	return Identity{ID: "box-counting", Revision: "baseline-1"}
}

// OverviewMap — текущая базовая ревизия построения обзорной карты.
func OverviewMap() Identity {
	return Identity{ID: "black-sea-overview", Revision: "baseline-1"}
}

// LongshoreCERC — текущая базовая ревизия одномерной модели CERC.
func LongshoreCERC() Identity {
	return Identity{ID: "cerc-one-line", Revision: "baseline-1"}
}
