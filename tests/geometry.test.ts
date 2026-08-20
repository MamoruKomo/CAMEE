import { describe, expect, it } from "vitest";
import { applyHandleDrag, closestPointOnPath, cubicPoint, deleteNode, handleFromPolar, handlePolar, segmentCurve, setNodeType, splitCubic, splitPathSegment } from "@/lib/vector/bezier";
import { createLinePath } from "@/lib/vector/shapes";
import { movePath, rotatePath, scalePath } from "@/lib/vector/transform";
import { createVectorNode, type VectorPath } from "@/lib/vector/types";

describe("vector geometry", () => {
  it("moves, scales, and rotates anchors and handles", () => {
    const path: VectorPath = { id: "p", name: "p", closed: false, visible: true, locked: false, nodes: [
      createVectorNode({ x: 1, y: 0 }, { outHandle: { x: 1, y: 0 } }),
      createVectorNode({ x: 2, y: 0 }),
    ] };
    expect(movePath(path, { x: 2, y: 3 }).nodes[0].anchor).toEqual({ x: 3, y: 3 });
    expect(scalePath(path, { x: 0, y: 0 }, 2).nodes[0]).toMatchObject({ anchor: { x: 2, y: 0 }, outHandle: { x: 2, y: 0 } });
    const rotated = rotatePath(path, { x: 0, y: 0 }, Math.PI / 2).nodes[0];
    expect(rotated.anchor.x).toBeCloseTo(0);
    expect(rotated.anchor.y).toBeCloseTo(1);
    expect(rotated.outHandle?.y).toBeCloseTo(1);
  });

  it("evaluates and splits a cubic without changing its shape", () => {
    const curve = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 10 }, p2: { x: 10, y: 10 }, p3: { x: 10, y: 0 } };
    expect(cubicPoint(curve, 0.5)).toEqual({ x: 5, y: 7.5 });
    const [left, right] = splitCubic(curve, 0.4);
    for (const t of [0, 0.1, 0.25, 0.4, 0.7, 1]) {
      const original = cubicPoint(curve, t);
      const split = t <= 0.4 ? cubicPoint(left, t / 0.4) : cubicPoint(right, (t - 0.4) / 0.6);
      expect(split.x).toBeCloseTo(original.x, 8);
      expect(split.y).toBeCloseTo(original.y, 8);
    }
  });

  it("adds a node using de Casteljau and deletes it", () => {
    const path = createLinePath({ x: 0, y: 0 }, { x: 10, y: 0 });
    const split = splitPathSegment(path, 0, 0.25, "inserted");
    expect(split.nodes).toHaveLength(3);
    expect(split.nodes[1].anchor).toEqual({ x: 1.5625, y: 0 });
    const before = segmentCurve(path, 0);
    expect(cubicPoint(segmentCurve(split, 0), 1)).toEqual(cubicPoint(before, 0.25));
    expect(deleteNode(split, "inserted").nodes).toHaveLength(2);
  });

  it("enforces corner, smooth, and symmetric handle behavior", () => {
    const path: VectorPath = { id: "p", name: "p", closed: false, visible: true, locked: false, nodes: [
      createVectorNode({ x: 0, y: 0 }, { inHandle: { x: -2, y: 0 }, outHandle: { x: 3, y: 0 }, nodeType: "corner" }),
      createVectorNode({ x: 10, y: 0 }),
    ] };
    const corner = applyHandleDrag(path, path.nodes[0].id, "out", { x: 0, y: 4 });
    expect(corner.nodes[0].inHandle).toEqual({ x: -2, y: 0 });
    const smooth = setNodeType(path, path.nodes[0].id, "smooth");
    expect(smooth.nodes[0].nodeType).toBe("smooth");
    const smoothDrag = applyHandleDrag(smooth, path.nodes[0].id, "out", { x: 0, y: 4 });
    expect(smoothDrag.nodes[0].inHandle?.x).toBeCloseTo(0);
    expect(smoothDrag.nodes[0].inHandle?.y).toBeCloseTo(-2);
    const symmetric = applyHandleDrag(setNodeType(path, path.nodes[0].id, "symmetric"), path.nodes[0].id, "out", { x: 1, y: 4 });
    expect(symmetric.nodes[0].inHandle).toEqual({ x: -1, y: -4 });
  });

  it("finds a segment position and edits handles in polar units", () => {
    const path = createLinePath({ x: 0, y: 0 }, { x: 20, y: 0 });
    const hit = closestPointOnPath(path, { x: 7, y: 2 });
    expect(hit.segmentIndex).toBe(0);
    expect(hit.point.x).toBeCloseTo(7, 2);
    expect(hit.distance).toBeCloseTo(2, 2);
    const handle = handleFromPolar(10, 90);
    expect(handle?.x).toBeCloseTo(0);
    expect(handle?.y).toBeCloseTo(10);
    expect(handlePolar(handle!).angleDegrees).toBeCloseTo(90);
    expect(handleFromPolar(0, 30)).toBeNull();
  });
});
