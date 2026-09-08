import { SlotViewState, TerrainAngle, TerrainType } from "./types";

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  overgrown: "Overgrown",
  waterlogged: "Waterlogged",
  rocky: "Rocky",
};

export const TERRAIN_ANGLE_LABELS: Record<TerrainAngle, string> = {
  flat: "Flat",
  steep: "Steep",
  uneven: "Uneven",
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  overgrown: "#304936",
  waterlogged: "#233F47",
  rocky: "#4A433A",
};

export const SLOT_STATE_COLORS: Record<SlotViewState, string> = {
  Safe: "#52635C",
  Frontier: "#C08552",
  Active: "#7A9B76",
  Future: "#2B3A36",
  Destroyed: "#C0654F",
};
