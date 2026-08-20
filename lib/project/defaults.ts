import type { CamSettings } from "@/lib/cam";
import { createEmptyDocument } from "@/lib/vector/types";
import type { BitDefinition, ProjectV2 } from "./types";

export const defaultCamSettings: CamSettings = {
  finalDepth: 3,
  stepDown: 1,
  bitDiameter: 3,
  toolName: "ストレート 3mm",
  toolType: "straight",
  spindleRpm: 18000,
  fluteCount: 2,
  feedRate: 1000,
  plungeRate: 300,
  retractHeight: 2,
  rapidFeed: 2000,
  rampEnabled: false,
  rampLength: 12,
};

export const defaultBitLibrary: BitDefinition[] = [
  { id: "straight-3", name: "ストレート 3mm", type: "straight", cuttingDiameter: 3, shankDiameter: 3.175, fluteLength: 12, overallLength: 38, fluteCount: 2, spindleRpm: 18000, feedRate: 1000, plungeRate: 300, vAngle: 0, tipDiameter: 0, notes: "" },
  { id: "v-60", name: "Vビット 60°", type: "v", cuttingDiameter: 12, shankDiameter: 3.175, fluteLength: 12, overallLength: 38, fluteCount: 2, spindleRpm: 18000, feedRate: 800, plungeRate: 250, vAngle: 60, tipDiameter: 0.2, notes: "" },
  { id: "ball-3", name: "ボールノーズ 3mm", type: "ball-nose", cuttingDiameter: 3, shankDiameter: 3.175, fluteLength: 12, overallLength: 38, fluteCount: 2, spindleRpm: 18000, feedRate: 900, plungeRate: 250, vAngle: 0, tipDiameter: 0, notes: "" },
];

export function settingsForBit(bit: BitDefinition): CamSettings {
  return {
    ...defaultCamSettings,
    bitDiameter: bit.cuttingDiameter,
    toolName: bit.name,
    toolType: bit.type,
    spindleRpm: bit.spindleRpm,
    fluteCount: bit.fluteCount,
    feedRate: bit.feedRate,
    plungeRate: bit.plungeRate,
  };
}

export function createNewProject(): ProjectV2 {
  return {
    version: 2,
    savedAt: 0,
    name: "新規プロジェクト",
    document: createEmptyDocument(),
    camOperations: [],
    material: { width: 300, height: 200, thickness: 18, origin: "lower-left", allowThroughCut: false },
    tools: { library: defaultBitLibrary.map((bit) => ({ ...bit })), activeToolId: defaultBitLibrary[0].id },
    camDraft: { ...defaultCamSettings },
    ui: { view: "2d", selectedPathIds: [], activeOperationId: null },
  };
}
