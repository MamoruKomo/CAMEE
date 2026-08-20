import { createId, createVectorNode, commitDocument, type Vec2, type VectorDocument, type VectorPath, type VectorText } from "./types";

type SegmentName = "top" | "upperRight" | "lowerRight" | "bottom" | "lowerLeft" | "upperLeft" | "middleLeft" | "middleRight" | "diagUpperLeft" | "diagUpperRight" | "diagLowerLeft" | "diagLowerRight" | "centerUpper" | "centerLower";

const SEGMENTS: Record<SegmentName, [Vec2, Vec2]> = {
  top: [{ x: 0.08, y: 1 }, { x: 0.62, y: 1 }],
  upperRight: [{ x: 0.7, y: 0.94 }, { x: 0.7, y: 0.56 }],
  lowerRight: [{ x: 0.7, y: 0.44 }, { x: 0.7, y: 0.06 }],
  bottom: [{ x: 0.08, y: 0 }, { x: 0.62, y: 0 }],
  lowerLeft: [{ x: 0, y: 0.06 }, { x: 0, y: 0.44 }],
  upperLeft: [{ x: 0, y: 0.56 }, { x: 0, y: 0.94 }],
  middleLeft: [{ x: 0.08, y: 0.5 }, { x: 0.32, y: 0.5 }],
  middleRight: [{ x: 0.38, y: 0.5 }, { x: 0.62, y: 0.5 }],
  diagUpperLeft: [{ x: 0.06, y: 0.94 }, { x: 0.32, y: 0.54 }],
  diagUpperRight: [{ x: 0.64, y: 0.94 }, { x: 0.38, y: 0.54 }],
  diagLowerLeft: [{ x: 0.06, y: 0.06 }, { x: 0.32, y: 0.46 }],
  diagLowerRight: [{ x: 0.64, y: 0.06 }, { x: 0.38, y: 0.46 }],
  centerUpper: [{ x: 0.35, y: 0.96 }, { x: 0.35, y: 0.54 }],
  centerLower: [{ x: 0.35, y: 0.46 }, { x: 0.35, y: 0.04 }],
};

const BOTH_MIDDLE: SegmentName[] = ["middleLeft", "middleRight"];
const OUTER: SegmentName[] = ["top", "upperRight", "lowerRight", "bottom", "lowerLeft", "upperLeft"];
const GLYPHS: Record<string, SegmentName[]> = {
  "0": OUTER, "1": ["upperRight", "lowerRight"], "2": ["top", "upperRight", ...BOTH_MIDDLE, "lowerLeft", "bottom"],
  "3": ["top", "upperRight", "lowerRight", "bottom", ...BOTH_MIDDLE], "4": ["upperLeft", "upperRight", ...BOTH_MIDDLE, "lowerRight"],
  "5": ["top", "upperLeft", ...BOTH_MIDDLE, "lowerRight", "bottom"], "6": ["top", "upperLeft", "lowerLeft", "bottom", "lowerRight", ...BOTH_MIDDLE],
  "7": ["top", "upperRight", "lowerRight"], "8": [...OUTER, ...BOTH_MIDDLE], "9": ["top", "upperLeft", "upperRight", ...BOTH_MIDDLE, "lowerRight", "bottom"],
  A: ["top", "upperLeft", "lowerLeft", "upperRight", "lowerRight", ...BOTH_MIDDLE], B: ["top", "upperLeft", "lowerLeft", "bottom", "upperRight", "lowerRight", ...BOTH_MIDDLE],
  C: ["top", "upperLeft", "lowerLeft", "bottom"], D: OUTER, E: ["top", "upperLeft", "lowerLeft", "bottom", ...BOTH_MIDDLE], F: ["top", "upperLeft", "lowerLeft", ...BOTH_MIDDLE],
  G: ["top", "upperLeft", "lowerLeft", "bottom", "lowerRight", "middleRight"], H: ["upperLeft", "lowerLeft", "upperRight", "lowerRight", ...BOTH_MIDDLE],
  I: ["top", "bottom", "centerUpper", "centerLower"], J: ["upperRight", "lowerRight", "bottom", "lowerLeft"], K: ["upperLeft", "lowerLeft", "diagUpperRight", "diagLowerRight"],
  L: ["upperLeft", "lowerLeft", "bottom"], M: ["upperLeft", "lowerLeft", "upperRight", "lowerRight", "diagUpperLeft", "diagUpperRight"],
  N: ["upperLeft", "lowerLeft", "upperRight", "lowerRight", "diagUpperLeft", "diagLowerRight"], O: OUTER,
  P: ["top", "upperLeft", "lowerLeft", "upperRight", ...BOTH_MIDDLE], Q: [...OUTER, "diagLowerRight"], R: ["top", "upperLeft", "lowerLeft", "upperRight", ...BOTH_MIDDLE, "diagLowerRight"],
  S: ["top", "upperLeft", ...BOTH_MIDDLE, "lowerRight", "bottom"], T: ["top", "centerUpper", "centerLower"], U: ["upperLeft", "lowerLeft", "upperRight", "lowerRight", "bottom"],
  V: ["upperLeft", "upperRight", "diagLowerLeft", "diagLowerRight"], W: ["upperLeft", "lowerLeft", "upperRight", "lowerRight", "diagLowerLeft", "diagLowerRight"],
  X: ["diagUpperLeft", "diagUpperRight", "diagLowerLeft", "diagLowerRight"], Y: ["diagUpperLeft", "diagUpperRight", "centerLower"], Z: ["top", "diagUpperRight", "diagLowerLeft", "bottom"],
  "-": BOTH_MIDDLE, "+": [...BOTH_MIDDLE, "centerUpper", "centerLower"], "=": ["top", ...BOTH_MIDDLE, "bottom"],
  "/": ["diagUpperRight", "diagLowerLeft"], "\\": ["diagUpperLeft", "diagLowerRight"], "?": ["top", "upperRight", "middleRight", "centerLower"],
};

export const CUTPATH_STROKE_FONT = {
  id: "cutpath-simplex" as const,
  name: "CutPath Simplex",
  checksum: "cutpath-simplex-14seg-v1" as const,
  outlineVersion: 1 as const,
  supported: "A-Z 0-9 - + = / \\ ? and spaces",
};

function rotate(point: Vec2, origin: Vec2, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return { x: origin.x + x * cosine - y * sine, y: origin.y + x * sine + y * cosine };
}

export function createVectorText(position: Vec2, text = "TEXT"): VectorText {
  return {
    id: createId("text"),
    name: "文字",
    text,
    fontId: CUTPATH_STROKE_FONT.id,
    fontChecksum: CUTPATH_STROKE_FONT.checksum,
    outlineVersion: CUTPATH_STROKE_FONT.outlineVersion,
    fontSizeMm: 12,
    letterSpacingMm: 1.5,
    lineHeightMm: 15,
    align: "left",
    position: { ...position },
    rotationDegrees: 0,
    strokeWidthMm: 0.5,
    visible: true,
    locked: false,
    pathIds: [],
  };
}

export function textLineWidth(text: VectorText, line: string) {
  const glyphAdvance = text.fontSizeMm * 0.82;
  return line.length ? line.length * glyphAdvance + Math.max(0, line.length - 1) * text.letterSpacingMm : 0;
}

export function buildTextPaths(text: VectorText) {
  if (text.fontId !== CUTPATH_STROKE_FONT.id || text.fontChecksum !== CUTPATH_STROKE_FONT.checksum || text.outlineVersion !== CUTPATH_STROKE_FONT.outlineVersion) {
    throw new Error("文字フォントの識別情報が一致しません。CAMへ変換できません。");
  }
  if (![text.fontSizeMm, text.letterSpacingMm, text.lineHeightMm, text.rotationDegrees, text.strokeWidthMm, text.position.x, text.position.y].every(Number.isFinite)) {
    throw new Error("文字GeometryにNaNまたはInfinityがあります。");
  }
  if (text.fontSizeMm <= 0 || text.lineHeightMm <= 0 || text.letterSpacingMm < 0 || text.strokeWidthMm < 0) throw new Error("文字サイズ、行間、字間、表示線幅が不正です。");
  const paths: VectorPath[] = [];
  const unsupported = new Set<string>();
  const glyphAdvance = text.fontSizeMm * 0.82;
  text.text.split("\n").forEach((line, lineIndex) => {
    const width = textLineWidth(text, line);
    const alignOffset = text.align === "center" ? -width / 2 : text.align === "right" ? -width : 0;
    Array.from(line).forEach((rawCharacter, characterIndex) => {
      if (rawCharacter === " ") return;
      const character = rawCharacter.toUpperCase();
      const glyph = GLYPHS[character] ?? GLYPHS["?"];
      if (!GLYPHS[character]) unsupported.add(rawCharacter);
      const baseX = text.position.x + alignOffset + characterIndex * (glyphAdvance + text.letterSpacingMm);
      const baseY = text.position.y - lineIndex * text.lineHeightMm;
      glyph.forEach((segmentName, segmentIndex) => {
        const [start, end] = SEGMENTS[segmentName];
        const worldStart = rotate({ x: baseX + start.x * text.fontSizeMm, y: baseY + start.y * text.fontSizeMm }, text.position, text.rotationDegrees);
        const worldEnd = rotate({ x: baseX + end.x * text.fontSizeMm, y: baseY + end.y * text.fontSizeMm }, text.position, text.rotationDegrees);
        paths.push({
          id: createId("path"),
          name: `${text.name} ${lineIndex + 1}-${characterIndex + 1}-${segmentIndex + 1}`,
          closed: false,
          nodes: [createVectorNode(worldStart), createVectorNode(worldEnd)],
          visible: text.visible,
          locked: text.locked,
          sourceTextId: text.id,
          style: { strokeWidthMm: text.strokeWidthMm },
        });
      });
    });
  });
  return { paths, unsupportedCharacters: [...unsupported] };
}

export function insertVectorText(document: VectorDocument, text: VectorText) {
  const generated = buildTextPaths(text).paths;
  const stored = { ...text, position: { ...text.position }, pathIds: generated.map((path) => path.id) };
  return commitDocument(
    document,
    [...document.paths, ...generated],
    [...document.pathOrder, ...generated.map((path) => path.id)],
    { texts: [...(document.texts ?? []), stored], textOrder: [...(document.textOrder ?? []), text.id] },
  );
}

export function updateVectorText(document: VectorDocument, textId: string, patch: Partial<Omit<VectorText, "id" | "pathIds" | "fontId" | "fontChecksum" | "outlineVersion">>) {
  const source = (document.texts ?? []).find((text) => text.id === textId);
  if (!source) throw new Error("編集する文字がありません。");
  const nextText: VectorText = { ...source, ...patch, position: patch.position ? { ...patch.position } : { ...source.position }, pathIds: [] };
  const generated = buildTextPaths(nextText).paths;
  nextText.pathIds = generated.map((path) => path.id);
  const oldIds = new Set(source.pathIds);
  const paths = [...document.paths.filter((path) => !oldIds.has(path.id)), ...generated];
  const pathOrder = [...document.pathOrder.filter((id) => !oldIds.has(id)), ...generated.map((path) => path.id)];
  const texts = (document.texts ?? []).map((text) => text.id === textId ? nextText : text);
  return commitDocument(document, paths, pathOrder, { texts, textOrder: document.textOrder });
}

export function deleteVectorText(document: VectorDocument, textId: string) {
  const source = (document.texts ?? []).find((text) => text.id === textId);
  if (!source) return document;
  const oldIds = new Set(source.pathIds);
  return commitDocument(
    document,
    document.paths.filter((path) => !oldIds.has(path.id)),
    document.pathOrder.filter((id) => !oldIds.has(id)),
    { texts: (document.texts ?? []).filter((text) => text.id !== textId), textOrder: (document.textOrder ?? []).filter((id) => id !== textId) },
  );
}

export function outlineVectorText(document: VectorDocument, textId: string) {
  const source = (document.texts ?? []).find((text) => text.id === textId);
  if (!source) return document;
  const pathIds = new Set(source.pathIds);
  const paths = document.paths.map((path) => pathIds.has(path.id) ? { ...path, sourceTextId: undefined, name: `${source.name} アウトライン`, locked: false } : path);
  return commitDocument(document, paths, document.pathOrder, {
    texts: (document.texts ?? []).filter((text) => text.id !== textId),
    textOrder: (document.textOrder ?? []).filter((id) => id !== textId),
  });
}

export function textForSelectedPaths(document: VectorDocument, selectedPathIds: string[]) {
  const selected = new Set(selectedPathIds);
  return (document.texts ?? []).find((text) => text.pathIds.some((id) => selected.has(id))) ?? null;
}
