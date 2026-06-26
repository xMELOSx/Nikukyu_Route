import { useState, useEffect, useCallback, useRef } from 'react';
import { type HeistMarker } from '../utils/DataManager';

const START_MARKER_ID = 'marker_start_global_001';
const START_MARKER: HeistMarker = {
  id: START_MARKER_ID,
  type: 'start',
  x: 693,
  y: 4500,
  note: 'スタート',
  floor: 'main',
  popupDirection: 'top',
  popupWidth: 300,
  popupHeight: 0,
  popupOffset: { x: 0, y: -100 }
};

function backfillDefaults(m: HeistMarker): HeistMarker {
  const updated: HeistMarker = { ...m };
  if (m.type === 'boss') {
    if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
    if (updated.bossDrops === undefined) updated.bossDrops = [];
  } else if (m.type === 'battle' || m.type === 'gbattle') {
    if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
  } else if (m.type === 'picking' || m.type === 'gpicking') {
    if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
    if (updated.pickingPicky === undefined) updated.pickingPicky = false;
  } else if (m.type === 'long_picking' || m.type === 'glong_picking') {
    if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
    if (updated.pickingPicky === undefined) updated.pickingPicky = false;
  }
  return updated;
}

function filterLegacyAndClean(markers: HeistMarker[]): HeistMarker[] {
  return markers
    .filter(m => m.type !== ('camera' as any) && m.type !== ('guard' as any))
    .map(m => {
      const cleaned: HeistMarker = { ...m };
      if (cleaned.warpWaypoints) {
        cleaned.warpWaypoints = cleaned.warpWaypoints.filter(
          (wp: any) => wp !== null && wp !== undefined
        );
      }
      return backfillDefaults(cleaned);
    });
}

function ensureStart(markers: HeistMarker[]): HeistMarker[] {
  if (markers.some(m => m.id === START_MARKER_ID)) return markers;
  return [...markers, { ...START_MARKER }];
}

function persist(markers: HeistMarker[], isLocal: boolean) {
  localStorage.setItem('heist_global_markers', JSON.stringify(markers));
  if (isLocal) {
    fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(markers)
    }).catch(err => console.error('Failed to sync global markers:', err));
  }
}

export interface UseGlobalMarkersOptions {
  isLocal: boolean;
}

export interface UseGlobalMarkersApi {
  globalMarkers: HeistMarker[];
  setGlobalMarkers: React.Dispatch<React.SetStateAction<HeistMarker[]>>;
  /** Replace the entire set (used by undo/redo). Persists to localStorage and API. */
  replace: (markers: HeistMarker[]) => void;
  /** Merge incoming markers into the current set. Existing IDs are kept as-is
   *  (user edits preserved); only IDs that don't exist locally are added. */
  mergeFromImport: (incoming: HeistMarker[]) => void;
}

/**
 * Global marker state. Loads from the API (or static fallback, or localStorage)
 * on mount, ensures the START marker exists, and persists mutations. The merge
 * helpers preserve user edits (existing IDs are kept; new IDs are appended).
 */
export function useGlobalMarkers({ isLocal }: UseGlobalMarkersOptions): UseGlobalMarkersApi {
  const [globalMarkers, setGlobalMarkers] = useState<HeistMarker[]>([]);
  const isLocalRef = useRef(isLocal);
  isLocalRef.current = isLocal;

  // Load on mount. The priority is localStorage-first: once the user has
  // markers in their browser, that is the source of truth. The API and the
  // static `global_markers.json` file are only consulted as a *seed* for new
  // visitors (localStorage empty) — and even then we MERGE incoming markers
  // into whatever exists, never blindly REPLACE. This prevents a corrupted
  // or empty file from wiping the user's data on every page load.
  useEffect(() => {
    let cancelled = false;

    const applyMerge = (incoming: HeistMarker[]) => {
      if (cancelled) return;
      const cleaned = filterLegacyAndClean(incoming);
      setGlobalMarkers(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = cleaned.filter(m => !existingIds.has(m.id));
        if (newOnes.length === 0) return prev;
        const merged = ensureStart([...prev, ...newOnes]);
        persist(merged, isLocalRef.current);
        return merged;
      });
    };

    const loadFromLocalStorage = (): HeistMarker[] | null => {
      const saved = localStorage.getItem('heist_global_markers');
      if (!saved) return null;
      try {
        const parsed: HeistMarker[] = JSON.parse(saved);

        // Legacy 2x coordinate migration
        const migrated = localStorage.getItem('heist_global_markers_migrated_v2') === 'true'
          ? parsed
          : parsed.map(m => {
              const updated: HeistMarker = { ...m, x: m.x * 2, y: m.y * 2 };
              if (updated.scrollConfig) {
                updated.scrollConfig = {
                  ...updated.scrollConfig,
                  x: updated.scrollConfig.x * 2,
                  y: updated.scrollConfig.y * 2
                };
              }
              return updated;
            });

        const cleaned = filterLegacyAndClean(migrated);
        const withStart = ensureStart(cleaned);
        // Persist the migrated/cleaned version back so we don't redo the
        // migration on every load, and to surface the file via the API.
        localStorage.setItem('heist_global_markers', JSON.stringify(withStart));
        localStorage.setItem('heist_global_markers_migrated_v2', 'true');
        if (isLocalRef.current) persist(withStart, true);
        return withStart;
      } catch (e) {
        console.error('Failed to load global markers from localStorage:', e);
        return null;
      }
    };

    const seedFromApiOrFile = async () => {
      try {
        const apiRes = await fetch(`${import.meta.env.BASE_URL}api/global-markers`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (Array.isArray(data) && data.length > 0) {
            applyMerge(data);
            return;
          }
        }
      } catch { /* fall through to static file */ }

      try {
        const fileRes = await fetch(`${import.meta.env.BASE_URL}global_markers.json`);
        if (fileRes.ok) {
          const fallback = await fileRes.json();
          if (Array.isArray(fallback) && fallback.length > 0) {
            applyMerge(fallback);
            return;
          }
        }
      } catch { /* fall through */ }

      // Last resort: nothing in localStorage, API, or file. Create just the
      // START marker so the user has at least a valid empty state.
      if (!cancelled) {
        const startOnly = ensureStart([]);
        setGlobalMarkers(startOnly);
        localStorage.setItem('heist_global_markers', JSON.stringify(startOnly));
      }
    };

    const local = loadFromLocalStorage();
    if (local && local.length > 0) {
      // localStorage is authoritative. Surface the data immediately and
      // asynchronously merge any new markers from the API/file (additive only).
      if (cancelled) return;
      setGlobalMarkers(local);
      seedFromApiOrFile();
    } else {
      // First visit (or localStorage was wiped): seed from API/file.
      seedFromApiOrFile();
    }

    return () => { cancelled = true; };
  }, []);

  // Ensure START exists if the list is mutated externally
  useEffect(() => {
    if (globalMarkers.some(m => m.id === START_MARKER_ID)) return;
    setGlobalMarkers(prev => {
      if (prev.some(m => m.id === START_MARKER_ID)) return prev;
      const next = [...prev, { ...START_MARKER }];
      persist(next, isLocalRef.current);
      return next;
    });
  }, [globalMarkers]);

  const replace = useCallback((markers: HeistMarker[]) => {
    setGlobalMarkers(markers);
    persist(markers, isLocalRef.current);
  }, []);

  const mergeFromImport = useCallback((incoming: HeistMarker[]) => {
    setGlobalMarkers(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const newOnes = incoming.filter(m => !existingIds.has(m.id));
      if (newOnes.length === 0) return prev;
      const merged = [...prev, ...newOnes];
      persist(merged, isLocalRef.current);
      return merged;
    });
  }, []);

  return {
    globalMarkers, setGlobalMarkers, replace, mergeFromImport
  };
}
