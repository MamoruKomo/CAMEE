import type { Vec2 } from "@/lib/vector/types";

export type EditorTool = "select" | "direct" | "pen" | "line" | "rectangle" | "ellipse" | "text" | "hand" | "zoom";

export type ToolContext = {
  label: string;
  shortcut: string;
  hint: string;
};

export const TOOL_CONTEXT: Record<EditorTool, ToolContext> = {
  select: { label: "選択", shortcut: "V", hint: "クリックで選択。ドラッグで移動、枠のハンドルで拡大・回転できます。" },
  direct: { label: "アンカー編集", shortcut: "A", hint: "アンカーやハンドルを動かします。線上をダブルクリックすると点を追加できます。" },
  pen: { label: "ペン", shortcut: "P", hint: "クリックで角、ドラッグで曲線。始点をクリックして閉じ、Enterで開いたまま確定します。" },
  line: { label: "線", shortcut: "L", hint: "始点から終点へドラッグします。Shiftで0°・45°・90°に固定します。" },
  rectangle: { label: "長方形", shortcut: "R", hint: "対角方向へドラッグします。Shiftで正方形、Altで中心から作成します。" },
  ellipse: { label: "楕円", shortcut: "E", hint: "対角方向へドラッグします。Shiftで正円、Altで中心から作成します。" },
  text: { label: "文字", shortcut: "T", hint: "配置位置をクリックし、右の文字設定で内容・サイズ・字間を編集します。" },
  hand: { label: "手のひら", shortcut: "H", hint: "Canvasをドラッグして表示範囲を移動します。Spaceを押しながらでも移動できます。" },
  zoom: { label: "ズーム", shortcut: "Z", hint: "クリックで拡大、Altを押しながらクリックで縮小します。" },
};

export function selectionSummary(pathCount: number, nodeCount: number, isText: boolean) {
  if (nodeCount > 0) return `${nodeCount} アンカーを選択`;
  if (isText) return pathCount > 1 ? `文字を含む ${pathCount} オブジェクト` : "文字を選択";
  if (pathCount > 0) return `${pathCount} パスを選択`;
  return "選択なし";
}

export function shapeMeasurement(tool: "line" | "rectangle" | "ellipse", start: Vec2, current: Vec2) {
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  if (tool === "line") {
    const length = Math.hypot(current.x - start.x, current.y - start.y);
    const angle = Math.atan2(current.y - start.y, current.x - start.x) * 180 / Math.PI;
    return { width, height, length, angle, label: `長さ ${length.toFixed(2)} mm  ∠ ${angle.toFixed(1)}°` };
  }
  return { width, height, length: Math.hypot(width, height), angle: 0, label: `W ${width.toFixed(2)} × H ${height.toFixed(2)} mm` };
}
