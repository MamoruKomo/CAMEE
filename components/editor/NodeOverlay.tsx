import { add } from "@/lib/vector/bezier";
import type { VectorPath } from "@/lib/vector/types";

export type SelectedNodeRef = { pathId: string; nodeId: string };

export function NodeOverlay({
  path,
  selectedNodes,
  radiusMm,
  onNodePointerDown,
  onHandlePointerDown,
}: {
  path: VectorPath;
  selectedNodes: SelectedNodeRef[];
  radiusMm: number;
  onNodePointerDown: (event: React.PointerEvent<SVGCircleElement>, pathId: string, nodeId: string) => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGCircleElement>, pathId: string, nodeId: string, side: "in" | "out") => void;
}) {
  const selected = new Set(selectedNodes.filter((item) => item.pathId === path.id).map((item) => item.nodeId));
  return (
    <g className="node-overlay">
      {path.nodes.map((node) => {
        const isSelected = selected.has(node.id);
        const input = node.inHandle ? add(node.anchor, node.inHandle) : null;
        const output = node.outHandle ? add(node.anchor, node.outHandle) : null;
        return (
          <g key={node.id}>
            {isSelected && input && (
              <>
                <line x1={node.anchor.x} y1={-node.anchor.y} x2={input.x} y2={-input.y} className="handle-line" vectorEffect="non-scaling-stroke" />
                <circle cx={input.x} cy={-input.y} r={radiusMm * 0.82} className="handle-point" onPointerDown={(event) => onHandlePointerDown(event, path.id, node.id, "in")} />
              </>
            )}
            {isSelected && output && (
              <>
                <line x1={node.anchor.x} y1={-node.anchor.y} x2={output.x} y2={-output.y} className="handle-line" vectorEffect="non-scaling-stroke" />
                <circle cx={output.x} cy={-output.y} r={radiusMm * 0.82} className="handle-point" onPointerDown={(event) => onHandlePointerDown(event, path.id, node.id, "out")} />
              </>
            )}
            <circle
              cx={node.anchor.x}
              cy={-node.anchor.y}
              r={radiusMm}
              className={`anchor-point${isSelected ? " is-selected" : ""}`}
              onPointerDown={(event) => onNodePointerDown(event, path.id, node.id)}
            />
          </g>
        );
      })}
    </g>
  );
}
