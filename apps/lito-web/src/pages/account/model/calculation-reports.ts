import { calculationReports } from "@litora/contracts";

export const calculationReportLabels: Record<string, { title: string; description: string }> = Object.fromEntries(
  calculationReports.map((report) => [report.filename, { title: `${report.figure} · ${report.title}`, description: report.description }]),
);
