// GameCanvas — React wrapper around PixiWorld.
//
// - Polls /api/lobsters/top + /api/world/stats every 3 seconds
// - Manages scene state via useSceneManager
// - Side panels: live stats, selected lobster, selected location info
// - Return-to-world button overlay when in an interior

import { useEffect, useRef, useState } from "react";
import PixiWorld from "./PixiWorld.jsx";
import { api } from "../api.js";
import { useSceneManager } from "./sceneManager.js";
import { OUTER_LOCATION_BOUNDS } from "./mapOuter.js";

const POLL_INTERVAL_MS = 3000;

export default function GameCanvas() {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [lobsters, setLobsters] = useState([]);
  const [worldStats, setWorldStats] = useState(null);
  const [selectedLobster, setSelectedLobster] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [error, setError] = useState(null);

  const { scene, sceneKey, currentMap, enterInterior, exitToOuter } =
    useSceneManager();

  // Track container size for the Pixi stage
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const height = Math.max(560, Math.min(760, Math.floor(width * 0.55)));
        setSize({ width: Math.floor(width), height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Poll the REST API
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [top, stats] = await Promise.all([
          api.top("reputation", 50),
          api.stats(),
        ]);
        if (!alive) return;
        setLobsters(top.lobsters ?? []);
        setWorldStats(stats);
        setError(null);
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const handleLobsterClick = (lobster) => {
    setSelectedLobster(lobster);
    setSelectedLocation(null);
  };

  const handleEnterInterior = (locationId) => {
    enterInterior(locationId);
    setSelectedLobster(null);
    setSelectedLocation(locationId);
  };

  const handleEmptyClick = () => {
    setSelectedLobster(null);
    setSelectedLocation(null);
  };

  return (
    <section className="game-world">
      <div className="game-header">
        <h2>🌍 Live World</h2>
        <p className="hint">
          Drag to pan · Wheel to zoom · Click a building to enter · Click a lobster for details
        </p>
      </div>

      {error && (
        <div className="error">
          <strong>World sync error:</strong> {error}
        </div>
      )}

      <div className="game-layout">
        <div className="game-canvas-wrap" ref={containerRef}>
          <PixiWorld
            map={currentMap}
            sceneKey={sceneKey}
            width={size.width}
            height={size.height}
            lobsters={lobsters}
            onLobsterClick={handleLobsterClick}
            onEnterInterior={handleEnterInterior}
            onEmptyClick={handleEmptyClick}
          />
          {scene.type === "interior" && (
            <button className="exit-interior-btn" onClick={exitToOuter}>
              ← Return to world
            </button>
          )}
          {scene.type === "interior" && (
            <div className="interior-title">
              {OUTER_LOCATION_BOUNDS[scene.locationId]?.label ?? scene.locationId}
            </div>
          )}
        </div>

        <aside className="game-sidebar">
          {worldStats && (
            <div className="game-stats">
              <h3>Live stats</h3>
              <div className="stat-row">
                <span>🦞 Lobsters</span>
                <strong>{worldStats.lobsters}</strong>
              </div>
              <div className="stat-row">
                <span>💰 Coins</span>
                <strong>{worldStats.coins_in_circulation}</strong>
              </div>
              <div className="stat-row">
                <span>📋 Open tasks</span>
                <strong>{worldStats.open_tasks}</strong>
              </div>
              <div className="stat-row">
                <span>🗺️ Locations</span>
                <strong>{worldStats.locations}</strong>
              </div>
              <div className="stat-row">
                <span>📜 Events</span>
                <strong>{worldStats.events}</strong>
              </div>
            </div>
          )}

          {selectedLobster && (
            <LobsterPanel
              lobster={selectedLobster}
              onClose={() => setSelectedLobster(null)}
            />
          )}

          {selectedLocation && (
            <LocationPanel
              locationId={selectedLocation}
              onClose={() => setSelectedLocation(null)}
            />
          )}

          {!selectedLobster && !selectedLocation && (
            <div className="game-hint-box">
              <h3>Tip</h3>
              <p>
                Click a building on the map to enter its interior. Click a
                lobster to see its profile. Drag with your mouse; scroll to zoom.
              </p>
              <p style={{ marginTop: 10 }}>
                New lobsters appear automatically as people register via MCP.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------
// Info panels
// -----------------------------------------------------------------------

function LobsterPanel({ lobster, onClose }) {
  return (
    <div className="game-panel">
      <div className="game-panel-header">
        <h3>🦞 {lobster.name}</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">{lobster.bio || <em>(no bio)</em>}</p>
      <dl className="compact-dl">
        <dt>Role</dt>
        <dd>
          <RoleBadge role={lobster.role} />
        </dd>
        <dt>Job</dt>
        <dd>{lobster.job}</dd>
        <dt>Location</dt>
        <dd>{lobster.location}</dd>
        <dt>Coins</dt>
        <dd>{lobster.coins}</dd>
        <dt>Reputation</dt>
        <dd>{lobster.reputation}</dd>
        <dt>Forge</dt>
        <dd>{lobster.forge_score}</dd>
        {lobster.profession && (
          <>
            <dt>Profession</dt>
            <dd>
              {lobster.profession} (lvl {lobster.prof_level ?? 0})
            </dd>
          </>
        )}
        {lobster.personality?.length > 0 && (
          <>
            <dt>Personality</dt>
            <dd>{lobster.personality.join(", ")}</dd>
          </>
        )}
        {lobster.honor_tags?.length > 0 && (
          <>
            <dt>Honor</dt>
            <dd>{lobster.honor_tags.join(", ")}</dd>
          </>
        )}
        {lobster.badges?.length > 0 && (
          <>
            <dt>Badges</dt>
            <dd>{lobster.badges.join(", ")}</dd>
          </>
        )}
      </dl>
      {(lobster.hunger !== undefined || lobster.warmth !== undefined) && (
        <div className="stat-bars">
          {lobster.hunger !== undefined && (
            <Bar label="Hunger" value={lobster.hunger} max={100} color="#d14820" />
          )}
          {lobster.warmth !== undefined && (
            <Bar label="Warmth" value={lobster.warmth} max={100} color="#d29922" />
          )}
        </div>
      )}
    </div>
  );
}

function LocationPanel({ locationId, onClose }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [map, tasks] = await Promise.all([api.map(), api.tasks("open", 100)]);
        if (!alive) return;
        const loc = (map.locations || []).find((l) => l.id === locationId);
        const locTasks = (tasks.tasks || []).filter((t) => t.location === locationId);
        setInfo({ loc, tasks: locTasks });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [locationId]);

  if (!info) return <div className="game-panel">Loading…</div>;
  const { loc, tasks } = info;

  return (
    <div className="game-panel">
      <div className="game-panel-header">
        <h3>📍 {loc?.name ?? locationId}</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">{loc?.description}</p>
      <div className="meta">
        <span>🦞 {loc?.lobsters_here ?? 0} here</span>
        {loc?.exits?.length > 0 && <span>→ {loc.exits.join(", ")}</span>}
      </div>
      <h4 style={{ marginTop: 16, marginBottom: 8 }}>Open tasks ({tasks.length})</h4>
      {tasks.length === 0 && <p className="muted">None right now.</p>}
      {tasks.map((t) => (
        <div className="mini-task" key={t.id}>
          <strong>#{t.id}</strong> {t.title}
          <span className="meta"> · 💰 {t.reward_coins} · {t.category}</span>
        </div>
      ))}
    </div>
  );
}

function RoleBadge({ role }) {
  if (role === "god") return <span className="role-badge role-god">GOD</span>;
  if (role === "admin") return <span className="role-badge role-admin">ADMIN</span>;
  return <span className="role-badge">PLAYER</span>;
}

function Bar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="stat-bar">
      <div className="stat-bar-label">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
