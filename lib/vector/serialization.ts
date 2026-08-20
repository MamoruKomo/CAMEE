import { cloneVectorDocument, isFiniteVec2, type Vec2, type VectorDocument, type VectorNode, type VectorPath, type VectorText } from "./types";
import { CUTPATH_STROKE_FONT } from "./text";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNode(value: unknown): VectorNode {
  if (!isRecord(value) || !isRecord(value.anchor) || !isFiniteVec2(value.anchor as { x: number; y: number })) {
    throw new Error("VectorNodeのanchorが不正です。");
  }
  const readHandle = (handle: unknown) => {
    if (handle === null || handle === undefined) return null;
    if (!isRecord(handle) || !isFiniteVec2(handle as { x: number; y: number })) throw new Error("Bezier handleが不正です。");
    return { x: Number(handle.x), y: Number(handle.y) };
  };
  const nodeType = value.nodeType;
  if (nodeType !== "corner" && nodeType !== "smooth" && nodeType !== "symmetric") throw new Error("nodeTypeが不正です。");
  if (typeof value.id !== "string" || !value.id) throw new Error("VectorNode IDが不正です。");
  return {
    id: value.id,
    anchor: { x: Number(value.anchor.x), y: Number(value.anchor.y) },
    inHandle: readHandle(value.inHandle),
    outHandle: readHandle(value.outHandle),
    nodeType,
  };
}

function readPath(value: unknown): VectorPath {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.nodes)) {
    throw new Error("VectorPathが不正です。");
  }
  return {
    id: value.id,
    name: value.name,
    closed: Boolean(value.closed),
    nodes: value.nodes.map(readNode),
    visible: value.visible !== false,
    locked: value.locked === true,
    sourceTextId: typeof value.sourceTextId === "string" && value.sourceTextId ? value.sourceTextId : undefined,
    style: isRecord(value.style) && typeof value.style.strokeWidthMm === "number" && Number.isFinite(value.style.strokeWidthMm) && value.style.strokeWidthMm >= 0
      ? { strokeWidthMm: value.style.strokeWidthMm }
      : undefined,
  };
}

function readText(value: unknown): VectorText {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string" || typeof value.text !== "string" || !isRecord(value.position) || !isFiniteVec2(value.position as Vec2) || !Array.isArray(value.pathIds)) {
    throw new Error("VectorText形式が不正です。");
  }
  const finiteNonNegative = (input: unknown, fallback: number) => typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : fallback;
  const align = value.align === "center" || value.align === "right" ? value.align : "left";
  if (value.fontId !== undefined && value.fontId !== CUTPATH_STROKE_FONT.id) throw new Error("未対応の文字フォントです。");
  if (value.fontChecksum !== undefined && value.fontChecksum !== CUTPATH_STROKE_FONT.checksum) throw new Error("文字フォントのchecksumが一致しません。");
  if (value.outlineVersion !== undefined && value.outlineVersion !== CUTPATH_STROKE_FONT.outlineVersion) throw new Error("文字outlineのversionが一致しません。");
  return {
    id: value.id,
    name: value.name,
    text: value.text,
    fontId: "cutpath-simplex",
    fontChecksum: CUTPATH_STROKE_FONT.checksum,
    outlineVersion: CUTPATH_STROKE_FONT.outlineVersion,
    fontSizeMm: Math.max(0.1, finiteNonNegative(value.fontSizeMm, 10)),
    letterSpacingMm: finiteNonNegative(value.letterSpacingMm, 1),
    lineHeightMm: Math.max(0.1, finiteNonNegative(value.lineHeightMm, 12)),
    align,
    position: { x: Number(value.position.x), y: Number(value.position.y) },
    rotationDegrees: typeof value.rotationDegrees === "number" && Number.isFinite(value.rotationDegrees) ? value.rotationDegrees : 0,
    strokeWidthMm: finiteNonNegative(value.strokeWidthMm, 0.4),
    visible: value.visible !== false,
    locked: value.locked === true,
    pathIds: value.pathIds.filter((id): id is string => typeof id === "string"),
  };
}

export function validateVectorDocument(value: unknown): VectorDocument {
  if (!isRecord(value) || value.version !== 1 || value.units !== "mm" || !Number.isInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.paths) || !Array.isArray(value.pathOrder)) {
    throw new Error("VectorDocument形式が不正です。");
  }
  const paths = value.paths.map(readPath);
  const ids = new Set(paths.map((path) => path.id));
  if (ids.size !== paths.length) throw new Error("VectorPath IDが重複しています。");
  const pathOrder = value.pathOrder.filter((id): id is string => typeof id === "string" && ids.has(id));
  paths.forEach((path) => { if (!pathOrder.includes(path.id)) pathOrder.push(path.id); });
  const texts = Array.isArray(value.texts) ? value.texts.map(readText) : [];
  const textIds = new Set(texts.map((text) => text.id));
  if (textIds.size !== texts.length) throw new Error("VectorText IDが重複しています。");
  const textOrder = Array.isArray(value.textOrder) ? value.textOrder.filter((id): id is string => typeof id === "string" && textIds.has(id)) : [];
  texts.forEach((text) => { if (!textOrder.includes(text.id)) textOrder.push(text.id); });
  texts.forEach((text) => {
    text.pathIds.forEach((pathId) => {
      const path = paths.find((candidate) => candidate.id === pathId);
      if (!path || path.sourceTextId !== text.id) throw new Error("VectorTextと生成Pathの対応が不正です。");
    });
  });
  paths.forEach((path) => {
    if (path.sourceTextId && !texts.some((text) => text.id === path.sourceTextId && text.pathIds.includes(path.id))) throw new Error("生成文字Pathのsourceが不正です。");
  });
  return cloneVectorDocument({ version: 1, units: "mm", revision: Number(value.revision), paths, pathOrder, texts, textOrder });
}

export function serializeVectorDocument(document: VectorDocument) {
  return JSON.stringify(validateVectorDocument(document), null, 2);
}

export function deserializeVectorDocument(source: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("JSONを解析できませんでした。");
  }
  return validateVectorDocument(parsed);
}
