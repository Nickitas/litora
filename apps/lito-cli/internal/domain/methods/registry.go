// Package methods хранит ревизии вычислительных методов, публикуемые в результатах CLI.
package methods

// Identity задаёт стабильный идентификатор метода и его ревизию.
// Ревизия описывает реализацию, но не является научной аттестацией метода.
type Identity struct {
	ID       string `json:"id"`
	Revision string `json:"revision"`
}

// CoastlineRegion — текущая ревизия отсечения отдельных береговых линий рамкой WGS84.
func CoastlineRegion() Identity {
	return Identity{ID: "coastline-region", Revision: "clip-1"}
}

// BoxCounting — текущая ревизия оценки фрактальной размерности и её отчётов.
func BoxCounting() Identity {
	return Identity{ID: "box-counting", Revision: "reports-2"}
}

// OverviewMap — текущая ревизия построения обзорной карты.
func OverviewMap() Identity {
	return Identity{ID: "black-sea-overview", Revision: "scientific-map-3"}
}

// LongshoreCERC — текущая ревизия одномерной модели CERC и её отчётов.
func LongshoreCERC() Identity {
	return Identity{ID: "cerc-one-line", Revision: "reports-2"}
}
