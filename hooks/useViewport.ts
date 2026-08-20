"use client";

import { useCallback, useState } from "react";
import type { Bounds } from "@/lib/cam";
import type { Vec2 } from "@/lib/vector/types";

export type EditorViewBox = { x: number; y: number; width: number; height: number };

export function viewBoxForBounds(bounds: Bounds): EditorViewBox {
  const width = Math.max(20, bounds.width);
  const height = Math.max(20, bounds.height);
  const margin = Math.max(10, Math.max(width, height) * 0.08);
  return { x: bounds.minX - margin, y: -bounds.maxY - margin, width: width + margin * 2, height: height + margin * 2 };
}

export function useViewport(initialBounds: Bounds) {
  const [viewBox, setViewBox] = useState(() => viewBoxForBounds(initialBounds));
  const zoomAt = useCallback((displayPoint: Vec2, factor: number) => {
    setViewBox((current) => {
      const width = Math.max(0.5, Math.min(100_000, current.width * factor));
      const height = Math.max(0.5, Math.min(100_000, current.height * factor));
      const ratioX = (displayPoint.x - current.x) / current.width;
      const ratioY = (displayPoint.y - current.y) / current.height;
      return { x: displayPoint.x - ratioX * width, y: displayPoint.y - ratioY * height, width, height };
    });
  }, []);
  const panByPixels = useCallback((delta: Vec2, viewport: { width: number; height: number }, initial?: EditorViewBox) => {
    setViewBox((current) => {
      const basis = initial ?? current;
      return {
        ...basis,
        x: basis.x - delta.x * basis.width / Math.max(1, viewport.width),
        y: basis.y - delta.y * basis.height / Math.max(1, viewport.height),
      };
    });
  }, []);
  const fit = useCallback((bounds: Bounds) => setViewBox(viewBoxForBounds(bounds)), []);
  return { viewBox, setViewBox, zoomAt, panByPixels, fit };
}
