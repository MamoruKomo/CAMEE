import { Crosshair, Focus, MousePointer2, Play, X } from "lucide-react";
import { TOOL_CONTEXT, selectionSummary, type EditorTool } from "@/lib/editor/tool-context";

export function ContextBar({
  tool,
  selectionCount,
  selectedNodeCount,
  textSelected,
  onSelectTool,
  onFitSelection,
  onOpenCam,
}: {
  tool: EditorTool;
  selectionCount: number;
  selectedNodeCount: number;
  textSelected: boolean;
  onSelectTool: (tool: EditorTool) => void;
  onFitSelection: () => void;
  onOpenCam: () => void;
}) {
  const context = TOOL_CONTEXT[tool];
  const hasSelection = selectionCount > 0;
  return <div className="context-bar">
    <div className="context-tool"><Crosshair size={15} /><strong>{context.label}</strong><kbd>{context.shortcut}</kbd></div>
    <p>{context.hint}</p>
    <span className={`context-selection${hasSelection ? " has-selection" : ""}`} aria-live="polite">{selectionSummary(selectionCount, selectedNodeCount, textSelected)}</span>
    <div className="context-actions">
      {tool !== "select" && <button type="button" title="ツールを完了して選択へ戻る" onClick={() => onSelectTool("select")}><X size={13} />完了 <kbd>Esc</kbd></button>}
      {hasSelection && <button type="button" title="選択範囲を画面に合わせる" onClick={onFitSelection}><Focus size={13} />選択を表示</button>}
      {hasSelection && <button type="button" className="is-primary" title="右パネルで加工条件を設定" onClick={onOpenCam}><Play size={13} />加工設定へ</button>}
      {!hasSelection && tool === "select" && <span className="context-idle"><MousePointer2 size={13} />図形を選ぶか、左の作図ツールを選択</span>}
    </div>
  </div>;
}
