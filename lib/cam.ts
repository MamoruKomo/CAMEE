import DxfParser from "dxf-parser";
import { CatmullRomCurve3, Curve, Vector3, Vector4 } from "three";
import { NURBSCurve } from "three/examples/jsm/curves/NURBSCurve.js";

export type Point2D = { x: number; y: number };

export type CornerReliefType = "dogbone" | "tbone";

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
  rampEnabled: boolean;
  rampLength: number;
};

export type RampPoint = Point2D & { depth: number };

export type ClosePathsResult = {
  paths: ToolPath[];
  joinedCount: number;
  closedCount: number;
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

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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

function pathWithoutClosingDuplicate(path: ToolPath) {
  const points = path.points.map((value) => ({ ...value }));
  if (path.closed && points.length > 1 && samePoint(points[0], points[points.length - 1], 1e-6)) {
    points.pop();
  }
  return points;
}

export function getCornerIndices(path: ToolPath) {
  const points = pathWithoutClosingDuplicate(path);
  if (points.length < 3) return [];
  const first = path.closed ? 0 : 1;
  const last = path.closed ? points.length - 1 : points.length - 2;
  const corners: number[] = [];

  for (let index = first; index <= last; index += 1) {
    const previousIndex = (index - 1 + points.length) % points.length;
    const nextIndex = (index + 1) % points.length;
    const previous = points[previousIndex];
    const current = points[index];
    const next = points[nextIndex];
    const previousLength = distance(previous, current);
    const nextLength = distance(current, next);
    if (previousLength < 1e-6 || nextLength < 1e-6) continue;

    // Relief points use a corner -> excursion -> same corner pattern. Hide all
    // three generated nodes from the next editing pass.
    const twoBefore = points[(index - 2 + points.length) % points.length];
    const twoAfter = points[(index + 2) % points.length];
    if (samePoint(previous, next, 1e-6)
      || samePoint(current, twoBefore, 1e-6)
      || samePoint(current, twoAfter, 1e-6)) continue;

    const incoming = { x: previous.x - current.x, y: previous.y - current.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const dot = (incoming.x * outgoing.x + incoming.y * outgoing.y) / (previousLength * nextLength);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle < Math.PI * 0.97) corners.push(index);
  }
  return corners;
}

export function applyCornerRelief(
  path: ToolPath,
  cornerIndex: number,
  bitDiameter: number,
  type: CornerReliefType,
) {
  const points = pathWithoutClosingDuplicate(path);
  if (points.length < 3 || bitDiameter <= 0) return path;
  const corner = points[cornerIndex];
  if (!corner || (!path.closed && (cornerIndex <= 0 || cornerIndex >= points.length - 1))) return path;
  const previousIndex = (cornerIndex - 1 + points.length) % points.length;
  const nextIndex = (cornerIndex + 1) % points.length;
  const previous = points[previousIndex];
  const next = points[nextIndex];

  const previousLength = distance(previous, corner);
  const nextLength = distance(corner, next);
  if (previousLength < 1e-6 || nextLength < 1e-6) return path;
  const toPrevious = { x: (previous.x - corner.x) / previousLength, y: (previous.y - corner.y) / previousLength };
  const toNext = { x: (next.x - corner.x) / nextLength, y: (next.y - corner.y) / nextLength };
  const angle = Math.acos(Math.max(-1, Math.min(1, toPrevious.x * toNext.x + toPrevious.y * toNext.y)));
  if (angle >= Math.PI * 0.97 || angle <= Math.PI * 0.03) return path;

  const radius = bitDiameter / 2;
  let direction: Point2D;
  let reliefDistance: number;
  if (type === "dogbone") {
    const bisector = { x: toPrevious.x + toNext.x, y: toPrevious.y + toNext.y };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    if (bisectorLength < 1e-6) return path;
    direction = { x: -bisector.x / bisectorLength, y: -bisector.y / bisectorLength };
    reliefDistance = Math.min(radius * 4, radius / Math.max(0.25, Math.sin(angle / 2)));
  } else if (previousLength >= nextLength) {
    direction = { x: -toPrevious.x, y: -toPrevious.y };
    reliefDistance = radius;
  } else {
    direction = { x: -toNext.x, y: -toNext.y };
    reliefDistance = radius;
  }

  const relief = {
    x: corner.x + direction.x * reliefDistance,
    y: corner.y + direction.y * reliefDistance,
  };
  points.splice(cornerIndex, 1, { ...corner }, relief, { ...corner });
  if (path.closed) points.push({ ...points[0] });
  return { ...path, points };
}

function orientedJoin(a: ToolPath, b: ToolPath, tolerance: number) {
  const options = [
    { distance: distance(a.points[a.points.length - 1], b.points[0]), reverseA: false, reverseB: false },
    { distance: distance(a.points[a.points.length - 1], b.points[b.points.length - 1]), reverseA: false, reverseB: true },
    { distance: distance(a.points[0], b.points[0]), reverseA: true, reverseB: false },
    { distance: distance(a.points[0], b.points[b.points.length - 1]), reverseA: true, reverseB: true },
  ].sort((left, right) => left.distance - right.distance);
  const best = options[0];
  if (best.distance > tolerance) return null;
  const aPoints = (best.reverseA ? [...a.points].reverse() : [...a.points]).map((value) => ({ ...value }));
  const bPoints = (best.reverseB ? [...b.points].reverse() : [...b.points]).map((value) => ({ ...value }));
  const join = midpoint(aPoints[aPoints.length - 1], bPoints[0]);
  aPoints[aPoints.length - 1] = join;
  bPoints[0] = join;
  return {
    id: a.id,
    points: [...aPoints, ...bPoints.slice(1)],
    closed: false,
    sourceType: a.sourceType === b.sourceType ? a.sourceType : "JOINED",
  } satisfies ToolPath;
}

export function closeOpenPaths(input: ToolPath[], tolerance: number): ClosePathsResult {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("接続許容値は0以上にしてください。");
  }
  const paths = input.map((path) => ({ ...path, points: path.points.map((value) => ({ ...value })) }));
  let joinedCount = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let left = 0; left < paths.length; left += 1) {
      if (paths[left].closed) continue;
      for (let right = left + 1; right < paths.length; right += 1) {
        if (paths[right].closed) continue;
        const joined = orientedJoin(paths[left], paths[right], tolerance);
        if (!joined) continue;
        paths.splice(right, 1);
        paths[left] = joined;
        joinedCount += 1;
        changed = true;
        break;
      }
      if (changed) break;
    }
  }

  let closedCount = 0;
  paths.forEach((path) => {
    if (path.closed || path.points.length < 3) return;
    const start = path.points[0];
    const end = path.points[path.points.length - 1];
    if (!samePoint(start, end, tolerance)) return;
    const join = midpoint(start, end);
    path.points[0] = join;
    path.points[path.points.length - 1] = { ...join };
    path.closed = true;
    closedCount += 1;
  });
  return { paths, joinedCount, closedCount };
}

function splitPolylineAtDistance(points: Point2D[], requestedDistance: number) {
  const totalLength = points.slice(1).reduce((total, value, index) => total + distance(points[index], value), 0);
  const target = Math.max(0, Math.min(requestedDistance, totalLength));
  const before: Point2D[] = [{ ...points[0] }];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = distance(start, end);
    if (travelled + segmentLength < target - 1e-9) {
      before.push({ ...end });
      travelled += segmentLength;
      continue;
    }
    const ratio = segmentLength > 0 ? (target - travelled) / segmentLength : 0;
    const cut = {
      x: start.x + (end.x - start.x) * Math.max(0, Math.min(1, ratio)),
      y: start.y + (end.y - start.y) * Math.max(0, Math.min(1, ratio)),
    };
    before.push(cut);
    return { before, after: [cut, ...points.slice(index).map((value) => ({ ...value }))], distance: target };
  }
  return { before, after: [{ ...points[points.length - 1] }], distance: totalLength };
}

export function buildRampToolpath(path: ToolPath, startDepth: number, targetDepth: number, rampLength: number) {
  if (!path.closed || path.points.length < 3 || rampLength <= 0) return [] as RampPoint[];
  const split = splitPolylineAtDistance(path.points, rampLength);
  if (split.distance <= 1e-6) return [] as RampPoint[];
  let travelled = 0;
  const ramp = split.before.map((value, index) => {
    if (index > 0) travelled += distance(split.before[index - 1], value);
    return {
      ...value,
      depth: startDepth + (targetDepth - startDepth) * Math.min(1, travelled / split.distance),
    };
  });
  const fullDepthRemainder = split.after.slice(1).map((value) => ({ ...value, depth: targetDepth }));
  const finishRampSection = split.before.slice(1).map((value) => ({ ...value, depth: targetDepth }));
  return [...ramp, ...fullDepthRemainder, ...finishRampSection];
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
  if (settings.rampEnabled && settings.rampLength <= 0) {
    throw new Error("ランプ長さは0より大きい値にしてください。");
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
      const previousDepth = passIndex === 0 ? 0 : depths[passIndex - 1];
      const ramp = settings.rampEnabled
        ? buildRampToolpath(path, previousDepth, depth, settings.rampLength)
        : [];
      if (ramp.length) {
        lines.push(`; Ramp L${format(Math.min(settings.rampLength, pathLength(path)))}`);
        lines.push(`G1 Z${format(-previousDepth)} F${format(settings.plungeRate)}`);
        ramp.slice(1).forEach((value, pointIndex) => {
          const feed = pointIndex === 0 ? ` F${format(settings.feedRate)}` : "";
          lines.push(`G1 X${format(value.x)} Y${format(value.y)} Z${format(-value.depth)}${feed}`);
        });
      } else {
        lines.push(`G1 Z-${format(depth)} F${format(settings.plungeRate)}`);
        path.points.slice(1).forEach((value, pointIndex) => {
          const feed = pointIndex === 0 ? ` F${format(settings.feedRate)}` : "";
          lines.push(`G1 X${format(value.x)} Y${format(value.y)}${feed}`);
        });
      }
      cuttingStarted = true;
    });
  });

  if (cuttingStarted) lines.push(`G0 Z${format(settings.retractHeight)}`);
  lines.push("M5", "");
  return lines.join("\n");
}

function pathLength(path: ToolPath) {
  return path.points.slice(1).reduce((total, value, index) => total + distance(path.points[index], value), 0);
}

export function estimateMinutes(paths: ToolPath[], settings: CamSettings) {
  const depths = buildPassDepths(settings.finalDepth, settings.stepDown);
  if (!depths.length || settings.feedRate <= 0 || settings.plungeRate <= 0) return 0;
  const pathDistance = paths.reduce((total, path) => total + pathLength(path), 0);
  const rampExtra = settings.rampEnabled
    ? depths.length * paths.reduce((total, path) => total + (path.closed ? Math.min(settings.rampLength, pathLength(path)) : 0), 0)
    : 0;
  const plungeDistance = depths.reduce((total, depth, index) => {
    const previousDepth = index === 0 ? 0 : depths[index - 1];
    return total + paths.reduce((pathTotal, path) => pathTotal + (
      settings.rampEnabled && path.closed ? previousDepth : depth
    ), 0);
  }, 0);
  return (pathDistance * depths.length + rampExtra) / settings.feedRate + plungeDistance / settings.plungeRate;
}
