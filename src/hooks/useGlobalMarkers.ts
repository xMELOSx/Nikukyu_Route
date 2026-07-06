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
  } else if (m.type === 'drawer') {
    if (updated.drawerRows === undefined) updated.drawerRows = 3;
    if (updated.drawerCols === undefined) updated.drawerCols = 1;
    if (updated.drawerAngle === undefined) updated.drawerAngle = 0;
    if (updated.drawerWidth === undefined) updated.drawerWidth = 60;
    if (updated.drawerHeight === undefined) updated.drawerHeight = 70;
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

// scrollConfig マイグレーション: v2 位置倍化後に scrollConfig を補正する。
// localStorage とファイルデータの両方に適用し、環境間の値の食い違いを防ぐ。
function fixScrollConfig(markers: HeistMarker[]): HeistMarker[] {
  return markers.map(m => {
    if (!m.scrollConfig) return m;
    const sc = m.scrollConfig;
    const wasV3Applied = localStorage.getItem('heist_global_markers_scroll_fixed_v3') === 'true';
    const alreadyFixed = localStorage.getItem('heist_global_markers_scroll_fixed_v4') === 'true';
    if (alreadyFixed) return m;
    return {
      ...m,
      scrollConfig: {
        x: wasV3Applied ? 2 * sc.x + m.x * (sc.zoom - 0.5) : sc.x - m.x / 2,
        y: wasV3Applied ? 2 * sc.y + m.y * (sc.zoom - 0.5) : sc.y - m.y / 2,
        zoom: sc.zoom
      }
    };
  });
}

function persist(markers: HeistMarker[]) {
  if (!Array.isArray(markers) || markers.length === 0) return;
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
  replace: (markers: HeistMarker[]) => void;
  mergeFromImport: (incoming: HeistMarker[]) => void;
  mergeOrUpdate: (markers: HeistMarker[]) => void;
}

export function useGlobalMarkers({ isLocal }: UseGlobalMarkersOptions): UseGlobalMarkersApi {
  const [globalMarkers, setGlobalMarkers] = useState<HeistMarker[]>([]);
  const isLocalRef = useRef(isLocal);
  isLocalRef.current = isLocal;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFromLocalStorage = (): HeistMarker[] | null => {
      const saved = localStorage.getItem('heist_global_markers');
      if (!saved) return null;
      try {
        const parsed: HeistMarker[] = JSON.parse(saved);

        const migrated = localStorage.getItem('heist_global_markers_migrated_v2') === 'true'
          ? parsed
          : parsed.map(m => {
              const updated: HeistMarker = { ...m, x: m.x * 2, y: m.y * 2 };
              return updated;
            });

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
        localStorage.setItem('heist_global_markers', JSON.stringify(cleaned));
        localStorage.setItem('heist_global_markers_migrated_v2', 'true');
        localStorage.setItem('heist_global_markers_scroll_fixed_v4', 'true');
        return cleaned;
      } catch (e) {
        console.error('Failed to load global markers from localStorage:', e);
        return null;
      }
    };

    const loadData = async () => {
      let fileMarkers: HeistMarker[] = [];

      try {
        const apiRes = await fetch(`${import.meta.env.BASE_URL}api/global-markers`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (Array.isArray(data)) {
            fileMarkers = filterLegacyAndClean(data);
          }
        }
      } catch {}

      if (fileMarkers.length === 0) {
        try {
          const fileRes = await fetch(`${import.meta.env.BASE_URL}global_markers.json`);
          if (fileRes.ok) {
            const fallback = await fileRes.json();
            if (Array.isArray(fallback)) {
              fileMarkers = filterLegacyAndClean(fallback);
            }
          }
        } catch {}
      }

      if (cancelled) return;

      // ファイルデータにも scrollConfig マイグレーションを適用し、localStorage と値を揃える
      fileMarkers = fixScrollConfig(fileMarkers);

      if (isLocalRef.current) {
        // ローカルモード: ファイルを一次ソースとし、localStorage を
        // ユーザー編集のオーバーレイとしてマージする。
        if (fileMarkers.length > 0) {
          setGlobalMarkers(fileMarkers);
        } else {
          setGlobalMarkers([]);
          localStorage.setItem('heist_global_markers', '[]');
        }
        const local = loadFromLocalStorage();
        if (local && local.length > 0) {
          setGlobalMarkers(prev => {
            const localById = new Map(local.map(m => [m.id, m]));
            const existingIds = new Set(prev.map(m => m.id));
            const merged = prev.map(m => {
              const localM = localById.get(m.id);
              return localM ? { ...m, ...localM } : m;
            });
            const newOnes = local.filter(m => !existingIds.has(m.id));
            return newOnes.length > 0 ? [...merged, ...newOnes] : merged;
          });
        }
      } else {
        // 疑似本番/個人モード: ファイルデータのみ信頼。localStorage は参照しない。
        if (fileMarkers.length > 0) {
          setGlobalMarkers(fileMarkers);
        } else {
          setGlobalMarkers([]);
        }
      }
    };

    loadData();

    return () => { cancelled = true; };
  }, []);

  // Debounced persist
  useEffect(() => {
    if (!Array.isArray(globalMarkers) || globalMarkers.length === 0) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persist(globalMarkers);
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

  const mergeOrUpdate = useCallback((incoming: HeistMarker[]) => {
    setGlobalMarkers(prev => {
      if (incoming.length === 0) return prev;
      const incomingById = new Map(incoming.map(m => [m.id, m]));
      const updated = prev.map(m => {
        const next = incomingById.get(m.id);
        if (!next) return m;
        return { ...m, ...next };
      });
      const existingIds = new Set(prev.map(m => m.id));
      const newOnes = incoming.filter(m => !existingIds.has(m.id));
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
