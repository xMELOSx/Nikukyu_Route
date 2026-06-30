import { useState, useCallback, useRef } from 'react';
import {
  type FloorType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData
} from '../utils/DataManager';

export interface HistorySnapshot {
  strokes: { [key in FloorType]: DrawingStroke[] };
  individualMarkers: HeistMarker[];
  globalMarkers: HeistMarker[];
}

export interface UseHistoryOptions {
  /** Read the current route (used to build "current state" snapshots). */
  getRoute: () => RouteData;
  /** Read the current global markers. */
  getGlobalMarkers: () => HeistMarker[];
  /** Replace the route (used by undo/redo). */
  replaceRoute: (next: RouteData) => void;
  /** Replace the global markers (used by undo/redo). */
  replaceGlobalMarkers: (next: HeistMarker[]) => void;
  /** Persist global markers to localStorage (called after undo/redo). */
  persistGlobalMarkers: (next: HeistMarker[]) => void;
  /** Called after undo/redo with the restored marker set so the host can
   *  clean up active-marker state (e.g. clear active note marker, reset
   *  tool mode to 'move'). */
  onRestore?: (restoredIndiv: HeistMarker[], restoredGlobal: HeistMarker[]) => void;
}

export interface UseHistoryApi {
  pastHistory: HistorySnapshot[];
  futureHistory: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (strokes: RouteData['strokes'], indiv: HeistMarker[], global: HeistMarker[]) => void;
  undo: () => void;
  redo: () => void;
  /** Capture a snapshot at the start of a marker drag (no history yet). */
  startDragSnapshot: () => void;
  /** Commit the drag-start snapshot to the past history (called on drop). */
  commitDragSnapshot: () => void;
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
  const { getRoute, getGlobalMarkers, replaceRoute, replaceGlobalMarkers, persistGlobalMarkers, onRestore } = options;

  const [pastHistory, setPastHistory] = useState<HistorySnapshot[]>([]);
  const [futureHistory, setFutureHistory] = useState<HistorySnapshot[]>([]);
  const dragSnapshotRef = useRef<HistorySnapshot | null>(null);

  const pushHistory = useCallback((
    strokes: RouteData['strokes'],
    indiv: HeistMarker[],
    global: HeistMarker[]
  ) => {
    const snapshot: HistorySnapshot = {
      strokes: clone(strokes),
      individualMarkers: clone(indiv),
      globalMarkers: clone(global)
    };
    setPastHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFutureHistory([]);
  }, []);

  const undo = useCallback(() => {
    if (pastHistory.length === 0) return;
    const previous = pastHistory[pastHistory.length - 1];
    const nextPast = pastHistory.slice(0, pastHistory.length - 1);

    // Save current state to future stack
    const current: HistorySnapshot = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers())
    };
    setPastHistory(nextPast);
    setFutureHistory(prev => [...prev, current]);

    replaceRoute({ ...getRoute(), strokes: previous.strokes, markers: previous.individualMarkers });
    replaceGlobalMarkers(previous.globalMarkers);
    persistGlobalMarkers(previous.globalMarkers);
    if (onRestore) onRestore(previous.individualMarkers, previous.globalMarkers);
  }, [pastHistory, getRoute, getGlobalMarkers, replaceRoute, replaceGlobalMarkers, persistGlobalMarkers, onRestore]);

  const redo = useCallback(() => {
    if (futureHistory.length === 0) return;
    const next = futureHistory[futureHistory.length - 1];
    const nextFuture = futureHistory.slice(0, futureHistory.length - 1);

    const current: HistorySnapshot = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers())
    };
    setFutureHistory(nextFuture);
    setPastHistory(prev => [...prev, current]);

    replaceRoute({ ...getRoute(), strokes: next.strokes, markers: next.individualMarkers });
    replaceGlobalMarkers(next.globalMarkers);
    persistGlobalMarkers(next.globalMarkers);
    if (onRestore) onRestore(next.individualMarkers, next.globalMarkers);
  }, [futureHistory, getRoute, getGlobalMarkers, replaceRoute, replaceGlobalMarkers, persistGlobalMarkers, onRestore]);

  const startDragSnapshot = useCallback(() => {
    dragSnapshotRef.current = {
      strokes: clone(getRoute().strokes),
      individualMarkers: clone(getRoute().markers),
      globalMarkers: clone(getGlobalMarkers())
    };
  }, [getRoute, getGlobalMarkers]);

  const commitDragSnapshot = useCallback(() => {
    if (dragSnapshotRef.current) {
      const snap = dragSnapshotRef.current;
      setPastHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), snap]);
      setFutureHistory([]);
      dragSnapshotRef.current = null;
    }
  }, []);

  return {
    pastHistory, futureHistory,
    canUndo: pastHistory.length > 0,
    canRedo: futureHistory.length > 0,
    pushHistory, undo, redo,
    startDragSnapshot, commitDragSnapshot
  };
}
