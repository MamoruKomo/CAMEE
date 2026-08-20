import { cubicPoint, segmentCurve, type CubicBezier } from "./bezier";
import type { Vec2, VectorPath } from "./types";

export type VectorBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

function derivativeRoots(p0: number, p1: number, p2: number, p3: number) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

function curveBounds(curve: CubicBezier) {
  const points = [curve.p0, curve.p3];
  const roots = [
    ...derivativeRoots(curve.p0.x, curve.p1.x, curve.p2.x, curve.p3.x),
    ...derivativeRoots(curve.p0.y, curve.p1.y, curve.p2.y, curve.p3.y),
  ];
  roots.filter((value) => value > 0 && value < 1).forEach((value) => points.push(cubicPoint(curve, value)));
  return points;
}

export function getVectorBounds(paths: VectorPath[]): VectorBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach((path) => {
    const segmentCount = path.closed ? path.nodes.length : Math.max(0, path.nodes.length - 1);
    if (segmentCount === 0) path.nodes.forEach((node) => {
      minX = Math.min(minX, node.anchor.x);
      minY = Math.min(minY, node.anchor.y);
      maxX = Math.max(maxX, node.anchor.x);
      maxY = Math.max(maxY, node.anchor.y);
    });
    for (let index = 0; index < segmentCount; index += 1) {
      curveBounds(segmentCurve(path, index)).forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    }
  });
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function movePath(path: VectorPath, delta: Vec2): VectorPath {
  return {
    ...path,
    nodes: path.nodes.map((node) => ({ ...node, anchor: { x: node.anchor.x + delta.x, y: node.anchor.y + delta.y } })),
  };
}

export function scalePath(path: VectorPath, origin: Vec2, scaleX: number, scaleY = scaleX): VectorPath {
  return {
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      anchor: {
        x: origin.x + (node.anchor.x - origin.x) * scaleX,
        y: origin.y + (node.anchor.y - origin.y) * scaleY,
      },
      inHandle: node.inHandle ? { x: node.inHandle.x * scaleX, y: node.inHandle.y * scaleY } : null,
      outHandle: node.outHandle ? { x: node.outHandle.x * scaleX, y: node.outHandle.y * scaleY } : null,
    })),
  };
}

export function rotatePath(path: VectorPath, origin: Vec2, radians: number): VectorPath {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotate = (point: Vec2): Vec2 => ({ x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine });
  return {
    ...path,
    nodes: path.nodes.map((node) => {
      const relative = rotate({ x: node.anchor.x - origin.x, y: node.anchor.y - origin.y });
      return {
        ...node,
        anchor: { x: origin.x + relative.x, y: origin.y + relative.y },
        inHandle: node.inHandle ? rotate(node.inHandle) : null,
        outHandle: node.outHandle ? rotate(node.outHandle) : null,
      };
    }),
  };
}

export function resizePathToBounds(path: VectorPath, next: Partial<Pick<VectorBounds, "minX" | "minY" | "width" | "height">>) {
  const bounds = getVectorBounds([path]);
  const targetX = next.minX ?? bounds.minX;
  const targetY = next.minY ?? bounds.minY;
  const targetWidth = next.width ?? bounds.width;
  const targetHeight = next.height ?? bounds.height;
  const scaleX = bounds.width > 1e-9 ? targetWidth / bounds.width : 1;
  const scaleY = bounds.height > 1e-9 ? targetHeight / bounds.height : 1;
  const scaled = scalePath(path, { x: bounds.minX, y: bounds.minY }, scaleX, scaleY);
  const scaledBounds = getVectorBounds([scaled]);
  return movePath(scaled, { x: targetX - scaledBounds.minX, y: targetY - scaledBounds.minY });
}
