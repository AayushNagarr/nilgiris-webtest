import { LevelDefinition, TerrainType } from "./types";

function makeCrossingLevel(
  id: string,
  name: string,
  width: number,
  height: number,
  chasmCols: number[]
): LevelDefinition {
  const startY = Math.floor(height / 2);
  const terrain: TerrainType[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TerrainType[] = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 && y === startY) row.push("start");
      else if (x === width - 1 && y === startY) row.push("end");
      else if (chasmCols.includes(x)) row.push("chasm");
      else if (y === 0 || y === height - 1) row.push("forestEdge");
      else row.push("ground");
    }
    terrain.push(row);
  }
  return { id, name, width, height, terrain };
}

/** A blank canvas for the Level Editor — all ground, ready to paint. */
export function blankLevel(id: string, name: string, width = 7, height = 5): LevelDefinition {
  return {
    id,
    name,
    width,
    height,
    terrain: Array.from({ length: height }, () => Array.from({ length: width }, (): TerrainType => "ground")),
  };
}

export const LEVELS: LevelDefinition[] = [
  makeCrossingLevel("tea-estate-ridge", "Tea Estate Ridge", 7, 5, [2, 3, 4]),
  makeCrossingLevel("mist-valley-crossing", "Mist Valley Crossing", 9, 5, [3, 4, 5, 6]),
  blankLevel("shola-forest-descent", "Shola Forest Descent"),
];
