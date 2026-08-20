import type { Bounds } from "@/lib/cam";
import type { Vec2, VectorPath } from "./types";

export type SnapKind = "grid" | "anchor" | "endpoint" | "material" | "origin" | "horizontal" | "vertical";
export type SnapGuide = { kind: SnapKind; point: Vec2; axis: "x" | "y" | "both" };
export type SnapResult = { point: Vec2; guides: SnapGuide[] };

export function pxToMmThreshold(pixelDistance: number, zoomPixelsPerMm: number) {
  if (!Number.isFinite(pixelDistance) || pixelDistance < 0 || !Number.isFinite(zoomPixelsPerMm) || zoomPixelsPerMm <= 0) return 0;
  return pixelDistance / zoomPixelsPerMm;
}

export function collectAnchorTargets(paths: VectorPath[], excludedPathIds = new Set<string>()) {
  return paths.flatMap((path) => excludedPathIds.has(path.id) || !path.visible
    ? []
    : path.nodes.map((node, index) => ({
      point: node.anchor,
      kind: (index === 0 || (!path.closed && index === path.nodes.length - 1) ? "endpoint" : "anchor") as SnapKind,
    })));
}

export function snapPoint(
  point: Vec2,
  options: {
    thresholdMm: number;
    gridSizeMm?: number;
    grid?: boolean;
    anchors?: Array<{ point: Vec2; kind: SnapKind }>;
    material?: Bounds;
    origin?: Vec2;
    alignWith?: Vec2[];
  },
): SnapResult {
  const threshold = Math.max(0, options.thresholdMm);
  let x = point.x;
  let y = point.y;
  let bestX = threshold + Number.EPSILON;
  let bestY = threshold + Number.EPSILON;
  const guides: SnapGuide[] = [];
  const considerX = (target: number, kind: SnapKind, targetPoint: Vec2) => {
    const delta = Math.abs(point.x - target);
    if (delta <= bestX) {
      bestX = delta;
      x = target;
      guides.splice(0, guides.length, ...guides.filter((guide) => guide.axis !== "x"));
      guides.push({ kind, point: targetPoint, axis: "x" });
    }
  };
  const considerY = (target: number, kind: SnapKind, targetPoint: Vec2) => {
    const delta = Math.abs(point.y - target);
    if (delta <= bestY) {
      bestY = delta;
      y = target;
      guides.splice(0, guides.length, ...guides.filter((guide) => guide.axis !== "y"));
      guides.push({ kind, point: targetPoint, axis: "y" });
    }
  };

  if (options.grid && options.gridSizeMm && options.gridSizeMm > 0) {
    const target = { x: Math.round(point.x / options.gridSizeMm) * options.gridSizeMm, y: Math.round(point.y / options.gridSizeMm) * options.gridSizeMm };
    considerX(target.x, "grid", target);
    considerY(target.y, "grid", target);
  }
  options.anchors?.forEach((target) => {
    considerX(target.point.x, target.kind, target.point);
    considerY(target.point.y, target.kind, target.point);
  });
  if (options.material) {
    const { minX, maxX, minY, maxY } = options.material;
    [minX, (minX + maxX) / 2, maxX].forEach((targetX) => considerX(targetX, "material", { x: targetX, y: point.y }));
    [minY, (minY + maxY) / 2, maxY].forEach((targetY) => considerY(targetY, "material", { x: point.x, y: targetY }));
  }
  if (options.origin) {
    considerX(options.origin.x, "origin", options.origin);
    considerY(options.origin.y, "origin", options.origin);
  }
  options.alignWith?.forEach((target) => {
    considerX(target.x, "vertical", target);
    considerY(target.y, "horizontal", target);
  });
  return { point: { x, y }, guides };
}
