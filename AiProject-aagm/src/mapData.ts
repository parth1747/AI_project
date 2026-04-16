import type { Point } from './types';
import { cityCoordinates } from './cityCoordinates';

export interface MapNode extends Point {
  id: string;
  name: string;
  lat: number;
  lon: number;
  countryCode: string;
}

export interface Road {
  fromId: string;
  toId: string;
  distance: number;
}

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const ROAD_NEIGHBORS = 4;
const ROAD_LONG_LINK_STEP = 19;
const indiaCityCoordinates = cityCoordinates.filter((city) => city.countryCode === 'IN');

function toRadians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

function createId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const a =
    sinLat * sinLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLon * sinLon;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

const averageLatitudeRadians =
  indiaCityCoordinates.length > 0
    ? (indiaCityCoordinates.reduce((sum, city) => sum + city.lat, 0) / indiaCityCoordinates.length) *
      DEG_TO_RAD
    : 0;
const mapProjectionScale = 12;

function projectToPoint(lat: number, lon: number): Point {
  return {
    x: lon * Math.cos(averageLatitudeRadians) * mapProjectionScale,
    y: lat * mapProjectionScale,
  };
}

function createRoadKey(fromId: string, toId: string): string {
  return fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
}

export const mapNodes: MapNode[] = indiaCityCoordinates.map((city) => {
  const projected = projectToPoint(city.lat, city.lon);
  return {
    id: createId(city.name),
    name: city.name,
    lat: city.lat,
    lon: city.lon,
    countryCode: city.countryCode,
    x: projected.x,
    y: projected.y,
  };
});

const nodeById = new Map(mapNodes.map((node) => [node.id, node]));
const roadsByKey: Map<string, Road> = new Map();

function addRoad(fromNode: MapNode, toNode: MapNode): void {
  if (fromNode.id === toNode.id) {
    return;
  }

  const roadKey = createRoadKey(fromNode.id, toNode.id);
  if (roadsByKey.has(roadKey)) {
    return;
  }

  const distanceKm = haversineDistanceKm(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);

  roadsByKey.set(roadKey, {
    fromId: fromNode.id,
    toId: toNode.id,
    distance: Number(distanceKm.toFixed(2)),
  });
}

function buildAdjacencyFromRoads(roadMap: Map<string, Road>): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  mapNodes.forEach((node) => {
    adjacency.set(node.id, new Set<string>());
  });

  roadMap.forEach((road) => {
    adjacency.get(road.fromId)?.add(road.toId);
    adjacency.get(road.toId)?.add(road.fromId);
  });

  return adjacency;
}

function getConnectedComponents(roadMap: Map<string, Road>): string[][] {
  const adjacency = buildAdjacencyFromRoads(roadMap);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of mapNodes) {
    if (visited.has(node.id)) {
      continue;
    }

    const stack = [node.id];
    const component: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);
      component.push(current);

      const neighbors = adjacency.get(current);
      if (!neighbors) {
        continue;
      }

      neighbors.forEach((neighborId) => {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      });
    }

    components.push(component);
  }

  return components;
}

function connectSeparateComponents(): void {
  let components = getConnectedComponents(roadsByKey);

  while (components.length > 1) {
    const baseComponent = components[0];

    for (let i = 1; i < components.length; i += 1) {
      const targetComponent = components[i];
      let bestPair: { from: MapNode; to: MapNode; distance: number } | null = null;

      for (const fromId of baseComponent) {
        const fromNode = nodeById.get(fromId);
        if (!fromNode) {
          continue;
        }

        for (const toId of targetComponent) {
          const toNode = nodeById.get(toId);
          if (!toNode) {
            continue;
          }

          const distance = haversineDistanceKm(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);
          if (!bestPair || distance < bestPair.distance) {
            bestPair = { from: fromNode, to: toNode, distance };
          }
        }
      }

      if (bestPair) {
        addRoad(bestPair.from, bestPair.to);
      }
    }

    components = getConnectedComponents(roadsByKey);
  }
}

mapNodes.forEach((node, index) => {
  const nearestNodes = mapNodes
    .filter((candidate) => candidate.id !== node.id)
    .map((candidate) => ({
      node: candidate,
      distance: haversineDistanceKm(node.lat, node.lon, candidate.lat, candidate.lon),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, ROAD_NEIGHBORS);

  nearestNodes.forEach(({ node: nearestNode }) => {
    addRoad(node, nearestNode);
  });

  const longRangeNode = mapNodes[(index + ROAD_LONG_LINK_STEP) % mapNodes.length];
  addRoad(node, longRangeNode);
});

connectSeparateComponents();

export const roads: Road[] = Array.from(roadsByKey.values());

export function getNodeById(id: string): MapNode | undefined {
  return nodeById.get(id);
}

export function getAerialDistanceKm(fromId: string, toId: string): number {
  const fromNode = nodeById.get(fromId);
  const toNode = nodeById.get(toId);

  if (!fromNode || !toNode) {
    return Infinity;
  }

  return haversineDistanceKm(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);
}

export function getConnectedNodes(nodeId: string): MapNode[] {
  const connectedIds = roads
    .filter((road) => road.fromId === nodeId || road.toId === nodeId)
    .map((road) => (road.fromId === nodeId ? road.toId : road.fromId));

  return connectedIds
    .map((id) => nodeById.get(id))
    .filter((node): node is MapNode => Boolean(node));
}

export function getRoadDistance(fromId: string, toId: string): number {
  const road = roads.find(
    (r) =>
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId && r.toId === fromId)
  );

  return road?.distance ?? Infinity;
}
