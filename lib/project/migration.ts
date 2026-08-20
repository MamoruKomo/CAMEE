import type { CamSettings, ToolPath } from "@/lib/cam";
import type { CamOperation } from "@/lib/cam/operations";
import { createCornerPath } from "@/lib/vector/shapes";
import { validateVectorDocument } from "@/lib/vector/serialization";
import type { VectorPath } from "@/lib/vector/types";
import { createId } from "@/lib/vector/types";
import { createNewProject, defaultBitLibrary, defaultCamSettings } from "./defaults";
import type { BitDefinition, ProjectV2 } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finitePositive(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function legacyPath(value: unknown, index: number) {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points = value.points.flatMap((point) => isRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y)
    ? [{ x: point.x, y: point.y }]
    : []);
  if (points.length < 2) return null;
  const closed = Boolean(value.closed);
  if (closed && points.length > 2 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 1e-7) points.pop();
  const path = createCornerPath(points, closed, `移行パス ${index + 1}`);
  if (typeof value.id === "string" && value.id) path.id = value.id;
  return path;
}

function camSettings(value: unknown): CamSettings {
  const source = isRecord(value) ? value : {};
  return {
    ...defaultCamSettings,
    finalDepth: finitePositive(source.finalDepth, defaultCamSettings.finalDepth),
    stepDown: finitePositive(source.stepDown, defaultCamSettings.stepDown),
    bitDiameter: finitePositive(source.bitDiameter, defaultCamSettings.bitDiameter),
    feedRate: finitePositive(source.feedRate, defaultCamSettings.feedRate),
    plungeRate: finitePositive(source.plungeRate, defaultCamSettings.plungeRate),
    retractHeight: finitePositive(source.retractHeight, defaultCamSettings.retractHeight),
    rapidFeed: finitePositive(source.rapidFeed, defaultCamSettings.rapidFeed),
    rampEnabled: source.rampEnabled === true,
    rampLength: finitePositive(source.rampLength, defaultCamSettings.rampLength),
    toolName: typeof source.toolName === "string" ? source.toolName : defaultCamSettings.toolName,
    toolType: typeof source.toolType === "string" ? source.toolType : defaultCamSettings.toolType,
    spindleRpm: finitePositive(source.spindleRpm, defaultCamSettings.spindleRpm ?? 18000),
    fluteCount: finitePositive(source.fluteCount, defaultCamSettings.fluteCount ?? 2),
  };
}

function readBit(value: unknown): BitDefinition | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const type = ["straight", "v", "ball-nose", "crown", "drill", "custom"].includes(String(value.type)) ? value.type as BitDefinition["type"] : "custom";
  return {
    id: value.id,
    name: value.name,
    type,
    cuttingDiameter: finitePositive(value.cuttingDiameter, 3),
    shankDiameter: finitePositive(value.shankDiameter, 3.175),
    fluteLength: finitePositive(value.fluteLength, 10),
    overallLength: finitePositive(value.overallLength, 38),
    fluteCount: finitePositive(value.fluteCount, 2),
    spindleRpm: finitePositive(value.spindleRpm, 18000),
    feedRate: finitePositive(value.feedRate, 1000),
    plungeRate: finitePositive(value.plungeRate, 300),
    vAngle: typeof value.vAngle === "number" && Number.isFinite(value.vAngle) ? value.vAngle : 0,
    tipDiameter: typeof value.tipDiameter === "number" && Number.isFinite(value.tipDiameter) ? value.tipDiameter : 0,
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}

function readToolPath(value: unknown): ToolPath | null {
  if (!isRecord(value)) return null;
  const path = legacyPath(value, 0);
  if (!path) return null;
  const originalPoints = Array.isArray(value.points) ? value.points : [];
  return { id: path.id, closed: path.closed, sourceType: typeof value.sourceType === "string" ? value.sourceType : "LEGACY", points: originalPoints.map((point) => ({ x: Number((point as Record<string, unknown>).x), y: Number((point as Record<string, unknown>).y) })) };
}

function migrateLegacyOperations(value: unknown, documentRevision: number): CamOperation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CamOperation[] => {
    if (!isRecord(item)) return [];
    const generatedToolPaths = Array.isArray(item.paths) ? item.paths.map(readToolPath).filter((path): path is ToolPath => Boolean(path)) : [];
    return [{
      id: typeof item.id === "string" ? item.id : createId("cam"),
      name: typeof item.name === "string" ? item.name : "移行センターライン",
      operationType: "centerline",
      sourcePathIds: Array.isArray(item.pathIds) ? item.pathIds.filter((id): id is string => typeof id === "string") : [],
      sourceRevision: Math.max(-1, documentRevision - 1),
      settings: camSettings(item.settings),
      generatedToolPaths,
      generatedAt: 0,
    }];
  });
}

function validateProjectV2(value: Record<string, unknown>): ProjectV2 {
  const defaults = createNewProject();
  const document = validateVectorDocument(value.document);
  const material = isRecord(value.material) ? value.material : {};
  const tools = isRecord(value.tools) ? value.tools : {};
  const library = Array.isArray(tools.library) ? tools.library.map(readBit).filter((bit): bit is BitDefinition => Boolean(bit)) : [];
  const origin = ["lower-left", "lower-center", "lower-right", "center-left", "center", "center-right", "upper-left", "upper-center", "upper-right", "dxf"].includes(String(material.origin)) ? material.origin as ProjectV2["material"]["origin"] : "lower-left";
  const operations = Array.isArray(value.camOperations) ? value.camOperations.flatMap((operation): CamOperation[] => {
    if (!isRecord(operation) || operation.operationType !== "centerline" || !Array.isArray(operation.sourcePathIds)) return [];
    const generated = Array.isArray(operation.generatedToolPaths) ? operation.generatedToolPaths.map(readToolPath).filter((path): path is ToolPath => Boolean(path)) : [];
    return [{
      id: typeof operation.id === "string" ? operation.id : createId("cam"),
      name: typeof operation.name === "string" ? operation.name : "センターライン",
      operationType: "centerline",
      sourcePathIds: operation.sourcePathIds.filter((id): id is string => typeof id === "string"),
      sourceRevision: generated.length && Number.isInteger(operation.sourceRevision) ? Number(operation.sourceRevision) : -1,
      settings: camSettings(operation.settings),
      generatedToolPaths: generated,
      generatedAt: typeof operation.generatedAt === "number" && Number.isFinite(operation.generatedAt) ? operation.generatedAt : 0,
    }];
  }) : [];
  const activeToolId = typeof tools.activeToolId === "string" && library.some((bit) => bit.id === tools.activeToolId) ? tools.activeToolId : (library[0]?.id ?? defaults.tools.activeToolId);
  const ui = isRecord(value.ui) ? value.ui : {};
  return {
    version: 2,
    savedAt: typeof value.savedAt === "number" && Number.isFinite(value.savedAt) ? value.savedAt : 0,
    name: typeof value.name === "string" ? value.name : defaults.name,
    document,
    camOperations: operations,
    material: {
      width: finitePositive(material.width, 300),
      height: finitePositive(material.height, 200),
      thickness: finitePositive(material.thickness, 18),
      origin,
      allowThroughCut: material.allowThroughCut === true,
    },
    tools: { library: library.length ? library : defaultBitLibrary.map((bit) => ({ ...bit })), activeToolId },
    camDraft: camSettings(value.camDraft),
    ui: {
      view: ui.view === "3d" ? "3d" : "2d",
      selectedPathIds: Array.isArray(ui.selectedPathIds) ? ui.selectedPathIds.filter((id): id is string => typeof id === "string") : [],
      activeOperationId: typeof ui.activeOperationId === "string" ? ui.activeOperationId : null,
    },
  };
}

export function migrateProject(value: unknown): ProjectV2 {
  if (!isRecord(value)) throw new Error("CutPath project形式が不正です。");
  if (value.version === 2) return validateProjectV2(value);
  if (value.version !== 1) throw new Error("対応していないproject versionです。");
  const sourcePaths = Array.isArray(value.displayPaths)
    ? value.displayPaths
    : isRecord(value.drawing) && Array.isArray(value.drawing.paths) ? value.drawing.paths : [];
  const paths = sourcePaths.map(legacyPath).filter((path): path is VectorPath => Boolean(path));
  const document = { version: 1 as const, units: "mm" as const, revision: 1, paths, pathOrder: paths.map((path) => path.id) };
  const bits = Array.isArray(value.bitLibrary) ? value.bitLibrary.map(readBit).filter((bit): bit is BitDefinition => Boolean(bit)) : [];
  const defaults = createNewProject();
  return {
    version: 2,
    savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
    name: typeof value.fileName === "string" && value.fileName ? value.fileName.replace(/\.dxf$/i, "") : "移行プロジェクト",
    document,
    camOperations: migrateLegacyOperations(value.calculatedToolpaths, document.revision),
    material: {
      width: finitePositive(value.materialWidth, 300),
      height: finitePositive(value.materialHeight, 200),
      thickness: finitePositive(value.materialThickness, 18),
      origin: typeof value.origin === "string" ? value.origin as ProjectV2["material"]["origin"] : "lower-left",
      allowThroughCut: false,
    },
    tools: {
      library: bits.length ? bits : defaultBitLibrary.map((bit) => ({ ...bit })),
      activeToolId: typeof value.activeBitId === "string" && bits.some((bit) => bit.id === value.activeBitId) ? value.activeBitId : (bits[0]?.id ?? defaults.tools.activeToolId),
    },
    camDraft: camSettings(value.settings),
    ui: { view: value.view === "3d" ? "3d" : "2d", selectedPathIds: [], activeOperationId: null },
  };
}

export function projectToPersistentValue(project: ProjectV2) {
  const safe = migrateProject(project);
  return {
    ...safe,
    camOperations: safe.camOperations.map((operation) => ({
      id: operation.id,
      name: operation.name,
      operationType: operation.operationType,
      sourcePathIds: [...operation.sourcePathIds],
      sourceRevision: -1,
      settings: { ...operation.settings },
      generatedAt: operation.generatedAt,
    })),
  };
}

export function serializeProject(project: ProjectV2) {
  return JSON.stringify(projectToPersistentValue(project), null, 2);
}

export function deserializeProject(source: string) {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("Project JSONを解析できませんでした。"); }
  return migrateProject(value);
}
