package coastline

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// DefaultBlackSeaCoastlinePath указывает на закреплённый полный контур MarineRegions.
const DefaultBlackSeaCoastlinePath = "data/coastline/black-sea.geojson"

// DefaultBlackSeaMetadataPath указывает на паспорт закреплённого контура.
const DefaultBlackSeaMetadataPath = "data/coastline/black-sea.metadata.json"

func validateBundledBlackSea(path string, payload []byte) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	bundled, err := filepath.Abs(DefaultBlackSeaCoastlinePath)
	if err != nil || absolute != bundled {
		return err
	}
	data, err := os.ReadFile(DefaultBlackSeaMetadataPath)
	if err != nil {
		return fmt.Errorf("паспорт полного контура Чёрного моря: %w", err)
	}
	var metadata struct {
		SchemaVersion  int    `json:"schemaVersion"`
		Source         string `json:"source"`
		License        string `json:"license"`
		CRS            string `json:"crs"`
		CoordinateUnit string `json:"coordinateUnit"`
		SHA256         string `json:"sha256"`
		SizeBytes      int    `json:"sizeBytes"`
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		return fmt.Errorf("чтение паспорта полного контура: %w", err)
	}
	digest := sha256.Sum256(payload)
	if metadata.SchemaVersion != 1 || metadata.Source == "" || metadata.License == "" ||
		metadata.CRS != "EPSG:4326" || metadata.CoordinateUnit != "degree" ||
		metadata.SizeBytes != len(payload) || metadata.SHA256 != hex.EncodeToString(digest[:]) {
		return fmt.Errorf("полный контур Чёрного моря не совпадает с паспортом источника")
	}
	return nil
}
