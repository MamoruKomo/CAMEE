import type { VectorBounds } from "@/lib/vector/transform";
import type { Vec2 } from "@/lib/vector/types";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const handlePoints = (bounds: VectorBounds): Array<{ id: ResizeHandle; point: Vec2 }> => [
  { id: "nw", point: { x: bounds.minX, y: bounds.maxY } },
  { id: "n", point: { x: bounds.minX + bounds.width / 2, y: bounds.maxY } },
  { id: "ne", point: { x: bounds.maxX, y: bounds.maxY } },
  { id: "e", point: { x: bounds.maxX, y: bounds.minY + bounds.height / 2 } },
  { id: "se", point: { x: bounds.maxX, y: bounds.minY } },
  { id: "s", point: { x: bounds.minX + bounds.width / 2, y: bounds.minY } },
  { id: "sw", point: { x: bounds.minX, y: bounds.minY } },
  { id: "w", point: { x: bounds.minX, y: bounds.minY + bounds.height / 2 } },
];

export function SelectionOverlay({
  bounds,
  radiusMm = 0,
  interactive = false,
  onResizePointerDown,
  onRotatePointerDown,
}: {
  bounds: VectorBounds | null;
  radiusMm?: number;
  interactive?: boolean;
  onResizePointerDown?: (event: React.PointerEvent<SVGCircleElement>, handle: ResizeHandle) => void;
  onRotatePointerDown?: (event: React.PointerEvent<SVGCircleElement>) => void;
}) {
  if (!bounds) return null;
  const radius = Math.max(0.001, radiusMm);
  const centerX = bounds.minX + bounds.width / 2;
  const rotateY = bounds.maxY + radius * 7;
  return (
    <g className={`selection-overlay${interactive ? " is-interactive" : ""}`} aria-hidden="true">
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
      {interactive && (
        <>
          {handlePoints(bounds).map(({ id, point }) => (
            <circle
              key={id}
              className={`resize-handle resize-${id}`}
              cx={point.x}
              cy={-point.y}
              r={radius}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => onResizePointerDown?.(event, id)}
            />
          ))}
          <line x1={centerX} y1={-bounds.maxY} x2={centerX} y2={-rotateY} className="rotation-stem" vectorEffect="non-scaling-stroke" />
          <circle className="rotation-handle" cx={centerX} cy={-rotateY} r={radius * 1.15} vectorEffect="non-scaling-stroke" onPointerDown={onRotatePointerDown} />
        </>
      )}
    </g>
  );
}
