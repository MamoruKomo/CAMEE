import type { ToolPath } from "@/lib/cam";
import { flattenVectorPath, type FlattenOptions } from "./flatten";
import type { VectorPath } from "./types";

export function vectorPathToToolPath(path: VectorPath, options: FlattenOptions = {}): ToolPath {
  return {
    id: path.id,
    points: flattenVectorPath(path, options),
    closed: path.closed,
    sourceType: "VECTOR",
  };
}

export function vectorPathsToToolPaths(paths: VectorPath[], options: FlattenOptions = {}) {
  return paths.filter((path) => path.visible).map((path) => vectorPathToToolPath(path, options));
}
