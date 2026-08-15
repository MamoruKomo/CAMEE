"use client";

import {
  Box,
  Check,
  CircleAlert,
  Download,
  Drill,
  FileType2,
  FolderOpen,
  Grid3X3,
  Info,
  Layers3,
  Maximize2,
  Play,
  Rotate3d,
  Ruler,
  Scissors,
  Settings2,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ToolpathPreview, type PreviewHandle } from "./ToolpathPreview";
import {
  buildPassDepths,
  estimateMinutes,
  generateGcode,
  getBounds,
  parseDxfText,
  pathsForOrigin,
  type CamSettings,
  type ParsedDrawing,
} from "@/lib/cam";

type SectionName = "file" | "cut" | "bit" | "material" | "settings";

const toolButtons = [
  { id: "file" as const, label: "DXFファイル", icon: FolderOpen },
  { id: "cut" as const, label: "彫り込み", icon: Scissors },
  { id: "bit" as const, label: "ビット", icon: Drill },
  { id: "material" as const, label: "材料", icon: Box },
  { id: "settings" as const, label: "出力設定", icon: Settings2 },
];

function IconButton({
  label,
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`icon-button${active ? " is-active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  unit,
  min = 0.01,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="input-with-unit">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          inputMode="decimal"
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <b>{unit}</b>
      </span>
    </label>
  );
}

function formatDuration(minutes: number) {
  if (!minutes || !Number.isFinite(minutes)) return "--:--";
  const totalSeconds = Math.max(1, Math.round(minutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${mins}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [activeSection, setActiveSection] = useState<SectionName>("file");
  const [drawing, setDrawing] = useState<ParsedDrawing | null>(null);
  const [fileName, setFileName] = useState("");
  const [origin, setOrigin] = useState<"lower-left" | "dxf">("lower-left");
  const [materialThickness, setMaterialThickness] = useState(18);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [gcode, setGcode] = useState<string | null>(null);
  const [settings, setSettings] = useState<CamSettings>({
    finalDepth: 3,
    stepDown: 1,
    bitDiameter: 3,
    feedRate: 1000,
    plungeRate: 300,
    retractHeight: 2,
    rapidFeed: 2000,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const sectionRefs = useRef<Record<SectionName, HTMLElement | null>>({
    file: null,
    cut: null,
    bit: null,
    material: null,
    settings: null,
  });

  const displayPaths = useMemo(
    () => pathsForOrigin(drawing?.paths ?? [], origin),
    [drawing, origin],
  );
  const displayBounds = useMemo(() => getBounds(displayPaths), [displayPaths]);
  const depths = useMemo(() => {
    try {
      return buildPassDepths(settings.finalDepth, settings.stepDown);
    } catch {
      return [];
    }
  }, [settings.finalDepth, settings.stepDown]);
  const estimatedMinutes = useMemo(() => {
    try {
      return estimateMinutes(displayPaths, settings);
    } catch {
      return 0;
    }
  }, [displayPaths, settings]);

  const updateSetting = (key: keyof CamSettings, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setGcode(null);
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setGcode(null);
    if (!file.name.toLowerCase().endsWith(".dxf")) {
      setError("DXFファイル（.dxf）を選択してください。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("ファイルが大きすぎます。25MB以下のDXFを試してください。");
      return;
    }
    try {
      const parsed = parseDxfText(await file.text());
      setDrawing(parsed);
      setFileName(file.name);
      setActiveSection("cut");
    } catch (caught) {
      setDrawing(null);
      setFileName("");
      setError(caught instanceof Error ? caught.message : "DXFの読み込みに失敗しました。");
    }
  };

  const clearFile = () => {
    setDrawing(null);
    setFileName("");
    setGcode(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const goToSection = (section: SectionName) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const calculate = () => {
    setError("");
    if (!drawing) {
      setError("先にDXFファイルを読み込んでください。");
      goToSection("file");
      return;
    }
    try {
      const output = generateGcode(displayPaths, settings, fileName);
      setGcode(output);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ツールパスを作成できませんでした。");
    }
  };

  const downloadGcode = () => {
    if (!gcode) return;
    const blob = new Blob([gcode], { type: "text/plain;charset=us-ascii" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.dxf$/i, "") || "gordix-toolpath"}.gcode`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="cam-shell">
      <header className="topbar">
        <div className="brand" aria-label="GORDIX CAM">
          <span className="brand-mark">G</span>
          <span>GORDIX CAM</span>
          <span className="version">BETA</span>
        </div>
        <div className="top-actions" aria-label="ファイル操作">
          <IconButton label="DXFを開く" onClick={() => inputRef.current?.click()}>
            <FolderOpen size={19} />
          </IconButton>
          {fileName && <span className="top-file-name">{fileName}</span>}
        </div>
        <button className="export-button" type="button" disabled={!gcode} onClick={downloadGcode}>
          <Download size={17} />
          <span>G-code</span>
        </button>
      </header>

      <aside className="tool-rail" aria-label="加工ツール">
        {toolButtons.map(({ id, label, icon: Icon }) => (
          <IconButton key={id} label={label} active={activeSection === id} onClick={() => goToSection(id)}>
            <Icon size={20} />
          </IconButton>
        ))}
      </aside>

      <aside className="settings-panel" ref={panelRef}>
        <input
          ref={inputRef}
          type="file"
          accept=".dxf,application/dxf"
          hidden
          onChange={(event) => loadFile(event.target.files?.[0])}
        />

        {error && (
          <div className="alert" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}

        <section className="panel-section file-section" ref={(node) => { sectionRefs.current.file = node; }}>
          <div className="section-heading">
            <span className="step-number">1</span>
            <div><h2>DXFファイル</h2><p>加工する図面を読み込む</p></div>
          </div>
          {drawing ? (
            <div className="file-card">
              <FileType2 size={22} />
              <div>
                <strong>{fileName}</strong>
                <span>{displayBounds.width.toFixed(1)} × {displayBounds.height.toFixed(1)} mm · {drawing.paths.length} パス</span>
              </div>
              <IconButton label="ファイルを外す" onClick={clearFile}><Trash2 size={17} /></IconButton>
            </div>
          ) : (
            <button
              className={`drop-zone${isDragging ? " is-dragging" : ""}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                loadFile(event.dataTransfer.files[0]);
              }}
            >
              <Upload size={22} />
              <span>ファイルを選択</span>
              <small>またはここにドロップ</small>
            </button>
          )}
          {drawing?.unitWarning && <p className="field-note"><Info size={13} /> {drawing.unitWarning}</p>}
          {!!drawing?.unsupportedTypes.length && <p className="field-note"><Info size={13} /> 対象外: {drawing.unsupportedTypes.join(", ")}</p>}
        </section>

        <section className="panel-section" ref={(node) => { sectionRefs.current.cut = node; }}>
          <div className="section-heading">
            <span className="step-number">2</span>
            <div><h2>彫り込み</h2><p>DXFの線の中心を加工</p></div>
          </div>
          <div className="field-grid">
            <NumberField label="最終深さ" value={settings.finalDepth} unit="mm" onChange={(value) => updateSetting("finalDepth", value)} />
            <NumberField label="1回の深さ" value={settings.stepDown} unit="mm" onChange={(value) => updateSetting("stepDown", value)} />
          </div>
          <div className="pass-summary">
            <Layers3 size={17} /><span>加工回数</span><strong>{depths.length || "-"} パス</strong>
          </div>
        </section>

        <section className="panel-section" ref={(node) => { sectionRefs.current.bit = node; }}>
          <div className="section-heading">
            <span className="step-number">3</span>
            <div><h2>ビット</h2><p>ストレートビット</p></div>
          </div>
          <div className="field-grid">
            <NumberField label="直径" value={settings.bitDiameter} unit="mm" onChange={(value) => updateSetting("bitDiameter", value)} />
            <NumberField label="送り速度" value={settings.feedRate} unit="mm/min" min={1} step={50} onChange={(value) => updateSetting("feedRate", value)} />
            <NumberField label="切り込み速度" value={settings.plungeRate} unit="mm/min" min={1} step={50} onChange={(value) => updateSetting("plungeRate", value)} />
          </div>
        </section>

        <section className="panel-section" ref={(node) => { sectionRefs.current.material = node; }}>
          <div className="section-heading">
            <span className="step-number">4</span>
            <div><h2>材料</h2><p>Z0は材料の上面</p></div>
          </div>
          <div className="field-grid">
            <NumberField label="材料厚" value={materialThickness} unit="mm" onChange={(value) => setMaterialThickness(value)} />
          </div>
        </section>

        <section className="panel-section" ref={(node) => { sectionRefs.current.settings = node; }}>
          <div className="section-heading">
            <span className="step-number">5</span>
            <div><h2>出力設定</h2><p>GORDIX6 ポスト</p></div>
          </div>
          <label className="select-field">
            <span>原点</span>
            <select value={origin} onChange={(event) => { setOrigin(event.target.value as "lower-left" | "dxf"); setGcode(null); }}>
              <option value="lower-left">図形の左下</option>
              <option value="dxf">DXFの原点</option>
            </select>
          </label>
          <p className="field-note"><Ruler size={13} /> mm・絶対座標・退避高さ2mm・主軸は手動</p>
        </section>

        <button className={`calculate-button${gcode ? " is-ready" : ""}`} type="button" onClick={calculate}>
          {gcode ? <Check size={18} /> : <Play size={18} fill="currentColor" />}
          <span>{gcode ? "G-code作成済み" : "ツールパスを計算"}</span>
        </button>
      </aside>

      <section className="workspace" aria-label="プレビュー">
        <div className="view-switch" aria-label="表示切り替え">
          <button type="button" className={view === "2d" ? "is-active" : ""} onClick={() => setView("2d")}><Grid3X3 size={16} /> 2D</button>
          <button type="button" className={view === "3d" ? "is-active" : ""} onClick={() => setView("3d")}><Rotate3d size={17} /> 3D</button>
        </div>

        <ToolpathPreview
          ref={previewRef}
          paths={displayPaths}
          depths={depths}
          bitDiameter={settings.bitDiameter}
          materialThickness={materialThickness}
          mode={view}
        />
        {!drawing && <div className="empty-hint"><FolderOpen size={25} /><span>DXFを読み込んでください</span></div>}

        <div className="zoom-tools" aria-label="プレビュー操作">
          <IconButton label="拡大" onClick={() => previewRef.current?.zoomIn()}><ZoomIn size={18} /></IconButton>
          <IconButton label="縮小" onClick={() => previewRef.current?.zoomOut()}><ZoomOut size={18} /></IconButton>
          <IconButton label="全体表示" onClick={() => previewRef.current?.fit()}><Maximize2 size={18} /></IconButton>
        </div>

        <footer className="statusbar">
          <span><i className="status-dot" /> GORDIX6</span>
          <span>原点: {origin === "lower-left" ? "左下" : "DXF"}</span>
          <span>単位: mm</span>
          <span className="status-spacer" />
          <span>パス {displayPaths.length} × {depths.length}</span>
          <span>加工時間 {formatDuration(estimatedMinutes)}</span>
        </footer>
      </section>
    </main>
  );
}
