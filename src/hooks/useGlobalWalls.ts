import { useEffect, useState, useCallback, useRef } from 'react';
import { type Point, type WallSegment } from '../utils/DataManager';

export type GlobalWalls = { [key: string]: WallSegment[] };

const LOCAL_WALLS_KEY = 'heist_global_walls';
const FLOORS = ['main', 'second', 'third', 'fourth'] as const;
const EMPTY_WALLS: GlobalWalls = {
  main: [],
  second: [],
  third: [],
  fourth: []
};

function sanitizeWalls(raw: unknown): GlobalWalls {
  const out: GlobalWalls = { ...EMPTY_WALLS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [floor, segs] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(segs)) continue;
    const cleaned: WallSegment[] = [];
    for (const seg of segs) {
      if (!Array.isArray(seg) || seg.length < 2) continue;
      const a = seg[0] as Point;
      const b = seg[1] as Point;
      if (
        !a || !b ||
        typeof a.x !== 'number' || typeof a.y !== 'number' ||
        typeof b.x !== 'number' || typeof b.y !== 'number'
      ) continue;
      const tex = typeof seg[2] === 'string' ? seg[2] : undefined;
      if (tex) {
        cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, tex]);
      } else {
        cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
      }
    }
    out[floor] = cleaned;
  }
  return out;
}

function ensureFloors(walls: GlobalWalls): GlobalWalls {
  const next: GlobalWalls = { ...walls };
  for (const f of FLOORS) {
    if (!Array.isArray(next[f])) next[f] = [];
  }
  return next;
}

function loadFromLocalStorage(): GlobalWalls | null {
  try {
    const saved = localStorage.getItem(LOCAL_WALLS_KEY);
    if (!saved) return null;
    return ensureFloors(sanitizeWalls(JSON.parse(saved)));
  } catch {
    return null;
  }
}

function saveToLocalStorage(walls: GlobalWalls) {
  try {
    localStorage.setItem(LOCAL_WALLS_KEY, JSON.stringify(ensureFloors(walls)));
  } catch {
    // localStorage が利用不可でもエラーで止めない
  }
}

export interface UseGlobalWallsOptions {
  isLocal: boolean;
}

export interface UseGlobalWallsApi {
  walls: GlobalWalls;
  loaded: boolean;
  /** Replace the entire wall set. Persists to localStorage and the global API. */
  replace: (walls: GlobalWalls) => void;
  /** Merge incoming wall segments into the current set (used by seed). */
  mergeFromImport: (incoming: GlobalWalls) => void;
}

/**
 * Global wall state — shared across all plans/users.
 *
 * The walls live in a single repo-tracked file (`config/data/global_walls.json`)
 * and are exposed through `/api/global-walls`. Every visitor sees the same
 * wall data:
 *
 *   1. The API (`/api/global-walls`) is the source of truth on the server.
 *   2. At build time, the file is copied to `dist/global_walls.json` for
 *      static hosting (GitHub Pages etc.).
 *   3. `localStorage` is used as a tiny client-side cache so the first paint
 *      can show walls before the network round-trip resolves, and so the
 *      write happens to feel instant. The cache is reconciled with the API
 *      on every load — the server wins.
 *
 * The previous implementation wrote walls to localStorage only, which meant
 * one user's edits were invisible to everyone else. This rewrite persists
 * walls globally so all collaborators see the same walls.
 */
export function useGlobalWalls({ isLocal }: UseGlobalWallsOptions): UseGlobalWallsApi {
  const [walls, setWalls] = useState<GlobalWalls>(() => {
    return ensureFloors(loadFromLocalStorage() ?? EMPTY_WALLS);
  });
  const [loaded, setLoaded] = useState(false);
  const isLocalRef = useRef(isLocal);
  isLocalRef.current = isLocal;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wallsRef = useRef<GlobalWalls>(walls);
  wallsRef.current = walls;

  const persistToServer = useCallback((next: GlobalWalls) => {
    if (!isLocalRef.current) return;
    const json = JSON.stringify(ensureFloors(next));
    fetch(`${import.meta.env.BASE_URL}api/global-walls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json
    }).catch(err => {
      console.error('Failed to persist walls to /api/global-walls:', err);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyMerge = (incoming: GlobalWalls) => {
      if (cancelled) return;
      setWalls(prev => {
        const next = ensureFloors({ ...prev });
        for (const [floor, segs] of Object.entries(incoming)) {
          if (segs.length === 0) continue;
          const existing = next[floor] || [];
          const sigs = new Set(existing.map(w => `${w[0].x},${w[0].y}-${w[1].x},${w[1].y}`));
          for (const w of segs) {
            const sig = `${w[0].x},${w[0].y}-${w[1].x},${w[1].y}`;
            if (!sigs.has(sig)) {
              existing.push([{ x: w[0].x, y: w[0].y }, { x: w[1].x, y: w[1].y }]);
              sigs.add(sig);
            }
          }
          next[floor] = existing;
        }
        return next;
      });
    };

    const seedFromApiOrFile = async () => {
      try {
        const apiRes = await fetch(`${import.meta.env.BASE_URL}api/global-walls`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const total = Object.values(data as GlobalWalls).reduce(
              (sum, segs) => sum + (Array.isArray(segs) ? segs.length : 0), 0
            );
            if (total > 0) {
              applyMerge(sanitizeWalls(data));
              return;
            }
          }
        }
      } catch { /* ignore */ }

      // Static fallback for production (GitHub Pages)
      try {
        const fileRes = await fetch(`${import.meta.env.BASE_URL}global_walls.json`);
        if (fileRes.ok) {
          const data = await fileRes.json();
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const total = Object.values(data as GlobalWalls).reduce(
              (sum, segs) => sum + (Array.isArray(segs) ? segs.length : 0), 0
            );
            if (total > 0) {
              applyMerge(sanitizeWalls(data));
            }
          }
        }
      } catch (err) {
        console.error('Failed to load global walls from static file:', err);
      }
    };

    // Always seed from the server/file so the latest shared walls appear for
    // every visitor. Existing local edits are preserved via the merge logic.
    seedFromApiOrFile().finally(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => { cancelled = true; };
  }, []);

  // Debounced persist: write to localStorage (instant) and to the API
  // (debounced so a wall-draw stroke produces a single network request).
  useEffect(() => {
    if (!loaded) return;
    saveToLocalStorage(walls);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistToServer(walls);
    }, 150);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [walls, loaded, persistToServer]);

  const replace = useCallback((next: GlobalWalls) => {
    setWalls(ensureFloors(next));
  }, []);

  const mergeFromImport = useCallback((incoming: GlobalWalls) => {
    setWalls(prev => {
      const next = ensureFloors({ ...prev });
      for (const [floor, segs] of Object.entries(incoming)) {
        if (!segs.length) continue;
        const existing = next[floor] || [];
        const sigs = new Set(existing.map(w => `${w[0].x},${w[0].y}-${w[1].x},${w[1].y}`));
        for (const w of segs) {
          const sig = `${w[0].x},${w[0].y}-${w[1].x},${w[1].y}`;
          if (!sigs.has(sig)) {
            existing.push([{ x: w[0].x, y: w[0].y }, { x: w[1].x, y: w[1].y }]);
            sigs.add(sig);
          }
        }
        next[floor] = existing;
      }
      return next;
    });
  }, []);

  return { walls, loaded, replace, mergeFromImport };
}
