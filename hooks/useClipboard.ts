"use client";

import { useCallback, useRef } from "react";
import { cloneVectorPath, createId, type VectorPath } from "@/lib/vector/types";
import { movePath } from "@/lib/vector/transform";

export function duplicateVectorPaths(paths: VectorPath[], pasteCount: number) {
  const offset = Math.max(1, pasteCount) * 5;
  return paths.map((path) => {
    const duplicate = movePath(cloneVectorPath(path), { x: offset, y: -offset });
    duplicate.id = createId("path");
    duplicate.name = `${path.name} のコピー`;
    duplicate.nodes = duplicate.nodes.map((node) => ({ ...node, id: createId("node") }));
    return duplicate;
  });
}

export function useClipboard() {
  const clipboard = useRef<VectorPath[]>([]);
  const pasteCount = useRef(0);
  const copy = useCallback((paths: VectorPath[]) => {
    clipboard.current = paths.map(cloneVectorPath);
    pasteCount.current = 0;
  }, []);
  const paste = useCallback(() => {
    if (!clipboard.current.length) return [];
    pasteCount.current += 1;
    return duplicateVectorPaths(clipboard.current, pasteCount.current);
  }, []);
  return { copy, paste };
}
