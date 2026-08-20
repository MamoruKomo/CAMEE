import { describe, expect, it } from "vitest";
import { commitHistory, createEditorHistory, redoHistory, undoHistory } from "@/hooks/useEditorHistory";
import { commitDocument, createEmptyDocument } from "@/lib/vector/types";
import { createLinePath } from "@/lib/vector/shapes";
import { duplicateVectorPaths } from "@/hooks/useClipboard";

describe("editor history", () => {
  it("undoes, redoes, and discards redo after a new operation", () => {
    const empty = createEmptyDocument();
    const firstDocument = commitDocument(empty, [createLinePath({ x: 0, y: 0 }, { x: 1, y: 0 })]);
    const first = commitHistory(createEditorHistory(empty), firstDocument);
    const undone = undoHistory(first);
    expect(undone.present.paths).toHaveLength(0);
    expect(redoHistory(undone).present.paths).toHaveLength(1);
    const branchDocument = commitDocument(undone.present, [createLinePath({ x: 0, y: 0 }, { x: 2, y: 0 })]);
    expect(commitHistory(undone, branchDocument).future).toEqual([]);
  });

  it("records a completed drag as one history entry", () => {
    const empty = createEmptyDocument();
    const beforeDrag = commitDocument(empty, [createLinePath({ x: 0, y: 0 }, { x: 1, y: 0 })]);
    const afterDrag = commitDocument(beforeDrag, [createLinePath({ x: 5, y: 5 }, { x: 6, y: 5 })]);
    const history = commitHistory(createEditorHistory(beforeDrag), afterDrag);
    expect(history.past).toHaveLength(1);
  });

  it("copies Bézier paths with new stable IDs and an offset", () => {
    const source = createLinePath({ x: 0, y: 0 }, { x: 10, y: 0 });
    source.nodes[0].outHandle = { x: 2, y: 3 };
    const [copy] = duplicateVectorPaths([source], 1);
    expect(copy.id).not.toBe(source.id);
    expect(copy.nodes[0].id).not.toBe(source.nodes[0].id);
    expect(copy.nodes[0].anchor).toEqual({ x: 5, y: -5 });
    expect(copy.nodes[0].outHandle).toEqual({ x: 2, y: 3 });
  });

  it("duplicates in place for Alt-drag without mutating the source", () => {
    const source = createLinePath({ x: 2, y: 3 }, { x: 12, y: 3 });
    const [copy] = duplicateVectorPaths([source], 0);
    expect(copy.nodes[0].anchor).toEqual(source.nodes[0].anchor);
    expect(copy.id).not.toBe(source.id);
  });
});
