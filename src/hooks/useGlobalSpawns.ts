import { useState, useEffect, useCallback } from 'react';
import { type SpawnPoint, type RegisteredItem } from '../utils/DataManager';

const POINTS_KEY = 'heist_global_spawns';
const ITEMS_KEY = 'heist_spawn_items';

function normalizePoint(p: any): SpawnPoint {
  const items = Array.isArray(p.items) ? p.items.map((pi: any) => ({ ...pi, playerCount: pi.playerCount ?? 0 })) : [];
  return { ...p, items };
}

function loadPoints(): SpawnPoint[] {
  try {
    const saved = localStorage.getItem(POINTS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((s: any) => s && typeof s.id === 'string').map(normalizePoint) : [];
  } catch {
    return [];
  }
}

function savePoints(points: SpawnPoint[]) {
  try { localStorage.setItem(POINTS_KEY, JSON.stringify(points)); } catch { /* ignore */ }
}

function loadItems(): RegisteredItem[] {
  try {
    const saved = localStorage.getItem(ITEMS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((s: any) => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}

function saveItems(items: RegisteredItem[]) {
  try { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export interface UseGlobalSpawnsApi {
  points: SpawnPoint[];
  setPoints: React.Dispatch<React.SetStateAction<SpawnPoint[]>>;
  addPoint: (p: SpawnPoint) => void;
  updatePoint: (id: string, updates: Partial<SpawnPoint>) => void;
  removePoint: (id: string) => void;
  items: RegisteredItem[];
  addItem: (item: RegisteredItem) => void;
  updateItem: (id: string, updates: Partial<RegisteredItem>) => void;
  removeItem: (id: string) => void;
}

export function useGlobalSpawns(): UseGlobalSpawnsApi {
  const [points, setPoints] = useState<SpawnPoint[]>(() => loadPoints());
  const [items, setItems] = useState<RegisteredItem[]>(() => loadItems());

  useEffect(() => { if (points.length > 0) savePoints(points); }, [points]);
  useEffect(() => { if (items.length > 0) saveItems(items); }, [items]);

  // マウント時に公開データとマージ
  useEffect(() => {
    let cancelled = false;
    const seed = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/global-spawns`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && !cancelled) {
            setPoints(prev => {
              const ids = new Set(prev.map(p => p.id));
              const newPts = data.filter((p: SpawnPoint) => p && p.id && !ids.has(p.id));
              return newPts.length === 0 ? prev : [...prev, ...newPts];
            });
            return;
          }
        }
      } catch { /* fall through */ }
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}global_spawns.json`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && !cancelled) {
            setPoints(prev => {
              const ids = new Set(prev.map(p => p.id));
              const newPts = data.filter((p: SpawnPoint) => p && p.id && !ids.has(p.id));
              return newPts.length === 0 ? prev : [...prev, ...newPts];
            });
          }
        }
      } catch { /* fall through */ }
    };
    seed();
    return () => { cancelled = true; };
  }, []);

  const addPoint = useCallback((p: SpawnPoint) => setPoints(prev => [...prev, p]), []);
  const updatePoint = useCallback((id: string, updates: Partial<SpawnPoint>) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);
  const removePoint = useCallback((id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
  }, []);

  const addItem = useCallback((item: RegisteredItem) => setItems(prev => [...prev, item]), []);
  const updateItem = useCallback((id: string, updates: Partial<RegisteredItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return { points, setPoints, addPoint, updatePoint, removePoint, items, addItem, updateItem, removeItem };
}
