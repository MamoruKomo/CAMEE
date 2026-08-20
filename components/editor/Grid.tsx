import type { EditorViewBox } from "@/hooks/useViewport";

export function Grid({ viewBox, size, visible }: { viewBox: EditorViewBox; size: number; visible: boolean }) {
  if (!visible || size <= 0) return null;
  const major = size * 5;
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id="minor-grid" width={size} height={size} patternUnits="userSpaceOnUse">
          <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke="#e5e8ea" strokeWidth={0.15} vectorEffect="non-scaling-stroke" />
        </pattern>
        <pattern id="major-grid" width={major} height={major} patternUnits="userSpaceOnUse">
          <rect width={major} height={major} fill="url(#minor-grid)" />
          <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#cdd3d6" strokeWidth={0.35} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#major-grid)" />
    </g>
  );
}
