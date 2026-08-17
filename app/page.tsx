"use client";

import {
  Box,
  Check,
  CircleDot,
  CircleAlert,
  Crosshair,
  Download,
  Drill,
  Expand,
  FileType2,
  FolderOpen,
  Grid3X3,
  Info,
  Layers3,
  Link2,
  Maximize2,
  MousePointer2,
  Play,
  RotateCcw,
  RotateCw,
  Rotate3d,
  Ruler,
  Scissors,
  Settings2,
  Shrink,
  Trash2,
  TrendingDown,
  UnfoldHorizontal,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolpathEditor2D } from "./ToolpathEditor2D";
import { ToolpathPreview, type PreviewHandle } from "./ToolpathPreview";
import {
  buildPassDepths,
  closeOpenPaths,
  estimateMinutes,
  generateGcode,
  getBounds,
  getMaterialBounds,
  parseDxfText,
  pathsForMaterial,
  type CamSettings,
  type CornerReliefType,
  type MaterialOrigin,
  type ParsedDrawing,
  type ToolPath,
} from "@/lib/cam";

type SectionName = "file" | "cut" | "bit" | "material" | "settings";
type CornerEditMode = "select" | CornerReliefType;
type NumericCamSetting = Exclude<keyof CamSettings, "rampEnabled">;

const materialOrigins: Array<{ id: Exclude<MaterialOrigin, "dxf">; label: string }> = [
  { id: "upper-left", label: "左上" },
  { id: "upper-center", label: "上中央" },
  { id: "upper-right", label: "右上" },
  { id: "center-left", label: "左中央" },
  { id: "center", label: "中央" },
  { id: "center-right", label: "右中央" },
  { id: "lower-left", label: "左下" },
  { id: "lower-center", label: "下中央" },
  { id: "lower-right", label: "右下" },
];

const originLabels: Record<MaterialOrigin, string> = {
  "upper-left": "材料の左上",
  "upper-center": "材料の上中央",
  "upper-right": "材料の右上",
  "center-left": "材料の左中央",
  center: "材料の中央",
  "center-right": "材料の右中央",
  "lower-left": "材料の左下",
  "lower-center": "材料の下中央",
  "lower-right": "材料の右下",
  dxf: "DXF原点",
};

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
  const [origin, setOrigin] = useState<MaterialOrigin>("lower-left");
  const [materialWidth, setMaterialWidth] = useState(300);
  const [materialHeight, setMaterialHeight] = useState(200);
  const [materialThickness, setMaterialThickness] = useState(18);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [gcode, setGcode] = useState<string | null>(null);
  const [displayPaths, setDisplayPaths] = useState<ToolPath[]>([]);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const [cornerMode, setCornerMode] = useState<CornerEditMode>("select");
  const [closeTolerance, setCloseTolerance] = useState(0.1);
  const [pathNotice, setPathNotice] = useState("");
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [settings, setSettings] = useState<CamSettings>({
    finalDepth: 3,
    stepDown: 1,
    bitDiameter: 3,
    feedRate: 1000,
    plungeRate: 300,
    retractHeight: 2,
    rapidFeed: 2000,
    rampEnabled: false,
    rampLength: 12,
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

  const baseDisplayPaths = useMemo(
    () => pathsForMaterial(drawing?.paths ?? [], origin, materialWidth, materialHeight),
    [drawing, origin, materialWidth, materialHeight],
  );
  const boardBounds = useMemo(
    () => getMaterialBounds(materialWidth, materialHeight, origin),
    [materialWidth, materialHeight, origin],
  );
  const displayBounds = useMemo(() => getBounds(displayPaths), [displayPaths]);
  const pathsOutsideMaterial = displayPaths.length > 0 && (
    displayBounds.minX < boardBounds.minX - 0.001
    || displayBounds.minY < boardBounds.minY - 0.001
    || displayBounds.maxX > boardBounds.maxX + 0.001
    || displayBounds.maxY > boardBounds.maxY + 0.001
  );

  useEffect(() => {
    // A file or origin change starts a fresh editing document.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayPaths(baseDisplayPaths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({ ...point })),
    })));
    setSelectedPathIds([]);
    setCornerMode("select");
    setPathNotice("");
    setShowClosePanel(false);
    setEditorRevision((current) => current + 1);
  }, [baseDisplayPaths]);
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

  const updateSetting = (key: NumericCamSetting, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setGcode(null);
  };

  const changeOrigin = (value: MaterialOrigin) => {
    setOrigin(value);
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
      setMaterialWidth((current) => Math.max(current, Math.ceil(parsed.bounds.width)));
      setMaterialHeight((current) => Math.max(current, Math.ceil(parsed.bounds.height)));
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

  const resetPathEdits = () => {
    setDisplayPaths(baseDisplayPaths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({ ...point })),
    })));
    setSelectedPathIds([]);
    setCornerMode("select");
    setPathNotice("");
    setShowClosePanel(false);
    setEditorRevision((current) => current + 1);
    setGcode(null);
  };

  const connectAndClosePaths = () => {
    setError("");
    try {
      const result = closeOpenPaths(displayPaths, closeTolerance);
      if (!result.joinedCount && !result.closedCount) {
        setPathNotice("許容値内に接続できる端点はありません");
        return;
      }
      setDisplayPaths(result.paths);
      setSelectedPathIds([]);
      setCornerMode("select");
      setEditorRevision((current) => current + 1);
      setGcode(null);
      setPathNotice(`接続 ${result.joinedCount}・閉合 ${result.closedCount}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "パスを閉じられませんでした。");
    }
  };

  const handleSelectionChange = useCallback((pathIds: string[]) => {
    setSelectedPathIds(pathIds);
    if (pathIds.length !== 1) setCornerMode("select");
  }, []);

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
    if (materialWidth <= 0 || materialHeight <= 0 || materialThickness <= 0) {
      setError("材料のW・H・Dは0より大きい値にしてください。");
      goToSection("material");
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
        <div className="brand" aria-label="CAMEE">
          <span className="brand-mark">C</span>
          <span>CAMEE</span>
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
          <label className="toggle-row">
            <span className="toggle-label"><TrendingDown size={16} />ランプ進入</span>
            <input
              type="checkbox"
              checked={settings.rampEnabled}
              onChange={(event) => {
                setSettings((current) => ({ ...current, rampEnabled: event.target.checked }));
                setGcode(null);
              }}
            />
            <span className="toggle-control" aria-hidden="true" />
          </label>
          {settings.rampEnabled && (
            <div className="single-field">
              <NumberField label="ランプ長さ" value={settings.rampLength} unit="mm" onChange={(value) => updateSetting("rampLength", value)} />
            </div>
          )}
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
            <div><h2>材料</h2><p>サイズとXY原点</p></div>
          </div>
          <div className="field-grid is-three">
            <NumberField label="W 幅" value={materialWidth} unit="mm" onChange={(value) => { setMaterialWidth(value); setGcode(null); }} />
            <NumberField label="H 高さ" value={materialHeight} unit="mm" onChange={(value) => { setMaterialHeight(value); setGcode(null); }} />
            <NumberField label="D 厚さ" value={materialThickness} unit="mm" onChange={(value) => { setMaterialThickness(value); setGcode(null); }} />
          </div>
          <div className="origin-setting">
            <span className="origin-label"><Crosshair size={14} />XY原点</span>
            <div className="origin-grid" role="group" aria-label="材料上のXY原点">
              {materialOrigins.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={origin === option.id ? "is-active" : ""}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => changeOrigin(option.id)}
                >
                  <span />
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`dxf-origin-button${origin === "dxf" ? " is-active" : ""}`}
              onClick={() => changeOrigin("dxf")}
            >
              <Crosshair size={14} />
              <span>DXF原点</span>
            </button>
          </div>
          {pathsOutsideMaterial && <p className="field-note material-warning"><CircleAlert size={13} /> 材料の外側にパスがあります</p>}
          {settings.finalDepth > materialThickness && <p className="field-note material-warning"><CircleAlert size={13} /> 加工深さが材料Dを超えています</p>}
          <p className="field-note"><Info size={13} /> Z0は材料の上面</p>
        </section>

        <section className="panel-section" ref={(node) => { sectionRefs.current.settings = node; }}>
          <div className="section-heading">
            <span className="step-number">5</span>
            <div><h2>出力設定</h2><p>GORDIX6 ポスト</p></div>
          </div>
          <div className="origin-summary"><Crosshair size={15} /><span>XY原点</span><strong>{originLabels[origin]}</strong></div>
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
          <button type="button" className={view === "3d" ? "is-active" : ""} onClick={() => { setView("3d"); setShowClosePanel(false); }}><Rotate3d size={17} /> 3D</button>
        </div>

        {view === "2d" && drawing && (
          <div className="edit-tools" aria-label="2D編集ツール">
            <IconButton label="パス・ウィンドウ選択" active={cornerMode === "select"} onClick={() => setCornerMode("select")}><MousePointer2 size={18} /></IconButton>
            <IconButton label="ドッグボーンをコーナーへ追加" active={cornerMode === "dogbone"} disabled={selectedPathIds.length !== 1} onClick={() => setCornerMode("dogbone")}><CircleDot size={18} /></IconButton>
            <IconButton label="H型フィレットをコーナーへ追加" active={cornerMode === "tbone"} disabled={selectedPathIds.length !== 1} onClick={() => setCornerMode("tbone")}><UnfoldHorizontal size={18} /></IconButton>
            <IconButton label="選択パスを10%縮小" disabled={!selectedPathIds.length} onClick={() => previewRef.current?.scaleSelection?.(0.9)}><Shrink size={18} /></IconButton>
            <IconButton label="選択パスを10%拡大" disabled={!selectedPathIds.length} onClick={() => previewRef.current?.scaleSelection?.(1.1)}><Expand size={18} /></IconButton>
            <IconButton label="選択パスを左へ15度回転" disabled={!selectedPathIds.length} onClick={() => previewRef.current?.rotateSelection?.(-15)}><RotateCcw size={18} /></IconButton>
            <IconButton label="選択パスを右へ15度回転" disabled={!selectedPathIds.length} onClick={() => previewRef.current?.rotateSelection?.(15)}><RotateCw size={18} /></IconButton>
            <IconButton label="パスの接続・閉合設定" active={showClosePanel} onClick={() => setShowClosePanel((current) => !current)}><Link2 size={18} /></IconButton>
            <IconButton label="2D編集をリセット" onClick={resetPathEdits}><Undo2 size={18} /></IconButton>
          </div>
        )}

        {view === "2d" && drawing && showClosePanel && (
          <div className="close-path-popover" role="dialog" aria-label="パスの接続・閉合設定">
            <div className="close-panel-heading"><Link2 size={16} /><strong>パスの接続・閉合</strong></div>
            <NumberField label="接続許容値" value={closeTolerance} unit="mm" min={0} step={0.01} onChange={setCloseTolerance} />
            <button type="button" className="path-action-button" disabled={!displayPaths.length} onClick={connectAndClosePaths}>
              <Link2 size={17} />
              <span>接続・閉じる</span>
            </button>
            {pathNotice && <p className="field-note path-notice"><Check size={13} /> {pathNotice}</p>}
          </div>
        )}

        {view === "2d" ? (
          <ToolpathEditor2D
            key={`${fileName}-${origin}-${editorRevision}`}
            ref={previewRef}
            paths={displayPaths}
            boardBounds={boardBounds}
            bitDiameter={settings.bitDiameter}
            cornerMode={cornerMode}
            onSelectionChange={handleSelectionChange}
            onPathsChange={(paths) => {
              setDisplayPaths(paths);
              setPathNotice("");
              setGcode(null);
            }}
          />
        ) : (
          <ToolpathPreview
            ref={previewRef}
            paths={displayPaths}
            depths={depths}
            bitDiameter={settings.bitDiameter}
            materialBounds={boardBounds}
            materialThickness={materialThickness}
            mode="3d"
            rampEnabled={settings.rampEnabled}
            rampLength={settings.rampLength}
          />
        )}
        {!drawing && <div className="empty-hint"><FolderOpen size={25} /><span>DXFを読み込んでください</span></div>}

        <div className="zoom-tools" aria-label="プレビュー操作">
          <IconButton label="拡大" onClick={() => previewRef.current?.zoomIn()}><ZoomIn size={18} /></IconButton>
          <IconButton label="縮小" onClick={() => previewRef.current?.zoomOut()}><ZoomOut size={18} /></IconButton>
          <IconButton label="全体表示" onClick={() => previewRef.current?.fit()}><Maximize2 size={18} /></IconButton>
        </div>

        <footer className="statusbar">
          <span><i className="status-dot" /> GORDIX6</span>
          <span>原点: {originLabels[origin]}</span>
          <span>単位: mm</span>
          {!!selectedPathIds.length && <span>{cornerMode === "select" ? `${selectedPathIds.length} パス選択` : cornerMode === "dogbone" ? "ドッグボーン" : "H型フィレット"}</span>}
          <span className="status-spacer" />
          <span>パス {displayPaths.length} × {depths.length}</span>
          <span>加工時間 {formatDuration(estimatedMinutes)}</span>
        </footer>
      </section>
    </main>
  );
}
