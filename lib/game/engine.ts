import configJson from "@/data/game_config.json";
import columnsJson from "@/data/columns.json";
import { CARDS, craftingPool, normalRewardPool, starterDeck } from "./cards";
import { FOREST_EVENTS } from "./disasters";
import {
  describeRunMap,
  generateRoomFromMapNode,
  generateRunMap,
  getMapPathRoomCounts,
  getRunMapNode,
  getSelectableMapNodeIds,
  MAP_CONFIG,
} from "./map";
import {
  CardEffect,
  CardId,
  CardInstance,
  ColumnDefinition,
  ColumnId,
  EffectTarget,
  ForestAttackEffect,
  ForestEventDefinition,
  ForestEffectTarget,
  GameConfig,
  GameState,
  PersonalityId,
  RoomDefinition,
  RunMap,
  SlotRuntimeState,
  SlotViewState,
} from "./types";

export const GAME_CONFIG = configJson as GameConfig;
export const COLUMNS = columnsJson as ColumnDefinition[];
export const COLUMN_BY_ID: Record<ColumnId, ColumnDefinition> = Object.fromEntries(
  COLUMNS.map((column) => [column.id, column])
);

const STARTING_COLUMNS = COLUMNS.filter((column) => !column.unlockable).map((column) => column.id);
const MAX_EXPLORE_DEPTH = 4;

type WeightedOption<T> = T & { weight: number };

type ForestAttackSetPick = {
  enemyId: string;
  enemyName: string;
  attackSetId: string;
  attackSetName: string;
};

type ForestSetWeightProfile = {
  attackSetId: string;
  early: number;
  mid: number;
  late: number;
  wet?: number;
  windy?: number;
  wetValley?: number;
  rockyEscarpment?: number;
  grasslandSaddle?: number;
};

const FOREST_SET_PROFILES: Record<string, ForestSetWeightProfile[]> = {
  "overcast-skies": [
    { attackSetId: "gathering-clouds", early: 7, mid: 4, late: 2, wet: -0.5 },
    { attackSetId: "cold-front", early: 3, mid: 5, late: 4, wet: 0.4, windy: 0.7, rockyEscarpment: 1 },
    { attackSetId: "stormbound", early: 1, mid: 3, late: 7, wet: 0.9, windy: 0.9, wetValley: 1 },
  ],
  mist: [
    { attackSetId: "thin-mist", early: 7, mid: 4, late: 2, wet: -0.4 },
    { attackSetId: "dense-fog", early: 3, mid: 6, late: 4, wet: 0.8 },
    { attackSetId: "valley-fog", early: 1, mid: 3, late: 7, wet: 1.2, wetValley: 2 },
  ],
  "monsoon-shower": [
    { attackSetId: "lingering-rain", early: 8, mid: 5, late: 2, wet: -0.5 },
    { attackSetId: "driving-rain", early: 2, mid: 6, late: 6, wet: 0.7 },
    { attackSetId: "cloudburst", early: 1, mid: 3, late: 8, wet: 1.7, wetValley: 2 },
  ],
  "migrating-herd": [
    { attackSetId: "grazing-herd", early: 7, mid: 5, late: 3 },
    { attackSetId: "crossing-herd", early: 3, mid: 6, late: 5, wet: 0.6, wetValley: 1 },
    { attackSetId: "stampede", early: 1, mid: 3, late: 7, windy: 1.4, grasslandSaddle: 1 },
  ],
  "strong-gusts": [
    { attackSetId: "rising-wind", early: 7, mid: 4, late: 2, windy: -0.4 },
    { attackSetId: "gale", early: 3, mid: 6, late: 5, windy: 0.8, rockyEscarpment: 1 },
    { attackSetId: "violent-winds", early: 1, mid: 3, late: 8, windy: 1.7, rockyEscarpment: 2, grasslandSaddle: 1 },
  ],
};

function seededRng(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function weightedChoice<T>(items: WeightedOption<T>[], rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function makeCardInstances(cardIds: CardId[]): CardInstance[] {
  return cardIds.map((cardId, i) => ({ cardId, instanceId: `${cardId}-${i}`, heldTurns: 0 }));
}

function buildSlots(room: RoomDefinition, columnId: ColumnId = STARTING_COLUMNS[0]): SlotRuntimeState[] {
  const column = COLUMN_BY_ID[columnId];
  return room.slots.map((slot, i) => ({
    slotNumber: i + 1,
    terrainType: slot.terrainType,
    terrainAngle: slot.terrainAngle,
    preparationRequired: slot.preparationRequired,
    preparation: 0,
    preparedThisTurn: false,
    preparedLastTurn: false,
    columnId,
    allocation: column.allocation,
    overrun: 0,
    reinforce: 0,
    completed: false,
    destroyed: false,
    needsRebuild: false,
  }));
}

function drawCards(state: GameState, amount: number, rng: () => number = Math.random): GameState {
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  const hand = [...state.hand];
  const log = [...state.log];

  for (let i = 0; i < amount; i++) {
    if (drawPile.length === 0 && discardPile.length > 0) {
      drawPile = shuffle(discardPile.map((card) => ({ ...card })), rng);
      discardPile = [];
      log.push("Discard reshuffled into the draw pile.");
    }
    const card = drawPile.shift();
    if (!card) break;
    hand.push({ ...card });
  }

  return { ...state, drawPile, discardPile, hand, log };
}

function drawToHandSize(state: GameState, rng: () => number = Math.random): GameState {
  return drawCards(state, Math.max(0, state.handSize - state.hand.length), rng);
}

function currentRoomComplete(slots: SlotRuntimeState[]): boolean {
  return slots.every((slot) => slot.completed && !slot.destroyed);
}

function activeSlot(state: GameState): SlotRuntimeState | null {
  return state.slots[state.activeSlotIndex] ?? null;
}

function cloneSlots(slots: SlotRuntimeState[]): SlotRuntimeState[] {
  return slots.map((slot) => ({ ...slot }));
}

function frontierIndexes(state: GameState): number[] {
  const indexes: number[] = [];
  for (let i = state.activeSlotIndex - 1; i >= 0 && indexes.length < 2; i--) {
    if (state.slots[i]?.completed) indexes.push(i);
    else break;
  }
  return indexes;
}

function hasBlockingDestroyedFrontier(state: GameState): boolean {
  const active = activeSlot(state);
  return Boolean(active?.destroyed || frontierIndexes(state).some((i) => state.slots[i].destroyed));
}

function targetLabel(slot: SlotRuntimeState | null | undefined): string {
  return slot ? `Slot ${slot.slotNumber}` : "No target";
}

function primaryLevelForRoom(roomIndex: number): number {
  return Math.min(Math.max(roomIndex + 1, 1), 3);
}

function roomProgressBand(stateOrRoomIndex: GameState | number): "early" | "mid" | "late" {
  const roomIndex = typeof stateOrRoomIndex === "number" ? stateOrRoomIndex : stateOrRoomIndex.currentRoomIndex;
  if (roomIndex <= 1) return "early";
  if (roomIndex <= 4) return "mid";
  return "late";
}

function knownForestEnemies(): ForestAttackSetPick[] {
  const byEnemy = new Map<string, ForestAttackSetPick>();
  for (const attack of FOREST_EVENTS) {
    if (!attack.enemyId || !attack.enemyName || !attack.attackSetId || !attack.attackSetName) continue;
    if (!byEnemy.has(attack.enemyId)) {
      byEnemy.set(attack.enemyId, {
        enemyId: attack.enemyId,
        enemyName: attack.enemyName,
        attackSetId: attack.attackSetId,
        attackSetName: attack.attackSetName,
      });
    }
  }
  return [...byEnemy.values()];
}

function attackSetName(enemyId: string, attackSetId: string): string {
  return FOREST_EVENTS.find((attack) => attack.enemyId === enemyId && attack.attackSetId === attackSetId)?.attackSetName ?? attackSetId;
}

function chooseForestEnemy(room: RoomDefinition, roomIndex: number, state: Pick<GameState, "forestWeather">, rng: () => number): ForestAttackSetPick {
  const band = roomProgressBand(roomIndex);
  const wet = state.forestWeather.wet;
  const windy = state.forestWeather.windy;
  const biosphereId = room.biosphereId;
  const difficultyPressure = Math.max(0, (room.difficultyMultiplier ?? 1) - 1) * 4;
  const progressionBase = band === "early"
    ? { "overcast-skies": 5, mist: 5, "monsoon-shower": 2, "migrating-herd": 4, "strong-gusts": 3 }
    : band === "mid"
      ? { "overcast-skies": 4, mist: 3, "monsoon-shower": 4, "migrating-herd": 4, "strong-gusts": 4 }
      : { "overcast-skies": 3, mist: 2, "monsoon-shower": 5, "migrating-herd": 3, "strong-gusts": 5 };

  const enemyWeights = knownForestEnemies().map((enemy) => {
    let weight = progressionBase[enemy.enemyId as keyof typeof progressionBase] ?? 1;
    if (enemy.enemyId === "overcast-skies") weight += wet * 0.8 + windy * 0.8;
    if (enemy.enemyId === "mist") weight += wet * 1.2;
    if (enemy.enemyId === "monsoon-shower") weight += wet * 1.8 + difficultyPressure;
    if (enemy.enemyId === "migrating-herd") weight += windy * 0.7;
    if (enemy.enemyId === "strong-gusts") weight += windy * 1.8 + difficultyPressure;

    if (biosphereId === "shola-forest" && (enemy.enemyId === "mist" || enemy.enemyId === "overcast-skies")) weight += 2;
    if (biosphereId === "wet-valley" && (enemy.enemyId === "monsoon-shower" || enemy.enemyId === "mist" || enemy.enemyId === "migrating-herd")) weight += 2;
    if (biosphereId === "rocky-escarpment" && enemy.enemyId === "strong-gusts") weight += 3;
    if (biosphereId === "grassland-saddle" && (enemy.enemyId === "strong-gusts" || enemy.enemyId === "migrating-herd")) weight += 2;
    if (biosphereId === "tea-slope" && enemy.enemyId === "migrating-herd") weight += 1;

    return { ...enemy, weight: Math.max(1, weight) };
  });

  return weightedChoice(enemyWeights, rng);
}

function chooseForestAttackSet(room: RoomDefinition, roomIndex: number, state: Pick<GameState, "forestWeather">, rng: () => number): ForestAttackSetPick {
  if (roomIndex + 1 >= MAP_CONFIG.maxRouteRooms) {
    return {
      enemyId: "thunderstorm",
      enemyName: "Thunderstorm",
      attackSetId: "apex-thunderstorm",
      attackSetName: "Apex Thunderstorm",
    };
  }

  const enemy = chooseForestEnemy(room, roomIndex, state, rng);
  const band = roomProgressBand(roomIndex);
  const difficultyPressure = Math.max(0, (room.difficultyMultiplier ?? 1) - 1) * 2;
  const profiles = FOREST_SET_PROFILES[enemy.enemyId] ?? [];
  const availableSetIds = [...new Set(FOREST_EVENTS
    .filter((attack) => attack.enemyId === enemy.enemyId && attack.attackSetId)
    .map((attack) => attack.attackSetId!))];
  const weightedSets = availableSetIds.map((attackSetId) => {
    const profile = profiles.find((item) => item.attackSetId === attackSetId);
    let weight = profile?.[band] ?? 1;
    weight += (profile?.wet ?? 0) * state.forestWeather.wet;
    weight += (profile?.windy ?? 0) * state.forestWeather.windy;
    weight += difficultyPressure * Math.max(0, ((profile?.late ?? 1) - (profile?.early ?? 1)) / 6);
    if (room.biosphereId === "wet-valley") weight += profile?.wetValley ?? 0;
    if (room.biosphereId === "rocky-escarpment") weight += profile?.rockyEscarpment ?? 0;
    if (room.biosphereId === "grassland-saddle") weight += profile?.grasslandSaddle ?? 0;
    return { attackSetId, weight: Math.max(1, weight) };
  });
  const chosenSet = weightedChoice(weightedSets, rng);
  return {
    enemyId: enemy.enemyId,
    enemyName: enemy.enemyName,
    attackSetId: chosenSet.attackSetId,
    attackSetName: attackSetName(enemy.enemyId, chosenSet.attackSetId),
  };
}

function currentRunCardIds(state: GameState): Set<CardId> {
  return new Set([...state.hand, ...state.drawPile, ...state.discardPile].map((card) => card.cardId));
}

function rewardChoices<T>(items: T[], rng: () => number, count = 3): T[] {
  return shuffle(items, rng).slice(0, count);
}

function finishRoom(state: GameState, rng: () => number = Math.random): GameState {
  const totalAllocation = state.slots.reduce((sum, slot) => sum + slot.allocation, 0);
  const remainingValue = state.slots.reduce((sum, slot) => {
    if (slot.destroyed) return sum;
    return sum + Math.max(0, slot.allocation - slot.overrun);
  }, 0);
  const integrity = totalAllocation ? Math.round((100 * remainingValue) / totalAllocation) : 100;
  const rating = integrity >= GAME_CONFIG.ratingThresholds.threeStar
    ? 3
    : integrity >= GAME_CONFIG.ratingThresholds.twoStar
      ? 2
      : 1;
  const ownedCards = currentRunCardIds(state);
  const rewardOptions = rewardChoices(
    normalRewardPool(state.personalityId, state.roomNumber + 1).filter((card) => !ownedCards.has(card.id)),
    rng
  ).map((card) => card.id);
  const columnRewardOptions = rewardChoices(
    COLUMNS.filter((column) => column.unlockable && !state.availableColumns.includes(column.id)),
    rng
  ).map((column) => column.id);

  return {
    ...state,
    completedMapNodeIds: state.completedMapNodeIds.includes(state.currentMapNodeId)
      ? state.completedMapNodeIds
      : [...state.completedMapNodeIds, state.currentMapNodeId],
    selectedMapNodeId: null,
    phase: rewardOptions.length === 0 && columnRewardOptions.length === 0 ? "crafting" : "reward",
    rewardOptions,
    columnRewardOptions,
    rewardCardChosen: rewardOptions.length === 0,
    rewardColumnChosen: columnRewardOptions.length === 0,
    removalsAvailable: rating,
    roomHistory: [
      ...state.roomHistory,
      {
        roomId: state.currentRoom.id,
        mapNodeId: state.currentRoom.mapNodeId,
        biosphereId: state.currentRoom.biosphereId,
        difficultyMultiplier: state.currentRoom.difficultyMultiplier,
        rating,
        integrity,
        totalAllocation,
        remainingValue,
      },
    ],
    log: [...state.log, `Room complete: ${integrity}% integrity, ${rating} star${rating === 1 ? "" : "s"}.`],
  };
}

function exposedIndexes(state: GameState): number[] {
  return [state.activeSlotIndex, ...frontierIndexes(state)]
    .filter((index, position, all) => all.indexOf(index) === position)
    .filter((index) => {
      const slot = state.slots[index];
      return Boolean(slot && !slot.destroyed);
    });
}

function sortWeakestFirst(state: GameState, indexes: number[]): number[] {
  return [...indexes].sort((a, b) => {
    const aSlot = state.slots[a];
    const bSlot = state.slots[b];
    const aRemaining = aSlot.allocation - aSlot.overrun;
    const bRemaining = bSlot.allocation - bSlot.overrun;
    return aRemaining - bRemaining;
  });
}

function openWorksiteIndexes(state: GameState): number[] {
  return [state.activeSlotIndex, ...frontierIndexes(state)]
    .filter((index, position, all) => all.indexOf(index) === position)
    .filter((index) => {
      const slot = state.slots[index];
      return Boolean(slot && !slot.destroyed);
    });
}

function incompleteWorksiteIndexes(state: GameState): number[] {
  return state.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot, index }) => index >= state.activeSlotIndex && !slot.completed && !slot.destroyed)
    .map(({ index }) => index);
}

function unopenedLocationIndexes(state: GameState): number[] {
  return state.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot, index }) => index > state.activeSlotIndex && !slot.completed && !slot.destroyed)
    .map(({ index }) => index);
}

function highestPrepWorksiteIndexes(state: GameState): number[] {
  const candidates = state.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => !slot.completed && !slot.destroyed && slot.preparation > 0)
    .sort((a, b) => b.slot.preparation - a.slot.preparation);
  if (candidates[0]) return [candidates[0].index];
  return state.slots[state.activeSlotIndex] && !state.slots[state.activeSlotIndex].destroyed ? [state.activeSlotIndex] : [];
}

function adjacentWorksiteIndexes(state: GameState): number[] {
  const exposed = openWorksiteIndexes(state);
  for (const index of exposed) {
    if (exposed.includes(index - 1)) return [index - 1, index];
    if (exposed.includes(index + 1)) return [index, index + 1];
  }
  const active = state.activeSlotIndex;
  if (state.slots[active] && !state.slots[active].destroyed) {
    const next = state.slots[active + 1];
    if (next && !next.destroyed) return [active, active + 1];
    const previous = state.slots[active - 1];
    if (previous && !previous.destroyed) return [active - 1, active];
    return [active];
  }
  return [];
}

function getForestEffectTargetIndexes(state: GameState, target: ForestEffectTarget): number[] {
  const exposed = exposedIndexes(state);
  if (target === "oneOpenWorksite") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 1);
  if (target === "twoOpenWorksites") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 2);
  if (target === "threeOpenWorksites") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 3);
  if (target === "allOpenWorksites") return openWorksiteIndexes(state);
  if (target === "highestPrepWorksite") return highestPrepWorksiteIndexes(state);
  if (target === "oneExposedStructure") return sortWeakestFirst(state, exposed).slice(0, 1);
  if (target === "twoExposedStructures") return sortWeakestFirst(state, exposed).slice(0, 2);
  if (target === "threeExposedStructures") return sortWeakestFirst(state, exposed).slice(0, 3);
  if (target === "allExposedStructures") return exposed;
  if (target === "twoAdjacentWorksites" || target === "oneWorksiteAndAdjacent" || target === "oneStructureAndAdjacent") return adjacentWorksiteIndexes(state).slice(0, 2);
  if (target === "oneUnopenedLocation") return unopenedLocationIndexes(state).slice(0, 1);
  if (target === "twoLocations") return incompleteWorksiteIndexes(state).slice(0, 2);
  return [];
}

function getScaledForestDamage(state: GameState, targetIndex: number, amount: number): number {
  const target = state.slots[targetIndex];
  if (!target || target.destroyed || amount <= 0) return 0;
  const scaledPower = Math.ceil(amount * state.currentRoomDifficultyMultiplier);
  return targetIndex === state.activeSlotIndex
    ? Math.ceil(scaledPower * Math.min(1, target.preparation / target.preparationRequired))
    : scaledPower;
}

function attackMeetsRequirements(state: GameState, attack: ForestEventDefinition): boolean {
  return (state.forestWeather.wet >= (attack.requirements.wet ?? 0))
    && (state.forestWeather.windy >= (attack.requirements.windy ?? 0));
}

function attackWeight(state: GameState, attack: ForestEventDefinition): number {
  const requirementWeight = (attack.requirements.wet ?? 0) + (attack.requirements.windy ?? 0);
  const bias = attack.lowStatusBias && state.forestWeather[attack.lowStatusBias.status] < attack.lowStatusBias.below
    ? attack.lowStatusBias.bonus
    : 0;
  return Math.max(1, attack.weight + bias + requirementWeight);
}

function reduceCooldowns(state: GameState, excludeId?: string): GameState {
  const forestCooldowns: Record<string, number> = {};
  for (const [id, turns] of Object.entries(state.forestCooldowns)) {
    const nextTurns = id === excludeId ? turns : Math.max(0, turns - 1);
    if (nextTurns > 0) forestCooldowns[id] = nextTurns;
  }
  return { ...state, forestCooldowns };
}

function chooseNextIntentIndex(state: GameState, rng: () => number = Math.random): number {
  const primaryLevel = primaryLevelForRoom(state.currentRoomIndex);
  const attackSetEvents = FOREST_EVENTS
    .map((attack, index) => ({ attack, index }))
    .filter(({ attack }) => attack.enemyId === state.forestEnemyId && attack.attackSetId === state.forestAttackSetId);
  const eligible = attackSetEvents
    .filter(({ attack }) => attack.minPrimaryLevel <= primaryLevel)
    .filter(({ attack }) => attackMeetsRequirements(state, attack))
    .filter(({ attack }) => (state.forestCooldowns[attack.id] ?? 0) <= 0)
    .filter(({ attack }) => !(attack.id === state.previousForestAttackId && state.repeatedForestAttackCount >= 2))
    .filter(({ attack }) => !(attack.cooldown > 0 && attack.id === state.previousForestAttackId))
    .filter(({ attack }) => attackHasTargets(state, attack));

  const fallback = attackSetEvents
    .filter(({ attack }) => attack.minPrimaryLevel <= primaryLevel)
    .filter(({ attack }) => attackMeetsRequirements(state, attack))
    .filter(({ attack }) => attackHasTargets(state, attack));
  const noTargetFallback = attackSetEvents
    .filter(({ attack }) => attack.minPrimaryLevel <= primaryLevel)
    .filter(({ attack }) => attackMeetsRequirements(state, attack));
  const options = eligible.length ? eligible : fallback.length ? fallback : noTargetFallback;
  if (options.length === 0) return attackSetEvents[0]?.index ?? 0;

  const total = options.reduce((sum, option) => sum + attackWeight(state, option.attack), 0);
  let roll = rng() * total;
  for (const option of options) {
    roll -= attackWeight(state, option.attack);
    if (roll <= 0) return option.index;
  }
  return options[options.length - 1].index;
}

function attackHasTargets(state: GameState, attack: ForestEventDefinition): boolean {
  const targetCount = getIntentTargetIndexes(state, attack).length;
  if (attack.targetRule === "twoExposed") return targetCount >= 2;
  if (attack.targetRule === "threeExposed") return targetCount >= 3;
  if (attack.targetRule === "twoOpenWorksites" || attack.targetRule === "twoAdjacentWorksites" || attack.targetRule === "twoLocations") return targetCount >= 2;
  if (attack.targetRule === "threeOpenWorksites") return targetCount >= 3;
  return targetCount > 0;
}

export function getCurrentIntent(state: GameState) {
  return FOREST_EVENTS[state.currentIntentIndex] ?? FOREST_EVENTS[0];
}

export function getNextIntent(_state: GameState): ForestEventDefinition | null {
  return null;
}

export function getFrontierIndexes(state: GameState): number[] {
  return frontierIndexes(state);
}

export function getIntentTargetIndex(state: GameState, intent: ForestEventDefinition = getCurrentIntent(state)): number | null {
  if (intent.targetRule === "active") return state.slots[state.activeSlotIndex] ? state.activeSlotIndex : null;

  const frontiers = frontierIndexes(state).filter((index) => state.slots[index] && !state.slots[index].destroyed);
  if (frontiers.length === 0) return state.slots[state.activeSlotIndex] ? state.activeSlotIndex : null;

  if (intent.targetRule === "newestFrontier") return frontiers[0];
  if (intent.targetRule === "weakestFrontier") return sortWeakestFirst(state, frontiers)[0];
  return getIntentTargetIndexes(state, intent)[0] ?? null;
}

export function getIntentTargetIndexes(state: GameState, intent: ForestEventDefinition = getCurrentIntent(state)): number[] {
  const exposed = exposedIndexes(state);
  const frontiers = frontierIndexes(state).filter((index) => state.slots[index] && !state.slots[index].destroyed);

  if (intent.targetRule === "active") return state.slots[state.activeSlotIndex] && !state.slots[state.activeSlotIndex].destroyed ? [state.activeSlotIndex] : [];
  if (intent.targetRule === "newestFrontier") return frontiers[0] !== undefined ? [frontiers[0]] : [];
  if (intent.targetRule === "weakestFrontier") return sortWeakestFirst(state, frontiers).slice(0, 1);
  if (intent.targetRule === "oneOpenWorksite") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 1);
  if (intent.targetRule === "twoOpenWorksites") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 2);
  if (intent.targetRule === "threeOpenWorksites") return sortWeakestFirst(state, openWorksiteIndexes(state)).slice(0, 3);
  if (intent.targetRule === "highestPrepWorksite") return highestPrepWorksiteIndexes(state);
  if (intent.targetRule === "twoAdjacentWorksites") return adjacentWorksiteIndexes(state).slice(0, 2);
  if (intent.targetRule === "oneUnopenedLocation") return unopenedLocationIndexes(state).slice(0, 1);
  if (intent.targetRule === "twoLocations") return incompleteWorksiteIndexes(state).slice(0, 2);
  if (intent.targetRule === "oneExposed") return sortWeakestFirst(state, exposed).slice(0, 1);
  if (intent.targetRule === "upToTwoExposed") return sortWeakestFirst(state, exposed).slice(0, 2);
  if (intent.targetRule === "twoExposed") return sortWeakestFirst(state, exposed).slice(0, 2);
  if (intent.targetRule === "everyOpenWorksite" || intent.targetRule === "everyExposed") return exposed;

  return [];
}

export function getIntentIncomingDamageForSlot(
  state: GameState,
  slotIndex: number,
  intent: ForestEventDefinition = getCurrentIntent(state)
): number | null {
  const effects: ForestAttackEffect[] = intent.effects?.length
    ? intent.effects
    : [{ type: "damage", amount: intent.power, target: intent.targetRule === "everyExposed" ? "allExposedStructures" : "oneExposedStructure" }];
  let totalDamage = 0;
  let wasTargetedByDamage = false;

  for (const effect of effects) {
    if (effect.type !== "damage") continue;
    const targetIndexes = getForestEffectTargetIndexes(state, effect.target);
    targetIndexes.forEach((targetIndex, position) => {
      if (targetIndex !== slotIndex) return;
      const amount = position > 0 && effect.adjacentAmount !== undefined ? effect.adjacentAmount : effect.amount;
      totalDamage += getScaledForestDamage(state, targetIndex, amount);
      wasTargetedByDamage = true;
    });
  }

  return wasTargetedByDamage ? totalDamage : null;
}

export function getIntentPreviewForSlot(
  state: GameState,
  slotIndex: number,
  intent: ForestEventDefinition = getCurrentIntent(state)
): string | null {
  const effects: ForestAttackEffect[] = intent.effects?.length
    ? intent.effects
    : [{ type: "damage", amount: intent.power, target: intent.targetRule === "everyExposed" ? "allExposedStructures" : "oneExposedStructure" }];
  const labels: string[] = [];

  for (const effect of effects) {
    const targetIndexes = getForestEffectTargetIndexes(state, effect.target);

    if (effect.type === "damage") {
      let totalDamage = 0;
      let wasTargetedByDamage = false;
      targetIndexes.forEach((targetIndex, position) => {
        if (targetIndex !== slotIndex) return;
        const amount = position > 0 && effect.adjacentAmount !== undefined ? effect.adjacentAmount : effect.amount;
        totalDamage += amount;
        wasTargetedByDamage = true;
      });
      if (wasTargetedByDamage) labels.push(`${totalDamage} DMG`);
    }

    if (effect.type === "prepLoss" && targetIndexes.includes(slotIndex)) {
      labels.push(`-${effect.amount} Prep`);
    }

    if (effect.type === "blockOpening" && targetIndexes.slice(0, effect.amount).includes(slotIndex)) {
      labels.push("No Open");
    }

    if (effect.type === "blockPrep" && targetIndexes.slice(0, effect.amount).includes(slotIndex)) {
      labels.push("No Prep");
    }
  }

  return labels.length ? labels.join(" + ") : null;
}

export function getIntentTargetLabel(state: GameState, intent: ForestEventDefinition = getCurrentIntent(state)): string {
  const indexes = getIntentTargetIndexes(state, intent);
  if (indexes.length === 0) return "None";
  return indexes.map((index) => targetLabel(state.slots[index])).join(", ");
}

export function getActiveExposurePercent(state: GameState): number {
  const slot = activeSlot(state);
  if (!slot) return 0;
  return Math.min(100, Math.round((100 * slot.preparation) / slot.preparationRequired));
}

export function getSlotViewState(state: GameState, index: number): SlotViewState {
  const slot = state.slots[index];
  if (!slot) return "Future";
  if (slot.destroyed) return "Destroyed";
  if (index === state.activeSlotIndex && state.phase === "playing") return "Active";
  if (index > state.activeSlotIndex) return "Future";
  if (frontierIndexes(state).includes(index)) return "Frontier";
  return "Safe";
}

export function createInitialState(
  personalityId: PersonalityId = "patience",
  rng: () => number = seededRng(1)
): GameState {
  const mapSeed = MAP_CONFIG.defaultSeed;
  const runMap = generateRunMap(mapSeed);
  const firstNodeId = getRunMapNode(runMap, runMap.startNodeId)?.outgoing[0] ?? runMap.startNodeId;
  const initialWeather = { wet: 0, windy: 0 };
  const room = generateRoomFromMapNode(runMap, firstNodeId, 1, initialWeather);
  const encounter = chooseForestAttackSet(room, 0, { forestWeather: initialWeather }, rng);
  const deck = makeCardInstances(starterDeck(personalityId));
  const shuffled = shuffle(deck, rng);
  const base: GameState = {
    personalityId,
    mapSeed,
    runMap,
    currentRoom: room,
    currentMapNodeId: firstNodeId,
    selectedMapNodeId: null,
    completedMapNodeIds: [runMap.startNodeId],
    unlockedMapNodeIds: [],
    currentRoomDifficultyMultiplier: room.difficultyMultiplier ?? 1,
    currentRoomIndex: 0,
    roomNumber: 1,
    currentTurn: 1,
    budget: GAME_CONFIG.startingBudget,
    currentMH: GAME_CONFIG.mhPerTurn,
    maxMH: GAME_CONFIG.mhPerTurn,
    handSize: GAME_CONFIG.handSize,
    turnLimit: null,
    activeSlotIndex: 0,
    slots: buildSlots(room),
    deck,
    drawPile: shuffled,
    discardPile: [],
    hand: [],
    availableColumns: STARTING_COLUMNS,
    currentIntentIndex: 0,
    forestEnemyId: encounter.enemyId,
    forestEnemyName: encounter.enemyName,
    forestAttackSetId: encounter.attackSetId,
    forestAttackSetName: encounter.attackSetName,
    previousIntentIndex: null,
    previousForestAttackId: null,
    repeatedForestAttackCount: 0,
    previousForestTargetIndexes: [],
    forestWeather: initialWeather,
    forestCooldowns: {},
    blockedOpeningSlotIndexes: [],
    blockedPreparationSlotIndexes: [],
    forestFsmState: "Player Turn",
    roomHistory: [],
    cardsPlayedThisTurn: 0,
    completionsThisTurn: 0,
    retainHandOnEndTurn: false,
    nextTurnMhBonus: 0,
    phase: "playing",
    rewardOptions: [],
    columnRewardOptions: [],
    rewardCardChosen: false,
    rewardColumnChosen: false,
    removalsAvailable: 0,
    log: [`Turn 1 - choose how to prepare and defend the first bridge slot. Forest: ${encounter.enemyName} - ${encounter.attackSetName}.`],
  };
  return drawToHandSize({ ...base, currentIntentIndex: chooseNextIntentIndex(base, rng) }, rng);
}

function applyForestWeatherGains(state: GameState, intent: ForestEventDefinition): GameState {
  const wetGain = intent.statusesAdded.wet ?? 0;
  const windyGain = intent.statusesAdded.windy ?? 0;
  if (wetGain === 0 && windyGain === 0) return state;

  const forestWeather = {
    wet: Math.min(3, state.forestWeather.wet + wetGain),
    windy: Math.min(3, state.forestWeather.windy + windyGain),
  };
  const gained = [
    wetGain ? `Wet +${wetGain}` : "",
    windyGain ? `Windy +${windyGain}` : "",
  ].filter(Boolean).join(", ");

  return {
    ...state,
    forestWeather,
    log: [...state.log, `${intent.name} added ${gained}. Weather is Wet ${forestWeather.wet}, Windy ${forestWeather.windy}.`],
  };
}

export function selectColumn(state: GameState, columnId: ColumnId): GameState {
  const slot = activeSlot(state);
  const column = COLUMN_BY_ID[columnId];
  if (state.phase !== "playing" || !slot || !column || !state.availableColumns.includes(columnId)) return state;
  if (slot.preparation > 0 || (slot.overrun > 0 && !slot.destroyed) || slot.completed) return state;

  const slots = cloneSlots(state.slots);
  slots[state.activeSlotIndex] = {
      ...slots[state.activeSlotIndex],
      columnId,
      allocation: column.allocation,
      overrun: 0,
      preparedThisTurn: false,
      preparedLastTurn: false,
      reinforce: 0,
    destroyed: false,
    needsRebuild: slot.destroyed || slot.needsRebuild,
  };
  return { ...state, slots, log: [...state.log, `Selected ${column.name} for slot ${slot.slotNumber}.`] };
}

function resolveTargetIndex(state: GameState, target?: EffectTarget, chosenSlotIndex?: number, selfSlotIndex?: number): number {
  if (target === "chosen" && chosenSlotIndex !== undefined) return chosenSlotIndex;
  if (target === "self" && selfSlotIndex !== undefined) return selfSlotIndex;
  if (target === "mostDamaged") {
    const candidates = [state.activeSlotIndex, ...frontierIndexes(state)].filter((i) => state.slots[i]);
    return candidates.sort((a, b) => state.slots[b].overrun - state.slots[a].overrun)[0] ?? state.activeSlotIndex;
  }
  return state.activeSlotIndex;
}

export function effectiveCardCost(instance: CardInstance): number {
  const card = CARDS[instance.cardId];
  if (!card) return 0;
  const reduction = (card.costReductionPerHeldTurn ?? 0) * instance.heldTurns;
  return Math.max(0, card.cost - reduction);
}

function applyOverrunToSlot(slots: SlotRuntimeState[], index: number, amount: number): { budgetLost: number; destroyed: boolean; message: string | null } {
  const slot = slots[index];
  if (!slot || slot.destroyed || amount <= 0) return { budgetLost: 0, destroyed: false, message: null };
  const previousOverrun = slot.overrun;
  slot.overrun = Math.min(slot.allocation, slot.overrun + amount);
  const budgetLost = slot.overrun - previousOverrun;
  if (slot.overrun >= slot.allocation) {
    slot.destroyed = true;
    slot.completed = false;
    slot.needsRebuild = true;
    return {
      budgetLost,
      destroyed: true,
      message: `Slot ${slot.slotNumber} was destroyed. Lost ${budgetLost} Budget.`,
    };
  }
  return { budgetLost, destroyed: false, message: null };
}

function applyEffects(
  state: GameState,
  effects: CardEffect[],
  chosenSlotIndex?: number,
  selfSlotIndex?: number,
  rng: () => number = Math.random,
  exploreDepth = 0,
  playedCardHeldTurns = 0
): GameState {
  let next = state;
  for (const effect of effects) {
    const slots = cloneSlots(next.slots);
    const log = [...next.log];

    if (effect.type === "prepare") {
      const index = resolveTargetIndex(next, effect.target, chosenSlotIndex, selfSlotIndex);
      const slot = slots[index];
      if (slot) {
        if (next.blockedPreparationSlotIndexes.includes(index)) {
          log.push(`Slot ${slot.slotNumber} could not receive Preparation this turn.`);
          next = { ...next, slots, log };
          continue;
        }
        if (slot.destroyed) {
          slot.destroyed = false;
          slot.overrun = 0;
          slot.reinforce = 0;
        }
        const momentum = (effect.perPreviousCardPlayed ?? 0) * next.cardsPlayedThisTurn;
        const heldBonus = (effect.perHeldTurn ?? 0) * playedCardHeldTurns;
        const baseAmount = effect.ifNoPrepareLastTurnAmount && !slot.preparedLastTurn
          ? effect.ifNoPrepareLastTurnAmount
          : effect.amount;
        const amount = baseAmount + momentum + heldBonus;
        const wasIncomplete = slot.preparation < slot.preparationRequired;
        slot.preparation += amount;
        slot.preparedThisTurn = true;
        if (effect.resetIfNotComplete && slot.preparation < slot.preparationRequired) {
          slot.preparation = 0;
          log.push(`Prepared slot ${slot.slotNumber} by ${amount}, then lost all Preparation because it was not completed.`);
        } else {
          log.push(`Prepared slot ${slot.slotNumber} by ${amount}.`);
        }
        if (effect.reinforceChosenIfCompletesAmount && wasIncomplete && slot.preparation >= slot.preparationRequired && chosenSlotIndex !== undefined && chosenSlotIndex !== index) {
          const reinforceSlot = slots[chosenSlotIndex];
          if (reinforceSlot && !reinforceSlot.destroyed) {
            reinforceSlot.reinforce += effect.reinforceChosenIfCompletesAmount;
            log.push(`Reinforced slot ${reinforceSlot.slotNumber} by ${effect.reinforceChosenIfCompletesAmount}.`);
          }
        }
      }
      next = { ...next, slots, log };
    }

    if (effect.type === "reinforce") {
      const index = resolveTargetIndex(next, effect.target, chosenSlotIndex, selfSlotIndex);
      const slot = slots[index];
      if (slot && !slot.destroyed) {
        const amount = effect.ifFirstCardAmount && next.cardsPlayedThisTurn === 0
          ? effect.ifFirstCardAmount
          : effect.amount;
        slot.reinforce += amount;
        log.push(`Reinforced slot ${slot.slotNumber} by ${amount}.`);
      }
      next = { ...next, slots, log };
    }

    if (effect.type === "repair") {
      const index = resolveTargetIndex(next, effect.target, chosenSlotIndex, selfSlotIndex);
      const slot = slots[index];
      if (slot && !slot.destroyed) {
        const repaired = Math.min(slot.overrun, effect.amount);
        slot.overrun -= repaired;
        log.push(`Repaired ${repaired} Overrun on slot ${slot.slotNumber}.`);
      }
      next = { ...next, slots, log };
    }

    if (effect.type === "draw") {
      next = drawCards({ ...next, log }, effect.amount, rng);
    }

    if (effect.type === "gainMh") {
      const amount = effect.ifHeldAtLeastTurns !== undefined && effect.heldAmount !== undefined
        ? playedCardHeldTurns >= effect.ifHeldAtLeastTurns
          ? effect.heldAmount
          : effect.amount
        : effect.amount;
      next = { ...next, currentMH: next.currentMH + amount, log: [...log, `Gained ${amount} MH.`] };
    }

    if (effect.type === "endTurnRetainHandNextMh") {
      next = {
        ...next,
        retainHandOnEndTurn: true,
        nextTurnMhBonus: next.nextTurnMhBonus + effect.amount,
        log: [...log, `Next turn will gain ${effect.amount} MH and retain the current hand.`],
      };
    }

    if (effect.type === "selfOverrun") {
      const index = resolveTargetIndex(next, "active", chosenSlotIndex, selfSlotIndex);
      const result = applyOverrunToSlot(slots, index, effect.amount);
      const budget = Math.max(0, next.budget - result.budgetLost);
      if (result.message) log.push(result.message);
      else log.push(`Added ${effect.amount} Overrun to slot ${slots[index]?.slotNumber ?? index + 1}.`);
      next = { ...next, slots, budget, log, phase: budget <= 0 ? "lost" : next.phase };
    }

    if (effect.type === "explore") {
      if (exploreDepth >= MAX_EXPLORE_DEPTH) {
        next = { ...next, log: [...log, "Explore stopped at the safety limit."] };
      } else {
        next = resolveExplore({ ...next, log }, effect.cost, rng, exploreDepth + 1);
      }
    }
  }
  return next;
}

function effectNeedsTarget(effect: CardEffect): boolean {
  if (effect.type === "prepare" && effect.reinforceChosenIfCompletesAmount) return true;
  return (effect.type === "prepare" || effect.type === "reinforce" || effect.type === "repair") && effect.target === "chosen";
}

export function cardNeedsTarget(cardId: CardId): boolean {
  return CARDS[cardId]?.effects.some(effectNeedsTarget) ?? false;
}

export function isValidCardTarget(state: GameState, cardId: CardId, slotIndex: number): boolean {
  const slot = state.slots[slotIndex];
  if (!slot || slot.destroyed) return false;
  if (state.blockedPreparationSlotIndexes.includes(slotIndex)) return false;
  const viewState = getSlotViewState(state, slotIndex);
  if (!["Active", "Frontier", "Safe"].includes(viewState)) return false;
  const card = CARDS[cardId];
  if (!card) return false;
  if (card.effects.some((e) => e.type === "repair" && e.target === "chosen")) return slot.overrun > 0;
  if (card.effects.some((e) => e.type === "prepare" && e.target === "chosen" && e.differentFromActive) && slotIndex === state.activeSlotIndex) return false;
  if (card.effects.some((e) => e.type === "prepare" && e.target === "chosen")) return !slot.completed;
  return true;
}

function cardWouldPrepareBlockedSlot(state: GameState, cardId: CardId, targetSlotIndex?: number): boolean {
  const card = CARDS[cardId];
  if (!card) return false;
  return card.effects.some((effect) => {
    if (effect.type !== "prepare") return false;
    const index = effect.target === "chosen"
      ? targetSlotIndex
      : effect.target === "self"
        ? undefined
        : state.activeSlotIndex;
    return index !== undefined && state.blockedPreparationSlotIndexes.includes(index);
  });
}

export function canPlayCard(state: GameState, instanceId: string, targetSlotIndex?: number): boolean {
  if (state.phase !== "playing") return false;
  const instance = state.hand.find((card) => card.instanceId === instanceId);
  if (!instance) return false;
  const card = CARDS[instance.cardId];
  if (!card || state.currentMH < effectiveCardCost(instance)) return false;
  if (cardWouldPrepareBlockedSlot(state, card.id, targetSlotIndex)) return false;
  if (cardNeedsTarget(card.id)) {
    return targetSlotIndex !== undefined && isValidCardTarget(state, card.id, targetSlotIndex);
  }
  return true;
}

export function playCard(
  state: GameState,
  instanceId: string,
  targetSlotIndex?: number,
  rng: () => number = Math.random,
  free = false,
  exploreDepth = 0
): GameState {
  const instance = state.hand.find((card) => card.instanceId === instanceId);
  if (!instance) return state;
  const card = CARDS[instance.cardId];
  if (!card) return state;
  if (!free && !canPlayCard(state, instanceId, targetSlotIndex)) return state;
  if (free && cardNeedsTarget(card.id) && targetSlotIndex === undefined) targetSlotIndex = state.activeSlotIndex;

  const hand = state.hand.filter((item) => item.instanceId !== instanceId);
  const spend = free ? 0 : effectiveCardCost(instance);
  let next: GameState = {
    ...state,
    hand,
    currentMH: state.currentMH - spend,
    discardPile: [...state.discardPile, { ...instance, heldTurns: 0 }],
    log: [...state.log, `${free ? "Explored" : "Played"} ${card.name}.`],
  };

  const effectiveEffects = card.effects.map((effect) => {
    if (effect.type !== "prepare") return effect;
    return {
      ...effect,
      amount: effect.amount + (effect.perHeldTurn ?? 0) * instance.heldTurns,
      perHeldTurn: 0,
    };
  });

  next = applyEffects(next, effectiveEffects, targetSlotIndex, undefined, rng, exploreDepth, instance.heldTurns);
  const playedState = {
    ...next,
    cardsPlayedThisTurn: next.cardsPlayedThisTurn + 1,
  };
  if (!free && card.effects.some((effect) => effect.type === "endTurnRetainHandNextMh")) {
    return endTurn(playedState, rng);
  }
  return playedState;
}

function resolveExplore(state: GameState, cost: number, rng: () => number, exploreDepth: number): GameState {
  let drawPile = [...state.drawPile];
  const revealed: CardInstance[] = [];
  let match: CardInstance | undefined;

  while (drawPile.length > 0) {
    const next = drawPile.shift()!;
    if (CARDS[next.cardId]?.cost === cost) {
      match = next;
      break;
    }
    revealed.push(next);
  }

  let nextState: GameState = {
    ...state,
    drawPile,
    discardPile: [...state.discardPile, ...revealed.map((card) => ({ ...card, heldTurns: 0 }))],
    log: [...state.log, `Explore ${cost} revealed ${revealed.length + (match ? 1 : 0)} card(s).`],
  };

  if (!match) return nextState;
  nextState = { ...nextState, hand: [...nextState.hand, match] };
  return playCard(nextState, match.instanceId, undefined, rng, true, exploreDepth);
}

export function completeActiveSlot(state: GameState, rng: () => number = Math.random): GameState {
  const slot = activeSlot(state);
  if (state.phase !== "playing" || !slot) return state;
  if (state.completionsThisTurn >= GAME_CONFIG.maxCompletionsPerTurn) return state;
  if (slot.destroyed || hasBlockingDestroyedFrontier(state)) return state;
  if (slot.preparation < slot.preparationRequired) return state;
  const nextActiveIndex = state.activeSlotIndex + 1;
  if (state.slots[nextActiveIndex] && state.blockedOpeningSlotIndexes.includes(nextActiveIndex)) {
    return {
      ...state,
      log: [...state.log, `Slot ${state.slots[nextActiveIndex].slotNumber} cannot be opened this turn.`],
    };
  }

  const slots = cloneSlots(state.slots);
  slots[state.activeSlotIndex].completed = true;
  slots[state.activeSlotIndex].needsRebuild = false;
  slots[state.activeSlotIndex].preparation = slots[state.activeSlotIndex].preparationRequired;
  let next: GameState = {
    ...state,
    slots,
    completionsThisTurn: state.completionsThisTurn + 1,
    log: [...state.log, `Completed slot ${slot.slotNumber}.`],
  };
  next = applyEffects(next, COLUMN_BY_ID[slot.columnId].onComplete, undefined, state.activeSlotIndex, rng);

  if (currentRoomComplete(next.slots)) return finishRoom(next, rng);

  return {
    ...next,
    activeSlotIndex: nextActiveIndex,
    log: [...next.log, `Slot ${nextActiveIndex + 1} is now active.`],
  };
}

function resolveForest(state: GameState): GameState {
  const intent = getCurrentIntent(state);
  const slots = cloneSlots(state.slots);
  const log = [...state.log];
  let budgetLost = 0;
  const destroyedIndexes: number[] = [];
  const blockedOpeningSlotIndexes: number[] = [];
  const blockedPreparationSlotIndexes: number[] = [];
  const allTargetIndexes: number[] = [];

  const workingState = () => ({ ...state, slots });
  const rememberTargets = (indexes: number[]) => {
    for (const index of indexes) {
      if (!allTargetIndexes.includes(index)) allTargetIndexes.push(index);
    }
  };
  const applyDamage = (targetIndex: number, amount: number) => {
    const target = slots[targetIndex];
    if (!target || target.destroyed || amount <= 0) return;

    const incoming = getScaledForestDamage(workingState(), targetIndex, amount);
    const prevented = Math.min(target.reinforce, incoming);
    target.reinforce -= prevented;
    const applied = incoming - prevented;
    const result = applyOverrunToSlot(slots, targetIndex, applied);
    budgetLost += result.budgetLost;
    if (result.destroyed) destroyedIndexes.push(targetIndex);

    log.push(`${intent.name} hit slot ${target.slotNumber} for ${incoming} Overrun; ${prevented} blocked, ${applied} applied.`);
    if (result.message) log.push(result.message);
  };
  const applyPrepLoss = (targetIndex: number, amount: number) => {
    const target = slots[targetIndex];
    if (!target || target.destroyed || amount <= 0) return;
    const lost = Math.min(target.preparation, amount);
    target.preparation -= lost;
    log.push(`${intent.name} removed ${lost} Preparation from slot ${target.slotNumber}.`);
  };
  const applyBlockOpening = (targetIndex: number) => {
    const target = slots[targetIndex];
    if (!target || target.destroyed) return;
    if (!blockedOpeningSlotIndexes.includes(targetIndex)) blockedOpeningSlotIndexes.push(targetIndex);
    log.push(`${intent.name} blocked slot ${target.slotNumber} from opening next turn.`);
  };
  const applyBlockPreparation = (targetIndex: number) => {
    const target = slots[targetIndex];
    if (!target || target.destroyed) return;
    if (!blockedPreparationSlotIndexes.includes(targetIndex)) blockedPreparationSlotIndexes.push(targetIndex);
    log.push(`${intent.name} blocked Preparation at slot ${target.slotNumber} next turn.`);
  };

  const effects: ForestAttackEffect[] = intent.effects?.length
    ? intent.effects
    : [{ type: "damage", amount: intent.power, target: intent.targetRule === "everyExposed" ? "allExposedStructures" : "oneExposedStructure" }];

  for (const effect of effects) {
    const targetIndexes = getForestEffectTargetIndexes(workingState(), effect.target);
    rememberTargets(targetIndexes);

    if (targetIndexes.length === 0) {
      log.push(`${intent.name} found no valid target for ${effect.type}.`);
      continue;
    }

    if (effect.type === "damage") {
      targetIndexes.forEach((targetIndex, position) => {
        const amount = position > 0 && effect.adjacentAmount !== undefined ? effect.adjacentAmount : effect.amount;
        applyDamage(targetIndex, amount);
      });
    }

    if (effect.type === "prepLoss") {
      targetIndexes.forEach((targetIndex) => applyPrepLoss(targetIndex, effect.amount));
    }

    if (effect.type === "blockOpening") {
      targetIndexes.slice(0, effect.amount).forEach(applyBlockOpening);
    }

    if (effect.type === "blockPrep") {
      targetIndexes.slice(0, effect.amount).forEach(applyBlockPreparation);
    }
  }

  const budget = Math.max(0, state.budget - budgetLost);
  const rebuildIndex = destroyedIndexes.length ? Math.min(...destroyedIndexes) : null;
  if (rebuildIndex !== null) {
    for (let i = rebuildIndex; i < slots.length; i++) {
      slots[i] = {
        ...slots[i],
        preparation: 0,
        overrun: i === rebuildIndex ? slots[i].overrun : 0,
        reinforce: 0,
        completed: false,
        destroyed: i === rebuildIndex,
        needsRebuild: i === rebuildIndex,
      };
    }
    log.push(`Construction regressed to slot ${slots[rebuildIndex].slotNumber}; rebuild it through Preparation.`);
  }
  const repeatedForestAttackCount = intent.id === state.previousForestAttackId
    ? state.repeatedForestAttackCount + 1
    : 1;
  const nextCooldowns = {
    ...state.forestCooldowns,
    ...(intent.cooldown > 0 ? { [intent.id]: intent.cooldown } : {}),
  };

  return applyForestWeatherGains({
    ...state,
    slots,
    budget,
    forestCooldowns: nextCooldowns,
    previousIntentIndex: state.currentIntentIndex,
    previousForestAttackId: intent.id,
    repeatedForestAttackCount,
    previousForestTargetIndexes: allTargetIndexes,
    blockedOpeningSlotIndexes,
    blockedPreparationSlotIndexes,
    activeSlotIndex: rebuildIndex ?? state.activeSlotIndex,
    phase: budget <= 0 ? "lost" : state.phase,
    log,
  }, intent);
}

export function endTurn(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== "playing") return state;

  let next: GameState = {
    ...state,
    forestFsmState: "Resolve",
    hand: state.hand
      .filter((instance) => state.retainHandOnEndTurn || CARDS[instance.cardId]?.retain)
      .map((instance) => ({ ...instance, heldTurns: instance.heldTurns + 1 })),
    discardPile: [
      ...state.discardPile,
      ...state.hand
        .filter((instance) => !state.retainHandOnEndTurn && !CARDS[instance.cardId]?.retain)
        .map((instance) => ({ ...instance, heldTurns: 0 })),
    ],
    log: [...state.log, "Player turn ended."],
  };

  next = resolveForest(next);
  next = { ...next, forestFsmState: "Advance" };
  next = reduceCooldowns(next, getCurrentIntent(next).id);
  const clearedSlots = cloneSlots(next.slots).map((slot) => ({
    ...slot,
    preparedLastTurn: slot.preparedThisTurn,
    preparedThisTurn: false,
    reinforce: 0,
  }));
  const nextTurn = next.currentTurn + 1;
  if (next.turnLimit && nextTurn > next.turnLimit && next.phase === "playing") {
    return {
      ...next,
      slots: clearedSlots,
      currentTurn: nextTurn,
      forestFsmState: "Advance",
      phase: "lost",
      log: [...next.log, `Deadline missed after turn ${next.turnLimit}.`],
    };
  }

  next = {
    ...next,
    slots: clearedSlots,
    currentTurn: nextTurn,
    currentMH: next.maxMH + next.nextTurnMhBonus,
    currentIntentIndex: chooseNextIntentIndex({ ...next, slots: clearedSlots, currentTurn: nextTurn }, rng),
    forestFsmState: "Player Turn",
    cardsPlayedThisTurn: 0,
    completionsThisTurn: 0,
    retainHandOnEndTurn: false,
    nextTurnMhBonus: 0,
    log: [...next.log, `Turn ${nextTurn} begins.`],
  };
  return drawToHandSize(next, rng);
}

export function chooseReward(state: GameState, cardId: CardId): GameState {
  if (state.phase !== "reward" || state.rewardCardChosen || !state.rewardOptions.includes(cardId)) return state;
  const instance: CardInstance = { cardId, instanceId: `${cardId}-reward-${Date.now()}`, heldTurns: 0 };
  return {
    ...state,
    deck: [...state.deck, instance],
    discardPile: [...state.discardPile, instance],
    rewardOptions: [],
    rewardCardChosen: true,
    phase: state.rewardColumnChosen ? "crafting" : "reward",
    log: [...state.log, `Added ${CARDS[cardId]?.name ?? cardId} to the discard pile.`],
  };
}

export function chooseColumnReward(state: GameState, columnId: ColumnId): GameState {
  if (state.phase !== "reward" || state.rewardColumnChosen || !state.columnRewardOptions.includes(columnId)) return state;
  const column = COLUMN_BY_ID[columnId];
  if (!column) return state;
  return {
    ...state,
    availableColumns: [...state.availableColumns, columnId],
    columnRewardOptions: [],
    rewardColumnChosen: true,
    phase: state.rewardCardChosen ? "crafting" : "reward",
    log: [...state.log, `Added ${column.name} to available column designs.`],
  };
}

export function addCraftingCard(state: GameState, pool: "inspired" | "experimental"): GameState {
  if (state.phase !== "crafting") return state;
  const card = craftingPool(pool)[0];
  if (!card) return state;
  const instance: CardInstance = { cardId: card.id, instanceId: `${card.id}-craft-${Date.now()}`, heldTurns: 0 };
  return {
    ...state,
    deck: [...state.deck, instance],
    discardPile: [...state.discardPile, instance],
    log: [...state.log, `Crafting added ${card.name}.`],
  };
}

export function addColumnDesign(state: GameState): GameState {
  if (state.phase !== "crafting") return state;
  const nextColumn = COLUMNS.find((column) => column.unlockable && !state.availableColumns.includes(column.id));
  if (!nextColumn) return state;
  return {
    ...state,
    availableColumns: [...state.availableColumns, nextColumn.id],
    log: [...state.log, `Unlocked ${nextColumn.name}.`],
  };
}

export function requestFunding(state: GameState, optionId: string): GameState {
  if (state.phase !== "crafting") return state;
  const option = GAME_CONFIG.fundingOptions.find((item) => item.id === optionId);
  if (!option) return state;
  return {
    ...state,
    budget: state.budget + option.budget,
    turnLimit: option.nextRoomTurnLimit,
    log: [...state.log, `Funding request approved: +${option.budget} Budget, next room deadline ${option.nextRoomTurnLimit} turns.`],
  };
}

export function getSelectableRouteNodeIds(state: GameState): string[] {
  const direct = getSelectableMapNodeIds(state.runMap, state.currentMapNodeId, state.completedMapNodeIds);
  return [...new Set([...direct, ...state.unlockedMapNodeIds])];
}

export function selectRouteNode(state: GameState, nodeId: string): GameState {
  if (state.phase !== "crafting" && state.phase !== "reward") return state;
  if (!state.completedMapNodeIds.includes(state.currentMapNodeId)) return state;
  const node = getRunMapNode(state.runMap, nodeId);
  if (!node) return state;
  const selectableIds = getSelectableRouteNodeIds(state);
  if (!selectableIds.includes(nodeId)) return state;
  return {
    ...state,
    selectedMapNodeId: nodeId,
    log: [...state.log, `Selected route node ${node.label}.`],
  };
}

export function removeCardFromRun(state: GameState, instanceId: string): GameState {
  if (state.phase !== "crafting" || state.removalsAvailable <= 0) return state;
  const removeFrom = (pile: CardInstance[]) => pile.filter((card) => card.instanceId !== instanceId);
  const allBefore = state.hand.length + state.drawPile.length + state.discardPile.length;
  const next = {
    ...state,
    deck: removeFrom(state.deck),
    hand: removeFrom(state.hand),
    drawPile: removeFrom(state.drawPile),
    discardPile: removeFrom(state.discardPile),
  };
  const allAfter = next.hand.length + next.drawPile.length + next.discardPile.length;
  if (allAfter === allBefore) return state;
  return {
    ...next,
    removalsAvailable: state.removalsAvailable - 1,
    log: [...state.log, "Removed a card from the run."],
  };
}

export function startNextRoom(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== "crafting") return state;
  const selectedNode = getRunMapNode(state.runMap, state.selectedMapNodeId);
  if (!selectedNode) return { ...state, log: [...state.log, "Choose the next railway alignment on the Map before starting the room."] };
  if (selectedNode.kind === "end") {
    return {
      ...state,
      currentMapNodeId: selectedNode.id,
      selectedMapNodeId: null,
      completedMapNodeIds: state.completedMapNodeIds.includes(selectedNode.id)
        ? state.completedMapNodeIds
        : [...state.completedMapNodeIds, selectedNode.id],
      phase: "won",
      log: [...state.log, "Parth reached the Ooty railhead. Alignment complete."],
    };
  }
  const nextRoomIndex = state.currentRoomIndex + 1;
  const room = generateRoomFromMapNode(state.runMap, selectedNode.id, nextRoomIndex + 1, state.forestWeather);
  const encounter = chooseForestAttackSet(room, nextRoomIndex, state, rng);

  const deck = shuffle([...state.hand, ...state.drawPile, ...state.discardPile].map((card) => ({ ...card, heldTurns: 0 })), rng);
  const base: GameState = {
    ...state,
    currentRoom: room,
    currentMapNodeId: selectedNode.id,
    selectedMapNodeId: null,
    currentRoomDifficultyMultiplier: room.difficultyMultiplier ?? 1,
    currentRoomIndex: nextRoomIndex,
    roomNumber: nextRoomIndex + 1,
    currentTurn: 1,
    currentMH: state.maxMH,
    turnLimit: state.turnLimit ? Math.max(3, Math.floor(state.turnLimit / (room.difficultyMultiplier ?? 1))) : null,
    activeSlotIndex: 0,
    slots: buildSlots(room, state.availableColumns[0]),
    deck,
    drawPile: deck,
    discardPile: [],
    hand: [],
    currentIntentIndex: 0,
    forestEnemyId: encounter.enemyId,
    forestEnemyName: encounter.enemyName,
    forestAttackSetId: encounter.attackSetId,
    forestAttackSetName: encounter.attackSetName,
    previousIntentIndex: null,
    previousForestAttackId: null,
    repeatedForestAttackCount: 0,
    previousForestTargetIndexes: [],
    forestCooldowns: {},
    blockedOpeningSlotIndexes: [],
    blockedPreparationSlotIndexes: [],
    forestFsmState: "Player Turn",
    cardsPlayedThisTurn: 0,
    completionsThisTurn: 0,
    retainHandOnEndTurn: false,
    nextTurnMhBonus: 0,
    phase: "playing",
    rewardOptions: [],
    columnRewardOptions: [],
    rewardCardChosen: false,
    rewardColumnChosen: false,
    removalsAvailable: 0,
    log: [...state.log, `${room.name} begins. Room difficulty ${room.difficultyMultiplier?.toFixed(2) ?? "1.00"}x. Forest: ${encounter.enemyName} - ${encounter.attackSetName}.`],
  };
  return drawToHandSize({ ...base, currentIntentIndex: chooseNextIntentIndex(base, rng) }, rng);
}

function rebuildRunMapState(state: GameState, seed: number): GameState {
  const runMap = generateRunMap(seed);
  const firstNodeId = getRunMapNode(runMap, runMap.startNodeId)?.outgoing[0] ?? runMap.startNodeId;
  const room = generateRoomFromMapNode(runMap, firstNodeId, 1, state.forestWeather);
  const encounter = chooseForestAttackSet(room, 0, state, Math.random);
  const base: GameState = {
    ...state,
    mapSeed: seed,
    runMap,
    currentRoom: room,
    currentMapNodeId: firstNodeId,
    selectedMapNodeId: null,
    completedMapNodeIds: [runMap.startNodeId],
    unlockedMapNodeIds: [],
    currentRoomIndex: 0,
    roomNumber: 1,
    currentTurn: 1,
    currentRoomDifficultyMultiplier: room.difficultyMultiplier ?? 1,
    activeSlotIndex: 0,
    slots: buildSlots(room, state.availableColumns[0]),
    forestEnemyId: encounter.enemyId,
    forestEnemyName: encounter.enemyName,
    forestAttackSetId: encounter.attackSetId,
    forestAttackSetName: encounter.attackSetName,
    currentIntentIndex: 0,
    previousIntentIndex: null,
    previousForestAttackId: null,
    repeatedForestAttackCount: 0,
    previousForestTargetIndexes: [],
    forestCooldowns: {},
    blockedOpeningSlotIndexes: [],
    blockedPreparationSlotIndexes: [],
    phase: "playing",
    log: [...state.log, `Debug: regenerated map seed ${seed}. Validation ${runMap.validation.valid ? "passed" : "failed"}. Forest: ${encounter.enemyName} - ${encounter.attackSetName}.`],
  };
  return { ...base, currentIntentIndex: chooseNextIntentIndex(base) };
}

export function debugRegenerateRunMap(state: GameState): GameState {
  return rebuildRunMapState(state, state.mapSeed + 1);
}

export function debugRegenerateRunMapSameSeed(state: GameState): GameState {
  return rebuildRunMapState(state, state.mapSeed);
}

export function debugUnlockAllRouteNodes(state: GameState): GameState {
  return {
    ...state,
    unlockedMapNodeIds: state.runMap.nodes.map((node) => node.id),
    log: [...state.log, "Debug: all map nodes unlocked for selection."],
  };
}

export function debugTeleportRouteNode(state: GameState, nodeId: string): GameState {
  const node = getRunMapNode(state.runMap, nodeId);
  if (!node) return state;
  if (node.kind === "end") {
    return { ...state, currentMapNodeId: node.id, selectedMapNodeId: null, phase: "won", log: [...state.log, `Debug: teleported to ${node.label}.`] };
  }
  const roomNumber = Math.max(1, node.depth);
  const room = generateRoomFromMapNode(state.runMap, node.id, roomNumber, state.forestWeather);
  const encounter = chooseForestAttackSet(room, roomNumber - 1, state, Math.random);
  const base: GameState = {
    ...state,
    currentRoom: room,
    currentMapNodeId: node.id,
    selectedMapNodeId: null,
    currentRoomIndex: roomNumber - 1,
    roomNumber,
    currentTurn: 1,
    currentRoomDifficultyMultiplier: room.difficultyMultiplier ?? 1,
    activeSlotIndex: 0,
    slots: buildSlots(room, state.availableColumns[0]),
    forestEnemyId: encounter.enemyId,
    forestEnemyName: encounter.enemyName,
    forestAttackSetId: encounter.attackSetId,
    forestAttackSetName: encounter.attackSetName,
    currentIntentIndex: 0,
    previousIntentIndex: null,
    previousForestAttackId: null,
    repeatedForestAttackCount: 0,
    previousForestTargetIndexes: [],
    forestCooldowns: {},
    blockedOpeningSlotIndexes: [],
    blockedPreparationSlotIndexes: [],
    phase: "playing",
    log: [...state.log, `Debug: teleported to ${node.label}. Forest: ${encounter.enemyName} - ${encounter.attackSetName}.`],
  };
  return { ...base, currentIntentIndex: chooseNextIntentIndex(base) };
}

export function debugPrintRunMap(state: GameState): GameState {
  return {
    ...state,
    log: [...state.log, `Debug graph: ${describeRunMap(state.runMap)}`],
  };
}

export function debugPrintRunMapPathLengths(state: GameState): GameState {
  return {
    ...state,
    log: [...state.log, `Debug path room counts: ${getMapPathRoomCounts(state.runMap).join(", ")}`],
  };
}

export function debugAddBudget(state: GameState, amount = 5): GameState {
  return { ...state, budget: state.budget + amount, log: [...state.log, `Debug: +${amount} Budget.`] };
}

export function debugAddMh(state: GameState, amount = 1): GameState {
  return { ...state, currentMH: state.currentMH + amount, log: [...state.log, `Debug: +${amount} MH.`] };
}

export function debugDrawCard(state: GameState): GameState {
  return drawCards(state, 1);
}

export function debugForceIntent(state: GameState, eventId: string): GameState {
  const index = FOREST_EVENTS.findIndex((event) => event.id === eventId);
  if (index < 0) return state;
  const event = FOREST_EVENTS[index];
  return {
    ...state,
    currentIntentIndex: index,
    forestEnemyId: event.enemyId ?? state.forestEnemyId,
    forestEnemyName: event.enemyName ?? state.forestEnemyName,
    forestAttackSetId: event.attackSetId ?? state.forestAttackSetId,
    forestAttackSetName: event.attackSetName ?? state.forestAttackSetName,
    log: [...state.log, `Debug: forced ${event.name}.`],
  };
}

export function debugChangePreparation(state: GameState, amount: number): GameState {
  const slots = cloneSlots(state.slots);
  const slot = slots[state.activeSlotIndex];
  if (!slot) return state;
  slot.preparation = Math.max(0, slot.preparation + amount);
  return { ...state, slots, log: [...state.log, `Debug: changed active Preparation by ${amount}.`] };
}

export function debugChangeOverrun(state: GameState, slotIndex: number, amount: number): GameState {
  const slots = cloneSlots(state.slots);
  const slot = slots[slotIndex];
  if (!slot) return state;
  slot.overrun = Math.max(0, Math.min(slot.allocation, slot.overrun + amount));
  return { ...state, slots, log: [...state.log, `Debug: changed slot ${slot.slotNumber} Overrun by ${amount}.`] };
}

export function debugChangeForestWeather(state: GameState, key: "wet" | "windy", amount: number): GameState {
  const forestWeather = {
    ...state.forestWeather,
    [key]: Math.max(0, Math.min(3, state.forestWeather[key] + amount)),
  };
  return {
    ...state,
    forestWeather,
    log: [...state.log, `Debug: ${key === "wet" ? "Wet" : "Windy"} changed by ${amount}.`],
  };
}

export function restartRoom(state: GameState): GameState {
  const room = generateRoomFromMapNode(state.runMap, state.currentMapNodeId, state.roomNumber, state.forestWeather);
  const encounter = chooseForestAttackSet(room, state.currentRoomIndex, state, Math.random);
  const base: GameState = {
    ...state,
    currentRoom: room,
    currentTurn: 1,
    currentMH: state.maxMH,
    activeSlotIndex: 0,
    slots: buildSlots(room, state.availableColumns[0]),
    currentIntentIndex: 0,
    forestEnemyId: encounter.enemyId,
    forestEnemyName: encounter.enemyName,
    forestAttackSetId: encounter.attackSetId,
    forestAttackSetName: encounter.attackSetName,
    previousIntentIndex: null,
    previousForestAttackId: null,
    repeatedForestAttackCount: 0,
    previousForestTargetIndexes: [],
    forestCooldowns: {},
    blockedOpeningSlotIndexes: [],
    blockedPreparationSlotIndexes: [],
    forestFsmState: "Player Turn",
    cardsPlayedThisTurn: 0,
    completionsThisTurn: 0,
    retainHandOnEndTurn: false,
    nextTurnMhBonus: 0,
    phase: "playing",
    rewardOptions: [],
    columnRewardOptions: [],
    rewardCardChosen: false,
    rewardColumnChosen: false,
    log: [...state.log, "Debug: room restarted."],
  };
  return { ...base, currentIntentIndex: chooseNextIntentIndex(base) };
}
