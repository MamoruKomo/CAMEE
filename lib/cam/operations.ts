import {
  getBounds,
  getMaterialBounds,
  type CamSettings,
  type MaterialOrigin,
  type ToolPath,
} from "@/lib/cam";
import { vectorPathsToToolPaths } from "@/lib/vector/cam-adapter";
import { buildTextPaths } from "@/lib/vector/text";
import type { VectorDocument } from "@/lib/vector/types";

export type CamOperationType = "centerline";

export type CamOperation = {
  id: string;
  name: string;
  operationType: CamOperationType;
  sourcePathIds: string[];
  sourceRevision: number;
  settings: CamSettings;
  generatedToolPaths: ToolPath[];
  generatedAt: number;
};

export type CamMaterial = {
  width: number;
  height: number;
  thickness: number;
  origin: MaterialOrigin;
  allowThroughCut: boolean;
};

export type CamSafetyIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
};

export function isCamOperationStale(operation: CamOperation, document: VectorDocument) {
  return operation.sourceRevision !== document.revision;
}

export function buildCenterlineOperation(
  document: VectorDocument,
  sourcePathIds: string[],
  settings: CamSettings,
  details: { id: string; name: string; now?: number; toleranceMm?: number },
): CamOperation {
  const ids = new Set(sourcePathIds);
  const sourcePaths = document.paths.filter((path) => ids.has(path.id) && path.visible && !path.locked);
  if (!sourcePaths.length) throw new Error("CAM対象の編集可能なパスを選択してください。");
  const sourceTextIds = new Set(sourcePaths.flatMap((path) => path.sourceTextId ? [path.sourceTextId] : []));
  (document.texts ?? []).filter((text) => sourceTextIds.has(text.id)).forEach((text) => {
    const unsupported = buildTextPaths(text).unsupportedCharacters;
    if (unsupported.length) throw new Error(`「${text.name}」に未対応文字があります: ${unsupported.join(" ")}。対応文字へ変更するかアウトラインを読み込んでください。`);
  });
  const generatedToolPaths = vectorPathsToToolPaths(sourcePaths, { toleranceMm: details.toleranceMm ?? 0.05, maxSegments: 20_000 });
  return {
    id: details.id,
    name: details.name.trim() || "センターライン",
    operationType: "centerline",
    sourcePathIds: sourcePaths.map((path) => path.id),
    sourceRevision: document.revision,
    settings: { ...settings },
    generatedToolPaths,
    generatedAt: details.now ?? Date.now(),
  };
}

export function validateCamOperation(
  operation: CamOperation,
  document: VectorDocument,
  material: CamMaterial,
): CamSafetyIssue[] {
  const issues: CamSafetyIssue[] = [];
  const settings = operation.settings;
  if (isCamOperationStale(operation, document)) {
    issues.push({ code: "STALE", severity: "error", message: "図形が変更されています。ツールパスを再計算してください。" });
  }
  if (!operation.generatedToolPaths.length) issues.push({ code: "EMPTY", severity: "error", message: "ツールパスが空です。" });
  const selectedIds = new Set(operation.sourcePathIds);
  const operationTextIds = new Set(document.paths.filter((path) => selectedIds.has(path.id) && path.sourceTextId).map((path) => path.sourceTextId as string));
  (document.texts ?? []).filter((text) => operationTextIds.has(text.id)).forEach((text) => {
    try {
      const unsupported = buildTextPaths(text).unsupportedCharacters;
      if (unsupported.length) issues.push({ code: "UNSUPPORTED_TEXT", severity: "error", message: `「${text.name}」に未対応文字があります: ${unsupported.join(" ")}。` });
    } catch (reason) {
      issues.push({ code: "INVALID_TEXT_FONT", severity: "error", message: reason instanceof Error ? reason.message : "文字フォント情報が不正です。" });
    }
  });
  const positiveSettings: Array<[keyof CamSettings, string]> = [
    ["finalDepth", "最終深さ"], ["stepDown", "1回の深さ"], ["bitDiameter", "ビット径"],
    ["feedRate", "送り速度"], ["plungeRate", "切り込み速度"], ["retractHeight", "退避高さ"], ["rapidFeed", "早送り速度"],
    ["spindleRpm", "参考回転数"], ["fluteCount", "刃数"],
  ];
  positiveSettings.forEach(([key, label]) => {
    const value = settings[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) issues.push({ code: `INVALID_${String(key).toUpperCase()}`, severity: "error", message: `${label}は有限な正値にしてください。` });
  });
  operation.generatedToolPaths.forEach((path) => {
    if (path.points.length < 2) issues.push({ code: "SHORT_PATH", severity: "error", message: `${path.id}: 2点未満のパスです。` });
    let length = 0;
    path.points.forEach((point, index) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) issues.push({ code: "NON_FINITE", severity: "error", message: `${path.id}: NaNまたはInfinityがあります。` });
      if (index) length += Math.hypot(point.x - path.points[index - 1].x, point.y - path.points[index - 1].y);
    });
    if (!Number.isFinite(length) || length <= 1e-7) issues.push({ code: "ZERO_LENGTH", severity: "error", message: `${path.id}: ゼロ長パスです。` });
    if (settings.rampEnabled && !path.closed) issues.push({ code: "OPEN_RAMP", severity: "error", message: "ランプ進入は閉じたパスだけで使用できます。" });
  });
  if (settings.rampEnabled && (!Number.isFinite(settings.rampLength) || settings.rampLength <= 0)) {
    issues.push({ code: "INVALID_RAMP", severity: "error", message: "ランプ長さは有限な正値にしてください。" });
  }
  if (operation.generatedToolPaths.length) {
    const pathBounds = getBounds(operation.generatedToolPaths);
    const board = getMaterialBounds(material.width, material.height, material.origin);
    if (pathBounds.minX < board.minX - 1e-6 || pathBounds.minY < board.minY - 1e-6 || pathBounds.maxX > board.maxX + 1e-6 || pathBounds.maxY > board.maxY + 1e-6) {
      issues.push({ code: "OUTSIDE_MATERIAL", severity: "warning", message: "材料の外側にパスがあります。原点と材料サイズを確認してください。" });
    }
  }
  if (!Number.isFinite(material.thickness) || material.thickness <= 0) issues.push({ code: "INVALID_MATERIAL", severity: "error", message: "材料厚は有限な正値にしてください。" });
  else if (settings.finalDepth > material.thickness) {
    issues.push({
      code: "THROUGH_CUT",
      severity: material.allowThroughCut ? "warning" : "error",
      message: material.allowThroughCut ? "材料厚を超える貫通加工です。捨て板と固定を確認してください。" : "加工深さが材料厚を超えています。貫通加工を明示許可してください。",
    });
  }
  issues.push({ code: "DRY_RUN", severity: "warning", message: "本加工前に、ビットを材料から離した状態でDry Runしてください。" });
  return issues.filter((issue, index, all) => all.findIndex((candidate) => candidate.code === issue.code && candidate.message === issue.message) === index);
}

export function assertCamOperationExportable(operation: CamOperation, document: VectorDocument, material: CamMaterial) {
  const issues = validateCamOperation(operation, document, material);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));
  return issues;
}
