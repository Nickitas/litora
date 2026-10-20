package cobra

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"coastal-geometry/internal/formats"
	"github.com/spf13/cobra"
)

func init() {
	var output string
	var stdout bool
	command := &cobra.Command{Use: "input-formats", Short: "Сохранить фиксированные схемы научных входов", RunE: func(cmd *cobra.Command, _ []string) error {
		data, err := json.MarshalIndent(formats.Catalog(meshComparisonReport{}), "", "  ")
		if err != nil {
			return err
		}
		data = append(data, '\n')
		if stdout {
			_, err = cmd.OutOrStdout().Write(data)
			return err
		}
		if err = os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
			return err
		}
		if err = os.WriteFile(output, data, 0o644); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Схемы входов: %s\n", output)
		return nil
	}}
	command.Flags().StringVar(&output, "output", "output/scientific-inputs-v1.json", "файл схем научных входов")
	command.Flags().BoolVar(&stdout, "stdout", false, "вывести JSON для проверки закреплённого каталога")
	rootCmd.AddCommand(command)
}
