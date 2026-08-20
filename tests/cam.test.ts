import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPassDepths, estimateMinutes, generateGcode, generateLegacyGcode, type CamSettings, type ToolPath } from "@/lib/cam";
import { buildCenterlineOperation, validateCamOperation } from "@/lib/cam/operations";
import { createLinePath } from "@/lib/vector/shapes";
import { createEmptyDocument } from "@/lib/vector/types";

const settings: CamSettings = {
  finalDepth: 3, stepDown: 1, bitDiameter: 3, toolName: "Straight 3mm", toolType: "straight", spindleRpm: 18000,
  feedRate: 1000, plungeRate: 300, retractHeight: 2, rapidFeed: 2000, rampEnabled: false, rampLength: 12,
};
const path: ToolPath = { id: "line", sourceType: "VECTOR", closed: false, points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] };
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("existing CAM behavior", () => {
  it("builds pass depths", () => expect(buildPassDepths(3, 1)).toEqual([1, 2, 3]));
  it("rejects invalid pass settings", () => expect(buildPassDepths(3, 0)).toEqual([]));
  it("estimates minutes", () => expect(estimateMinutes([path], settings)).toBeCloseTo(0.05));
  it("matches the legacy G-code golden", () => expect(generateLegacyGcode([path], settings, "golden")).toBe(fixture("legacy-centerline.gcode")));
  it("matches the safe-Z G-code golden", () => expect(generateGcode([path], settings, "golden")).toBe(fixture("safe-centerline.gcode")));
  it("raises safe Z before the first XY rapid", () => {
    const lines = generateGcode([path], settings, "golden").split("\n");
    expect(lines.findIndex((line) => line.startsWith("G0 Z"))).toBeLessThan(lines.findIndex((line) => line.startsWith("G0 X")));
  });
  it("rejects NaN, zero length, and ramp on an open path", () => {
    expect(() => generateGcode([{ ...path, points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }] }], settings, "bad")).toThrow(/NaN|Infinity/);
    expect(() => generateGcode([{ ...path, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }], settings, "bad")).toThrow(/ゼロ長/);
    expect(() => generateGcode([path], { ...settings, rampEnabled: true }, "bad")).toThrow(/閉じたパス/);
  });
});

describe("CAM operation safety", () => {
  it("detects stale geometry and blocks unapproved through cutting", () => {
    const vectorPath = createLinePath({ x: 10, y: 10 }, { x: 20, y: 10 });
    const document = { ...createEmptyDocument(), revision: 2, paths: [vectorPath], pathOrder: [vectorPath.id] };
    const operation = buildCenterlineOperation(document, [vectorPath.id], settings, { id: "op", name: "Centerline", now: 1 });
    const changed = { ...document, revision: 3 };
    const issues = validateCamOperation({ ...operation, settings: { ...settings, finalDepth: 19 } }, changed, { width: 300, height: 200, thickness: 18, origin: "lower-left", allowThroughCut: false });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "STALE", severity: "error" }),
      expect.objectContaining({ code: "THROUGH_CUT", severity: "error" }),
    ]));
  });
});
