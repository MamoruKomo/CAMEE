import { Eye, EyeOff, Lock, LockOpen, Trash2 } from "lucide-react";
import { commitDocument, orderedPaths, type VectorDocument } from "@/lib/vector/types";

export function PathListPanel({
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
  const updatePath = (id: string, patch: Partial<{ name: string; visible: boolean; locked: boolean }>) => onCommit(commitDocument(document, document.paths.map((path) => path.id === id ? { ...path, ...patch } : path)));
  const removePath = (id: string) => {
    onCommit(commitDocument(document, document.paths.filter((path) => path.id !== id)));
    onSelectionChange(selectedPathIds.filter((pathId) => pathId !== id));
  };
  return (
    <section className="path-list-panel panel-block">
      <div className="panel-heading"><h2>パス</h2><span>{document.paths.length}</span></div>
      <div className="path-list">
        {orderedPaths(document).map((path) => (
          <div
            key={path.id}
            className={`path-row${selectedPathIds.includes(path.id) ? " is-selected" : ""}`}
            role="button"
            tabIndex={0}
            onClick={(event) => onSelectionChange(event.shiftKey ? [...new Set([...selectedPathIds, path.id])] : [path.id])}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectionChange([path.id]); } }}
          >
            <button type="button" aria-label={path.visible ? "非表示" : "表示"} onClick={(event) => { event.stopPropagation(); updatePath(path.id, { visible: !path.visible }); }}>{path.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
            <input
              value={path.name}
              aria-label="パス名"
              onClick={(event) => {
                event.stopPropagation();
                onSelectionChange(event.shiftKey ? [...new Set([...selectedPathIds, path.id])] : [path.id]);
              }}
              onChange={(event) => updatePath(path.id, { name: event.target.value })}
            />
            <button type="button" aria-label={path.locked ? "ロック解除" : "ロック"} onClick={(event) => { event.stopPropagation(); updatePath(path.id, { locked: !path.locked }); }}>{path.locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
            <button type="button" aria-label="削除" onClick={(event) => { event.stopPropagation(); removePath(path.id); }}><Trash2 size={14} /></button>
          </div>
        ))}
        {!document.paths.length && <p className="empty-hint">作図ツールでパスを追加</p>}
      </div>
    </section>
  );
}
