import { DisasterId, Grid, LevelDefinition } from "./types";

export const DISASTER_NAMES: Record<DisasterId, string> = {
  "flash-flood": "Flash Flood",
  windstorm: "Windstorm",
  rockslide: "Rockslide",
};

type Target = { x: number; y: number; damage: number };

function forestEdgeCells(level: LevelDefinition): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.terrain[y][x] === "forestEdge") cells.push({ x, y });
    }
  }
  return cells;
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Every structure currently on the grid, with its coordinates. */
function structureCells(grid: Grid) {
  const cells: { x: number; y: number }[] = [];
  grid.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile.structure) cells.push({ x, y });
    })
  );
  return cells;
}

export function rollDisaster(rng: () => number = Math.random): DisasterId {
  const ids: DisasterId[] = ["flash-flood", "windstorm", "rockslide"];
  return ids[Math.floor(rng() * ids.length)];
}

/**
 * Computes which cells a disaster hits and how hard, given the current
 * grid and level layout. Doesn't mutate anything — engine.ts applies
 * armor and health changes afterward.
 */
export function computeDisasterTargets(
  disasterId: DisasterId,
  grid: Grid,
  level: LevelDefinition,
  rng: () => number = Math.random
): Target[] {
  const edges = forestEdgeCells(level);
  const structures = structureCells(grid);
  if (structures.length === 0) return [];

  switch (disasterId) {
    case "flash-flood": {
      // Chasm structures near a random forest edge take on flood damage.
      if (edges.length === 0) return [];
      const source = edges[Math.floor(rng() * edges.length)];
      return structures
        .filter((c) => manhattan(c, source) <= 2)
        .map((c) => ({ ...c, damage: 2 }));
    }
    case "windstorm": {
      // 1-3 random structures anywhere take light wind damage.
      const count = Math.min(structures.length, 1 + Math.floor(rng() * 3));
      const shuffled = [...structures].sort(() => rng() - 0.5);
      return shuffled.slice(0, count).map((c) => ({ ...c, damage: 1 }));
    }
    case "rockslide": {
      // A line of up to 3 cells from a forest edge takes heavy damage.
      if (edges.length === 0) return [];
      const source = edges[Math.floor(rng() * edges.length)];
      const horizontal = rng() < 0.5;
      const line: { x: number; y: number }[] = [];
      for (let i = 0; i < 3; i++) {
        line.push(
          horizontal ? { x: source.x + i, y: source.y } : { x: source.x, y: source.y + i }
        );
      }
      return structures
        .filter((c) => line.some((l) => l.x === c.x && l.y === c.y))
        .map((c) => ({ ...c, damage: 3 }));
    }
  }
}
