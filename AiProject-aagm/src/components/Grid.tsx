import React from 'react';
import './Grid.css';
import type { Point, CellType } from '../types';

interface GridProps {
  width: number;
  height: number;
  cellSize: number;
  start: Point | null;
  end: Point | null;
  obstacles: Set<string>;
  path: Point[];
  visited: Point[];
  onCellClick: (x: number, y: number) => void;
}

export const Grid: React.FC<GridProps> = ({
  width,
  height,
  cellSize,
  start,
  end,
  obstacles,
  path,
  visited,
  onCellClick,
}) => {
  const getCellType = (x: number, y: number): CellType => {
    if (start && start.x === x && start.y === y) return 'start';
    if (end && end.x === x && end.y === y) return 'end';
    if (obstacles.has(`${x},${y}`)) return 'obstacle';
    if (path.some(p => p.x === x && p.y === y)) return 'path';
    if (visited.some(v => v.x === x && v.y === y)) return 'visited';
    return 'empty';
  };

  return (
    <div
      className="grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
        gap: '1px',
        backgroundColor: '#333',
        padding: '10px',
        borderRadius: '8px',
        width: 'fit-content',
      }}
    >
      {Array.from({ length: height }).map((_, y) =>
        Array.from({ length: width }).map((_, x) => {
          const cellType = getCellType(x, y);
          return (
            <div
              key={`${x}-${y}`}
              className={`grid-cell grid-cell-${cellType}`}
              style={{
                width: `${cellSize}px`,
                height: `${cellSize}px`,
                cursor: 'pointer',
              }}
              onClick={() => onCellClick(x, y)}
              title={`(${x}, ${y})`}
            />
          );
        })
      )}
    </div>
  );
};
