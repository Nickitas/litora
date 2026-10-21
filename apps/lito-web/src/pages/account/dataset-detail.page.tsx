import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiResponseError } from "@litora/api-client";
import type { DatasetDetailDto } from "@litora/contracts";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import { DatasetPassport } from "./ui/dataset-passport";
import { DatasetMap } from "./ui/dataset-map";
import { useCoastlineValidation, validationPassed } from "./model/use-coastline-validation";
import { CoastlineValidationPanel } from "./ui/coastline-validation-panel";

function DatasetDetail({ id }: { id: string }) {
  const [dataset, setDataset] = useState<DatasetDetailDto | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const validation = useCoastlineValidation("dataset", dataset ? id : "", dataset?.validation);

  useEffect(() => {
    let active = true;
    void api
      .dataset(id)
      .then((result) => {
        if (active) setDataset(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const missing =
          reason instanceof ApiResponseError &&
          [400, 403, 404].includes(reason.status);
        setUnavailable(missing);
        setError(
          missing
            ? "Набор не найден или недоступен вашему аккаунту."
            : reason instanceof Error
              ? reason.message
              : "Не удалось загрузить набор данных"
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await api.datasetContent(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dataset-${id}.geojson`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setDownloadError(
        reason instanceof Error ? reason.message : "Не удалось скачать GeoJSON"
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/lab/datasets">
          <ArrowLeft aria-hidden="true" />
          Все наборы
        </Link>
      </Button>
      {loading ? (
        <p role="status">Загружаем набор и береговую линию…</p>
      ) : error ? (
        <div role="alert" className="space-y-3 rounded-xl border p-5">
          <h1 className="text-xl font-semibold">
            {unavailable ? "Набор недоступен" : "Не удалось открыть набор"}
          </h1>
          <p className="text-sm text-destructive">{error}</p>
          {!unavailable && (
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              Повторить загрузку
            </Button>
          )}
        </div>
      ) : (
        dataset && (
          <>
            <header className="space-y-3">
              <p className="text-sm font-medium text-primary">
                Собственная береговая линия
              </p>
              <h1 className="text-[28px] leading-9 font-semibold break-words sm:text-[32px]">
                {dataset.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Добавлен {new Date(dataset.createdAt).toLocaleString("ru-RU")}
              </p>
              <div className="flex flex-wrap gap-2">
                {validationPassed(validation.state) ? <Button asChild>
                  <Link
                    to={`?${new URLSearchParams({ new: "1", dataset: dataset.id })}`}
                  >
                    Рассчитать размерность
                  </Link>
                </Button> : <Button disabled>Рассчитать размерность</Button>}
                <Button
                  variant="outline"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  <Download aria-hidden="true" />
                  {downloading ? "Скачиваем…" : "Скачать GeoJSON"}
                </Button>
              </div>
              {downloadError && (
                <p role="alert" className="text-sm text-destructive">
                  {downloadError}
                </p>
              )}
            </header>
            <CoastlineValidationPanel check={validation} />
            <section
              aria-labelledby="dataset-map-heading"
              className="space-y-3"
            >
              <h2 id="dataset-map-heading" className="text-xl font-semibold">
                Береговая линия и границы участка
              </h2>
              <DatasetMap geometry={dataset.geometry} />
            </section>
            <Card className="gap-0 p-5 shadow-none sm:p-6">
              <h2 className="text-xl font-semibold">Паспорт набора</h2>
              <DatasetPassport dataset={dataset} />
              <p className="mt-4 text-sm text-muted-foreground">
                Просмотр и проверка контрольной суммы не подтверждают точность
                или научную пригодность данных. Геометрию дополнительно проверит
                Go при расчёте.
              </p>
            </Card>
          </>
        )
      )}
    </div>
  );
}

export function DatasetDetailPage() {
  const { datasetId = "" } = useParams();
  return <DatasetDetail key={datasetId} id={datasetId} />;
}
