import animalsJson from "../../data/animals.json";
import biospheresJson from "../../data/biospheres.json";
import mapConfigJson from "../../data/map_config.json";
import {
  AnimalDefinition,
  BiosphereDefinition,
  ForestWeatherState,
  MapConfig,
  RoomDefinition,
  RoomSlotDefinition,
  RunMap,
  RunMapNode,
  RunMapValidation,
  TerrainAngle,
  TerrainType,
} from "./types";

export const MAP_CONFIG = mapConfigJson as MapConfig;
export const BIOSPHERES = biospheresJson as BiosphereDefinition[];
export const ANIMALS = animalsJson as AnimalDefinition[];
export const BIOSPHERE_BY_ID: Record<string, BiosphereDefinition> = Object.fromEntries(
  BIOSPHERES.map((biosphere) => [biosphere.id, biosphere])
);
export const ANIMAL_BY_ID: Record<string, AnimalDefinition> = Object.fromEntries(
  ANIMALS.map((animal) => [animal.id, animal])
);

type Weighted<T> = T & { weight: number };

function seededRng(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function hashSeed(seed: number, text: string): number {
  let value = seed;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value || seed;
}

function weightedPick<T>(items: Weighted<T>[], rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function progressionDifficulty(roomNumber: number): number {
  const progression = MAP_CONFIG.difficultyProgression;
  return Math.min(progression.max, progression.base + Math.max(0, roomNumber - 1) * progression.perRoom);
}

export function getProjectedNodeDifficulty(node: RunMapNode, roomNumber: number): number {
  const biosphere = node.biosphereId ? BIOSPHERE_BY_ID[node.biosphereId] : undefined;
  return roundMultiplier(progressionDifficulty(roomNumber) * (biosphere?.difficultyBias ?? 1));
}

function nodeById(map: RunMap, nodeId: string): RunMapNode | undefined {
  return map.nodes.find((node) => node.id === nodeId);
}

function enumeratePathRoomCounts(nodes: RunMapNode[], startNodeId: string, endNodeId: string): number[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const counts: number[] = [];
  const walk = (nodeId: string, roomCount: number, seen: Set<string>) => {
    const node = byId.get(nodeId);
    if (!node || seen.has(nodeId)) return;
    if (nodeId === endNodeId) {
      counts.push(roomCount);
      return;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(nodeId);
    for (const nextId of node.outgoing) {
      const next = byId.get(nextId);
      walk(nextId, roomCount + (next?.kind === "room" ? 1 : 0), nextSeen);
    }
  };
  walk(startNodeId, 0, new Set());
  return counts.sort((a, b) => a - b);
}

export function validateRunMap(nodes: RunMapNode[], startNodeId: string, endNodeId: string): RunMapValidation {
  const errors: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = byId.get(startNodeId);
  const end = byId.get(endNodeId);
  if (!start || start.kind !== "start") errors.push("Missing Start node.");
  if (!end || end.kind !== "end") errors.push("Missing End node.");
  if (nodes.length < MAP_CONFIG.minNodes) errors.push(`Map has ${nodes.length} nodes; minimum is ${MAP_CONFIG.minNodes}.`);

  for (const node of nodes) {
    if (node.outgoing.length > MAP_CONFIG.maxOutgoing) errors.push(`${node.id} has too many outgoing edges.`);
    if (node.kind === "end" && node.outgoing.length > 0) errors.push("End node has outgoing edges.");
    for (const nextId of node.outgoing) {
      const next = byId.get(nextId);
      if (!next) {
        errors.push(`${node.id} points to missing node ${nextId}.`);
        continue;
      }
      if (next.depth <= node.depth) errors.push(`${node.id} has a backward edge to ${nextId}.`);
    }
  }

  const reachable = new Set<string>();
  const visit = (nodeId: string) => {
    if (reachable.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    reachable.add(nodeId);
    node.outgoing.forEach(visit);
  };
  visit(startNodeId);

  const canReachEnd = new Set<string>([endNodeId]);
  for (const node of [...nodes].sort((a, b) => b.depth - a.depth)) {
    if (node.outgoing.some((nextId) => canReachEnd.has(nextId))) canReachEnd.add(node.id);
  }

  for (const node of nodes) {
    if (!reachable.has(node.id)) errors.push(`${node.id} is orphaned from Start.`);
    if (!canReachEnd.has(node.id)) errors.push(`${node.id} cannot reach End.`);
  }

  const pathRoomCounts = enumeratePathRoomCounts(nodes, startNodeId, endNodeId);
  const longestRouteRooms = pathRoomCounts[pathRoomCounts.length - 1] ?? 0;
  const shortestRouteRooms = pathRoomCounts[0] ?? 0;
  if (pathRoomCounts.length === 0) errors.push("No valid Start-to-End route exists.");
  if (longestRouteRooms > MAP_CONFIG.maxRouteRooms) errors.push(`Longest route is ${longestRouteRooms} rooms; maximum is ${MAP_CONFIG.maxRouteRooms}.`);

  return {
    valid: errors.length === 0,
    errors,
    pathRoomCounts,
    longestRouteRooms,
    shortestRouteRooms,
  };
}

function computeRouteMetrics(nodes: RunMapNode[], startNodeId: string, endNodeId: string): RunMapNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const minFromStart = new Map<string, number>([[startNodeId, 0]]);
  for (const node of [...nodes].sort((a, b) => a.depth - b.depth)) {
    const current = minFromStart.get(node.id);
    if (current === undefined) continue;
    for (const nextId of node.outgoing) {
      const next = byId.get(nextId);
      if (!next) continue;
      const nextRooms = current + (next.kind === "room" ? 1 : 0);
      minFromStart.set(nextId, Math.min(minFromStart.get(nextId) ?? Number.POSITIVE_INFINITY, nextRooms));
    }
  }

  const minToEnd = new Map<string, number>([[endNodeId, 0]]);
  for (const node of [...nodes].sort((a, b) => b.depth - a.depth)) {
    if (node.id === endNodeId) continue;
    const candidates = node.outgoing
      .map((nextId) => {
        const next = byId.get(nextId);
        const nextRooms = minToEnd.get(nextId);
        if (!next || nextRooms === undefined) return null;
        return nextRooms + (next.kind === "room" ? 1 : 0);
      })
      .filter((value): value is number => value !== null);
    if (candidates.length) minToEnd.set(node.id, Math.min(...candidates));
  }

  return nodes.map((node) => {
    if (node.kind !== "room") return { ...node, routeRoomCount: 0, difficultyMultiplier: 1 };
    const fromStart = minFromStart.get(node.id) ?? node.depth;
    const toEnd = minToEnd.get(node.id) ?? MAP_CONFIG.maxRouteRooms - node.depth + 1;
    const routeRoomCount = Math.max(1, fromStart + toEnd);
    const difficultyMultiplier = getProjectedNodeDifficulty(node, node.depth);
    return { ...node, routeRoomCount, difficultyMultiplier };
  });
}

export function generateRunMap(seed = MAP_CONFIG.defaultSeed): RunMap {
  const rng = seededRng(seed);
  const startNodeId = "start";
  const endNodeId = "end";
  const layerCounts = MAP_CONFIG.roomLayerCounts;
  const maxDepth = layerCounts.length + 1;
  const nodes: RunMapNode[] = [
    { id: startNodeId, kind: "start", label: "Mettupalayam Survey Camp", depth: 0, x: 50, y: 4, routeRoomCount: 0, difficultyMultiplier: 1, outgoing: [] },
  ];

  for (let depth = 1; depth <= layerCounts.length; depth++) {
    const count = layerCounts[depth - 1];
    for (let i = 0; i < count; i++) {
      const biosphere = BIOSPHERES[Math.floor(rng() * BIOSPHERES.length)] ?? BIOSPHERES[0];
      nodes.push({
        id: `r${depth}-${i + 1}`,
        kind: "room",
        label: `Alignment ${depth}.${i + 1}`,
        depth,
        x: clamp((count === 1 ? 50 : 18 + (64 * i) / (count - 1)) + (rng() - 0.5) * 14, 8, 92),
        y: clamp(4 + (88 * depth) / maxDepth + (rng() - 0.5) * 4, 8, 92),
        biosphereId: biosphere.id,
        routeRoomCount: MAP_CONFIG.maxRouteRooms,
        difficultyMultiplier: 1,
        outgoing: [],
      });
    }
  }

  nodes.push({ id: endNodeId, kind: "end", label: "Ooty Railhead", depth: maxDepth, x: 50, y: 96, routeRoomCount: 0, difficultyMultiplier: 1, outgoing: [] });

  const getLayer = (depth: number) => nodes.filter((node) => node.depth === depth);
  const addEdge = (from: RunMapNode, toId: string) => {
    if (!from.outgoing.includes(toId) && from.outgoing.length < MAP_CONFIG.maxOutgoing) from.outgoing.push(toId);
  };

  for (let depth = 0; depth <= layerCounts.length; depth++) {
    const currentLayer = depth === 0 ? [nodes[0]] : getLayer(depth);
    const nextLayer = depth === layerCounts.length ? [nodeById({ seed, startNodeId, endNodeId, nodes, validation: { valid: true, errors: [], pathRoomCounts: [], longestRouteRooms: 0, shortestRouteRooms: 0 } }, endNodeId)!] : getLayer(depth + 1);
    currentLayer.forEach((node, index) => {
      const primaryIndex = Math.min(nextLayer.length - 1, Math.round((index / Math.max(1, currentLayer.length - 1)) * Math.max(0, nextLayer.length - 1)));
      addEdge(node, nextLayer[primaryIndex].id);
      if (nextLayer.length > 1 && rng() > 0.35) addEdge(node, nextLayer[(primaryIndex + 1) % nextLayer.length].id);
    });
    nextLayer.forEach((next, index) => {
      if (currentLayer.some((node) => node.outgoing.includes(next.id))) return;
      addEdge(currentLayer[index % currentLayer.length], next.id);
    });
  }

  for (let depth = 1; depth <= layerCounts.length - 2; depth += 2) {
    const from = getLayer(depth)[0];
    const to = getLayer(depth + 2)[0];
    if (from && to) addEdge(from, to.id);
  }
  const penultimateFast = getLayer(layerCounts.length - 1)[0];
  if (penultimateFast) addEdge(penultimateFast, endNodeId);

  const nodesWithMetrics = computeRouteMetrics(nodes, startNodeId, endNodeId);
  const validation = validateRunMap(nodesWithMetrics, startNodeId, endNodeId);
  return { seed, startNodeId, endNodeId, nodes: nodesWithMetrics, validation };
}

export function getRunMapNode(map: RunMap, nodeId: string | null | undefined): RunMapNode | undefined {
  return nodeId ? nodeById(map, nodeId) : undefined;
}

export function getSelectableMapNodeIds(map: RunMap, currentNodeId: string, completedNodeIds: string[]): string[] {
  if (!completedNodeIds.includes(currentNodeId)) return [];
  return getRunMapNode(map, currentNodeId)?.outgoing ?? [];
}

export function getMapPathRoomCounts(map: RunMap): number[] {
  return [...map.validation.pathRoomCounts];
}

export function describeRunMap(map: RunMap): string {
  return map.nodes
    .map((node) => `${node.id} -> ${node.outgoing.length ? node.outgoing.join(", ") : "none"}`)
    .join(" | ");
}

export function generateRoomFromMapNode(
  map: RunMap,
  nodeId: string,
  roomNumber: number,
  weather: ForestWeatherState
): RoomDefinition {
  const node = getRunMapNode(map, nodeId);
  const biosphere = node?.biosphereId ? BIOSPHERE_BY_ID[node.biosphereId] : BIOSPHERES[0];
  const rng = seededRng(hashSeed(map.seed, `${nodeId}:${roomNumber}`));
  const slotRange = MAP_CONFIG.roomGeneration.maxSlots - MAP_CONFIG.roomGeneration.minSlots;
  const slotCount = MAP_CONFIG.roomGeneration.minSlots + Math.floor(rng() * (slotRange + 1));
  const generatedSlots = Array.from({ length: slotCount }, () => ({
    terrainType: weightedPick(biosphere.terrainWeights, rng).terrainType as TerrainType,
    terrainAngle: weightedPick(biosphere.angleWeights, rng).terrainAngle as TerrainAngle,
  }));

  if (biosphere.dominantTerrainType && biosphere.dominantTerrainShare) {
    const minimumDominantSlots = Math.ceil(slotCount * biosphere.dominantTerrainShare);
    let dominantSlots = generatedSlots.filter((slot) => slot.terrainType === biosphere.dominantTerrainType).length;
    const replacementCandidates = generatedSlots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.terrainType !== biosphere.dominantTerrainType);

    while (dominantSlots < minimumDominantSlots && replacementCandidates.length > 0) {
      const candidateIndex = Math.floor(rng() * replacementCandidates.length);
      const candidate = replacementCandidates.splice(candidateIndex, 1)[0];
      generatedSlots[candidate.index] = {
        ...generatedSlots[candidate.index],
        terrainType: biosphere.dominantTerrainType,
      };
      dominantSlots++;
    }
  }

  const slots: RoomSlotDefinition[] = generatedSlots.map((slot) => {
    const terrain = slot.terrainType;
    const angle = slot.terrainAngle;
    const base = MAP_CONFIG.roomGeneration.basePreparation
      + roomNumber * MAP_CONFIG.roomGeneration.preparationPerRoom
      + Math.floor(rng() * (MAP_CONFIG.roomGeneration.randomPreparation + 1));
    const terrainMultiplier = MAP_CONFIG.roomGeneration.terrainPreparationMultiplier[terrain] ?? 1;
    const angleMultiplier = MAP_CONFIG.roomGeneration.anglePreparationMultiplier[angle] ?? 1;
    const weatherBonus = (terrain === "waterlogged" ? weather.wet * MAP_CONFIG.roomGeneration.weatherPreparationBonus.wetWaterlogged : 0)
      + (angle === "steep" ? weather.windy * MAP_CONFIG.roomGeneration.weatherPreparationBonus.windySteep : 0);
    const difficultyMultiplier = node ? getProjectedNodeDifficulty(node, roomNumber) : progressionDifficulty(roomNumber);
    return {
      terrainType: terrain,
      terrainAngle: angle,
      preparationRequired: Math.max(6, Math.round(base * terrainMultiplier * angleMultiplier * difficultyMultiplier + weatherBonus)),
    };
  });

  return {
    id: node?.id ?? `generated-${roomNumber}`,
    name: node ? `${node.label} - ${biosphere.name}` : `Generated Room ${roomNumber}`,
    mapNodeId: node?.id,
    biosphereId: biosphere.id,
    routeRoomCount: node?.routeRoomCount,
    difficultyMultiplier: node ? getProjectedNodeDifficulty(node, roomNumber) : progressionDifficulty(roomNumber),
    slots,
  };
}
