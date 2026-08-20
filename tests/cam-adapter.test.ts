import { describe, expect, it } from "vitest";
import { vectorPathToToolPath } from "@/lib/vector/cam-adapter";
import { createEllipsePath, createLinePath } from "@/lib/vector/shapes";
import { createId, createVectorNode, type VectorPath } from "@/lib/vector/types";

function cubicPath(): VectorPath {
  return {
    id: createId("path"), name: "curve", closed: false, visible: true, locked: false,
    nodes: [
      createVectorNode({ x: 0, y: 0 }, { outHandle: { x: 0, y: 10 } }),
      createVectorNode({ x: 10, y: 0 }, { inHandle: { x: 0, y: 10 } }),
    ],
  };
}

describe("vectorPathToToolPath", () => {
  it("converts a line without mutating it", () => {
    const path = createLinePath({ x: 0, y: 0 }, { x: 10, y: 5 });
    const before = structuredClone(path);
    expect(vectorPathToToolPath(path).points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 5 }]);
    expect(path).toEqual(before);
  });

  it("adaptively flattens a cubic and honors tolerance", () => {
    const path = cubicPath();
    const coarse = vectorPathToToolPath(path, { toleranceMm: 1 });
    const fine = vectorPathToToolPath(path, { toleranceMm: 0.01 });
    expect(coarse.points.length).toBeGreaterThan(2);
    expect(fine.points.length).toBeGreaterThan(coarse.points.length);
    expect(fine.points.at(-1)).toEqual({ x: 10, y: 0 });
  });

  it("closes an ellipse with identical start/end points", () => {
    const path = createEllipsePath({ x: 0, y: 0 }, { x: 20, y: 10 });
    const output = vectorPathToToolPath(path);
    expect(output.closed).toBe(true);
    expect(output.points.at(-1)).toEqual(output.points[0]);
  });

  it("removes duplicate and extremely short segments", () => {
    const path: VectorPath = {
      id: "short", name: "short", closed: false, visible: true, locked: false,
      nodes: [createVectorNode({ x: 0, y: 0 }), createVectorNode({ x: 0, y: 0 }), createVectorNode({ x: 1e-9, y: 0 }), createVectorNode({ x: 1, y: 0 })],
    };
    expect(vectorPathToToolPath(path).points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects non-finite geometry: %s", (value) => {
    const path = createLinePath({ x: 0, y: 0 }, { x: value, y: 1 });
    expect(() => vectorPathToToolPath(path)).toThrow(/NaN|Infinity/);
  });

  it("stops at maxSegments instead of freezing", () => {
    expect(() => vectorPathToToolPath(cubicPath(), { toleranceMm: 1e-8, maxSegments: 2 })).toThrow(/最大segment数/);
  });
});
