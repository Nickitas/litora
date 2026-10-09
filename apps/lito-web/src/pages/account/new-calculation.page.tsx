import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  CalculationKind,
  CalculationKindDto,
  CalculationJobDto,
  DatasetDto,
  ErosionDemoOptionsDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ScientificInputRole,
} from "@litora/contracts";
import { erosionDemoDefaults, scientificInputRequirements } from "@litora/contracts";
import { defaultCoastlineDataset } from "@litora/generated-data";
import { ArrowUpRight, Database, FilePlus2, X } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/shadcn/components/ui/collapsible";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/components/ui/select";
import { errorMessage } from "./model/use-calculations";
import { scenarioGuidance } from "./model/scenario-guidance";
import { DatasetUpload } from "./ui/dataset-upload";
import { ScientificInputUpload } from "./ui/scientific-input-upload";
import { scientificRoleLabels } from "./model/scientific-role-labels";

const articleSizeFieldPreset = {
  minSize: "50",
  coastSize: "75",
  shelfSize: "125",
  deepSize: "250",
  coastInfluence: "25000",
  curvatureReference: "30",
  slopeReference: "10",
  flatDeepSlope: "1",
  maxNeighbourRatio: "1.25",
  maxSizeGradient: "0.15",
} as const;

export function NewCalculationDialog({
  repeatJobId,
  onOpenChange,
  onRestoreFocus,
}: {
  repeatJobId?: string;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
}) {
  const navigate = useNavigate();
  const [kinds, setKinds] = useState<CalculationKindDto[]>([]);
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [scientificInputs, setScientificInputs] = useState<ScientificInputDto[]>([]);
  const [reusableArtifacts, setReusableArtifacts] = useState<ReusableScientificArtifactDto[]>([]);
  const [selectedScientific, setSelectedScientific] = useState<Record<string, string>>({});
  const [uploadField, setUploadField] = useState<{ field: string; role: ScientificInputRole; existing?: ScientificInputDto } | null>(null);
  const [kind, setKind] = useState<CalculationKind>("dimension");
  const [datasetId, setDatasetId] = useState("");
  const [datasetSelectOpen, setDatasetSelectOpen] = useState(false);
  const [erosionOptions, setErosionOptions] = useState<ErosionDemoOptionsDto>(erosionDemoDefaults);
  const [meshCellSizes, setMeshCellSizes] = useState("1000");
  const [meshBoundaryDetails, setMeshBoundaryDetails] = useState("1000");
  const [meshGenerators, setMeshGenerators] = useState("frontal-quad");
  const [meshMaxCells, setMeshMaxCells] = useState(5_000_000);
  const [meshTimeoutMinutes, setMeshTimeoutMinutes] = useState(20);
  const [meshAllowLarge, setMeshAllowLarge] = useState(false);
  const [buildParameters, setBuildParameters] = useState<Record<string, number>>({
    boundaryDetail: 1000, maxSourceDistance: 50000, coastTransition: 0,
    maxNodes: 5_000_000, maxCells: 5_000_000, maxOutputMiB: 2048,
  });
  const [recoverWgs84, setRecoverWgs84] = useState(true);
  const [buildAllowLarge, setBuildAllowLarge] = useState(false);
  const [isobaths, setIsobaths] = useState("20,50,100,200,500,1000,1500,2000");
  const [verticalExaggeration, setVerticalExaggeration] = useState(40);
  const [controlPoints, setControlPoints] = useState(true);
  const [adaptSizes, setAdaptSizes] = useState<Record<string, string>>({});
  const [adaptiveGenerator, setAdaptiveGenerator] = useState("delaunay");
  const [adaptiveBoundaryDetail, setAdaptiveBoundaryDetail] = useState(200);
  const [adaptiveMaxCells, setAdaptiveMaxCells] = useState(5_000_000);
  const [adaptiveTimeoutMinutes, setAdaptiveTimeoutMinutes] = useState(20);
  const [adaptiveAllowLarge, setAdaptiveAllowLarge] = useState(false);
  const [validationIsobaths, setValidationIsobaths] = useState("20,200,1000,2000");
  const [worstCells, setWorstCells] = useState(20);
  const [maxNearestDistance, setMaxNearestDistance] = useState(0);
  const [compareLevels, setCompareLevels] = useState("detailed:125:250");
  const [boundaryDetail, setBoundaryDetail] = useState(50);
  const [generators, setGenerators] = useState("delaunay,frontal-quad");
  const [detailPreset, setDetailPreset] = useState("kizilirmak");
  const [maxCells, setMaxCells] = useState(25_000_000);
  const [generatorTimeoutMinutes, setGeneratorTimeoutMinutes] = useState(20);
  const [allowLarge, setAllowLarge] = useState(false);
  const [articlePresetApplied, setArticlePresetApplied] = useState<"adapt" | "compare" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingInputId, setDeletingInputId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [repeatError, setRepeatError] = useState("");
  const [missingRepeatInputs, setMissingRepeatInputs] = useState<string[]>([]);
  const [missingRepeatDataset, setMissingRepeatDataset] = useState(false);
  const repeatApplied = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [revision, setRevision] = useState(0);
  const [datasetUploadOpen, setDatasetUploadOpen] = useState(false);

  const applyStoredCalculation = useCallback((
    original: CalculationJobDto,
    availableDatasets: DatasetDto[],
    availableInputs: ScientificInputDto[],
    availableArtifacts: ReusableScientificArtifactDto[],
  ) => {
    const input = original.input;
    const number = (key: string, update: (value: number) => void) => {
      const value = input[key];
      if (typeof value === "number" && Number.isFinite(value)) update(value);
    };
    const string = (key: string, update: (value: string) => void) => {
      const value = input[key];
      if (typeof value === "string") update(value);
    };
    const boolean = (key: string, update: (value: boolean) => void) => {
      const value = input[key];
      if (typeof value === "boolean") update(value);
    };
    setKind(original.kind as CalculationKind);
    if (original.kind === "dimension_dataset") {
      const id = input.datasetId;
      if (typeof id === "string" && availableDatasets.some((item) => item.id === id)) {
        setDatasetId(id);
      } else {
        setMissingRepeatDataset(true);
      }
    }
    const requirements = scientificInputRequirements[original.kind as keyof typeof scientificInputRequirements];
    if (requirements) {
      const selected: Record<string, string> = {};
      const missing: string[] = [];
      for (const [field, role] of Object.entries(requirements)) {
        const id = input[field];
        const ready = typeof id === "string" && (
          availableInputs.some((item) => item.id === id && item.role === role && item.status === "ready") ||
          availableArtifacts.some((item) => item.id === id && item.role === role)
        );
        if (ready) selected[field] = id;
        else missing.push(field);
      }
      setSelectedScientific(selected);
      setMissingRepeatInputs(missing);
    }
    switch (original.kind) {
      case "erosion":
        setErosionOptions((current) => {
          const next = { ...current };
          for (const key of ["steps", "breakingIndex", "bermHeight", "closureDepth", "porosity",
            "cercCoefficient", "offshoreSampleDistance", "maxShorelineChange", "maxBathymetryGap"] as const) {
            const value = input[key];
            if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
          }
          if (typeof input.outputCsv === "boolean") next.outputCsv = input.outputCsv;
          if (input.csvFormat === "long" || input.csvFormat === "wide") next.csvFormat = input.csvFormat;
          return next;
        });
        break;
      case "mesh":
        string("cellSizes", setMeshCellSizes);
        string("boundaryDetails", setMeshBoundaryDetails);
        string("generators", setMeshGenerators);
        number("maxCells", setMeshMaxCells);
        number("generatorTimeoutMinutes", setMeshTimeoutMinutes);
        boolean("allowLarge", setMeshAllowLarge);
        break;
      case "seabed_build":
        setBuildParameters((current) => {
          const next = { ...current };
          for (const key of Object.keys(current)) {
            const value = input[key];
            if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
          }
          return next;
        });
        boolean("recoverWgs84", setRecoverWgs84);
        boolean("allowLarge", setBuildAllowLarge);
        break;
      case "seabed_render":
        string("isobaths", setIsobaths);
        number("verticalExaggeration", setVerticalExaggeration);
        boolean("controlPoints", setControlPoints);
        break;
      case "seabed_adapt": {
        const values: Record<string, string> = {};
        for (const key of ["minSize", "coastSize", "shelfSize", "deepSize", "coastInfluence",
          "curvatureReference", "slopeReference", "flatDeepSlope", "maxNeighbourRatio", "maxSizeGradient"]) {
          const value = input[key];
          if (typeof value === "number" && Number.isFinite(value)) values[key] = String(value);
        }
        setAdaptSizes(values);
        break;
      }
      case "seabed_generate_adaptive":
        string("generator", setAdaptiveGenerator);
        number("boundaryDetail", setAdaptiveBoundaryDetail);
        number("maxCells", setAdaptiveMaxCells);
        number("generatorTimeoutMinutes", setAdaptiveTimeoutMinutes);
        boolean("allowLarge", setAdaptiveAllowLarge);
        break;
      case "seabed_validate":
        string("isobaths", setValidationIsobaths);
        number("worstCells", setWorstCells);
        number("maxNearestDistance", setMaxNearestDistance);
        break;
      case "seabed_compare_adaptive":
        string("levels", setCompareLevels);
        number("boundaryDetail", setBoundaryDetail);
        string("generators", setGenerators);
        string("detailPreset", setDetailPreset);
        number("maxCells", setMaxCells);
        number("generatorTimeoutMinutes", setGeneratorTimeoutMinutes);
        boolean("allowLarge", setAllowLarge);
        break;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const repeat = repeatJobId
      ? api.calculation(repeatJobId)
          .then((job) => ({ job, error: "" }))
          .catch((error: unknown) => ({ job: null, error: errorMessage(error) }))
      : Promise.resolve({ job: null, error: "" });
    void Promise.all([
      api.calculationKinds(), api.datasets(), api.scientificInputs(),
      api.reusableScientificArtifacts(), repeat,
    ])
      .then(([nextKinds, nextDatasets, nextScientific, nextArtifacts, original]) => {
        if (!mounted) return;
        setKinds(nextKinds);
        setDatasets(nextDatasets);
        setScientificInputs(nextScientific);
        setReusableArtifacts(nextArtifacts);
        setKind((current) =>
          nextKinds.some((item) => item.kind === current)
            ? current
            : (nextKinds[0]?.kind ?? current)
        );
        setLoadError("");
        if (original.error) setRepeatError(`Не удалось открыть исходный расчёт: ${original.error}`);
        else setRepeatError("");
        if (original.job && !repeatApplied.current) {
          if (!nextKinds.some((item) => item.kind === original.job.kind)) {
            setRepeatError("Сценарий исходного расчёта больше недоступен. Выберите другой сценарий.");
          } else if (!original.job.input || typeof original.job.input !== "object" ||
                     Array.isArray(original.job.input)) {
            setRepeatError("У исходного расчёта нет пригодных параметров запуска.");
          } else {
            repeatApplied.current = true;
            applyStoredCalculation(original.job, nextDatasets, nextScientific, nextArtifacts);
          }
        }
      })
      .catch((nextError: unknown) => {
        if (mounted) setLoadError(errorMessage(nextError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [revision, repeatJobId, applyStoredCalculation]);

  function reload() {
    setLoading(true);
    setLoadError("");
    setRevision((value) => value + 1);
  }

  async function deletePendingInput(id: string) {
    setDeletingInputId(id);
    setSubmitError("");
    try {
      await api.deletePendingScientificInput(id);
      setScientificInputs((current) => current.filter((item) => item.id !== id));
      setUploadField((current) => current?.existing?.id === id ? null : current);
    } catch (nextError) {
      setSubmitError(errorMessage(nextError));
    } finally {
      setDeletingInputId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kinds.some((item) => item.kind === kind)) return;
    if (kind === "dimension_dataset" && missingRepeatDataset) {
      setSubmitError("Исходный набор данных недоступен. Явно выберите другой набор или встроенный пример.");
      return;
    }
    const requirements = scientificInputRequirements[kind as keyof typeof scientificInputRequirements];
    const scientificParameters: Record<string, string> = {};
    if (requirements) {
      for (const field of Object.keys(requirements)) {
        if (!selectedScientific[field]) {
          setSubmitError("Выберите все научные входные файлы для этого сценария.");
          return;
        }
        scientificParameters[field] = selectedScientific[field];
      }
    }
    setBusy(true);
    setSubmitError("");
    try {
      let selectedDatasetId = datasetId;
      if (kind === "dimension_dataset" && !selectedDatasetId) {
        const example = await api.createDataset(defaultCoastlineDataset);
        setDatasets((current) => [example, ...current]);
        setDatasetId(example.id);
        selectedDatasetId = example.id;
      }
      const job = await api.createCalculation({
        kind,
        input: {
          ...scientificParameters,
          ...(kind === "erosion" ? erosionOptions : {}),
          ...(kind === "mesh" ? {
            cellSizes: meshCellSizes, boundaryDetails: meshBoundaryDetails,
            generators: meshGenerators, maxCells: meshMaxCells,
            allowLarge: meshAllowLarge, generatorTimeoutMinutes: meshTimeoutMinutes,
          } : {}),
          ...(kind === "seabed_build" ? {
            ...buildParameters, recoverWgs84, allowLarge: buildAllowLarge,
          } : {}),
          ...(kind === "dimension_dataset" ? { datasetId: selectedDatasetId } : {}),
          ...(kind === "seabed_render" ? {
            isobaths, verticalExaggeration, controlPoints,
          } : {}),
          ...(kind === "seabed_adapt" ? Object.fromEntries(
            Object.entries(adaptSizes)
              .filter(([, value]) => value !== "")
              .map(([key, value]) => [key, Number(value)])
          ) : {}),
          ...(kind === "seabed_generate_adaptive" ? {
            generator: adaptiveGenerator, boundaryDetail: adaptiveBoundaryDetail,
            maxCells: adaptiveMaxCells, allowLarge: adaptiveAllowLarge,
            generatorTimeoutMinutes: adaptiveTimeoutMinutes,
          } : {}),
          ...(kind === "seabed_validate" ? {
            isobaths: validationIsobaths, worstCells, maxNearestDistance,
          } : {}),
          ...(kind === "seabed_compare_adaptive" ? {
            boundaryDetail, generators, levels: compareLevels, detailPreset,
            maxCells, allowLarge, generatorTimeoutMinutes,
          } : {}),
        },
      });
      onOpenChange(false);
      navigate(`/account/calculations/${job.id}`);
    } catch (nextError) {
      setSubmitError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  const scenario = kinds.find((item) => item.kind === kind);
  const guidance = scenario ? scenarioGuidance[scenario.kind] : undefined;
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const isDatasetCalculation = kind === "dimension_dataset";
  const scientificRequirements = scientificInputRequirements[kind as keyof typeof scientificInputRequirements];
  const scientificFields = scientificRequirements
    ? Object.entries(scientificRequirements) as [string, ScientificInputRole][]
    : [];

  return (
    <DialogContent
      aria-modal="true"
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <header className="shrink-0 border-b px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Исследование
              </p>
              <DialogTitle className="mt-1 text-2xl font-semibold sm:text-3xl">
                {repeatJobId ? "Расчёт на основе" : "Новый расчёт"}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                {repeatJobId
                  ? "Проверьте сохранённые параметры и входы. Новый запуск использует текущую версию ядра и может дать другой результат."
                  : "Выберите сценарий и входные данные. Задание попадёт в очередь только после запуска."}
              </DialogDescription>
            </div>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label="Закрыть окно нового расчёта"
              className="size-11 p-0"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
      </header>

      <div
        data-slot="calculation-dialog-body"
        className="min-h-0 space-y-6 overflow-y-auto px-5 py-6 sm:px-6"
      >
        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
          >
            <p>{loadError}</p>
            <Button
              type="button"
              variant="link"
              className="mt-2 h-auto p-0"
              onClick={reload}
            >
              Повторить загрузку
            </Button>
          </div>
        )}

        {repeatError && (
          <p role="alert" className="rounded-xl border border-destructive bg-status-failed-background p-4 text-sm text-status-failed">
            {repeatError} Можно заполнить новую форму вручную.
          </p>
        )}

        {repeatJobId && !loading && !repeatError && (
          <div role="status" className="rounded-xl border bg-muted/35 p-4 text-sm">
            <p>Параметры перенесены из вашего расчёта. Создастся новое задание; старый результат не изменится.</p>
            {(missingRepeatDataset || missingRepeatInputs.some((field) => !selectedScientific[field])) && (
              <p className="mt-2 text-warning">
                Часть исходных данных больше недоступна. Выберите замену явно перед запуском.
              </p>
            )}
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
          >
            <p>{submitError}</p>
            <p className="mt-1 text-sm">
              Параметры сохранены. Попробуйте запустить расчёт ещё раз.
            </p>
          </div>
        )}

        <form
          id="new-calculation-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-6"
          aria-busy={busy}
        >
          {loading ? (
            <div className="rounded-xl border border-dashed p-6" role="status">
              <p className="font-medium">Готовим форму расчёта…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Получаем доступные сценарии и ваши наборы данных.
              </p>
            </div>
          ) : (
            <>
              <section aria-labelledby="calculation-scenario-heading">
                <div className="flex items-baseline justify-between gap-4">
                  <h3
                    id="calculation-scenario-heading"
                    className="text-lg font-semibold"
                  >
                    1. Сценарий
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Доступен
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="calculation-kind">Что рассчитать</Label>
                  <Select
                    value={kind}
                    disabled={!kinds.length}
                    onValueChange={(value) => {
                      setKind(value as CalculationKind);
                      setArticlePresetApplied(null);
                      setSelectedScientific({});
                      setMissingRepeatDataset(false);
                      setMissingRepeatInputs([]);
                      setDatasetUploadOpen(false);
                      setUploadField(null);
                    }}
                  >
                    <SelectTrigger
                      id="calculation-kind"
                      aria-label="Что рассчитать"
                    >
                      <SelectValue placeholder="Выберите сценарий" />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((item) => (
                        <SelectItem key={item.kind} value={item.kind}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!kinds.length && !loadError && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Сейчас нет доступных сценариев для запуска.
                  </p>
                )}
                {scenario && (
                  <div
                    className="mt-4 space-y-4 rounded-xl border bg-card p-4"
                    aria-live="polite"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{scenario.title}</p>
                      {kind === "erosion" && (
                        <span className="rounded-full bg-warning-background px-2.5 py-1 text-xs font-semibold text-warning">
                          Демонстрационный сценарий
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {scenario.description}
                    </p>
                    {guidance && (
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-medium">Входные данные</dt>
                          <dd className="mt-1 text-muted-foreground">
                            {guidance.source}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Ограничение</dt>
                          <dd className="mt-1 text-muted-foreground">
                            {guidance.limitation}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {guidance && (
                      <Link
                        to={guidance.reference.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {guidance.reference.label}
                        <ArrowUpRight aria-hidden="true" className="size-4" />
                        <span className="sr-only">
                          (откроется в новой вкладке)
                        </span>
                      </Link>
                    )}
                  </div>
                )}
              </section>

              {kind === "erosion" && (
                <section
                  aria-labelledby="calculation-parameters-heading"
                  className="border-t pt-6"
                >
                  <h3
                    id="calculation-parameters-heading"
                    className="text-lg font-semibold"
                  >
                    2. Параметры
                  </h3>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="erosion-steps">
                      Шаги волнового ряда (1–48)
                    </Label>
                    <Input
                      id="erosion-steps"
                      type="number"
                      min={1}
                      max={48}
                      required
                      value={erosionOptions.steps}
                      onChange={(event) => setErosionOptions((current) => ({ ...current, steps: Number(event.target.value) }))}
                    />
                  </div>
                  <Collapsible defaultOpen={Boolean(repeatJobId)} className="mt-5 space-y-3">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="outline">Параметры CERC и экспорт CSV</Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 rounded-xl border p-4">
                      <p className="text-sm text-muted-foreground">
                        Настройки меняют демонстрационный расчёт, но не превращают набор Сочи в калиброванный прогноз.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {([
                          ["breakingIndex", "Индекс разрушения волн", 0.55, 1.2],
                          ["bermHeight", "Высота бермы, м", 0.001, 100],
                          ["closureDepth", "Глубина замыкания, м", 0.001, 1000],
                          ["porosity", "Пористость наносов", 0.000001, 0.699999],
                          ["cercCoefficient", "Коэффициент CERC", 0.000001, 1],
                          ["offshoreSampleDistance", "Расстояние отбора глубины, м", 1, 100000],
                          ["maxShorelineChange", "Предел смещения за состояние, м", 0.001, 1000],
                          ["maxBathymetryGap", "Радиус поиска глубины, м", 1, 100000],
                        ] as const).map(([key, label, min, max]) => (
                          <div key={key} className="space-y-2">
                            <Label htmlFor={`erosion-${key}`}>{label}</Label>
                            <Input id={`erosion-${key}`} type="number" min={min} max={max} step="any" required
                              value={erosionOptions[key]}
                              onChange={(event) => setErosionOptions((current) => ({
                                ...current, [key]: Number(event.target.value),
                              }))} />
                          </div>
                        ))}
                      </div>
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <input type="checkbox" checked={erosionOptions.outputCsv}
                          onChange={(event) => setErosionOptions((current) => ({ ...current, outputCsv: event.target.checked }))} />
                        Сохранить CSV метрик
                      </label>
                      {erosionOptions.outputCsv && (
                        <div className="space-y-2">
                          <Label htmlFor="erosion-csv-format">Формат CSV</Label>
                          <Select value={erosionOptions.csvFormat}
                            onValueChange={(value) => setErosionOptions((current) => ({
                              ...current, csvFormat: value as ErosionDemoOptionsDto["csvFormat"],
                            }))}>
                            <SelectTrigger id="erosion-csv-format"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="long">Long — одна строка на состояние</SelectItem>
                              <SelectItem value="wide">Wide — столбцы по состояниям</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </section>
              )}

              {isDatasetCalculation && (
                <section
                  aria-labelledby="calculation-data-heading"
                  className="border-t pt-6"
                >
                  <h3
                    id="calculation-data-heading"
                    className="text-lg font-semibold"
                  >
                    2. Береговая линия
                  </h3>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="calculation-dataset">Набор данных</Label>
                    <Select
                      open={datasetSelectOpen}
                      onOpenChange={setDatasetSelectOpen}
                      value={datasetId || "__example__"}
                      onValueChange={(value) => {
                        if (datasetSelectOpen) {
                          setDatasetId(value === "__example__" ? "" : value);
                          setMissingRepeatDataset(false);
                        }
                      }}
                    >
                      <SelectTrigger
                        id="calculation-dataset"
                        aria-label="Набор данных"
                      >
                        <SelectValue>
                          {selectedDataset
                            ? `${selectedDataset.name} · ${selectedDataset.pointCount} точек`
                            : "Встроенный пример Сочи (по умолчанию)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__example__">
                          Встроенный пример Сочи (по умолчанию)
                        </SelectItem>
                        {datasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name} · {dataset.pointCount} точек
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedDataset?.source ??
                      "Пример Сочи (OpenStreetMap, ODbL) сохранится в вашем аккаунте при запуске."}
                    {selectedDataset?.sourceRevision &&
                      ` · версия: ${selectedDataset.sourceRevision}`}
                  </p>
                  {missingRepeatDataset && (
                    <div className="mt-3 space-y-2 rounded-lg border border-warning p-3 text-sm">
                      <p>Исходный набор больше недоступен. Выберите другой или явно подтвердите замену.</p>
                      <Button type="button" variant="outline" onClick={() => {
                        setDatasetId("");
                        setMissingRepeatDataset(false);
                      }}>
                        Использовать встроенный пример вместо исходного
                      </Button>
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/35 p-4">
                    <div>
                      <p className="text-sm font-medium">Есть свой GeoJSON?</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Сохраните его как новый набор и используйте в этом
                        расчёте.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-expanded={datasetUploadOpen}
                      onClick={() => setDatasetUploadOpen((open) => !open)}
                    >
                      <FilePlus2 aria-hidden="true" />
                      {datasetUploadOpen ? "Скрыть форму" : "Загрузить GeoJSON"}
                    </Button>
                  </div>
                </section>
              )}
              {scientificFields.length > 0 && (
                <section aria-labelledby="scientific-inputs-heading" className="space-y-4 border-t pt-6">
                  <div>
                    <h3 id="scientific-inputs-heading" className="text-lg font-semibold">2. Научные входные файлы</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Выберите ранее загруженные файлы или сохраните новые. Go проверит их научный формат и совместимость при запуске.
                    </p>
                  </div>
                  {scientificFields.map(([field, role]) => {
                    const options = scientificInputs.filter((item) => item.role === role && item.status === "ready");
                    const artifacts = reusableArtifacts.filter((item) => item.role === role);
                    const pending = scientificInputs.filter((item) => item.role === role && item.status === "pending");
                    const chosenArtifact = artifacts.find((item) => item.id === selectedScientific[field]);
                    return (
                      <div key={field} className="space-y-2 rounded-lg border p-3">
                        <Label htmlFor={`scientific-${field}`}>{scientificRoleLabels[role]}</Label>
                        <Select
                          value={selectedScientific[field] || undefined}
                          onValueChange={(value) => setSelectedScientific((current) => ({ ...current, [field]: value }))}
                        >
                          <SelectTrigger id={`scientific-${field}`} aria-label={scientificRoleLabels[role]} className="min-w-0 max-w-full">
                            <SelectValue placeholder={options.length || artifacts.length ? "Выберите вход" : "Нет подходящих файлов"} />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} · {new Intl.NumberFormat("ru-RU").format(item.sizeBytes)} байт
                              </SelectItem>
                            ))}
                            {artifacts.map((item) => (
                              <SelectItem key={item.id} value={item.id} className="max-w-[80vw] sm:max-w-xl">
                                {kinds.find((entry) => entry.kind === item.jobKind)?.title ?? "Расчёт"} · {item.filename} · {new Intl.NumberFormat("ru-RU").format(item.sizeBytes)} байт
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {chosenArtifact && (
                          <p className="text-xs text-muted-foreground">
                            Файл готового расчёта. <Link className="underline underline-offset-2" to={`/account/calculations/${chosenArtifact.jobId}`}>
                              Открыть исходный результат
                            </Link>
                          </p>
                        )}
                        <Button type="button" variant="outline" onClick={() => setUploadField({ field, role })}>
                          <FilePlus2 aria-hidden="true" /> Загрузить файл
                        </Button>
                        {pending.map((item) => (
                          <div key={item.id} className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="ghost"
                              onClick={() => setUploadField({ field, role, existing: item })}>
                              Продолжить загрузку: {item.name}
                            </Button>
                            <Button type="button" variant="ghost" disabled={deletingInputId === item.id}
                              onClick={() => void deletePendingInput(item.id)}>
                              Удалить незавершённую запись
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </section>
              )}
              {kind === "mesh" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры плоской сетки">
                  <h3 className="text-lg font-semibold">3. Параметры сетки</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mesh-sizes">Длины рёбер, м (через запятую)</Label>
                      <Input id="mesh-sizes" value={meshCellSizes} required
                        onChange={(event) => setMeshCellSizes(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mesh-details">Детализация берега, м (одно значение или по числу рёбер)</Label>
                      <Input id="mesh-details" value={meshBoundaryDetails} required
                        onChange={(event) => setMeshBoundaryDetails(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mesh-max-cells">Максимум ячеек</Label>
                      <Input id="mesh-max-cells" type="number" min={1000} max={25_000_000} required
                        value={meshMaxCells} onChange={(event) => setMeshMaxCells(Number(event.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mesh-timeout">Тайм-аут генератора, мин</Label>
                      <Input id="mesh-timeout" type="number" min={1} max={120} required
                        value={meshTimeoutMinutes} onChange={(event) => setMeshTimeoutMinutes(Number(event.target.value))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mesh-generators">Генераторы Gmsh</Label>
                    <Select value={meshGenerators} onValueChange={setMeshGenerators}>
                      <SelectTrigger id="mesh-generators"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="frontal-quad">Frontal-Delaunay for Quads</SelectItem>
                        <SelectItem value="delaunay">Delaunay</SelectItem>
                        <SelectItem value="parallelograms">Упаковка параллелограммов</SelectItem>
                        <SelectItem value="delaunay,frontal-quad">Delaunay и Frontal-Delaunay</SelectItem>
                        <SelectItem value="delaunay,frontal-quad,parallelograms">Все три</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={meshAllowLarge}
                      onChange={(event) => setMeshAllowLarge(event.target.checked)} />
                    Разрешить расчёт сверх оценки лимита ячеек
                  </label>
                </section>
              )}
              {kind === "seabed_build" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры сборки модели дна">
                  <h3 className="text-lg font-semibold">3. Параметры модели дна</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["boundaryDetail", "Детализация берега, м", 10, 10000],
                      ["maxSourceDistance", "Предел поиска глубины, м", 100, 100000],
                      ["coastTransition", "Переход к береговому нулю, м (0 — автоматически)", 0, 100000],
                      ["maxNodes", "Максимум узлов", 1000, 25000000],
                      ["maxCells", "Максимум ячеек", 1000, 25000000],
                      ["maxOutputMiB", "Лимит экспорта, МиБ", 1, 8192],
                    ] as const).map(([key, label, min, max]) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`build-${key}`}>{label}</Label>
                        <Input id={`build-${key}`} type="number" min={min} max={max} required
                          value={buildParameters[key]}
                          onChange={(event) => setBuildParameters((current) => ({ ...current, [key]: Number(event.target.value) }))} />
                      </div>
                    ))}
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={recoverWgs84}
                      onChange={(event) => setRecoverWgs84(event.target.checked)} />
                    Восстановить WGS 84 у старой плоской сетки
                  </label>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={buildAllowLarge}
                      onChange={(event) => setBuildAllowLarge(event.target.checked)} />
                    Разрешить сборку сверх проверенных лимитов после оценки ресурсов
                  </label>
                </section>
              )}
              {kind === "seabed_render" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры визуализации">
                  <h3 className="text-lg font-semibold">3. Параметры визуализации</h3>
                  <div className="space-y-2">
                    <Label htmlFor="seabed-isobaths">Глубины изобат, м (через запятую)</Label>
                    <Input id="seabed-isobaths" value={isobaths} required
                      onChange={(event) => setIsobaths(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seabed-vertical">Вертикальное преувеличение 3D (1–200)</Label>
                    <Input id="seabed-vertical" type="number" min={1} max={200} step="any" required
                      value={verticalExaggeration}
                      onChange={(event) => setVerticalExaggeration(Number(event.target.value))} />
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={controlPoints}
                      onChange={(event) => setControlPoints(event.target.checked)} />
                    Показывать контрольные точки на 3D-поверхности
                  </label>
                </section>
              )}
              {kind === "seabed_adapt" && (
                <section className="space-y-4 border-t pt-6" aria-label="Размеры адаптивного поля">
                  <h3 className="text-lg font-semibold">3. Размеры ячеек</h3>
                  <p className="text-sm text-muted-foreground">Пустое поле использует значение Go по умолчанию.</p>
                  <div className="space-y-2 rounded-xl border bg-muted/35 p-4 text-sm">
                    <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => {
                      setAdaptSizes(articleSizeFieldPreset);
                      setArticlePresetApplied("adapt");
                    }}>
                      Заполнить как рисунок 4: поле 50–250 м
                    </Button>
                    <p className="text-muted-foreground">
                      Значения из архивного отчёта статьи. Нужна совместимая модель дна и её паспорт; пресет не выбирает файлы и не запускает расчёт.
                    </p>
                    {articlePresetApplied === "adapt" && (
                      <p role="status">Параметры рисунка 4 заполнены. Их можно изменить перед запуском.</p>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["minSize", "Минимальный размер, м"],
                      ["coastSize", "Размер у берега, м"],
                      ["shelfSize", "Размер на шельфе, м"],
                      ["deepSize", "Размер глубоководья, м"],
                      ["coastInfluence", "Дальность влияния берега, м"],
                      ["curvatureReference", "Опорный поворот берега, °"],
                      ["slopeReference", "Опорный уклон дна, °"],
                      ["flatDeepSlope", "Максимальный уклон глубоководья, °"],
                      ["maxNeighbourRatio", "Предельное отношение соседних размеров"],
                      ["maxSizeGradient", "Предельный рост размера, м/м"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`adapt-${key}`}>{label}</Label>
                        <Input id={`adapt-${key}`} type="number" min={key === "maxSizeGradient" ? 0.000001 : key === "maxNeighbourRatio" ? 1.000001 : 0.000001}
                          max={key === "coastInfluence" ? 1000000 : key === "maxNeighbourRatio" || key === "maxSizeGradient" ? 100 : 100000} step="any"
                          value={adaptSizes[key] ?? ""}
                          onChange={(event) => {
                            setAdaptSizes((current) => ({ ...current, [key]: event.target.value }));
                            setArticlePresetApplied(null);
                          }} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {kind === "seabed_generate_adaptive" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры адаптивной сетки">
                  <h3 className="text-lg font-semibold">3. Построение адаптивной сетки</h3>
                  <div className="space-y-2">
                    <Label htmlFor="adaptive-generator">Генератор Gmsh</Label>
                    <Select value={adaptiveGenerator} onValueChange={setAdaptiveGenerator}>
                      <SelectTrigger id="adaptive-generator"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delaunay">Delaunay</SelectItem>
                        <SelectItem value="frontal-quad">Frontal-Delaunay for Quads</SelectItem>
                        <SelectItem value="parallelograms">Упаковка параллелограммов</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["Детализация берега, м", adaptiveBoundaryDetail, setAdaptiveBoundaryDetail, 10, 10000],
                      ["Максимум ячеек", adaptiveMaxCells, setAdaptiveMaxCells, 1000, 25000000],
                      ["Тайм-аут Gmsh, мин", adaptiveTimeoutMinutes, setAdaptiveTimeoutMinutes, 1, 120],
                    ] as const).map(([label, value, setter, min, max], index) => (
                      <div key={label} className="space-y-2">
                        <Label htmlFor={`adaptive-${index}`}>{label}</Label>
                        <Input id={`adaptive-${index}`} type="number" min={min} max={max} required
                          value={value} onChange={(event) => setter(Number(event.target.value))} />
                      </div>
                    ))}
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={adaptiveAllowLarge}
                      onChange={(event) => setAdaptiveAllowLarge(event.target.checked)} />
                    Разрешить расчёт сверх оценки лимита ячеек
                  </label>
                </section>
              )}
              {kind === "seabed_validate" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры проверки модели">
                  <h3 className="text-lg font-semibold">3. Проверка модели дна</h3>
                  <div className="space-y-2">
                    <Label htmlFor="validate-isobaths">Контрольные изобаты, м (через запятую)</Label>
                    <Input id="validate-isobaths" value={validationIsobaths} required
                      onChange={(event) => setValidationIsobaths(event.target.value)} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="validate-worst-cells">Число худших ячеек в отчёте</Label>
                      <Input id="validate-worst-cells" type="number" min={1} max={1000} required
                        value={worstCells} onChange={(event) => setWorstCells(Number(event.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="validate-nearest">Предел ближайшей замены, м (0 — автоматически)</Label>
                      <Input id="validate-nearest" type="number" min={0} max={100000} step="any" required
                        value={maxNearestDistance} onChange={(event) => setMaxNearestDistance(Number(event.target.value))} />
                    </div>
                  </div>
                </section>
              )}
              {kind === "seabed_compare_adaptive" && (
                <section className="space-y-4 border-t pt-6" aria-label="Параметры сравнения Gmsh">
                  <h3 className="text-lg font-semibold">3. Сравнение генераторов</h3>
                  <div className="space-y-2 rounded-xl border bg-muted/35 p-4 text-sm">
                    <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => {
                      setCompareLevels("coarse:125:250");
                      setBoundaryDetail(50);
                      setGenerators("delaunay,frontal-quad");
                      setDetailPreset("kizilirmak");
                      setMaxCells(25_000_000);
                      setGeneratorTimeoutMinutes(20);
                      setAllowLarge(false);
                      setArticlePresetApplied("compare");
                    }}>
                      Заполнить как рисунки 6–7: сетки 125–250 м
                    </Button>
                    <p className="text-muted-foreground">
                      Нужны совместимые модель дна, поле размера, контур и паспорта. Расчёт требует Gmsh и значительных ресурсов; совпадение с архивными SVG зависит от входов и версии генератора.
                    </p>
                    {articlePresetApplied === "compare" && (
                      <p role="status">Параметры рисунков 6–7 заполнены. Большой расчёт не разрешён автоматически.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="compare-levels">Контрольные уровни id:min:max, через запятую</Label>
                    <Input id="compare-levels" value={compareLevels} required
                      onChange={(event) => {
                        setCompareLevels(event.target.value);
                        setArticlePresetApplied(null);
                      }} />
                    <p className="text-xs text-muted-foreground">Например: detailed:125:250,coarse:500:1000. До четырёх уровней; размеры в метрах.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["Детализация берега, м", boundaryDetail, setBoundaryDetail, 10, 10000],
                      ["Максимум ячеек", maxCells, setMaxCells, 1000, 25000000],
                      ["Тайм-аут генератора, мин", generatorTimeoutMinutes, setGeneratorTimeoutMinutes, 1, 120],
                    ] as const).map(([label, value, setter, min, max], index) => (
                      <div key={label} className="space-y-2">
                        <Label htmlFor={`compare-${index}`}>{label}</Label>
                        <Input id={`compare-${index}`} type="number" min={min} max={max} required
                          value={value} onChange={(event) => {
                            setter(Number(event.target.value));
                            setArticlePresetApplied(null);
                          }} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="compare-generators">Генераторы Gmsh</Label>
                    <Select value={generators} onValueChange={(value) => {
                      setGenerators(value);
                      setArticlePresetApplied(null);
                    }}>
                      <SelectTrigger id="compare-generators"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delaunay,frontal-quad">Delaunay и Frontal-Delaunay for Quads</SelectItem>
                        <SelectItem value="delaunay">Только Delaunay</SelectItem>
                        <SelectItem value="frontal-quad">Только Frontal-Delaunay for Quads</SelectItem>
                        <SelectItem value="delaunay,frontal-quad,parallelograms">Все три генератора</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="compare-detail-preset">Подробные рисунки сетки</Label>
                    <Select value={detailPreset} onValueChange={(value) => {
                      setDetailPreset(value);
                      setArticlePresetApplied(null);
                    }}>
                      <SelectTrigger id="compare-detail-preset"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kizilirmak">Кызылырмакская коса: окно 4,2 × 2,6 км</SelectItem>
                        <SelectItem value="none">Не строить подробное окно</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Для каждого генератора Go строит обзор и два варианта крупного плана. Если в окне нет ячеек, остаётся обзор.</p>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" checked={allowLarge}
                      onChange={(event) => {
                        setAllowLarge(event.target.checked);
                        setArticlePresetApplied(null);
                      }} />
                    Разрешить расчёт сверх лимита оценки ячеек после проверки ресурсов
                  </label>
                </section>
              )}
            </>
          )}
        </form>

        {isDatasetCalculation && datasetUploadOpen && (
          <DatasetUpload
            onSaved={(dataset) => {
              setDatasets((current) => [dataset, ...current]);
              setDatasetId(dataset.id);
              setMissingRepeatDataset(false);
              setKind("dimension_dataset");
              setDatasetUploadOpen(false);
            }}
          />
        )}
        {uploadField && (
          <ScientificInputUpload key={`${uploadField.field}-${uploadField.existing?.id ?? "new"}`}
            role={uploadField.role} existing={uploadField.existing}
            onPending={(pending) => setScientificInputs((current) =>
              current.some((item) => item.id === pending.id) ? current : [pending, ...current])}
            onSaved={(saved) => {
              setScientificInputs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
              setSelectedScientific((current) => ({ ...current, [uploadField.field]: saved.id }));
              setUploadField(null);
            }}
            onCancel={() => setUploadField(null)} />
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{scenario?.title ?? "Готовим сценарий…"}</span>
            {kind === "erosion" && scenario && (
              <span className="rounded-full bg-warning-background px-2 py-0.5 text-xs text-warning">
                Демо
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Можно иметь до 5 незавершённых расчётов одновременно.
          </p>
        </div>
        <Button
          type="submit"
          form="new-calculation-form"
          disabled={loading || busy || !kinds.length}
          className="sm:min-w-48"
        >
          {busy ? "Ставим в очередь…" : "Запустить расчёт"}
        </Button>
      </footer>
    </DialogContent>
  );
}
