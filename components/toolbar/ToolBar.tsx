import { Circle, Hand, Minus, MousePointer2, PenTool, Search, Square, Type, Waypoints } from "lucide-react";
import type { EditorTool } from "@/lib/editor/tool-context";

const tools: Array<{ id: EditorTool; label: string; shortcut: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "選択", shortcut: "V", icon: MousePointer2 },
  { id: "direct", label: "ダイレクト選択", shortcut: "A", icon: Waypoints },
  { id: "pen", label: "ペン", shortcut: "P", icon: PenTool },
  { id: "line", label: "線", shortcut: "L", icon: Minus },
  { id: "rectangle", label: "長方形", shortcut: "R", icon: Square },
  { id: "ellipse", label: "楕円", shortcut: "E", icon: Circle },
  { id: "text", label: "文字", shortcut: "T", icon: Type },
  { id: "hand", label: "手のひら", shortcut: "H", icon: Hand },
  { id: "zoom", label: "ズーム", shortcut: "Z", icon: Search },
];

export function ToolBar({ activeTool, onChange }: { activeTool: EditorTool; onChange: (tool: EditorTool) => void }) {
  return (
    <nav className="tool-bar" aria-label="作図ツール">
      {tools.map((tool, index) => {
        const Icon = tool.icon;
        return (
          <button key={tool.id} type="button" className={[activeTool === tool.id ? "is-active" : "", index === 7 ? "tool-navigation-start" : ""].filter(Boolean).join(" ")} onClick={() => onChange(tool.id)} title={`${tool.label} (${tool.shortcut})`} aria-label={`${tool.label} (${tool.shortcut})`}>
            <Icon size={20} />
            <kbd>{tool.shortcut}</kbd>
          </button>
        );
      })}
    </nav>
  );
}
