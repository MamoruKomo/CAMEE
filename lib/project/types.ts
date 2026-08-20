import type { CamSettings, MaterialOrigin } from "@/lib/cam";
import type { CamOperation } from "@/lib/cam/operations";
import type { VectorDocument } from "@/lib/vector/types";

export type BitType = "straight" | "v" | "ball-nose" | "crown" | "drill" | "custom";

export type BitDefinition = {
  id: string;
  name: string;
  type: BitType;
  cuttingDiameter: number;
  shankDiameter: number;
  fluteLength: number;
  overallLength: number;
  fluteCount: number;
  spindleRpm: number;
  feedRate: number;
  plungeRate: number;
  vAngle: number;
  tipDiameter: number;
  notes: string;
};

export type ProjectMaterial = {
  width: number;
  height: number;
  thickness: number;
  origin: MaterialOrigin;
  allowThroughCut: boolean;
};

export type ProjectV2 = {
  version: 2;
  savedAt: number;
  name: string;
  document: VectorDocument;
  camOperations: CamOperation[];
  material: ProjectMaterial;
  tools: {
    library: BitDefinition[];
    activeToolId: string;
  };
  camDraft: CamSettings;
  ui?: {
    view: "2d" | "3d";
    selectedPathIds?: string[];
    activeOperationId?: string | null;
  };
};
