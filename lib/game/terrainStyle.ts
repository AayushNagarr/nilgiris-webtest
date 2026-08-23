import { TerrainType } from "./types";

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  ground: "#2A3733",
  chasm: "#101816",
  forestEdge: "#3F5B44",
  start: "#C08552",
  end: "#8FA36B",
};

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  ground: "Ground",
  chasm: "Chasm (needs a bridge)",
  forestEdge: "Forest edge (disaster source)",
  start: "Start",
  end: "End",
};
