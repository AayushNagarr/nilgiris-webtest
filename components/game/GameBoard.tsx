"use client";

import { useMemo, useState } from "react";
import { CARDS, PERSONALITIES } from "@/lib/game/cards";
import { FOREST_EVENTS } from "@/lib/game/disasters";
import {
  canPlayCard,
  cardNeedsTarget,
  chooseColumnReward,
  chooseReward,
  COLUMN_BY_ID,
  COLUMNS,
  completeActiveSlot,
  createInitialState,
  debugAddBudget,
  debugAddMh,
  debugChangeForestWeather,
  debugChangeOverrun,
  debugChangePreparation,
  debugDrawCard,
  debugForceIntent,
  debugPrintRunMap,
  debugPrintRunMapPathLengths,
  debugRegenerateRunMap,
  debugRegenerateRunMapSameSeed,
  debugTeleportRouteNode,
  debugUnlockAllRouteNodes,
  endTurn,
  effectiveCardCost,
  GAME_CONFIG,
  getActiveExposurePercent,
  getCurrentIntent,
  getFrontierIndexes,
  getIntentPreviewForSlot,
  getIntentTargetLabel,
  getNextIntent,
  getSelectableRouteNodeIds,
  getSlotViewState,
  playCard,
  removeCardFromRun,
  requestFunding,
  restartRoom,
  selectRouteNode,
  selectColumn,
  startNextRoom,
} from "@/lib/game/engine";
import { ANIMAL_BY_ID, BIOSPHERE_BY_ID, getProjectedNodeDifficulty } from "@/lib/game/map";
import { CardInstance, GameState, PersonalityId, RunMapNode } from "@/lib/game/types";
import {
  SLOT_STATE_COLORS,
  TERRAIN_ANGLE_LABELS,
  TERRAIN_COLORS,
  TERRAIN_LABELS,
} from "@/lib/game/terrainStyle";

type TutorialHighlight = "hud" | "forest" | "slots" | "columns" | "hand" | "actions";

type ForestHitVariant = "rain" | "wind" | "herd" | "impact";

type ForestHitAnimation = {
  id: number;
  slotIndexes: number[];
  variant: ForestHitVariant;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  body: string;
  highlight: TutorialHighlight;
  attention: string[];
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    eyebrow: "Step 1",
    title: "Build the room before the forest breaks your work.",
    body: "Each room is a line of bridge slots. Prepare the active slot, complete it, and keep moving until every slot in the room is finished.",
    highlight: "slots",
    attention: ["The active slot is outlined in green.", "Preparation must reach the required number before the column can be completed.", "Completed slots behind the active slot can remain exposed as Frontier slots."],
  },
  {
    eyebrow: "Step 2",
    title: "Budget is health. Man-Hours pay for cards.",
    body: "Budget is lost when Overrun gets through. Man-Hours refresh every turn and are spent to play cards from your hand.",
    highlight: "hud",
    attention: ["Budget reaching 0 ends the run.", "The top Man-Hours counter shows what you can spend this turn.", "Card costs are printed in MH on each card."],
  },
  {
    eyebrow: "Step 3",
    title: "Choose a column design before committing work.",
    body: "The right column panel controls the active slot's allocation and completion bonus. You can switch designs only before meaningful work has started on that slot.",
    highlight: "columns",
    attention: ["Allocation is the slot's damage capacity.", "Column effects trigger when the slot is completed.", "New column designs can be earned between rooms."],
  },
  {
    eyebrow: "Step 4",
    title: "Cards prepare, reinforce, repair, draw, or bend the turn.",
    body: "Click a card to play it. If it says to select a slot target, choose a highlighted slot after selecting the card.",
    highlight: "hand",
    attention: ["Prepare adds progress to unfinished work.", "Reinforce blocks incoming forest Overrun this turn.", "Repair removes existing Overrun from a target."],
  },
  {
    eyebrow: "Step 5",
    title: "Read the enemy, set, and intent before ending the turn.",
    body: "The Forest panel shows the enemy for this room, the chosen attack set that defines its behavior, and the exact intent that will resolve after your turn.",
    highlight: "forest",
    attention: ["Red outlines on slots show where the current intent is aimed.", "Requirements are checked before the attack resolves.", "Wet and Windy are gained after resolution and unlock later attacks."],
  },
  {
    eyebrow: "Step 6",
    title: "Complete one column, then end the turn when ready.",
    body: "When the active slot has enough Preparation, complete it. After you are done playing cards, end the turn and the forest resolves.",
    highlight: "actions",
    attention: ["Only one column can be completed per turn.", "End turn discards most cards and draws back up next turn.", "After a room, choose rewards, tune the run, pick a map route, and start the next room."],
  },
];

function tutorialHighlightClass(active: boolean) {
  return active ? "relative z-[45] ring-2 ring-mist ring-offset-2 ring-offset-base" : "";
}

function TutorialOverlay({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onSkip,
  state,
}: {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  state: GameState;
}) {
  const isLast = stepIndex === totalSteps - 1;
  const currentIntent = getCurrentIntent(state);
  const showForestDetails = step.highlight === "forest";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-base/75" />
      <div className="fixed inset-0 z-[46]" aria-hidden="true" />
      <section className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl border border-mist bg-surface p-4 shadow-2xl md:bottom-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="elevation-label text-brass">{step.eyebrow} / {totalSteps}</div>
            <h2 className="mt-2 text-xl font-semibold text-mist">{step.title}</h2>
          </div>
          <button
            onClick={onSkip}
            className="shrink-0 rounded-sm border border-hairline px-3 py-2 text-xs text-muted hover:text-mist"
          >
            Skip tutorial
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">{step.body}</p>
        {showForestDetails && (
          <div className="mt-4 border border-danger/70 bg-danger/10 p-3 text-xs">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="elevation-label text-danger">Enemy</div>
                <div className="mt-1 font-semibold text-mist">{state.forestEnemyName}</div>
              </div>
              <div>
                <div className="elevation-label text-danger">Attack Set</div>
                <div className="mt-1 font-semibold text-mist">{state.forestAttackSetName}</div>
              </div>
              <div>
                <div className="elevation-label text-danger">Intent</div>
                <div className="mt-1 font-semibold text-mist">{currentIntent.name}</div>
              </div>
            </div>
            <div className="mt-3 text-muted">
              Red outlines on bridge slots show exactly where this intent is aimed before you end the turn.
            </div>
          </div>
        )}
        <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-3">
          {step.attention.map((item) => (
            <div key={item} className="border border-hairline bg-base p-3">
              {item}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-muted">{stepIndex + 1} of {totalSteps}</div>
          <div className="flex gap-2">
            <button
              onClick={onBack}
              disabled={stepIndex === 0}
              className="rounded-sm border border-hairline px-4 py-2 text-sm text-muted hover:text-mist disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={onNext}
              className="rounded-sm border border-moss px-4 py-2 text-sm font-semibold text-moss hover:bg-moss/10"
            >
              {isLast ? "Begin round" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function pct(value: number, max: number) {
  return max <= 0 ? 0 : Math.min(100, Math.round((100 * value) / max));
}

function ProgressBar({ value, max, color = "bg-moss" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-base">
      <div className={`h-full ${color}`} style={{ width: `${pct(value, max)}%` }} />
    </div>
  );
}

function IntentStatusText({ state }: { state: GameState }) {
  const intent = getCurrentIntent(state);
  const gains = [
    intent.statusesAdded.wet ? `Wet +${intent.statusesAdded.wet}` : "",
    intent.statusesAdded.windy ? `Windy +${intent.statusesAdded.windy}` : "",
  ].filter(Boolean);
  if (gains.length === 0) return <span>None</span>;
  return (
    <span>{gains.join(", ")}</span>
  );
}

function forestHitVariant(state: GameState): ForestHitVariant {
  const intent = getCurrentIntent(state);
  if (state.forestEnemyId === "monsoon-shower" || state.forestEnemyId === "mist" || intent.statusesAdded.wet) return "rain";
  if (state.forestEnemyId === "strong-gusts" || intent.statusesAdded.windy) return "wind";
  if (state.forestEnemyId === "migrating-herd") return "herd";
  return "impact";
}

function TacticalSnapshot({ state }: { state: GameState }) {
  const activeSlot = state.slots[state.activeSlotIndex];
  const frontier = getFrontierIndexes(state);
  const safeSlots = state.slots.filter((_, index) => getSlotViewState(state, index) === "Safe");
  const trackedIndexes = [state.activeSlotIndex, ...frontier].filter((index) => state.slots[index]);

  return (
    <div className="border border-hairline bg-surface p-4">
      <div className="elevation-label">Current Build</div>
      {activeSlot ? (
        <>
          <div className="mt-3 rounded-sm bg-base p-3 text-xs">
            <div className="font-medium text-mist">
              Slot {activeSlot.slotNumber}: {TERRAIN_LABELS[activeSlot.terrainType]} + {TERRAIN_ANGLE_LABELS[activeSlot.terrainAngle]}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-muted">
              <div>Preparation</div>
              <div className="text-right font-mono text-mist">{activeSlot.preparation} / {activeSlot.preparationRequired}</div>
              <div>Column</div>
              <div className="text-right text-mist">{COLUMN_BY_ID[activeSlot.columnId].name}</div>
              <div>Allocation</div>
              <div className="text-right font-mono text-brass">{activeSlot.allocation}</div>
              <div>Exposure</div>
              <div className="text-right font-mono text-mist">{getActiveExposurePercent(state)}%</div>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            {trackedIndexes.map((index) => {
              const slot = state.slots[index];
              const label = index === state.activeSlotIndex ? "Active" : frontier[0] === index ? "Newest Frontier" : "Second Frontier";
              return (
                <div key={slot.slotNumber} className="rounded-sm bg-base p-2">
                  <div className="flex justify-between gap-2 text-muted">
                    <span>{label} · Slot {slot.slotNumber}</span>
                    <span>{slot.destroyed ? "Destroyed" : getSlotViewState(state, index)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-2">
                    <span className="text-muted">Overrun</span>
                    <span className="font-mono text-danger">{slot.overrun} / {slot.allocation}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-2">
                    <span className="text-muted">Reinforce</span>
                    <span className="font-mono text-moss">{slot.reinforce}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-sm bg-base p-2 text-xs">
            <div className="text-muted">Safe Columns</div>
            <div className="mt-1 text-mist">
              {safeSlots.length ? safeSlots.map((slot) => `Slot ${slot.slotNumber}`).join(", ") : "None yet"}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 text-xs text-muted">No active slot.</div>
      )}
    </div>
  );
}

function CardButton({
  instance,
  state,
  selectedId,
  onSelect,
  onPlay,
}: {
  instance: CardInstance;
  state: GameState;
  selectedId: string | null;
  onSelect: (instanceId: string | null) => void;
  onPlay: (instanceId: string) => void;
}) {
  const card = CARDS[instance.cardId];
  const cost = effectiveCardCost(instance);
  const affordable = state.currentMH >= cost;
  const needsTarget = cardNeedsTarget(card.id);
  const selected = selectedId === instance.instanceId;

  return (
    <button
      disabled={state.phase !== "playing" || !affordable}
      onClick={() => {
        if (needsTarget) onSelect(selected ? null : instance.instanceId);
        else onPlay(instance.instanceId);
      }}
      className={`flex min-h-44 w-56 flex-col rounded-sm border p-4 text-left text-xs transition-colors disabled:opacity-40
        ${selected ? "border-moss bg-moss/15" : "border-hairline bg-surface hover:bg-surface2"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-mist">{card.name}</div>
        <div className="shrink-0 rounded-sm border border-brass/50 px-1.5 py-0.5 font-mono text-brass">{cost} MH</div>
      </div>
      <div className="mt-1 text-[11px] text-muted">{card.rarity}{card.personality ? ` · ${card.personality}` : ""}</div>
      <p className="mt-3 flex-1 text-muted">{card.effectText}</p>
      {card.retain && <div className="mt-2 text-[11px] text-moss">Held {instance.heldTurns} turn{instance.heldTurns === 1 ? "" : "s"}</div>}
      {needsTarget && <div className="mt-2 text-[11px] text-brass">Select a slot target</div>}
    </button>
  );
}

function BridgeSiteGraphic({
  state,
  index,
  hitVariant,
}: {
  state: GameState;
  index: number;
  hitVariant?: ForestHitVariant;
}) {
  const slot = state.slots[index];
  const viewState = getSlotViewState(state, index);
  const prepPct = pct(slot.preparation, slot.preparationRequired);
  const columnHeight = slot.completed ? 88 : Math.max(22, Math.round(22 + prepPct * 0.58));
  const isBuilt = slot.completed && !slot.destroyed;
  const isActiveWork = viewState === "Active" && !slot.destroyed;
  const hasLeftConnection = index > 0 && state.slots[index - 1]?.completed && !state.slots[index - 1]?.destroyed;
  const hasRightConnection = index < state.slots.length - 1 && state.slots[index + 1]?.completed && !state.slots[index + 1]?.destroyed;

  return (
    <div
      className={`relative mt-4 h-44 overflow-hidden rounded-sm border bg-base
        ${hitVariant ? `forest-hit-shake forest-hit-${hitVariant}` : ""}
        ${viewState === "Active" ? "border-moss/70" : viewState === "Destroyed" ? "border-danger/70" : "border-hairline"}`}
      style={{
        background:
          `linear-gradient(to bottom, rgba(17,24,23,0.2), rgba(17,24,23,0.4)), ${TERRAIN_COLORS[slot.terrainType]}`,
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-16 opacity-80"
        style={{
          background: "linear-gradient(135deg, rgba(10,16,15,0.2) 0 25%, rgba(10,16,15,0.45) 25% 50%, rgba(10,16,15,0.2) 50% 75%, rgba(10,16,15,0.45) 75%)",
          backgroundSize: "22px 22px",
          clipPath: slot.terrainAngle === "steep"
            ? "polygon(0 48%, 100% 18%, 100% 100%, 0 100%)"
            : slot.terrainAngle === "uneven"
              ? "polygon(0 42%, 25% 28%, 48% 46%, 72% 24%, 100% 38%, 100% 100%, 0 100%)"
              : "polygon(0 36%, 100% 36%, 100% 100%, 0 100%)",
        }}
      />

      <div className="absolute inset-x-5 bottom-9 h-2 rounded-full bg-base/70" />
      <div className="absolute bottom-10 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-brass/70" />

      {(isBuilt || isActiveWork) && (
        <div className="absolute left-1/2 top-8 h-5 w-32 -translate-x-1/2">
          <div
            className={`absolute top-1 h-4 bg-mist/80 shadow-sm ${isBuilt ? "" : "opacity-60"}`}
            style={{
              left: hasLeftConnection ? "-22px" : "0",
              right: hasRightConnection ? "-22px" : "0",
            }}
          />
          <div
            className="absolute inset-x-0 top-0 h-1 bg-brass"
            style={{
              left: hasLeftConnection ? "-22px" : "0",
              right: hasRightConnection ? "-22px" : "0",
            }}
          />
        </div>
      )}

      {slot.destroyed ? (
        <div className="absolute inset-x-0 bottom-10 flex items-end justify-center gap-1">
          <div className="h-8 w-10 -rotate-12 bg-danger/80" />
          <div className="h-5 w-12 rotate-6 bg-brass/70" />
          <div className="h-10 w-8 rotate-12 bg-danger/70" />
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-12 flex items-end justify-center">
          <div className="relative w-28" style={{ height: `${columnHeight}px` }}>
            <div className={`absolute inset-y-0 left-5 w-5 ${isBuilt ? "bg-mist/80" : "bg-brass/75"}`} />
            <div className={`absolute inset-y-0 right-5 w-5 ${isBuilt ? "bg-mist/80" : "bg-brass/75"}`} />
            <div className="absolute bottom-0 left-1/2 h-full w-2 -translate-x-1/2 bg-base/45" />
            {isActiveWork && !isBuilt && (
              <>
                <div className="absolute left-0 top-1/3 h-1 w-full rotate-12 bg-brass" />
                <div className="absolute left-0 top-2/3 h-1 w-full -rotate-12 bg-brass" />
                <div className="absolute -right-5 top-0 h-full w-1 bg-moss/70" />
                <div className="absolute -right-8 top-2 h-1 w-10 bg-moss/70" />
              </>
            )}
          </div>
        </div>
      )}

      {!slot.completed && !isActiveWork && !slot.destroyed && (
        <div className="absolute inset-x-0 bottom-12 flex items-end justify-center gap-6">
          <div className="h-12 w-1 bg-brass/60" />
          <div className="h-8 w-16 border-t border-dashed border-brass/70" />
          <div className="h-12 w-1 bg-brass/60" />
        </div>
      )}

      {slot.reinforce > 0 && (
        <div className="absolute inset-x-4 top-7 h-28 rounded-full border border-moss/80 bg-moss/10" />
      )}

      {slot.overrun > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-danger/35"
          style={{ height: `${Math.max(8, pct(slot.overrun, slot.allocation) * 0.9)}%` }}
        />
      )}

      {hitVariant === "rain" && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="forest-rain-drop"
              style={{ left: `${8 + i * 8}%`, animationDelay: `${i * 35}ms` }}
            />
          ))}
        </div>
      )}

      {hitVariant === "wind" && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="forest-wind-streak"
              style={{ top: `${22 + i * 13}%`, animationDelay: `${i * 55}ms` }}
            />
          ))}
        </div>
      )}

      {hitVariant === "herd" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="forest-herd-dust" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      )}

      {hitVariant === "impact" && (
        <div className="forest-impact-flash pointer-events-none absolute inset-0 z-20" />
      )}
    </div>
  );
}

function SlotCard({
  state,
  index,
  selectedCardId,
  hitVariant,
  onTarget,
  onDebugOverrun,
}: {
  state: GameState;
  index: number;
  selectedCardId: string | null;
  hitVariant?: ForestHitVariant;
  onTarget: (slotIndex: number) => void;
  onDebugOverrun: (slotIndex: number, amount: number) => void;
}) {
  const slot = state.slots[index];
  const viewState = getSlotViewState(state, index);
  const column = COLUMN_BY_ID[slot.columnId];
  const selectedCard = selectedCardId ? state.hand.find((card) => card.instanceId === selectedCardId) : null;
  const canTarget = selectedCard ? canPlayCard(state, selectedCard.instanceId, index) : false;
  const currentIntent = getCurrentIntent(state);
  const intentPreview = getIntentPreviewForSlot(state, index, currentIntent);
  const intentTargeted = state.phase === "playing" && intentPreview !== null;

  return (
    <div
      className={`relative flex min-h-[420px] min-w-64 flex-1 flex-col border bg-surface p-3 transition-colors
        ${intentTargeted ? "border-danger ring-2 ring-danger/70 ring-offset-2 ring-offset-base" : viewState === "Active" ? "border-moss" : viewState === "Destroyed" ? "border-danger" : "border-hairline"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Slot {slot.slotNumber}</div>
          <div className="mt-1 font-medium text-mist">
            {TERRAIN_LABELS[slot.terrainType]} + {TERRAIN_ANGLE_LABELS[slot.terrainAngle]}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {intentTargeted && (
            <div className="rounded-sm border border-danger bg-danger px-2 py-1 text-[10px] font-semibold uppercase tracking-normal text-base">
              {intentPreview}
            </div>
          )}
          <div
            className="rounded-sm px-2 py-1 text-[11px] font-medium text-base"
            style={{ backgroundColor: SLOT_STATE_COLORS[viewState] }}
          >
            {viewState}
          </div>
        </div>
      </div>

      <BridgeSiteGraphic state={state} index={index} hitVariant={hitVariant} />

      <div className="mt-4 space-y-3 text-xs">
        <div>
          <div className="mb-1 flex justify-between text-muted">
            <span>Preparation</span>
            <span>{slot.preparation} / {slot.preparationRequired}</span>
          </div>
          <ProgressBar value={slot.preparation} max={slot.preparationRequired} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-muted">
            <span>Overrun</span>
            <span>{slot.overrun} / {slot.allocation}</span>
          </div>
          <ProgressBar value={slot.overrun} max={slot.allocation} color="bg-danger" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-sm bg-base p-2">
          <div className="text-muted">Column</div>
          <div className="mt-1 text-mist">{column.name}</div>
        </div>
        <div className="rounded-sm bg-base p-2">
          <div className="text-muted">Reinforce</div>
          <div className="mt-1 text-mist">{slot.reinforce}</div>
        </div>
      </div>

      {canTarget && (
        <button
          onClick={() => onTarget(index)}
          className="mt-3 rounded-sm border border-moss px-3 py-2 text-xs text-moss hover:bg-moss/10"
        >
          Target slot
        </button>
      )}

      {slot.needsRebuild && (
        <div className="mt-3 rounded-sm border border-danger/70 bg-danger/10 px-3 py-2 text-xs text-danger">
          Rebuild through normal Preparation.
        </div>
      )}

      {(state.blockedOpeningSlotIndexes.includes(index) || state.blockedPreparationSlotIndexes.includes(index)) && (
        <div className="mt-3 rounded-sm border border-brass/70 bg-brass/10 px-3 py-2 text-xs text-brass">
          {state.blockedOpeningSlotIndexes.includes(index) ? "Opening blocked this turn." : ""}
          {state.blockedOpeningSlotIndexes.includes(index) && state.blockedPreparationSlotIndexes.includes(index) ? " " : ""}
          {state.blockedPreparationSlotIndexes.includes(index) ? "Preparation blocked this turn." : ""}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-3">
        <button onClick={() => onDebugOverrun(index, 1)} className="rounded-sm border border-hairline px-2 py-1 text-[11px] text-muted hover:text-mist">
          +Overrun
        </button>
        <button onClick={() => onDebugOverrun(index, -1)} className="rounded-sm border border-hairline px-2 py-1 text-[11px] text-muted hover:text-mist">
          -Overrun
        </button>
      </div>
    </div>
  );
}

function RewardOverlay({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState>> }) {
  if (state.phase !== "reward") return null;
  const rating = state.roomHistory[state.roomHistory.length - 1];

  return (
    <div className="border border-brass bg-surface p-4">
      <div className="text-sm font-semibold text-mist">Room reward</div>
      <div className="mt-1 text-xs text-muted">
        Integrity {rating?.integrity ?? 0}% · {rating?.rating ?? 1} star{rating?.rating === 1 ? "" : "s"} · remove up to {state.removalsAvailable}
      </div>
      {!state.rewardCardChosen ? (
        <>
          <div className="mt-4 text-xs font-medium text-mist">Choose one card not already in your deck</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.rewardOptions.map((cardId) => {
              const card = CARDS[cardId];
              return (
                <button
                  key={cardId}
                  onClick={() => setState((s) => chooseReward(s, cardId))}
                  className="w-48 rounded-sm border border-hairline bg-base p-3 text-left text-xs hover:border-moss"
                >
                  <div className="font-medium text-mist">{card.name}</div>
                  <div className="mt-1 text-muted">{card.cost} MH · {card.rarity}</div>
                  <p className="mt-2 text-muted">{card.effectText}</p>
                </button>
              );
            })}
            {state.rewardOptions.length === 0 && <div className="text-xs text-muted">No unseen card rewards remain.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 text-xs font-medium text-mist">Choose one new column design</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.columnRewardOptions.map((columnId) => {
              const column = COLUMN_BY_ID[columnId];
              return (
                <button
                  key={columnId}
                  onClick={() => setState((s) => chooseColumnReward(s, columnId))}
                  className="w-52 rounded-sm border border-hairline bg-base p-3 text-left text-xs hover:border-moss"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-mist">{column.name}</div>
                    <div className="font-mono text-brass">{column.allocation}</div>
                  </div>
                  <p className="mt-2 text-muted">{column.effectText}</p>
                </button>
              );
            })}
            {state.columnRewardOptions.length === 0 && <div className="text-xs text-muted">No locked column designs remain.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function CraftingSpace({
  state,
  setState,
  onOpenMap,
}: {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  onOpenMap: () => void;
}) {
  const removableCards = useMemo(
    () => [...state.hand, ...state.drawPile, ...state.discardPile],
    [state.hand, state.drawPile, state.discardPile]
  );
  if (state.phase !== "crafting") return null;

  return (
    <div className="border border-moss bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-mist">Crafting Space</div>
          <div className="mt-1 text-xs text-muted">Adjust the run before the next room.</div>
        </div>
        <button
          onClick={() => {
            if (state.selectedMapNodeId) setState((s) => startNextRoom(s));
            else onOpenMap();
          }}
          className="rounded-sm border border-moss px-3 py-2 text-xs text-moss hover:bg-moss/10 disabled:opacity-40"
        >
          {state.selectedMapNodeId ? "Start next room" : "Select next room"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-sm border border-hairline bg-base p-3 text-xs">
          <div className="font-medium text-mist">Funding Request</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {GAME_CONFIG.fundingOptions.map((option) => (
              <button key={option.id} onClick={() => setState((s) => requestFunding(s, option.id))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-sm border border-hairline bg-base p-3 text-xs">
        <summary className="cursor-pointer text-muted">Remove Cards ({state.removalsAvailable} left)</summary>
        <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-auto">
          {removableCards.map((instance) => (
            <button
              key={instance.instanceId}
              disabled={state.removalsAvailable <= 0}
              onClick={() => setState((s) => removeCardFromRun(s, instance.instanceId))}
              className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-danger disabled:opacity-40"
            >
              {CARDS[instance.cardId]?.name ?? instance.cardId}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function ColumnSelectionPanel({
  state,
  setState,
}: {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const activeSlot = state.slots[state.activeSlotIndex];
  const canSelectForActive = Boolean(
    activeSlot
    && state.phase === "playing"
    && activeSlot.preparation === 0
    && (activeSlot.overrun === 0 || activeSlot.destroyed || activeSlot.needsRebuild)
    && !activeSlot.completed
  );

  return (
    <aside className="flex flex-col gap-4">
      <div className="border border-hairline bg-surface p-4">
        <div className="elevation-label">Columns</div>
        <div className="mt-3 space-y-2">
          {state.availableColumns.map((columnId) => {
            const column = COLUMN_BY_ID[columnId];
            const selected = activeSlot?.columnId === columnId;
            return (
              <button
                key={columnId}
                disabled={!canSelectForActive}
                onClick={() => setState((s) => selectColumn(s, columnId))}
                className={`w-full rounded-sm border p-3 text-left text-xs transition-colors disabled:cursor-default
                  ${selected ? "border-moss bg-moss/10" : "border-hairline bg-base hover:border-moss"}
                  ${!canSelectForActive && !selected ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-mist">{column.name}</div>
                  <div className="shrink-0 font-mono text-brass">{column.allocation}</div>
                </div>
                <p className="mt-2 text-muted">{column.effectText}</p>
                <div className="mt-2 text-[11px] text-muted">
                  {selected ? "Selected" : canSelectForActive ? "Available" : "Locked for current slot"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function routeNodeStatus(state: GameState, node: RunMapNode, selectableIds: string[]) {
  if (state.selectedMapNodeId === node.id) return "selected";
  if (state.currentMapNodeId === node.id) return "current";
  if (node.kind === "end") return "final";
  if (state.completedMapNodeIds.includes(node.id)) return "completed";
  if (selectableIds.includes(node.id)) return "selectable";
  return "inaccessible";
}

function routeEdgeStatus(state: GameState, from: RunMapNode, to: RunMapNode, selectableIds: string[]) {
  if (state.selectedMapNodeId === to.id) return "selected";
  if (state.currentMapNodeId === from.id && selectableIds.includes(to.id)) return "selectable";
  if (state.completedMapNodeIds.includes(from.id) && state.completedMapNodeIds.includes(to.id)) return "completed";
  return "inaccessible";
}

function RunMapOverlay({
  state,
  setState,
  onClose,
}: {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  onClose: () => void;
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showIds, setShowIds] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(true);
  const selectableIds = getSelectableRouteNodeIds(state);
  const hoveredNode = state.runMap.nodes.find((node) => node.id === hoveredNodeId)
    ?? state.runMap.nodes.find((node) => node.id === state.selectedMapNodeId)
    ?? state.runMap.nodes.find((node) => node.id === state.currentMapNodeId)
    ?? state.runMap.nodes[0];
  const biosphere = hoveredNode?.biosphereId ? BIOSPHERE_BY_ID[hoveredNode.biosphereId] : null;
  const wildlife = biosphere?.wildlifeWeights
    .map((item) => ANIMAL_BY_ID[item.animalId]?.name ?? item.animalId)
    .join(", ");
  const hoveredDifficulty = hoveredNode?.kind === "room"
    ? hoveredNode.id === state.currentMapNodeId
      ? state.currentRoomDifficultyMultiplier
      : selectableIds.includes(hoveredNode.id)
        ? getProjectedNodeDifficulty(hoveredNode, state.roomNumber + 1)
        : hoveredNode.difficultyMultiplier
    : 1;
  const nextNodes = selectableIds
    .map((nodeId) => state.runMap.nodes.find((node) => node.id === nodeId))
    .filter((node): node is RunMapNode => Boolean(node))
    .filter((node) => state.runMap.nodes.find((current) => current.id === state.currentMapNodeId)?.outgoing.includes(node.id) || state.unlockedMapNodeIds.includes(node.id));

  return (
    <div className="fixed inset-0 z-50 bg-base/90 p-4">
      <div className="flex h-full flex-col border border-hairline bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <div className="elevation-label">Run Map</div>
            <div className="mt-1 text-lg font-semibold text-mist">Parth's Nilgiris railway alignment</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="rounded-sm border border-brass/60 px-2 py-1 text-brass">Wet {state.forestWeather.wet} / 3</div>
            <div className="rounded-sm border border-moss/60 px-2 py-1 text-moss">Windy {state.forestWeather.windy} / 3</div>
            <button onClick={onClose} className="rounded-sm border border-hairline px-3 py-1 text-muted hover:text-mist">Close</button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[620px] overflow-auto border border-hairline bg-base">
            <div className="relative h-[1500px] min-w-[980px]">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {state.runMap.nodes.flatMap((node) =>
                  node.outgoing.map((targetId) => {
                    const target = state.runMap.nodes.find((item) => item.id === targetId);
                    if (!target) return null;
                    const bend = (target.x - node.x) * 0.22;
                    const c1x = node.x + bend;
                    const c2x = target.x - bend;
                    const c1y = node.y + Math.max(4, (target.y - node.y) * 0.35);
                    const c2y = target.y - Math.max(4, (target.y - node.y) * 0.35);
                    const edgeStatus = routeEdgeStatus(state, node, target, selectableIds);
                    const edgeStroke = edgeStatus === "selected"
                      ? "rgba(229,232,220,0.95)"
                      : edgeStatus === "selectable"
                        ? "rgba(192,133,82,0.9)"
                        : edgeStatus === "completed"
                          ? "rgba(122,155,118,0.62)"
                          : "rgba(98,109,105,0.2)";
                    return (
                      <path
                        key={`${node.id}-${targetId}`}
                        d={`M ${node.x} ${node.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${target.x} ${target.y}`}
                        fill="none"
                        stroke={edgeStroke}
                        strokeWidth={edgeStatus === "selected" || edgeStatus === "selectable" ? "0.58" : "0.3"}
                        strokeDasharray={edgeStatus === "selected" || edgeStatus === "selectable" ? "0.9 1.35" : "0.65 1.8"}
                        strokeLinecap="round"
                      />
                    );
                  })
                )}
              </svg>

              {state.runMap.nodes.map((node) => {
                const status = routeNodeStatus(state, node, selectableIds);
                const canSelect = selectableIds.includes(node.id) && state.completedMapNodeIds.includes(state.currentMapNodeId);
                const statusClass = status === "completed"
                  ? "border-moss bg-moss text-base shadow-[0_0_0_5px_rgba(122,155,118,0.12)]"
                  : status === "current"
                    ? "border-brass bg-brass text-base shadow-[0_0_0_7px_rgba(192,133,82,0.16)]"
                    : status === "selected"
                      ? "border-mist bg-mist text-base shadow-[0_0_0_6px_rgba(229,232,220,0.14)]"
                      : status === "selectable"
                        ? "border-moss bg-surface text-moss shadow-[0_0_0_4px_rgba(122,155,118,0.08)] hover:bg-moss/10"
                        : status === "final"
                          ? "border-danger bg-danger/20 text-danger shadow-[0_0_0_6px_rgba(192,101,79,0.12)]"
                          : "border-hairline bg-surface2 text-muted opacity-55";
                return (
                  <div
                    key={node.id}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  >
                    <button
                      disabled={!canSelect || node.id === state.currentMapNodeId}
                      onClick={() => setState((s) => selectRouteNode(s, node.id))}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onFocus={() => setHoveredNodeId(node.id)}
                      className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-center text-base font-semibold transition-colors ${statusClass}`}
                    >
                      {node.kind === "start" ? "S" : node.kind === "end" ? "E" : "?"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
            <div className="border border-brass/70 bg-brass/10 p-3 text-xs">
              <div className="font-medium text-mist">Available Branches</div>
              <div className="mt-1 text-muted">
                {nextNodes.length > 1
                  ? "Choose one connected alignment before starting the next room."
                  : nextNodes.length === 1
                    ? "One connected alignment is available."
                    : state.phase === "playing"
                      ? "Complete the current room to reveal branch choices."
                      : "No connected branch is currently available."}
              </div>
              <div className="mt-3 space-y-2">
                {nextNodes.map((node) => {
                  const optionBiosphere = node.biosphereId ? BIOSPHERE_BY_ID[node.biosphereId] : null;
                  const projectedDifficulty = node.kind === "room" ? getProjectedNodeDifficulty(node, state.roomNumber + 1) : 1;
                  const selected = state.selectedMapNodeId === node.id;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setState((s) => selectRouteNode(s, node.id))}
                      className={`w-full rounded-sm border p-2 text-left transition-colors
                        ${selected ? "border-mist bg-mist/15 text-mist" : "border-hairline bg-base text-muted hover:border-brass hover:text-mist"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span>{node.kind === "end" ? "End" : node.label}</span>
                        <span className="font-mono">{node.kind === "room" && showDifficulty ? `${projectedDifficulty.toFixed(2)}x` : node.kind === "end" ? "Finish" : ""}</span>
                      </div>
                      <div className="mt-1 text-[11px]">
                        {optionBiosphere ? optionBiosphere.name : "Final railhead"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-hairline bg-base p-3 text-xs">
              <div className="font-medium text-mist">{hoveredNode?.label ?? "No node"}</div>
              {showIds && hoveredNode && (
                <div className="mt-1 font-mono text-[11px] text-muted">
                  {hoveredNode.id}{hoveredNode.biosphereId ? ` · ${hoveredNode.biosphereId}` : ""}
                </div>
              )}
              <div className="mt-1 text-muted">
                {hoveredNode?.kind === "room"
                  ? `${hoveredNode.routeRoomCount} room fastest route${showDifficulty ? ` · ${hoveredDifficulty.toFixed(2)}x projected room difficulty` : ""}`
                  : hoveredNode?.kind === "start"
                    ? "Starting survey camp"
                    : "Final railhead"}
              </div>
              {biosphere && (
                <div className="mt-3 space-y-2 text-muted">
                  <div><span className="text-mist">Biosphere:</span> {biosphere.name}</div>
                  <div>{biosphere.summary}</div>
                  <div><span className="text-mist">Likely terrain:</span> {biosphere.predictiveText.likelyTerrain}</div>
                  <div><span className="text-mist">Common angles:</span> {biosphere.predictiveText.commonAngles}</div>
                  <div><span className="text-mist">Possible wildlife:</span> {wildlife || biosphere.predictiveText.possibleWildlife}</div>
                  <div><span className="text-mist">Route read:</span> {biosphere.predictiveText.routeRisk}</div>
                </div>
              )}
            </div>

            <div className="border border-hairline bg-base p-3 text-xs">
              <div className="font-medium text-mist">Validation</div>
              <div className={`mt-2 ${state.runMap.validation.valid ? "text-moss" : "text-danger"}`}>
                {state.runMap.validation.valid ? "Valid map" : state.runMap.validation.errors.join(", ")}
              </div>
              <div className="mt-2 text-muted">
                Nodes {state.runMap.nodes.length} · Paths {state.runMap.validation.pathRoomCounts.length} · Shortest {state.runMap.validation.shortestRouteRooms} · Longest {state.runMap.validation.longestRouteRooms}
              </div>
            </div>

            <div className="border border-hairline bg-base p-3 text-xs">
              <div className="font-medium text-mist">Debug Map</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setShowIds((value) => !value)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">IDs</button>
                <button onClick={() => setShowDifficulty((value) => !value)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Difficulty</button>
                <button onClick={() => setState(debugRegenerateRunMap)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Regenerate</button>
                <button onClick={() => setState(debugRegenerateRunMapSameSeed)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Same seed</button>
                <button onClick={() => setState(debugUnlockAllRouteNodes)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Unlock all</button>
                <button onClick={() => setState(debugPrintRunMap)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Print graph</button>
                <button onClick={() => setState(debugPrintRunMapPathLengths)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Print paths</button>
                <button onClick={() => setState((s) => debugChangeForestWeather(s, "wet", 1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Wet</button>
                <button onClick={() => setState((s) => debugChangeForestWeather(s, "wet", -1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">-Wet</button>
                <button onClick={() => setState((s) => debugChangeForestWeather(s, "windy", 1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Windy</button>
                <button onClick={() => setState((s) => debugChangeForestWeather(s, "windy", -1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">-Windy</button>
              </div>
              <select
                value={state.currentMapNodeId}
                onChange={(event) => setState((s) => debugTeleportRouteNode(s, event.target.value))}
                className="mt-3 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-muted"
              >
                {state.runMap.nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.id} · {node.label}</option>
                ))}
              </select>
              <div className="mt-3 max-h-28 overflow-auto text-muted">
                {state.runMap.validation.pathRoomCounts.join(", ")}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function GameBoard() {
  const [personalityId, setPersonalityId] = useState<PersonalityId>("patience");
  const [state, setState] = useState<GameState>(() => createInitialState("patience"));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [forestHitAnimation, setForestHitAnimation] = useState<ForestHitAnimation | null>(null);
  const [debugJumpNodeId, setDebugJumpNodeId] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(0);
  const currentIntent = getCurrentIntent(state);
  const nextIntent = getNextIntent(state);
  const activeSlot = state.slots[state.activeSlotIndex];
  const tutorialStep = tutorialStepIndex === null ? null : TUTORIAL_STEPS[tutorialStepIndex];
  const tutorialActive = Boolean(tutorialStep);
  const highlighted = (section: TutorialHighlight) => tutorialStep?.highlight === section;
  const debugJumpNodes = state.runMap.nodes.filter((node) => node.kind === "room" || node.kind === "end");
  const finalDebugRoomDepth = Math.max(0, ...debugJumpNodes.filter((node) => node.kind === "room").map((node) => node.depth));
  const selectedDebugJumpNodeId = debugJumpNodes.some((node) => node.id === debugJumpNodeId)
    ? debugJumpNodeId
    : debugJumpNodes.find((node) => node.id === state.currentMapNodeId)?.id
      || debugJumpNodes[debugJumpNodes.length - 1]?.id
      || "";

  function restartWithPersonality(id: PersonalityId) {
    setPersonalityId(id);
    setSelectedCardId(null);
    setForestHitAnimation(null);
    setTutorialStepIndex(0);
    setState(createInitialState(id));
  }

  function playFromHand(instanceId: string, targetSlotIndex?: number) {
    setState((s) => playCard(s, instanceId, targetSlotIndex));
    setSelectedCardId(null);
  }

  function handleEndTurn() {
    if (state.phase !== "playing" || tutorialActive) return;
    const intent = getCurrentIntent(state);
    const slotIndexes = state.slots
      .map((_, index) => ({ index, preview: getIntentPreviewForSlot(state, index, intent) }))
      .filter(({ preview }) => preview?.includes("DMG"))
      .map(({ index }) => index);

    if (slotIndexes.length > 0) {
      const id = Date.now();
      setForestHitAnimation({ id, slotIndexes, variant: forestHitVariant(state) });
      window.setTimeout(() => {
        setForestHitAnimation((current) => current?.id === id ? null : current);
      }, 900);
    }

    setState((s) => endTurn(s));
  }

  function jumpToDebugNode(nodeId: string) {
    setSelectedCardId(null);
    setForestHitAnimation(null);
    setTutorialStepIndex(null);
    setMapOpen(false);
    setState((s) => debugTeleportRouteNode(s, nodeId));
  }

  const selectedCard = selectedCardId ? state.hand.find((card) => card.instanceId === selectedCardId) : null;
  const canComplete = activeSlot
    && activeSlot.preparation >= activeSlot.preparationRequired
    && !activeSlot.destroyed
    && state.completionsThisTurn < GAME_CONFIG.maxCompletionsPerTurn;

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col bg-base">
      <div className={`grid gap-3 border-b border-hairline bg-surface px-4 py-3 md:grid-cols-[1fr_1fr_auto] ${tutorialHighlightClass(highlighted("hud"))}`}>
        <div className="rounded-sm border border-brass/70 bg-brass/10 px-4 py-3">
          <div className="elevation-label text-brass">Budget</div>
          <div className="mt-1 font-mono text-4xl font-semibold text-mist">{state.budget}</div>
        </div>
        <div className="rounded-sm border border-moss/70 bg-moss/10 px-4 py-3">
          <div className="elevation-label text-moss">Man-Hours</div>
          <div className="mt-1 font-mono text-4xl font-semibold text-mist">{state.currentMH} / {state.maxMH}</div>
        </div>
        <button
          onClick={handleEndTurn}
          disabled={state.phase !== "playing" || tutorialActive}
          className="rounded-sm border border-brass px-5 py-3 text-sm font-semibold text-brass hover:bg-brass/10 disabled:opacity-40"
        >
          End turn
        </button>
      </div>

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        <aside className="flex flex-col gap-4">
          <div className={`border border-hairline bg-surface p-4 ${tutorialHighlightClass(highlighted("forest"))}`}>
            <div className="elevation-label">Forest</div>
            <div className={`mt-3 grid gap-2 rounded-sm border bg-base p-2 text-xs sm:grid-cols-2 ${highlighted("forest") ? "border-danger shadow-[0_0_0_2px_rgba(192,101,79,0.35)]" : "border-hairline"}`}>
              <div>
                <div className="elevation-label text-danger">Enemy</div>
                <div className="mt-1 font-semibold text-mist">{state.forestEnemyName}</div>
              </div>
              <div>
                <div className="elevation-label text-danger">Attack Set</div>
                <div className="mt-1 font-semibold text-mist">{state.forestAttackSetName}</div>
              </div>
            </div>
            <div className="mt-3 text-lg font-semibold text-mist">{currentIntent.name}</div>
            <div className="mt-2 text-sm text-muted">{currentIntent.effectText}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">FSM</div>
                <div className="mt-1 text-mist">{state.forestFsmState}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Power</div>
                <div className="mt-1 font-mono text-brass">{currentIntent.power}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Target</div>
                <div className="mt-1 text-mist">{getIntentTargetLabel(state)}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Turn</div>
                <div className="mt-1 font-mono text-mist">{state.currentTurn}{state.turnLimit ? ` / ${state.turnLimit}` : ""}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Requires</div>
                <div className="mt-1 text-mist">
                  Wet {currentIntent.requirements.wet ?? 0}, Windy {currentIntent.requirements.windy ?? 0}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted">
              Adds: <IntentStatusText state={state} />
            </div>
            <div className="mt-2 text-xs text-muted">
              Next: {nextIntent ? `${nextIntent.name} · ${getIntentTargetLabel(state, nextIntent)} · Power ${nextIntent.power}` : "Not revealed"}
            </div>
            <div className="mt-3 rounded-sm bg-base p-2 text-xs">
              <div className="text-muted">Forest Weather</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-muted">
                    <span>Wet</span>
                    <span className="font-mono text-mist">{state.forestWeather.wet} / 3</span>
                  </div>
                  <ProgressBar value={state.forestWeather.wet} max={3} color="bg-brass" />
                </div>
                <div>
                  <div className="flex justify-between text-muted">
                    <span>Windy</span>
                    <span className="font-mono text-mist">{state.forestWeather.windy} / 3</span>
                  </div>
                  <ProgressBar value={state.forestWeather.windy} max={3} color="bg-moss" />
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-sm bg-base p-2 text-xs">
              <div className="text-muted">Cooldowns</div>
              <div className="mt-1 text-mist">
                {Object.entries(state.forestCooldowns).length
                  ? Object.entries(state.forestCooldowns).map(([id, turns]) => {
                    const event = FOREST_EVENTS.find((item) => item.id === id);
                    return `${event?.name ?? id}: ${turns}`;
                  }).join(", ")
                  : "None"}
              </div>
            </div>
          </div>

          <div className={`border border-hairline bg-surface p-4 ${tutorialHighlightClass(highlighted("hud"))}`}>
            <div className="elevation-label">HUD</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Budget</div>
                <div className="mt-1 font-mono text-mist">{state.budget}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">MH</div>
                <div className="mt-1 font-mono text-mist">{state.currentMH} / {state.maxMH}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Draw</div>
                <div className="mt-1 font-mono text-mist">{state.drawPile.length}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Discard</div>
                <div className="mt-1 font-mono text-mist">{state.discardPile.length}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Room</div>
                <div className="mt-1 font-mono text-mist">{state.roomNumber}</div>
              </div>
              <div className="rounded-sm bg-base p-2">
                <div className="text-muted">Active</div>
                <div className="mt-1 font-mono text-mist">{activeSlot?.slotNumber ?? "-"}</div>
              </div>
            </div>
          </div>

          <TacticalSnapshot state={state} />

          <div className="border border-hairline bg-surface p-4">
            <div className="elevation-label">Personality</div>
            <div className="mt-3 flex flex-col gap-2">
              {PERSONALITIES.map((personality) => (
                <button
                  key={personality.id}
                  onClick={() => restartWithPersonality(personality.id)}
                  className={`rounded-sm border px-3 py-2 text-left text-xs
                    ${personalityId === personality.id ? "border-moss text-moss" : "border-hairline text-muted hover:text-mist"}`}
                >
                  {personality.name} · {personality.keyword}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-mist">Nilgiris Bridge Playtest</h1>
              <div className="mt-1 text-sm text-muted">Prepare the active slot, protect the frontier, and keep Budget intact.</div>
            </div>
            <div className={`flex flex-wrap gap-2 ${tutorialHighlightClass(highlighted("actions"))}`}>
              <button
                onClick={() => setMapOpen(true)}
                disabled={tutorialActive}
                className="rounded-sm border border-hairline px-4 py-2 text-sm text-muted hover:text-mist disabled:opacity-40"
              >
                Map
              </button>
              <button
                onClick={() => setState((s) => completeActiveSlot(s))}
                disabled={!canComplete || state.phase !== "playing" || tutorialActive}
                className="rounded-sm border border-moss px-4 py-2 text-sm text-moss hover:bg-moss/10 disabled:opacity-40"
              >
                Complete column
              </button>
              <button
                onClick={handleEndTurn}
                disabled={state.phase !== "playing" || tutorialActive}
                className="rounded-sm border border-brass px-4 py-2 text-sm text-brass hover:bg-brass/10 disabled:opacity-40"
              >
                End turn
              </button>
            </div>
          </div>

          {state.phase === "lost" && <div className="border border-danger bg-danger/10 p-3 text-sm text-danger">Run failed. Budget or deadline pressure ended the prototype run.</div>}
          {state.phase === "won" && <div className="border border-moss bg-moss/10 p-3 text-sm text-moss">Prototype rooms complete.</div>}

          <RewardOverlay state={state} setState={setState} />
          <CraftingSpace state={state} setState={setState} />

          <section className={`min-h-80 overflow-x-auto border border-hairline bg-base p-3 ${tutorialHighlightClass(highlighted("slots"))}`}>
            <div className="flex min-w-max gap-3">
              {state.slots.map((slot, index) => (
                <SlotCard
                  key={slot.slotNumber}
                  state={state}
                  index={index}
                  selectedCardId={selectedCardId}
                  hitVariant={forestHitAnimation?.slotIndexes.includes(index) ? forestHitAnimation.variant : undefined}
                  onTarget={(slotIndex) => selectedCard && playFromHand(selectedCard.instanceId, slotIndex)}
                  onDebugOverrun={(slotIndex, amount) => setState((s) => debugChangeOverrun(s, slotIndex, amount))}
                />
              ))}
            </div>
          </section>

          <section className={`border border-hairline bg-surface p-3 ${tutorialHighlightClass(highlighted("hand"))}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="elevation-label">Hand</div>
              {selectedCard && <div className="text-xs text-brass">Targeting {CARDS[selectedCard.cardId].name}</div>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {state.hand.map((instance) => (
                <CardButton
                  key={instance.instanceId}
                  instance={instance}
                  state={state}
                  selectedId={selectedCardId}
                  onSelect={setSelectedCardId}
                  onPlay={playFromHand}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="border border-hairline bg-surface p-3">
              <div className="elevation-label mb-2">Log</div>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted">
                {state.log.slice(-14).map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
              </ul>
            </section>

            <section className="border border-hairline bg-surface p-3">
              <button
                onClick={() => setDebugOpen((open) => !open)}
                className="flex w-full items-center justify-between text-left text-xs text-muted hover:text-mist"
              >
                <span className="elevation-label">Debug Tools</span>
                <span>{debugOpen ? "Hide" : "Show"}</span>
              </button>
              {debugOpen && (
                <div className="mt-3 space-y-3 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setState(debugAddBudget)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Budget</button>
                    <button onClick={() => setState(debugAddMh)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+MH</button>
                    <button onClick={() => setState(debugDrawCard)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Draw</button>
                    <button onClick={() => setState((s) => debugChangePreparation(s, 5))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Prep</button>
                    <button onClick={() => setState((s) => debugChangePreparation(s, -5))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">-Prep</button>
                    <button onClick={() => setState((s) => debugChangeForestWeather(s, "wet", 1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Wet</button>
                    <button onClick={() => setState((s) => debugChangeForestWeather(s, "wet", -1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">-Wet</button>
                    <button onClick={() => setState((s) => debugChangeForestWeather(s, "windy", 1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">+Windy</button>
                    <button onClick={() => setState((s) => debugChangeForestWeather(s, "windy", -1))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">-Windy</button>
                    <button onClick={() => setState((s) => completeActiveSlot(s))} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Complete</button>
                    <button onClick={() => setState(restartRoom)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Restart room</button>
                    <button onClick={() => restartWithPersonality(personalityId)} className="rounded-sm border border-hairline px-2 py-1 text-muted hover:text-mist">Restart run</button>
                  </div>
                  <div className="rounded-sm border border-hairline bg-base p-2">
                    <div className="mb-2 text-muted">Jump to map room</div>
                    <div className="flex gap-2">
                      <select
                        value={selectedDebugJumpNodeId}
                        onChange={(event) => setDebugJumpNodeId(event.target.value)}
                        className="min-w-0 flex-1 rounded-sm border border-hairline bg-surface px-2 py-1 text-muted"
                      >
                        {debugJumpNodes.map((node) => {
                          const biosphere = node.biosphereId ? BIOSPHERE_BY_ID[node.biosphereId] : null;
                          const label = node.kind === "end"
                            ? `${node.label} - End`
                            : `Room ${node.depth}${node.depth === finalDebugRoomDepth ? " - Final Boss" : ""}: ${node.label}${biosphere ? ` - ${biosphere.name}` : ""} - ${node.difficultyMultiplier.toFixed(2)}x`;
                          return <option key={node.id} value={node.id}>{label}</option>;
                        })}
                      </select>
                      <button
                        onClick={() => selectedDebugJumpNodeId && jumpToDebugNode(selectedDebugJumpNodeId)}
                        disabled={!selectedDebugJumpNodeId}
                        className="rounded-sm border border-brass px-3 py-1 text-brass hover:bg-brass/10 disabled:opacity-40"
                      >
                        Jump
                      </button>
                    </div>
                  </div>
                  <select
                    value={currentIntent.id}
                    onChange={(event) => setState((s) => debugForceIntent(s, event.target.value))}
                    className="w-full rounded-sm border border-hairline bg-base px-2 py-1 text-muted"
                  >
                    {FOREST_EVENTS.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                  </select>
                  <details className="rounded-sm border border-hairline p-2">
                    <summary className="cursor-pointer text-muted">Draw pile</summary>
                    <div className="mt-2 max-h-28 overflow-auto text-muted">
                      {state.drawPile.map((card) => CARDS[card.cardId]?.name ?? card.cardId).join(", ") || "Empty"}
                    </div>
                  </details>
                  <details className="rounded-sm border border-hairline p-2">
                    <summary className="cursor-pointer text-muted">Discard pile</summary>
                    <div className="mt-2 max-h-28 overflow-auto text-muted">
                      {state.discardPile.map((card) => CARDS[card.cardId]?.name ?? card.cardId).join(", ") || "Empty"}
                    </div>
                  </details>
                  <details className="rounded-sm border border-hairline p-2">
                    <summary className="cursor-pointer text-muted">Columns</summary>
                    <div className="mt-2 space-y-1 text-muted">
                      {COLUMNS.map((column) => <div key={column.id}>{column.name}: Allocation {column.allocation}. {column.effectText}</div>)}
                    </div>
                  </details>
                </div>
              )}
            </section>
          </div>
        </main>

        <div className={tutorialHighlightClass(highlighted("columns"))}>
          <ColumnSelectionPanel state={state} setState={setState} />
        </div>
      </div>
      {mapOpen && <RunMapOverlay state={state} setState={setState} onClose={() => setMapOpen(false)} />}
      {tutorialStep && (
        <TutorialOverlay
          step={tutorialStep}
          stepIndex={tutorialStepIndex ?? 0}
          totalSteps={TUTORIAL_STEPS.length}
          state={state}
          onBack={() => setTutorialStepIndex((index) => index === null ? null : Math.max(0, index - 1))}
          onNext={() => setTutorialStepIndex((index) => {
            if (index === null) return null;
            return index >= TUTORIAL_STEPS.length - 1 ? null : index + 1;
          })}
          onSkip={() => setTutorialStepIndex(null)}
        />
      )}
    </div>
  );
}
