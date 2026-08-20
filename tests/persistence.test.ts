import { describe, expect, it } from "vitest";
import { createNewProject, defaultCamSettings } from "@/lib/project/defaults";
import { deserializeProject, migrateProject, serializeProject } from "@/lib/project/migration";
import { createEllipsePath } from "@/lib/vector/shapes";
import { buildCenterlineOperation } from "@/lib/cam/operations";

describe("Project V2 persistence", () => {
  it("roundtrips JSON and keeps Bézier handles", () => {
    const project = createNewProject();
    const ellipse = createEllipsePath({ x: 10, y: 20 }, { x: 50, y: 40 });
    project.document = { ...project.document, revision: 7, paths: [ellipse], pathOrder: [ellipse.id] };
    const restored = deserializeProject(serializeProject(project));
    expect(restored.document.paths[0].nodes[0].outHandle).toEqual(ellipse.nodes[0].outHandle);
    expect(restored).toEqual(project);
  });

  it("migrates Version 1 ToolPath points to corner nodes without mutating input", () => {
    const legacy = {
      version: 1, savedAt: 1, fileName: "legacy.dxf",
      displayPaths: [{ id: "old", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }], closed: true, sourceType: "LWPOLYLINE" }],
      calculatedToolpaths: [], settings: {}, materialWidth: 300, materialHeight: 200, materialThickness: 18, origin: "lower-left",
    };
    const before = structuredClone(legacy);
    const migrated = migrateProject(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.document.paths[0]).toMatchObject({ id: "old", closed: true });
    expect(migrated.document.paths[0].nodes).toHaveLength(2);
    expect(migrated.document.paths[0].nodes.every((node) => !node.inHandle && !node.outHandle && node.nodeType === "corner")).toBe(true);
    expect(legacy).toEqual(before);
  });

  it("does not persist sampled ToolPath caches and restores operations as stale", () => {
    const project = createNewProject();
    const ellipse = createEllipsePath({ x: 0, y: 0 }, { x: 20, y: 10 });
    project.document = { ...project.document, revision: 4, paths: [ellipse], pathOrder: [ellipse.id] };
    project.camOperations = [buildCenterlineOperation(project.document, [ellipse.id], defaultCamSettings, { id: "op", name: "Centerline", now: 1 })];
    const source = serializeProject(project);
    expect(source).not.toContain("generatedToolPaths");
    const restored = deserializeProject(source);
    expect(restored.camOperations[0].generatedToolPaths).toEqual([]);
    expect(restored.camOperations[0].sourceRevision).toBe(-1);
  });
});
