import { getVectorBounds } from "./transform";
import { createEllipsePath, createLinePath, createRectanglePath } from "./shapes";
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
    if (!start.outHandle && !end.inHandle) {
      parts.push(`L ${format(end.anchor.x)} ${format(-end.anchor.y)}`);
    } else {
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
  const body = paths.map((path) => `  <path id="${escapeXml(path.id)}" data-name="${escapeXml(path.name)}" d="${vectorPathToSvgData(path)}" fill="none" stroke="#111" stroke-width="0.2"/>`).join("\n");
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

function parsePathData(data: string, name: string) {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const paths: VectorPath[] = [];
  let index = 0;
  let command = "";
  let current: Vec2 = { x: 0, y: 0 };
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
  const flush = (closed: boolean) => {
    if (nodes.length >= 2) {
      paths.push({
        id: createId("path"),
        name: subpathIndex ? `${name} ${subpathIndex + 1}` : name,
        closed,
        nodes: nodes.map(svgNodeToWorld),
        visible: true,
        locked: false,
      });
      subpathIndex += 1;
    }
    nodes = [];
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index];
      index += 1;
    }
    if (!command) throw new Error("SVG pathはM commandから開始してください。");
    const lower = command.toLowerCase();
    const relative = command === lower;
    if (!["m", "l", "h", "v", "c", "z"].includes(lower)) throw new Error(`Phase 1A未対応のSVG commandです: ${command}`);
    if (lower === "z") {
      flush(true);
      command = "";
      continue;
    }
    if (lower === "m") {
      if (nodes.length) flush(false);
      current = readPoint(relative);
      nodes.push(createVectorNode(current));
      command = relative ? "l" : "L";
      continue;
    }
    if (!nodes.length) throw new Error("SVG subpathはM commandから開始してください。");
    if (lower === "l") {
      current = readPoint(relative);
      nodes.push(createVectorNode(current));
    } else if (lower === "h") {
      const x = read();
      current = { x: relative ? current.x + x : x, y: current.y };
      nodes.push(createVectorNode(current));
    } else if (lower === "v") {
      const y = read();
      current = { x: current.x, y: relative ? current.y + y : y };
      nodes.push(createVectorNode(current));
    } else if (lower === "c") {
      const c1 = readPoint(relative);
      const c2 = readPoint(relative);
      const end = readPoint(relative);
      const previous = nodes[nodes.length - 1];
      previous.outHandle = { x: c1.x - current.x, y: c1.y - current.y };
      nodes.push(createVectorNode(end, { inHandle: { x: c2.x - end.x, y: c2.y - end.y }, nodeType: "smooth" }));
      current = end;
    }
  }
  flush(false);
  return paths;
}

function parsePoints(value: string) {
  const values = value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  if (values.length < 4 || values.length % 2) throw new Error("SVG points属性が不正です。");
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: -values[index * 2 + 1] }));
}

export function importSvgToVectorDocument(source: string): VectorDocument {
  if (!/<svg\b/i.test(source)) throw new Error("SVG rootがありません。");
  const paths: VectorPath[] = [];
  let shapeNumber = 0;
  for (const match of source.matchAll(/<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[2]);
    const name = attrs["data-name"] || attrs.id || `SVG ${++shapeNumber}`;
    if (tag === "path") paths.push(...parsePathData(attrs.d ?? "", name));
    else if (tag === "line") paths.push(createLinePath({ x: number(attrs.x1), y: -number(attrs.y1) }, { x: number(attrs.x2), y: -number(attrs.y2) }, name));
    else if (tag === "rect") {
      const x = number(attrs.x);
      const y = number(attrs.y);
      const width = number(attrs.width);
      const height = number(attrs.height);
      paths.push(createRectanglePath({ x, y: -(y + height) }, { x: x + width, y: -y }, name));
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = number(attrs.cx);
      const cy = -number(attrs.cy);
      const rx = number(tag === "circle" ? attrs.r : attrs.rx);
      const ry = number(tag === "circle" ? attrs.r : attrs.ry);
      paths.push(createEllipsePath({ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry }, name));
    } else {
      const points = parsePoints(attrs.points ?? "");
      paths.push({ id: createId("path"), name, closed: tag === "polygon", nodes: points.map((point) => createVectorNode(point)), visible: true, locked: false });
    }
  }
  if (!paths.length) throw new Error("SVG内に対応図形がありません。");
  return { version: 1, units: "mm", revision: 1, paths, pathOrder: paths.map((path) => path.id) };
}
