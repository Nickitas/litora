package cobra

import (
	"coastal-geometry/internal/formats"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestPublishedInputFormatsMatchGoTypes(t *testing.T) {
	generated, err := json.Marshal(formats.Catalog(meshComparisonReport{}))
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(filepath.Join("..", "..", "..", "data", "schemas", "scientific-inputs-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got, want any
	if err = json.Unmarshal(stored, &got); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(generated, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("закреплённые схемы не соответствуют Go-типам; обновите lito input-formats")
	}
	roles := map[string]bool{}
	for _, format := range formats.Catalog(meshComparisonReport{}) {
		if roles[format.Role] || format.SchemaVersion != 1 || format.MaxBytes < 1 {
			t.Fatalf("неверный формат: %+v", format)
		}
		roles[format.Role] = true
	}
	if len(roles) != 19 {
		t.Fatalf("ожидалось 19 научных ролей, получено %d", len(roles))
	}
}
