// Команда prepare-research-data закрепляет OSM-контуры и проверяет малые входы offline.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"time"

	"coastal-geometry/internal/domain/coastline"
	"coastal-geometry/internal/domain/methods"
)

type region struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Queue         int        `json:"queue"`
	SearchPoint   [2]float64 `json:"searchPoint"`
	WindowDegrees [2]float64 `json:"windowDegrees,omitempty"`
	WindowReason  string     `json:"windowReason,omitempty"`
}
type configuration struct {
	SchemaVersion      int        `json:"schemaVersion"`
	SeedEvidenceFile   string     `json:"seedEvidenceFile"`
	SeedEvidenceSHA256 string     `json:"seedEvidenceSha256"`
	WindowDegrees      [2]float64 `json:"windowDegrees"`
	Regions            []region   `json:"regions"`
}

const endpoint = "https://overpass-api.de/api/interpreter"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Подготовка не завершена:", err)
		os.Exit(1)
	}
}

func run() error {
	configPath := flag.String("regions", "../../packages/generated-data/research/regions.json", "реестр районов")
	output := flag.String("output", "output/research-prepared", "каталог небольших закреплённых данных")
	cache := flag.String("cache", "output/research-source-cache", "каталог исходных HTTP-ответов вне Git")
	reports := flag.String("reports", "output/research-verification", "каталог расчётных отчётов вне Git")
	cli := flag.String("cli", "", "собранный lito для сквозной проверки dimension")
	fetch := flag.Bool("fetch", false, "явно разрешить получение отсутствующих снимков OSM")
	only := flag.String("only", "", "подготовить один ID для диагностики")
	flag.Parse()
	if *cli == "" {
		return fmt.Errorf("укажите --cli с собранным бинарником lito")
	}
	cliPath, err := filepath.Abs(*cli)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	data, err := os.ReadFile(*configPath)
	if err != nil {
		return err
	}
	var config configuration
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	evidence, err := os.ReadFile(filepath.Join(filepath.Dir(*configPath), config.SeedEvidenceFile))
	if err != nil {
		return err
	}
	if digest(evidence) != config.SeedEvidenceSHA256 {
		return fmt.Errorf("checksum исходного протокола поисковых точек изменился")
	}
	var seeds struct {
		Probes []struct {
			ID    string     `json:"regionId"`
			Queue int        `json:"queue"`
			Point [2]float64 `json:"searchPoint"`
		} `json:"probes"`
	}
	if err := json.Unmarshal(evidence, &seeds); err != nil {
		return err
	}
	seedPoints := map[string][2]float64{}
	seedQueues := map[string]int{}
	for _, seed := range seeds.Probes {
		seedPoints[seed.ID] = seed.Point
		seedQueues[seed.ID] = seed.Queue
	}
	if len(seedPoints) != 24 {
		return fmt.Errorf("в исходном протоколе ожидаются 24 поисковые точки")
	}
	if config.SchemaVersion != 1 || len(config.Regions) != 24 || config.WindowDegrees[0] <= 0 || config.WindowDegrees[1] <= 0 {
		return fmt.Errorf("ожидается реестр v1 из 24 районов с положительным поисковым окном")
	}
	seen := map[string]bool{}
	queues := map[int]int{}
	idPattern := regexp.MustCompile(`^[a-z][a-z0-9-]{1,63}$`)
	for _, area := range config.Regions {
		if !idPattern.MatchString(area.ID) || seen[area.ID] || area.Name == "" || (area.Queue != 1 && area.Queue != 2) {
			return fmt.Errorf("неверный или повторный ID/очередь района")
		}
		if point, ok := seedPoints[area.ID]; !ok || point != area.SearchPoint || seedQueues[area.ID] != area.Queue {
			return fmt.Errorf("%s: район или поисковая точка не соответствует исходному протоколу", area.ID)
		}
		seen[area.ID] = true
		queues[area.Queue]++
	}
	if queues[1] != 8 || queues[2] != 16 {
		return fmt.Errorf("ожидаются очереди 8/16 районов")
	}
	if err := os.MkdirAll(filepath.Join(*output, "sources"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(*cache, 0755); err != nil {
		return err
	}
	completed := 0
	for _, area := range config.Regions {
		if *only != "" && area.ID != *only {
			continue
		}
		window := config.WindowDegrees
		if area.WindowDegrees != [2]float64{} {
			if area.WindowDegrees[0] <= 0 || area.WindowDegrees[1] <= 0 || area.WindowReason == "" {
				return fmt.Errorf("%s: изменение окна требует положительного размера и причины", area.ID)
			}
			window = area.WindowDegrees
		}
		bounds := coastline.GeoBounds{MinLon: area.SearchPoint[0] - window[0]/2,
			MaxLon: area.SearchPoint[0] + window[0]/2, MinLat: area.SearchPoint[1] - window[1]/2,
			MaxLat: area.SearchPoint[1] + window[1]/2}
		if err := coastline.ValidateRegionBounds(bounds); err != nil {
			return fmt.Errorf("%s: %w", area.ID, err)
		}
		query := fmt.Sprintf("[out:json][timeout:25][maxsize:67108864];way[\"natural\"=\"coastline\"](%.6f,%.6f,%.6f,%.6f);out meta geom;", bounds.MinLat, bounds.MinLon, bounds.MaxLat, bounds.MaxLon)
		sourceName := area.ID
		if window != config.WindowDegrees {
			sourceName += "-" + digest([]byte(query))[:12]
		}
		snapshotFile := "sources/" + sourceName + ".json"
		snapshotPath := filepath.Join(*output, filepath.FromSlash(snapshotFile))
		snapshot, snapshotData, err := loadSnapshot(ctx, snapshotPath, filepath.Join(*cache, sourceName+".json"), query, *fetch)
		if err != nil {
			return fmt.Errorf("%s: %w", area.ID, err)
		}
		candidate, err := coastline.PrepareResearchSegment(ctx, snapshot, bounds)
		if err != nil {
			return fmt.Errorf("%s: %w", area.ID, err)
		}
		path := filepath.Join(*output, area.ID+".geojson")
		if len(candidate.Geometry) > 65536 {
			return fmt.Errorf("%s: геометрия превышает 64 КиБ", area.ID)
		}
		if err := os.WriteFile(path, candidate.Geometry, 0644); err != nil {
			return err
		}
		check, err := coastline.CheckSourceGeometryBytes(ctx, candidate.Geometry)
		if err != nil {
			return err
		}
		jobOutput, err := filepath.Abs(filepath.Join(*reports, area.ID))
		if err != nil {
			return err
		}
		inputPath, err := filepath.Abs(path)
		if err != nil {
			return err
		}
		command := exec.CommandContext(ctx, cliPath, "dimension", "--input", inputPath, "--output", jobOutput, "--manifest", filepath.Join(jobOutput, "manifest.json"))
		log, err := command.CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s: CLI dimension: %w: %s", area.ID, err, log)
		}
		metrics, err := os.ReadFile(filepath.Join(jobOutput, "metrics", "dimension.metrics.json"))
		if err != nil {
			return err
		}
		manifest, err := os.ReadFile(filepath.Join(jobOutput, "manifest.json"))
		if err != nil {
			return err
		}
		var result struct {
			Reference struct {
				Points int `json:"points_count"`
			} `json:"reference_coastline"`
			Validation struct {
				Fixes []string `json:"fixes"`
			} `json:"validation"`
			Iterations []struct {
				Dimension struct {
					Valid bool    `json:"valid"`
					Value float64 `json:"dimension"`
				} `json:"dimension"`
			} `json:"iterations"`
		}
		if err := json.Unmarshal(metrics, &result); err != nil {
			return err
		}
		var execution struct {
			Command string           `json:"command"`
			Method  methods.Identity `json:"method"`
		}
		if err := json.Unmarshal(manifest, &execution); err != nil {
			return err
		}
		if result.Reference.Points != candidate.PointCount || len(result.Validation.Fixes) > 0 || len(result.Iterations) != 1 ||
			!result.Iterations[0].Dimension.Valid || result.Iterations[0].Dimension.Value != candidate.Dimension ||
			execution.Command != "lito dimension" || execution.Method != methods.BoxCounting() {
			return fmt.Errorf("%s: отчёт CLI не подтверждает расчёт неизменённого выбранного контура", area.ID)
		}
		passport := map[string]any{
			"schemaVersion": "litora-research-coastline/v1", "regionId": area.ID, "queue": area.Queue, "name": area.Name,
			"purpose": "Исследование геометрии картографического берега и масштабной зависимости box-counting в выбранном подокне района",
			"crs":     "EPSG:4326", "coordinateUnit": "degrees", "roi": map[string]float64{"west": bounds.MinLon, "east": bounds.MaxLon, "south": bounds.MinLat, "north": bounds.MaxLat},
			"source": map[string]any{"provider": "© OpenStreetMap contributors", "license": "ODbL-1.0", "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
				"attributionUrl": "https://www.openstreetmap.org/copyright", "sourceUrl": fmt.Sprintf("https://www.openstreetmap.org/way/%d", candidate.SourceWayID),
				"snapshotFile": snapshotFile, "snapshotSha256": digest(snapshotData), "responseSha256": snapshot.ResponseSHA256,
				"osmBaseTime": snapshot.OSMBaseTime, "retrievedAt": snapshot.RetrievedAt, "seedEvidenceSha256": config.SeedEvidenceSHA256},
			"preparation": map[string]any{"methodId": methods.ResearchCoastlinePreparation().ID, "methodRevision": methods.ResearchCoastlinePreparation().Revision,
				"roiRule": fmt.Sprintf("Окно %.2f° долготы × %.2f° широты вокруг поисковой точки протокола 0063", window[0], window[1]), "roiAdjustmentReason": area.WindowReason,
				"selectionRule":  "Самый длинный пригодный фрагмент: минимум 8 точек и 200 м, максимум 500 точек; порядок OSM сохранён",
				"fallbackRule":   "Если ни один основной фрагмент не принят, рассматриваются непрерывные половины и их подчасти до 8 точек; выбирается самый длинный пригодный подучасток",
				"clipping":       "Отсечение каждого исходного пути рамкой в Go; пересечения рамки интерполируются существующим SelectRegion",
				"simplification": "Не применяется", "joining": "Разные ways и разрывы не соединяются", "candidate": candidate},
			"file":       map[string]any{"path": area.ID + ".geojson", "sha256": digest(candidate.Geometry), "canonicalGeometrySha256": digest(bytes.TrimSpace(candidate.Geometry)), "sizeBytes": len(candidate.Geometry), "pointCount": candidate.PointCount},
			"validation": check, "calculation": map[string]any{"kind": "dimension_dataset", "cliCommand": "lito dimension",
				"exitCode": 0, "method": execution.Method, "normalizedGeometryUnchanged": true},
			"accuracy": map[string]any{"status": "not_independently_validated", "horizontalRmseM": nil, "controlSource": nil, "measurementTime": nil, "shorelineProxy": "OSM natural=coastline"},
			"limitations": []string{"Это картографический контур; время правки OSM не является временем береговой съёмки.",
				"Независимый контроль и RMSE отсутствуют; исследовательская точность положения не подтверждена.",
				"Один срез не даёт временного ряда, скорости эрозии или прогноза до года.",
				"Выбран один фрагмент, а не весь названный район; возможны искусственные берега и сооружения.",
				"Устойчивость оценки по масштабам приводится отдельно; успешное выполнение не аттестует фрактальность природного берега."},
		}
		if err := saveJSON(filepath.Join(*output, area.ID+".metadata.json"), passport); err != nil {
			return err
		}
		completed++
		fmt.Printf("%s: очередь %d, way %d, %d точек, %.3f км, D=%.6f, устойчивость=%t\n", area.ID, area.Queue, candidate.SourceWayID, candidate.PointCount, candidate.LengthKM, candidate.Dimension, candidate.StableAcrossScales)
	}
	if completed == 0 {
		return fmt.Errorf("не выбран ни один район")
	}
	fmt.Printf("Подготовлено и проверено районов: %d\n", completed)
	return nil
}

func digest(data []byte) string { return fmt.Sprintf("%x", sha256.Sum256(data)) }

func saveJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0644)
}

func loadSnapshot(ctx context.Context, path, cache, query string, fetch bool) (coastline.ResearchSnapshot, []byte, error) {
	if data, err := os.ReadFile(path); err == nil {
		var snapshot coastline.ResearchSnapshot
		if err := json.Unmarshal(data, &snapshot); err != nil {
			return snapshot, nil, err
		}
		if snapshot.Query != query || snapshot.Endpoint != endpoint {
			return snapshot, nil, fmt.Errorf("закреплённый снимок не соответствует текущему запросу; обновление требует отдельного решения")
		}
		return snapshot, data, nil
	} else if !os.IsNotExist(err) {
		return coastline.ResearchSnapshot{}, nil, err
	}
	if !fetch {
		return coastline.ResearchSnapshot{}, nil, fmt.Errorf("снимок отсутствует; сеть включается только явным --fetch")
	}
	data, err := fetchOSM(ctx, query)
	if err != nil {
		return coastline.ResearchSnapshot{}, nil, err
	}
	baseTime, ways, err := coastline.DecodeResearchWays(data)
	if err != nil {
		return coastline.ResearchSnapshot{}, nil, err
	}
	if err := os.WriteFile(cache, data, 0600); err != nil {
		return coastline.ResearchSnapshot{}, nil, err
	}
	snapshot := coastline.ResearchSnapshot{SchemaVersion: 1, Query: query, Endpoint: endpoint, RetrievedAt: time.Now().UTC().Format(time.RFC3339), OSMBaseTime: baseTime, ResponseSHA256: digest(data), Ways: ways}
	// Проекция полей убирает автора/uid, сохраняя все ways, ID узлов и координаты.
	data, err = json.Marshal(snapshot)
	if err != nil {
		return snapshot, nil, err
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0644); err != nil {
		return snapshot, nil, err
	}
	return snapshot, data, nil
}

func fetchOSM(ctx context.Context, query string) ([]byte, error) {
	client := http.Client{Timeout: 45 * time.Second}
	for attempt := 0; attempt < 3; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?data="+url.QueryEscape(query), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("User-Agent", "LitoraResearchPreparation/1.0 (bounded coastline snapshot)")
		response, err := client.Do(request)
		if err == nil {
			data, readErr := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
			response.Body.Close()
			if readErr != nil {
				return nil, readErr
			}
			if response.StatusCode == http.StatusOK {
				return data, nil
			}
			if response.StatusCode < 500 && response.StatusCode != http.StatusTooManyRequests {
				return nil, fmt.Errorf("OSM HTTP %d", response.StatusCode)
			}
			err = fmt.Errorf("OSM HTTP %d", response.StatusCode)
		}
		if attempt == 2 {
			return nil, fmt.Errorf("%w; готовые снимки сохранены, повторите позже", err)
		}
		fmt.Fprintf(os.Stderr, "OSM временно недоступен (%v); ограниченный повтор %d/2\n", err, attempt+1)
		timer := time.NewTimer(time.Duration(attempt+1) * 5 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	return nil, fmt.Errorf("не удалось получить OSM")
}
