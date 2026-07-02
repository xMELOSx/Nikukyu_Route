import { useState, useEffect, useCallback } from 'react';
import { type SpawnRecord } from '../utils/DataManager';

const STORAGE_KEY = 'heist_global_spawns';

function load(): SpawnRecord[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(s => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}

function save(spawns: SpawnRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spawns));
  } catch {
    // localStorage unavailable
  }
}

export interface UseGlobalSpawnsApi {
  spawnRecords: SpawnRecord[];
  addSpawn: (record: SpawnRecord) => void;
  removeSpawn: (id: string) => void;
}

/**
 * スポーン記録管理フック。
 * - localStorage が正 (localStorage に保存された全データを保持)。
 * - 初回訪問者には /api/global-spawns → global_spawns.json の順でシードデータをマージ。
 * - 追加/削除は localStorage のみに書き込み (API への POST は行わない)。
 */
export function useGlobalSpawns(): UseGlobalSpawnsApi {
  const [spawnRecords, setSpawnRecords] = useState<SpawnRecord[]>(() => load());

  // 永続化 (追加/削除のたびに localStorage に書き込む)
  useEffect(() => {
    if (spawnRecords.length === 0) return;
    save(spawnRecords);
  }, [spawnRecords]);

  // マウント時に API/ファイルからシードデータをマージ
  useEffect(() => {
    let cancelled = false;

    const seedFromApiOrFile = async () => {
      try {
        const apiRes = await fetch(`${import.meta.env.BASE_URL}api/global-spawns`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (Array.isArray(data) && data.length > 0) {
            if (cancelled) return;
            setSpawnRecords(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              const newOnes = data.filter((s: SpawnRecord) => s && s.id && !existingIds.has(s.id));
              return newOnes.length === 0 ? prev : [...prev, ...newOnes];
            });
            return;
          }
        }
      } catch { /* fall through */ }

      try {
        const fileRes = await fetch(`${import.meta.env.BASE_URL}global_spawns.json`);
        if (fileRes.ok) {
          const fallback = await fileRes.json();
          if (Array.isArray(fallback) && fallback.length > 0) {
            if (cancelled) return;
            setSpawnRecords(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              const newOnes = fallback.filter((s: SpawnRecord) => s && s.id && !existingIds.has(s.id));
              return newOnes.length === 0 ? prev : [...prev, ...newOnes];
            });
          }
        }
      } catch { /* fall through */ }
    };

    seedFromApiOrFile();
    return () => { cancelled = true; };
  }, []);

  const addSpawn = useCallback((record: SpawnRecord) => {
    setSpawnRecords(prev => [...prev, record]);
  }, []);

  const removeSpawn = useCallback((id: string) => {
    setSpawnRecords(prev => prev.filter(s => s.id !== id));
  }, []);

  return { spawnRecords, addSpawn, removeSpawn };
}
