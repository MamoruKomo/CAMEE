import { AlertTriangle, Box, Download, Play, Trash2 } from "lucide-react";
import type { CamSettings } from "@/lib/cam";
import { isCamOperationStale, type CamOperation, type CamSafetyIssue } from "@/lib/cam/operations";
import type { BitDefinition, ProjectMaterial } from "@/lib/project/types";
import type { VectorDocument } from "@/lib/vector/types";

function NumberField({ label, value, unit, min = 0, step = 0.1, onChange }: { label: string; value: number; unit: string; min?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="cam-number"><span>{label}</span><span><input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></span></label>;
}

export function CamPanel({
  document,
  material,
  settings,
  bits,
  activeBitId,
  operationName,
  operations,
  activeOperationId,
  issues,
  selectionCount,
  onMaterialChange,
  onSettingsChange,
  onBitChange,
  onOperationNameChange,
  onCalculate,
  onSelectOperation,
  onDeleteOperation,
  onExport,
}: {
  document: VectorDocument;
  material: ProjectMaterial;
  settings: CamSettings;
  bits: BitDefinition[];
  activeBitId: string;
  operationName: string;
  operations: CamOperation[];
  activeOperationId: string | null;
  issues: CamSafetyIssue[];
  selectionCount: number;
  onMaterialChange: (material: ProjectMaterial) => void;
  onSettingsChange: (settings: CamSettings) => void;
  onBitChange: (id: string) => void;
  onOperationNameChange: (name: string) => void;
  onCalculate: () => void;
  onSelectOperation: (id: string) => void;
  onDeleteOperation: (id: string) => void;
  onExport: () => void;
}) {
  const updateSetting = (key: keyof CamSettings, value: number | boolean) => onSettingsChange({ ...settings, [key]: value });
  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <section className="cam-panel panel-block">
      <h2>材料 / CAM</h2>
      <div className="cam-section">
        <h3><Box size={14} />材料</h3>
        <div className="cam-grid material-grid">
          <NumberField label="W" value={material.width} unit="mm" onChange={(width) => onMaterialChange({ ...material, width })} />
          <NumberField label="H" value={material.height} unit="mm" onChange={(height) => onMaterialChange({ ...material, height })} />
          <NumberField label="D" value={material.thickness} unit="mm" onChange={(thickness) => onMaterialChange({ ...material, thickness })} />
        </div>
        <label className="select-field"><span>XY原点</span><select value={material.origin} onChange={(event) => onMaterialChange({ ...material, origin: event.target.value as ProjectMaterial["origin"] })}>
          <option value="lower-left">材料の左下</option><option value="lower-center">材料の下中央</option><option value="lower-right">材料の右下</option>
          <option value="center-left">材料の左中央</option><option value="center">材料の中央</option><option value="center-right">材料の右中央</option>
          <option value="upper-left">材料の左上</option><option value="upper-center">材料の上中央</option><option value="upper-right">材料の右上</option><option value="dxf">DXF原点</option>
        </select></label>
      </div>
      <div className="cam-section">
        <h3>センターライン</h3>
        <label className="text-field"><span>Operation名</span><input value={operationName} maxLength={60} onChange={(event) => onOperationNameChange(event.target.value)} /></label>
        <label className="select-field"><span>ビット</span><select value={activeBitId} onChange={(event) => onBitChange(event.target.value)}>{bits.map((bit) => <option key={bit.id} value={bit.id}>{bit.name} / Ø{bit.cuttingDiameter}mm</option>)}</select></label>
        <div className="cam-grid">
          <NumberField label="最終深さ" value={settings.finalDepth} unit="mm" onChange={(value) => updateSetting("finalDepth", value)} />
          <NumberField label="1回の深さ" value={settings.stepDown} unit="mm" onChange={(value) => updateSetting("stepDown", value)} />
          <NumberField label="送り" value={settings.feedRate} unit="mm/min" step={50} onChange={(value) => updateSetting("feedRate", value)} />
          <NumberField label="切込" value={settings.plungeRate} unit="mm/min" step={50} onChange={(value) => updateSetting("plungeRate", value)} />
          <NumberField label="退避Z" value={settings.retractHeight} unit="mm" onChange={(value) => updateSetting("retractHeight", value)} />
          <NumberField label="早送り" value={settings.rapidFeed} unit="mm/min" step={100} onChange={(value) => updateSetting("rapidFeed", value)} />
        </div>
        <label className="check-row"><input type="checkbox" checked={settings.rampEnabled} onChange={(event) => updateSetting("rampEnabled", event.target.checked)} />ランプ進入（閉路のみ）</label>
        {settings.rampEnabled && <NumberField label="ランプ長さ" value={settings.rampLength} unit="mm" onChange={(value) => updateSetting("rampLength", value)} />}
        <label className="check-row through-cut"><input type="checkbox" checked={material.allowThroughCut} onChange={(event) => onMaterialChange({ ...material, allowThroughCut: event.target.checked })} />材料厚を超える貫通加工を許可</label>
        <button type="button" className="calculate-cam" disabled={!selectionCount} onClick={onCalculate}><Play size={16} fill="currentColor" />選択中 {selectionCount} パスを計算</button>
      </div>
      <div className="operation-list">
        <h3>Operation</h3>
        {operations.map((operation) => {
          const stale = isCamOperationStale(operation, document);
          return <div key={operation.id} className={`operation-row${activeOperationId === operation.id ? " is-active" : ""}${stale ? " is-stale" : ""}`}>
            <button type="button" className="operation-main" onClick={() => onSelectOperation(operation.id)}><strong>{operation.name}</strong><span>{operation.sourcePathIds.length} パス / Z-{operation.settings.finalDepth}mm {stale ? "・再計算必要" : "・計算済み"}</span></button>
            <button type="button" aria-label={`${operation.name}を削除`} onClick={() => onDeleteOperation(operation.id)}><Trash2 size={14} /></button>
          </div>;
        })}
        {!operations.length && <p className="empty-hint">パスを選択して計算</p>}
      </div>
      {!!issues.length && <div className="safety-list" aria-live="polite">
        {issues.map((issue) => <p key={`${issue.code}-${issue.message}`} className={`is-${issue.severity}`}><AlertTriangle size={13} />{issue.message}</p>)}
      </div>}
      <button type="button" className="gcode-export" disabled={!activeOperationId || errors.length > 0} onClick={onExport}><Download size={16} />安全確認してG-code出力</button>
    </section>
  );
}
