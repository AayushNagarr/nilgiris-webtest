// Core data model for the Nilgiris playtest engine. Kept as plain data +
// pure functions (see engine.ts) so the same logic can run in the browser
// now and be ported/reused without dragging React or Canvas along.

export type TerrainType = "ground" | "chasm" | "forestEdge" | "start" | "end";

export type CardId = "wooden-plank" | "stone-slab" | "reinforced-beam" | "watchtower" | "rope-bridge";

export type Card = {
  id: CardId;
  name: string;
  description: string;
  cost: number; // spent from the player's per-turn Focus pool
  health: number; // structure HP when placed
  validTerrain: TerrainType[]; // where this card may be played
  /** Flat damage reduction this structure grants to itself (and, for watchtower, neighbors) against disasters. */
  armor?: number;
  aura?: { radius: number; armor: number };
};

export type PlacedStructure = {
  cardId: CardId;
  health: number;
  maxHealth: number;
};

export type Tile = {
  terrain: TerrainType;
  structure: PlacedStructure | null;
};

export type Grid = Tile[][]; // grid[y][x]

export type LevelDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  terrain: TerrainType[][]; // authored in the Level Editor; terrain[y][x]
};

export type DisasterId = "flash-flood" | "windstorm" | "rockslide";

export type DisasterEvent = {
  disasterId: DisasterId;
  name: string;
  hitCells: { x: number; y: number }[];
  destroyedCells: { x: number; y: number }[];
};

export type GameOutcome = "playing" | "won" | "lost";

export type GameState = {
  level: LevelDefinition;
  grid: Grid;
  deck: CardId[];
  hand: CardId[];
  discard: CardId[];
  focus: number;
  maxFocus: number;
  turn: number;
  outcome: GameOutcome;
  log: string[];
  lastDisaster: DisasterEvent | null;
};
