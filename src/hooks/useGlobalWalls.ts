import { useCallback, useEffect, useRef, useState } from 'react';
import { type FloorType, type Point } from '../utils/DataManager';

const GLOBAL_WALLS_FILE = 'global_walls.json';
const LOCAL_STORAGE_KEY = 'heist_global_walls_v2';

export type GlobalWalls = { [key: string]: [Point, Point][] };

function normalizeFloorKey(k: string): string {
  if (k === 'main' || k === 'second' || k === 'third' || k === 'fourth') return k;
  return k;
}

function sanitizeWalls(raw: unknown): GlobalWalls {
  const out: GlobalWalls = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [floor, segs] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(segs)) continue;
    const cleaned: [Point, Point][] = [];
    for (const seg of segs) {
      if (!Array.isArray(seg) || seg.length < 2) continue;
      const a = seg[0] as Point;
      const b = seg[1] as Point;
      if (
        !a || !b ||
        typeof a.x !== 'number' || typeof a.y !== 'number' ||
        typeof b.x !== 'number' || typeof b.y !== 'number'
      ) continue;
      cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    }
    if (cleaned.length > 0) {
      out[normalizeFloorKey(floor)] = cleaned;
    }
  }
  return out;
}

function isEmpty(walls: GlobalWalls): boolean {
  return Object.values(walls).every((arr) => !Array.isArray(arr) || arr.length === 0);
}

function loadFromLocalStorage(): GlobalWalls | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cleaned = sanitizeWalls(parsed);
    if (isEmpty(cleaned)) return null;
    return cleaned;
  } catch {
    return null;
  }
}

function saveToLocalStorage(walls: GlobalWalls): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(walls));
  } catch { /* quota / unavailable: ignore */ }
}

export interface UseGlobalWallsOptions {
  isLocal: boolean;
}

export interface UseGlobalWallsApi {
  walls: GlobalWalls;
  /** Direct ref to the current walls (always up-to-date, safe for callbacks). */
  wallsRef: React.MutableRefObject<GlobalWalls>;
  /** Replace the whole wall set (e.g. on clear). */
  replaceWalls: (next: GlobalWalls) => void;
  /** Update walls for a single floor. */
  setFloorWalls: (floor: FloorType | string, segments: [Point, Point][]) => void;
  /** Clear walls for a specific floor (or all floors when omitted). */
  clearFloorWalls: (floor?: FloorType | string) => void;
  /** Build a JSON string for exporting back into global_walls.json. */
  exportJson: () => string;
  /** Trigger a browser download of the current walls as JSON. */
  downloadJson: (filename?: string) => void;
  /** True when global_walls.json has been fetched (success or fail). */
  loaded: boolean;
}

/**
 * Global wall state. Walls are shared across all plans, so the data must
 * come from a place that is shared by everyone, not from a single browser's
 * localStorage.
 *
 * Priority on load:
 *   1) localStorage  — local edits win on this device
 *   2) global_walls.json (fetched from BASE_URL) — committed shared default
 *
 * Mutations (replaceWalls / setFloorWalls / clearFloorWalls) are persisted
 * to localStorage so the user's local edits survive page reload. To push
 * a curated change to everyone, the user can call `downloadJson` and
 * commit the result back to global_walls.json in the repo.
 */
export function useGlobalWalls({ isLocal }: UseGlobalWallsOptions): UseGlobalWallsApi {
  void isLocal;
  const [walls, setWalls] = useState<GlobalWalls>({});
  const [loaded, setLoaded] = useState(false);
  const wallsRef = useRef<GlobalWalls>(walls);

  // Keep wallsRef in sync with the latest walls state.
  useEffect(() => {
    wallsRef.current = walls;
  }, [walls]);

  useEffect(() => {
    let cancelled = false;

    const apply = (next: GlobalWalls) => {
      if (cancelled) return;
      setWalls(next);
      wallsRef.current = next;
    };

    const loadFromFile = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${GLOBAL_WALLS_FILE}`);
        if (!res.ok) return;
        const data = await res.json();
        const cleaned = sanitizeWalls(data);
        if (cancelled || isEmpty(cleaned)) return;
        apply(cleaned);
      } catch (err) {
        console.error('Failed to load global_walls.json:', err);
      }
    };

    const local = loadFromLocalStorage();
    if (local) {
      apply(local);
      setLoaded(true);
    } else {
      loadFromFile().then(() => {
        if (!cancelled) setLoaded(true);
      });
    }

    return () => { cancelled = true; };
  }, []);

  const replaceWalls = useCallback((next: GlobalWalls) => {
    const cleaned = sanitizeWalls(next);
    setWalls(cleaned);
    wallsRef.current = cleaned;
    saveToLocalStorage(cleaned);
  }, []);

  const setFloorWalls = useCallback((floor: FloorType | string, segments: [Point, Point][]) => {
    const key = normalizeFloorKey(String(floor));
    const cleaned: [Point, Point][] = [];
    for (const seg of segments) {
      if (!Array.isArray(seg) || seg.length < 2) continue;
      const a = seg[0] as Point;
      const b = seg[1] as Point;
      if (
        !a || !b ||
        typeof a.x !== 'number' || typeof a.y !== 'number' ||
        typeof b.x !== 'number' || typeof b.y !== 'number'
      ) continue;
      cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    }
    setWalls((prev) => {
      const next: GlobalWalls = { ...prev };
      if (cleaned.length === 0) {
        delete next[key];
      } else {
        next[key] = cleaned;
      }
      wallsRef.current = next;
      saveToLocalStorage(next);
      return next;
    });
  }, []);

  const clearFloorWalls = useCallback((floor?: FloorType | string) => {
    setWalls((prev) => {
      const next: GlobalWalls = { ...prev };
      if (floor === undefined) {
        for (const k of Object.keys(next)) delete next[k];
      } else {
        delete next[normalizeFloorKey(String(floor))];
      }
      wallsRef.current = next;
      saveToLocalStorage(next);
      return next;
    });
  }, []);

  const exportJson = useCallback((): string => {
    return JSON.stringify(wallsRef.current, null, 2);
  }, []);

  const downloadJson = useCallback((filename: string = 'global_walls.json') => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [exportJson]);

  return {
    walls,
    wallsRef,
    replaceWalls,
    setFloorWalls,
    clearFloorWalls,
    exportJson,
    downloadJson,
    loaded
  };
}
