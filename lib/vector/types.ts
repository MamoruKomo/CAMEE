export type Vec2 = {
  x: number;
  y: number;
};

export type VectorNodeType = "corner" | "smooth" | "symmetric";

export type VectorNode = {
  id: string;
  anchor: Vec2;
  inHandle: Vec2 | null;
  outHandle: Vec2 | null;
  nodeType: VectorNodeType;
};

export type VectorPath = {
  id: string;
  name: string;
  closed: boolean;
  nodes: VectorNode[];
  visible: boolean;
  locked: boolean;
  sourceTextId?: string;
  style?: {
    strokeWidthMm: number;
  };
};

export type VectorText = {
  id: string;
  name: string;
  text: string;
  fontId: "cutpath-simplex";
  fontChecksum: "cutpath-simplex-14seg-v1";
  outlineVersion: 1;
  fontSizeMm: number;
  letterSpacingMm: number;
  lineHeightMm: number;
  align: "left" | "center" | "right";
  position: Vec2;
  rotationDegrees: number;
  strokeWidthMm: number;
  visible: boolean;
  locked: boolean;
  pathIds: string[];
};

export type VectorDocument = {
  version: 1;
  units: "mm";
  revision: number;
  paths: VectorPath[];
  pathOrder: string[];
  texts?: VectorText[];
  textOrder?: string[];
};

let fallbackId = 0;
let latestRevision = 0;

export function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

export function createVectorNode(anchor: Vec2, overrides: Partial<Omit<VectorNode, "anchor">> = {}): VectorNode {
  return {
    id: overrides.id ?? createId("node"),
    anchor: { ...anchor },
    inHandle: overrides.inHandle ? { ...overrides.inHandle } : null,
    outHandle: overrides.outHandle ? { ...overrides.outHandle } : null,
    nodeType: overrides.nodeType ?? "corner",
  };
}

export function createEmptyDocument(): VectorDocument {
  return { version: 1, units: "mm", revision: 0, paths: [], pathOrder: [], texts: [], textOrder: [] };
}

export function cloneVectorPath(path: VectorPath): VectorPath {
  return {
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      anchor: { ...node.anchor },
      inHandle: node.inHandle ? { ...node.inHandle } : null,
      outHandle: node.outHandle ? { ...node.outHandle } : null,
    })),
  };
}

export function cloneVectorDocument(document: VectorDocument): VectorDocument {
  return {
    ...document,
    paths: document.paths.map(cloneVectorPath),
    pathOrder: [...document.pathOrder],
    texts: (document.texts ?? []).map((text) => ({ ...text, position: { ...text.position }, pathIds: [...text.pathIds] })),
    textOrder: [...(document.textOrder ?? [])],
  };
}

export function orderedPaths(document: VectorDocument) {
  const byId = new Map(document.paths.map((path) => [path.id, path]));
  const ordered = document.pathOrder.map((id) => byId.get(id)).filter((path): path is VectorPath => Boolean(path));
  const known = new Set(ordered.map((path) => path.id));
  return [...ordered, ...document.paths.filter((path) => !known.has(path.id))];
}

export function commitDocument(
  current: VectorDocument,
  paths: VectorPath[],
  pathOrder = current.pathOrder,
  textState?: { texts: VectorText[]; textOrder?: string[] },
): VectorDocument {
  const validIds = new Set(paths.map((path) => path.id));
  const nextOrder = pathOrder.filter((id) => validIds.has(id));
  paths.forEach((path) => {
    if (!nextOrder.includes(path.id)) nextOrder.push(path.id);
  });
  const texts = (textState?.texts ?? current.texts ?? []).map((text) => ({ ...text, position: { ...text.position }, pathIds: [...text.pathIds] }));
  const validTextIds = new Set(texts.map((text) => text.id));
  const nextTextOrder = (textState?.textOrder ?? current.textOrder ?? []).filter((id) => validTextIds.has(id));
  texts.forEach((text) => { if (!nextTextOrder.includes(text.id)) nextTextOrder.push(text.id); });
  latestRevision = Math.max(latestRevision + 1, current.revision + 1);
  return {
    version: 1,
    units: "mm",
    revision: latestRevision,
    paths,
    pathOrder: nextOrder,
    texts,
    textOrder: nextTextOrder,
  };
}

export function isFiniteVec2(value: Vec2) {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}
