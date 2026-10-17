package shorelinehistory

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

const maxObservationBytes = 16 << 20

// Начальная рамка поиска данных для пилота Сочи, EPSG:4326: запад, юг, восток, север.
var sochiPilotBounds = [4]float64{39.6679270, 43.5854760, 39.7129247, 43.6442458}

var wgs84Name = regexp.MustCompile(`(?i)(?:EPSG:|EPSG::)4326$`)

// Observation описывает дату и качество одного измеренного контура.
type Observation struct {
	Time              time.Time
	Satellite         string
	GeoAccuracy       *float64
	UncertaintyM      *float64
	TideCorrected     *bool
	PilotIntersection *bool
}

// WaveInterval описывает датированный интервал волнового воздействия.
type WaveInterval struct {
	Start         time.Time
	DurationHours float64
}

// YearCount показывает число наблюдений в календарном году UTC.
type YearCount struct {
	Year  int `json:"year"`
	Count int `json:"count"`
}

// WaveAudit фиксирует фактическое покрытие волн в интервале наблюдений.
type WaveAudit struct {
	Source                  string     `json:"source"`
	ConditionCount          int        `json:"conditionCount"`
	TotalDurationHours      float64    `json:"totalDurationHours"`
	FirstTime               *time.Time `json:"firstTime"`
	LastTime                *time.Time `json:"lastTime"`
	CoveredObservationHours *float64   `json:"coveredObservationHours"`
	MissingObservationHours *float64   `json:"missingObservationHours"`
}

// TemporalSplit фиксирует хронологическое разделение без обучения модели.
type TemporalSplit struct {
	ValidationStart     time.Time `json:"validationStart"`
	TrainingCount       int       `json:"trainingCount"`
	ValidationCount     int       `json:"validationCount"`
	TrainingFirstTime   time.Time `json:"trainingFirstTime"`
	TrainingLastTime    time.Time `json:"trainingLastTime"`
	ValidationFirstTime time.Time `json:"validationFirstTime"`
	ValidationLastTime  time.Time `json:"validationLastTime"`
	BoundaryGapDays     float64   `json:"boundaryGapDays"`
}

// PilotCoverage описывает только пересечение геометрии с начальной рамкой пилота.
type PilotCoverage struct {
	Bounds               [4]float64  `json:"bounds"`
	Reference            string      `json:"reference"`
	ReferenceSHA256      string      `json:"referenceSha256"`
	IntersectingCount    int         `json:"intersectingCount"`
	OutsideCount         int         `json:"outsideCount"`
	UnknownGeometryCount int         `json:"unknownGeometryCount"`
	Years                []YearCount `json:"years"`
}

// Audit описывает проверяемые свойства входных рядов без вывода о точности прогноза.
type Audit struct {
	SchemaVersion             int            `json:"schemaVersion"`
	ObservationCount          int            `json:"observationCount"`
	FirstObservation          time.Time      `json:"firstObservation"`
	LastObservation           time.Time      `json:"lastObservation"`
	Years                     []YearCount    `json:"years"`
	LongestObservationGapDays float64        `json:"longestObservationGapDays"`
	MissingGeoAccuracyCount   int            `json:"missingGeoAccuracyCount"`
	MissingUncertaintyCount   int            `json:"missingUncertaintyCount"`
	UncorrectedTideCount      int            `json:"uncorrectedTideCount"`
	UnknownTideStatusCount    int            `json:"unknownTideStatusCount"`
	Waves                     *WaveAudit     `json:"waves"`
	TemporalSplit             *TemporalSplit `json:"temporalSplit,omitempty"`
	PilotCoverage             PilotCoverage  `json:"pilotCoverage"`
	Limitations               []string       `json:"limitations"`
}

type featureCollection struct {
	Type string `json:"type"`
	CRS  *struct {
		Properties struct {
			Name string `json:"name"`
		} `json:"properties"`
	} `json:"crs"`
	Features []struct {
		Type     string `json:"type"`
		Geometry struct {
			Type        string      `json:"type"`
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
		Properties struct {
			Date          string   `json:"date"`
			Satellite     string   `json:"satname"`
			GeoAccuracy   *float64 `json:"geoaccuracy"`
			UncertaintyM  *float64 `json:"uncertainty_m"`
			TideCorrected *bool    `json:"tide_corrected"`
		} `json:"properties"`
	} `json:"features"`
}

// LoadObservations читает локальный GeoJSON датированных контуров в EPSG:4326.
// Лимиты соответствуют загрузке ряда через API; новые научные показатели не
// выводятся из географических градусов.
func LoadObservations(path string) ([]Observation, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("открытие наблюдений: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxObservationBytes+1))
	if err != nil {
		return nil, fmt.Errorf("чтение наблюдений: %w", err)
	}
	if len(data) > maxObservationBytes {
		return nil, fmt.Errorf("GeoJSON наблюдений превышает 16 МиБ")
	}
	var collection featureCollection
	if err := json.Unmarshal(data, &collection); err != nil {
		return nil, fmt.Errorf("GeoJSON наблюдений: %w", err)
	}
	if collection.Type != "FeatureCollection" || len(collection.Features) < 2 || len(collection.Features) > 2500 {
		return nil, fmt.Errorf("GeoJSON наблюдений должен содержать от 2 до 2500 Feature")
	}
	if collection.CRS != nil && !wgs84Name.MatchString(collection.CRS.Properties.Name) {
		return nil, fmt.Errorf("GeoJSON наблюдений должен быть в EPSG:4326")
	}
	observations := make([]Observation, 0, len(collection.Features))
	coordinateCount := 0
	for index, feature := range collection.Features {
		if feature.Type != "Feature" || feature.Geometry.Type != "LineString" || len(feature.Geometry.Coordinates) < 2 {
			return nil, fmt.Errorf("контур %d: ожидается LineString из двух или более точек", index+1)
		}
		coordinateCount += len(feature.Geometry.Coordinates)
		if coordinateCount > 120_000 {
			return nil, fmt.Errorf("GeoJSON наблюдений содержит слишком много координат")
		}
		for _, point := range feature.Geometry.Coordinates {
			if len(point) < 2 || !finiteInRange(point[0], -180, 180) || !finiteInRange(point[1], -90, 90) {
				return nil, fmt.Errorf("контур %d: координаты должны быть [долгота, широта] в EPSG:4326", index+1)
			}
		}
		when, err := parseObservationTime(feature.Properties.Date)
		if err != nil {
			return nil, fmt.Errorf("контур %d: %w", index+1, err)
		}
		if strings.TrimSpace(feature.Properties.Satellite) == "" {
			return nil, fmt.Errorf("контур %d: не указан satname", index+1)
		}
		if feature.Properties.GeoAccuracy != nil && !finiteInRange(*feature.Properties.GeoAccuracy, 0, math.MaxFloat64) {
			return nil, fmt.Errorf("контур %d: некорректная geoaccuracy", index+1)
		}
		if feature.Properties.UncertaintyM != nil && !finiteInRange(*feature.Properties.UncertaintyM, math.SmallestNonzeroFloat64, math.MaxFloat64) {
			return nil, fmt.Errorf("контур %d: некорректная uncertainty_m", index+1)
		}
		observations = append(observations, Observation{
			Time: when, Satellite: feature.Properties.Satellite,
			GeoAccuracy:       feature.Properties.GeoAccuracy,
			UncertaintyM:      feature.Properties.UncertaintyM,
			TideCorrected:     feature.Properties.TideCorrected,
			PilotIntersection: boolPointer(lineIntersectsBounds(feature.Geometry.Coordinates, sochiPilotBounds)),
		})
	}
	sort.Slice(observations, func(i, j int) bool { return observations[i].Time.Before(observations[j].Time) })
	for i := 1; i < len(observations); i++ {
		if observations[i].Time.Equal(observations[i-1].Time) {
			return nil, fmt.Errorf("даты контуров должны быть уникальными")
		}
	}
	return observations, nil
}

func boolPointer(value bool) *bool { return &value }

// lineIntersectsBounds считает касание границы пересечением.
func lineIntersectsBounds(points [][]float64, bounds [4]float64) bool {
	inside := func(point []float64) bool {
		return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3]
	}
	for index, point := range points {
		if inside(point) {
			return true
		}
		if index == 0 {
			continue
		}
		previous := points[index-1]
		dx, dy := point[0]-previous[0], point[1]-previous[1]
		low, high := 0.0, 1.0
		for _, edge := range [4][2]float64{{-dx, previous[0] - bounds[0]}, {dx, bounds[2] - previous[0]}, {-dy, previous[1] - bounds[1]}, {dy, bounds[3] - previous[1]}} {
			p, q := edge[0], edge[1]
			if p == 0 {
				if q < 0 {
					low, high = 1, 0
					break
				}
				continue
			}
			ratio := q / p
			if p < 0 {
				low = math.Max(low, ratio)
			} else {
				high = math.Min(high, ratio)
			}
			if low > high {
				break
			}
		}
		if low <= high {
			return true
		}
	}
	return false
}

func finiteInRange(value, minimum, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= minimum && value <= maximum
}

func parseObservationTime(value string) (time.Time, error) {
	if when, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return when.UTC(), nil
	}
	when, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || !strings.HasSuffix(value, "Z") {
		return time.Time{}, fmt.Errorf("дата должна быть в UTC (ISO 8601 или формат CoastSat)")
	}
	return when.UTC(), nil
}

// Analyze описывает покрытие наблюдений и волн; не рассчитывает прогноз.
func Analyze(observations []Observation, waveSource string, waves []WaveInterval) (Audit, error) {
	return AnalyzeWithTemporalSplit(observations, waveSource, waves, nil)
}

// AnalyzeWithTemporalSplit добавляет независимую позднюю часть ряда по дате UTC.
// Разделение не доказывает пригодность данных и не выполняет прогноз.
func AnalyzeWithTemporalSplit(observations []Observation, waveSource string, waves []WaveInterval, validationStart *time.Time) (Audit, error) {
	if len(observations) < 2 {
		return Audit{}, fmt.Errorf("для аудита нужны хотя бы два наблюдения")
	}
	ordered := append([]Observation(nil), observations...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Time.Before(ordered[j].Time) })
	report := Audit{
		SchemaVersion: 3, ObservationCount: len(ordered),
		FirstObservation: ordered[0].Time, LastObservation: ordered[len(ordered)-1].Time,
		Years: []YearCount{}, Limitations: []string{},
		PilotCoverage: PilotCoverage{
			Bounds: sochiPilotBounds, Reference: "OSM way 59530506, 2026-08-17",
			ReferenceSHA256: "5fc2e8625fc57021fb760cccc63cb6ff20848edd70e159453f34402faa99129a",
			Years:           []YearCount{},
		},
	}
	counts := map[int]int{}
	pilotCounts := map[int]int{}
	for index, observation := range ordered {
		if observation.Time.IsZero() {
			return Audit{}, fmt.Errorf("наблюдение %d не имеет даты", index+1)
		}
		if index > 0 {
			gap := observation.Time.Sub(ordered[index-1].Time).Hours() / 24
			if gap <= 0 {
				return Audit{}, fmt.Errorf("даты наблюдений должны быть уникальными")
			}
			report.LongestObservationGapDays = math.Max(report.LongestObservationGapDays, gap)
		}
		counts[observation.Time.UTC().Year()]++
		switch {
		case observation.PilotIntersection == nil:
			report.PilotCoverage.UnknownGeometryCount++
		case *observation.PilotIntersection:
			report.PilotCoverage.IntersectingCount++
			pilotCounts[observation.Time.UTC().Year()]++
		default:
			report.PilotCoverage.OutsideCount++
		}
		if observation.GeoAccuracy == nil {
			report.MissingGeoAccuracyCount++
		}
		if observation.UncertaintyM == nil {
			report.MissingUncertaintyCount++
		}
		if observation.TideCorrected == nil {
			report.UnknownTideStatusCount++
		} else if !*observation.TideCorrected {
			report.UncorrectedTideCount++
		}
	}
	for year := report.FirstObservation.UTC().Year(); year <= report.LastObservation.UTC().Year(); year++ {
		report.Years = append(report.Years, YearCount{Year: year, Count: counts[year]})
		report.PilotCoverage.Years = append(report.PilotCoverage.Years, YearCount{Year: year, Count: pilotCounts[year]})
	}
	if report.PilotCoverage.IntersectingCount == 0 {
		report.Limitations = append(report.Limitations, "Не подтверждено пересечение наблюдаемых контуров со стартовой рамкой пилота Сочи.")
	}
	if report.PilotCoverage.OutsideCount > 0 || report.PilotCoverage.UnknownGeometryCount > 0 {
		report.Limitations = append(report.Limitations, "Часть контуров вне рамки пилота Сочи или без проверенной геометрии; временное покрытие всего ряда не равно покрытию пилота.")
	}
	if validationStart != nil {
		if validationStart.Location() != time.UTC || validationStart.Hour() != 0 || validationStart.Minute() != 0 || validationStart.Second() != 0 || validationStart.Nanosecond() != 0 {
			return Audit{}, fmt.Errorf("дата начала проверки должна быть календарным днём UTC")
		}
		boundary := sort.Search(len(ordered), func(index int) bool {
			return !ordered[index].Time.Before(*validationStart)
		})
		if boundary == 0 || boundary == len(ordered) {
			return Audit{}, fmt.Errorf("дата начала проверки должна оставлять наблюдения и до неё, и после неё")
		}
		report.TemporalSplit = &TemporalSplit{
			ValidationStart: *validationStart,
			TrainingCount:   boundary, ValidationCount: len(ordered) - boundary,
			TrainingFirstTime: ordered[0].Time, TrainingLastTime: ordered[boundary-1].Time,
			ValidationFirstTime: ordered[boundary].Time, ValidationLastTime: ordered[len(ordered)-1].Time,
			BoundaryGapDays: ordered[boundary].Time.Sub(ordered[boundary-1].Time).Hours() / 24,
		}
		report.Limitations = append(report.Limitations, "Временное разделение не обучает модель и не измеряет ошибку прогноза; для этого нужен независимый ретроспективный расчёт.")
	}
	if report.MissingUncertaintyCount > 0 {
		report.Limitations = append(report.Limitations, "Для части контуров не указана uncertainty_m; её нельзя заменить geoaccuracy автоматически.")
	}
	if report.UnknownTideStatusCount > 0 || report.UncorrectedTideCount > 0 {
		report.Limitations = append(report.Limitations, "Поправка уровня воды не подтверждена для всех контуров; смещение линии может быть неморфологическим.")
	}
	report.Limitations = append(report.Limitations, "Поле tide_corrected декларируется источником; аудит не проверяет величину поправки и вертикальный датум.")
	if len(waves) == 0 {
		report.Limitations = append(report.Limitations, "Волновой ряд не предоставлен; воздействие за период наблюдений не проверено.")
	} else {
		waveReport, err := analyzeWaves(waveSource, waves, report.FirstObservation, report.LastObservation)
		if err != nil {
			return Audit{}, err
		}
		report.Waves = &waveReport
		if waveReport.FirstTime == nil {
			report.Limitations = append(report.Limitations, "Волновой ряд не имеет дат; его нельзя сопоставить с наблюдениями.")
		} else if waveReport.MissingObservationHours != nil && *waveReport.MissingObservationHours > 0 {
			report.Limitations = append(report.Limitations, "В волновом ряду есть пробелы относительно периода наблюдений.")
		}
	}
	report.Limitations = append(report.Limitations, "Аудит не проверяет батиметрию, профиль, наносы, сооружения, сопоставимость определения линии и точность прогноза.")
	return report, nil
}

func analyzeWaves(source string, waves []WaveInterval, start, end time.Time) (WaveAudit, error) {
	report := WaveAudit{Source: source, ConditionCount: len(waves)}
	allDated := true
	for index, wave := range waves {
		if !finiteInRange(wave.DurationHours, math.SmallestNonzeroFloat64, 744) {
			return WaveAudit{}, fmt.Errorf("состояние волн %d: некорректная длительность", index+1)
		}
		report.TotalDurationHours += wave.DurationHours
		if wave.Start.IsZero() {
			allDated = false
		}
	}
	if !allDated {
		return report, nil
	}
	first := waves[0].Start
	last := waves[len(waves)-1].Start.Add(time.Duration(waves[len(waves)-1].DurationHours * float64(time.Hour)))
	report.FirstTime, report.LastTime = &first, &last
	cursor := start
	coveredHours := 0.0
	for index, wave := range waves {
		waveEnd := wave.Start.Add(time.Duration(wave.DurationHours * float64(time.Hour)))
		if index > 0 && wave.Start.Before(waves[index-1].Start.Add(time.Duration(waves[index-1].DurationHours*float64(time.Hour)))) {
			return WaveAudit{}, fmt.Errorf("состояния волн перекрываются")
		}
		coveredStart := maxTime(wave.Start, start)
		coveredEnd := minTime(waveEnd, end)
		if coveredEnd.After(coveredStart) {
			if coveredStart.After(cursor) {
				cursor = coveredStart
			}
			if coveredEnd.After(cursor) {
				coveredHours += coveredEnd.Sub(cursor).Hours()
				cursor = coveredEnd
			}
		}
	}
	spanHours := end.Sub(start).Hours()
	missingHours := math.Max(0, spanHours-coveredHours)
	report.CoveredObservationHours = &coveredHours
	report.MissingObservationHours = &missingHours
	return report, nil
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
