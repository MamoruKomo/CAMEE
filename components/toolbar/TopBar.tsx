import { Download, FileDown, FileInput, FolderOpen, Grid3X3, Redo2, Rotate3d, Save, Undo2 } from "lucide-react";

type TopBarProps = {
  projectName: string;
  saveStatus: "loading" | "saving" | "saved" | "error";
  view: "2d" | "3d";
  canUndo: boolean;
  canRedo: boolean;
  onNameChange: (name: string) => void;
  onNew: () => void;
  onImport: () => void;
  onExport: () => void;
  onDxfImport: () => void;
  onSvgImport: () => void;
  onSvgExport: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewChange: (view: "2d" | "3d") => void;
};

export function TopBar(props: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="cutpath-brand"><span>CP</span><strong>CutPath</strong><small>BETA</small></div>
      <div className="project-actions">
        <button type="button" onClick={props.onNew} title="新規Project">新規</button>
        <button type="button" onClick={props.onImport} title="CutPath JSONを読込"><FolderOpen size={16} /> JSON読込</button>
        <button type="button" onClick={props.onExport} title="CutPath JSONを書出"><FileDown size={16} /> JSON保存</button>
        <button type="button" onClick={props.onDxfImport} title="DXFを読込"><FileInput size={16} /> DXF</button>
        <button type="button" onClick={props.onSvgImport} title="SVGを読込"><FileInput size={16} /> SVG</button>
        <button type="button" onClick={props.onSvgExport} title="SVGを書出"><Download size={16} /> SVG</button>
      </div>
      <input className="project-name-input" value={props.projectName} maxLength={80} aria-label="プロジェクト名" onChange={(event) => props.onNameChange(event.target.value)} />
      <div className="history-actions">
        <button type="button" disabled={!props.canUndo} onClick={props.onUndo} aria-label="元に戻す"><Undo2 size={17} /></button>
        <button type="button" disabled={!props.canRedo} onClick={props.onRedo} aria-label="やり直す"><Redo2 size={17} /></button>
        <button type="button" onClick={props.onSave} title="IndexedDBへ保存"><Save size={17} /> <span>{props.saveStatus === "loading" ? "読込中" : props.saveStatus === "saving" ? "保存中" : props.saveStatus === "error" ? "保存エラー" : "保存済み"}</span></button>
      </div>
      <div className="view-toggle" role="group" aria-label="表示切替">
        <button type="button" className={props.view === "2d" ? "is-active" : ""} onClick={() => props.onViewChange("2d")}><Grid3X3 size={17} />2D</button>
        <button type="button" className={props.view === "3d" ? "is-active" : ""} onClick={() => props.onViewChange("3d")}><Rotate3d size={17} />3D</button>
      </div>
    </header>
  );
}
