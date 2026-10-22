package cobra

import (
	"os"
	"strings"
	"testing"

	"coastal-geometry/internal/domain/geometry"
	spfcobra "github.com/spf13/cobra"
)

func TestCERCRequiresEachExplicitInput(t *testing.T) {
	for mask := 0; mask < 8; mask++ {
		values := [3]string{}
		for index := range values {
			if mask&(1<<index) != 0 {
				values[index] = "selected-file"
			}
		}
		err := validateCERCInputs(values[0], "", values[1], values[2])
		if mask == 7 {
			if err != nil {
				t.Fatalf("полный набор отклонён: %v", err)
			}
			continue
		}
		if err == nil {
			t.Fatalf("неполный набор %03b принят", mask)
		}
		for index, flag := range []string{"--input", "--bathymetry", "--wave-input"} {
			if values[index] == "" && !strings.Contains(err.Error(), flag) {
				t.Errorf("для набора %03b не указано отсутствующее поле %s: %v", mask, flag, err)
			}
		}
	}
	if err := validateCERCInputs("", "https://example.test/coast.geojson", "grid.json", "waves.csv"); err != nil {
		t.Fatalf("явно выбранный источник отклонён: %v", err)
	}
	if err := validateCERCInputs("coast.json", "https://example.test/coast.json", "grid.json", "waves.csv"); err == nil {
		t.Fatal("неоднозначный источник не должен приниматься")
	}
	if err := validateCERCInputs(" ", "\t", "grid.json", "waves.csv"); err == nil {
		t.Fatal("пустые значения не должны подменять выбор контура")
	}
}

func TestCERCEmptyLaunchDoesNotPrepareDemo(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, run := range []func(*spfcobra.Command, []string) error{runErosion, runAll} {
		err := run(nil, nil)
		if err == nil || !strings.Contains(err.Error(), "демонстрационный сценарий удалён") {
			t.Fatalf("требуется отказ без подстановки данных: %v", err)
		}
	}
	entries, err := os.ReadDir(".")
	if err != nil || len(entries) != 0 {
		t.Fatalf("пустой запуск не должен создавать кэш или артефакты: %v, %v", entries, err)
	}
}

func TestCERCDemoFlagsAreRemoved(t *testing.T) {
	for _, command := range []*spfcobra.Command{erosionCmd, allCmd} {
		for _, flag := range []string{"black-sea-sochi", "offline"} {
			if command.Flags().Lookup(flag) != nil {
				t.Errorf("команда %s сохранила демо-флаг --%s", command.Name(), flag)
			}
			if err := command.Flags().Parse([]string{"--" + flag}); err == nil {
				t.Errorf("команда %s приняла удалённый демо-флаг --%s", command.Name(), flag)
			}
		}
	}
}

func TestClassifyLongshoreScenarioDoesNotPromoteUserData(t *testing.T) {
	classification := classifyLongshoreScenario()
	if classification.ScenarioStatus != geometry.ScenarioStatusUnclassified || len(classification.UsageLimitations) == 0 {
		t.Fatalf("явные входы не должны автоматически получать научную аттестацию: %#v", classification)
	}
}
