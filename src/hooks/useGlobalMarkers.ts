import { useState, useEffect, useCallback, useRef } from 'react';
import { type HeistMarker } from '../utils/DataManager';

function backfillDefaults(m: HeistMarker): HeistMarker {
  const updated: HeistMarker = { ...m };
  if (m.type === 'boss') {
    if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
    if (updated.bossDrops === undefined) updated.bossDrops = [];
  } else if (m.type === 'battle' || m.type === 'gbattle') {
    if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
  } else if (m.type === 'picking' || m.type === 'gpicking') {
    if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
  } else if (m.type === 'long_picking' || m.type === 'glong_picking') {
    if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 8;
  }
  return updated;
}

function filterLegacyAndClean(markers: HeistMarker[]): HeistMarker[] {
  const isIndivType = (t: string) =>
    ['start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'].includes(t);
  return markers
    .filter(m => m.type !== ('camera' as any) && m.type !== ('guard' as any) && !isIndivType(m.type))
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

function persist(markers: HeistMarker[], isLocal: boolean) {
  if (!isLocal || !Array.isArray(markers) || markers.length === 0) return;
  try {
    const json = JSON.stringify(markers);
    localStorage.setItem('heist_global_markers', json);
    fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json
    }).catch(() => {});
  } catch (_err) {
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
  /** SAFE edit path. The current global state is the BASE. The incoming
   *  list only overrides matching IDs; new IDs are appended. Markers that
   *  exist in the global state but are NOT in the incoming list are
   *  PRESERVED. Use this for any update that comes from a merged prop
   *  snapshot (drag/edit) to avoid losing markers due to a stale prop
   *  or a race condition. The previous `replace` pattern blindly
   *  overwrote the entire list, which made it easy for a partial snapshot
   *  to wipe out markers that were in flight elsewhere. */
  mergeOrUpdate: (markers: HeistMarker[]) => void;
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
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount. The priority is localStorage-first: once the user has
  // markers in their browser, that is the source of truth. The API
  // (`/api/global-markers` backed by `config/data/global_markers.json`) is consulted as a *seed* for new
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
        return [...prev, ...newOnes];
      });
    };

    const loadFromLocalStorage = (): HeistMarker[] | null => {
      const saved = localStorage.getItem('heist_global_markers');
      if (!saved) return null;
      try {
        const parsed: HeistMarker[] = JSON.parse(saved);

        // Legacy 2x coordinate migration (marker positions only)
        // scrollConfig stores CSS transform pan values (viewport pixel offsets),
        // NOT map coordinates — it must NOT be multiplied.
        const migrated = localStorage.getItem('heist_global_markers_migrated_v2') === 'true'
          ? parsed
          : parsed.map(m => {
              const updated: HeistMarker = { ...m, x: m.x * 2, y: m.y * 2 };
              return updated;
            });

        // Reverse-migration: fix scrollConfig that was incorrectly
        // left unchanged while marker coords were doubled by v2 migration.
        // Screen position formula:
        //   screenPos = (markerCoord + pan) * zoom + center * (1 - zoom)
        // After doubling marker coords, restore the original screen position
        // by adjusting pan (scrollConfig). The zoom term cancels out:
        //   old: (X_orig + pan_old) * Z
        //   new: (2*X_orig + pan_new) * Z
        //   ∴ pan_new = pan_old - X_orig = pan_old - X_curr / 2
        //
        // v3 (broken) applied (sc.x - m.x * sc.zoom) / 2 which is wrong when zoom≠1.
        // If v3 flag is set, first undo the v3 corruption, then apply the correct v4 fix:
        //   P_v3 = (P0 - m.x * Z) / 2  →  P0 = 2*P_v3 + m.x*Z
        //   P_v4 = P0 - m.x / 2       = 2*P_v3 + m.x*(Z - 0.5)
        // If v3 was NOT applied (clean), just apply P_v4 = P_orig - m.x / 2
        const wasV3Applied = localStorage.getItem('heist_global_markers_scroll_fixed_v3') === 'true';
        const scrollFixed = localStorage.getItem('heist_global_markers_scroll_fixed_v4') === 'true'
          ? migrated
          : migrated.map(m => {
              if (!m.scrollConfig) return m;
              const sc = m.scrollConfig;
              return {
                ...m,
                scrollConfig: {
                  x: wasV3Applied ? 2 * sc.x + m.x * (sc.zoom - 0.5) : sc.x - m.x / 2,
                  y: wasV3Applied ? 2 * sc.y + m.y * (sc.zoom - 0.5) : sc.y - m.y / 2,
                  zoom: sc.zoom
                }
              };
            });

        const cleaned = filterLegacyAndClean(scrollFixed);
        // Persist the migrated/cleaned version back so we don't redo the
        // migration on every load, and to surface the file via the API.
        localStorage.setItem('heist_global_markers', JSON.stringify(cleaned));
        localStorage.setItem('heist_global_markers_migrated_v2', 'true');
        localStorage.setItem('heist_global_markers_scroll_fixed_v4', 'true');
        return cleaned;
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

      // Last resort: nothing in localStorage, API, or file. Start with an
      // empty list — the user can add markers manually.
      if (!cancelled) {
        setGlobalMarkers([]);
        if (isLocalRef.current) {
          localStorage.setItem('heist_global_markers', '[]');
        }
      }
    };

    if (!isLocalRef.current) {
      // 個人編集モード: localStorage を信用せず、常にサーバー/ファイルから取得する。
      // 個人モードでの編集がグローバルデータを汚染するのを防ぐ。
      seedFromApiOrFile();
    } else {
      // ローカル編集モード: localStorage が正。サーバー/ファイルから新しい
      // マーカーのみを非同期マージする (既存は上書きしない)。
      const local = loadFromLocalStorage();
      if (local && local.length > 0) {
        if (cancelled) return;
        setGlobalMarkers(local);
        seedFromApiOrFile();
      } else {
        seedFromApiOrFile();
      }
    }

    return () => { cancelled = true; };
  }, []);

  // Debounced persist: レンダリングをブロックしないよう setTimeout で遅延させ、
  // 高速な連続変更は最後の1回にまとめる。
  useEffect(() => {
    if (!Array.isArray(globalMarkers) || globalMarkers.length === 0) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persist(globalMarkers, isLocalRef.current);
    }, 50);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [globalMarkers]);

  const replace = useCallback((markers: HeistMarker[]) => {
    setGlobalMarkers(markers);
  }, []);

  const mergeFromImport = useCallback((incoming: HeistMarker[]) => {
    setGlobalMarkers(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const newOnes = incoming.filter(m => !existingIds.has(m.id));
      if (newOnes.length === 0) return prev;
      return [...prev, ...newOnes];
    });
  }, []);

  /**
   * Safe update path for edits (drag/move/edit properties). The current
   * global state is the BASE — incoming markers only override matching
   * IDs, new IDs are appended, and any markers that exist in the global
   * state but are NOT in the incoming list are preserved. This guarantees
   * that the global state is never silently shrunk by a partial snapshot
   * (which is what `replace` used to do and is the most likely cause of
   * "moves don't stick" bugs).
   */
  const mergeOrUpdate = useCallback((incoming: HeistMarker[]) => {
    setGlobalMarkers(prev => {
      if (incoming.length === 0) return prev;
      const incomingById = new Map(incoming.map(m => [m.id, m]));
      // Update existing markers with the incoming data; keep order stable
      // so React keys / drag handles don't get reshuffled.
      const updated = prev.map(m => {
        const next = incomingById.get(m.id);
        return next ? { ...m, ...next } : m;
      });
      // Append any IDs that weren't already present.
      const existingIds = new Set(prev.map(m => m.id));
      const newOnes = incoming.filter(m => !existingIds.has(m.id));
      // No-op fast path: nothing changed.
      if (newOnes.length === 0 && updated.every((m, i) => m === prev[i])) {
        return prev;
      }
      return [...updated, ...newOnes];
    });
  }, []);

  return {
    globalMarkers, setGlobalMarkers, replace, mergeFromImport, mergeOrUpdate
  };
}
