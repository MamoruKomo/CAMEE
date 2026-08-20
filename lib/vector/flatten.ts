import { splitCubic, segmentCurve, type CubicBezier } from "./bezier";
import { isFiniteVec2, type Vec2, type VectorPath } from "./types";

export type FlattenOptions = {
  toleranceMm?: number;
  maxSegments?: number;
  minSegmentLengthMm?: number;
};

function distanceToLine(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-24) return Math.hypot(point.x - start.x, point.y - start.y);
  const area = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  return area / Math.sqrt(lengthSquared);
}

function flatness(curve: CubicBezier) {
  return Math.max(distanceToLine(curve.p1, curve.p0, curve.p3), distanceToLine(curve.p2, curve.p0, curve.p3));
}

export function flattenVectorPath(path: VectorPath, options: FlattenOptions = {}) {
  const tolerance = options.toleranceMm ?? 0.05;
  const maxSegments = options.maxSegments ?? 20_000;
  const minimum = options.minSegmentLengthMm ?? 1e-7;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("許容誤差は有限な正値にしてください。");
  if (!Number.isInteger(maxSegments) || maxSegments < 1) throw new Error("最大segment数は1以上の整数にしてください。");
  if (!Number.isFinite(minimum) || minimum < 0) throw new Error("最短segment長が不正です。");
  if (path.nodes.length < 2) throw new Error("パスには2個以上のanchorが必要です。");
  path.nodes.forEach((node) => {
    if (!isFiniteVec2(node.anchor) || (node.inHandle && !isFiniteVec2(node.inHandle)) || (node.outHandle && !isFiniteVec2(node.outHandle))) {
      throw new Error("パスにNaNまたはInfinityがあります。");
    }
  });

  const points: Vec2[] = [{ ...path.nodes[0].anchor }];
  let segmentTotal = 0;
  const append = (point: Vec2) => {
    const previous = points[points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) <= minimum) return;
    segmentTotal += 1;
    if (segmentTotal > maxSegments) throw new Error(`最大segment数 ${maxSegments} を超えました。`);
    points.push({ ...point });
  };
  const subdivide = (curve: CubicBezier, depth: number) => {
    if (flatness(curve) <= tolerance || depth >= 24) {
      append(curve.p3);
      return;
    }
    const [left, right] = splitCubic(curve, 0.5);
    subdivide(left, depth + 1);
    subdivide(right, depth + 1);
  };

  const count = path.closed ? path.nodes.length : path.nodes.length - 1;
  for (let index = 0; index < count; index += 1) subdivide(segmentCurve(path, index), 0);
  if (path.closed) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) > minimum) append(first);
    else points[points.length - 1] = { ...first };
  }
  if (points.length < 2) throw new Error("ゼロ長パスはCAMへ変換できません。");
  const length = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  if (!Number.isFinite(length) || length <= minimum) throw new Error("ゼロ長パスはCAMへ変換できません。");
  return points;
}
