import { useState, useCallback, useEffect } from 'react';
import { loadAutoRouteCollapsed, saveAutoRouteCollapsed } from '../utils/PlayDataManager';

const AUTO_ROUTE_SETTINGS_KEY = 'heist_auto_route_settings';

export type SpeedMode = 'time' | 'speed';

interface AutoRouteSettingsPersisted {
  waitEnabled: boolean;
  waitSeconds: number;
  startStopSeconds: number;
  speedMode: SpeedMode;
  manualSpeed: number;
  speedMultiplier: 1 | 2 | 3 | 5 | 10;
  followCamera: boolean;
  fuseMode: boolean;
  inactiveMarkersMode: boolean;
}

function loadAutoRouteSettings(): Partial<AutoRouteSettingsPersisted> {
  try {
    const raw = localStorage.getItem(AUTO_ROUTE_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAutoRouteSettings(settings: AutoRouteSettingsPersisted): void {
  try {
    localStorage.setItem(AUTO_ROUTE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

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
  currentStopLabel: string;
  stopRemaining: number;
  waitRemaining: number;
  checkpoints: { elapsed: number; label: string; passed: boolean; ignored: boolean; unset: boolean; conflicted: boolean; targetTime: number }[];
  // スキルCDマーカーで「最後に通過した (あるいは通過予定) スキル」の
  // ラベル+色+残CD秒数。CDが0を返す状態 (=回り切った or 未配置) は null。
  skillCdInfo: { label: string; color: string; remaining: number; total: number } | null;
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
  currentStopLabel: '',
  stopRemaining: 0,
  waitRemaining: 0,
  checkpoints: [],
  skillCdInfo: null
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
  startStopSeconds: number;
  speedMode: SpeedMode;
  manualSpeed: number;
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
  const savedSettings = loadAutoRouteSettings();
  const [status, setStatus] = useState<AutoRouteStatus>(INITIAL_STATUS);
  const [command, setCommand] = useState<AutoRouteCommand | null>(null);
  const [waitEnabled, setWaitEnabled] = useState(savedSettings.waitEnabled ?? false);
  const [waitSeconds, setWaitSeconds] = useState(savedSettings.waitSeconds ?? 5);
  const [startStopSeconds, setStartStopSeconds] = useState<number>(savedSettings.startStopSeconds ?? 3);
  const [speedMode, setSpeedMode] = useState<SpeedMode>(savedSettings.speedMode ?? 'time');
  const [manualSpeed, setManualSpeed] = useState<number>(savedSettings.manualSpeed ?? 28);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3 | 5 | 10>(savedSettings.speedMultiplier ?? 1);
  const [followCamera, setFollowCamera] = useState(savedSettings.followCamera ?? true);
  const [fuseMode, setFuseMode] = useState(savedSettings.fuseMode ?? true);
  const [inactiveMarkersMode, setInactiveMarkersMode] = useState(savedSettings.inactiveMarkersMode ?? true);
  const [collapsed, setCollapsed] = useState<boolean>(() => loadAutoRouteCollapsed());

  useEffect(() => {
    saveAutoRouteSettings({ waitEnabled, waitSeconds, startStopSeconds, speedMode, manualSpeed, speedMultiplier, followCamera, fuseMode, inactiveMarkersMode });
  }, [waitEnabled, waitSeconds, startStopSeconds, speedMode, manualSpeed, speedMultiplier, followCamera, fuseMode, inactiveMarkersMode]);

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
    startStopSeconds,
    setStartStopSeconds,
    speedMode,
    setSpeedMode,
    manualSpeed,
    setManualSpeed,
    speedMultiplier,
    setSpeedMultiplier,
    followCamera,
    setFollowCamera,
    fuseMode,
    setFuseMode,
    inactiveMarkersMode,
    setInactiveMarkersMode,
    collapsed,
    toggleCollapsed
  } as const;
}
