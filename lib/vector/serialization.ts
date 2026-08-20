import { cloneVectorDocument, isFiniteVec2, type VectorDocument, type VectorNode, type VectorPath } from "./types";

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
  return cloneVectorDocument({ version: 1, units: "mm", revision: Number(value.revision), paths, pathOrder });
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
