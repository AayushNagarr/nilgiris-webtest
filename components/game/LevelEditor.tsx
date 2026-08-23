"use client";

import { useState } from "react";
import { LevelDefinition, TerrainType } from "@/lib/game/types";
import { TERRAIN_COLORS, TERRAIN_LABELS } from "@/lib/game/terrainStyle";

const PALETTE: TerrainType[] = ["ground", "chasm", "forestEdge", "start", "end"];

type Props = {
  level: LevelDefinition;
  onChange: (level: LevelDefinition) => void;
};

/**
 * Grid-paint level editor. Click a terrain type, then click/drag across
 * cells to paint. "start" and "end" are singletons — placing a new one
 * moves the old one rather than creating a second.
 */
export function LevelEditor({ level, onChange }: Props) {
  const [brush, setBrush] = useState<TerrainType>("chasm");
  const [painting, setPainting] = useState(false);

  function paint(x: number, y: number) {
    const terrain = level.terrain.map((row) => [...row]);
    if (brush === "start" || brush === "end") {
      // Singleton tiles: clear any existing instance first.
      for (let yy = 0; yy < level.height; yy++) {
        for (let xx = 0; xx < level.width; xx++) {
          if (terrain[yy][xx] === brush) terrain[yy][xx] = "ground";
        }
      }
    }
    terrain[y][x] = brush;
    onChange({ ...level, terrain });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((t) => (
          <button
            key={t}
            onClick={() => setBrush(t)}
            className={`flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs
              ${brush === t ? "border-moss text-moss" : "border-hairline text-muted hover:text-mist"}`}
          >
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: TERRAIN_COLORS[t] }} />
            {TERRAIN_LABELS[t]}
          </button>
        ))}
      </div>

      <div
        className="inline-grid select-none gap-[2px] bg-hairline p-[2px]"
        style={{ gridTemplateColumns: `repeat(${level.width}, 28px)` }}
        onMouseLeave={() => setPainting(false)}
        onMouseUp={() => setPainting(false)}
      >
        {level.terrain.map((row, y) =>
          row.map((terrain, x) => (
            <div
              key={`${x}-${y}`}
              onMouseDown={() => { setPainting(true); paint(x, y); }}
              onMouseEnter={() => painting && paint(x, y)}
              className="h-7 w-7 cursor-pointer transition-colors"
              style={{ backgroundColor: TERRAIN_COLORS[terrain] }}
              title={`${x}, ${y} — ${TERRAIN_LABELS[terrain]}`}
            />
          ))
        )}
      </div>
      <p className="text-xs text-muted">
        Click and drag to paint. Every level needs exactly one Start and one End tile —
        the player wins by connecting them across the chasm.
      </p>
    </div>
  );
}
