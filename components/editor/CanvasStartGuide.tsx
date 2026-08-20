import { PenTool, Square, Type } from "lucide-react";
import type { EditorTool } from "@/lib/editor/tool-context";

export function CanvasStartGuide({ material, onToolChange }: { material: { width: number; height: number; thickness: number }; onToolChange: (tool: EditorTool) => void }) {
  return <div className="canvas-start-guide">
    <div className="start-guide-card">
      <span className="start-eyebrow">新規デザイン</span>
      <h1>最初の形を作りましょう</h1>
      <p>左のツール、または下のボタンから開始できます。寸法はすべてmmで保存されます。</p>
      <div className="start-actions">
        <button type="button" onClick={() => onToolChange("rectangle")}><Square size={19} /><strong>長方形</strong><span>材料・看板・部品形状</span><kbd>R</kbd></button>
        <button type="button" onClick={() => onToolChange("pen")}><PenTool size={19} /><strong>ペン</strong><span>直線とBezier曲線</span><kbd>P</kbd></button>
        <button type="button" onClick={() => onToolChange("text")}><Type size={19} /><strong>文字</strong><span>CNCストローク文字</span><kbd>T</kbd></button>
      </div>
      <div className="start-workflow" aria-label="基本の流れ"><span><b>1</b>描く</span><i>›</i><span><b>2</b>寸法調整</span><i>›</i><span><b>3</b>加工設定</span><i>›</i><span><b>4</b>3D確認</span></div>
      <small>材料 {material.width} × {material.height} × {material.thickness} mm</small>
    </div>
  </div>;
}
