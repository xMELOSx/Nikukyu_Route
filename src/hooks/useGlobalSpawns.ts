import { useState, useEffect, useCallback, useRef } from 'react';
import { type SpawnPoint, type RegisteredItem } from '../utils/DataManager';

function normalizePoint(p: any): SpawnPoint {
  const items = Array.isArray(p.items) ? p.items.map((pi: any) => ({ ...pi, playerCount: pi.playerCount ?? 0 })) : [];
  return { ...p, items };
}

function normalizeItem(i: any): RegisteredItem {
  return { id: i.id, name: i.name || '', textColor: i.textColor || 'blue', fans: i.fans ?? 0, coins: i.coins ?? 0, image: i.image, description: i.description };
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
  const [points, setPoints] = useState<SpawnPoint[]>([]);
  const [items, setItems] = useState<RegisteredItem[]>([]);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // マウント時にサーバーから読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data: { points?: any[]; items?: any[] } | null = null;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/global-spawns`);
        if (res.ok) data = await res.json();
      } catch { /* fall through */ }
      // サーバーが空なら localStorage から移行
      if (!data || !data.points || data.points.length === 0) {
        const ls = localStorage.getItem('heist_global_spawns');
        if (ls) {
          try {
            const parsed = JSON.parse(ls);
            if (Array.isArray(parsed)) {
              data = { points: parsed, items: [] };
              // 即座にサーバーに書き戻す
              fetch(`${import.meta.env.BASE_URL}api/global-spawns`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: parsed, items: [] })
              }).catch(() => {});
            }
          } catch {}
        }
      }
      // items がサーバーにない場合 localStorage から
      if (data && (!data.items || data.items.length === 0)) {
        const ls = localStorage.getItem('heist_spawn_items');
        if (ls) {
          try {
            const parsed = JSON.parse(ls);
            if (Array.isArray(parsed) && parsed.length > 0) {
              data.items = parsed;
              // サーバーに書き戻す
              fetch(`${import.meta.env.BASE_URL}api/global-spawns`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              }).catch(() => {});
            }
          } catch {}
        }
      }
      // Static fallback for production (GitHub Pages)
      if (!data || !data.points) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}global_spawns.json`);
          if (res.ok) data = await res.json();
        } catch { /* fall through */ }
      }
      if (!cancelled && data) {
        if (Array.isArray(data.points)) setPoints(data.points.filter((s: any) => s && typeof s.id === 'string').map(normalizePoint));
        if (Array.isArray(data.items)) setItems(data.items.filter((s: any) => s && typeof s.id === 'string').map(normalizeItem));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // points 変更時サーバーに保存
  useEffect(() => {
    if (points.length === 0) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      fetch(`${import.meta.env.BASE_URL}api/global-spawns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, items })
      }).catch(() => {});
    }, 50);
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  }, [points, items]);

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
