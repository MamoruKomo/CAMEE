import { describe, expect, it } from "vitest";
import { selectionSummary, shapeMeasurement, TOOL_CONTEXT } from "@/lib/editor/tool-context";

describe("editor contextual guidance", () => {
  it("provides Japanese guidance and shortcuts for every tool", () => {
    expect(Object.keys(TOOL_CONTEXT)).toHaveLength(9);
    expect(TOOL_CONTEXT.pen).toMatchObject({ label: "ペン", shortcut: "P" });
    expect(TOOL_CONTEXT.text.hint).toContain("右");
  });

  it("prioritizes anchor and text selection summaries", () => {
    expect(selectionSummary(1, 2, false)).toBe("2 アンカーを選択");
    expect(selectionSummary(1, 0, true)).toBe("文字を選択");
    expect(selectionSummary(2, 0, true)).toBe("文字を含む 2 オブジェクト");
    expect(selectionSummary(2, 0, false)).toBe("2 パスを選択");
    expect(selectionSummary(0, 0, false)).toBe("選択なし");
  });

  it("measures drawing previews in mm", () => {
    expect(shapeMeasurement("line", { x: 0, y: 0 }, { x: 3, y: 4 })).toMatchObject({ length: 5, angle: 53.13010235415598 });
    expect(shapeMeasurement("rectangle", { x: 10, y: 20 }, { x: -5, y: 25 })).toMatchObject({ width: 15, height: 5 });
    expect(shapeMeasurement("ellipse", { x: 0, y: 0 }, { x: 12.345, y: -6.789 }).label).toBe("W 12.35 × H 6.79 mm");
  });
});
