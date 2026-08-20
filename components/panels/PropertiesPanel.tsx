"use client";

import { applyHandleDrag, handleFromPolar, handlePolar, setNodeType } from "@/lib/vector/bezier";
import { getVectorBounds, resizePathToBounds, rotatePath } from "@/lib/vector/transform";
import { commitDocument, type VectorDocument, type VectorNodeType, type VectorPath } from "@/lib/vector/types";
import type { SelectedNodeRef } from "@/components/editor/NodeOverlay";

function NumericField({ label, value, unit = "mm", onCommit }: { label: string; value: number; unit?: string; onCommit: (value: number) => void }) {
  const formatted = String(Number(value.toFixed(3)));
  const commit = (input: HTMLInputElement) => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else input.value = formatted;
  };
  return (
    <label className="compact-field"><span>{label}</span><span><input key={formatted} defaultValue={formatted} inputMode="decimal" onBlur={(event) => commit(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><b>{unit}</b></span></label>
  );
}

export function PropertiesPanel({
  document,
  selectedPathIds,
  selectedNodes,
  onCommit,
}: {
  document: VectorDocument;
  selectedPathIds: string[];
  selectedNodes: SelectedNodeRef[];
  onCommit: (document: VectorDocument) => void;
}) {
  const path = selectedPathIds.length === 1 ? document.paths.find((item) => item.id === selectedPathIds[0]) ?? null : null;
  const nodeRef = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const nodePath = nodeRef ? document.paths.find((item) => item.id === nodeRef.pathId) : null;
  const node = nodePath?.nodes.find((item) => item.id === nodeRef?.nodeId) ?? null;
  const bounds = path ? getVectorBounds([path]) : null;
  const updatePath = (next: VectorPath) => onCommit(commitDocument(document, document.paths.map((item) => item.id === next.id ? next : item)));
  const updateNodeAnchor = (axis: "x" | "y", value: number) => {
    if (!nodePath || !node) return;
    updatePath({ ...nodePath, nodes: nodePath.nodes.map((item) => item.id === node.id ? { ...item, anchor: { ...item.anchor, [axis]: value } } : item) });
  };
  const updateNodeType = (nodeType: VectorNodeType) => { if (nodePath && node) updatePath(setNodeType(nodePath, node.id, nodeType)); };
  const updateHandle = (side: "in" | "out", key: "length" | "angleDegrees", value: number) => {
    if (!nodePath || !node) return;
    const property = side === "in" ? "inHandle" : "outHandle";
    const current = node[property];
    const polar = current ? handlePolar(current) : { length: 0, angleDegrees: side === "in" ? 180 : 0 };
    const next = handleFromPolar(key === "length" ? Math.max(0, value) : polar.length, key === "angleDegrees" ? value : polar.angleDegrees);
    updatePath(applyHandleDrag(nodePath, node.id, side, next));
  };

  return (
    <section className="properties-panel panel-block">
      <h2>プロパティ</h2>
      {!path && !node && <p className="empty-hint">パスまたはアンカーを選択</p>}
      {path && (
        <>
          <label className="text-field"><span>パス名</span><input value={path.name} onChange={(event) => updatePath({ ...path, name: event.target.value })} /></label>
          {bounds && <div className="numeric-grid">
            <NumericField label="X" value={bounds.minX} onCommit={(value) => updatePath(resizePathToBounds(path, { minX: value }))} />
            <NumericField label="Y" value={bounds.minY} onCommit={(value) => updatePath(resizePathToBounds(path, { minY: value }))} />
            <NumericField label="W" value={bounds.width} onCommit={(value) => { if (value >= 0) updatePath(resizePathToBounds(path, { width: value })); }} />
            <NumericField label="H" value={bounds.height} onCommit={(value) => { if (value >= 0) updatePath(resizePathToBounds(path, { height: value })); }} />
            <NumericField key={`rotation-${document.revision}`} label="回転Δ" value={0} unit="°" onCommit={(value) => updatePath(rotatePath(path, { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 }, value * Math.PI / 180))} />
            <NumericField label="表示線幅" value={path.style?.strokeWidthMm ?? 0} onCommit={(value) => { if (value >= 0) updatePath({ ...path, style: { strokeWidthMm: value } }); }} />
          </div>}
          <p className="property-note">表示線幅はSVGとCanvasの見た目だけです。加工幅はCAMのビット径で設定します。</p>
          <div className="segmented-row">
            <button type="button" className={!path.closed ? "is-active" : ""} onClick={() => updatePath({ ...path, closed: false })}>Open</button>
            <button type="button" className={path.closed ? "is-active" : ""} onClick={() => updatePath({ ...path, closed: true })}>Closed</button>
          </div>
          <label className="check-row"><input type="checkbox" checked={path.visible} onChange={(event) => updatePath({ ...path, visible: event.target.checked })} />表示</label>
          <label className="check-row"><input type="checkbox" checked={path.locked} onChange={(event) => updatePath({ ...path, locked: event.target.checked })} />ロック</label>
        </>
      )}
      {node && (
        <div className="node-properties">
          <h3>アンカー</h3>
          <div className="numeric-grid">
            <NumericField label="X" value={node.anchor.x} onCommit={(value) => updateNodeAnchor("x", value)} />
            <NumericField label="Y" value={node.anchor.y} onCommit={(value) => updateNodeAnchor("y", value)} />
          </div>
          <div className="segmented-row node-types">
            {(["corner", "smooth", "symmetric"] as VectorNodeType[]).map((type) => <button key={type} type="button" className={node.nodeType === type ? "is-active" : ""} onClick={() => updateNodeType(type)}>{type === "corner" ? "角" : type === "smooth" ? "スムーズ" : "対称"}</button>)}
          </div>
          <h3>ハンドル</h3>
          {!node.inHandle && !node.outHandle && <button type="button" className="secondary-action" onClick={() => updatePath(applyHandleDrag(nodePath!, node.id, "out", { x: 10, y: 0 }))}>ハンドルを追加</button>}
          {(["in", "out"] as const).map((side) => {
            const handle = side === "in" ? node.inHandle : node.outHandle;
            if (!handle) return null;
            const polar = handlePolar(handle);
            return <div className="numeric-grid handle-fields" key={side}>
              <NumericField label={side === "in" ? "In 長さ" : "Out 長さ"} value={polar.length} onCommit={(value) => updateHandle(side, "length", value)} />
              <NumericField label="角度" value={polar.angleDegrees} unit="°" onCommit={(value) => updateHandle(side, "angleDegrees", value)} />
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
