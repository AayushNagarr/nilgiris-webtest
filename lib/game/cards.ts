import { Card, CardId } from "./types";

// Starter card set. Add new cards here — everything else (hand rendering,
// play validation, deck building) reads from this table, nothing is
// hardcoded elsewhere.
export const CARDS: Record<CardId, Card> = {
  "wooden-plank": {
    id: "wooden-plank",
    name: "Wooden Plank",
    description: "Cheap bridge segment. Cracks easily.",
    cost: 1,
    health: 2,
    validTerrain: ["chasm"],
  },
  "rope-bridge": {
    id: "rope-bridge",
    name: "Rope Bridge",
    description: "Cheapest crossing. Very fragile.",
    cost: 1,
    health: 1,
    validTerrain: ["chasm"],
  },
  "stone-slab": {
    id: "stone-slab",
    name: "Stone Slab",
    description: "Sturdy bridge segment.",
    cost: 2,
    health: 4,
    validTerrain: ["chasm"],
  },
  "reinforced-beam": {
    id: "reinforced-beam",
    name: "Reinforced Beam",
    description: "Bridge segment braced against wind.",
    cost: 2,
    health: 3,
    armor: 1,
    validTerrain: ["chasm"],
  },
  watchtower: {
    id: "watchtower",
    name: "Watchtower",
    description: "Built on solid ground. Shields adjacent structures.",
    cost: 3,
    health: 5,
    validTerrain: ["ground"],
    aura: { radius: 1, armor: 1 },
  },
};

/** A default 15-card deck: a mix weighted toward the cheap options. */
export function starterDeck(): CardId[] {
  return [
    "wooden-plank", "wooden-plank", "wooden-plank", "wooden-plank",
    "rope-bridge", "rope-bridge", "rope-bridge",
    "stone-slab", "stone-slab", "stone-slab",
    "reinforced-beam", "reinforced-beam", "reinforced-beam",
    "watchtower", "watchtower",
  ];
}
