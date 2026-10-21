package cobra

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"coastal-geometry/internal/formats"
	"github.com/spf13/cobra"
)

var inputFormatsOutput string
var inputFormatsStdout bool

var inputFormatsCmd = &cobra.Command{
	Use: "input-formats", Short: "Сохранить фиксированные схемы научных входов", RunE: func(cmd *cobra.Command, _ []string) error {
		data, err := json.MarshalIndent(formats.Catalog(meshComparisonReport{}), "", "  ")
		if err != nil {
			return err
		}
		data = append(data, '\n')
		if inputFormatsStdout {
			_, err = cmd.OutOrStdout().Write(data)
			return err
		}
		if err = os.MkdirAll(filepath.Dir(inputFormatsOutput), 0o755); err != nil {
			return err
		}
		if err = os.WriteFile(inputFormatsOutput, data, 0o644); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Схемы входов: %s\n", inputFormatsOutput)
		return nil
	},
}

func init() {
	inputFormatsCmd.Flags().StringVar(&inputFormatsOutput, "output", "output/scientific-inputs-v1.json", "файл схем научных входов")
	inputFormatsCmd.Flags().BoolVar(&inputFormatsStdout, "stdout", false, "вывести JSON для проверки закреплённого каталога")
	rootCmd.AddCommand(inputFormatsCmd)
}
