import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  CalculationReportType,
  CalculationKind,
  CreateCalculationDto,
  CalculationKindDto,
  CalculationJobDto,
  DatasetDto,
  CercOptionsDto,
  AINecessityOptionsDto,
  ExpertSetOptionsDto,
  FigureFiveOptionsDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ScientificInputQuotaDto,
  ScientificInputRole,
} from "@litora/contracts";
import { calculationReports, dimensionReports, adaptiveComparisonReports, findCalculationReport, findSeabedReport, seabedReports, calculationParameterCombinationError, calculationNumericParameters, calculationTextParameters, resolveNumericCalculationParameter, resolveTextCalculationParameter, aiNecessityDefaults, expertSetDefaults, figureFiveDefaults, optionalScientificInputRequirements, scientificInputRequirements } from "@litora/contracts";
import { defaultCoastlineDataset, defaultCoastlineExample, findSavedExample } from "@litora/generated-data";
import { Database, FilePlus2, X } from "lucide-react";
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
import { groupDatasets } from "./model/dataset-groups";
import { DatasetUpload } from "./ui/dataset-upload";
import { ScientificInputUpload } from "./ui/scientific-input-upload";
import { CercCalibrationFields } from "./ui/cerc-calibration-fields";
import { CalculationFormSection } from "./ui/calculation-form-section";
import { CalculationResultSection } from "./ui/calculation-result-section";
import { CalculationScenarioHelp } from "./ui/calculation-scenario-help";
import { CercSiteParameters } from "./ui/cerc-site-parameters";
import { NumericCalculationInput } from "./ui/numeric-calculation-input";
import { CalculationParameterHint } from "./ui/calculation-parameter-hint";
import { createAllFormValues, createCalibrationFormValues, createCercFormValues, initialAdaptiveParameters, initialNumericParameter, initialNumericParameters, initialTextParameter, numericInputValue } from "./model/calculation-form-parameters";
import type { AllFormValues, CalibrationFormValues, CercFormValues, FullFormValues } from "./model/calculation-form-parameters";
import { scientificRoleLabels } from "./model/scientific-role-labels";
import { seabedWorkflows, workflowInputs, workflowReportType, type SeabedWorkflowId } from "./model/seabed-workflows";
import { CalculationReportPicker } from "./ui/calculation-report-picker";
import { SeabedReportPicker } from "./ui/seabed-report-picker";
import { CoastlineRegionPicker, type RegionFields } from "./ui/coastline-region-picker";
import type { CoastlineContinuation } from "./model/coastline-continuation";
import { awaitDatasetValidation, useCoastlineValidation, validationPassed } from "./model/use-coastline-validation";
import { CoastlineValidationPanel } from "./ui/coastline-validation-panel";

const calculationFormId = "new-calculation-form";

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

function quotaSize(bytes: number) {
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat("ru-RU").format(bytes)} байт`;
  const unit = bytes < 1024 ** 3 ? "МиБ" : "ГиБ";
  const divisor = bytes < 1024 ** 3 ? 1024 ** 2 : 1024 ** 3;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(bytes / divisor)} ${unit}`;
}

export function NewCalculationDialog({
  repeatJobId,
  workflow,
  sourceJobId,
  coastlineContinuation,
  initialDatasetId,
  initialRegionSourceId,
  onOpenChange,
  onRestoreFocus,
}: {
  repeatJobId?: string;
  workflow?: SeabedWorkflowId;
  sourceJobId?: string;
  coastlineContinuation?: CoastlineContinuation;
  initialDatasetId?: string;
  initialRegionSourceId?: string;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
}) {
  const navigate = useNavigate();
  const [kinds, setKinds] = useState<CalculationKindDto[]>([]);
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [scientificInputs, setScientificInputs] = useState<ScientificInputDto[]>([]);
  const [scientificQuota, setScientificQuota] = useState<ScientificInputQuotaDto | null>(null);
  const [scientificQuotaLoading, setScientificQuotaLoading] = useState(true);
  const [reusableArtifacts, setReusableArtifacts] = useState<ReusableScientificArtifactDto[]>([]);
  const [selectedScientific, setSelectedScientific] = useState<Record<string, string>>({});
  const [uploadField, setUploadField] = useState<{ field: string; role: ScientificInputRole; existing?: ScientificInputDto } | null>(null);
  const [reportType, setReportType] = useState<CalculationReportType>("coastline_box_counting");
  const [kind, setKind] = useState<CalculationKind>("dimension");
  const [regionBounds, setRegionBounds] = useState<RegionFields>({ west: "27", south: "40.5", east: "42.5", north: "47.5" });
  const [datasetId, setDatasetId] = useState("");
  const [datasetSelectOpen, setDatasetSelectOpen] = useState(false);
  const [scenarioHelpOpen, setScenarioHelpOpen] = useState(false);
  const [erosionFileOptions, setErosionFileOptions] = useState<CercFormValues>(createCercFormValues);
  const [allFileOptions, setAllFileOptions] = useState<AllFormValues>(createAllFormValues);
  const [calibrationOptions, setCalibrationOptions] = useState<CalibrationFormValues>(createCalibrationFormValues);
  const [calibrationResolution, setCalibrationResolution] = useState("");
  const [auditValidationStart, setAuditValidationStart] = useState("");
  const [meshCellSizes, setMeshCellSizes] = useState(() => initialTextParameter("mesh", "cellSizes"));
  const [meshBoundaryDetails, setMeshBoundaryDetails] = useState(() => initialTextParameter("mesh", "boundaryDetails"));
  const [meshGenerators, setMeshGenerators] = useState(() => initialTextParameter("mesh", "generators"));
  const [meshMaxCells, setMeshMaxCells] = useState<number | undefined>(() => initialNumericParameter("mesh", "maxCells"));
  const [meshTimeoutMinutes, setMeshTimeoutMinutes] = useState<number | undefined>(() => initialNumericParameter("mesh", "generatorTimeoutMinutes"));
  const [meshAllowLarge, setMeshAllowLarge] = useState(false);
  const [buildParameters, setBuildParameters] = useState<Record<string, number | undefined>>(() => initialNumericParameters("seabed_build"));
  const [recoverWgs84, setRecoverWgs84] = useState(true);
  const [buildAllowLarge, setBuildAllowLarge] = useState(false);
  const [isobaths, setIsobaths] = useState(() => initialTextParameter("seabed_render", "isobaths"));
  const [verticalExaggeration, setVerticalExaggeration] = useState<number | undefined>(() => initialNumericParameter("seabed_render", "verticalExaggeration"));
  const [controlPoints, setControlPoints] = useState(true);
  const [adaptSizes, setAdaptSizes] = useState<Record<string, string>>(initialAdaptiveParameters);
  const [adaptiveGenerator, setAdaptiveGenerator] = useState(() => initialTextParameter("seabed_generate_adaptive", "generator"));
  const [adaptiveBoundaryDetail, setAdaptiveBoundaryDetail] = useState<number | undefined>(() => initialNumericParameter("seabed_generate_adaptive", "boundaryDetail"));
  const [adaptiveMaxCells, setAdaptiveMaxCells] = useState<number | undefined>(() => initialNumericParameter("seabed_generate_adaptive", "maxCells"));
  const [adaptiveTimeoutMinutes, setAdaptiveTimeoutMinutes] = useState<number | undefined>(() => initialNumericParameter("seabed_generate_adaptive", "generatorTimeoutMinutes"));
  const [adaptiveAllowLarge, setAdaptiveAllowLarge] = useState(false);
  const [validationIsobaths, setValidationIsobaths] = useState(() => initialTextParameter("seabed_validate", "isobaths"));
  const [worstCells, setWorstCells] = useState<number | undefined>(() => initialNumericParameter("seabed_validate", "worstCells"));
  const [maxNearestDistance, setMaxNearestDistance] = useState<number | undefined>(() => initialNumericParameter("seabed_validate", "maxNearestDistance"));
  const [fullOptions, setFullOptions] = useState<FullFormValues>(() => ({
    ...initialNumericParameters("seabed_check_full"),
    generator: initialTextParameter("seabed_check_full", "generator"),
    isobaths: initialTextParameter("seabed_check_full", "isobaths"), controlPoints: true,
  }));
  const [compareLevels, setCompareLevels] = useState(() => initialTextParameter("seabed_compare_adaptive", "levels"));
  const [boundaryDetail, setBoundaryDetail] = useState<number | undefined>(() => initialNumericParameter("seabed_compare_adaptive", "boundaryDetail"));
  const [generators, setGenerators] = useState(() => initialTextParameter("seabed_compare_adaptive", "generators"));
  const [detailPreset, setDetailPreset] = useState(() => initialTextParameter("seabed_compare_adaptive", "detailPreset"));
  const [maxCells, setMaxCells] = useState<number | undefined>(() => initialNumericParameter("seabed_compare_adaptive", "maxCells"));
  const [generatorTimeoutMinutes, setGeneratorTimeoutMinutes] = useState<number | undefined>(() => initialNumericParameter("seabed_compare_adaptive", "generatorTimeoutMinutes"));
  const [allowLarge, setAllowLarge] = useState(false);
  const [expertOptions, setExpertOptions] = useState<ExpertSetOptionsDto>(expertSetDefaults);
  const [figureFiveOptions, setFigureFiveOptions] = useState<FigureFiveOptionsDto>(figureFiveDefaults);
  const [aiOptions, setAIOptions] = useState<Partial<AINecessityOptionsDto>>(aiNecessityDefaults);
  const [articlePresetApplied, setArticlePresetApplied] = useState<"adapt" | "compare" | "figure-five" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const launchController = useRef<AbortController | null>(null);
  useEffect(() => () => launchController.current?.abort(), []);
  const [deletingInputId, setDeletingInputId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [repeatError, setRepeatError] = useState("");
  const [missingRepeatInputs, setMissingRepeatInputs] = useState<string[]>([]);
  const [missingRepeatDataset, setMissingRepeatDataset] = useState(false);
  const repeatApplied = useRef(false);
  const workflowApplied = useRef(false);
  const continuationApplied = useRef(false);
  const datasetApplied = useRef(false);
  const [workflowSource, setWorkflowSource] = useState<CalculationJobDto | null>(null);
  const [workflowNote, setWorkflowNote] = useState("");
  const [workflowError, setWorkflowError] = useState("");
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
    const storedReport = findCalculationReport(original.kind, input.reportType) ?? calculationReports.find((item) => item.kinds.some((allowed) => allowed === original.kind));
    if (storedReport) setReportType(storedReport.type);
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
      const optional = optionalScientificInputRequirements[original.kind as keyof typeof optionalScientificInputRequirements];
      const selected: Record<string, string> = {};
      const missing: string[] = [];
      for (const [field, role] of Object.entries({ ...requirements, ...optional })) {
        const id = input[field];
        if (Object.hasOwn(optional ?? {}, field) && id === undefined) continue;
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
      case "coastline_region":
        setRegionBounds({ west: String(input.west ?? 27), south: String(input.south ?? 40.5), east: String(input.east ?? 42.5), north: String(input.north ?? 47.5) });
        break;
      case "erosion_file":
      case "all_file": {
        const restoreCerc = (current: CercFormValues) => {
          const next = { ...current };
          for (const key of ["steps", "breakingIndex", "bermHeight", "closureDepth", "porosity",
            "cercCoefficient", "offshoreSampleDistance", "maxShorelineChange", "maxBathymetryGap",
            "leftBoundaryTransport", "rightBoundaryTransport"] as const) {
            const value = input[key];
            if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
          }
          if (typeof input.outputCsv === "boolean") next.outputCsv = input.outputCsv;
          if (input.csvFormat === "long" || input.csvFormat === "wide") next.csvFormat = input.csvFormat;
          if (typeof input.outputGif === "boolean") next.outputGif = input.outputGif;
          if (typeof input.gifFps === "number" && Number.isFinite(input.gifFps)) next.gifFps = input.gifFps;
          if (typeof input.gifSkip === "number" && Number.isFinite(input.gifSkip)) next.gifSkip = input.gifSkip;
          if (typeof input.svgMaxFrames === "number" && Number.isFinite(input.svgMaxFrames)) next.svgMaxFrames = input.svgMaxFrames;
          return next;
        };
        if (original.kind === "erosion_file") setErosionFileOptions(restoreCerc);
        else {
          const restoreAll = (current: AllFormValues) => {
            const next = { ...current, ...restoreCerc(current) };
            if (typeof input.modelMaxPoints === "number" && Number.isFinite(input.modelMaxPoints)) next.modelMaxPoints = input.modelMaxPoints;
            if (typeof input.noModelSimplify === "boolean") next.noModelSimplify = input.noModelSimplify;
            return next;
          };
          setAllFileOptions(restoreAll);
        }
        break;
      }
      case "calibrate_cerc": {
        const resolution = input.bathymetryResolution;
        if (typeof resolution === "number" && Number.isFinite(resolution))
          setCalibrationResolution(String(resolution));
        setCalibrationOptions((current) => {
          const next = { ...current };
          for (const key of Object.keys(current) as (keyof typeof current)[]) {
            const value = input[key];
            if (key === "cercCoefficients") {
              if (typeof value === "string") next.cercCoefficients = value;
            } else if (typeof value === "number" && Number.isFinite(value)) {
              next[key] = value;
            }
          }
          return next;
        });
        break;
      }
      case "shoreline_data_audit":
        if (typeof input.validationStart === "string") setAuditValidationStart(input.validationStart);
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
      case "seabed_check_full":
        setFullOptions((current) => {
          const next = { ...current };
          for (const key of ["targetEdge", "boundaryDetail", "maxSourceDistance", "coastTransition", "verticalExaggeration"] as const) {
            const value = input[key];
            if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
          }
          if (input.generator === "delaunay" || input.generator === "frontal-quad" || input.generator === "parallelograms") next.generator = input.generator;
          if (typeof input.isobaths === "string") next.isobaths = input.isobaths;
          if (typeof input.controlPoints === "boolean") next.controlPoints = input.controlPoints;
          return next;
        });
        break;
      case "seabed_compare_adaptive":
        string("levels", setCompareLevels);
        number("boundaryDetail", setBoundaryDetail);
        string("generators", setGenerators);
        string("detailPreset", setDetailPreset);
        number("maxCells", setMaxCells);
        number("generatorTimeoutMinutes", setGeneratorTimeoutMinutes);
        boolean("allowLarge", setAllowLarge);
        setExpertOptions({
          generateExpertSet: input.generateExpertSet === true,
          expertLevels: typeof input.expertLevels === "string" ? input.expertLevels : expertSetDefaults.expertLevels,
          expertSeed: typeof input.expertSeed === "string" ? input.expertSeed : expertSetDefaults.expertSeed,
        });
        setFigureFiveOptions({
          generateFigureFive: input.generateFigureFive === true,
          figureFiveLevel: typeof input.figureFiveLevel === "string" ? input.figureFiveLevel : figureFiveDefaults.figureFiveLevel,
          figureFiveGenerator: input.figureFiveGenerator === "delaunay" || input.figureFiveGenerator === "frontal-quad" || input.figureFiveGenerator === "parallelograms"
            ? input.figureFiveGenerator : figureFiveDefaults.figureFiveGenerator,
        });
        break;
      case "seabed_assess_ml":
        setAIOptions((current) => {
          const next = { ...current };
          for (const key of Object.keys(aiNecessityDefaults) as (keyof AINecessityOptionsDto)[]) {
            const value = input[key];
            if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
          }
          return next;
        });
        break;
    }
  }, []);

  const selectWorkflow = useCallback((
    selected: SeabedWorkflowId,
    source: CalculationJobDto | null,
    inputs: ScientificInputDto[],
    artifacts: ReusableScientificArtifactDto[],
  ) => {
    const scenario = seabedWorkflows.find((item) => item.id === selected)!;
    setKind(scenario.kind);
    const nextReport = workflowReportType(selected);
    if (nextReport) setReportType(nextReport);
    setSelectedScientific(workflowInputs(selected, source, inputs, artifacts));
    setMissingRepeatDataset(false);
    setMissingRepeatInputs([]);
    setDatasetUploadOpen(false);
    setUploadField(null);
    setArticlePresetApplied(null);
    setSubmitError("");
    if (scenario.kind === "seabed_render") {
      setIsobaths(initialTextParameter("seabed_render", "isobaths"));
      setVerticalExaggeration(initialNumericParameter("seabed_render", "verticalExaggeration"));
      setControlPoints(true);
    } else if (scenario.kind === "seabed_adapt") {
      setAdaptSizes(initialAdaptiveParameters());
    }
    setWorkflowNote(`${scenario.title}. ${source?.status === "succeeded" && !source.deletionRequestedAt
      ? "Совместимые файлы исходного расчёта подставлены. Проверьте выбор и заполните недостающие входы."
      : "Выберите входные файлы ниже."} Параметры можно изменить перед запуском.`);
  }, []);

  useEffect(() => {
    let mounted = true;
    const repeat = repeatJobId
      ? api.calculation(repeatJobId)
        .then((job) => ({ job, error: "" }))
        .catch((error: unknown) => ({ job: null, error: errorMessage(error) }))
      : Promise.resolve({ job: null, error: "" });
    void Promise.all([
      api.calculationKinds({ includeUnavailable: true }).then((items) => items.filter((item) =>
        item.selectable !== false && item.kind !== "erosion" && item.kind !== "all_demo"
      )), api.datasets(), api.scientificInputs(),
      api.scientificInputQuota().catch(() => null), api.reusableScientificArtifacts(), repeat,
      workflow && sourceJobId
        ? api.calculation(sourceJobId).then((job) => ({ job, error: "" }))
          .catch((error: unknown) => ({ job: null, error: errorMessage(error) }))
        : Promise.resolve({ job: null, error: "" }),
    ])
      .then(([nextKinds, nextDatasets, nextScientific, nextQuota, nextArtifacts, original, source]) => {
        if (!mounted) return;
        setKinds(nextKinds);
        setDatasets(nextDatasets);
        setScientificInputs(nextScientific);
        setScientificQuota(nextQuota);
        setReusableArtifacts(nextArtifacts);
        setWorkflowSource(source.job);
        setKind((current) =>
          nextKinds.some((item) => item.kind === current && item.available !== false)
            ? current
            : (nextKinds.find((item) => item.available !== false)?.kind ?? nextKinds[0]?.kind ?? current)
        );
        setLoadError("");
        if (initialRegionSourceId !== undefined && !continuationApplied.current && !repeatJobId) {
          continuationApplied.current = true;
          setKind("coastline_region");
          const selected = nextScientific.find((item) => item.id === initialRegionSourceId && item.role === "coastline_geojson" && item.status === "ready");
          if (selected) {
            setSelectedScientific({ coastlineInputId: selected.id });
            setWorkflowNote("Выбран сохранённый полный исходник. Задайте область; выделение не повышает точность исходных данных.");
          } else {
            setMissingRepeatInputs(["coastlineInputId"]);
            setWorkflowNote("Выбранный исходник недоступен. Выберите свой файл или явно разрешите встроенный контур.");
          }
        }
        if (initialDatasetId && !datasetApplied.current && !repeatJobId) {
          datasetApplied.current = true;
          setKind("dimension_dataset");
          const selected = nextDatasets.find((item) => item.id === initialDatasetId);
          setDatasetId(selected?.id ?? "");
          setMissingRepeatDataset(!selected);
        }
        if (original.error) setRepeatError(`Не удалось открыть исходный расчёт: ${original.error}`);
        else setRepeatError("");
        if (initialRegionSourceId !== undefined && !nextKinds.some((item) => item.kind === "coastline_region" && item.available !== false))
          setRepeatError("Выделение области сейчас отключено на сервере.");
        if (coastlineContinuation && !continuationApplied.current && !repeatJobId) {
          continuationApplied.current = true;
          setKind(coastlineContinuation.kind);
          const artifact = nextArtifacts.find((item) => item.id === coastlineContinuation.artifactId && item.jobId === coastlineContinuation.sourceJobId && item.role === "coastline_geojson");
          if (!nextKinds.some((item) => item.kind === coastlineContinuation.kind && item.available !== false)) setRepeatError("Этот сценарий сейчас отключён на сервере.");
          else if (!artifact) setRepeatError("Выбранная линия недоступна. Выберите другой собственный файл явно.");
          else {
            setSelectedScientific({ coastlineInputId: artifact.id });
            setWorkflowNote("Выделенная береговая линия подставлена. Для CERC выберите совместимые волны и батиметрию этого участка; расчёт запускается только после проверки формы.");
          }
        }
        setWorkflowError(source.error ? `Не удалось открыть исходный расчёт: ${source.error}` :
          source.job && (source.job.status !== "succeeded" || source.job.deletionRequestedAt)
            ? "Исходный расчёт не завершён успешно или удаляется. Выберите доступные файлы вручную."
            : "");
        if (workflow && !workflowApplied.current && !repeatJobId) {
          const target = seabedWorkflows.find((item) => item.id === workflow)!;
          if (nextKinds.some((item) => item.kind === target.kind && item.available !== false)) {
            workflowApplied.current = true;
            selectWorkflow(workflow, source.job, nextScientific, nextArtifacts);
          } else {
            setKind(target.kind);
            setWorkflowError("Этот расчёт дна отключён на сервере. Доступность настраивает администратор вычислительного окружения.");
          }
        }
        if (original.job && !repeatApplied.current) {
          if (original.job.kind === "erosion" || original.job.kind === "all_demo") {
            repeatApplied.current = true;
            const ownKind = original.job.kind === "erosion" ? "erosion_file" : "all_file";
            if (nextKinds.some((item) => item.kind === ownKind && item.available !== false)) setKind(ownKind);
            setRepeatError("Повтор демонстрационного расчёта недоступен. Его параметры не перенесены. Для нового исследования выберите свои входные данные и проверьте параметры участка.");
          } else if (!nextKinds.some((item) => item.kind === original.job.kind)) {
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
        if (mounted) {
          setLoadError(errorMessage(nextError));
          setScientificQuota(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
          setScientificQuotaLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [revision, repeatJobId, applyStoredCalculation, workflow, sourceJobId, selectWorkflow, coastlineContinuation, initialDatasetId, initialRegionSourceId]);

  function reload() {
    setLoading(true);
    setLoadError("");
    setScientificQuotaLoading(true);
    setRevision((value) => value + 1);
  }

  async function refreshScientificQuota() {
    setScientificQuotaLoading(true);
    try {
      setScientificQuota(await api.scientificInputQuota());
    } catch {
      setScientificQuota(null);
    } finally {
      setScientificQuotaLoading(false);
    }
  }

  async function deletePendingInput(id: string) {
    setDeletingInputId(id);
    setSubmitError("");
    try {
      await api.deletePendingScientificInput(id);
      setScientificInputs((current) => current.filter((item) => item.id !== id));
      void refreshScientificQuota();
      setUploadField((current) => current?.existing?.id === id ? null : current);
    } catch (nextError) {
      setSubmitError(errorMessage(nextError));
    } finally {
      setDeletingInputId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (kind === "erosion" || kind === "all_demo") return;
    if (readinessIssues.length > 0) {
      setSubmitError(readinessIssues.join(" "));
      return;
    }
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
    const optional = optionalScientificInputRequirements[kind as keyof typeof optionalScientificInputRequirements];
    if (optional) {
      for (const field of Object.keys(optional)) {
        if (missingRepeatInputs.includes(field) && !selectedScientific[field]) {
          setSubmitError(kind === "coastline_region" ? "Исходный контур недоступен. Выберите замену или явно включите встроенный контур." : "Исходный индексный профиль больше недоступен. Выберите замену или явно уберите профиль.");
          return;
        }
        if (selectedScientific[field]) scientificParameters[field] = selectedScientific[field];
      }
    }
    if (validationBlocked) {
      setSubmitError("Дождитесь успешной проверки геометрии Go или загрузите исправленный файл.");
      return;
    }
    const launch = new AbortController();
    launchController.current?.abort();
    launchController.current = launch;
    setBusy(true);
    setSubmitError("");
    try {
      let selectedDatasetId = datasetId;
      if (kind === "dimension_dataset" && !selectedDatasetId) {
        const existingExample = findSavedExample(datasets, defaultCoastlineExample);
        if (existingExample) {
          selectedDatasetId = existingExample.id;
        } else {
          if (datasets.length >= 100) {
            throw new Error("Лимит наборов достигнут. Выберите уже сохранённый набор для расчёта.");
          }
          const example = await api.createDataset(defaultCoastlineDataset);
          setDatasets((current) => [example, ...current]);
          setDatasetId(example.id);
          selectedDatasetId = example.id;
        }
      }
      if (kind === "dimension_dataset") {
        setDatasetId(selectedDatasetId);
        await awaitDatasetValidation(selectedDatasetId, launch.signal, (validation) => {
          setDatasets((current) => current.map((dataset) => dataset.id === selectedDatasetId ? { ...dataset, validation } : dataset));
        });
      }
      if (launch.signal.aborted) return;
      const job = await api.createCalculation({
        kind,
        input: {
          ...scientificParameters,
          ...parameterValues,
          ...(kind === "dimension_dataset" ? { datasetId: selectedDatasetId } : {}),
        },
      });
      onOpenChange(false);
      navigate(`/lab/calculations/${job.id}`);
    } catch (nextError) {
      if (!launch.signal.aborted) setSubmitError(errorMessage(nextError));
    } finally {
      if (!launch.signal.aborted) setBusy(false);
    }
  }

  function applyArticleComparisonPreset(withFigureFive: boolean) {
    setCompareLevels("coarse:125:250");
    setBoundaryDetail(50);
    setGenerators("delaunay,frontal-quad");
    setDetailPreset("kizilirmak");
    setMaxCells(25_000_000);
    setGeneratorTimeoutMinutes(20);
    setAllowLarge(false);
    if (withFigureFive) {
      setExpertOptions((current) => ({ ...current, generateExpertSet: true, expertLevels: "coarse" }));
      setFigureFiveOptions({ generateFigureFive: true, figureFiveLevel: "coarse", figureFiveGenerator: "delaunay" });
    }
    setArticlePresetApplied(withFigureFive ? "figure-five" : "compare");
  }

  const scenario = kinds.find((item) => item.kind === kind);
  const isAllKind = kind === "all_file";
  const isCercKind = kind === "erosion_file" || isAllKind;
  const cercOptions: CercFormValues = isAllKind ? allFileOptions : erosionFileOptions;
  const updateCercOptions = (patch: Partial<CercFormValues>) => {
    if (isAllKind) setAllFileOptions((current) => ({ ...current, ...patch }));
    else setErosionFileOptions((current) => ({ ...current, ...patch }));
  };
  const allOptions = allFileOptions;
  const updateAllOptions = setAllFileOptions;
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const isDatasetCalculation = kind === "dimension_dataset";
  const selectedCoastline = scientificInputs.find((input) => input.id === selectedScientific.coastlineInputId && input.role === "coastline_geojson" && input.status === "ready");
  const datasetValidation = useCoastlineValidation("dataset", isDatasetCalculation ? selectedDataset?.id ?? "" : "", selectedDataset?.validation);
  const scientificValidation = useCoastlineValidation("scientific", selectedCoastline?.id ?? "", selectedCoastline?.validation);
  const validationBlocked = Boolean((isDatasetCalculation && selectedDataset && !validationPassed(datasetValidation.state)) ||
    (selectedCoastline && !validationPassed(scientificValidation.state)));
  const scientificRequirements = scientificInputRequirements[kind as keyof typeof scientificInputRequirements];
  const optionalScientificRequirements = optionalScientificInputRequirements[kind as keyof typeof optionalScientificInputRequirements];
  const scientificFields = scientificRequirements
    ? Object.entries({ ...scientificRequirements, ...optionalScientificRequirements }) as [string, ScientificInputRole][]
    : [];
  const hasAllFileIndexedProfile = kind === "all_file" &&
    Object.keys(optionalScientificRequirements ?? {}).some((field) => Boolean(selectedScientific[field]));
  const scenarioAvailable = Boolean(scenario && scenario.available !== false);
  const unavailableKinds = kinds.filter((item) => item.available === false);
  const selectedReport = findCalculationReport(kind, reportType) ?? calculationReports.find((item) => item.kinds.some((allowed) => allowed === kind));
  const selectedSeabedReport = findSeabedReport(kind, reportType) ?? seabedReports.find((item) => item.kind === kind);
  const isDimension = kind === "dimension" || kind === "dimension_dataset" || kind === "dimension_file";
  const reportKinds = kinds.filter((item) => item.kind === "seabed_render" || item.kind === "seabed_adapt");
  const parameterValues: NonNullable<CreateCalculationDto["input"]> = {
    ...(kind === "coastline_region" ? Object.fromEntries(Object.entries(regionBounds).map(([key, value]) => [key, numericInputValue(value)])) : {}),
    ...(kind === "erosion_file" ? erosionFileOptions : {}),
    ...(kind === "all_file" ? allFileOptions : {}),
    ...(kind === "calibrate_cerc" ? { ...calibrationOptions, bathymetryResolution: numericInputValue(calibrationResolution) } : {}),
    ...(isDimension ? { reportType: selectedReport?.type } : {}),
    ...(kind === "shoreline_data_audit" && auditValidationStart ? { validationStart: auditValidationStart } : {}),
    ...(kind === "mesh" ? {
      cellSizes: meshCellSizes, boundaryDetails: meshBoundaryDetails,
      generators: meshGenerators, maxCells: meshMaxCells,
      allowLarge: meshAllowLarge, generatorTimeoutMinutes: meshTimeoutMinutes,
    } : {}),
    ...(kind === "seabed_build" ? {
      ...buildParameters, recoverWgs84, allowLarge: buildAllowLarge,
    } : {}),
    ...(kind === "seabed_render" ? {
      reportType: selectedReport?.type, isobaths, verticalExaggeration, controlPoints,
    } : {}),
    ...(kind === "seabed_adapt" ? { reportType: selectedReport?.type, ...Object.fromEntries(
      Object.entries(adaptSizes)
        .filter(([, value]) => value !== "")
        .map(([key, value]) => [key, numericInputValue(value)])
    ) } : {}),
    ...(kind === "seabed_generate_adaptive" ? {
      generator: adaptiveGenerator, boundaryDetail: adaptiveBoundaryDetail,
      maxCells: adaptiveMaxCells, allowLarge: adaptiveAllowLarge,
      generatorTimeoutMinutes: adaptiveTimeoutMinutes,
    } : {}),
    ...(kind === "seabed_validate" ? {
      isobaths: validationIsobaths, worstCells, maxNearestDistance,
    } : {}),
    ...(kind === "seabed_check_full" ? fullOptions : {}),
    ...(kind === "seabed_compare_adaptive" ? {
      reportType: selectedReport?.type,
      boundaryDetail, generators, levels: compareLevels, detailPreset,
      maxCells, allowLarge, generatorTimeoutMinutes,
      generateExpertSet: expertOptions.generateExpertSet,
      ...(expertOptions.generateExpertSet ? {
        expertLevels: expertOptions.expertLevels,
        expertSeed: expertOptions.expertSeed,
        ...(figureFiveOptions.generateFigureFive ? {
          generateFigureFive: true,
          figureFiveLevel: figureFiveOptions.figureFiveLevel,
          figureFiveGenerator: figureFiveOptions.figureFiveGenerator,
        } : {}),
      } : {}),
    } : {}),
    ...(kind === "seabed_assess_ml" ? aiOptions : {}),
  };
  const readinessIssues: string[] = [];
  if (!scenarioAvailable) readinessIssues.push(scenario?.unavailableReason ?? "Выберите доступный тип расчёта.");
  for (const [field, role] of Object.entries(scientificRequirements ?? {})) {
    if (!selectedScientific[field]) readinessIssues.push(`Выберите вход: ${scientificRoleLabels[role]}.`);
  }
  if (isDatasetCalculation && missingRepeatDataset)
    readinessIssues.push("Исходный набор данных недоступен. Выберите замену явно.");
  if (missingRepeatInputs.some((field) => !selectedScientific[field] && Object.hasOwn(optionalScientificRequirements ?? {}, field)))
    readinessIssues.push("Недоступный необязательный вход нужно явно заменить или исключить.");
  if (validationBlocked) readinessIssues.push("Требуется успешная проверка геометрии Go.");
  const resolvedParameters: Record<string, unknown> = { ...parameterValues };
  let numericParametersValid = true;
  for (const field of Object.keys(calculationNumericParameters[kind] ?? {})) {
    try { resolvedParameters[field] = resolveNumericCalculationParameter(kind, field, parameterValues[field]); }
    catch (error) {
      numericParametersValid = false;
      if (error instanceof Error) readinessIssues.push(error.message);
    }
  }
  for (const field of Object.keys(calculationTextParameters[kind] ?? {})) {
    try { resolvedParameters[field] = resolveTextCalculationParameter(kind, field, parameterValues[field]); }
    catch (error) {
      numericParametersValid = false;
      if (error instanceof Error) readinessIssues.push(error.message);
    }
  }
  if (numericParametersValid) {
    const error = calculationParameterCombinationError(kind, resolvedParameters);
    if (error) readinessIssues.push(error);
  }
  const hasParameters = isCercKind || kind.startsWith("seabed_") ||
    kind === "mesh" || kind === "coastline_region" || kind === "calibrate_cerc" || kind === "shoreline_data_audit";

  return (
    <DialogContent
      aria-modal="true"
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-clip p-0"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}
      onEscapeKeyDown={(event) => {
        if (busy || scenarioHelpOpen) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (busy || scenarioHelpOpen) event.preventDefault();
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
                  : "Выберите сценарий и входные данные."}
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
            {repeatError} Можно заполнить новую форму вручную.{" "}
            <Link to="/lab/datasets" className="underline">Выбрать или подготовить данные</Link>
          </p>
        )}

        {workflowError && <p role="alert" className="rounded-xl border border-destructive bg-status-failed-background p-4 text-sm text-status-failed">{workflowError}</p>}

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

        {/* Поля связаны с формой явно: загрузки в секции данных имеют собственные формы. */}
        <form id={calculationFormId} onSubmit={(event) => void submit(event)} />
        <div className="space-y-6" aria-busy={busy}>
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
                    1. Тип расчёта
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {scenarioAvailable ? "Доступен" : "Недоступен"}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="calculation-kind">Что рассчитать</Label>
                  <div className="flex items-start gap-2">
                    <Select
                      value={selectedSeabedReport ? "seabed_reports" : kind}
                      disabled={busy || !kinds.length}
                      onValueChange={(value) => {
                        if (value === "seabed_reports") {
                          const report = seabedReports.find((item) => kinds.some((scenario) => scenario.kind === item.kind && scenario.available !== false));
                          if (!report) return;
                          setKind(report.kind);
                          setReportType(report.type);
                        } else {
                          if (!kinds.some((item) => item.kind === value && item.available !== false)) return;
                          setKind(value as CalculationKind);
                        }
                        setScenarioHelpOpen(false);
                        setArticlePresetApplied(null);
                        setWorkflowNote("");
                        setWorkflowError("");
                        setSelectedScientific({});
                        setMissingRepeatDataset(false);
                        setMissingRepeatInputs([]);
                        setDatasetUploadOpen(false);
                        setUploadField(null);
                        setAuditValidationStart("");
                      }}
                    >
                      <SelectTrigger
                        id="calculation-kind"
                        className="min-w-0 flex-1"
                        aria-label="Что рассчитать"
                        aria-describedby={[scenario ? "calculation-kind-description" : "", unavailableKinds.length > 0 ? "calculation-unavailable" : ""].filter(Boolean).join(" ") || undefined}
                      >
                        <SelectValue placeholder="Выберите сценарий" />
                      </SelectTrigger>
                      <SelectContent>
                        {reportKinds.length > 0 && <SelectItem value="seabed_reports" disabled={!reportKinds.some((item) => item.available !== false)}>Отчёты по модели дна{!reportKinds.some((item) => item.available !== false) ? " · недоступен" : ""}</SelectItem>}
                        {kinds.filter((item) => item.kind !== "seabed_render" && item.kind !== "seabed_adapt").map((item) => (
                          <SelectItem key={item.kind} value={item.kind} disabled={item.available === false}>
                            {item.title}{item.available === false ? " · недоступен" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {scenario && <CalculationScenarioHelp key={scenario.kind} scenario={scenario}
                      open={scenarioHelpOpen} onOpenChange={setScenarioHelpOpen} />}
                  </div>
                  {scenario && <p id="calculation-kind-description" className="text-sm text-muted-foreground">{selectedSeabedReport ? "Выберите представление модели дна, затем исходные файлы и параметры отчёта." : scenario.description}</p>}
                </div>
                {selectedSeabedReport && <SeabedReportPicker value={selectedSeabedReport.type} kinds={kinds} disabled={busy}
                  onChange={(next) => {
                    const report = seabedReports.find((item) => item.type === next)!;
                    setKind(report.kind);
                    setReportType(report.type);
                    setScenarioHelpOpen(false);
                    setArticlePresetApplied(null);
                    setWorkflowNote("");
                    setSubmitError("");
                    setUploadField(null);
                  }}
                  onPrepare={(selected) => selectWorkflow(selected, workflowSource, scientificInputs, reusableArtifacts)} />}
                {isDimension && selectedReport && <div className="mt-4">
                  <CalculationReportPicker id="dimension-report-type" label="Вид отчёта box-counting"
                    options={dimensionReports} value={selectedReport.type} disabled={busy || !scenarioAvailable}
                    onChange={(next) => {
                      const report = findCalculationReport(kind, next);
                      if (report) setReportType(report.type);
                      setSubmitError("");
                    }} />
                </div>}
                {kind === "seabed_compare_adaptive" && selectedReport && <div className="mt-4">
                  <CalculationReportPicker id="comparison-report-type" label="Вид отчёта сравнения сеток"
                    options={adaptiveComparisonReports} value={selectedReport.type} disabled={busy || !scenarioAvailable}
                    onChange={(next) => {
                      const report = findCalculationReport(kind, next);
                      if (!report) return;
                      setReportType(report.type);
                      if (report.type === "adaptive_mesh_windows") setDetailPreset("kizilirmak");
                      if (report.type === "expert_fragment_cards") setExpertOptions((current) => ({ ...current, generateExpertSet: true }));
                      setSubmitError("");
                    }} />
                </div>}
                {workflowNote && <p role="status" className="mt-3 rounded-xl border bg-muted/35 p-4 text-sm">{workflowNote}</p>}
                {unavailableKinds.length > 0 && (
                  <div id="calculation-unavailable" role="status" className="mt-3 space-y-1 rounded-lg border bg-muted/35 p-3 text-sm">
                    {[...new Set(unavailableKinds.map((item) => item.unavailableReason ?? "Этот сценарий отключён на сервере."))].map((reason) => <p key={reason}>{reason}</p>)}
                  </div>
                )}
                {!kinds.some((item) => item.available !== false) && !loadError && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Сейчас нет доступных сценариев для запуска.
                  </p>
                )}
              </section>

              {scenario && (
                <fieldset disabled={busy || !scenarioAvailable} className="min-w-0 space-y-6">
                  <legend className="sr-only">Данные и параметры расчёта</legend>
                  <CalculationFormSection id="calculation-inputs" step={2} title="Исходные данные">
                    {isDatasetCalculation && (
                      <section
                        aria-labelledby="calculation-data-heading"
                        className="space-y-4"
                      >
                        <h4
                          id="calculation-data-heading"
                          className="text-lg font-semibold"
                        >
                          Береговая линия
                        </h4>
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
                              {groupDatasets(datasets).map(({ dataset, records }) => {
                                const option = records.find((item) => item.id === datasetId) ?? dataset;
                                return <SelectItem key={option.id} value={option.id}>
                                  {option.name} · {option.pointCount} точек
                                </SelectItem>
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {selectedDataset?.source ??
                            (findSavedExample(datasets, defaultCoastlineExample)
                              ? "Пример Сочи (OpenStreetMap, ODbL) уже сохранён и будет использован повторно."
                              : "Пример Сочи (OpenStreetMap, ODbL) сохранится в вашем аккаунте при запуске.")}
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
                      <section aria-labelledby="scientific-inputs-heading" className="space-y-4">
                        <div>
                          <h4 id="scientific-inputs-heading" className="text-lg font-semibold">
                            Научные входные файлы
                          </h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Выберите ранее загруженные файлы или сохраните новые. Go проверит их научный формат и совместимость при запуске.
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
                            {scientificQuotaLoading
                              ? "Проверяем расход квоты научных файлов…"
                              : scientificQuota
                                ? `Зарезервировано ${scientificQuota.usedCount} из ${scientificQuota.limitCount} файлов · ${quotaSize(scientificQuota.usedBytes)} из ${quotaSize(scientificQuota.limitBytes)} заявленного объёма. Незавершённые загрузки учитываются.`
                                : "Расход квоты сейчас недоступен. Лимит будет проверен при загрузке."}
                          </p>
                          {(kind === "erosion_file" || kind === "all_file" || kind === "calibrate_cerc") && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Батиметрия — JSON с простым именем файла (латиница, цифры, точка, дефис или подчёркивание) и паспортом, у которого dataset_file и SHA-256 соответствуют этому JSON. Для CSV волн укажите источник в форме загрузки.
                            </p>
                          )}
                          {kind === "calibrate_cerc" && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Наблюдения — массив JSON или объект с полем observations: lat, lon и shoreline_change_rate_m_per_year (м/год); положительное значение означает размыв. Укажите независимый источник и лицензию.
                            </p>
                          )}
                          {kind === "seabed_assess_ml" && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Выберите закрытый ключ и отчёт того же AI-01/ADAPT-03, исходные модель, паспорт и контур, а также заполненный TSV оценок. Go сверит SHA-256; пути из старого задания не используются. Ключ не передавайте экспертам.
                            </p>
                          )}
                          {kind === "coastline_region" && <p className="mt-2 text-sm text-muted-foreground">По умолчанию используется наш полный закреплённый контур. Чтобы выделить область по своим данным, выберите или загрузите GeoJSON ниже.</p>}
                          {optionalScientificRequirements && kind !== "shoreline_data_audit" && kind !== "coastline_region" && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Дополнительные профили CERC необязательны. Их индексы относятся к точкам после нормализации контура в Go: для источника point_index, для сооружения left_point_index. Проверьте порядок и число точек на том же входном GeoJSON. Положительный source_rate_m3_s добавляет наносы, отрицательный удаляет; transmission_coefficient сооружения задаётся от 0 до 1. Каждый элемент требует data_source.
                              {kind === "all_file" && " При выборе профиля упрощение базовой модели выключается: иначе индексы сместятся."}
                            </p>
                          )}
                          {kind === "shoreline_data_audit" && <p className="mt-2 text-sm text-muted-foreground">
                            Выберите ряд датированных контуров. Волновой ряд необязателен, но без него аудит не оценит покрытие волн. Результат не является прогнозом.
                          </p>}
                        </div>
                        {scientificFields.map(([field, role]) => {
                          const isOptional = Object.hasOwn(optionalScientificRequirements ?? {}, field);
                          const options = scientificInputs.filter((item) => item.role === role && item.status === "ready");
                          const artifacts = reusableArtifacts.filter((item) => item.role === role);
                          const pending = scientificInputs.filter((item) => item.role === role && item.status === "pending");
                          const chosenArtifact = artifacts.find((item) => item.id === selectedScientific[field]);
                          return (
                            <div key={field} className="space-y-2 rounded-lg border p-3">
                              <Label htmlFor={`scientific-${field}`}>{scientificRoleLabels[role]}{isOptional ? " · необязательно" : ""}</Label>
                              <Select
                                value={selectedScientific[field] || undefined}
                                onValueChange={(value) => {
                                  setSelectedScientific((current) => ({ ...current, [field]: value }));
                                  setMissingRepeatInputs((current) => current.filter((missing) => missing !== field));
                                  if (isOptional && kind === "all_file")
                                    setAllFileOptions((current) => ({ ...current, modelMaxPoints: 0, noModelSimplify: true }));
                                }}
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
                              {isOptional && selectedScientific[field] && (
                                <Button type="button" variant="ghost" onClick={() => {
                                  setSelectedScientific((current) => {
                                    const next = { ...current };
                                    delete next[field];
                                    return next;
                                  });
                                  setMissingRepeatInputs((current) => current.filter((item) => item !== field));
                                }}>{kind === "coastline_region" ? "Использовать встроенный контур" : kind === "shoreline_data_audit" ? "Без волнового ряда" : "Не использовать этот профиль"}</Button>
                              )}
                              {isOptional && missingRepeatInputs.includes(field) && !selectedScientific[field] && (
                                <Button type="button" variant="ghost" onClick={() =>
                                  setMissingRepeatInputs((current) => current.filter((item) => item !== field))
                                }>{kind === "coastline_region" ? "Продолжить со встроенным контуром" : kind === "shoreline_data_audit" ? "Продолжить без волнового ряда" : "Продолжить без недоступного профиля"}</Button>
                              )}
                              {chosenArtifact && (
                                <p className="text-xs text-muted-foreground">
                                  Файл готового расчёта. <Link className="underline underline-offset-2" to={`/lab/calculations/${chosenArtifact.jobId}`}>
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
                    {!isDatasetCalculation && scientificFields.length === 0 && (
                      <p className="text-sm text-muted-foreground">Используется сохранённый контур MarineRegions из системы. Дополнительные файлы не требуются.</p>
                    )}
                    {isDatasetCalculation && selectedDataset && <CoastlineValidationPanel check={datasetValidation} />}
                    {selectedCoastline && <CoastlineValidationPanel check={scientificValidation} />}

                    {isDatasetCalculation && datasetUploadOpen && (
                      <DatasetUpload
                        existingNames={datasets.map((dataset) => dataset.name)}
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
                        onPending={(pending) => {
                          setScientificInputs((current) =>
                            current.some((item) => item.id === pending.id) ? current : [pending, ...current]);
                          void refreshScientificQuota();
                        }}
                        onSaved={(saved) => {
                          setScientificInputs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
                          setSelectedScientific((current) => ({ ...current, [uploadField.field]: saved.id }));
                          if (kind === "all_file" && Object.hasOwn(optionalScientificRequirements ?? {}, uploadField.field))
                            setAllFileOptions((current) => ({ ...current, modelMaxPoints: 0, noModelSimplify: true }));
                          setUploadField(null);
                        }}
                        onCancel={() => setUploadField(null)} />
                    )}
                  </CalculationFormSection>
                  <CalculationFormSection id="calculation-parameters" step={3} title="Параметры">
                    {isCercKind && (
                      <section
                        aria-labelledby="cerc-parameters-heading"
                        className="space-y-4"
                      >
                        <h4
                          id="cerc-parameters-heading"
                          className="text-lg font-semibold"
                        >
                          Параметры
                        </h4>
                        <div className="mt-4 space-y-2">
                          <Label htmlFor="erosion-steps">
                            Шаги волнового ряда (0–48; 0 — весь ряд)
                          </Label>
                          <NumericCalculationInput kind={kind} parameter="steps"
                            form={calculationFormId}
                            id="erosion-steps"
                            required
                            value={cercOptions.steps}
                            onChange={(event) => {
                              const steps = numericInputValue(event.target.value);
                              updateCercOptions(steps === 0
                                ? { steps, svgMaxFrames: cercOptions.svgMaxFrames || 64, outputGif: false, csvFormat: "long" }
                                : { steps, svgMaxFrames: 0 });
                            }}
                          />
                        </div>
                        {cercOptions.steps === 0 && (
                          <div className="mt-4 space-y-2 rounded-xl border bg-muted/35 p-4">
                            <Label htmlFor="erosion-svg-max-frames">Максимум SVG эрозии (2–128)</Label>
                            <NumericCalculationInput kind={kind} parameter="svgMaxFrames" form={calculationFormId} id="erosion-svg-max-frames" min={2} required
                              value={cercOptions.svgMaxFrames}
                              onChange={(event) => updateCercOptions({ svgMaxFrames: numericInputValue(event.target.value) })} />
                            <p className="text-xs text-muted-foreground">
                              Go рассчитает все состояния загруженного ряда и сохранит полный численный JSON. SVG будут выбраны равномерно, включая первый и последний шаг. Лимит запуска — 10 000 состояний и 200 точек берега; GIF и широкий CSV недоступны. Длительный расчёт может превысить время или объём хранилища.
                            </p>
                          </div>
                        )}
                        <CercSiteParameters kind={isAllKind ? "all_file" : "erosion_file"} values={cercOptions} prefix="erosion" formId={calculationFormId} onChange={updateCercOptions} />
                        <Collapsible defaultOpen={Boolean(repeatJobId)} className="mt-5 space-y-3">
                          <CollapsibleTrigger asChild>
                            <Button type="button" variant="outline">Экспорт и численные ограничения</Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-4 rounded-xl border p-4">
                            <p className="text-sm text-muted-foreground">
                              Расчёт по своим данным без независимой калибровки не является прогнозом размыва.
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="erosion-maxShorelineChange">Предел смещения за состояние, м</Label>
                              <NumericCalculationInput kind={kind} parameter="maxShorelineChange" form={calculationFormId} id="erosion-maxShorelineChange"
                                value={cercOptions.maxShorelineChange} onChange={(event) => updateCercOptions({ maxShorelineChange: numericInputValue(event.target.value) })} />
                            </div>
                            <label className="flex min-h-11 items-center gap-3 text-sm">
                              <input type="checkbox" checked={cercOptions.outputCsv}
                                onChange={(event) => updateCercOptions({ outputCsv: event.target.checked })} />
                              Сохранить CSV метрик
                            </label>
                            {cercOptions.outputCsv && (
                              <div className="space-y-2">
                                <Label htmlFor="erosion-csv-format">Формат CSV</Label>
                                <Select value={cercOptions.csvFormat}
                                  onValueChange={(value) => updateCercOptions({ csvFormat: value as CercOptionsDto["csvFormat"] })}>
                                  <SelectTrigger aria-describedby="erosion-csv-format-hint" id="erosion-csv-format"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="long">Long — одна строка на состояние</SelectItem>
                                    <SelectItem value="wide" disabled={cercOptions.steps === 0}>Wide — столбцы по состояниям</SelectItem>
                                  </SelectContent>
                                </Select>
                          <CalculationParameterHint kind={kind} parameter="csvFormat" inputId="erosion-csv-format" />
                              </div>
                            )}
                            {isCercKind && (
                              <div className="space-y-4 border-t pt-4">
                                <label className="flex min-h-11 items-center gap-3 text-sm">
                                  <input type="checkbox" checked={cercOptions.outputGif} disabled={cercOptions.steps === 0 || (cercOptions.steps ?? 0) > 48}
                                    onChange={(event) => updateCercOptions({ outputGif: event.target.checked })} />
                                  Сохранить анимацию GIF
                                </label>
                                {cercOptions.outputGif && (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label htmlFor="all-gif-fps">Кадров в секунду (1–30)</Label>
                                      <NumericCalculationInput kind={kind} parameter="gifFps" form={calculationFormId} id="all-gif-fps" required value={cercOptions.gifFps}
                                        onChange={(event) => updateCercOptions({ gifFps: numericInputValue(event.target.value) })} />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="all-gif-skip">Шаг кадров (1–48)</Label>
                                      <NumericCalculationInput kind={kind} parameter="gifSkip" form={calculationFormId} id="all-gif-skip" required value={cercOptions.gifSkip}
                                        onChange={(event) => updateCercOptions({ gifSkip: numericInputValue(event.target.value) })} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {isAllKind && (
                              <div className="space-y-4 border-t pt-4">
                                <div className="space-y-2">
                                  <Label htmlFor="all-model-max-points">Максимум точек базовой модели (0 или 2–10000)</Label>
                                  <NumericCalculationInput kind={kind} parameter="modelMaxPoints" form={calculationFormId} id="all-model-max-points" required value={allOptions.modelMaxPoints}
                                    disabled={hasAllFileIndexedProfile}
                                    onChange={(event) => {
                                      const modelMaxPoints = numericInputValue(event.target.value);
                                      updateAllOptions((current) => ({
                                        ...current, modelMaxPoints,
                                          noModelSimplify: (modelMaxPoints ?? 0) > 0 ? false : current.noModelSimplify
                                      }));
                                    }} />
                                </div>
                                <label className="flex min-h-11 items-center gap-3 text-sm">
                                  <input type="checkbox" checked={allOptions.noModelSimplify}
                                    disabled={(allOptions.modelMaxPoints ?? 0) > 0 || hasAllFileIndexedProfile}
                                    onChange={(event) => updateAllOptions((current) => ({ ...current, noModelSimplify: event.target.checked }))} />
                                  Не упрощать базовую линию
                                </label>
                                {hasAllFileIndexedProfile && (
                                  <p className="text-xs text-muted-foreground">Упрощение заблокировано, пока выбран индексный профиль CERC.</p>
                                )}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </section>
                    )}

                    {kind === "calibrate_cerc" && (
                      <CercCalibrationFields formId={calculationFormId} options={calibrationOptions} resolution={calibrationResolution}
                        onOptionsChange={(patch) => setCalibrationOptions((current) => ({ ...current, ...patch }))}
                        onResolutionChange={setCalibrationResolution} />
                    )}

                    {kind === "shoreline_data_audit" && <div className="max-w-xs space-y-2">
                      <Label htmlFor="audit-validation-start">Начало отложенной проверки UTC (необязательно)</Label>
                      <Input aria-describedby="audit-validation-start-hint" form={calculationFormId} id="audit-validation-start" type="date" value={auditValidationStart}
                        onChange={(event) => setAuditValidationStart(event.target.value)} />
                          <CalculationParameterHint kind={kind} parameter="validationStart" inputId="audit-validation-start" />
                    </div>}
                    {kind === "coastline_region" && (missingRepeatInputs.includes("coastlineInputId") ? <p role="status" className="text-sm text-muted-foreground">Карта появится после явного выбора доступного исходника.</p> : <CoastlineRegionPicker formId={calculationFormId} key={selectedScientific.coastlineInputId ?? "bundled"} value={regionBounds} onChange={setRegionBounds} sourceId={selectedScientific.coastlineInputId} />)}
                    {kind === "mesh" && (
                      <section className="space-y-4" aria-label="Параметры плоской сетки">
                        <h4 className="text-lg font-semibold">Параметры сетки</h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="mesh-sizes">Длины рёбер, м (через запятую)</Label>
                            <Input aria-describedby="mesh-sizes-hint" form={calculationFormId} id="mesh-sizes" value={meshCellSizes} required
                              onChange={(event) => setMeshCellSizes(event.target.value)} />
                            <CalculationParameterHint kind={kind} parameter="cellSizes" inputId="mesh-sizes" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mesh-details">Детализация берега, м (одно значение или по числу рёбер)</Label>
                            <Input aria-describedby="mesh-details-hint" form={calculationFormId} id="mesh-details" value={meshBoundaryDetails} required
                              onChange={(event) => setMeshBoundaryDetails(event.target.value)} />
                            <CalculationParameterHint kind={kind} parameter="boundaryDetails" inputId="mesh-details" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mesh-max-cells">Максимум ячеек</Label>
                            <NumericCalculationInput kind={kind} parameter="maxCells" form={calculationFormId} id="mesh-max-cells" required
                              value={meshMaxCells} onChange={(event) => setMeshMaxCells(numericInputValue(event.target.value))} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mesh-timeout">Тайм-аут генератора, мин</Label>
                            <NumericCalculationInput kind={kind} parameter="generatorTimeoutMinutes" form={calculationFormId} id="mesh-timeout" required
                              value={meshTimeoutMinutes} onChange={(event) => setMeshTimeoutMinutes(numericInputValue(event.target.value))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mesh-generators">Генераторы Gmsh</Label>
                          <Select value={meshGenerators} onValueChange={setMeshGenerators}>
                            <SelectTrigger aria-describedby="mesh-generators-hint" id="mesh-generators"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="frontal-quad">Frontal-Delaunay for Quads</SelectItem>
                              <SelectItem value="delaunay">Delaunay</SelectItem>
                              <SelectItem value="parallelograms">Упаковка параллелограммов</SelectItem>
                              <SelectItem value="delaunay,frontal-quad">Delaunay и Frontal-Delaunay</SelectItem>
                              <SelectItem value="delaunay,frontal-quad,parallelograms">Все три</SelectItem>
                            </SelectContent>
                          </Select>
                          <CalculationParameterHint kind={kind} parameter="generators" inputId="mesh-generators" />
                        </div>
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <input type="checkbox" checked={meshAllowLarge}
                            onChange={(event) => setMeshAllowLarge(event.target.checked)} />
                          Разрешить расчёт сверх оценки лимита ячеек
                        </label>
                      </section>
                    )}
                    {kind === "seabed_build" && (
                      <section className="space-y-4" aria-label="Параметры сборки модели дна">
                        <h4 className="text-lg font-semibold">Параметры модели дна</h4>
                        <p className="text-sm text-muted-foreground">
                          Принятую MSH из «Построить адаптивную сетку» можно выбрать выше как плоскую сетку. Для рисунка с фрагментами фактических ячеек затем запустите «Визуализировать модель дна» и откройте mesh-details.svg.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {([
                            ["boundaryDetail", "Детализация берега, м"],
                            ["maxSourceDistance", "Предел поиска глубины, м"],
                            ["coastTransition", "Переход к береговому нулю, м (0 — автоматически)"],
                            ["maxNodes", "Максимум узлов"],
                            ["maxCells", "Максимум ячеек"],
                            ["maxOutputMiB", "Лимит экспорта, МиБ"],
                          ] as const).map(([key, label]) => (
                            <div key={key} className="space-y-2">
                              <Label htmlFor={`build-${key}`}>{label}</Label>
                              <NumericCalculationInput kind={kind} parameter={key} form={calculationFormId} id={`build-${key}`} required
                                value={buildParameters[key]}
                                onChange={(event) => setBuildParameters((current) => ({ ...current, [key]: numericInputValue(event.target.value) }))} />
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
                      <section className="space-y-4" aria-label="Параметры визуализации">
                        <h4 className="text-lg font-semibold">Параметры визуализации</h4>
                        <div className="space-y-2">
                          <Label htmlFor="seabed-isobaths">Глубины изобат, м (через запятую)</Label>
                          <Input aria-describedby="seabed-isobaths-hint" form={calculationFormId} id="seabed-isobaths" value={isobaths} required
                            onChange={(event) => setIsobaths(event.target.value)} />
                          <CalculationParameterHint kind={kind} parameter="isobaths" inputId="seabed-isobaths" />
                        </div>
                        <Collapsible className="space-y-3">
                          <CollapsibleTrigger asChild><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal text-left">Параметры дополнительного 3D-отчёта</Button></CollapsibleTrigger>
                          <CollapsibleContent className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="seabed-vertical">Вертикальное преувеличение 3D (1–200)</Label>
                              <NumericCalculationInput kind={kind} parameter="verticalExaggeration" form={calculationFormId} id="seabed-vertical" required
                                value={verticalExaggeration}
                                onChange={(event) => setVerticalExaggeration(numericInputValue(event.target.value))} />
                            </div>
                            <label className="flex min-h-11 items-center gap-3 text-sm">
                              <input type="checkbox" checked={controlPoints}
                                onChange={(event) => setControlPoints(event.target.checked)} />
                              Показывать контрольные точки на 3D-поверхности
                            </label>
                          </CollapsibleContent>
                        </Collapsible>
                      </section>
                    )}
                    {kind === "seabed_adapt" && (
                      <section className="space-y-4" aria-label="Размеры адаптивного поля">
                        <h4 className="text-lg font-semibold">Размеры ячеек</h4>
                        <p className="text-sm text-muted-foreground">Показаны технические начальные настройки. Если очистить поле, API восстановит указанное начальное значение. Выберите настройки по своим данным и проверьте сходимость.</p>
                        <div className="space-y-2 rounded-xl border bg-muted/35 p-4 text-sm">
                          <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => {
                            setAdaptSizes(articleSizeFieldPreset);
                            setArticlePresetApplied("adapt");
                          }}>
                            Архив статьи: поле 50–250 м
                          </Button>
                          <p className="text-muted-foreground">
                            Другой архивный набор: в текущем примере рисунка 4 поле 200–1000 м. Значения из отчёта статьи. Нужна совместимая модель дна и её паспорт; пресет не выбирает файлы и не запускает расчёт.
                          </p>
                          {articlePresetApplied === "adapt" && (
                            <p role="status">Параметры архивного поля 50–250 м заполнены. Их можно изменить перед запуском.</p>
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
                              <NumericCalculationInput kind={kind} parameter={key} form={calculationFormId} id={`adapt-${key}`} required={false}
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
                      <section className="space-y-4" aria-label="Параметры адаптивной сетки">
                        <h4 className="text-lg font-semibold">Построение адаптивной сетки</h4>
                        <div className="space-y-2">
                          <Label htmlFor="adaptive-generator">Генератор Gmsh</Label>
                          <Select value={adaptiveGenerator} onValueChange={setAdaptiveGenerator}>
                            <SelectTrigger aria-describedby="adaptive-generator-hint" id="adaptive-generator"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delaunay">Delaunay</SelectItem>
                              <SelectItem value="frontal-quad">Frontal-Delaunay for Quads</SelectItem>
                              <SelectItem value="parallelograms">Упаковка параллелограммов</SelectItem>
                            </SelectContent>
                          </Select>
                          <CalculationParameterHint kind={kind} parameter="generator" inputId="adaptive-generator" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {([
                            ["boundaryDetail", "Детализация берега, м", adaptiveBoundaryDetail, setAdaptiveBoundaryDetail],
                            ["maxCells", "Максимум ячеек", adaptiveMaxCells, setAdaptiveMaxCells],
                            ["generatorTimeoutMinutes", "Тайм-аут Gmsh, мин", adaptiveTimeoutMinutes, setAdaptiveTimeoutMinutes],
                          ] as const).map(([field, label, value, setter], index) => (
                            <div key={label} className="space-y-2">
                              <Label htmlFor={`adaptive-${index}`}>{label}</Label>
                              <NumericCalculationInput kind={kind} parameter={field} form={calculationFormId} id={`adaptive-${index}`} required
                                value={value} onChange={(event) => setter(numericInputValue(event.target.value))} />
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
                      <section className="space-y-4" aria-label="Параметры проверки модели">
                        <h4 className="text-lg font-semibold">Проверка модели дна</h4>
                        <div className="space-y-2">
                          <Label htmlFor="validate-isobaths">Контрольные изобаты, м (через запятую)</Label>
                          <Input aria-describedby="validate-isobaths-hint" form={calculationFormId} id="validate-isobaths" value={validationIsobaths} required
                            onChange={(event) => setValidationIsobaths(event.target.value)} />
                          <CalculationParameterHint kind={kind} parameter="isobaths" inputId="validate-isobaths" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="validate-worst-cells">Число худших ячеек в отчёте</Label>
                            <NumericCalculationInput kind={kind} parameter="worstCells" form={calculationFormId} id="validate-worst-cells" required
                              value={worstCells} onChange={(event) => setWorstCells(numericInputValue(event.target.value))} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="validate-nearest">Предел ближайшей замены, м (0 — автоматически)</Label>
                            <NumericCalculationInput kind={kind} parameter="maxNearestDistance" form={calculationFormId} id="validate-nearest" required
                              value={maxNearestDistance} onChange={(event) => setMaxNearestDistance(numericInputValue(event.target.value))} />
                          </div>
                        </div>
                      </section>
                    )}
                    {kind === "seabed_check_full" && (
                      <section className="space-y-4" aria-label="Параметры проверки полного контура">
                        <h4 className="text-lg font-semibold">Проверка полного контура и рисунки</h4>
                        <p className="text-sm text-muted-foreground">
                          Выберите MSH и отчёт одного запуска «Построить плоскую сетку». Отчёт должен содержать SHA-256 этой MSH; старый отчёт без контрольной суммы не переносится между заданиями. Предел входной сетки в вебе — 256 МиБ.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="full-generator">Генератор контрольной сетки</Label>
                          <Select value={fullOptions.generator} onValueChange={(value) => setFullOptions((current) => ({ ...current, generator: value }))}>
                            <SelectTrigger aria-describedby="full-generator-hint" id="full-generator"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delaunay">Delaunay</SelectItem>
                              <SelectItem value="frontal-quad">Frontal-Delaunay for Quads</SelectItem>
                              <SelectItem value="parallelograms">Упаковка параллелограммов</SelectItem>
                            </SelectContent>
                          </Select>
                          <CalculationParameterHint kind={kind} parameter="generator" inputId="full-generator" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {([
                            ["targetEdge", "Контрольное ребро, м"],
                            ["boundaryDetail", "Детализация берега, м"],
                            ["maxSourceDistance", "Предел поиска глубины, м"],
                            ["coastTransition", "Переход к береговому нулю, м (0 — автоматически)"],
                            ["verticalExaggeration", "Вертикальное преувеличение 3D"],
                          ] as const).map(([key, label]) => (
                            <div key={key} className="space-y-2">
                              <Label htmlFor={`full-${key}`}>{label}</Label>
                              <NumericCalculationInput kind={kind} parameter={key} form={calculationFormId} id={`full-${key}`} required
                                value={fullOptions[key]}
                                onChange={(event) => setFullOptions((current) => ({ ...current, [key]: numericInputValue(event.target.value) }))} />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="full-isobaths">Глубины изобат, м (через запятую)</Label>
                          <Input aria-describedby="full-isobaths-hint" form={calculationFormId} id="full-isobaths" value={fullOptions.isobaths} required
                            onChange={(event) => setFullOptions((current) => ({ ...current, isobaths: event.target.value }))} />
                          <CalculationParameterHint kind={kind} parameter="isobaths" inputId="full-isobaths" />
                        </div>
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <input type="checkbox" checked={fullOptions.controlPoints}
                            onChange={(event) => setFullOptions((current) => ({ ...current, controlPoints: event.target.checked }))} />
                          Показывать контрольные точки на 3D-поверхности
                        </label>
                      </section>
                    )}
                    {kind === "seabed_compare_adaptive" && (
                      <section className="space-y-4" aria-label="Параметры сравнения Gmsh">
                        <h4 className="text-lg font-semibold">Сравнение генераторов</h4>
                        <div className="space-y-2 rounded-xl border bg-muted/35 p-4 text-sm">
                          <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => applyArticleComparisonPreset(false)}>
                            Архив статьи: сетки 125–250 м
                          </Button>
                          <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => applyArticleComparisonPreset(true)}>
                            Компоновка AI-01: три фрагмента 125–250 м
                          </Button>
                          <p className="text-muted-foreground">
                            Нужны совместимые модель дна, поле размера, контур и паспорта. Расчёт требует Gmsh и значительных ресурсов. Диапазон 125–250 м относится к архиву статьи; точные параметры рисунков 6–7 без согласованных MSH, ADAPT-03 и ключа не подтверждены.
                          </p>
                          {articlePresetApplied === "compare" && (
                            <p role="status">Архивный пресет 125–250 м заполнен. Точный повтор примеров не подтверждён; большой расчёт не разрешён автоматически.</p>
                          )}
                          {articlePresetApplied === "figure-five" && (
                            <p role="status">Для компоновки трёх фрагментов выбраны уровень coarse, Delaunay и карточки AI-01. Это отдельный отчёт; пример рисунка 5 показывает подробности модели дна. Проверьте исходные файлы и ресурсы.</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="compare-levels">Контрольные уровни id:min:max, через запятую</Label>
                          <Input aria-describedby="compare-levels-hint" form={calculationFormId} id="compare-levels" value={compareLevels} required
                            onChange={(event) => {
                              setCompareLevels(event.target.value);
                              setArticlePresetApplied(null);
                            }} />
                          <CalculationParameterHint kind={kind} parameter="levels" inputId="compare-levels" />
                          <p className="text-xs text-muted-foreground">Например: detailed:125:250,coarse:500:1000. До четырёх уровней; размеры в метрах.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {([
                            ["boundaryDetail", "Детализация берега, м", boundaryDetail, setBoundaryDetail],
                            ["maxCells", "Максимум ячеек", maxCells, setMaxCells],
                            ["generatorTimeoutMinutes", "Тайм-аут генератора, мин", generatorTimeoutMinutes, setGeneratorTimeoutMinutes],
                          ] as const).map(([field, label, value, setter], index) => (
                            <div key={label} className="space-y-2">
                              <Label htmlFor={`compare-${index}`}>{label}</Label>
                              <NumericCalculationInput kind={kind} parameter={field} form={calculationFormId} id={`compare-${index}`} required
                                value={value} onChange={(event) => {
                                  setter(numericInputValue(event.target.value));
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
                            <SelectTrigger aria-describedby="compare-generators-hint" id="compare-generators"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delaunay,frontal-quad">Delaunay и Frontal-Delaunay for Quads</SelectItem>
                              <SelectItem value="delaunay">Только Delaunay</SelectItem>
                              <SelectItem value="frontal-quad">Только Frontal-Delaunay for Quads</SelectItem>
                              <SelectItem value="delaunay,frontal-quad,parallelograms">Все три генератора</SelectItem>
                            </SelectContent>
                          </Select>
                          <CalculationParameterHint kind={kind} parameter="generators" inputId="compare-generators" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="compare-detail-preset">Подробные рисунки сетки</Label>
                          <Select value={detailPreset} disabled={selectedReport?.type === "adaptive_mesh_windows"} onValueChange={(value) => {
                            setDetailPreset(value);
                            setArticlePresetApplied(null);
                          }}>
                            <SelectTrigger aria-describedby="compare-detail-preset-hint" id="compare-detail-preset"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kizilirmak">Кызылырмакская коса: окно 4,2 × 2,6 км</SelectItem>
                              <SelectItem value="none">Не строить подробное окно</SelectItem>
                            </SelectContent>
                          </Select>
                          <CalculationParameterHint kind={kind} parameter="detailPreset" inputId="compare-detail-preset" />
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
                        <div className="space-y-3 rounded-xl border bg-muted/35 p-4">
                          <label className="flex min-h-11 items-center gap-3 text-sm">
                            <input type="checkbox" checked={expertOptions.generateExpertSet} disabled={selectedReport?.type === "expert_fragment_cards"}
                              onChange={(event) => {
                                setExpertOptions((current) => ({ ...current, generateExpertSet: event.target.checked }));
                                if (!event.target.checked) setFigureFiveOptions((current) => ({ ...current, generateFigureFive: false }));
                              }} />
                            Подготовить экспертные SVG-карточки AI-01
                          </label>
                          <p className="text-xs text-muted-foreground">
                            После принятого сравнения Go создаст слепые карточки, лист оценивания и инструкции. Нужны минимум два успешно завершившихся генератора на каждом выбранном уровне.
                          </p>
                          {expertOptions.generateExpertSet && (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="expert-levels">Уровни для карточек (ID через запятую)</Label>
                                <Input aria-describedby="expert-levels-hint" form={calculationFormId} id="expert-levels" value={expertOptions.expertLevels} placeholder="Все уровни сравнения"
                                  onChange={(event) => setExpertOptions((current) => ({ ...current, expertLevels: event.target.value }))} />
                          <CalculationParameterHint kind={kind} parameter="expertLevels" inputId="expert-levels" />
                                <p className="text-xs text-muted-foreground">Пусто — все уровни. Используйте ID из списка выше, например detailed.</p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="expert-seed">Строка анонимизации карточек</Label>
                                <Input aria-describedby="expert-seed-hint" form={calculationFormId} id="expert-seed" value={expertOptions.expertSeed} required maxLength={80}
                                  onChange={(event) => setExpertOptions((current) => ({ ...current, expertSeed: event.target.value }))} />
                          <CalculationParameterHint kind={kind} parameter="expertSeed" inputId="expert-seed" />
                              </div>
                              <p className="text-xs text-muted-foreground">Закрытый ключ организатора попадёт только в ваши приватные результаты. Не передавайте его экспертам вместе с карточками.</p>
                              <div className="space-y-3 rounded-lg border bg-card p-3">
                                <label className="flex min-h-11 items-center gap-3 text-sm">
                                  <input type="checkbox" checked={figureFiveOptions.generateFigureFive}
                                    onChange={(event) => setFigureFiveOptions((current) => ({
                                      ...current, generateFigureFive: event.target.checked,
                                      figureFiveLevel: event.target.checked && !current.figureFiveLevel
                                        ? compareLevels.split(",")[0]?.split(":")[0] ?? "" : current.figureFiveLevel,
                                    }))} />
                                  Собрать рисунок 5 из трёх фактических карточек
                                </label>
                                {figureFiveOptions.generateFigureFive && (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label htmlFor="figure-five-level">Уровень рисунка 5</Label>
                                      <Input aria-describedby="figure-five-level-hint" form={calculationFormId} id="figure-five-level" value={figureFiveOptions.figureFiveLevel} required
                                        onChange={(event) => setFigureFiveOptions((current) => ({ ...current, figureFiveLevel: event.target.value }))} />
                          <CalculationParameterHint kind={kind} parameter="figureFiveLevel" inputId="figure-five-level" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="figure-five-generator">Генератор рисунка 5</Label>
                                      <Select value={figureFiveOptions.figureFiveGenerator}
                                        onValueChange={(value) => setFigureFiveOptions((current) => ({ ...current, figureFiveGenerator: value as FigureFiveOptionsDto["figureFiveGenerator"] }))}>
                                        <SelectTrigger aria-describedby="figure-five-generator-hint" id="figure-five-generator"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {(["delaunay", "frontal-quad", "parallelograms"] as const)
                                            .filter((value) => generators.split(",").includes(value))
                                            .map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                          <CalculationParameterHint kind={kind} parameter="figureFiveGenerator" inputId="figure-five-generator" />
                                    </div>
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground">Рисунок раскрывает связь карточек с генератором и остаётся приватным файлом владельца. Не передавайте его экспертам до завершения оценивания. Совпадение с архивом зависит от исходных SHA-256 и версии Gmsh.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                    {kind === "seabed_assess_ml" && (
                      <section className="space-y-4" aria-label="Пороги оценки AI-02">
                        <h4 className="text-lg font-semibold">Пороги проверки необходимости ML</h4>
                        <p className="text-sm text-muted-foreground">
                          Go сравнит оценки с детерминированным рейтингом на географически разделённых карточках обучения и проверки. Результат — рекомендация для следующего исследования, не аттестованная ML-модель.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {([
                            ["minExpertsPerCard", "Экспертов на карточку"],
                            ["minTraining", "Минимум карточек обучения"],
                            ["minEvaluation", "Минимум карточек проверки"],
                            ["ridgeLambda", "Ridge-регуляризация"],
                            ["minRmseImprovement", "Минимальное улучшение RMSE"],
                          ] as const).map(([key, label]) => (
                            <div key={key} className="space-y-2">
                              <Label htmlFor={`ai-${key}`}>{label}</Label>
                              <NumericCalculationInput kind={kind} parameter={key} form={calculationFormId} id={`ai-${key}`} required
                                value={aiOptions[key]} onChange={(event) => setAIOptions((current) => ({ ...current, [key]: numericInputValue(event.target.value) }))} />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">Улучшение RMSE задаётся долей: 0,10 означает 10%. Пустой или неполный лист оценок может закончиться выводом «ML не рекомендуется».</p>
                      </section>
                    )}
                    {!hasParameters && <p className="text-sm text-muted-foreground">У этого сценария нет дополнительных параметров. Расчёт использует выбранные исходные данные.</p>}
                  </CalculationFormSection>
                  <CalculationResultSection title={selectedReport?.title ?? scenario.title} description={selectedReport?.description} issues={readinessIssues} />
                </fieldset>
              )}
            </>
          )}
        </div>

      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{selectedReport?.title ?? scenario?.title ?? "Готовим сценарий…"}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Можно иметь до 5 незавершённых расчётов одновременно.
          </p>
        </div>
        <Button
          type="submit"
          form={calculationFormId}
          aria-describedby={scenario ? "calculation-readiness" : undefined}
          disabled={loading || busy || Boolean(loadError) || readinessIssues.length > 0}
          className="sm:min-w-48"
        >
          {busy ? "Ставим в очередь…" : "Запустить расчёт"}
        </Button>
      </footer>
    </DialogContent>
  );
}
