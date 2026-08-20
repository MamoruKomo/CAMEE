"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Bounds } from "@/lib/cam";
import { applyHandleDrag, closestPointOnPath, splitPathSegment } from "@/lib/vector/bezier";
import { createEllipsePath, createLinePath, createRectanglePath } from "@/lib/vector/shapes";
import { collectAdvancedTargets, collectAnchorTargets, pxToMmThreshold, snapPoint, type SnapGuide } from "@/lib/vector/snapping";
import { vectorPathToSvgData } from "@/lib/vector/svg";
import { getVectorBounds, movePath, rotatePath, scalePath, type VectorBounds } from "@/lib/vector/transform";
import { cloneVectorDocument, commitDocument, createId, createVectorNode, orderedPaths, type Vec2, type VectorDocument, type VectorPath } from "@/lib/vector/types";
import { duplicateVectorPaths, useClipboard } from "@/hooks/useClipboard";
import { deleteVectorText, insertVectorText, updateVectorText } from "@/lib/vector/text";
import { shapeMeasurement, type EditorTool } from "@/lib/editor/tool-context";
import { useViewport, type EditorViewBox } from "@/hooks/useViewport";
import type { PreviewHandle } from "@/app/ToolpathPreview";
import { Grid } from "./Grid";
import { NodeOverlay, type SelectedNodeRef } from "./NodeOverlay";
import { SelectionOverlay, type ResizeHandle } from "./SelectionOverlay";

type EditorProps = {
  document: VectorDocument;
  materialBounds: Bounds;
  tool: EditorTool;
  selectedPathIds: string[];
  selectedNodes: SelectedNodeRef[];
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSizeMm: 1 | 5 | 10;
  onToolChange: (tool: EditorTool) => void;
  onDocumentCommit: (document: VectorDocument) => void;
  onSelectionChange: (pathIds: string[]) => void;
  onNodeSelectionChange: (nodes: SelectedNodeRef[]) => void;
  onCursorPosition: (point: Vec2) => void;
  onTextCreate: (point: Vec2) => void;
  onUndo: () => void;
  onRedo: () => void;
};

type DragState =
  | { kind: "pan"; startClient: Vec2; startViewBox: EditorViewBox }
  | { kind: "window"; start: Vec2; current: Vec2; additive: boolean }
  | { kind: "move"; start: Vec2; original: VectorDocument; pathIds: string[]; textIds: string[] }
  | { kind: "resize"; original: VectorDocument; pathIds: string[]; bounds: VectorBounds; handle: ResizeHandle }
  | { kind: "rotate"; original: VectorDocument; pathIds: string[]; center: Vec2; startAngle: number }
  | { kind: "node"; start: Vec2; original: VectorDocument; nodes: SelectedNodeRef[] }
  | { kind: "handle"; original: VectorDocument; pathId: string; nodeId: string; side: "in" | "out" }
  | { kind: "shape"; start: Vec2; current: Vec2; tool: "line" | "rectangle" | "ellipse" }
  | { kind: "pen-handle"; nodeId: string };

function rectFromPoints(a: Vec2, b: Vec2) {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

function withUpdatedPaths(document: VectorDocument, pathIds: Set<string>, update: (path: VectorPath) => VectorPath) {
  return { ...document, paths: document.paths.map((path) => pathIds.has(path.id) ? update(path) : path) };
}

function moveNodes(document: VectorDocument, nodes: SelectedNodeRef[], delta: Vec2) {
  const selected = new Set(nodes.map((node) => `${node.pathId}:${node.nodeId}`));
  return {
    ...document,
    paths: document.paths.map((path) => ({
      ...path,
      nodes: path.nodes.map((node) => selected.has(`${path.id}:${node.id}`)
        ? { ...node, anchor: { x: node.anchor.x + delta.x, y: node.anchor.y + delta.y } }
        : node),
    })),
  };
}

function resizeParameters(bounds: VectorBounds, handle: ResizeHandle, point: Vec2) {
  const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const origin = {
    x: east ? bounds.minX : west ? bounds.maxX : center.x,
    y: north ? bounds.minY : south ? bounds.maxY : center.y,
  };
  const basisX = east ? bounds.maxX - origin.x : west ? bounds.minX - origin.x : 1;
  const basisY = north ? bounds.maxY - origin.y : south ? bounds.minY - origin.y : 1;
  return {
    origin,
    scaleX: east || west ? (point.x - origin.x) / Math.max(1e-9, Math.abs(basisX)) * Math.sign(basisX) : 1,
    scaleY: north || south ? (point.y - origin.y) / Math.max(1e-9, Math.abs(basisY)) * Math.sign(basisY) : 1,
    changesX: east || west,
    changesY: north || south,
  };
}

function nonZeroScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  if (Math.abs(value) >= 0.001) return value;
  return Math.sign(value || 1) * 0.001;
}

export const VectorEditor2D = forwardRef<PreviewHandle, EditorProps>(function VectorEditor2D({
  document,
  materialBounds,
  tool,
  selectedPathIds,
  selectedNodes,
  snapEnabled,
  gridVisible,
  gridSizeMm,
  onToolChange,
  onDocumentCommit,
  onSelectionChange,
  onNodeSelectionChange,
  onCursorPosition,
  onTextCreate,
  onUndo,
  onRedo,
}, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const documentRef = useRef(document);
  const selectedPathIdsRef = useRef(selectedPathIds);
  const selectedNodesRef = useRef(selectedNodes);
  const dragRef = useRef<DragState | null>(null);
  const spacePressedRef = useRef(false);
  const [previewDocument, setPreviewDocument] = useState<VectorDocument | null>(null);
  const previewDocumentRef = useRef<VectorDocument | null>(null);
  const [draftPath, setDraftPath] = useState<VectorPath | null>(null);
  const draftPathRef = useRef<VectorPath | null>(null);
  const [penCursor, setPenCursor] = useState<Vec2 | null>(null);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Vec2; current: Vec2 } | null>(null);
  const [shapePreview, setShapePreview] = useState<VectorPath | null>(null);
  const shapePreviewRef = useRef<VectorPath | null>(null);
  const [dimensionHud, setDimensionHud] = useState<{ point: Vec2; label: string } | null>(null);
  const duplicateCountRef = useRef(0);
  const copiedTextsRef = useRef<(NonNullable<VectorDocument["texts"]>[number])[]>([]);
  const textPasteCountRef = useRef(0);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [viewportSize, setViewportSize] = useState({ width: 900, height: 600 });
  const { copy, paste } = useClipboard();
  const viewport = useViewport(materialBounds);

  useEffect(() => { documentRef.current = document; previewDocumentRef.current = null; setPreviewDocument(null); }, [document]);
  useEffect(() => { selectedPathIdsRef.current = selectedPathIds; }, [selectedPathIds]);
  useEffect(() => { selectedNodesRef.current = selectedNodes; }, [selectedNodes]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => setViewportSize({ width: Math.max(1, svg.clientWidth), height: Math.max(1, svg.clientHeight) }));
    observer.observe(svg);
    setViewportSize({ width: Math.max(1, svg.clientWidth), height: Math.max(1, svg.clientHeight) });
    return () => observer.disconnect();
  }, []);

  const displayDocument = previewDocument ?? document;
  const pixelsPerMm = viewportSize.width / viewport.viewBox.width;
  const pointRadius = 4.5 / Math.max(0.001, pixelsPerMm);

  const combinedBounds = useCallback(() => {
    const vectorBounds = getVectorBounds(documentRef.current.paths.filter((path) => path.visible));
    const minX = Math.min(materialBounds.minX, vectorBounds.minX);
    const minY = Math.min(materialBounds.minY, vectorBounds.minY);
    const maxX = Math.max(materialBounds.maxX, vectorBounds.maxX);
    const maxY = Math.max(materialBounds.maxY, vectorBounds.maxY);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [materialBounds]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => viewport.zoomAt({ x: viewport.viewBox.x + viewport.viewBox.width / 2, y: viewport.viewBox.y + viewport.viewBox.height / 2 }, 0.8),
    zoomOut: () => viewport.zoomAt({ x: viewport.viewBox.x + viewport.viewBox.width / 2, y: viewport.viewBox.y + viewport.viewBox.height / 2 }, 1.25),
    fit: () => viewport.fit(combinedBounds()),
    fitSelection: () => {
      const paths = documentRef.current.paths.filter((path) => selectedPathIdsRef.current.includes(path.id) && path.visible);
      if (paths.length) viewport.fit(getVectorBounds(paths));
    },
    selectPaths: onSelectionChange,
  }), [combinedBounds, onSelectionChange, viewport]);

  const clientToDisplay = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);
  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const display = clientToDisplay(clientX, clientY);
    return { x: display.x, y: -display.y };
  }, [clientToDisplay]);

  const snapped = useCallback((point: Vec2, excludedPathIds = new Set<string>()) => {
    if (!snapEnabled) return point;
    const anchors = collectAnchorTargets(documentRef.current.paths, excludedPathIds);
    const advanced = collectAdvancedTargets(documentRef.current.paths, excludedPathIds);
    const result = snapPoint(point, {
      thresholdMm: pxToMmThreshold(8, pixelsPerMm),
      grid: true,
      gridSizeMm,
      anchors: [...anchors, ...advanced],
      material: materialBounds,
      origin: { x: 0, y: 0 },
      alignWith: anchors.map((target) => target.point),
    });
    setSnapGuides(result.guides);
    return result.point;
  }, [gridSizeMm, materialBounds, pixelsPerMm, snapEnabled]);

  const showPreview = (preview: VectorDocument) => {
    previewDocumentRef.current = preview;
    setPreviewDocument(preview);
  };

  const commitPreview = useCallback((preview: VectorDocument | null) => {
    if (!preview) return;
    onDocumentCommit(commitDocument(documentRef.current, preview.paths, preview.pathOrder, { texts: preview.texts ?? [], textOrder: preview.textOrder }));
    previewDocumentRef.current = null;
    setPreviewDocument(null);
  }, [onDocumentCommit]);

  const finalizeDraft = useCallback((closed: boolean) => {
    const draft = draftPathRef.current;
    if (draft && draft.nodes.length >= 2) {
      const finalPath = { ...draft, closed };
      const current = documentRef.current;
      onDocumentCommit(commitDocument(current, [...current.paths, finalPath], [...current.pathOrder, finalPath.id]));
      onSelectionChange([finalPath.id]);
    }
    draftPathRef.current = null;
    setDraftPath(null);
    setPenCursor(null);
    dragRef.current = null;
  }, [onDocumentCommit, onSelectionChange]);

  const startPathPointer = (event: React.PointerEvent<SVGPathElement>, path: VectorPath) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.focus();
    if (path.sourceTextId) {
      const ids = documentRef.current.paths.filter((item) => item.sourceTextId === path.sourceTextId).map((item) => item.id);
      const current = selectedPathIdsRef.current;
      if (event.shiftKey) {
        onSelectionChange(current.some((id) => ids.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
        onNodeSelectionChange([]);
        return;
      }
      const active = current.some((id) => ids.includes(id)) ? current : ids;
      onSelectionChange(active);
      onNodeSelectionChange([]);
      if (tool === "select" && !path.locked) {
        const selected = new Set(documentRef.current.paths.filter((item) => active.includes(item.id) && !item.locked).map((item) => item.id));
        const texts = (documentRef.current.texts ?? []).filter((text) => !text.locked && text.pathIds.some((id) => selected.has(id)));
        texts.forEach((text) => text.pathIds.forEach((id) => selected.add(id)));
        dragRef.current = { kind: "move", start: clientToWorld(event.clientX, event.clientY), original: cloneVectorDocument(documentRef.current), pathIds: [...selected], textIds: texts.map((text) => text.id) };
        svgRef.current?.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (path.locked) return;
    if (tool === "direct") {
      if (!selectedPathIdsRef.current.includes(path.id)) onSelectionChange([path.id]);
      return;
    }
    if (tool !== "select") return;
    const current = selectedPathIdsRef.current;
    if (event.shiftKey) {
      const next = current.includes(path.id) ? current.filter((id) => id !== path.id) : [...current, path.id];
      onSelectionChange(next);
      return;
    }
    let active = current.includes(path.id) ? current : [path.id];
    onNodeSelectionChange([]);
    let original = cloneVectorDocument(documentRef.current);
    const activeSet = new Set(original.paths.filter((item) => active.includes(item.id) && !item.locked).map((item) => item.id));
    const selectedTexts = (original.texts ?? []).filter((text) => !text.locked && text.pathIds.some((id) => activeSet.has(id)));
    selectedTexts.forEach((text) => text.pathIds.forEach((id) => activeSet.add(id)));
    active = [...activeSet];
    if (event.altKey && !selectedTexts.length) {
      const duplicates = duplicateVectorPaths(original.paths.filter((item) => active.includes(item.id)), 0);
      original = { ...original, paths: [...original.paths, ...duplicates], pathOrder: [...original.pathOrder, ...duplicates.map((item) => item.id)] };
      active = duplicates.map((item) => item.id);
    }
    onSelectionChange(active);
    dragRef.current = { kind: "move", start: clientToWorld(event.clientX, event.clientY), original, pathIds: active, textIds: selectedTexts.map((text) => text.id) };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const splitSegmentAtPointer = (event: React.MouseEvent<SVGPathElement>, path: VectorPath) => {
    if (tool !== "direct" || path.locked || path.sourceTextId) return;
    event.preventDefault();
    event.stopPropagation();
    const hit = closestPointOnPath(path, clientToWorld(event.clientX, event.clientY));
    if (hit.distance > pxToMmThreshold(12, pixelsPerMm) || hit.t <= 0.001 || hit.t >= 0.999) return;
    const nodeId = createId("node");
    const nextPath = splitPathSegment(path, hit.segmentIndex, hit.t, nodeId);
    const current = documentRef.current;
    onDocumentCommit(commitDocument(current, current.paths.map((item) => item.id === path.id ? nextPath : item)));
    onSelectionChange([path.id]);
    onNodeSelectionChange([{ pathId: path.id, nodeId }]);
  };

  const startNodePointer = (event: React.PointerEvent<SVGCircleElement>, pathId: string, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (tool !== "direct") return;
    const existing = selectedNodesRef.current;
    const included = existing.some((item) => item.pathId === pathId && item.nodeId === nodeId);
    const next = event.shiftKey
      ? included ? existing.filter((item) => item.pathId !== pathId || item.nodeId !== nodeId) : [...existing, { pathId, nodeId }]
      : included ? existing : [{ pathId, nodeId }];
    onSelectionChange([pathId]);
    onNodeSelectionChange(next);
    dragRef.current = { kind: "node", start: clientToWorld(event.clientX, event.clientY), original: cloneVectorDocument(documentRef.current), nodes: next };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startHandlePointer = (event: React.PointerEvent<SVGCircleElement>, pathId: string, nodeId: string, side: "in" | "out") => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind: "handle", original: cloneVectorDocument(documentRef.current), pathId, nodeId, side };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startResizePointer = (event: React.PointerEvent<SVGCircleElement>, handle: ResizeHandle) => {
    if (tool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    const pathIds = selectedPathIdsRef.current;
    const paths = documentRef.current.paths.filter((path) => pathIds.includes(path.id) && !path.locked);
    if (!paths.length) return;
    dragRef.current = { kind: "resize", original: cloneVectorDocument(documentRef.current), pathIds: paths.map((path) => path.id), bounds: getVectorBounds(paths), handle };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startRotatePointer = (event: React.PointerEvent<SVGCircleElement>) => {
    if (tool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    const pathIds = selectedPathIdsRef.current;
    const paths = documentRef.current.paths.filter((path) => pathIds.includes(path.id) && !path.locked);
    if (!paths.length) return;
    const bounds = getVectorBounds(paths);
    const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
    const point = clientToWorld(event.clientX, event.clientY);
    dragRef.current = { kind: "rotate", original: cloneVectorDocument(documentRef.current), pathIds: paths.map((path) => path.id), center, startAngle: Math.atan2(point.y - center.y, point.x - center.x) };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startWorkspacePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    svgRef.current?.focus();
    const raw = clientToWorld(event.clientX, event.clientY);
    if (event.button === 1 || spacePressedRef.current) {
      dragRef.current = { kind: "pan", startClient: { x: event.clientX, y: event.clientY }, startViewBox: { ...viewport.viewBox } };
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "hand") {
      dragRef.current = { kind: "pan", startClient: { x: event.clientX, y: event.clientY }, startViewBox: { ...viewport.viewBox } };
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "zoom") {
      viewport.zoomAt({ x: raw.x, y: -raw.y }, event.altKey ? 1.25 : 0.8);
      return;
    }
    if (tool === "text") {
      onTextCreate(snapped(raw));
      return;
    }
    if (tool === "select" || tool === "direct") {
      const drag = { kind: "window" as const, start: raw, current: raw, additive: event.shiftKey };
      dragRef.current = drag;
      setSelectionWindow({ start: raw, current: raw });
      if (!event.shiftKey) {
        onSelectionChange([]);
        onNodeSelectionChange([]);
      }
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
      const point = snapped(raw);
      dragRef.current = { kind: "shape", start: point, current: point, tool };
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "pen") {
      const closeDistance = pxToMmThreshold(10, pixelsPerMm);
      const existing = draftPathRef.current;
      if (existing && existing.nodes.length >= 2 && Math.hypot(raw.x - existing.nodes[0].anchor.x, raw.y - existing.nodes[0].anchor.y) <= closeDistance) {
        finalizeDraft(true);
        return;
      }
      const point = snapped(raw);
      const draft = existing ?? { id: createId("path"), name: "ペンパス", closed: false, nodes: [], visible: true, locked: false };
      const node = createVectorNode(point);
      const next = { ...draft, nodes: [...draft.nodes, node] };
      draftPathRef.current = next;
      setDraftPath(next);
      dragRef.current = { kind: "pen-handle", nodeId: node.id };
      svgRef.current?.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const raw = clientToWorld(event.clientX, event.clientY);
    onCursorPosition(raw);
    if (tool === "pen" && !dragRef.current) setPenCursor(raw);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      viewport.panByPixels({ x: event.clientX - drag.startClient.x, y: event.clientY - drag.startClient.y }, viewportSize, drag.startViewBox);
      return;
    }
    if (drag.kind === "window") {
      drag.current = raw;
      setSelectionWindow({ start: drag.start, current: raw });
      return;
    }
    if (drag.kind === "shape") {
      let current = snapped(raw);
      if (event.shiftKey) {
        if (drag.tool === "line") {
          const delta = { x: current.x - drag.start.x, y: current.y - drag.start.y };
          const length = Math.hypot(delta.x, delta.y);
          const angle = Math.round(Math.atan2(delta.y, delta.x) / (Math.PI / 4)) * (Math.PI / 4);
          current = { x: drag.start.x + Math.cos(angle) * length, y: drag.start.y + Math.sin(angle) * length };
        } else {
          const size = Math.max(Math.abs(current.x - drag.start.x), Math.abs(current.y - drag.start.y));
          current = { x: drag.start.x + Math.sign(current.x - drag.start.x || 1) * size, y: drag.start.y + Math.sign(current.y - drag.start.y || 1) * size };
        }
      }
      drag.current = current;
      const start = event.altKey && drag.tool !== "line" ? { x: drag.start.x * 2 - current.x, y: drag.start.y * 2 - current.y } : drag.start;
      const preview = drag.tool === "line" ? createLinePath(start, current) : drag.tool === "rectangle" ? createRectanglePath(start, current) : createEllipsePath(start, current);
      shapePreviewRef.current = preview;
      setShapePreview(preview);
      setDimensionHud({ point: current, label: shapeMeasurement(drag.tool, start, current).label });
      return;
    }
    if (drag.kind === "move") {
      const target = snapped(raw, new Set(drag.pathIds));
      const delta = { x: target.x - drag.start.x, y: target.y - drag.start.y };
      const next = {
        ...withUpdatedPaths(drag.original, new Set(drag.pathIds), (path) => movePath(path, delta)),
        texts: (drag.original.texts ?? []).map((text) => drag.textIds.includes(text.id) ? { ...text, position: { x: text.position.x + delta.x, y: text.position.y + delta.y } } : text),
      };
      showPreview(next);
      return;
    }
    if (drag.kind === "resize") {
      const parameters = resizeParameters(drag.bounds, drag.handle, raw);
      let scaleX = nonZeroScale(parameters.scaleX);
      let scaleY = nonZeroScale(parameters.scaleY);
      if (event.shiftKey) {
        const candidate = parameters.changesX && parameters.changesY
          ? (Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY)
          : parameters.changesX ? scaleX : scaleY;
        scaleX = nonZeroScale(candidate);
        scaleY = nonZeroScale(candidate);
      }
      showPreview(withUpdatedPaths(drag.original, new Set(drag.pathIds), (path) => scalePath(path, parameters.origin, scaleX, scaleY)));
      return;
    }
    if (drag.kind === "rotate") {
      const angle = Math.atan2(raw.y - drag.center.y, raw.x - drag.center.x);
      let delta = angle - drag.startAngle;
      if (event.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
      showPreview(withUpdatedPaths(drag.original, new Set(drag.pathIds), (path) => rotatePath(path, drag.center, delta)));
      return;
    }
    if (drag.kind === "node") {
      const primary = drag.nodes[0];
      const originalPath = drag.original.paths.find((path) => path.id === primary.pathId);
      const originalNode = originalPath?.nodes.find((node) => node.id === primary.nodeId);
      if (!originalNode) return;
      const target = snapped(raw, new Set(drag.nodes.map((node) => node.pathId)));
      const delta = { x: target.x - drag.start.x, y: target.y - drag.start.y };
      showPreview(moveNodes(drag.original, drag.nodes, delta));
      return;
    }
    if (drag.kind === "handle") {
      const path = drag.original.paths.find((item) => item.id === drag.pathId);
      const node = path?.nodes.find((item) => item.id === drag.nodeId);
      if (!path || !node) return;
      const handle = { x: raw.x - node.anchor.x, y: raw.y - node.anchor.y };
      showPreview({ ...drag.original, paths: drag.original.paths.map((item) => item.id === path.id ? applyHandleDrag(item, node.id, drag.side, handle) : item) });
      return;
    }
    if (drag.kind === "pen-handle") {
      const draft = draftPathRef.current;
      const node = draft?.nodes.find((item) => item.id === drag.nodeId);
      if (!draft || !node) return;
      let handle = { x: raw.x - node.anchor.x, y: raw.y - node.anchor.y };
      if (event.shiftKey) {
        const length = Math.hypot(handle.x, handle.y);
        const angle = Math.round(Math.atan2(handle.y, handle.x) / (Math.PI / 4)) * (Math.PI / 4);
        handle = { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
      }
      const next = {
        ...draft,
        nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, outHandle: handle, inHandle: { x: -handle.x, y: -handle.y }, nodeType: event.altKey ? "corner" as const : "symmetric" as const } : item),
      };
      draftPathRef.current = next;
      setDraftPath(next);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setSnapGuides([]);
    if (!drag) return;
    if (drag.kind === "move" || drag.kind === "resize" || drag.kind === "rotate" || drag.kind === "node" || drag.kind === "handle") commitPreview(previewDocumentRef.current);
    else if (drag.kind === "window") {
      const windowBounds = rectFromPoints(drag.start, drag.current);
      const hits = documentRef.current.paths.filter((path) => {
        if (!path.visible || path.locked) return false;
        const bounds = getVectorBounds([path]);
        return bounds.minX >= windowBounds.minX && bounds.maxX <= windowBounds.maxX && bounds.minY >= windowBounds.minY && bounds.maxY <= windowBounds.maxY;
      }).map((path) => path.id);
      onSelectionChange(drag.additive ? [...new Set([...selectedPathIdsRef.current, ...hits])] : hits);
      setSelectionWindow(null);
    } else if (drag.kind === "shape") {
      const path = shapePreviewRef.current;
      if (path) {
        const bounds = getVectorBounds([path]);
        if (bounds.width > 0.001 || bounds.height > 0.001) {
          const current = documentRef.current;
          onDocumentCommit(commitDocument(current, [...current.paths, path], [...current.pathOrder, path.id]));
          onSelectionChange([path.id]);
        }
      }
      shapePreviewRef.current = null;
      setShapePreview(null);
      setDimensionHud(null);
    }
    try { svgRef.current?.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.code === "Space") { spacePressedRef.current = true; event.preventDefault(); return; }
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) onRedo(); else onUndo(); return; }
      if (modifier && event.key.toLowerCase() === "a") { event.preventDefault(); onSelectionChange(documentRef.current.paths.filter((path) => path.visible && !path.locked).map((path) => path.id)); return; }
      if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        const selected = new Set(selectedPathIdsRef.current);
        const texts = (documentRef.current.texts ?? []).filter((text) => text.pathIds.some((id) => selected.has(id)));
        copiedTextsRef.current = texts.map((text) => ({ ...text, position: { ...text.position }, pathIds: [...text.pathIds] }));
        textPasteCountRef.current = 0;
        copy(documentRef.current.paths.filter((path) => selected.has(path.id) && !path.sourceTextId));
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        let next = documentRef.current;
        const createdIds: string[] = [];
        if (copiedTextsRef.current.length) {
          textPasteCountRef.current += 1;
          copiedTextsRef.current.forEach((source) => {
            const duplicate = { ...source, id: createId("text"), name: `${source.name} のコピー`, position: { x: source.position.x + textPasteCountRef.current * 5, y: source.position.y - textPasteCountRef.current * 5 }, pathIds: [] };
            next = insertVectorText(next, duplicate);
            createdIds.push(...(next.texts?.find((text) => text.id === duplicate.id)?.pathIds ?? []));
          });
        }
        const duplicates = paste();
        if (duplicates.length) {
          next = commitDocument(next, [...next.paths, ...duplicates], [...next.pathOrder, ...duplicates.map((path) => path.id)]);
          createdIds.push(...duplicates.map((path) => path.id));
        }
        if (createdIds.length) {
          onDocumentCommit(next);
          onSelectionChange(createdIds);
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selected = new Set(selectedPathIdsRef.current);
        const selectedTexts = (documentRef.current.texts ?? []).filter((text) => text.pathIds.some((id) => selected.has(id)));
        let next = documentRef.current;
        const createdIds: string[] = [];
        if (selectedTexts.length) {
          selectedTexts.forEach((source) => {
            const duplicate = { ...source, id: createId("text"), name: `${source.name} のコピー`, position: { x: source.position.x + 5, y: source.position.y - 5 }, pathIds: [] };
            next = insertVectorText(next, duplicate);
            createdIds.push(...(next.texts?.find((text) => text.id === duplicate.id)?.pathIds ?? []));
          });
        }
        const sources = documentRef.current.paths.filter((path) => selected.has(path.id) && !path.sourceTextId);
        if (sources.length) {
          duplicateCountRef.current += 1;
          const duplicates = duplicateVectorPaths(sources, duplicateCountRef.current);
          next = commitDocument(next, [...next.paths, ...duplicates], [...next.pathOrder, ...duplicates.map((path) => path.id)]);
          createdIds.push(...duplicates.map((path) => path.id));
        }
        if (createdIds.length) {
          onDocumentCommit(next);
          onSelectionChange(createdIds);
        }
        return;
      }
      if (tool === "pen" && event.key === "Enter") { event.preventDefault(); finalizeDraft(false); return; }
      if (event.key === "Escape") {
        event.preventDefault();
        if (tool === "pen") finalizeDraft(false);
        if (tool === "select") onSelectionChange([]);
        else onToolChange("select");
        onNodeSelectionChange([]);
        setDimensionHud(null);
        return;
      }
      if (tool === "pen" && event.key === "Backspace" && draftPathRef.current) {
        event.preventDefault();
        const next = { ...draftPathRef.current, nodes: draftPathRef.current.nodes.slice(0, -1) };
        draftPathRef.current = next.nodes.length ? next : null;
        setDraftPath(next.nodes.length ? next : null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const current = documentRef.current;
        const selectedPathSet = new Set(selectedPathIdsRef.current);
        const selectedTexts = (current.texts ?? []).filter((text) => text.pathIds.some((id) => selectedPathSet.has(id)));
        if (selectedTexts.length) {
          let next = current;
          selectedTexts.filter((text) => !text.locked).forEach((text) => { next = deleteVectorText(next, text.id); });
          const standaloneIds = new Set(current.paths.filter((path) => selectedPathSet.has(path.id) && !path.sourceTextId && !path.locked).map((path) => path.id));
          if (standaloneIds.size) next = commitDocument(next, next.paths.filter((path) => !standaloneIds.has(path.id)));
          if (next !== current) {
            onDocumentCommit(next);
            onSelectionChange([]);
          }
          return;
        }
        if (tool === "direct" && selectedNodesRef.current.length) {
          const selected = new Set(selectedNodesRef.current.map((item) => `${item.pathId}:${item.nodeId}`));
          const paths = current.paths.map((path) => ({ ...path, nodes: path.nodes.filter((node) => !selected.has(`${path.id}:${node.id}`)) })).filter((path) => path.nodes.length >= 2);
          onDocumentCommit(commitDocument(current, paths));
          onNodeSelectionChange([]);
        } else if (selectedPathIdsRef.current.length) {
          const selected = new Set(selectedPathIdsRef.current);
          onDocumentCommit(commitDocument(current, current.paths.filter((path) => !selected.has(path.id))));
          onSelectionChange([]);
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = { x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, y: event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0 };
        const current = documentRef.current;
        const selected = new Set(selectedPathIdsRef.current);
        const selectedTextObjects = (current.texts ?? []).filter((text) => text.pathIds.some((id) => selected.has(id)));
        if (selectedTextObjects.length) {
          const selectedTexts = selectedTextObjects.filter((text) => !text.locked);
          let next = current;
          selectedTexts.forEach((text) => { next = updateVectorText(next, text.id, { position: { x: text.position.x + delta.x, y: text.position.y + delta.y } }); });
          const standaloneIds = new Set(current.paths.filter((path) => selected.has(path.id) && !path.sourceTextId && !path.locked).map((path) => path.id));
          if (standaloneIds.size) next = commitDocument(next, withUpdatedPaths(next, standaloneIds, (path) => movePath(path, delta)).paths);
          if (next !== current) {
            onDocumentCommit(next);
            onSelectionChange([
              ...selectedTexts.flatMap((text) => next.texts?.find((item) => item.id === text.id)?.pathIds ?? []),
              ...standaloneIds,
            ]);
          }
        } else if (tool === "direct" && selectedNodesRef.current.length) onDocumentCommit(commitDocument(current, moveNodes(current, selectedNodesRef.current, delta).paths));
        else if (selectedPathIdsRef.current.length) onDocumentCommit(commitDocument(current, withUpdatedPaths(current, new Set(selectedPathIdsRef.current), (path) => movePath(path, delta)).paths));
        return;
      }
      const shortcut = event.key.toLowerCase();
      const map: Record<string, EditorTool> = { v: "select", a: "direct", p: "pen", l: "line", r: "rectangle", e: "ellipse", t: "text", h: "hand", z: "zoom" };
      if (map[shortcut] && !modifier) { event.preventDefault(); onToolChange(map[shortcut]); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === "Space") spacePressedRef.current = false; };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); };
  }, [copy, finalizeDraft, onDocumentCommit, onNodeSelectionChange, onRedo, onSelectionChange, onToolChange, onUndo, paste, tool]);

  const selectedBounds = useMemo(() => {
    const paths = displayDocument.paths.filter((path) => selectedPathIds.includes(path.id));
    return paths.length ? getVectorBounds(paths) : null;
  }, [displayDocument.paths, selectedPathIds]);
  const windowRect = selectionWindow ? rectFromPoints(selectionWindow.start, selectionWindow.current) : null;
  const renderedPaths = orderedPaths(displayDocument);
  const selectionContainsText = displayDocument.paths.some((path) => selectedPathIds.includes(path.id) && path.sourceTextId);

  return (
    <div className="vector-editor">
      <svg
        ref={svgRef}
        className={`vector-editor-svg tool-${tool}`}
        viewBox={`${viewport.viewBox.x} ${viewport.viewBox.y} ${viewport.viewBox.width} ${viewport.viewBox.height}`}
        tabIndex={0}
        onPointerDown={startWorkspacePointer}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={(event) => {
          event.preventDefault();
          const display = clientToDisplay(event.clientX, event.clientY);
          viewport.zoomAt(display, Math.exp(event.deltaY * 0.0012));
        }}
      >
        <Grid viewBox={viewport.viewBox} size={gridSizeMm} visible={gridVisible} />
        <rect x={materialBounds.minX} y={-materialBounds.maxY} width={materialBounds.width} height={materialBounds.height} className="material-sheet" vectorEffect="non-scaling-stroke" />
        <line x1={viewport.viewBox.x} y1={0} x2={viewport.viewBox.x + viewport.viewBox.width} y2={0} className="origin-axis" vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={viewport.viewBox.y} x2={0} y2={viewport.viewBox.y + viewport.viewBox.height} className="origin-axis" vectorEffect="non-scaling-stroke" />
        {renderedPaths.filter((path) => path.visible && path.nodes.length >= 2).map((path) => (
          <g key={path.id}>
            {path.style && path.style.strokeWidthMm > 0 && <path d={vectorPathToSvgData(path)} className="vector-path-width" strokeWidth={path.style.strokeWidthMm} />}
            <path
              d={vectorPathToSvgData(path)}
              className={`vector-path${selectedPathIds.includes(path.id) ? " is-selected" : ""}${path.locked ? " is-locked" : ""}`}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => startPathPointer(event, path)}
              onDoubleClick={(event) => splitSegmentAtPointer(event, path)}
            />
          </g>
        ))}
        {shapePreview && <path d={vectorPathToSvgData(shapePreview)} className="vector-path drawing-preview" vectorEffect="non-scaling-stroke" />}
        {dimensionHud && <g className="dimension-hud" transform={`translate(${dimensionHud.point.x + pointRadius * 3} ${-dimensionHud.point.y - pointRadius * 7})`} pointerEvents="none">
          <rect width={pointRadius * 38} height={pointRadius * 5.5} rx={pointRadius} />
          <text x={pointRadius * 1.5} y={pointRadius * 3.55} fontSize={pointRadius * 2.25}>{dimensionHud.label}</text>
        </g>}
        {draftPath && draftPath.nodes.length > 0 && (
          <>
            <path d={vectorPathToSvgData(draftPath)} className="vector-path drawing-preview" vectorEffect="non-scaling-stroke" />
            {penCursor && <line x1={draftPath.nodes[draftPath.nodes.length - 1].anchor.x} y1={-draftPath.nodes[draftPath.nodes.length - 1].anchor.y} x2={penCursor.x} y2={-penCursor.y} className="pen-preview-line" vectorEffect="non-scaling-stroke" />}
          </>
        )}
        <SelectionOverlay bounds={selectedBounds} radiusMm={pointRadius} interactive={tool === "select" && !selectionContainsText} onResizePointerDown={startResizePointer} onRotatePointerDown={startRotatePointer} />
        {tool === "direct" && renderedPaths.filter((path) => selectedPathIds.includes(path.id) && path.visible && !path.locked && !path.sourceTextId).map((path) => (
          <NodeOverlay key={path.id} path={path} selectedNodes={selectedNodes} radiusMm={pointRadius} onNodePointerDown={startNodePointer} onHandlePointerDown={startHandlePointer} />
        ))}
        {draftPath && <NodeOverlay path={draftPath} selectedNodes={draftPath.nodes.map((node) => ({ pathId: draftPath.id, nodeId: node.id }))} radiusMm={pointRadius} onNodePointerDown={() => undefined} onHandlePointerDown={() => undefined} />}
        {windowRect && <rect x={windowRect.minX} y={-windowRect.maxY} width={windowRect.maxX - windowRect.minX} height={windowRect.maxY - windowRect.minY} className="selection-window" vectorEffect="non-scaling-stroke" />}
        {snapGuides.map((guide, index) => guide.axis === "x"
          ? <line key={`${guide.kind}-${index}`} x1={guide.point.x} y1={viewport.viewBox.y} x2={guide.point.x} y2={viewport.viewBox.y + viewport.viewBox.height} className="snap-guide" vectorEffect="non-scaling-stroke" />
          : <line key={`${guide.kind}-${index}`} x1={viewport.viewBox.x} y1={-guide.point.y} x2={viewport.viewBox.x + viewport.viewBox.width} y2={-guide.point.y} className="snap-guide" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="editor-zoom-label">{Math.round(pixelsPerMm * 100)}%</div>
    </div>
  );
});
