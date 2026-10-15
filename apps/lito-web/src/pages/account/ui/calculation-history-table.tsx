import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import type { CalculationJobDto, CalculationKindDto } from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Checkbox } from "@/shared/shadcn/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/shadcn/components/ui/table";
import { isActiveCalculation } from "../model/use-calculations";
import { CalculationTitle } from "./calculation-title";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function CalculationHistoryTable({
  jobs,
  kinds,
  comparisonIds,
  onCompareChange,
  onQuickView,
  onCancel,
  onDelete,
}: {
  jobs: CalculationJobDto[];
  kinds: CalculationKindDto[];
  comparisonIds: string[];
  onCompareChange: (jobId: string) => void;
  onQuickView: (jobId: string, trigger: HTMLButtonElement) => void;
  onCancel: (job: CalculationJobDto, trigger: HTMLButtonElement) => void;
  onDelete: (job: CalculationJobDto, trigger: HTMLButtonElement) => void;
}) {
  const columns = useMemo<ColumnDef<CalculationJobDto>[]>(
    () => [
      {
        id: "compare",
        header: "Сравнить",
        cell: ({ row }) => {
          const job = row.original;
          const selected = comparisonIds.includes(job.id);
          const disabled =
            job.status !== "succeeded" || Boolean(job.deletionRequestedAt) ||
            (comparisonIds.length === 2 && !selected);
          const title =
            kinds.find((item) => item.kind === job.kind)?.title ?? job.kind;
          return (
            <Checkbox
              aria-label={`Сравнить расчёт ${title} от ${dateFormatter.format(new Date(job.createdAt))}`}
              aria-describedby="history-compare-help"
              checked={selected}
              disabled={disabled}
              onCheckedChange={() => onCompareChange(job.id)}
            />
          );
        },
      },
      {
        accessorKey: "kind",
        header: "Сценарий",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            <CalculationTitle kind={row.original.kind} kinds={kinds} />
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Статус",
        cell: ({ row }) => row.original.deletionRequestedAt
          ? <span className="text-sm text-muted-foreground">Удаляется…</span>
          : <CalculationStatus status={row.original.status} />,
      },
      {
        accessorKey: "createdAt",
        header: "Создан",
        cell: ({ row }) => (
          <time
            dateTime={row.original.createdAt}
            className="text-sm whitespace-nowrap text-muted-foreground"
          >
            {dateFormatter.format(new Date(row.original.createdAt))}
          </time>
        ),
      },
      {
        id: "actions",
        header: "Действия",
        cell: ({ row }) => {
          const job = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-9"
                onClick={(event) => onQuickView(job.id, event.currentTarget)}
              >
                Кратко
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-9">
                <Link to={`/lab/calculations/${job.id}`}>Открыть</Link>
              </Button>
              {isActiveCalculation(job) && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="min-h-9"
                  onClick={(event) => onCancel(job, event.currentTarget)}
                >
                  Отменить
                </Button>
              )}
              {!isActiveCalculation(job) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 text-destructive hover:text-destructive"
                  disabled={Boolean(job.deletionRequestedAt)}
                  onClick={(event) => onDelete(job, event.currentTarget)}
                >
                  <Trash2 aria-hidden="true" />
                  Удалить
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [comparisonIds, kinds, onCancel, onCompareChange, onDelete, onQuickView]
  );
  const table = useReactTable({
    data: jobs,
    columns,
    getRowId: (job) => job.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <p className="px-4 py-2 text-xs text-muted-foreground md:hidden">
        Прокрутите таблицу по горизонтали, чтобы увидеть все действия.
      </p>
      <div
        role="region"
        aria-label="Прокрутка таблицы расчётов"
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <Table aria-label="История расчётов" className="min-w-[850px]">
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={
                      header.id === "actions"
                        ? "text-right"
                        : header.id === "compare"
                          ? "w-24"
                          : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={
                  comparisonIds.includes(row.id) ? "selected" : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === "actions" ? "text-right" : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
