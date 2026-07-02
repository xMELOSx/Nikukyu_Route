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

export function useGlobalSpawns(): UseGlobalSpawnsApi {
  const [spawnRecords, setSpawnRecords] = useState<SpawnRecord[]>(() => load());

  useEffect(() => {
    save(spawnRecords);
  }, [spawnRecords]);

  const addSpawn = useCallback((record: SpawnRecord) => {
    setSpawnRecords(prev => [...prev, record]);
  }, []);

  const removeSpawn = useCallback((id: string) => {
    setSpawnRecords(prev => prev.filter(s => s.id !== id));
  }, []);

  return { spawnRecords, addSpawn, removeSpawn };
}
