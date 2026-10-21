import type { DatasetDto } from "@litora/contracts";

export function DatasetPassport({ dataset }: { dataset: DatasetDto }) {
  const number = new Intl.NumberFormat("ru-RU");
  const fields = [
    ["Источник (заявлен)", dataset.source],
    ["Версия или дата источника", dataset.sourceRevision || "Не указана"],
    ["Лицензия (заявлена)", dataset.license],
    ["Система координат и единицы", `${dataset.crs} · градусы`],
    ["Точки", number.format(dataset.pointCount)],
    ["Размер", `${number.format(dataset.sizeBytes)} байт`],
  ];
  return (
    <>
      <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 border-t pt-4 text-sm">
        <p className="text-muted-foreground">Контрольная сумма SHA-256</p>
        <code className="mt-1 block text-xs leading-5 break-all">
          {dataset.sha256}
        </code>
        <p className="mt-2 text-xs text-muted-foreground">
          Версия схемы набора: {dataset.schemaVersion}
        </p>
        <p className="mt-1 text-xs break-all text-muted-foreground">
          ID записи: {dataset.id}
        </p>
      </div>
    </>
  );
}
