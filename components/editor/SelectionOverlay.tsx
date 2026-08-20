import type { VectorBounds } from "@/lib/vector/transform";

export function SelectionOverlay({ bounds }: { bounds: VectorBounds | null }) {
  if (!bounds) return null;
  return (
    <g className="selection-overlay" aria-hidden="true">
      <rect
        x={bounds.minX}
        y={-bounds.maxY}
        width={Math.max(0.001, bounds.width)}
        height={Math.max(0.001, bounds.height)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        strokeDasharray="5 3"
      />
    </g>
  );
}
