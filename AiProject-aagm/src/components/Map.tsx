import React from 'react';
import './Map.css';
import { mapNodes, roads, getNodeById } from '../mapData';

interface MapProps {
  start: string | null;
  end: string | null;
  path: string[];
  visited: string[];
  onNodeClick: (nodeId: string) => void;
}

export const Map: React.FC<MapProps> = ({
  start,
  end,
  path,
  visited,
  onNodeClick,
}) => {
  const canvasWidth = 1150;
  const canvasHeight = 600;

  const isNodeVisited = (nodeId: string) => visited.includes(nodeId);
  const isNodeOnPath = (nodeId: string) => path.includes(nodeId);

  const getRoadClass = (fromId: string, toId: string) => {
    const fromOnPath = path.includes(fromId);
    const toOnPath = path.includes(toId);
    if (fromOnPath && toOnPath) {
      const fromIndex = path.indexOf(fromId);
      const toIndex = path.indexOf(toId);
      if (Math.abs(fromIndex - toIndex) === 1) {
        return 'road-path';
      }
    }
    return 'road';
  };

  const getMidpoint = (x1: number, y1: number, x2: number, y2: number) => {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  };

  return (
    <svg
      className="map"
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
    >
      {/* Background gradient */}
      <defs>
        <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f2117" />
          <stop offset="100%" stopColor="#1a3a28" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={canvasWidth} height={canvasHeight} fill="url(#mapGradient)" />

      {/* Draw roads */}
      {roads.map((road, idx) => {
        const fromNode = getNodeById(road.fromId);
        const toNode = getNodeById(road.toId);
        if (!fromNode || !toNode) return null;

        const isOnPath = getRoadClass(road.fromId, road.toId) === 'road-path';
        const pathFound = path.length > 0;
        
        // Hide roads if path is found and road is not on the path
        if (pathFound && !isOnPath) return null;

        const midpoint = getMidpoint(fromNode.x, fromNode.y, toNode.x, toNode.y);

        return (
          <g key={`road-${idx}`}>
            <line
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              className={`road ${getRoadClass(road.fromId, road.toId)}`}
              strokeWidth="4"
            />
            {/* Road distance label */}
            <text
              x={midpoint.x}
              y={midpoint.y}
              className={`road-label ${isOnPath ? 'road-label-path' : ''}`}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {road.distance}
            </text>
          </g>
        );
      })}

      {/* Draw nodes */}
      {mapNodes.map((node) => {
        const isStart = start === node.id;
        const isEnd = end === node.id;
        const onPath = isNodeOnPath(node.id);
        const isVisited = isNodeVisited(node.id);
        const pathFound = path.length > 0;
        
        // Hide nodes if path is found and node is not start, end, or on path
        if (pathFound && !onPath && !isStart && !isEnd) return null;

        let nodeClass = 'node';
        if (isStart) nodeClass += ' node-start';
        else if (isEnd) nodeClass += ' node-end';
        else if (onPath) nodeClass += ' node-path';
        else if (isVisited) nodeClass += ' node-visited';

        return (
          <g key={`node-${node.id}`} onClick={() => onNodeClick(node.id)}>
            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r="14"
              className={nodeClass}
            />
            {/* Node name label below the node */}
            <text
              x={node.x}
              y={node.y + 28}
              className="node-label"
              textAnchor="middle"
              dominantBaseline="text-before-edge"
            >
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
