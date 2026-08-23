import { CARDS, starterDeck } from "./cards";
import { computeDisasterTargets, rollDisaster, DISASTER_NAMES } from "./disasters";
import {
  CardId, DisasterEvent, Grid, GameState, LevelDefinition, Tile,
} from "./types";

const HAND_SIZE = 4;
const MAX_FOCUS = 3;
const MAX_TURNS = 10;

function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildGrid(level: LevelDefinition): Grid {
  return level.terrain.map((row) =>
    row.map((terrain): Tile => ({ terrain, structure: null }))
  );
}

export function createInitialState(
  level: LevelDefinition,
  deck: CardId[] = starterDeck(),
  rng: () => number = Math.random
): GameState {
  const shuffled = shuffle(deck, rng);
  const hand = shuffled.slice(0, HAND_SIZE);
  const remaining = shuffled.slice(HAND_SIZE);
  return {
    level,
    grid: buildGrid(level),
    deck: remaining,
    hand,
    discard: [],
    focus: MAX_FOCUS,
    maxFocus: MAX_FOCUS,
    turn: 1,
    outcome: "playing",
    log: [`Turn 1 — build a crossing before the forest reclaims it.`],
    lastDisaster: null,
  };
}

export function canPlayCard(state: GameState, cardId: CardId, x: number, y: number): boolean {
  if (state.outcome !== "playing") return false;
  if (!state.hand.includes(cardId)) return false;
  const card = CARDS[cardId];
  if (state.focus < card.cost) return false;
  const tile = state.grid[y]?.[x];
  if (!tile || tile.structure) return false;
  return card.validTerrain.includes(tile.terrain);
}

export function playCard(state: GameState, cardId: CardId, x: number, y: number): GameState {
  if (!canPlayCard(state, cardId, x, y)) return state;
  const card = CARDS[cardId];

  const grid = state.grid.map((row) => row.map((t) => ({ ...t })));
  grid[y][x].structure = { cardId, health: card.health, maxHealth: card.health };

  const handIdx = state.hand.indexOf(cardId);
  const hand = [...state.hand.slice(0, handIdx), ...state.hand.slice(handIdx + 1)];

  return {
    ...state,
    grid,
    hand,
    discard: [...state.discard, cardId],
    focus: state.focus - card.cost,
    log: [...state.log, `Placed ${card.name} at (${x}, ${y}).`],
  };
}

/** Flat armor a given cell benefits from: its own card's armor + any adjacent watchtower aura. */
function armorAt(grid: Grid, x: number, y: number): number {
  const tile = grid[y]?.[x];
  if (!tile?.structure) return 0;
  let armor = CARDS[tile.structure.cardId].armor ?? 0;
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dy] of deltas) {
    const neighbor = grid[y + dy]?.[x + dx];
    if (neighbor?.structure) {
      const aura = CARDS[neighbor.structure.cardId].aura;
      if (aura && aura.radius >= 1) armor += aura.armor;
    }
  }
  return armor;
}

function resolveDisaster(state: GameState, rng: () => number): { grid: Grid; event: DisasterEvent } {
  const disasterId = rollDisaster(rng);
  const targets = computeDisasterTargets(disasterId, state.grid, state.level, rng);

  const grid = state.grid.map((row) => row.map((t) => ({ ...t, structure: t.structure ? { ...t.structure } : null })));
  const destroyed: { x: number; y: number }[] = [];

  for (const t of targets) {
    const tile = grid[t.y][t.x];
    if (!tile.structure) continue;
    const dmg = Math.max(0, t.damage - armorAt(state.grid, t.x, t.y));
    tile.structure.health -= dmg;
    if (tile.structure.health <= 0) {
      tile.structure = null;
      destroyed.push({ x: t.x, y: t.y });
    }
  }

  return {
    grid,
    event: {
      disasterId,
      name: DISASTER_NAMES[disasterId],
      hitCells: targets.map(({ x, y }) => ({ x, y })),
      destroyedCells: destroyed,
    },
  };
}

/** BFS from the level's start tile to see if a passable route reaches the end tile. */
export function hasCrossing(grid: Grid): boolean {
  let start: { x: number; y: number } | null = null;
  grid.forEach((row, y) => row.forEach((t, x) => { if (t.terrain === "start") start = { x, y }; }));
  if (!start) return false;

  const passable = (x: number, y: number) => {
    const t = grid[y]?.[x];
    if (!t) return false;
    if (t.terrain === "start" || t.terrain === "end" || t.terrain === "ground") return true;
    if (t.terrain === "chasm") return !!t.structure;
    return false; // forestEdge is never passable
  };

  const seen = new Set<string>();
  const queue = [start as { x: number; y: number }];
  while (queue.length) {
    const cur = queue.shift()!;
    const key = `${cur.x},${cur.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tile = grid[cur.y]?.[cur.x];
    if (tile?.terrain === "end") return true;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (passable(nx, ny) && !seen.has(`${nx},${ny}`)) queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

export function endTurn(state: GameState, rng: () => number = Math.random): GameState {
  if (state.outcome !== "playing") return state;

  const { grid, event } = resolveDisaster(state, rng);
  const log = [...state.log, `${event.name} struck ${event.hitCells.length} tile(s), destroyed ${event.destroyedCells.length}.`];

  if (hasCrossing(grid)) {
    return { ...state, grid, lastDisaster: event, outcome: "won", log: [...log, "The crossing holds — Nilgiris is through."] };
  }

  const nextTurn = state.turn + 1;
  if (nextTurn > MAX_TURNS) {
    return { ...state, grid, lastDisaster: event, outcome: "lost", log: [...log, "The forest reclaims the crossing. Out of turns."] };
  }

  // Refill hand, reshuffling discard back into the deck if it runs dry.
  let deck = state.deck;
  let discard = state.discard;
  const needed = HAND_SIZE - state.hand.length;
  if (needed > deck.length) {
    deck = shuffle([...deck, ...discard], rng);
    discard = [];
  }
  const drawn = deck.slice(0, needed);
  deck = deck.slice(needed);

  return {
    ...state,
    grid,
    hand: [...state.hand, ...drawn],
    deck,
    discard,
    focus: state.maxFocus,
    turn: nextTurn,
    lastDisaster: event,
    outcome: "playing",
    log: [...log, `Turn ${nextTurn} begins.`],
  };
}

export { MAX_TURNS, MAX_FOCUS, HAND_SIZE };
