package cobra

import "testing"

func TestParseAdaptiveComparisonLevels(t *testing.T) {
	levels, err := parseAdaptiveComparisonLevels("detailed:200:1000,coarse:500:1000")
	if err != nil {
		t.Fatal(err)
	}
	if len(levels) != 2 || levels[0].Name != "Подробная сетка" || levels[1].MinimumSizeM != 500 {
		t.Fatalf("контрольные уровни разобраны неверно: %+v", levels)
	}
	for _, invalid := range []string{"", "bad", "same:500:500", "x:200:1000,x:300:1000"} {
		if _, err := parseAdaptiveComparisonLevels(invalid); err == nil {
			t.Fatalf("ожидалась ошибка для %q", invalid)
		}
	}
}

func TestAdaptiveComparisonExpertSetFlagsAreOptIn(t *testing.T) {
	flags := seabedAdaptiveCompareCmd.Flags()
	if flag := flags.Lookup("expert-set"); flag == nil || flag.DefValue != "false" {
		t.Fatal("карточки AI-01 не должны создаваться по умолчанию")
	}
	if flag := flags.Lookup("expert-levels"); flag == nil || flag.DefValue != "" {
		t.Fatal("уровни AI-01 по умолчанию должны брать все уровни сравнения")
	}
	if flag := flags.Lookup("expert-seed"); flag == nil || flag.DefValue != "ai-01-black-sea-2026" {
		t.Fatal("строка анонимизации AI-01 должна совпадать с отдельной командой")
	}
}
