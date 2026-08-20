import { createId, createVectorNode, type Vec2, type VectorPath } from "./types";

const KAPPA = 0.5522847498307936;

function basePath(name: string, nodes: VectorPath["nodes"], closed: boolean): VectorPath {
  return { id: createId("path"), name, closed, nodes, visible: true, locked: false };
}

export function createLinePath(start: Vec2, end: Vec2, name = "線"): VectorPath {
  return basePath(name, [createVectorNode(start), createVectorNode(end)], false);
}

export function createRectanglePath(start: Vec2, end: Vec2, name = "長方形"): VectorPath {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  return basePath(name, [
    createVectorNode({ x: minX, y: minY }),
    createVectorNode({ x: maxX, y: minY }),
    createVectorNode({ x: maxX, y: maxY }),
    createVectorNode({ x: minX, y: maxY }),
  ], true);
}

export function createEllipsePath(start: Vec2, end: Vec2, name = "楕円"): VectorPath {
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const rx = Math.abs(end.x - start.x) / 2;
  const ry = Math.abs(end.y - start.y) / 2;
  return basePath(name, [
    createVectorNode({ x: center.x + rx, y: center.y }, { inHandle: { x: 0, y: -KAPPA * ry }, outHandle: { x: 0, y: KAPPA * ry }, nodeType: "symmetric" }),
    createVectorNode({ x: center.x, y: center.y + ry }, { inHandle: { x: KAPPA * rx, y: 0 }, outHandle: { x: -KAPPA * rx, y: 0 }, nodeType: "symmetric" }),
    createVectorNode({ x: center.x - rx, y: center.y }, { inHandle: { x: 0, y: KAPPA * ry }, outHandle: { x: 0, y: -KAPPA * ry }, nodeType: "symmetric" }),
    createVectorNode({ x: center.x, y: center.y - ry }, { inHandle: { x: -KAPPA * rx, y: 0 }, outHandle: { x: KAPPA * rx, y: 0 }, nodeType: "symmetric" }),
  ], true);
}

export function createCornerPath(points: Vec2[], closed: boolean, name: string): VectorPath {
  return basePath(name, points.map((point) => createVectorNode(point)), closed);
}
