import { useState, useEffect, useRef, useCallback } from 'react';
import { GlobalDataService, type DataEvent, type GlobalWalls, type HelpData } from '../utils/GlobalDataService';
import type { HeistMarker, GlobalLockedWalls, SpawnPoint, RegisteredItem, PresetData, SkillCdPreset } from '../utils/DataManager';
import type { GlobalDefaults } from '../utils/GlobalDataService';
import { generateId } from '../utils/DataManager';



export interface UseGlobalDataOptions {
  onEvent?: (event: DataEvent) => void;
  onDefaultsLoaded?: (defaults: GlobalDefaults) => void;
}

export function useGlobalData(options?: UseGlobalDataOptions) {
  const svc = GlobalDataService.getInstance();
  const [loading, setLoading] = useState(!svc.isLoaded);
  const [, setVersion] = useState(0);
  const onDefaultsLoadedRef = useRef(options?.onDefaultsLoaded);
  onDefaultsLoadedRef.current = options?.onDefaultsLoaded;
  const onEventRef = useRef(options?.onEvent);
  onEventRef.current = options?.onEvent;

  useEffect(() => {
    const unsub = svc.subscribe(() => setVersion(v => v + 1));
    const unsubEvent = svc.onEvent((event) => {
      onEventRef.current?.(event);
    });
    svc.loadAll().then(() => {
      setLoading(false);
      const d = svc.getDefaults();
      if (d) onDefaultsLoadedRef.current?.(d);
    });
    return () => { unsub(); unsubEvent(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMarkers = useCallback((markers: HeistMarker[]) => { svc.saveMarkers(markers); }, []);
  const saveWalls = useCallback((walls: GlobalWalls) => { svc.saveWalls(walls); }, []);
  const saveLockedWalls = useCallback((walls: GlobalLockedWalls) => { svc.saveLockedWalls(walls); }, []);
  const saveSpawns = useCallback((points: SpawnPoint[], items: RegisteredItem[]) => { svc.saveSpawns(points, items); }, []);
  const saveDefaults = useCallback((d: GlobalDefaults, presets: SkillCdPreset[]) => { svc.saveDefaults(d, presets); }, []);
  const savePresets = useCallback((presets: PresetData[]) => { svc.savePresets(presets); }, []);
  const saveHelp = useCallback((help: HelpData) => { svc.saveHelp(help); }, []);
  const setSkillCdPresets = useCallback((presets: SkillCdPreset[]) => { svc.setSkillCdPresets(presets); }, []);
  const setStorageLimit = useCallback((bytes: number) => { svc.setStorageLimit(bytes); }, []);
  const resetToGlobal = useCallback(async () => { await svc.reloadAll(false); setVersion(v => v + 1); }, []);
  const addSkillCdPreset = useCallback((input: { label: string; color: string; mode: 'fixed' | 'per_second'; seconds: number; perSecondCd: number }): SkillCdPreset => {
    const newPreset: SkillCdPreset = {
      id: generateId('skill'), label: input.label.trim() || 'スキル', color: input.color || '#39ff14',
      mode: input.mode, seconds: Math.max(0, Math.floor(input.seconds) || 0), perSecondCd: Math.max(0, Math.floor(input.perSecondCd) || 0)
    };
    const current = svc.getSkillCdPresets();
    svc.setSkillCdPresets([...current, newPreset]);
    return newPreset;
  }, []);
  const updateSkillCdPreset = useCallback((id: string, patch: Partial<Omit<SkillCdPreset, 'id'>>) => {
    const current = svc.getSkillCdPresets();
    svc.setSkillCdPresets(current.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);
  const removeSkillCdPreset = useCallback((id: string) => {
    const current = svc.getSkillCdPresets();
    svc.setSkillCdPresets(current.filter(p => p.id !== id));
  }, []);

  return {
    loading,
    isLocal: svc.isLocal,
    service: svc,

    markers: svc.getMarkers(),
    setMarkers: saveMarkers,

    walls: svc.getWalls(),
    setWalls: saveWalls,

    lockedWalls: svc.getLockedWalls(),
    setLockedWalls: saveLockedWalls,

    spawnPoints: svc.getSpawnPoints(),
    spawnItems: svc.getSpawnItems(),
    setSpawns: saveSpawns,

    defaults: svc.getDefaults(),
    skillCdPresets: svc.getSkillCdPresets(),
    setDefaults: saveDefaults,
    setSkillCdPresets,
    addSkillCdPreset,
    updateSkillCdPreset,
    removeSkillCdPreset,
    setStorageLimit,

    help: svc.getHelp(),
    setHelp: saveHelp,

    presets: svc.getPresets(),
    setPresets: savePresets,

    resetToGlobal,
  } as const;
}
