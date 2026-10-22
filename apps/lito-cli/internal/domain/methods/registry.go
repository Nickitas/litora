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

// ResearchCoastlinePreparation — выбор картографического фрагмента без нормализации.
func ResearchCoastlinePreparation() Identity {
	return Identity{ID: "research-coastline-preparation", Revision: "source-1"}
}

// CoastlineValidation — проверка исходных координат без нормализации и переупорядочивания.
func CoastlineValidation() Identity {
	return Identity{ID: "coastline-validation", Revision: "geometry-1"}
}

// BoxCounting — текущая ревизия оценки фрактальной размерности и её отчётов.
func BoxCounting() Identity {
	return Identity{ID: "box-counting", Revision: "reports-3"}
}

// OverviewMap — текущая ревизия построения обзорной карты.
func OverviewMap() Identity {
	return Identity{ID: "black-sea-overview", Revision: "scientific-map-3"}
}

// LongshoreCERC — текущая ревизия одномерной модели CERC и её отчётов.
func LongshoreCERC() Identity {
	return Identity{ID: "cerc-one-line", Revision: "reports-2"}
}
