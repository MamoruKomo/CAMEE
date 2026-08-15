import DxfParser from "dxf-parser";
import { CatmullRomCurve3, Curve, Vector3, Vector4 } from "three";
import { NURBSCurve } from "three/examples/jsm/curves/NURBSCurve.js";

export type Point2D = { x: number; y: number };

export type ToolPath = {
  id: string;
  points: Point2D[];
  closed: boolean;
  sourceType: string;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type ParsedDrawing = {
  paths: ToolPath[];
  bounds: Bounds;
  entityCount: number;
  unsupportedTypes: string[];
  sourceUnit: string;
  unitWarning?: string;
};

export type CamSettings = {
  finalDepth: number;
  stepDown: number;
  bitDiameter: number;
  feedRate: number;
  plungeRate: number;
  retractHeight: number;
  rapidFeed: number;
};

type DxfPoint = { x: number; y: number; z?: number; bulge?: number };
type DxfEntity = {
  type: string;
  visible?: boolean;
  vertices?: DxfPoint[];
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  angleLength?: number;
  extrusionDirectionZ?: number;
  shape?: boolean;
  closed?: boolean;
  controlPoints?: DxfPoint[];
  fitPoints?: DxfPoint[];
  knotValues?: number[];
  degreeOfSplineCurve?: number;
  majorAxisEndPoint?: DxfPoint;
  axisRatio?: number;
};

const JOIN_TOLERANCE = 0.08;
const CURVE_TOLERANCE = 0.08;

function samePoint(a: Point2D, b: Point2D, tolerance = JOIN_TOLERANCE) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function point(x: number, y: number, scale: number): Point2D {
  return { x: x * scale, y: y * scale };
}

function sampleCount(radius: number, sweep: number) {
  if (radius <= CURVE_TOLERANCE) return 2;
  const angleForTolerance = 2 * Math.acos(Math.max(-1, 1 - CURVE_TOLERANCE / radius));
  const maxAngle = Math.PI / 18;
  const segmentAngle = Math.max(0.002, Math.min(maxAngle, angleForTolerance || maxAngle));
  return Math.max(2, Math.min(4000, Math.ceil(Math.abs(sweep) / segmentAngle)));
}

function sampleArc(
  center: DxfPoint,
  radius: number,
  start: number,
  sweep: number,
  scale: number,
) {
  const count = sampleCount(radius * scale, sweep);
  const points: Point2D[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = start + (sweep * index) / count;
    points.push(point(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, scale));
  }
  return points;
}

function sampleBulge(start: DxfPoint, end: DxfPoint, bulge: number, scale: number) {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9 || chord === 0) {
    return [point(start.x, start.y, scale), point(end.x, end.y, scale)];
  }

  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const centerOffset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
  const center = {
    x: midpoint.x + normal.x * centerOffset,
    y: midpoint.y + normal.y * centerOffset,
  };
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const sweep = 4 * Math.atan(bulge);
  return sampleArc(center, radius, startAngle, sweep, scale);
}

function polylinePoints(vertices: DxfPoint[], closed: boolean, scale: number) {
  const result: Point2D[] = [];
  const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const segment = sampleBulge(start, end, start.bulge ?? 0, scale);
    if (result.length) segment.shift();
    result.push(...segment);
  }
  if (!closed && vertices.length === 1) result.push(point(vertices[0].x, vertices[0].y, scale));
  if (closed && result.length && !samePoint(result[0], result[result.length - 1])) {
    result.push({ ...result[0] });
  }
  return result;
}

function sampleCurveAdaptive(curve: Curve<Vector3>) {
  const output: Point2D[] = [];
  const start = curve.getPoint(0);
  const end = curve.getPoint(1);
  output.push({ x: start.x, y: start.y });

  const subdivide = (t0: number, t1: number, p0: Vector3, p1: Vector3, depth: number) => {
    const middleT = (t0 + t1) / 2;
    const middle = curve.getPoint(middleT);
    const line = new Vector3().subVectors(p1, p0);
    const lineLengthSq = line.lengthSq();
    const projection = lineLengthSq
      ? Math.max(0, Math.min(1, new Vector3().subVectors(middle, p0).dot(line) / lineLengthSq))
      : 0;
    const nearest = p0.clone().addScaledVector(line, projection);
    const deviation = nearest.distanceTo(middle);
    const chordLength = p0.distanceTo(p1);

    if (depth < 18 && (deviation > CURVE_TOLERANCE || chordLength > 5)) {
      subdivide(t0, middleT, p0, middle, depth + 1);
      subdivide(middleT, t1, middle, p1, depth + 1);
      return;
    }
    output.push({ x: p1.x, y: p1.y });
  };

  subdivide(0, 1, start, end, 0);
  return output;
}

function splinePoints(entity: DxfEntity, scale: number) {
  const controlPoints = entity.controlPoints ?? [];
  const fitPoints = entity.fitPoints ?? [];
  const basis = controlPoints.length >= 2 ? controlPoints : fitPoints;
  if (basis.length < 2) return [];

  try {
    if (controlPoints.length >= 2 && entity.knotValues?.length && entity.degreeOfSplineCurve) {
      const curve = new NURBSCurve(
        entity.degreeOfSplineCurve,
        entity.knotValues,
        controlPoints.map((value) => new Vector4(value.x * scale, value.y * scale, 0, 1)),
      );
      return sampleCurveAdaptive(curve);
    }

    const curve = new CatmullRomCurve3(
      fitPoints.map((value) => new Vector3(value.x * scale, value.y * scale, 0)),
      Boolean(entity.closed),
      "centripetal",
    );
    return sampleCurveAdaptive(curve);
  } catch {
    return basis.map((value) => point(value.x, value.y, scale));
  }
}

function ellipsePoints(entity: DxfEntity, scale: number) {
  if (!entity.center || !entity.majorAxisEndPoint || !entity.axisRatio) return [];
  const start = entity.startAngle ?? 0;
  let sweep = (entity.endAngle ?? Math.PI * 2) - start;
  if (sweep <= 0) sweep += Math.PI * 2;
  const major = entity.majorAxisEndPoint;
  const majorRadius = Math.hypot(major.x, major.y);
  const count = sampleCount(majorRadius * scale, sweep);
  const angle = Math.atan2(major.y, major.x);
  const points: Point2D[] = [];
  for (let index = 0; index <= count; index += 1) {
    const parameter = start + (sweep * index) / count;
    const majorPart = majorRadius * Math.cos(parameter);
    const minorPart = majorRadius * entity.axisRatio * Math.sin(parameter);
    const x = entity.center.x + majorPart * Math.cos(angle) - minorPart * Math.sin(angle);
    const y = entity.center.y + majorPart * Math.sin(angle) + minorPart * Math.cos(angle);
    points.push(point(x, y, scale));
  }
  return points;
}

function entityToPath(entity: DxfEntity, scale: number, index: number): ToolPath | null {
  let points: Point2D[] = [];
  let closed = false;

  if (entity.type === "LINE" && entity.vertices?.length) {
    points = entity.vertices.map((value) => point(value.x, value.y, scale));
  } else if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && entity.vertices?.length) {
    closed = Boolean(entity.shape);
    points = polylinePoints(entity.vertices, closed, scale);
  } else if ((entity.type === "ARC" || entity.type === "CIRCLE") && entity.center && entity.radius) {
    closed = entity.type === "CIRCLE";
    const start = entity.startAngle ?? 0;
    let sweep = closed ? Math.PI * 2 : (entity.angleLength ?? (entity.endAngle ?? start) - start);
    if (!closed && sweep <= 0) sweep += Math.PI * 2;
    if ((entity.extrusionDirectionZ ?? 1) < 0) sweep *= -1;
    points = sampleArc(entity.center, entity.radius, start, sweep, scale);
  } else if (entity.type === "SPLINE") {
    closed = Boolean(entity.closed);
    points = splinePoints(entity, scale);
  } else if (entity.type === "ELLIPSE") {
    points = ellipsePoints(entity, scale);
    closed = Math.abs((entity.endAngle ?? Math.PI * 2) - (entity.startAngle ?? 0)) >= Math.PI * 2 - 1e-6;
  }

  if (points.length < 2) return null;
  if (closed && !samePoint(points[0], points[points.length - 1])) points.push({ ...points[0] });
  return { id: `${entity.type}-${index}`, points, closed, sourceType: entity.type };
}

function mergePaths(input: ToolPath[]) {
  const pending = input.map((path) => ({ ...path, points: [...path.points] }));
  const merged: ToolPath[] = [];

  while (pending.length) {
    const current = pending.shift()!;
    if (current.closed) {
      merged.push(current);
      continue;
    }

    let changed = true;
    while (changed) {
      changed = false;
      const start = current.points[0];
      const end = current.points[current.points.length - 1];
      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index];
        if (candidate.closed) continue;
        const candidateStart = candidate.points[0];
        const candidateEnd = candidate.points[candidate.points.length - 1];

        if (samePoint(end, candidateStart)) {
          current.points.push(...candidate.points.slice(1));
        } else if (samePoint(end, candidateEnd)) {
          current.points.push(...[...candidate.points].reverse().slice(1));
        } else if (samePoint(start, candidateEnd)) {
          current.points.unshift(...candidate.points.slice(0, -1));
        } else if (samePoint(start, candidateStart)) {
          current.points.unshift(...[...candidate.points].reverse().slice(0, -1));
        } else {
          continue;
        }

        pending.splice(index, 1);
        changed = true;
        break;
      }
    }

    current.closed = samePoint(current.points[0], current.points[current.points.length - 1]);
    merged.push(current);
  }

  return merged;
}

function unitScale(value: unknown) {
  const unit = typeof value === "number" ? value : 0;
  const scales: Record<number, { scale: number; label: string }> = {
    0: { scale: 1, label: "単位指定なし（mmとして読込）" },
    1: { scale: 25.4, label: "inch" },
    2: { scale: 304.8, label: "feet" },
    4: { scale: 1, label: "mm" },
    5: { scale: 10, label: "cm" },
    6: { scale: 1000, label: "m" },
  };
  return scales[unit] ?? { scale: 1, label: `DXF単位コード ${unit}` };
}

export function getBounds(paths: ToolPath[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach((path) => path.points.forEach((value) => {
    minX = Math.min(minX, value.x);
    minY = Math.min(minY, value.y);
    maxX = Math.max(maxX, value.x);
    maxY = Math.max(maxY, value.y);
  }));
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function parseDxfText(source: string): ParsedDrawing {
  const parsed = new DxfParser().parseSync(source);
  if (!parsed?.entities?.length) throw new Error("DXF内に加工可能な図形がありません。");

  const units = unitScale(parsed.header?.$INSUNITS);
  const entities = parsed.entities as DxfEntity[];
  const supported = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "SPLINE", "ELLIPSE"]);
  const unsupportedTypes = [...new Set(entities.filter((entity) => !supported.has(entity.type)).map((entity) => entity.type))];
  const paths = mergePaths(
    entities
      .filter((entity) => entity.visible !== false)
      .map((entity, index) => entityToPath(entity, units.scale, index))
      .filter((path): path is ToolPath => Boolean(path)),
  );

  if (!paths.length) throw new Error("直線、ポリライン、円弧、円、スプラインのいずれかが必要です。");
  return {
    paths,
    bounds: getBounds(paths),
    entityCount: entities.length,
    unsupportedTypes,
    sourceUnit: units.label,
    unitWarning: units.label.includes("単位指定なし") || units.label.startsWith("DXF単位") ? units.label : undefined,
  };
}

export function pathsForOrigin(paths: ToolPath[], origin: "lower-left" | "dxf") {
  if (origin === "dxf") return paths;
  const bounds = getBounds(paths);
  return paths.map((path) => ({
    ...path,
    points: path.points.map((value) => ({ x: value.x - bounds.minX, y: value.y - bounds.minY })),
  }));
}

export function buildPassDepths(finalDepth: number, stepDown: number) {
  if (!Number.isFinite(finalDepth) || !Number.isFinite(stepDown) || finalDepth <= 0 || stepDown <= 0) return [];
  const count = Math.ceil(finalDepth / stepDown);
  if (count > 100) throw new Error("加工回数が100回を超えます。1回の深さを大きくしてください。");
  return Array.from({ length: count }, (_, index) => Math.min(finalDepth, stepDown * (index + 1)));
}

function cleanNumber(value: number) {
  return Math.abs(value) < 0.0005 ? 0 : value;
}

function format(value: number) {
  return cleanNumber(value).toFixed(3);
}

export function generateGcode(paths: ToolPath[], settings: CamSettings, fileName: string) {
  const depths = buildPassDepths(settings.finalDepth, settings.stepDown);
  if (!paths.length || !depths.length) throw new Error("パスと加工深さを確認してください。");
  if (settings.bitDiameter <= 0 || settings.feedRate <= 0 || settings.plungeRate <= 0) {
    throw new Error("ビット径と送り速度は0より大きい値にしてください。");
  }

  const lines = [
    "; CNC V4.0",
    `; Source: ${fileName.replace(/[^\x20-\x7E]/g, "_")}`,
    `; Tool: straight D${format(settings.bitDiameter)} mm`,
    "; Z0 = material top. Start the router manually before cycle start.",
    "G21",
    "G90",
    `G0 X0.000 Y0.000 F${Math.round(settings.rapidFeed)}`,
  ];

  let cuttingStarted = false;
  depths.forEach((depth, passIndex) => {
    lines.push(`; Pass ${passIndex + 1}/${depths.length} Z-${format(depth)}`);
    paths.forEach((path) => {
      const start = path.points[0];
      if (cuttingStarted) lines.push(`G0 Z${format(settings.retractHeight)}`);
      lines.push(`G0 X${format(start.x)} Y${format(start.y)}`);
      lines.push(`G1 Z-${format(depth)} F${format(settings.plungeRate)}`);
      path.points.slice(1).forEach((value, pointIndex) => {
        const feed = pointIndex === 0 ? ` F${format(settings.feedRate)}` : "";
        lines.push(`G1 X${format(value.x)} Y${format(value.y)}${feed}`);
      });
      cuttingStarted = true;
    });
  });

  if (cuttingStarted) lines.push(`G0 Z${format(settings.retractHeight)}`);
  lines.push("M5", "");
  return lines.join("\n");
}

export function estimateMinutes(paths: ToolPath[], settings: CamSettings) {
  const depths = buildPassDepths(settings.finalDepth, settings.stepDown);
  if (!depths.length || settings.feedRate <= 0 || settings.plungeRate <= 0) return 0;
  const pathDistance = paths.reduce((total, path) => total + path.points.slice(1).reduce((pathTotal, value, index) => {
    const previous = path.points[index];
    return pathTotal + Math.hypot(value.x - previous.x, value.y - previous.y);
  }, 0), 0);
  const plungeDistance = depths.reduce((total, depth) => total + depth * paths.length, 0);
  return (pathDistance * depths.length) / settings.feedRate + plungeDistance / settings.plungeRate;
}
