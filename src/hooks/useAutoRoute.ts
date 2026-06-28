import { useState, useCallback } from 'react';
import { loadAutoRouteCollapsed, saveAutoRouteCollapsed } from '../utils/PlayDataManager';

export interface AutoRouteStatus {
  active: boolean;
  running: boolean;
  elapsed: number;
  totalTime: number;
  totalDistance: number;
  totalStopTime: number;
  speed: number;
  error: string | null;
  nextMarkerLabel: string;
  waitRemaining: number;
  checkpoints: { elapsed: number; label: string; passed: boolean }[];
}

const INITIAL_STATUS: AutoRouteStatus = {
  active: false,
  running: false,
  elapsed: 0,
  totalTime: 0,
  totalDistance: 0,
  totalStopTime: 0,
  speed: 0,
  error: null,
  nextMarkerLabel: '',
  waitRemaining: 0,
  checkpoints: []
};

export type AutoRouteAction = 'start' | 'pause' | 'resume' | 'reset' | 'seek';

export interface AutoRouteCommand {
  action: AutoRouteAction;
  ts: number;
  seekTo?: number;
}

export interface AutoRouteSettings {
  waitEnabled: boolean;
  waitSeconds: number;
  speedMultiplier: 1 | 2 | 3 | 5 | 10;
  followCamera: boolean;
}

/**
 * Controller hook for the auto-route feature. Owns the UI state
 * (status mirror, command bus, settings, collapse state) that the
 * App-level panel binds to. The actual animation engine lives in
 * `useAutoRouteEngine`, which is invoked inside MapCanvas and
 * reports status back via `onAutoRouteStatusChange` (set to `setStatus`).
 */
export function useAutoRoute() {
  const [status, setStatus] = useState<AutoRouteStatus>(INITIAL_STATUS);
  const [command, setCommand] = useState<AutoRouteCommand | null>(null);
  const [waitEnabled, setWaitEnabled] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(5);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3 | 5 | 10>(1);
  const [followCamera, setFollowCamera] = useState(true);
  const [fuseMode, setFuseMode] = useState(true);
  const [collapsed, setCollapsed] = useState<boolean>(() => loadAutoRouteCollapsed());

  const sendCommand = useCallback((action: AutoRouteAction, seekTo?: number) => {
    setCommand({ action, ts: Date.now(), seekTo });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      saveAutoRouteCollapsed(next);
      return next;
    });
  }, []);

  return {
    status,
    setStatus,
    command,
    sendCommand,
    waitEnabled,
    setWaitEnabled,
    waitSeconds,
    setWaitSeconds,
    speedMultiplier,
    setSpeedMultiplier,
    followCamera,
    setFollowCamera,
    fuseMode,
    setFuseMode,
    collapsed,
    toggleCollapsed
  } as const;
}
