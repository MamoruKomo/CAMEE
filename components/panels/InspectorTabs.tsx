import { DraftingCompass, Route } from "lucide-react";

export type InspectorMode = "design" | "cam";

export function InspectorTabs({ mode, operationCount, stale, onChange }: { mode: InspectorMode; operationCount: number; stale: boolean; onChange: (mode: InspectorMode) => void }) {
  return <div className="inspector-tabs" role="tablist" aria-label="右パネル切替">
    <button type="button" role="tab" aria-selected={mode === "design"} className={mode === "design" ? "is-active" : ""} onClick={() => onChange("design")}><DraftingCompass size={15} />デザイン</button>
    <button type="button" role="tab" aria-selected={mode === "cam"} className={`${mode === "cam" ? "is-active" : ""}${stale ? " has-warning" : ""}`} onClick={() => onChange("cam")}><Route size={15} />加工<span>{operationCount}</span></button>
  </div>;
}
