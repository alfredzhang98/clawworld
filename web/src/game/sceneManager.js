// sceneManager — React hook that tracks which map is currently visible:
// the outer world, or one of the 5 interior sub-maps.
//
// Usage:
//   const { scene, enterInterior, exitToOuter } = useSceneManager();
//   if (scene.type === "outer") { ... }
//   if (scene.type === "interior") { scene.locationId }
//
// Scene is persisted to sessionStorage so page refreshes preserve the view.

import { useCallback, useEffect, useState } from "react";
import { outerWorldMap } from "./clawworldMap.js";
import { getInterior, getInteriorLocationIds } from "./mapInteriors.js";

function getOuterMap() {
  return outerWorldMap;
}

const STORAGE_KEY = "clawworld_current_scene";

function readStoredScene() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: "outer" };
    const parsed = JSON.parse(raw);
    if (parsed.type === "interior" && getInterior(parsed.locationId)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { type: "outer" };
}

function writeStoredScene(scene) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
  } catch {
    /* ignore */
  }
}

export function useSceneManager() {
  const [scene, setScene] = useState(() => readStoredScene());

  useEffect(() => {
    writeStoredScene(scene);
  }, [scene]);

  const enterInterior = useCallback((locationId) => {
    if (!getInteriorLocationIds().includes(locationId)) {
      console.warn(`[scene] no interior for location '${locationId}'`);
      return;
    }
    setScene({ type: "interior", locationId });
  }, []);

  const exitToOuter = useCallback(() => {
    setScene({ type: "outer" });
  }, []);

  /**
   * Return the active map (outer or interior).
   */
  const currentMap =
    scene.type === "outer" ? getOuterMap() : getInterior(scene.locationId);

  /**
   * A scene identifier string like "outer" or "interior:council_hall",
   * matching what the server will store in lobster.current_scene.
   */
  const sceneKey =
    scene.type === "outer" ? "outer" : `interior:${scene.locationId}`;

  return { scene, sceneKey, currentMap, enterInterior, exitToOuter };
}
