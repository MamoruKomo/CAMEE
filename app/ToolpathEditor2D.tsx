"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyCornerRelief,
  getBounds,
  getCornerIndices,
  type Bounds,
  type CornerReliefType,
  type Point2D,
  type ToolPath,
} from "@/lib/cam";
import type { PreviewHandle } from "./ToolpathPreview";

type ViewBox = { x: number; y: number; width: number; height: number };

type EditorProps = {
  paths: ToolPath[];
  boardBounds: Bounds;
  bitDiameter: number;
  cornerMode: "select" | CornerReliefType;
  onPathsChange: (paths: ToolPath[]) => void;
  onSelectionChange: (pathId: string | null) => void;
};

type MoveDrag = {
  kind: "move";
  pathId: string;
  start: Point2D;
  original: ToolPath[];
};

type ScaleDrag = {
  kind: "scale";
  pathId: string;
  center: Point2D;
  startDistance: number;
  original: ToolPath[];
};

type PanDrag = {
  kind: "pan";
  startClient: Point2D;
  startViewBox: ViewBox;
};

type DragState = MoveDrag | ScaleDrag | PanDrag;

function clonePaths(paths: ToolPath[]) {
  return paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({ ...point })),
  }));
}

function viewBoxForBounds(bounds: Bounds): ViewBox {
  const width = Math.max(10, bounds.width);
  const height = Math.max(10, bounds.height);
  const margin = Math.max(10, Math.max(width, height) * 0.08);
  return {
    x: bounds.minX - margin,
    y: -bounds.maxY - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  };
}

function pathData(path: ToolPath) {
  return path.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${-point.y}`)
    .join(" ");
}

function selectedBounds(path?: ToolPath) {
  if (!path) return null;
  return getBounds([path]);
}

export const ToolpathEditor2D = forwardRef<PreviewHandle, EditorProps>(function ToolpathEditor2D(
  { paths, boardBounds, bitDiameter, cornerMode, onPathsChange, onSelectionChange },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [localPaths, setLocalPaths] = useState(() => clonePaths(paths));
  const localPathsRef = useRef(localPaths);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState(() => viewBoxForBounds(getBounds(paths)));
  const [viewportWidth, setViewportWidth] = useState(900);

  const updateLocalPaths = (next: ToolPath[]) => {
    localPathsRef.current = next;
    setLocalPaths(next);
  };

  useEffect(() => {
    if (dragRef.current) return;
    const next = clonePaths(paths);
    localPathsRef.current = next;
    setLocalPaths(next);
  }, [paths]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => setViewportWidth(Math.max(1, svg.clientWidth)));
    observer.observe(svg);
    setViewportWidth(Math.max(1, svg.clientWidth));
    return () => observer.disconnect();
  }, []);

  const fit = () => {
    const pathBounds = getBounds(localPathsRef.current);
    const combined: Bounds = {
      minX: Math.min(boardBounds.minX, pathBounds.minX),
      minY: Math.min(boardBounds.minY, pathBounds.minY),
      maxX: Math.max(boardBounds.maxX, pathBounds.maxX),
      maxY: Math.max(boardBounds.maxY, pathBounds.maxY),
      width: 0,
      height: 0,
    };
    combined.width = combined.maxX - combined.minX;
    combined.height = combined.maxY - combined.minY;
    setViewBox(viewBoxForBounds(combined));
  };

  const zoom = (factor: number) => {
    setViewBox((current) => {
      const width = Math.max(0.1, current.width * factor);
      const height = Math.max(0.1, current.height * factor);
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  };

  function scaleSelection(factor: number) {
    if (!selectedPathId) return;
    const path = localPathsRef.current.find((value) => value.id === selectedPathId);
    const bounds = selectedBounds(path);
    if (!bounds) return;
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const next = localPathsRef.current.map((value) => value.id === selectedPathId
      ? {
          ...value,
          points: value.points.map((point) => ({
            x: center.x + (point.x - center.x) * factor,
            y: center.y + (point.y - center.y) * factor,
          })),
        }
      : value);
    updateLocalPaths(next);
    onPathsChange(clonePaths(next));
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoom(0.82),
    zoomOut: () => zoom(1.22),
    fit,
    scaleSelection,
  }));

  const screenToDrawing = (clientX: number, clientY: number): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const selectPath = (pathId: string | null) => {
    setSelectedPathId(pathId);
    onSelectionChange(pathId);
  };

  const startMove = (event: React.PointerEvent<SVGPathElement>, pathId: string) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.focus();
    selectPath(pathId);
    if (cornerMode !== "select") return;
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "move",
      pathId,
      start: screenToDrawing(event.clientX, event.clientY),
      original: clonePaths(localPathsRef.current),
    };
  };

  const addCornerRelief = (
    event: React.PointerEvent<SVGCircleElement>,
    pathId: string,
    cornerIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (cornerMode === "select") return;
    const next = localPathsRef.current.map((path) => path.id === pathId
      ? applyCornerRelief(path, cornerIndex, bitDiameter, cornerMode)
      : path);
    updateLocalPaths(next);
    onPathsChange(clonePaths(next));
  };

  const startScale = (event: React.PointerEvent<SVGRectElement>, pathId: string) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.focus();
    svgRef.current?.setPointerCapture(event.pointerId);
    const path = localPathsRef.current.find((value) => value.id === pathId);
    const bounds = selectedBounds(path);
    if (!bounds) return;
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const drawingPoint = screenToDrawing(event.clientX, event.clientY);
    const actualPoint = { x: drawingPoint.x, y: -drawingPoint.y };
    dragRef.current = {
      kind: "scale",
      pathId,
      center,
      startDistance: Math.max(0.001, Math.hypot(actualPoint.x - center.x, actualPoint.y - center.y)),
      original: clonePaths(localPathsRef.current),
    };
  };

  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    svgRef.current?.focus();
    svgRef.current?.setPointerCapture(event.pointerId);
    selectPath(null);
    dragRef.current = {
      kind: "pan",
      startClient: { x: event.clientX, y: event.clientY },
      startViewBox: { ...viewBox },
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const xPerPixel = drag.startViewBox.width / Math.max(1, svg.clientWidth);
      const yPerPixel = drag.startViewBox.height / Math.max(1, svg.clientHeight);
      setViewBox({
        ...drag.startViewBox,
        x: drag.startViewBox.x - (event.clientX - drag.startClient.x) * xPerPixel,
        y: drag.startViewBox.y - (event.clientY - drag.startClient.y) * yPerPixel,
      });
      return;
    }

    const drawingPoint = screenToDrawing(event.clientX, event.clientY);
    if (drag.kind === "move") {
      const deltaX = drawingPoint.x - drag.start.x;
      const deltaY = -(drawingPoint.y - drag.start.y);
      updateLocalPaths(drag.original.map((path) => path.id === drag.pathId
        ? { ...path, points: path.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })) }
        : path));
      return;
    }

    const actualPoint = { x: drawingPoint.x, y: -drawingPoint.y };
    const distance = Math.hypot(actualPoint.x - drag.center.x, actualPoint.y - drag.center.y);
    const scale = Math.max(0.05, Math.min(50, distance / drag.startDistance));
    updateLocalPaths(drag.original.map((path) => path.id === drag.pathId
      ? {
          ...path,
          points: path.points.map((point) => ({
            x: drag.center.x + (point.x - drag.center.x) * scale,
            y: drag.center.y + (point.y - drag.center.y) * scale,
          })),
        }
      : path));
  };

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (drag.kind !== "pan") onPathsChange(clonePaths(localPathsRef.current));
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const cursor = screenToDrawing(event.clientX, event.clientY);
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    setViewBox((current) => ({
      x: cursor.x - (cursor.x - current.x) * factor,
      y: cursor.y - (cursor.y - current.y) * factor,
      width: Math.max(0.1, current.width * factor),
      height: Math.max(0.1, current.height * factor),
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      selectPath(null);
      return;
    }
    if (!selectedPathId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const delta = {
      x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
      y: event.key === "ArrowDown" ? -amount : event.key === "ArrowUp" ? amount : 0,
    };
    const next = localPathsRef.current.map((path) => path.id === selectedPathId
      ? { ...path, points: path.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) }
      : path);
    updateLocalPaths(next);
    onPathsChange(clonePaths(next));
  };

  const selectedPath = localPaths.find((path) => path.id === selectedPathId);
  const selection = useMemo(() => selectedBounds(selectedPath), [selectedPath]);
  const cornerIndices = useMemo(
    () => selectedPath && cornerMode !== "select" ? getCornerIndices(selectedPath) : [],
    [selectedPath, cornerMode],
  );
  const handleSize = Math.max(0.01, (viewBox.width / viewportWidth) * 10);
  const boardMargin = Math.max(5, Math.max(boardBounds.width, boardBounds.height) * 0.025);
  const handles = selection ? [
    { x: selection.minX, y: -selection.maxY, cursor: "nwse-resize" },
    { x: selection.maxX, y: -selection.maxY, cursor: "nesw-resize" },
    { x: selection.maxX, y: -selection.minY, cursor: "nwse-resize" },
    { x: selection.minX, y: -selection.minY, cursor: "nesw-resize" },
  ] : [];

  return (
    <div className="toolpath-editor">
      <svg
        ref={svgRef}
        className="toolpath-editor-svg"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="application"
        aria-label="2Dツールパス編集"
        onPointerDown={startPan}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <rect
          className="editor-board"
          x={boardBounds.minX - boardMargin}
          y={-boardBounds.maxY - boardMargin}
          width={Math.max(1, boardBounds.width + boardMargin * 2)}
          height={Math.max(1, boardBounds.height + boardMargin * 2)}
          pointerEvents="none"
        />
        <g className="editor-origin" pointerEvents="none">
          <line x1={-handleSize * 1.5} y1="0" x2={handleSize * 3} y2="0" />
          <line x1="0" y1={-handleSize * 1.5} x2="0" y2={handleSize * 3} />
          <circle cx="0" cy="0" r={handleSize * 0.35} />
        </g>

        {localPaths.map((path) => (
          <g key={path.id}>
            <path
              d={pathData(path)}
              className="editor-path-hit"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => startMove(event, path.id)}
            />
            <path
              d={pathData(path)}
              className={`editor-path${selectedPathId === path.id ? " is-selected" : ""}`}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        ))}

        {selectedPath && cornerMode !== "select" && cornerIndices.map((cornerIndex) => {
          const corner = selectedPath.points[cornerIndex];
          if (!corner) return null;
          return (
            <circle
              key={`${selectedPath.id}-corner-${cornerIndex}`}
              className={`editor-corner-target is-${cornerMode}`}
              cx={corner.x}
              cy={-corner.y}
              r={handleSize * 0.72}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => addCornerRelief(event, selectedPath.id, cornerIndex)}
            >
              <title>{cornerMode === "dogbone" ? "ドッグボーン" : "H型フィレット"}</title>
            </circle>
          );
        })}

        {selection && selectedPath && (
          <g className="editor-selection">
            <rect
              x={selection.minX}
              y={-selection.maxY}
              width={Math.max(0.001, selection.width)}
              height={Math.max(0.001, selection.height)}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {cornerMode === "select" && handles.map((handle, index) => (
              <rect
                key={`${handle.x}-${handle.y}-${index}`}
                className="editor-scale-handle"
                x={handle.x - handleSize / 2}
                y={handle.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                style={{ cursor: handle.cursor }}
                onPointerDown={(event) => startScale(event, selectedPath.id)}
              >
                <title>拡大・縮小</title>
              </rect>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
});
