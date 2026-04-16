import React, { useEffect, useMemo, useState } from 'react';
import './Controls.css';
import { mapNodes } from '../mapData';

interface ControlsProps {
  start: string | null;
  end: string | null;
  onClearAll: () => void;
  isRunning: boolean;
  pathFound: boolean | null;
  distance: number;
  focusedNodeId: string | null;
  onSearchCity: (nodeId: string) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  start,
  end,
  onClearAll,
  isRunning,
  pathFound,
  distance,
  focusedNodeId,
  onSearchCity,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  const sortedNodes = useMemo(
    () => [...mapNodes].sort((left, right) => left.name.localeCompare(right.name)),
    []
  );

  const startName = start ? mapNodes.find(n => n.id === start)?.name : null;
  const endName = end ? mapNodes.find(n => n.id === end)?.name : null;
  const focusedNodeName = focusedNodeId
    ? mapNodes.find((node) => node.id === focusedNodeId)?.name ?? null
    : null;

  const matchedCities = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (query.length === 0) {
      return sortedNodes.slice(0, 8);
    }

    return sortedNodes
      .filter((node) => node.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchTerm, sortedNodes]);

  const showDistance = pathFound === true && Number.isFinite(distance);
  const distanceText = showDistance
    ? `${distance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`
    : '--';
  const distanceHint = isRunning
    ? 'Calculating route distance...'
    : showDistance
      ? 'Shortest path distance computed from geodesic city-to-city road lengths.'
      : 'Run A* or Dijkstra to calculate total distance travelled.';

  useEffect(() => {
    if (!focusedNodeName) {
      return;
    }

    setSearchTerm(focusedNodeName);
    setSearchFeedback(`Focused on ${focusedNodeName}`);
  }, [focusedNodeName]);

  const handleSelectCity = (nodeId: string) => {
    const selectedNode = mapNodes.find((node) => node.id === nodeId);
    if (!selectedNode) {
      return;
    }

    setSearchTerm(selectedNode.name);
    setShowSuggestions(false);
    setSearchFeedback(`Focused on ${selectedNode.name}`);
    onSearchCity(selectedNode.id);
  };

  const handleSearchSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      setSearchFeedback('Type a city name to search.');
      return;
    }

    const exactMatch = sortedNodes.find((node) => node.name.toLowerCase() === query);
    if (exactMatch) {
      handleSelectCity(exactMatch.id);
      return;
    }

    const firstMatch = sortedNodes.find((node) => node.name.toLowerCase().includes(query));
    if (firstMatch) {
      handleSelectCity(firstMatch.id);
      return;
    }

    setSearchFeedback('No matching city found. Try a different spelling.');
    setShowSuggestions(true);
  };

  return (
    <div className="controls-panel">
      <div className="controls-section">
        <h3>Adventure Route Planner</h3>
        <p className="section-subtitle">
          Find the shortest path between destinations
        </p>
      </div>

      <div className="controls-section">
        <h3>City Search</h3>
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className="search-input"
            placeholder="Search city and focus node"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              window.setTimeout(() => {
                setShowSuggestions(false);
              }, 120);
            }}
          />
          <button type="submit" className="btn btn-primary search-button">
            Locate
          </button>
        </form>

        {showSuggestions && (
          <div className="search-results">
            {matchedCities.length > 0 ? (
              matchedCities.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className="search-result-item"
                  onClick={() => handleSelectCity(node.id)}
                >
                  {node.name}
                </button>
              ))
            ) : (
              <div className="search-empty">No cities match your search.</div>
            )}
          </div>
        )}

        {searchFeedback && <p className="search-feedback">{searchFeedback}</p>}
      </div>

      <div className="controls-section">
        <h3>Route Setup</h3>
        <div className="control-group">
          <label>Starting Location:</label>
          <div className="location-display">
            {startName ? (
              <>
                <span className="location-badge" style={{ backgroundColor: '#b8c832' }}></span>
                {startName}
              </>
            ) : (
              <span className="location-empty">Click a destination to start</span>
            )}
          </div>
        </div>
        <div className="control-group">
          <label>Destination:</label>
          <div className="location-display">
            {endName ? (
              <>
                <span className="location-badge" style={{ backgroundColor: '#f0a844' }}></span>
                {endName}
              </>
            ) : (
              <span className="location-empty">Click a destination to end</span>
            )}
          </div>
        </div>
      </div>

      <div className="controls-section">
        <h3>Total Distance Travelled</h3>
        <div className="distance-display">{distanceText}</div>
        <p className="distance-caption">{distanceHint}</p>
      </div>

      {pathFound === false && (
        <div className="controls-section result-error">
          <h3>✗ No Route Found</h3>
          <p>These locations are not connected.</p>
        </div>
      )}

      <div className="controls-section">
        <button
          onClick={onClearAll}
          disabled={isRunning}
          className="btn btn-danger"
        >
          Clear Route
        </button>
      </div>

    </div>
  );
};
