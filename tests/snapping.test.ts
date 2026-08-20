import { describe, expect, it } from "vitest";
import { pxToMmThreshold, snapPoint } from "@/lib/vector/snapping";

describe("snapping", () => {
  it("converts a pixel threshold to millimeters", () => expect(pxToMmThreshold(8, 4)).toBe(2));
  it("snaps to grid", () => expect(snapPoint({ x: 4.8, y: 10.3 }, { thresholdMm: 0.5, grid: true, gridSizeMm: 5 }).point).toEqual({ x: 5, y: 10 }));
  it("snaps to anchors", () => expect(snapPoint({ x: 9.7, y: 20.2 }, { thresholdMm: 0.5, anchors: [{ point: { x: 10, y: 20 }, kind: "anchor" }] }).point).toEqual({ x: 10, y: 20 }));
  it("creates vertical and horizontal alignment guides", () => {
    const result = snapPoint({ x: 3.2, y: 6.8 }, { thresholdMm: 0.3, alignWith: [{ x: 3, y: 7 }] });
    expect(result.point).toEqual({ x: 3, y: 7 });
    expect(result.guides.map((guide) => guide.kind)).toEqual(expect.arrayContaining(["vertical", "horizontal"]));
  });
});
