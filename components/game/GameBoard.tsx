"use client";

import { useEffect, useRef, useState } from "react";
import { CARDS } from "@/lib/game/cards";
import { canPlayCard, createInitialState, endTurn, playCard } from "@/lib/game/engine";
import { CardId, GameState, LevelDefinition } from "@/lib/game/types";
import { TERRAIN_COLORS } from "@/lib/game/terrainStyle";

const CELL = 48;

type Props = { level: LevelDefinition };

export function GameBoard({ level }: Props) {
  const [state, setState] = useState<GameState>(() => createInitialState(level));
  const [selected, setSelected] = useState<CardId | null>(null);
  // Cells that briefly flash after a disaster resolves — a lightweight
  // stand-in for real physics/particles, cheap enough to run on canvas.
  const [flash, setFlash] = useState<{ x: number; y: number; destroyed: boolean }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setState(createInitialState(level));
    setSelected(null);
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = level.width * CELL;
    canvas.height = level.height * CELL;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    state.grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        const px = x * CELL, py = y * CELL;
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain];
        ctx.fillRect(px, py, CELL - 2, CELL - 2);

        // Valid-placement outline for the currently selected card.
        if (selected && canPlayCard(state, selected, x, y)) {
          ctx.strokeStyle = "#7A9B76";
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, CELL - 4, CELL - 4);
        }

        if (tile.structure) {
          const card = CARDS[tile.structure.cardId];
          ctx.fillStyle = "#C08552";
          ctx.fillRect(px + 8, py + 8, CELL - 18, CELL - 18);
          const pct = tile.structure.health / tile.structure.maxHealth;
          ctx.fillStyle = pct > 0.5 ? "#7A9B76" : "#C0654F";
          ctx.fillRect(px + 8, py + CELL - 14, (CELL - 18) * pct, 4);
          void card;
        }

        const flashed = flash.find((f) => f.x === x && f.y === y);
        if (flashed) {
          ctx.fillStyle = flashed.destroyed ? "rgba(192,101,79,0.55)" : "rgba(192,101,79,0.3)";
          ctx.fillRect(px, py, CELL - 2, CELL - 2);
        }
      });
    });
  }, [state, selected, flash, level]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!selected) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * level.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * level.height);
    if (canPlayCard(state, selected, x, y)) {
      setState((s) => playCard(s, selected, x, y));
      setSelected(null);
    }
  }

  function handleEndTurn() {
    const next = endTurn(state);
    setState(next);
    if (next.lastDisaster) {
      const { hitCells, destroyedCells } = next.lastDisaster;
      setFlash(hitCells.map((c) => ({ ...c, destroyed: destroyedCells.some((d) => d.x === c.x && d.y === c.y) })));
      setTimeout(() => setFlash([]), 600);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div className="flex flex-col items-start gap-3">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`border border-hairline ${selected ? "cursor-pointer" : "cursor-default"}`}
        />
        <div className="elevation-label">
          Turn {state.turn} · Focus {state.focus}/{state.maxFocus}
        </div>
        {state.outcome !== "playing" && (
          <div className={`text-sm font-medium ${state.outcome === "won" ? "text-moss" : "text-danger"}`}>
            {state.outcome === "won" ? "Crossing complete." : "The forest wins this round."}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div>
          <div className="elevation-label mb-2">Hand</div>
          <div className="flex flex-wrap gap-2">
            {state.hand.map((cardId, i) => {
              const card = CARDS[cardId];
              const affordable = state.focus >= card.cost;
              return (
                <button
                  key={`${cardId}-${i}`}
                  disabled={!affordable || state.outcome !== "playing"}
                  onClick={() => setSelected(selected === cardId ? null : cardId)}
                  className={`w-36 rounded-sm border p-2 text-left text-xs transition-colors disabled:opacity-40
                    ${selected === cardId ? "border-moss bg-moss/10" : "border-hairline bg-surface hover:bg-surface2"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-mist">{card.name}</span>
                    <span className="font-mono text-brass">{card.cost}</span>
                  </div>
                  <p className="mt-1 text-muted">{card.description}</p>
                  <div className="mt-1 font-mono text-[10px] text-muted">HP {card.health}{card.armor ? ` · Armor ${card.armor}` : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleEndTurn}
          disabled={state.outcome !== "playing"}
          className="self-start rounded-sm border border-brass px-4 py-2 text-sm text-brass hover:bg-brass/10 disabled:opacity-40"
        >
          End turn
        </button>

        <div className="flex-1 overflow-auto rounded-sm border border-hairline bg-surface p-3">
          <div className="elevation-label mb-2">Log</div>
          <ul className="space-y-1 text-xs text-muted">
            {state.log.slice(-8).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
