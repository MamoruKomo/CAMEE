import { applySvgMatrixToPath, identityMatrix, multiplyMatrices, parseSvgTransform, type AffineMatrix } from "./matrix";
import { createEllipsePath, createLinePath, createRectanglePath } from "./shapes";
import { getVectorBounds } from "./transform";
import { createId, createVectorNode, orderedPaths, type Vec2, type VectorDocument, type VectorNode, type VectorPath } from "./types";

function number(value: string | undefined, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error("SVGに不正な数値があります。");
  return parsed;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function format(value: number) {
  const clean = Math.abs(value) < 1e-10 ? 0 : value;
  return Number(clean.toFixed(6)).toString();
}

export function vectorPathToSvgData(path: VectorPath) {
  if (!path.nodes.length) return "";
  const parts = [`M ${format(path.nodes[0].anchor.x)} ${format(-path.nodes[0].anchor.y)}`];
  const count = path.closed ? path.nodes.length : path.nodes.length - 1;
  for (let index = 0; index < count; index += 1) {
    const start = path.nodes[index];
    const end = path.nodes[(index + 1) % path.nodes.length];
    if (!start.outHandle && !end.inHandle) parts.push(`L ${format(end.anchor.x)} ${format(-end.anchor.y)}`);
    else {
      const c1 = start.outHandle ? { x: start.anchor.x + start.outHandle.x, y: start.anchor.y + start.outHandle.y } : start.anchor;
      const c2 = end.inHandle ? { x: end.anchor.x + end.inHandle.x, y: end.anchor.y + end.inHandle.y } : end.anchor;
      parts.push(`C ${format(c1.x)} ${format(-c1.y)} ${format(c2.x)} ${format(-c2.y)} ${format(end.anchor.x)} ${format(-end.anchor.y)}`);
    }
  }
  if (path.closed) parts.push("Z");
  return parts.join(" ");
}

export function exportVectorDocumentToSvg(document: VectorDocument) {
  const paths = orderedPaths(document).filter((path) => path.visible && path.nodes.length >= 2);
  const bounds = getVectorBounds(paths);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const minX = bounds.width ? bounds.minX : bounds.minX - 0.5;
  const minY = bounds.height ? -bounds.maxY : -bounds.maxY - 0.5;
  const body = paths.map((path) => `  <path id="${escapeXml(path.id)}" data-name="${escapeXml(path.name)}" d="${vectorPathToSvgData(path)}" fill="none" stroke="#111" stroke-width="${format(path.style?.strokeWidthMm ?? 0.2)}"/>`).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}mm" height="${format(height)}mm" viewBox="${format(minX)} ${format(minY)} ${format(width)} ${format(height)}">`,
    body,
    "</svg>",
    "",
  ].join("\n");
}

function attributes(source: string) {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  return result;
}

function svgNodeToWorld(node: VectorNode): VectorNode {
  return {
    ...node,
    anchor: { x: node.anchor.x, y: -node.anchor.y },
    inHandle: node.inHandle ? { x: node.inHandle.x, y: -node.inHandle.y } : null,
    outHandle: node.outHandle ? { x: node.outHandle.x, y: -node.outHandle.y } : null,
  };
}

type SvgCubic = { c1: Vec2; c2: Vec2; end: Vec2 };

function vectorAngle(a: Vec2, b: Vec2) {
  const denominator = Math.max(1e-12, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / denominator));
  return Math.sign(a.x * b.y - a.y * b.x || 1) * Math.acos(cosine);
}

export function svgArcToCubics(start: Vec2, end: Vec2, radiusX: number, radiusY: number, rotationDegrees: number, largeArc: boolean, sweep: boolean): SvgCubic[] {
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx < 1e-12 || ry < 1e-12 || (Math.abs(start.x - end.x) < 1e-12 && Math.abs(start.y - end.y) < 1e-12)) return [];
  const phi = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(phi);
  const sine = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1 = cosine * dx + sine * dy;
  const y1 = -sine * dx + cosine * dy;
  const scale = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
  if (scale > 1) {
    const factor = Math.sqrt(scale);
    rx *= factor;
    ry *= factor;
  }
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1);
  const denominator = Math.max(1e-12, rx * rx * y1 * y1 + ry * ry * x1 * x1);
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(numerator / denominator);
  const centerPrime = { x: coefficient * rx * y1 / ry, y: coefficient * -ry * x1 / rx };
  const center = {
    x: cosine * centerPrime.x - sine * centerPrime.y + (start.x + end.x) / 2,
    y: sine * centerPrime.x + cosine * centerPrime.y + (start.y + end.y) / 2,
  };
  const startVector = { x: (x1 - centerPrime.x) / rx, y: (y1 - centerPrime.y) / ry };
  const endVector = { x: (-x1 - centerPrime.x) / rx, y: (-y1 - centerPrime.y) / ry };
  const startAngle = vectorAngle({ x: 1, y: 0 }, startVector);
  let sweepAngle = vectorAngle(startVector, endVector);
  if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2;
  if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2;
  const segmentCount = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)));
  const segmentAngle = sweepAngle / segmentCount;
  const pointAt = (angle: number) => ({
    x: center.x + cosine * rx * Math.cos(angle) - sine * ry * Math.sin(angle),
    y: center.y + sine * rx * Math.cos(angle) + cosine * ry * Math.sin(angle),
  });
  const derivativeAt = (angle: number) => ({
    x: -cosine * rx * Math.sin(angle) - sine * ry * Math.cos(angle),
    y: -sine * rx * Math.sin(angle) + cosine * ry * Math.cos(angle),
  });
  return Array.from({ length: segmentCount }, (_, index) => {
    const angle1 = startAngle + segmentAngle * index;
    const angle2 = angle1 + segmentAngle;
    const factor = 4 / 3 * Math.tan(segmentAngle / 4);
    const p1 = pointAt(angle1);
    const p2 = pointAt(angle2);
    const d1 = derivativeAt(angle1);
    const d2 = derivativeAt(angle2);
    return {
      c1: { x: p1.x + d1.x * factor, y: p1.y + d1.y * factor },
      c2: { x: p2.x - d2.x * factor, y: p2.y - d2.y * factor },
      end: index === segmentCount - 1 ? { ...end } : p2,
    };
  });
}

function parsePathData(data: string, name: string) {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const paths: VectorPath[] = [];
  let index = 0;
  let command = "";
  let previousCommand = "";
  let current: Vec2 = { x: 0, y: 0 };
  let subpathStart: Vec2 = { x: 0, y: 0 };
  let lastCubicControl: Vec2 | null = null;
  let lastQuadraticControl: Vec2 | null = null;
  let nodes: VectorNode[] = [];
  let subpathIndex = 0;
  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const read = () => {
    const token = tokens[index];
    if (token === undefined || isCommand(token)) throw new Error("SVG path commandの引数が不足しています。");
    index += 1;
    return number(token);
  };
  const readPoint = (relative: boolean) => {
    const point = { x: read(), y: read() };
    return relative ? { x: current.x + point.x, y: current.y + point.y } : point;
  };
  const resetControls = () => { lastCubicControl = null; lastQuadraticControl = null; };
  const appendLine = (end: Vec2) => { nodes.push(createVectorNode(end)); current = end; resetControls(); };
  const appendCubic = (c1: Vec2, c2: Vec2, end: Vec2) => {
    const previous = nodes[nodes.length - 1];
    previous.outHandle = { x: c1.x - current.x, y: c1.y - current.y };
    nodes.push(createVectorNode(end, { inHandle: { x: c2.x - end.x, y: c2.y - end.y }, nodeType: "smooth" }));
    current = end;
  };
  const flush = (closed: boolean) => {
    if (nodes.length >= 2) {
      paths.push({ id: createId("path"), name: subpathIndex ? `${name} ${subpathIndex + 1}` : name, closed, nodes: nodes.map(svgNodeToWorld), visible: true, locked: false });
      subpathIndex += 1;
    }
    nodes = [];
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) { command = tokens[index]; index += 1; }
    if (!command) throw new Error("SVG pathはM commandから開始してください。");
    const lower = command.toLowerCase();
    const relative = command === lower;
    if (!["m", "l", "h", "v", "c", "s", "q", "t", "a", "z"].includes(lower)) throw new Error(`未対応のSVG commandです: ${command}`);
    if (lower === "z") {
      current = subpathStart;
      flush(true);
      resetControls();
      previousCommand = lower;
      command = "";
      continue;
    }
    if (lower === "m") {
      if (nodes.length) flush(false);
      current = readPoint(relative);
      subpathStart = current;
      nodes.push(createVectorNode(current));
      resetControls();
      previousCommand = lower;
      command = relative ? "l" : "L";
      continue;
    }
    if (!nodes.length) throw new Error("SVG subpathはM commandから開始してください。");
    if (lower === "l") appendLine(readPoint(relative));
    else if (lower === "h") { const x = read(); appendLine({ x: relative ? current.x + x : x, y: current.y }); }
    else if (lower === "v") { const y = read(); appendLine({ x: current.x, y: relative ? current.y + y : y }); }
    else if (lower === "c") {
      const c1 = readPoint(relative);
      const c2 = readPoint(relative);
      const end = readPoint(relative);
      appendCubic(c1, c2, end);
      lastCubicControl = c2;
      lastQuadraticControl = null;
    } else if (lower === "s") {
      const c1 = previousCommand === "c" || previousCommand === "s" ? { x: current.x * 2 - (lastCubicControl?.x ?? current.x), y: current.y * 2 - (lastCubicControl?.y ?? current.y) } : { ...current };
      const c2 = readPoint(relative);
      const end = readPoint(relative);
      appendCubic(c1, c2, end);
      lastCubicControl = c2;
      lastQuadraticControl = null;
    } else if (lower === "q" || lower === "t") {
      const control: Vec2 = lower === "q" ? readPoint(relative) : previousCommand === "q" || previousCommand === "t"
        ? { x: current.x * 2 - (lastQuadraticControl?.x ?? current.x), y: current.y * 2 - (lastQuadraticControl?.y ?? current.y) }
        : { ...current };
      const end = readPoint(relative);
      const c1 = { x: current.x + (control.x - current.x) * 2 / 3, y: current.y + (control.y - current.y) * 2 / 3 };
      const c2 = { x: end.x + (control.x - end.x) * 2 / 3, y: end.y + (control.y - end.y) * 2 / 3 };
      appendCubic(c1, c2, end);
      lastQuadraticControl = control;
      lastCubicControl = null;
    } else if (lower === "a") {
      const rx = read();
      const ry = read();
      const rotation = read();
      const largeArc = read();
      const sweep = read();
      const end = readPoint(relative);
      const cubics = svgArcToCubics(current, end, rx, ry, rotation, largeArc !== 0, sweep !== 0);
      if (!cubics.length) appendLine(end);
      else cubics.forEach((cubic) => appendCubic(cubic.c1, cubic.c2, cubic.end));
      resetControls();
    }
    previousCommand = lower;
  }
  flush(false);
  return paths;
}

function parsePoints(value: string) {
  const values = value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  if (values.length < 4 || values.length % 2 || values.some((value) => !Number.isFinite(value))) throw new Error("SVG points属性が不正です。");
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: -values[index * 2 + 1] }));
}

function shapePaths(tag: string, attrs: Record<string, string>, name: string): VectorPath[] {
  if (tag === "path") return parsePathData(attrs.d ?? "", name);
  if (tag === "line") return [createLinePath({ x: number(attrs.x1), y: -number(attrs.y1) }, { x: number(attrs.x2), y: -number(attrs.y2) }, name)];
  if (tag === "rect") {
    const x = number(attrs.x);
    const y = number(attrs.y);
    const width = number(attrs.width);
    const height = number(attrs.height);
    return [createRectanglePath({ x, y: -(y + height) }, { x: x + width, y: -y }, name)];
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = number(attrs.cx);
    const cy = -number(attrs.cy);
    const rx = number(tag === "circle" ? attrs.r : attrs.rx);
    const ry = number(tag === "circle" ? attrs.r : attrs.ry);
    return [createEllipsePath({ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry }, name)];
  }
  const points = parsePoints(attrs.points ?? "");
  return [{ id: createId("path"), name, closed: tag === "polygon", nodes: points.map((point) => createVectorNode(point)), visible: true, locked: false }];
}

export function importSvgToVectorDocument(source: string): VectorDocument {
  if (!/<svg\b/i.test(source)) throw new Error("SVG rootがありません。");
  const paths: VectorPath[] = [];
  const stack: AffineMatrix[] = [identityMatrix];
  const supportedShapes = new Set(["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"]);
  let shapeNumber = 0;
  for (const match of source.matchAll(/<(\/)?([a-zA-Z][\w:-]*)([^>]*)>/g)) {
    if (match[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tag = match[2].toLowerCase().replace(/^.*:/, "");
    const attrs = attributes(match[3]);
    const matrix = multiplyMatrices(stack[stack.length - 1], parseSvgTransform(attrs.transform));
    if (supportedShapes.has(tag)) {
      const name = attrs["data-name"] || attrs.id || `SVG ${++shapeNumber}`;
      const strokeWidth = Number.parseFloat(attrs["stroke-width"] ?? "");
      paths.push(...shapePaths(tag, attrs, name).map((path) => applySvgMatrixToPath({
        ...path,
        style: Number.isFinite(strokeWidth) && strokeWidth >= 0 ? { strokeWidthMm: strokeWidth } : path.style,
      }, matrix)));
    }
    if (!/\/\s*>$/.test(match[0])) stack.push(matrix);
  }
  if (!paths.length) throw new Error("SVG内に対応図形がありません。");
  return { version: 1, units: "mm", revision: 1, paths, pathOrder: paths.map((path) => path.id) };
}
