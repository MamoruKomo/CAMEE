"use client";

import { Focus, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolpathPreview, type PreviewHandle } from "./ToolpathPreview";
import { VectorEditor2D } from "@/components/editor/VectorEditor2D";
import { CanvasStartGuide } from "@/components/editor/CanvasStartGuide";
import { ContextBar } from "@/components/editor/ContextBar";
import type { SelectedNodeRef } from "@/components/editor/NodeOverlay";
import { CamPanel } from "@/components/panels/CamPanel";
import { PathListPanel } from "@/components/panels/PathListPanel";
import { PropertiesPanel } from "@/components/panels/PropertiesPanel";
import { TextPanel } from "@/components/panels/TextPanel";
import { InspectorTabs, type InspectorMode } from "@/components/panels/InspectorTabs";
import { ToolBar } from "@/components/toolbar/ToolBar";
import { TopBar } from "@/components/toolbar/TopBar";
import { useEditorHistory } from "@/hooks/useEditorHistory";
import { buildPassDepths, generateGcode, getMaterialBounds } from "@/lib/cam";
import {
  assertCamOperationExportable,
  buildCenterlineOperation,
  isCamOperationStale,
  validateCamOperation,
} from "@/lib/cam/operations";
import { createNewProject, settingsForBit } from "@/lib/project/defaults";
import { deserializeProject, serializeProject } from "@/lib/project/migration";
import { readCurrentProject, writeCurrentProject } from "@/lib/project/persistence";
import type { ProjectMaterial, ProjectV2 } from "@/lib/project/types";
import { importDxfToVectorDocument } from "@/lib/vector/dxf";
import { exportVectorDocumentToSvg, importSvgToVectorDocument } from "@/lib/vector/svg";
import { commitDocument, createId, type Vec2, type VectorDocument } from "@/lib/vector/types";
import { createVectorText, insertVectorText, textForSelectedPaths } from "@/lib/vector/text";
import { TOOL_CONTEXT, type EditorTool } from "@/lib/editor/tool-context";

type SaveStatus = "loading" | "saving" | "saved" | "error";

function safeFileName(value: string) {
  const printable = Array.from(value.trim(), (character) => character.charCodeAt(0) < 32 ? "_" : character).join("");
  const clean = printable.replace(/[<>:"/\\|?*]/g, "_");
  return clean || "cutpath-project";
}

function downloadText(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Home() {
  const [initialProject] = useState<ProjectV2>(createNewProject);
  const history = useEditorHistory(initialProject.document);
  const [project, setProject] = useState<ProjectV2>(initialProject);
  const [tool, setTool] = useState<EditorTool>("select");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("design");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<SelectedNodeRef[]>([]);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [operationName, setOperationName] = useState("センターライン 1");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [gridSizeMm, setGridSizeMm] = useState<1 | 5 | 10>(5);
  const [cursor, setCursor] = useState<Vec2>({ x: 0, y: 0 });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef<PreviewHandle>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);

  const replaceDocument = history.replace;
  const loadProject = useCallback((loaded: ProjectV2) => {
    setProject(loaded);
    replaceDocument(loaded.document);
    setSelectedPathIds(loaded.ui?.selectedPathIds ?? []);
    setSelectedNodes([]);
    setActiveOperationId(loaded.ui?.activeOperationId ?? null);
    setView(loaded.ui?.view ?? "2d");
    setError("");
  }, [replaceDocument]);

  useEffect(() => {
    let active = true;
    readCurrentProject()
      .then((saved) => { if (active && saved) loadProject(saved); })
      .catch((reason: unknown) => { if (active) { setError(reason instanceof Error ? reason.message : "保存データを読み込めませんでした。"); setSaveStatus("error"); } })
      .finally(() => { if (active) { setStorageReady(true); setSaveStatus((status) => status === "error" ? status : "saved"); } });
    return () => { active = false; };
  }, [loadProject]);

  const snapshot = useMemo<ProjectV2>(() => ({
    ...project,
    document: history.document,
    ui: { view, selectedPathIds, activeOperationId },
  }), [activeOperationId, history.document, project, selectedPathIds, view]);

  const save = useCallback(async () => {
    if (!storageReady) return;
    setSaveStatus("saving");
    try {
      const savedAt = Date.now();
      await writeCurrentProject({ ...snapshot, savedAt });
      setSaveStatus("saved");
    } catch (reason) {
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    }
  }, [snapshot, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => { void save(); }, 400);
    return () => window.clearTimeout(timer);
  }, [save, storageReady]);

  const materialBounds = useMemo(() => getMaterialBounds(project.material.width, project.material.height, project.material.origin), [project.material]);
  const activeOperation = project.camOperations.find((operation) => operation.id === activeOperationId) ?? null;
  const operationIssues = useMemo(() => activeOperation ? validateCamOperation(activeOperation, history.document, project.material) : [], [activeOperation, history.document, project.material]);
  const previewPaths = activeOperation && !isCamOperationStale(activeOperation, history.document) ? activeOperation.generatedToolPaths : [];
  const previewDepths = activeOperation ? buildPassDepths(activeOperation.settings.finalDepth, activeOperation.settings.stepDown) : [];
  const { selectedText, selectedObjectCount } = useMemo(() => {
    const selectedIdSet = new Set(selectedPathIds);
    const selectedTextObjects = (history.document.texts ?? []).filter((text) => text.pathIds.some((id) => selectedIdSet.has(id)));
    return {
      selectedText: textForSelectedPaths(history.document, selectedPathIds),
      selectedObjectCount: selectedTextObjects.length + history.document.paths.filter((path) => selectedIdSet.has(path.id) && !path.sourceTextId).length,
    };
  }, [history.document, selectedPathIds]);
  const hasStaleOperation = useMemo(() => project.camOperations.some((operation) => isCamOperationStale(operation, history.document)), [history.document, project.camOperations]);

  const selectEditorTool = useCallback((nextTool: EditorTool) => {
    setTool(nextTool);
    if (nextTool !== "direct") setSelectedNodes([]);
    if (nextTool !== "hand" && nextTool !== "zoom") setInspectorMode("design");
    setView("2d");
  }, []);

  const selectBit = (id: string) => {
    const bit = project.tools.library.find((item) => item.id === id);
    if (!bit) return;
    setProject((current) => ({
      ...current,
      tools: { ...current.tools, activeToolId: id },
      camDraft: {
        ...current.camDraft,
        ...settingsForBit(bit),
        finalDepth: current.camDraft.finalDepth,
        stepDown: current.camDraft.stepDown,
        retractHeight: current.camDraft.retractHeight,
        rapidFeed: current.camDraft.rapidFeed,
        rampEnabled: current.camDraft.rampEnabled,
        rampLength: current.camDraft.rampLength,
      },
    }));
  };

  const calculate = () => {
    setError("");
    try {
      const operation = buildCenterlineOperation(history.document, selectedPathIds, project.camDraft, { id: createId("cam"), name: operationName });
      setProject((current) => ({ ...current, camOperations: [...current.camOperations, operation] }));
      setActiveOperationId(operation.id);
      setView("3d");
      setInspectorMode("cam");
      setOperationName(`センターライン ${project.camOperations.length + 2}`);
      setNotice("ツールパスを計算しました。3Dで深さと進入を確認してください。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ツールパスを計算できませんでした。");
    }
  };

  const exportGcode = () => {
    if (!activeOperation) return;
    setError("");
    try {
      assertCamOperationExportable(activeOperation, history.document, project.material);
      const gcode = generateGcode(activeOperation.generatedToolPaths, activeOperation.settings, `${project.name} / ${activeOperation.name}`);
      downloadText(gcode, `${safeFileName(project.name)}-${safeFileName(activeOperation.name)}.gcode`, "text/plain;charset=us-ascii");
      setNotice("G-codeを書き出しました。実機の前にDry Runしてください。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "G-codeを書き出せませんでした。");
    }
  };

  const handleFile = async (file: File | undefined, type: "json" | "dxf" | "svg") => {
    if (!file) return;
    setError("");
    try {
      const source = await file.text();
      if (type === "json") {
        loadProject(deserializeProject(source));
        setNotice("CutPath Projectを読み込みました。");
      } else if (type === "dxf") {
        const imported = importDxfToVectorDocument(source);
        history.commit(commitDocument(history.document, imported.document.paths, imported.document.pathOrder));
        setProject((current) => ({ ...current, name: file.name.replace(/\.dxf$/i, "") }));
        setSelectedPathIds(imported.document.pathOrder);
        setInspectorMode("design");
        setNotice(`${imported.entityCount} DXF entityをVectorDocumentへ読み込みました。${imported.unitWarning ?? ""}`);
        setView("2d");
      } else {
        const imported = importSvgToVectorDocument(source);
        history.commit(commitDocument(history.document, imported.paths, imported.pathOrder));
        setProject((current) => ({ ...current, name: file.name.replace(/\.svg$/i, "") }));
        setSelectedPathIds(imported.pathOrder);
        setInspectorMode("design");
        setNotice("SVGを編集可能なLine/Cubic pathへ読み込みました。");
        setView("2d");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ファイルを読み込めませんでした。");
    }
  };

  const newProject = () => {
    const next = createNewProject();
    loadProject(next);
    setTool("select");
    setInspectorMode("design");
    setOperationName("センターライン 1");
    setNotice("新規Projectを作成しました。");
  };

  const commitEditorDocument = (document: VectorDocument) => {
    history.commit(document);
    setNotice("");
    setError("");
  };

  return (
    <main className="cutpath-shell">
      <TopBar
        projectName={project.name}
        saveStatus={saveStatus}
        view={view}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onNameChange={(name) => setProject((current) => ({ ...current, name }))}
        onNew={newProject}
        onImport={() => jsonInputRef.current?.click()}
        onExport={() => downloadText(serializeProject(snapshot), `${safeFileName(project.name)}.cutpath.json`, "application/json;charset=utf-8")}
        onDxfImport={() => dxfInputRef.current?.click()}
        onSvgImport={() => svgInputRef.current?.click()}
        onSvgExport={() => {
          try { downloadText(exportVectorDocumentToSvg(history.document), `${safeFileName(project.name)}.svg`, "image/svg+xml;charset=utf-8"); }
          catch (reason) { setError(reason instanceof Error ? reason.message : "SVGを書き出せませんでした。"); }
        }}
        onSave={() => { void save(); }}
        onUndo={history.undo}
        onRedo={history.redo}
        onViewChange={(nextView) => { setView(nextView); if (nextView === "3d") setInspectorMode("cam"); }}
      />
      <input ref={jsonInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => { void handleFile(event.target.files?.[0], "json"); event.target.value = ""; }} />
      <input ref={dxfInputRef} type="file" accept=".dxf,application/dxf" hidden onChange={(event) => { void handleFile(event.target.files?.[0], "dxf"); event.target.value = ""; }} />
      <input ref={svgInputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(event) => { void handleFile(event.target.files?.[0], "svg"); event.target.value = ""; }} />

      <ToolBar activeTool={tool} onChange={selectEditorTool} />

      <section className="editor-workspace" aria-label={view === "2d" ? "ベクター編集Canvas" : "3DツールパスPreview"}>
        {view === "2d" ? (
          <VectorEditor2D
            ref={previewRef}
            document={history.document}
            materialBounds={materialBounds}
            tool={tool}
            selectedPathIds={selectedPathIds}
            selectedNodes={selectedNodes}
            snapEnabled={snapEnabled}
            gridVisible={gridVisible}
            gridSizeMm={gridSizeMm}
            onToolChange={selectEditorTool}
            onDocumentCommit={commitEditorDocument}
            onSelectionChange={setSelectedPathIds}
            onNodeSelectionChange={setSelectedNodes}
            onCursorPosition={setCursor}
            onTextCreate={(point) => {
              const text = createVectorText(point);
              const next = insertVectorText(history.document, text);
              commitEditorDocument(next);
              setSelectedPathIds(next.texts?.find((item) => item.id === text.id)?.pathIds ?? []);
              setSelectedNodes([]);
              setInspectorMode("design");
            }}
            onUndo={history.undo}
            onRedo={history.redo}
          />
        ) : (
          <ToolpathPreview
            ref={previewRef}
            paths={previewPaths}
            depths={previewDepths}
            bitDiameter={activeOperation?.settings.bitDiameter ?? project.camDraft.bitDiameter}
            materialBounds={materialBounds}
            materialThickness={project.material.thickness}
            mode="3d"
            rampEnabled={activeOperation?.settings.rampEnabled}
            rampLength={activeOperation?.settings.rampLength}
          />
        )}
        {view === "2d" && <ContextBar
          tool={tool}
          selectionCount={selectedObjectCount}
          selectedNodeCount={selectedNodes.length}
          textSelected={Boolean(selectedText)}
          onSelectTool={selectEditorTool}
          onFitSelection={() => previewRef.current?.fitSelection?.()}
          onOpenCam={() => setInspectorMode("cam")}
        />}
        {view === "2d" && storageReady && history.document.paths.length === 0 && (history.document.texts?.length ?? 0) === 0 && <CanvasStartGuide material={project.material} onToolChange={selectEditorTool} />}
        <div className="canvas-controls">
          <button type="button" onClick={() => previewRef.current?.zoomIn()} aria-label="拡大"><ZoomIn size={17} /></button>
          <button type="button" onClick={() => previewRef.current?.zoomOut()} aria-label="縮小"><ZoomOut size={17} /></button>
          <button type="button" onClick={() => previewRef.current?.fit()} aria-label="全体表示"><Maximize2 size={17} /></button>
          {view === "2d" && <button type="button" onClick={() => previewRef.current?.fitSelection?.()} disabled={!selectedPathIds.length} aria-label="選択範囲を表示"><Focus size={17} /></button>}
        </div>
        {view === "3d" && !previewPaths.length && <div className="preview-empty">{activeOperation && isCamOperationStale(activeOperation, history.document) ? "図形が変更されています。ツールパスを再計算してください。" : "センターラインCAMを計算すると3D Previewを表示します。"}</div>}
        {(error || notice) && <div className={`app-notice${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      </section>

      <aside className="right-panel">
        <InspectorTabs mode={inspectorMode} operationCount={project.camOperations.length} stale={hasStaleOperation} onChange={setInspectorMode} />
        <div className="inspector-content">
        {inspectorMode === "design" ? <>
          {(tool === "text" || (history.document.texts?.length ?? 0) > 0) && <TextPanel document={history.document} selectedPathIds={selectedPathIds} onSelectionChange={(ids) => { setSelectedPathIds(ids); setSelectedNodes([]); }} onCommit={commitEditorDocument} />}
          <PropertiesPanel document={history.document} selectedPathIds={selectedPathIds} selectedNodes={selectedNodes} onCommit={commitEditorDocument} />
          <PathListPanel document={history.document} selectedPathIds={selectedPathIds} onSelectionChange={(ids) => { setSelectedPathIds(ids); setSelectedNodes([]); }} onCommit={commitEditorDocument} />
        </> : <CamPanel
          document={history.document}
          material={project.material}
          settings={project.camDraft}
          bits={project.tools.library}
          activeBitId={project.tools.activeToolId}
          operationName={operationName}
          operations={project.camOperations}
          activeOperationId={activeOperationId}
          issues={operationIssues}
          selectionCount={selectedPathIds.length}
          onMaterialChange={(material: ProjectMaterial) => setProject((current) => ({ ...current, material }))}
          onSettingsChange={(camDraft) => setProject((current) => ({ ...current, camDraft }))}
          onBitChange={selectBit}
          onOperationNameChange={setOperationName}
          onCalculate={calculate}
          onSelectOperation={(id) => {
            setActiveOperationId(id);
            const operation = project.camOperations.find((item) => item.id === id);
            if (operation) setProject((current) => ({ ...current, camDraft: { ...operation.settings } }));
          }}
          onDeleteOperation={(id) => {
            setProject((current) => ({ ...current, camOperations: current.camOperations.filter((operation) => operation.id !== id) }));
            if (activeOperationId === id) setActiveOperationId(null);
          }}
          onExport={exportGcode}
        />}
        </div>
      </aside>

      <footer className="status-bar">
        <span>X {cursor.x.toFixed(2)} mm</span><span>Y {cursor.y.toFixed(2)} mm</span>
        <span>Snap <button type="button" className={snapEnabled ? "is-active" : ""} onClick={() => setSnapEnabled((current) => !current)}>{snapEnabled ? "ON" : "OFF"}</button></span>
        <span>Grid <button type="button" className={gridVisible ? "is-active" : ""} onClick={() => setGridVisible((current) => !current)}>{gridVisible ? "ON" : "OFF"}</button>
          <select value={gridSizeMm} onChange={(event) => setGridSizeMm(Number(event.target.value) as 1 | 5 | 10)}><option value={1}>1mm</option><option value={5}>5mm</option><option value={10}>10mm</option></select></span>
        <span className="status-tool"><strong>{TOOL_CONTEXT[tool].label}</strong><kbd>{TOOL_CONTEXT[tool].shortcut}</kbd></span>
        <span className="status-spacer" /><span>単位 mm / Y-up</span><span>Revision {history.document.revision}</span><span>{selectedText ? "文字を選択" : `${selectedPathIds.length} パス選択`}</span>
      </footer>
    </main>
  );
}
