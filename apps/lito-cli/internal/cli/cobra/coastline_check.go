package cobra

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"text/tabwriter"

	"coastal-geometry/internal/cli"
	"coastal-geometry/internal/domain/coastline"
	"github.com/spf13/cobra"
)

func init() {
	var input, output string
	var coastlineCheckCmd = &cobra.Command{Use: "coastline-check", Short: "Проверить геометрию береговой линии без изменения исходника",
		RunE: func(cmd *cobra.Command, args []string) error {
			report, err := coastline.CheckSourceGeometry(cmd.Context(), input)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(output, 0o755); err != nil {
				return fmt.Errorf("каталог проверки: %w", err)
			}
			data, err := json.MarshalIndent(report, "", "  ")
			if err != nil {
				return err
			}
			if err := os.WriteFile(filepath.Join(output, "coastline-validation.json"), append(data, '\n'), 0o644); err != nil {
				return fmt.Errorf("сохранение проверки: %w", err)
			}
			table := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
			fmt.Fprintln(table, "Показатель\tЗначение")
			fmt.Fprintf(table, "Проверка геометрии пройдена\t%t\nЛиний\t%d\nТочек\t%d\nЗамечаний\t%d\n", report.Accepted, report.PathCount, report.PointCount, len(report.Issues))
			for _, issue := range report.Issues {
				fmt.Fprintf(table, "%s\t%s\n", issue.Code, issue.Message)
			}
			if err := table.Flush(); err != nil {
				return err
			}
			if !report.Accepted {
				if manifestPath != "" {
					if err := cli.WriteResultManifest(manifestPath, cmd.CommandPath()); err != nil {
						return err
					}
				}
				return fmt.Errorf("геометрическая проверка не пройдена: замечаний %d; исходный файл не изменён", len(report.Issues))
			}
			return nil
		},
	}
	coastlineCheckCmd.Flags().StringVar(&input, "input", "", "путь к GeoJSON береговой линии")
	coastlineCheckCmd.Flags().StringVar(&output, "output", "./output/coastline-validation", "каталог отчёта проверки")
	_ = coastlineCheckCmd.MarkFlagRequired("input")
	rootCmd.AddCommand(coastlineCheckCmd)
}
