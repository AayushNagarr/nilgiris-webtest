"use client";

import { useState } from "react";
import { LEVELS } from "@/lib/game/levels";
import { LevelDefinition } from "@/lib/game/types";
import { LevelEditor } from "@/components/game/LevelEditor";
import { GameBoard } from "@/components/game/GameBoard";

type Tab = "edit" | "playtest";

export default function BuilderPage() {
  const [levels, setLevels] = useState<LevelDefinition[]>(LEVELS);
  const [selectedId, setSelectedId] = useState(levels[0].id);
  const [tab, setTab] = useState<Tab>("edit");
  const selected = levels.find((l) => l.id === selectedId)!;

  function updateSelectedLevel(next: LevelDefinition) {
    setLevels((prev) => prev.map((l) => (l.id === next.id ? next : l)));
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col md:flex-row">
      <aside className="border-b border-hairline bg-surface md:w-64 md:border-b-0 md:border-r">
        <div className="elevation-label px-4 py-3">Levels</div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-4">
          {levels.map((level, i) => (
            <button
              key={level.id}
              onClick={() => setSelectedId(level.id)}
              className={`flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors md:w-full
                ${level.id === selectedId ? "bg-moss/15 text-moss" : "text-muted hover:bg-surface2 hover:text-mist"}`}
            >
              <span className="font-mono text-xs opacity-60">{String(i + 1).padStart(2, "0")}</span>
              {level.name}
            </button>
          ))}
        </nav>
      </aside>

      <section className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-sans text-xl font-semibold">{selected.name}</h1>
          <div className="flex gap-1 rounded-sm border border-hairline bg-surface p-1">
            {(["edit", "playtest"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-sm px-3 py-1 text-xs capitalize transition-colors
                  ${tab === t ? "bg-moss/15 text-moss" : "text-muted hover:text-mist"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "edit" ? (
          <LevelEditor level={selected} onChange={updateSelectedLevel} />
        ) : (
          <GameBoard level={selected} />
        )}
      </section>
    </div>
  );
}
