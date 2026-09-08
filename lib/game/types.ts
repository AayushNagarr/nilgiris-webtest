export type TerrainType = "overgrown" | "waterlogged" | "rocky";
export type TerrainAngle = "flat" | "steep" | "uneven";
export type Rarity = "Standard" | "Innovative" | "Inspired" | "Experimental";
export type PersonalityId = "patience" | "fervour" | "curiosity";

export type CardId = string;
export type ColumnId = string;
export type ForestEventId = string;

export type EffectTarget = "active" | "chosen" | "self" | "mostDamaged";

export type CardEffect =
  | {
      type: "prepare";
      amount: number;
      target?: EffectTarget;
      differentFromActive?: boolean;
      perHeldTurn?: number;
      perPreviousCardPlayed?: number;
      ifNoPrepareLastTurnAmount?: number;
      resetIfNotComplete?: boolean;
      reinforceChosenIfCompletesAmount?: number;
    }
  | { type: "reinforce"; amount: number; target?: EffectTarget; ifFirstCardAmount?: number }
  | { type: "repair"; amount: number; target?: EffectTarget }
  | { type: "draw"; amount: number }
  | { type: "gainMh"; amount: number; ifHeldAtLeastTurns?: number; heldAmount?: number }
  | { type: "endTurnRetainHandNextMh"; amount: number }
  | { type: "explore"; cost: number }
  | { type: "selfOverrun"; amount: number };

export type CardDefinition = {
  id: CardId;
  name: string;
  cost: number;
  rarity: Rarity;
  effectText: string;
  starterCopies?: number;
  personality?: "Patience" | "Fervour" | "Curiosity";
  retain?: boolean;
  unlockRoom?: number;
  costReductionPerHeldTurn?: number;
  reward?: boolean;
  craftingPool?: "inspired" | "experimental";
  effects: CardEffect[];
};

export type CardInstance = {
  instanceId: string;
  cardId: CardId;
  heldTurns: number;
};

export type ColumnDefinition = {
  id: ColumnId;
  name: string;
  allocation: number;
  effectText: string;
  unlockable?: boolean;
  onComplete: CardEffect[];
};

export type ForestTargetRule =
  | "active"
  | "newestFrontier"
  | "weakestFrontier"
  | "oneOpenWorksite"
  | "twoOpenWorksites"
  | "threeOpenWorksites"
  | "highestPrepWorksite"
  | "twoAdjacentWorksites"
  | "oneUnopenedLocation"
  | "twoLocations"
  | "oneExposed"
  | "upToTwoExposed"
  | "threeExposed"
  | "twoExposed"
  | "everyOpenWorksite"
  | "everyExposed";
export type ForestFSMState = "Telegraph" | "Player Turn" | "Resolve" | "Advance";

export type ForestWeatherKey = "wet" | "windy";

export type ForestWeatherState = Record<ForestWeatherKey, number>;

export type ForestRequirements = Partial<ForestWeatherState>;

export type ForestStatusGain = Partial<ForestWeatherState>;

export type ForestLowStatusBias = {
  status: ForestWeatherKey;
  below: number;
  bonus: number;
};

export type ForestCooldowns = Record<ForestEventId, number>;

export type ForestEffectTarget =
  | "oneOpenWorksite"
  | "twoOpenWorksites"
  | "threeOpenWorksites"
  | "allOpenWorksites"
  | "highestPrepWorksite"
  | "oneExposedStructure"
  | "twoExposedStructures"
  | "threeExposedStructures"
  | "allExposedStructures"
  | "twoAdjacentWorksites"
  | "oneWorksiteAndAdjacent"
  | "oneStructureAndAdjacent"
  | "oneUnopenedLocation"
  | "twoLocations";

export type ForestAttackEffect =
  | { type: "damage"; amount: number; target: ForestEffectTarget; adjacentAmount?: number }
  | { type: "prepLoss"; amount: number; target: ForestEffectTarget }
  | { type: "blockOpening"; amount: number; target: ForestEffectTarget }
  | { type: "blockPrep"; amount: number; target: ForestEffectTarget };

export type ForestEventDefinition = {
  id: ForestEventId;
  enemyId?: string;
  enemyName?: string;
  attackSetId?: string;
  attackSetName?: string;
  minPrimaryLevel: number;
  name: string;
  effectText: string;
  power: number;
  targetRule: ForestTargetRule;
  requirements: ForestRequirements;
  statusesAdded: ForestStatusGain;
  cooldown: number;
  weight: number;
  lowStatusBias?: ForestLowStatusBias;
  effects?: ForestAttackEffect[];
};

export type RoomSlotDefinition = {
  terrainType: TerrainType;
  terrainAngle: TerrainAngle;
  preparationRequired: number;
};

export type RoomDefinition = {
  id: string;
  name: string;
  mapNodeId?: string;
  biosphereId?: string;
  routeRoomCount?: number;
  difficultyMultiplier?: number;
  slots: RoomSlotDefinition[];
};

export type WeightedTerrain = {
  terrainType: TerrainType;
  weight: number;
};

export type WeightedAngle = {
  terrainAngle: TerrainAngle;
  weight: number;
};

export type WeightedWildlife = {
  animalId: string;
  weight: number;
};

export type BiosphereDefinition = {
  id: string;
  name: string;
  summary: string;
  difficultyBias: number;
  dominantTerrainType?: TerrainType;
  dominantTerrainShare?: number;
  terrainWeights: WeightedTerrain[];
  angleWeights: WeightedAngle[];
  wildlifeWeights: WeightedWildlife[];
  predictiveText: {
    likelyTerrain: string;
    commonAngles: string;
    possibleWildlife: string;
    routeRisk: string;
  };
};

export type AnimalDefinition = {
  id: string;
  name: string;
  pressure: number;
  biosphereNotes: string;
};

export type MapConfig = {
  defaultSeed: number;
  minNodes: number;
  maxOutgoing: number;
  maxRouteRooms: number;
  roomLayerCounts: number[];
  difficultyProgression: {
    base: number;
    perRoom: number;
    max: number;
  };
  roomGeneration: {
    minSlots: number;
    maxSlots: number;
    basePreparation: number;
    preparationPerRoom: number;
    randomPreparation: number;
    terrainPreparationMultiplier: Record<TerrainType, number>;
    anglePreparationMultiplier: Record<TerrainAngle, number>;
    weatherPreparationBonus: {
      wetWaterlogged: number;
      windySteep: number;
    };
  };
};

export type RunMapNodeKind = "start" | "room" | "end";

export type RunMapNode = {
  id: string;
  kind: RunMapNodeKind;
  label: string;
  depth: number;
  x: number;
  y: number;
  biosphereId?: string;
  routeRoomCount: number;
  difficultyMultiplier: number;
  outgoing: string[];
};

export type RunMapValidation = {
  valid: boolean;
  errors: string[];
  pathRoomCounts: number[];
  longestRouteRooms: number;
  shortestRouteRooms: number;
};

export type RunMap = {
  seed: number;
  startNodeId: string;
  endNodeId: string;
  nodes: RunMapNode[];
  validation: RunMapValidation;
};

export type PersonalityDefinition = {
  id: PersonalityId;
  name: string;
  keyword: "Retain" | "Momentum" | "Explore";
  starterCardId: CardId;
};

export type FundingOption = {
  id: string;
  label: string;
  budget: number;
  nextRoomTurnLimit: number;
};

export type GameConfig = {
  startingBudget: number;
  mhPerTurn: number;
  handSize: number;
  maxCompletionsPerTurn: number;
  ratingThresholds: {
    twoStar: number;
    threeStar: number;
  };
  fundingOptions: FundingOption[];
};

export type SlotRuntimeState = {
  slotNumber: number;
  terrainType: TerrainType;
  terrainAngle: TerrainAngle;
  preparationRequired: number;
  preparation: number;
  preparedThisTurn: boolean;
  preparedLastTurn: boolean;
  columnId: ColumnId;
  allocation: number;
  overrun: number;
  reinforce: number;
  completed: boolean;
  destroyed: boolean;
  needsRebuild: boolean;
};

export type SlotViewState = "Safe" | "Frontier" | "Active" | "Future" | "Destroyed";

export type RoomHistoryItem = {
  roomId: string;
  mapNodeId?: string;
  biosphereId?: string;
  difficultyMultiplier?: number;
  rating: number;
  integrity: number;
  totalAllocation: number;
  remainingValue: number;
};

export type GamePhase = "playing" | "reward" | "crafting" | "won" | "lost";

export type GameState = {
  personalityId: PersonalityId;
  mapSeed: number;
  runMap: RunMap;
  currentRoom: RoomDefinition;
  currentMapNodeId: string;
  selectedMapNodeId: string | null;
  completedMapNodeIds: string[];
  unlockedMapNodeIds: string[];
  currentRoomDifficultyMultiplier: number;
  currentRoomIndex: number;
  roomNumber: number;
  currentTurn: number;
  budget: number;
  currentMH: number;
  maxMH: number;
  handSize: number;
  turnLimit: number | null;
  activeSlotIndex: number;
  slots: SlotRuntimeState[];
  deck: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  hand: CardInstance[];
  availableColumns: ColumnId[];
  currentIntentIndex: number;
  forestEnemyId: string;
  forestEnemyName: string;
  forestAttackSetId: string;
  forestAttackSetName: string;
  previousIntentIndex: number | null;
  previousForestAttackId: ForestEventId | null;
  repeatedForestAttackCount: number;
  previousForestTargetIndexes: number[];
  forestWeather: ForestWeatherState;
  forestCooldowns: ForestCooldowns;
  blockedOpeningSlotIndexes: number[];
  blockedPreparationSlotIndexes: number[];
  forestFsmState: ForestFSMState;
  roomHistory: RoomHistoryItem[];
  cardsPlayedThisTurn: number;
  completionsThisTurn: number;
  retainHandOnEndTurn: boolean;
  nextTurnMhBonus: number;
  phase: GamePhase;
  rewardOptions: CardId[];
  columnRewardOptions: ColumnId[];
  rewardCardChosen: boolean;
  rewardColumnChosen: boolean;
  removalsAvailable: number;
  log: string[];
};
