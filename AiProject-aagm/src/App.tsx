import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { Map3D } from './components/Map3D';
import { Controls } from './components/Controls';
import { aStar, dijkstra } from './algorithms';
import type { PathfindingResult } from './types';

const VISITED_STEP_MS = 140;
const PATH_STEP_MS = 520;
const TRANSITION_PAUSE_MS = 420;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [distance, setDistance] = useState<number>(0);
  const [pathFound, setPathFound] = useState<boolean | null>(null);
  const [algorithmUsed, setAlgorithmUsed] = useState<string | null>(null);
  const activeRunIdRef = useRef(0);

  useEffect(() => {
    return () => {
      activeRunIdRef.current += 1;
    };
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (isRunning) {
      return;
    }

    setFocusedNodeId(nodeId);
    setFocusSignal((previous) => previous + 1);

    // Toggle start point
    if (start === nodeId) {
      setStart(null);
      return;
    }

    // Toggle end point
    if (end === nodeId) {
      setEnd(null);
      return;
    }

    // Set start if not set
    if (!start) {
      setStart(nodeId);
      return;
    }

    // Set end if not set
    if (!end) {
      setEnd(nodeId);
      return;
    }

    // If both are set, clicking selects new start
    setStart(nodeId);
    setEnd(null);
  }, [start, end, isRunning]);

  const handleSearchCity = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    setFocusSignal((previous) => previous + 1);
  }, []);

  const handleViewRotationChange = useCallback((azimuth: number, polar: number) => {
    const appElement = appRef.current;
    if (!appElement) {
      return;
    }

    const shiftX = azimuth * 24;
    const shiftY = (polar - Math.PI / 2) * 24;

    appElement.style.setProperty('--space-shift-x', `${shiftX.toFixed(2)}px`);
    appElement.style.setProperty('--space-shift-y', `${shiftY.toFixed(2)}px`);
    appElement.style.setProperty('--space-shift-x-far', `${(-shiftX * 0.42).toFixed(2)}px`);
    appElement.style.setProperty('--space-shift-y-far', `${(-shiftY * 0.42).toFixed(2)}px`);
    appElement.style.setProperty('--space-spin', `${(azimuth * 7.4).toFixed(2)}deg`);
    appElement.style.setProperty('--space-spin-far', `${(azimuth * -2.8).toFixed(2)}deg`);

    const wallpaperShiftX = shiftX * 0.64;
    const wallpaperShiftY = shiftY * 0.64;
    const wallpaperRotate = azimuth * 2.1;
    const wallpaperScale = 1.16 + Math.min(0.06, Math.abs(polar - Math.PI / 2) * 0.14);
    const wallpaperBrightness =
      0.82 + Math.min(0.2, Math.abs(azimuth) * 0.06 + Math.abs(polar - Math.PI / 2) * 0.22);
    const wallpaperContrast = 1.06 + Math.min(0.2, Math.abs(azimuth) * 0.05);

    appElement.style.setProperty('--wallpaper-shift-x', `${wallpaperShiftX.toFixed(2)}px`);
    appElement.style.setProperty('--wallpaper-shift-y', `${wallpaperShiftY.toFixed(2)}px`);
    appElement.style.setProperty('--wallpaper-rotate', `${wallpaperRotate.toFixed(2)}deg`);
    appElement.style.setProperty('--wallpaper-scale', wallpaperScale.toFixed(3));
    appElement.style.setProperty('--wallpaper-brightness', wallpaperBrightness.toFixed(3));
    appElement.style.setProperty('--wallpaper-contrast', wallpaperContrast.toFixed(3));
  }, []);

  const runAlgorithm = useCallback(
    (algorithmFn: typeof aStar | typeof dijkstra, algorithmName: string) => {
      if (!start || !end) return;

      const runId = activeRunIdRef.current + 1;
      activeRunIdRef.current = runId;

      setIsRunning(true);
      setPath([]);
      setVisited([]);
      setDistance(0);
      setPathFound(null);
      setAlgorithmUsed(algorithmName);

      const result: PathfindingResult = algorithmFn(start, end);

      const animateResult = async () => {
        const seenVisited = new Set<string>();
        const orderedVisited = result.visited.filter((nodeId) => {
          if (seenVisited.has(nodeId)) {
            return false;
          }
          seenVisited.add(nodeId);
          return true;
        });

        for (const nodeId of orderedVisited) {
          if (activeRunIdRef.current !== runId) {
            return;
          }

          setVisited((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
          await sleep(VISITED_STEP_MS);
        }

        if (result.path.length > 0) {
          await sleep(TRANSITION_PAUSE_MS);

          for (const nodeId of result.path) {
            if (activeRunIdRef.current !== runId) {
              return;
            }

            setPath((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
            await sleep(PATH_STEP_MS);
          }
        }

        if (activeRunIdRef.current !== runId) {
          return;
        }

        setDistance(result.distance);
        setPathFound(result.path.length > 0);
        setIsRunning(false);
      };

      void animateResult();
    },
    [start, end]
  );

  const handleRunAStar = () => runAlgorithm(aStar, 'A*');
  const handleRunDijkstra = () => runAlgorithm(dijkstra, 'Dijkstra');

  const handleClearAll = useCallback(() => {
    activeRunIdRef.current += 1;
    setIsRunning(false);
    setStart(null);
    setEnd(null);
    setPath([]);
    setVisited([]);
    setFocusedNodeId(null);
    setFocusSignal((previous) => previous + 1);
    setDistance(0);
    setPathFound(null);
    setAlgorithmUsed(null);
  }, []);

  const readyToRun = Boolean(start && end && !isRunning);

  return (
    <div ref={appRef} className="app">
      <div className="space-layer" aria-hidden="true">
        <video
          className="space-video"
          src="/background.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div className="space-video-vignette" />
        <div className="space-nebula" />
        <div className="space-stars stars-near" />
        <div className="space-stars stars-far" />
      </div>

      <div className="app-content">
        <header className="app-header">
          <h1>ball noer</h1>
        </header>

        <div className="app-layout">
          <div className="map-container">
            <Map3D
              start={start}
              end={end}
              path={path}
              visited={visited}
              focusNodeId={focusedNodeId}
              focusSignal={focusSignal}
              algorithmUsed={algorithmUsed}
              onViewRotationChange={handleViewRotationChange}
              onNodeClick={handleNodeClick}
            />
          </div>

          <aside className="controls-sidebar">
            <Controls
              start={start}
              end={end}
              onClearAll={handleClearAll}
              isRunning={isRunning}
              pathFound={pathFound}
              distance={distance}
              focusedNodeId={focusedNodeId}
              onSearchCity={handleSearchCity}
            />
          </aside>
        </div>

        <footer className="algorithm-dock" aria-label="Pathfinding algorithms">
          <button
            type="button"
            onClick={handleRunAStar}
            disabled={!readyToRun}
            className="algo-btn algo-btn-primary"
          >
            Run A*
          </button>
          <button
            type="button"
            onClick={handleRunDijkstra}
            disabled={!readyToRun}
            className="algo-btn algo-btn-primary"
          >
            Run Dijkstra
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
