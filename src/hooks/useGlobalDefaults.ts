import { useEffect, useRef, useState } from 'react';
import { generateId, type SkillCdMode, type SkillCdPreset } from '../utils/DataManager';

export const STORAGE_LIMIT_DEFAULT_BYTES = 10 * 1024 * 1024; // 10 MB
export const STORAGE_LIMIT_KEY = 'heist_storage_limit_bytes_v1';

export function loadStorageLimitFromCache(): number {
  if (typeof window === 'undefined') return STORAGE_LIMIT_DEFAULT_BYTES;
  try {
    const raw = localStorage.getItem(STORAGE_LIMIT_KEY);
    if (!raw) return STORAGE_LIMIT_DEFAULT_BYTES;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1024 * 1024) return n;
  } catch {}
  return STORAGE_LIMIT_DEFAULT_BYTES;
}

export function saveStorageLimitToCache(bytes: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_LIMIT_KEY, String(bytes));
  } catch { /* quota / unavailable: ignore */ }
}

export interface GlobalDefaults {
  hiddenMarkers: string[];
  hiddenMarkerTypes: string[];
  startupFocusMarkerId?: string;
  stopMarkerThreshold?: number;
  movementMarkerThreshold?: number;
  warpMarkerThreshold?: number;
  skillCdThreshold?: number;
  skillCdPresets?: SkillCdPreset[];
  /** localStorage の容量上限 (バイト)。ストレージ使用量バッジの判定に使用。 */
  storageLimitBytes?: number;
  /** スポーン機能を本番環境で表示するか (デバッグメニューで制御) */
  spawnFeatureEnabled?: boolean;
}

export interface UseGlobalDefaultsOptions {
  /** プリセットの追加/編集/削除を許可するか (ローカル編集モードのみ true) */
  isLocal: boolean;
}

const SKILL_CD_PRESETS_CACHE_KEY = 'heist_skill_cd_presets_v1';

function loadSkillCdPresetsFromCache(): SkillCdPreset[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SKILL_CD_PRESETS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((p: any): SkillCdPreset => ({
      id: typeof p?.id === 'string' ? p.id : generateId('skill'),
      label: typeof p?.label === 'string' ? p.label : 'スキル',
      color: typeof p?.color === 'string' ? p.color : '#39ff14',
      mode: p?.mode === 'per_second' ? 'per_second' : 'fixed',
      seconds: typeof p?.seconds === 'number' ? p.seconds : 0,
      perSecondCd: typeof p?.perSecondCd === 'number' ? p.perSecondCd : 0
    }));
  } catch {
    return null;
  }
}

function saveSkillCdPresetsToCache(presets: SkillCdPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SKILL_CD_PRESETS_CACHE_KEY, JSON.stringify(presets));
  } catch { /* quota / unavailable: ignore */ }
}

/**
 * Owns the global-defaults ref (created externally so it can be shared with
 * useRoute) and loads from the API (`/api/global-defaults`) once on mount.
 * After load, the ref is updated and the supplied `onLoad` callback fires so
 * the host can push the new defaults into the route.
 *
 * プリセットは「常にグローバル」:
 *  1) localStorage に個人キャッシュ (heist_skill_cd_presets_v1) があれば最優先
 *  2) 無ければサーバー (config/data/global_defaults.json) から読み込み
 *  3) 追加/編集/削除時は localStorage とサーバ (あれば) 両方に書き込む
 *  個人モード (=!isLocal) では追加/編集/削除のUIを出すと無駄なので、関数は
 *  存在するが呼び出し側でガードする。
 */
export function useGlobalDefaults(
  ref: React.MutableRefObject<GlobalDefaults>,
  onLoad?: (defaults: GlobalDefaults) => void,
  options: UseGlobalDefaultsOptions = { isLocal: true }
) {
  const { isLocal } = options;
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const [loaded, setLoaded] = useState(false);
  const [skillCdPresets, setSkillCdPresetsState] = useState<SkillCdPreset[]>([]);
  const isLocalRef = useRef(isLocal);
  isLocalRef.current = isLocal;

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}api/global-defaults`)
      .then(r => r.ok ? r.json() : null)
      .then((gd: GlobalDefaults | null) => {
        if (cancelled) {
          setLoaded(true);
          return;
        }
        // 優先順位: localStorage (個人キャッシュ) > サーバー (config/data/global_defaults.json)
        const cached = loadSkillCdPresetsFromCache();
        const rawPresets = cached !== null
          ? cached
          : (Array.isArray(gd?.skillCdPresets) ? gd!.skillCdPresets : []);
        const presets: SkillCdPreset[] = rawPresets.map(p => ({
          id: p.id,
          label: p.label,
          color: p.color,
          mode: p.mode === 'per_second' ? 'per_second' : 'fixed',
          seconds: typeof p.seconds === 'number' ? p.seconds : 0,
          perSecondCd: typeof p.perSecondCd === 'number' ? p.perSecondCd : 0
        }));
        // キャッシュから読み込んだ場合はファイル側に書き戻さない (上書き防止)
        // キャッシュが無くてファイルにあった場合はキャッシュに保存 (次回以降キャッシュ使用)
        if (cached === null && presets.length > 0) {
          saveSkillCdPresetsToCache(presets);
        }
        const normalized: GlobalDefaults = {
          hiddenMarkers: gd?.hiddenMarkers || [],
          hiddenMarkerTypes: gd?.hiddenMarkerTypes || [],
          startupFocusMarkerId: gd?.startupFocusMarkerId,
          stopMarkerThreshold: gd?.stopMarkerThreshold,
          movementMarkerThreshold: gd?.movementMarkerThreshold,
          warpMarkerThreshold: gd?.warpMarkerThreshold,
          skillCdThreshold: gd?.skillCdThreshold,
          skillCdPresets: presets,
          storageLimitBytes: loadStorageLimitFromCache(),
          spawnFeatureEnabled: gd?.spawnFeatureEnabled ?? false
        };
        ref.current = normalized;
        setSkillCdPresetsState(presets);
        if (onLoadRef.current) onLoadRef.current(normalized);
        setLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load global defaults:', err);
        if (!cancelled) {
          // 取得失敗時は localStorage だけ参照
          const cached = loadSkillCdPresetsFromCache() || [];
          ref.current = {
            hiddenMarkers: [],
            hiddenMarkerTypes: [],
            skillCdPresets: cached,
            storageLimitBytes: loadStorageLimitFromCache()
          };
          setSkillCdPresetsState(cached);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [ref]);

  const setStartupFocusMarkerId = (id: string | null) => {
    ref.current = { ...ref.current, startupFocusMarkerId: id || undefined };
  };

  const setHidden = (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => {
    ref.current = { ...ref.current, hiddenMarkers, hiddenMarkerTypes };
  };

  const setStorageLimit = (bytes: number) => {
    const clamped = Math.max(1024 * 1024, Math.floor(bytes));
    ref.current = { ...ref.current, storageLimitBytes: clamped };
    saveStorageLimitToCache(clamped);
  };

  /**
   * プリセット一覧を ref + localStorage キャッシュ + (あれば) サーバに永続化する。
   * 個人モードでも動作 (UI 側で isLocal を見てガード)。
   */
  const persistSkillCdPresets = (presets: SkillCdPreset[]) => {
    setSkillCdPresetsState(presets);
    ref.current = { ...ref.current, skillCdPresets: presets };
    // 1) localStorage キャッシュ (= 真の個人永続化)
    saveSkillCdPresetsToCache(presets);
    // 2) サーバ (あれば) にも書く (= 共有できるが GitHub Pages では機能しない)
    if (typeof window !== 'undefined' && window.location.hostname) {
      fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ref.current, skillCdPresets: presets })
      }).catch(() => { /* ignore */ });
    }
  };

  const addSkillCdPreset = (input: {
    label: string;
    color: string;
    mode: SkillCdMode;
    seconds: number;
    perSecondCd: number;
  }): SkillCdPreset => {
    const newPreset: SkillCdPreset = {
      id: generateId('skill'),
      label: input.label.trim() || 'スキル',
      color: input.color || '#39ff14',
      mode: input.mode,
      seconds: Math.max(0, Math.floor(input.seconds) || 0),
      perSecondCd: Math.max(0, Math.floor(input.perSecondCd) || 0)
    };
    persistSkillCdPresets([...skillCdPresets, newPreset]);
    return newPreset;
  };

  const updateSkillCdPreset = (id: string, patch: Partial<Omit<SkillCdPreset, 'id'>>) => {
    persistSkillCdPresets(skillCdPresets.map(p => p.id === id ? {
      ...p,
      ...patch,
      label: (patch.label ?? p.label).trim() || p.label,
      color: patch.color ?? p.color,
      seconds: patch.seconds !== undefined ? Math.max(0, Math.floor(patch.seconds)) : p.seconds,
      perSecondCd: patch.perSecondCd !== undefined ? Math.max(0, Math.floor(patch.perSecondCd)) : p.perSecondCd
    } : p));
  };

  const removeSkillCdPreset = (id: string) => {
    persistSkillCdPresets(skillCdPresets.filter(p => p.id !== id));
  };

  return {
    setStartupFocusMarkerId,
    setHidden,
    setStorageLimit,
    storageLimitBytes: ref.current.storageLimitBytes ?? loadStorageLimitFromCache(),
    loaded,
    isLocal: isLocalRef.current,
    skillCdPresets,
    addSkillCdPreset,
    updateSkillCdPreset,
    removeSkillCdPreset
  } as const;
}
