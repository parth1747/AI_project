export interface Point {
  x: number;
  y: number;
}

export interface PathfindingResult {
  path: string[]; // Array of node IDs
  visited: string[]; // Array of visited node IDs
  algorithm: 'astar' | 'dijkstra';
  distance: number;
}

export type CellType = 'empty' | 'obstacle' | 'start' | 'end' | 'path' | 'visited';
