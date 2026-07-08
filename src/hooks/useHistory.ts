import { useState, useCallback, useRef } from 'react';
import {
  type FloorType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  type GlobalLockedWalls
} from '../utils/DataManager';

export interface HistorySnapshot {
  strokes: { [key in FloorType]: DrawingStroke[] };
  individualMarkers: HeistMarker[];
  globalMarkers: HeistMarker[];
  walls?: RouteData['walls'];
  lockedWalls?: GlobalLockedWalls;
  partitionWalls?: { [key: string]: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] };
}

export interface UseHistoryOptions {
  getRoute: () => RouteData;
  getGlobalMarkers: () => HeistMarker[];
  getWalls: () => RouteData['walls'];
  getLockedWalls: () => GlobalLockedWalls;
  getPartitionWalls: () => { [key: string]: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] };
  replaceRoute: (next: RouteData) => void;
  replaceGlobalMarkers: (next: HeistMarker[]) => void;
  replaceWalls: (next: RouteData['walls']) => void;
  replaceLockedWalls: (next: GlobalLockedWalls) => void;
  replacePartitionWalls: (next: { [key: string]: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] }) => void;
  persistGlobalMarkers: (next: HeistMarker[]) => void;
  onRestore?: (restoredIndiv: HeistMarker[], restoredGlobal: HeistMarker[]) => void;
}

export interface UseHistoryApi {
  pastHistory: HistorySnapshot[];
  futureHistory: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (strokes: RouteData['strokes'], indiv: HeistMarker[], global: HeistMarker[], walls?: RouteData['walls'], lockedWalls?: GlobalLockedWalls, partitionWalls?: { [key: string]: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] }) => void;
  undo: () => void;
  redo: () => void;
  /** Capture a snapshot at the start of a marker drag (no history yet). */
  startDragSnapshot: () => void;
  /** Commit the drag-start snapshot to the past history (called on drop). */
  commitDragSnapshot: () => void;
  /** Strip all 'temporary' strokes from all snapshots currently stored in history. */
  clearTemporaryStrokes: () => void;
  /** Clear the entire undo/redo history. */
  clearHistory: () => void;
}

const HISTORY_LIMIT = 50;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Undo/Redo stack. Snapshots are deep-cloned to keep history isolated from
 * subsequent mutations. The hook only stores the snapshots — replacing the
 * live route and global-marker state is delegated back to the caller so the
 * caller can run any side effects (active-marker cleanup, persistence, etc.).
 */
export function useHistory(options: UseHistoryOptions): UseHistoryApi {
  const { getRoute, getGlobalMarkers, getWalls, getLockedWalls, getPartitionWalls, replaceRoute, replaceGlobalMarkers, replaceWalls, replaceLockedWalls, replacePartitionWalls, persistGlobalMarkers, onRestore } = options;

  const [pastHistory, setPastHistory] = useState<HistorySnapshot[]>([]);
  const [futureHistory, setFutureHistory] = useState<HistorySnapshot[]>([]);
  const dragSnapshotRef = useRef<HistorySnapshot | null>(null);

  const pushHistory = useCallback((
    strokes: RouteData['strokes'],
    indiv: HeistMarker[],
    global: HeistMarker[],
    walls?: RouteData['walls'],
    lockedWalls?: GlobalLockedWalls,
    partitionWalls?: { [key: string]: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] }
  ) => {
    const snapshot: HistorySnapshot = {
      strokes: clone(strokes),
      individualMarkers: clone(indiv),
      globalMarkers: clone(global),
      walls: walls ? clone(walls) : clone(getWalls()),
      lockedWalls: lockedWalls ? clone(lockedWalls) : clone(getLockedWalls()),
      partitionWalls: partitionWalls ? clone(partitionWalls) : clone(getPartitionWalls())
    };
    setPastHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFutureHistory([]);
  }, [getWalls, getLockedWalls, getPartitionWalls]);

  const undo = useCallback(() => {
    if (pastHistory.length === 0) return;
    const previous = pastHistory[pastHistory.length - 1];
    const nextPast = pastHistory.slice(0, pastHistory.length - 1);

    // Save current state to future stack
    const current: HistorySnapshot = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers()),
      walls: clone(getWalls()),
      lockedWalls: clone(getLockedWalls()),
      partitionWalls: clone(getPartitionWalls())
    };
    setPastHistory(nextPast);
    setFutureHistory(prev => [...prev, current]);

    replaceRoute({ ...getRoute(), strokes: previous.strokes, markers: previous.individualMarkers });
    if (previous.walls) replaceWalls(previous.walls);
    if (previous.lockedWalls) replaceLockedWalls(previous.lockedWalls);
    if (previous.partitionWalls) replacePartitionWalls(previous.partitionWalls);
    const safeGlobals = Array.isArray(previous.globalMarkers) ? previous.globalMarkers : [];
    if (safeGlobals.length > 0) {
      replaceGlobalMarkers(safeGlobals);
      persistGlobalMarkers(safeGlobals);
    }
    if (onRestore) onRestore(previous.individualMarkers, previous.globalMarkers);
  }, [pastHistory, getRoute, getGlobalMarkers, getWalls, getLockedWalls, getPartitionWalls, replaceRoute, replaceGlobalMarkers, replaceWalls, replaceLockedWalls, replacePartitionWalls, persistGlobalMarkers, onRestore]);

  const redo = useCallback(() => {
    if (futureHistory.length === 0) return;
    const next = futureHistory[futureHistory.length - 1];
    const nextFuture = futureHistory.slice(0, futureHistory.length - 1);

    const current: HistorySnapshot = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers()),
      walls: clone(getWalls()),
      lockedWalls: clone(getLockedWalls()),
      partitionWalls: clone(getPartitionWalls())
    };
    setFutureHistory(nextFuture);
    setPastHistory(prev => [...prev, current]);

    replaceRoute({ ...getRoute(), strokes: next.strokes, markers: next.individualMarkers });
    if (next.walls) replaceWalls(next.walls);
    if (next.lockedWalls) replaceLockedWalls(next.lockedWalls);
    if (next.partitionWalls) replacePartitionWalls(next.partitionWalls);
    const safeGlobals = Array.isArray(next.globalMarkers) ? next.globalMarkers : [];
    if (safeGlobals.length > 0) {
      replaceGlobalMarkers(safeGlobals);
      persistGlobalMarkers(safeGlobals);
    }
    if (onRestore) onRestore(next.individualMarkers, safeGlobals);
  }, [futureHistory, getRoute, getGlobalMarkers, getWalls, getLockedWalls, getPartitionWalls, replaceRoute, replaceGlobalMarkers, replaceWalls, replaceLockedWalls, replacePartitionWalls, persistGlobalMarkers, onRestore]);

  const startDragSnapshot = useCallback(() => {
    dragSnapshotRef.current = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers()),
      walls: clone(getWalls()),
      lockedWalls: clone(getLockedWalls()),
      partitionWalls: clone(getPartitionWalls())
    };
  }, [getRoute, getGlobalMarkers, getWalls, getLockedWalls, getPartitionWalls]);

  const commitDragSnapshot = useCallback(() => {
    if (dragSnapshotRef.current) {
      const snap = dragSnapshotRef.current;
      setPastHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), snap]);
      setFutureHistory([]);
      dragSnapshotRef.current = null;
    }
  }, []);

  const clearTemporaryStrokes = useCallback(() => {
    const filterTemp = (snapshots: HistorySnapshot[]) => {
      return snapshots.map(snap => {
        const nextStrokes = { ...snap.strokes } as HistorySnapshot['strokes'];
        let changed = false;
        for (const fl of Object.keys(nextStrokes)) {
          const flKey = fl as FloorType;
          if (nextStrokes[flKey]) {
            const origLen = nextStrokes[flKey].length;
            const filtered = nextStrokes[flKey].filter(s => s.type !== 'temporary');
            if (filtered.length !== origLen) {
              nextStrokes[flKey] = filtered;
              changed = true;
            }
          }
        }
        return changed ? { ...snap, strokes: nextStrokes } : snap;
      });
    };
    setPastHistory(prev => filterTemp(prev));
    setFutureHistory(prev => filterTemp(prev));
    if (dragSnapshotRef.current) {
      const nextStrokes = { ...dragSnapshotRef.current.strokes } as HistorySnapshot['strokes'];
      let changed = false;
      for (const fl of Object.keys(nextStrokes)) {
        const flKey = fl as FloorType;
        if (nextStrokes[flKey]) {
          const origLen = nextStrokes[flKey].length;
          const filtered = nextStrokes[flKey].filter(s => s.type !== 'temporary');
          if (filtered.length !== origLen) {
            nextStrokes[flKey] = filtered;
            changed = true;
          }
        }
      }
      if (changed) {
        dragSnapshotRef.current.strokes = nextStrokes;
      }
    }
  }, []);

  const clearHistory = useCallback(() => {
    setPastHistory([]);
    setFutureHistory([]);
    dragSnapshotRef.current = null;
  }, []);

  return {
    pastHistory, futureHistory,
    canUndo: pastHistory.length > 0,
    canRedo: futureHistory.length > 0,
    pushHistory, undo, redo,
    startDragSnapshot, commitDragSnapshot,
    clearTemporaryStrokes,
    clearHistory
  };
}
