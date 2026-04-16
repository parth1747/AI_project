import type { PathfindingResult } from './types';
import {
  getAerialDistanceKm,
  getConnectedNodes,
  getRoadDistance,
  getNodeById,
  mapNodes,
} from './mapData';

function heuristic(nodeId: string, endId: string): number {
  return getAerialDistanceKm(nodeId, endId);
}

export function aStar(
  startId: string,
  endId: string
): PathfindingResult {
  if (!getNodeById(startId) || !getNodeById(endId)) {
    return { path: [], visited: [], algorithm: 'astar', distance: Infinity };
  }

  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const cameFrom: Map<string, string | null> = new Map();
  const gScore: Map<string, number> = new Map();
  const fScore: Map<string, number> = new Map();
  const visited: string[] = [];

  mapNodes.forEach((node) => {
    gScore.set(node.id, Infinity);
    fScore.set(node.id, Infinity);
  });

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(startId, endId));
  cameFrom.set(startId, null);
  openSet.add(startId);

  while (openSet.size > 0) {
    let current: string | null = null;
    let currentF = Infinity;

    for (const nodeId of openSet) {
      const score = fScore.get(nodeId) ?? Infinity;
      if (score < currentF) {
        current = nodeId;
        currentF = score;
      }
    }

    if (current === null) {
      break;
    }

    openSet.delete(current);

    if (closedSet.has(current)) {
      continue;
    }

    closedSet.add(current);
    visited.push(current);

    if (current === endId) {
      const path: string[] = [];
      let trace: string | null = endId;

      while (trace !== null) {
        path.unshift(trace);
        trace = cameFrom.get(trace) ?? null;
      }

      return {
        path,
        visited,
        algorithm: 'astar',
        distance: gScore.get(endId) ?? Infinity,
      };
    }

    const currentG = gScore.get(current) ?? Infinity;
    const neighbors = getConnectedNodes(current);

    for (const neighbor of neighbors) {
      if (closedSet.has(neighbor.id)) continue;

      const tentativeG = currentG + getRoadDistance(current, neighbor.id);
      const neighborG = gScore.get(neighbor.id) ?? Infinity;

      if (tentativeG < neighborG) {
        cameFrom.set(neighbor.id, current);
        gScore.set(neighbor.id, tentativeG);
        fScore.set(neighbor.id, tentativeG + heuristic(neighbor.id, endId));
        openSet.add(neighbor.id);
      }
    }
  }

  return { path: [], visited, algorithm: 'astar', distance: Infinity };
}

export function dijkstra(
  startId: string,
  endId: string
): PathfindingResult {
  if (!getNodeById(startId) || !getNodeById(endId)) {
    return { path: [], visited: [], algorithm: 'dijkstra', distance: Infinity };
  }

  const distances: Map<string, number> = new Map();
  const previousNodes: Map<string, string | null> = new Map();
  const unvisited = new Set<string>();
  const visited: string[] = [];

  // Initialize distances
  mapNodes.forEach(node => {
    distances.set(node.id, Infinity);
    previousNodes.set(node.id, null);
    unvisited.add(node.id);
  });

  distances.set(startId, 0);

  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current: string | null = null;
    let minDistance = Infinity;

    for (const id of unvisited) {
      const dist = distances.get(id) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        current = id;
      }
    }

    if (current === null || minDistance === Infinity) break;

    visited.push(current);

    if (current === endId) {
      const path: string[] = [];
      let currentId: string | null = endId;
      while (currentId !== null) {
        path.unshift(currentId);
        currentId = previousNodes.get(currentId) ?? null;
      }
      return { path, visited, algorithm: 'dijkstra', distance: distances.get(endId) ?? Infinity };
    }

    unvisited.delete(current);

    const neighbors = getConnectedNodes(current);
    for (const neighbor of neighbors) {
      if (!unvisited.has(neighbor.id)) continue;

      const roadCost = getRoadDistance(current, neighbor.id);
      const newDistance = (distances.get(current) ?? 0) + roadCost;
      const oldDistance = distances.get(neighbor.id) ?? Infinity;

      if (newDistance < oldDistance) {
        distances.set(neighbor.id, newDistance);
        previousNodes.set(neighbor.id, current);
      }
    }
  }

  return { path: [], visited, algorithm: 'dijkstra', distance: Infinity };
}
