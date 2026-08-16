"use client";

import {
  forwardRef,
  useCallback,
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
  onSelectionChange: (pathIds: string[]) => void;
};

type MoveDrag = {
  kind: "move";
  pathIds: string[];
  start: Point2D;
  original: ToolPath[];
};

type ScaleDrag = {
  kind: "scale";
  pathIds: string[];
  center: Point2D;
  startDistance: number;
  original: ToolPath[];
};

type PanDrag = {
  kind: "pan";
  startClient: Point2D;
  startViewBox: ViewBox;
};

type WindowDrag = {
  kind: "window";
  start: Point2D;
  current: Point2D;
  additive: boolean;
  originalSelection: string[];
};

type DragState = MoveDrag | ScaleDrag | PanDrag | WindowDrag;

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

function boundsForSelection(paths: ToolPath[], pathIds: string[]) {
  const selected = paths.filter((path) => pathIds.includes(path.id));
  return selected.length ? getBounds(selected) : null;
}

function transformSelected(
  paths: ToolPath[],
  pathIds: string[],
  transform: (point: Point2D) => Point2D,
) {
  const selected = new Set(pathIds);
  return paths.map((path) => selected.has(path.id)
    ? { ...path, points: path.points.map(transform) }
    : path);
}

export const ToolpathEditor2D = forwardRef<PreviewHandle, EditorProps>(function ToolpathEditor2D(
  { paths, boardBounds, bitDiameter, cornerMode, onPathsChange, onSelectionChange },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [localPaths, setLocalPaths] = useState(() => clonePaths(paths));
  const localPathsRef = useRef(localPaths);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const selectedPathIdsRef = useRef(selectedPathIds);
  const [selectionWindow, setSelectionWindow] = useState<WindowDrag | null>(null);
  const [viewBox, setViewBox] = useState(() => viewBoxForBounds(getBounds(paths)));
  const [viewportWidth, setViewportWidth] = useState(900);

  const updateLocalPaths = (next: ToolPath[]) => {
    localPathsRef.current = next;
    setLocalPaths(next);
  };

  const selectPaths = useCallback((pathIds: string[]) => {
    selectedPathIdsRef.current = pathIds;
    setSelectedPathIds(pathIds);
    onSelectionChange(pathIds);
  }, [onSelectionChange]);

  useEffect(() => {
    if (dragRef.current) return;
    const next = clonePaths(paths);
    localPathsRef.current = next;
    setLocalPaths(next);
    const available = new Set(next.map((path) => path.id));
    const retained = selectedPathIdsRef.current.filter((id) => available.has(id));
    if (retained.length !== selectedPathIdsRef.current.length) selectPaths(retained);
  }, [paths, selectPaths]);

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

  const commitTransform = (next: ToolPath[]) => {
    updateLocalPaths(next);
    onPathsChange(clonePaths(next));
  };

  function scaleSelection(factor: number) {
    const pathIds = selectedPathIdsRef.current;
    const bounds = boundsForSelection(localPathsRef.current, pathIds);
    if (!bounds) return;
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    commitTransform(transformSelected(localPathsRef.current, pathIds, (point) => ({
      x: center.x + (point.x - center.x) * factor,
      y: center.y + (point.y - center.y) * factor,
    })));
  }

  function rotateSelection(degrees: number) {
    const pathIds = selectedPathIdsRef.current;
    const bounds = boundsForSelection(localPathsRef.current, pathIds);
    if (!bounds) return;
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const radians = degrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    commitTransform(transformSelected(localPathsRef.current, pathIds, (point) => {
      const x = point.x - center.x;
      const y = point.y - center.y;
      return {
        x: center.x + x * cosine - y * sine,
        y: center.y + x * sine + y * cosine,
      };
    }));
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoom(0.82),
    zoomOut: () => zoom(1.22),
    fit,
    scaleSelection,
    rotateSelection,
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
    return { x: transformed.x, y: -transformed.y };
  };

  const startMove = (event: React.PointerEvent<SVGPathElement>, pathId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.focus();

    if (cornerMode !== "select") {
      selectPaths([pathId]);
      return;
    }

    const current = selectedPathIdsRef.current;
    if (event.shiftKey) {
      const next = current.includes(pathId)
        ? current.filter((id) => id !== pathId)
        : [...current, pathId];
      selectPaths(next);
      return;
    }

    const active = current.includes(pathId) ? current : [pathId];
    selectPaths(active);
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "move",
      pathIds: active,
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
    commitTransform(next);
  };

  const startScale = (event: React.PointerEvent<SVGRectElement>) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.focus();
    svgRef.current?.setPointerCapture(event.pointerId);
    const pathIds = selectedPathIdsRef.current;
    const bounds = boundsForSelection(localPathsRef.current, pathIds);
    if (!bounds) return;
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const drawingPoint = screenToDrawing(event.clientX, event.clientY);
    dragRef.current = {
      kind: "scale",
      pathIds,
      center,
      startDistance: Math.max(0.001, Math.hypot(drawingPoint.x - center.x, drawingPoint.y - center.y)),
      original: clonePaths(localPathsRef.current),
    };
  };

  const startWorkspaceDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    svgRef.current?.focus();
    svgRef.current?.setPointerCapture(event.pointerId);
    if (event.button === 1 || event.altKey || cornerMode !== "select") {
      dragRef.current = {
        kind: "pan",
        startClient: { x: event.clientX, y: event.clientY },
        startViewBox: { ...viewBox },
      };
      return;
    }

    const start = screenToDrawing(event.clientX, event.clientY);
    const drag: WindowDrag = {
      kind: "window",
      start,
      current: start,
      additive: event.shiftKey,
      originalSelection: [...selectedPathIdsRef.current],
    };
    dragRef.current = drag;
    setSelectionWindow(drag);
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
    if (drag.kind === "window") {
      drag.current = drawingPoint;
      setSelectionWindow({ ...drag });
      return;
    }
    if (drag.kind === "move") {
      const deltaX = drawingPoint.x - drag.start.x;
      const deltaY = drawingPoint.y - drag.start.y;
      updateLocalPaths(transformSelected(drag.original, drag.pathIds, (point) => ({
        x: point.x + deltaX,
        y: point.y + deltaY,
      })));
      return;
    }

    const currentDistance = Math.hypot(drawingPoint.x - drag.center.x, drawingPoint.y - drag.center.y);
    const scale = Math.max(0.05, Math.min(50, currentDistance / drag.startDistance));
    updateLocalPaths(transformSelected(drag.original, drag.pathIds, (point) => ({
      x: drag.center.x + (point.x - drag.center.x) * scale,
      y: drag.center.y + (point.y - drag.center.y) * scale,
    })));
  };

  const finishWindowSelection = (drag: WindowDrag) => {
    const minX = Math.min(drag.start.x, drag.current.x);
    const maxX = Math.max(drag.start.x, drag.current.x);
    const minY = Math.min(drag.start.y, drag.current.y);
    const maxY = Math.max(drag.start.y, drag.current.y);
    const threshold = (viewBox.width / Math.max(1, viewportWidth)) * 4;
    if (maxX - minX < threshold && maxY - minY < threshold) {
      if (!drag.additive) selectPaths([]);
      return;
    }

    const crossing = drag.current.x < drag.start.x;
    const matches = localPathsRef.current.filter((path) => {
      const bounds = getBounds([path]);
      if (crossing) {
        return bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY;
      }
      return bounds.minX >= minX && bounds.maxX <= maxX && bounds.minY >= minY && bounds.maxY <= maxY;
    }).map((path) => path.id);
    selectPaths(drag.additive ? [...new Set([...drag.originalSelection, ...matches])] : matches);
  };

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (drag.kind === "window") {
      finishWindowSelection(drag);
      setSelectionWindow(null);
    } else if (drag.kind !== "pan") {
      onPathsChange(clonePaths(localPathsRef.current));
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const cursor = screenToDrawing(event.clientX, event.clientY);
    const svgCursor = { x: cursor.x, y: -cursor.y };
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    setViewBox((current) => ({
      x: svgCursor.x - (svgCursor.x - current.x) * factor,
      y: svgCursor.y - (svgCursor.y - current.y) * factor,
      width: Math.max(0.1, current.width * factor),
      height: Math.max(0.1, current.height * factor),
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      selectPaths([]);
      setSelectionWindow(null);
      dragRef.current = null;
      return;
    }
    if (!selectedPathIds.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const delta = {
      x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
      y: event.key === "ArrowDown" ? -amount : event.key === "ArrowUp" ? amount : 0,
    };
    commitTransform(transformSelected(localPathsRef.current, selectedPathIds, (point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    })));
  };

  const selectedPath = selectedPathIds.length === 1
    ? localPaths.find((path) => path.id === selectedPathIds[0])
    : undefined;
  const selection = useMemo(
    () => boundsForSelection(localPaths, selectedPathIds),
    [localPaths, selectedPathIds],
  );
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
  const windowBounds = selectionWindow ? {
    minX: Math.min(selectionWindow.start.x, selectionWindow.current.x),
    maxX: Math.max(selectionWindow.start.x, selectionWindow.current.x),
    minY: Math.min(selectionWindow.start.y, selectionWindow.current.y),
    maxY: Math.max(selectionWindow.start.y, selectionWindow.current.y),
    crossing: selectionWindow.current.x < selectionWindow.start.x,
  } : null;

  return (
    <div className="toolpath-editor">
      <svg
        ref={svgRef}
        className={`toolpath-editor-svg is-${cornerMode}`}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="application"
        aria-label="2Dツールパス編集"
        onPointerDown={startWorkspaceDrag}
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
              className={`editor-path${selectedPathIds.includes(path.id) ? " is-selected" : ""}`}
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

        {selection && (
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
                onPointerDown={startScale}
              >
                <title>拡大・縮小</title>
              </rect>
            ))}
          </g>
        )}

        {windowBounds && (
          <rect
            className={`editor-selection-window${windowBounds.crossing ? " is-crossing" : ""}`}
            x={windowBounds.minX}
            y={-windowBounds.maxY}
            width={Math.max(0.001, windowBounds.maxX - windowBounds.minX)}
            height={Math.max(0.001, windowBounds.maxY - windowBounds.minY)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
});
