import { describe, expect, it } from "vitest";
import { buildCenterlineOperation } from "@/lib/cam/operations";
import { defaultCamSettings } from "@/lib/project/defaults";
import { deserializeVectorDocument, serializeVectorDocument } from "@/lib/vector/serialization";
import { buildTextPaths, createVectorText, insertVectorText, outlineVectorText, updateVectorText } from "@/lib/vector/text";
import { createEmptyDocument } from "@/lib/vector/types";
import { vectorPathToToolPath } from "@/lib/vector/cam-adapter";

describe("CNC stroke text", () => {
  it("rejects a mismatched font checksum", () => {
    const text = { ...createVectorText({ x: 0, y: 0 }), fontChecksum: "wrong" as "cutpath-simplex-14seg-v1" };
    expect(() => buildTextPaths(text)).toThrow(/識別情報/);
  });

  it("creates finite line geometry and reports unsupported characters", () => {
    const text = createVectorText({ x: 10, y: 20 }, "A1 あ");
    const result = buildTextPaths(text);
    expect(result.paths.length).toBeGreaterThan(5);
    expect(result.paths.every((path) => !path.closed && path.nodes.length === 2 && path.sourceTextId === text.id)).toBe(true);
    expect(result.paths.flatMap((path) => path.nodes).every((node) => Number.isFinite(node.anchor.x) && Number.isFinite(node.anchor.y))).toBe(true);
    expect(result.unsupportedCharacters).toEqual(["あ"]);
  });

  it("keeps editable text through JSON roundtrip and regenerates atomically", () => {
    const source = createVectorText({ x: 5, y: 6 }, "CUT");
    const inserted = insertVectorText(createEmptyDocument(), source);
    const originalPathIds = inserted.texts?.[0].pathIds ?? [];
    const updated = updateVectorText(inserted, source.id, { text: "CAM", fontSizeMm: 20, strokeWidthMm: 1.2 });
    const restored = deserializeVectorDocument(serializeVectorDocument(updated));
    expect(restored.texts?.[0]).toMatchObject({ text: "CAM", fontSizeMm: 20, strokeWidthMm: 1.2 });
    expect(restored.texts?.[0].pathIds).not.toEqual(originalPathIds);
    expect(restored.paths.every((path) => path.sourceTextId === source.id)).toBe(true);
  });

  it("outlines text into normal editable paths", () => {
    const source = createVectorText({ x: 0, y: 0 }, "A");
    const document = insertVectorText(createEmptyDocument(), source);
    const outlined = outlineVectorText(document, source.id);
    expect(outlined.texts).toEqual([]);
    expect(outlined.paths.length).toBeGreaterThan(0);
    expect(outlined.paths.every((path) => !path.sourceTextId && !path.locked)).toBe(true);
  });

  it("keeps visual stroke width out of CAM geometry", () => {
    const source = createVectorText({ x: 0, y: 0 }, "L");
    const thin = buildTextPaths({ ...source, strokeWidthMm: 0.2 }).paths[0];
    const thick = { ...thin, style: { strokeWidthMm: 8 } };
    expect(vectorPathToToolPath(thick)).toEqual(vectorPathToToolPath(thin));
  });

  it("feeds generated text paths into existing centerline CAM", () => {
    const source = createVectorText({ x: 10, y: 10 }, "CNC");
    const document = insertVectorText(createEmptyDocument(), source);
    const operation = buildCenterlineOperation(document, document.texts?.[0].pathIds ?? [], defaultCamSettings, { id: "text-op", name: "文字彫刻", now: 1 });
    expect(operation.sourceRevision).toBe(document.revision);
    expect(operation.generatedToolPaths.length).toBe(document.paths.length);
  });

  it("blocks unsupported glyphs from centerline CAM", () => {
    const source = createVectorText({ x: 10, y: 10 }, "文字");
    const document = insertVectorText(createEmptyDocument(), source);
    expect(() => buildCenterlineOperation(document, document.texts?.[0].pathIds ?? [], defaultCamSettings, { id: "text-op", name: "文字彫刻", now: 1 })).toThrow(/未対応文字/);
  });
});
