import DxfParser from "dxf-parser";
import { parseDxfText } from "@/lib/cam";
import { createCornerPath } from "./shapes";
import { createId, createVectorNode, type Vec2, type VectorDocument, type VectorPath } from "./types";

type DxfPoint = { x: number; y: number; z?: number; bulge?: number };
type DxfEntity = {
  type: string;
  vertices?: DxfPoint[];
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  angleLength?: number;
  extrusionDirectionZ?: number;
  shape?: boolean;
  closed?: boolean;
  majorAxisEndPoint?: DxfPoint;
  axisRatio?: number;
};

type CubicSegment = { start: Vec2; end: Vec2; c1?: Vec2; c2?: Vec2 };

function unitScale(value: unknown) {
  const scales: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
  return scales[typeof value === "number" ? value : 0] ?? 1;
}

function scaled(point: DxfPoint, scale: number): Vec2 {
  return { x: point.x * scale, y: point.y * scale };
}

function samePoint(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-7;
}

function arcSegments(center: Vec2, radius: number, startAngle: number, sweep: number): CubicSegment[] {
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const delta = sweep / count;
  return Array.from({ length: count }, (_, index) => {
    const start = startAngle + index * delta;
    const end = start + delta;
    const alpha = (4 / 3) * Math.tan(delta / 4);
    const p0 = { x: center.x + Math.cos(start) * radius, y: center.y + Math.sin(start) * radius };
    const p3 = { x: center.x + Math.cos(end) * radius, y: center.y + Math.sin(end) * radius };
    return {
      start: p0,
      end: p3,
      c1: { x: p0.x - Math.sin(start) * radius * alpha, y: p0.y + Math.cos(start) * radius * alpha },
      c2: { x: p3.x + Math.sin(end) * radius * alpha, y: p3.y - Math.cos(end) * radius * alpha },
    };
  });
}

function ellipseSegments(entity: DxfEntity, scale: number) {
  if (!entity.center || !entity.majorAxisEndPoint || !entity.axisRatio) return [];
  const center = scaled(entity.center, scale);
  const major = scaled(entity.majorAxisEndPoint, scale);
  const minor = { x: -major.y * entity.axisRatio, y: major.x * entity.axisRatio };
  const start = entity.startAngle ?? 0;
  let sweep = (entity.endAngle ?? Math.PI * 2) - start;
  if (sweep <= 0) sweep += Math.PI * 2;
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const delta = sweep / count;
  const pointAt = (angle: number): Vec2 => ({
    x: center.x + major.x * Math.cos(angle) + minor.x * Math.sin(angle),
    y: center.y + major.y * Math.cos(angle) + minor.y * Math.sin(angle),
  });
  const derivativeAt = (angle: number): Vec2 => ({
    x: -major.x * Math.sin(angle) + minor.x * Math.cos(angle),
    y: -major.y * Math.sin(angle) + minor.y * Math.cos(angle),
  });
  return Array.from({ length: count }, (_, index) => {
    const t0 = start + index * delta;
    const t1 = t0 + delta;
    const alpha = (4 / 3) * Math.tan(delta / 4);
    const p0 = pointAt(t0);
    const p3 = pointAt(t1);
    const d0 = derivativeAt(t0);
    const d1 = derivativeAt(t1);
    return {
      start: p0,
      end: p3,
      c1: { x: p0.x + d0.x * alpha, y: p0.y + d0.y * alpha },
      c2: { x: p3.x - d1.x * alpha, y: p3.y - d1.y * alpha },
    };
  });
}

function bulgeSegment(start: DxfPoint, end: DxfPoint, scale: number): CubicSegment[] {
  const p0 = scaled(start, scale);
  const p3 = scaled(end, scale);
  const bulge = start.bulge ?? 0;
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-10 || chord < 1e-10) return [{ start: p0, end: p3 }];
  const midpoint = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const normal = { x: -(p3.y - p0.y) / chord, y: (p3.x - p0.x) / chord };
  const center = { x: midpoint.x + normal.x * offset, y: midpoint.y + normal.y * offset };
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  return arcSegments(center, radius, Math.atan2(p0.y - center.y, p0.x - center.x), 4 * Math.atan(bulge));
}

function pathFromSegments(segments: CubicSegment[], closed: boolean, name: string): VectorPath | null {
  if (!segments.length) return null;
  const nodes = [createVectorNode(segments[0].start)];
  segments.forEach((segment, index) => {
    const current = nodes[nodes.length - 1];
    current.outHandle = segment.c1 ? { x: segment.c1.x - segment.start.x, y: segment.c1.y - segment.start.y } : null;
    const isClosing = closed && index === segments.length - 1 && samePoint(segment.end, nodes[0].anchor);
    if (isClosing) {
      nodes[0].inHandle = segment.c2 ? { x: segment.c2.x - segment.end.x, y: segment.c2.y - segment.end.y } : null;
      if (nodes[0].inHandle || current.outHandle) {
        nodes[0].nodeType = "smooth";
        current.nodeType = "smooth";
      }
    } else {
      nodes.push(createVectorNode(segment.end, {
        inHandle: segment.c2 ? { x: segment.c2.x - segment.end.x, y: segment.c2.y - segment.end.y } : null,
        nodeType: segment.c2 ? "smooth" : "corner",
      }));
      if (current.outHandle) current.nodeType = "smooth";
    }
  });
  return { id: createId("path"), name, closed, nodes, visible: true, locked: false };
}

function entityPath(entity: DxfEntity, scale: number, index: number): VectorPath | null {
  const name = `${entity.type} ${index + 1}`;
  if (entity.type === "LINE" && entity.vertices && entity.vertices.length >= 2) {
    return createCornerPath(entity.vertices.map((point) => scaled(point, scale)), false, name);
  }
  if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && entity.vertices?.length) {
    const closed = Boolean(entity.shape || entity.closed);
    const count = closed ? entity.vertices.length : entity.vertices.length - 1;
    const segments = Array.from({ length: Math.max(0, count) }, (_, vertexIndex) => bulgeSegment(
      entity.vertices![vertexIndex],
      entity.vertices![(vertexIndex + 1) % entity.vertices!.length],
      scale,
    )).flat();
    return pathFromSegments(segments, closed, name);
  }
  if ((entity.type === "ARC" || entity.type === "CIRCLE") && entity.center && entity.radius) {
    const closed = entity.type === "CIRCLE";
    const start = entity.startAngle ?? 0;
    let sweep = closed ? Math.PI * 2 : (entity.angleLength ?? (entity.endAngle ?? start) - start);
    if (!closed && sweep <= 0) sweep += Math.PI * 2;
    if ((entity.extrusionDirectionZ ?? 1) < 0) sweep *= -1;
    return pathFromSegments(arcSegments(scaled(entity.center, scale), entity.radius * scale, start, sweep), closed, name);
  }
  if (entity.type === "ELLIPSE") {
    const sweep = (entity.endAngle ?? Math.PI * 2) - (entity.startAngle ?? 0);
    return pathFromSegments(ellipseSegments(entity, scale), Math.abs(sweep) >= Math.PI * 2 - 1e-6, name);
  }
  return null;
}

export type DxfVectorImport = {
  document: VectorDocument;
  entityCount: number;
  unsupportedTypes: string[];
  sourceUnit: string;
  unitWarning?: string;
};

export function importDxfToVectorDocument(source: string): DxfVectorImport {
  const raw = new DxfParser().parseSync(source);
  if (!raw?.entities?.length) throw new Error("DXF内に加工可能な図形がありません。");
  const legacy = parseDxfText(source);
  const scale = unitScale(raw.header?.$INSUNITS);
  const entities = raw.entities as DxfEntity[];
  const paths = entities.map((entity, index) => entityPath(entity, scale, index)).filter((path): path is VectorPath => Boolean(path));
  legacy.paths.filter((path) => path.sourceType === "SPLINE").forEach((path, index) => {
    paths.push(createCornerPath(path.points.map((point) => ({ ...point })), path.closed, `SPLINE ${index + 1}`));
  });
  if (!paths.length) throw new Error("DXF内に編集可能な図形がありません。");
  return {
    document: { version: 1, units: "mm", revision: 1, paths, pathOrder: paths.map((path) => path.id) },
    entityCount: legacy.entityCount,
    unsupportedTypes: legacy.unsupportedTypes,
    sourceUnit: legacy.sourceUnit,
    unitWarning: legacy.unitWarning,
  };
}
