"use client";

import { Type, Unlock, Trash2 } from "lucide-react";
import { buildTextPaths, CUTPATH_STROKE_FONT, deleteVectorText, outlineVectorText, textForSelectedPaths, updateVectorText } from "@/lib/vector/text";
import type { VectorDocument, VectorText } from "@/lib/vector/types";

function NumberField({ label, value, unit = "mm", min, onCommit }: { label: string; value: number; unit?: string; min?: number; onCommit: (value: number) => void }) {
  const formatted = String(Number(value.toFixed(3)));
  const commit = (input: HTMLInputElement) => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) onCommit(parsed);
    else input.value = formatted;
  };
  return <label className="compact-field"><span>{label}</span><span><input key={formatted} defaultValue={formatted} inputMode="decimal" onBlur={(event) => commit(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><b>{unit}</b></span></label>;
}

export function TextPanel({
  document,
  selectedPathIds,
  onSelectionChange,
  onCommit,
}: {
  document: VectorDocument;
  selectedPathIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onCommit: (document: VectorDocument) => void;
}) {
  const texts = document.texts ?? [];
  const active = textForSelectedPaths(document, selectedPathIds);
  const commitText = (text: VectorText, patch: Partial<Omit<VectorText, "id" | "pathIds" | "fontId" | "fontChecksum" | "outlineVersion">>) => {
    const next = updateVectorText(document, text.id, patch);
    onCommit(next);
    onSelectionChange(next.texts?.find((item) => item.id === text.id)?.pathIds ?? []);
  };
  const unsupported = active ? buildTextPaths(active).unsupportedCharacters : [];

  return <section className="text-panel panel-block">
    <div className="panel-heading"><h2>文字</h2><span>{texts.length}</span></div>
    <div className="text-object-list">
      {texts.map((text) => <button key={text.id} type="button" className={active?.id === text.id ? "is-active" : ""} onClick={() => onSelectionChange(text.pathIds)}><Type size={13} /><span>{text.name}</span><small>{text.text.replaceAll("\n", " ↵ ") || "空の文字"}</small></button>)}
    </div>
    {!texts.length && <p className="empty-hint">文字ツール（T）でCanvasをクリック</p>}
    {active && <div className="text-editor-fields">
      <label className="text-field"><span>名前</span><input key={`${active.id}-${active.name}`} defaultValue={active.name} onBlur={(event) => { if (event.currentTarget.value !== active.name) commitText(active, { name: event.currentTarget.value || "文字" }); }} /></label>
      <label className="text-field"><span>文字列</span><textarea key={`${active.id}-${active.text}`} defaultValue={active.text} rows={3} onBlur={(event) => { if (event.currentTarget.value !== active.text) commitText(active, { text: event.currentTarget.value }); }} /></label>
      <label className="text-field"><span>フォント</span><input value={CUTPATH_STROKE_FONT.name} readOnly /></label>
      <div className="numeric-grid">
        <NumberField label="サイズ" value={active.fontSizeMm} min={0.1} onCommit={(fontSizeMm) => commitText(active, { fontSizeMm })} />
        <NumberField label="表示線幅" value={active.strokeWidthMm} min={0} onCommit={(strokeWidthMm) => commitText(active, { strokeWidthMm })} />
        <NumberField label="字間" value={active.letterSpacingMm} min={0} onCommit={(letterSpacingMm) => commitText(active, { letterSpacingMm })} />
        <NumberField label="行間" value={active.lineHeightMm} min={0.1} onCommit={(lineHeightMm) => commitText(active, { lineHeightMm })} />
        <NumberField label="X" value={active.position.x} onCommit={(x) => commitText(active, { position: { ...active.position, x } })} />
        <NumberField label="Y" value={active.position.y} onCommit={(y) => commitText(active, { position: { ...active.position, y } })} />
        <NumberField label="回転" value={active.rotationDegrees} unit="°" onCommit={(rotationDegrees) => commitText(active, { rotationDegrees })} />
      </div>
      <div className="segmented-row">
        {(["left", "center", "right"] as const).map((align) => <button key={align} type="button" className={active.align === align ? "is-active" : ""} onClick={() => commitText(active, { align })}>{align === "left" ? "左" : align === "center" ? "中央" : "右"}</button>)}
      </div>
      <label className="check-row"><input type="checkbox" checked={active.visible} onChange={(event) => commitText(active, { visible: event.target.checked })} />表示</label>
      <label className="check-row"><input type="checkbox" checked={active.locked} onChange={(event) => commitText(active, { locked: event.target.checked })} />ロック</label>
      {unsupported.length > 0 && <p className="text-warning">未対応文字は「?」として作図: {unsupported.join(" ")}</p>}
      <p className="text-cam-note">表示線幅は見た目だけです。実加工幅はCAMのビット径で決まります。</p>
      <div className="text-actions">
        <button type="button" onClick={() => { const ids = [...active.pathIds]; onCommit(outlineVectorText(document, active.id)); onSelectionChange(ids); }}><Unlock size={13} />アウトライン化</button>
        <button type="button" className="is-danger" onClick={() => { onCommit(deleteVectorText(document, active.id)); onSelectionChange([]); }}><Trash2 size={13} />削除</button>
      </div>
    </div>}
  </section>;
}
