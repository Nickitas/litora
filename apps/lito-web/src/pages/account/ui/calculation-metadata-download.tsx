import { useState } from "react";
import type { CalculationJobDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import { calculationMetadataExport } from "../model/calculation-metadata-export";

export function CalculationMetadataDownload({
  job,
}: {
  job: CalculationJobDto;
}) {
  const [error, setError] = useState("");

  function download() {
    setError("");
    try {
      const content = `${JSON.stringify(calculationMetadataExport(job), null, 2)}\n`;
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeId = /^[0-9a-f-]{36}$/i.test(job.id) ? job.id : "unknown";
      link.href = url;
      link.download = `litora-calculation-${safeId}-metadata-v1.json`;
      try {
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setError("Не удалось подготовить паспорт. Повторите попытку.");
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={download}>
        Скачать паспорт JSON
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
