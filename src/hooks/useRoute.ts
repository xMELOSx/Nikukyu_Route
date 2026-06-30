import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type FloorType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  type PresetData,
  type PresetVisibility,
  normalizePresetVisibility,
  normalizePresets,
  DEFAULT_ROUTE,
  DataManager,
  normalizeStrokes,
  AUTHOR_DEFAULT_PLAIN,
  AUTHOR_UNKNOWN_MARKER,
  generateId
} from '../utils/DataManager';
import type { GlobalDefaults } from './useGlobalDefaults';
import type { UseGlobalMarkersApi } from './useGlobalMarkers';

// Route は DISPLAY STATE のみを保持する: indiv マーカー + hidden リスト + 線
// + メタ情報。グローバルマーカーの実体は globalMarkersStore が保持する。
// グローバルタイプが route.markers に混入した場合はここで必ず弾く。
const ROUTE_INDIV_TYPES = new Set<string>([
  'start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking',
  'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'
]);
const stripGlobalMarkersFromRoute = (markers: HeistMarker[] | undefined): HeistMarker[] => {
  if (!Array.isArray(markers) || markers.length === 0) return [];
  return markers.filter(m => ROUTE_INDIV_TYPES.has(m.type));
};

export interface SaveInfo {
  id: string;
  title: string;
  targetCash: string;
  targetCoins: string;
  description: string;
  author: string;
  originalAuthor: string;
  createdAt: number;
  updatedAt: number;
}

export interface UseRouteOptions {
  isLocal: boolean;
  /** Global defaults ref, kept in sync by useGlobalDefaults. */
  globalDefaultsRef: React.MutableRefObject<GlobalDefaults>;
  /** Global-marker store, used by PNG/JSON import to merge in global markers. */
  globalMarkersStore: UseGlobalMarkersApi;
  /** Show a transient notification banner. */
  showNotification: (msg: string, ms?: number) => void;
  /** Marker scale (persisted separately). The route carries a snapshot for
   *  per-plan override; the live editor value is owned by the component. */
  initialMarkerScale: number;
  onMarkerScaleChange: (scale: number) => void;
}

export interface UseRouteApi {
  route: RouteData;
  setRoute: React.Dispatch<React.SetStateAction<RouteData>>;
  /** setRoute that always force-applies the current global defaults (hidden lists). */
  setRouteWithGlobalDefaults: (action: RouteData | ((prev: RouteData) => RouteData)) => void;
  saves: SaveInfo[];
  presets: PresetData[];
  /** Replace the preset list (used after fetching from server or import). */
  setPresets: (next: PresetData[]) => void;
  refreshSavesList: () => void;
  saveToLocal: () => void;
  saveAsCopy: () => void;
  createNewPlan: () => void;
  loadFromLocal: (id: string) => void;
  deleteFromLocal: (e: React.MouseEvent, id: string) => void;
  saveAsPreset: (input: {
    name: string;
    description: string;
    author: string;
    originalAuthor: string;
    visibility?: PresetVisibility;
  }) => void;
  /**
   * プリセットの内容 (ルートデータ + メタ情報) を現在の編集データで上書きする。
   * 公開レベル (visibility) は絶対に変更しない。公開レベルを変えたい場合は
   * setPresetVisibility を明示的に呼ぶこと。
   */
  overwritePreset: (presetId: string) => void;
  /** Replace presets and persist to server (used by quick-add). */
  savePresetsToServer: (next: PresetData[]) => void;
  deletePreset: (presetId: string) => void;
  /** 公開レベル変更 (public / unlisted / private) */
  setPresetVisibility: (presetId: string, visibility: PresetVisibility) => void;
  /** 表示フィルタ (public 以外を出すか) を適用したプリセット一覧を返す */
  filterVisiblePresets: (opts: { showUnlisted: boolean; showPrivate: boolean }) => PresetData[];
  /** URL (?preset=ID) でのアクセス可否を判定する */
  checkPresetUrlAccess: (presetId: string) => { allowed: boolean; reason?: 'not_found' | 'private_prod' };
  setBossCustomDuration: (id: string, duration: number | undefined) => void;
  setBattleCustomDuration: (id: string, duration: number | undefined) => void;
  setPickingCustomDuration: (id: string, duration: number | undefined) => void;
  setLongPickingCustomDuration: (id: string, duration: number | undefined) => void;
  setPickyMarker: (id: string, picky: boolean) => void;
  /** Apply a previously-saved route's marker scale to the live editor. */
  applyMarkerScale: (scale: number | undefined) => void;
  /** Internal: replace the route in-place (used by undo/redo). */
  _replaceRoute: (next: RouteData) => void;
}

/**
 * Owns the current RouteData, the save/preset lists, and all the standard
 * route operations (save/load/copy/delete/preset). Cross-cutting concerns
 * (auto-save timer, hidden-defaults sync, global-marker merge) are wired
 * through the options object.
 */
export function useRoute(options: UseRouteOptions): UseRouteApi {
  const {
    isLocal, globalDefaultsRef, globalMarkersStore,
    showNotification,
    initialMarkerScale, onMarkerScaleChange
  } = options;

  const [route, setRouteRaw] = useState<RouteData>(DEFAULT_ROUTE());
  const [saves, setSaves] = useState<SaveInfo[]>([]);
  const [presets, setPresetsState] = useState<PresetData[]>(() => normalizePresets(DataManager.loadPresetsFromLocalStorage()));

  const isLocalRef = useRef(isLocal);
  isLocalRef.current = isLocal;
  const globalDefaultsRefRef = useRef(globalDefaultsRef);
  globalDefaultsRefRef.current = globalDefaultsRef;
  const globalMarkersStoreRef = useRef(globalMarkersStore);
  globalMarkersStoreRef.current = globalMarkersStore;
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

  const refreshSavesList = useCallback(() => {
    // 同期で localStorage から取得。古い entry (v2:0: / 空 / 旧 XOR) は
    // ここでは正規化せず生で state に乗せる。表示側の SaveListRowAuthor が
    // 同期判定で「異常」表示にする。auto-save のたびに重い AES-GCM を
    // 走らせないため、 補完は初回マウント時の 1 回だけ useEffect で行う。
    setSaves(DataManager.getSavesList().sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  const setRoute = useCallback<React.Dispatch<React.SetStateAction<RouteData>>>((action) => {
    setRouteRaw(action);
  }, []);

  const setRouteWithGlobalDefaults = useCallback(
    (action: RouteData | ((prev: RouteData) => RouteData)) => {
      setRouteRaw(prev => {
        const next = typeof action === 'function' ? action(prev) : action;
        const gd = globalDefaultsRefRef.current.current;
        // SAFETY GUARD: route は display state のみ保持する。万一グローバル
        // タイプが混入していても (旧 export / 手編集JSON等) ここで必ず弾く。
        // グローバルマーカーは globalMarkersStore が source of truth。
        return {
          ...next,
          markers: stripGlobalMarkersFromRoute(next.markers),
          hiddenMarkers: [...new Set([...(next.hiddenMarkers || []), ...(gd.hiddenMarkers || [])])],
          hiddenMarkerTypes: [...new Set([...(next.hiddenMarkerTypes || []), ...(gd.hiddenMarkerTypes || [])])]
        };
      });
    },
    []
  );

  const autoSaveTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (!route || !route.id) return;
    const safeRoute: RouteData = {
      ...route,
      markers: stripGlobalMarkersFromRoute(route.markers)
    };
    const snapshot = JSON.stringify(safeRoute);
    if (snapshot === lastSavedSnapshotRef.current) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      try {
        let plainOriginal = route.originalAuthor || '';
        // 仕様: 原作者が未設定（空文字）のとき、現在の作者名（平文・No name以外）から自動コピー
        if (!plainOriginal && route.author && route.author !== AUTHOR_DEFAULT_PLAIN) {
          plainOriginal = route.author;
          setRouteRaw(prev => (prev.id === route.id && !prev.originalAuthor ? { ...prev, originalAuthor: plainOriginal } : prev));
        }

        const dataToSave = {
          ...safeRoute,
          originalAuthor: plainOriginal
        };
        DataManager.saveToLocalStorage(dataToSave);

        // 状態更新後の予想されるスナップショットを設定して、次のレンダリングループを防ぐ
        const expectedNextRoute = {
          ...safeRoute,
          originalAuthor: plainOriginal
        };
        lastSavedSnapshotRef.current = JSON.stringify(expectedNextRoute);
        
        // オートセーブ完了後にセーブ一覧を更新する
        refreshSavesList();
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [route]);

  const saveToLocal = useCallback(() => {
    let plainOriginal = route.originalAuthor || '';
    if (!plainOriginal && route.author && route.author !== AUTHOR_DEFAULT_PLAIN) {
      plainOriginal = route.author;
      setRouteRaw(prev => ({ ...prev, originalAuthor: plainOriginal }));
    }

    const toSave: RouteData = {
      ...route,
      originalAuthor: plainOriginal,
      mapVersion: 2,
      markerScale: initialMarkerScale
    };
    DataManager.saveToLocalStorage(toSave);
    
    // オートセーブのスナップショットと同期して、無駄な保存タイマーの再起動を防ぐ
    const expectedRouteState = {
      ...route,
      originalAuthor: plainOriginal
    };
    lastSavedSnapshotRef.current = JSON.stringify({
      ...expectedRouteState,
      markers: stripGlobalMarkersFromRoute(expectedRouteState.markers)
    });

    refreshSavesList();
    localStorage.setItem('heist_last_used_route_id', toSave.id);
    showNotificationRef.current(`保存完了: ${route.title}`);
  }, [route, initialMarkerScale, refreshSavesList]);

  const saveAsCopy = useCallback(() => {
    const newId = generateId('route');
    const newCreatedAt = Date.now();
    const copy: RouteData = {
      ...route, id: newId, title: `${route.title} (COPY)`, createdAt: newCreatedAt
    };
    DataManager.saveToLocalStorage(copy);
    setRouteRaw(copy);
    refreshSavesList();
    showNotificationRef.current(`コピー保存: ${copy.title}`);
  }, [route, refreshSavesList]);

  const createNewPlan = useCallback(() => {
    const currentAuthor = route.author;
    const newId = generateId('route');
    const newRoute = DEFAULT_ROUTE(newId);
    if (currentAuthor) {
      // author は平文なのでそのまま引き継ぎ
      newRoute.author = currentAuthor;
      newRoute.originalAuthor = '';
    }
    setRouteWithGlobalDefaults(newRoute);
    localStorage.setItem('heist_last_used_route_id', newId);
  }, [route, setRouteWithGlobalDefaults]);

  const loadFromLocal = useCallback((id: string) => {
    try {
      let data: RouteData | null = null;
      if (id.startsWith('__preset__')) {
        const presetId = id.replace('__preset__', '');
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;
        data = {
          ...preset.routeData,
          id: generateId('route'),
          title: preset.routeData.title
        };
      } else {
        data = DataManager.loadFromLocalStorage(id);
      }
      if (!data) return;

      // Strip legacy fields, backfill defaults, ensure floor/main, split global/individual
      data.markers = (data.markers || []).filter(
        m => m.type !== ('camera' as any) && m.type !== ('guard' as any)
      );
      const isIndiv = (t: string) =>
        ['start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'].includes(t);
      const planIndiv = data.markers
        .filter(m => isIndiv(m.type))
        .map(m => backfillMarkerDefaults({ ...m, floor: 'main' as FloorType }));
      const planGlobal = data.markers
        .filter(m => !isIndiv(m.type))
        .map(m => backfillMarkerDefaults({ ...m, floor: 'main' as FloorType }));
      if (planGlobal.length > 0) {
        globalMarkersStoreRef.current.mergeFromImport(planGlobal);
      }
      data.markers = planIndiv;

      if (!data.strokes || typeof data.strokes !== 'object') data.strokes = { main: [] };
      if (!data.strokes.main) {
        const merged: DrawingStroke[] = [];
        Object.keys(data.strokes).forEach(k => {
          const arr = (data!.strokes as any)[k];
          if (Array.isArray(arr)) merged.push(...arr);
        });
        data.strokes = { main: merged };
      }
      data.strokes.main = normalizeStrokes(data.strokes.main);

      if (!data.customBg || !data.customBg.main) data.customBg = { main: null };
      data.bossCustomDurations = data.bossCustomDurations || {};
      data.battleCustomDurations = data.battleCustomDurations || {};
      data.pickingCustomDurations = data.pickingCustomDurations || {};
      data.longPickingCustomDurations = data.longPickingCustomDurations || {};
      data.pickyMarkerIds = data.pickyMarkerIds || {};
      // Migrate legacy marker-level `pickingPicky` (was incorrectly stored
      // on the marker; the plan owns the picky state instead). Cover BOTH
      // the individual markers (which live in the route) and the global
      // markers (which are about to be merged into the global store), so
      // gpicking/glong_picking pickies are preserved per plan.
      const legacyPickySources: HeistMarker[] = [
        ...(Array.isArray(planIndiv) ? planIndiv : []),
        ...(Array.isArray(planGlobal) ? planGlobal : [])
      ];
      for (const m of legacyPickySources) {
        if (m && m.pickingPicky) {
          data.pickyMarkerIds![m.id] = true;
        }
      }
      data.hiddenMarkers = data.hiddenMarkers || [];
      data.hiddenMarkerTypes = data.hiddenMarkerTypes || [];
      if (data.author === undefined) data.author = '';
      if (data.originalAuthor === undefined) data.originalAuthor = '';

      // author / originalAuthor のロード時フォールバック:
      //   空 (または AUTHOR_UNKNOWN_MARKER)  -> AUTHOR_UNKNOWN_MARKER のまま残す。
      //                                          改ざんの疑いとして Anomaly 表示にする。
      //                                          ユーザはクリアボタン or input 編集で
      //                                          意図的に No name にリセットできる。
      // 「ロード時に何事もなかったかのように No name に補完」 すると改ざんに
      // 気づけなくなる (= 保護として機能しない) ため、ここでは補完しない。
      if (!data.author) {
        data.author = '';
      }
      if (!data.originalAuthor) {
        data.originalAuthor = AUTHOR_UNKNOWN_MARKER;
      }

      if (data.id !== 'default') {
        const gd = globalDefaultsRefRef.current.current;
        data.hiddenMarkers = [...new Set([...data.hiddenMarkers, ...(gd.hiddenMarkers || [])])];
        data.hiddenMarkerTypes = [...new Set([...data.hiddenMarkerTypes, ...(gd.hiddenMarkerTypes || [])])];
      }
      setRouteWithGlobalDefaults(data);
      localStorage.setItem('heist_last_used_route_id', data.id);
      if (data.markerScale !== undefined) {
        onMarkerScaleChange(data.markerScale);
      }
      showNotificationRef.current(`読み込み完了: ${data.title}`);
    } catch (e) {
      console.error('loadFromLocal failed:', e);
      showNotificationRef.current('データの読み込みに失敗しました', 3000);
    }
  }, [presets, setRouteWithGlobalDefaults, onMarkerScaleChange]);

  const deleteFromLocal = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    DataManager.deleteFromLocalStorage(id);
    if (localStorage.getItem('heist_last_used_route_id') === id) {
      localStorage.removeItem('heist_last_used_route_id');
    }
    refreshSavesList();
    if (route.id === id) {
      // Keep the current route state in memory; only remove the saved entry.
      // The user can keep working and decide to save as a new entry later.
      lastSavedSnapshotRef.current = JSON.stringify({
        ...route,
        markers: stripGlobalMarkersFromRoute(route.markers)
      });
    }
  }, [route, setRouteWithGlobalDefaults, refreshSavesList]);

  const savePresetsToServer = useCallback((next: PresetData[]) => {
    const normalized = normalizePresets(next);
    setPresetsState(normalized);
    DataManager.savePresetsToLocalStorage(normalized);
    fetch(`${import.meta.env.BASE_URL}api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized)
    }).catch(() => { });
  }, []);

  const saveAsPreset = useCallback((input: {
    name: string; description: string; author: string; originalAuthor: string;
    visibility?: PresetVisibility;
  }) => {
    const toSave: RouteData = { ...route, mapVersion: 2, markerScale: initialMarkerScale };
    const newPreset: PresetData = {
      id: generateId('preset'),
      name: input.name.trim() || route.title,
      description: input.description,
      targetCash: route.targetCash,
      targetCoins: route.targetCoins,
      author: route.author || '',
      originalAuthor: route.originalAuthor || '',
      updatedAt: Date.now(),
      visibility: normalizePresetVisibility(input.visibility),
      routeData: toSave
    };
    savePresetsToServer([...presets, newPreset]);
    showNotificationRef.current(`プリセット追加: ${newPreset.name}`);
  }, [route, initialMarkerScale, presets, savePresetsToServer]);

  const deletePreset = useCallback((presetId: string) => {
    savePresetsToServer(presets.filter(p => p.id !== presetId));
    showNotificationRef.current('プリセットを削除しました');
  }, [presets, savePresetsToServer]);

  /**
   * プリセットの内容 (ルートデータ + メタ情報) を現在の編集データで上書きする。
   * 注意: 公開レベル (visibility) は絶対に変更しない。
   *   既存の { ...presets[idx] } スプレッドに visibility フィールドが含まれ、
   *   その後に visibility 関連の代入は一切行わないため、元の値がそのまま保持される。
   *   公開レベルを変えたい場合は setPresetVisibility を明示的に呼ぶこと。
   */
  const overwritePreset = useCallback((presetId: string) => {
    const idx = presets.findIndex(p => p.id === presetId);
    if (idx === -1) return;
    const toSave: RouteData = { ...route, mapVersion: 2, markerScale: initialMarkerScale };
    const updatedPreset: PresetData = {
      ...presets[idx],
      name: route.title,
      description: route.description || '',
      targetCash: route.targetCash,
      targetCoins: route.targetCoins,
      author: route.author || '',
      originalAuthor: route.originalAuthor || '',
      updatedAt: Date.now(),
      routeData: toSave
    };
    const nextPresets = [...presets];
    nextPresets[idx] = updatedPreset;
    savePresetsToServer(nextPresets);
    showNotificationRef.current(`プリセットを上書きしました: ${updatedPreset.name}`);
  }, [presets, route, initialMarkerScale, savePresetsToServer]);

  /**
   * 指定プリセットの公開レベルを変更する。サーバ + localStorage 両方を更新する。
   */
  const setPresetVisibility = useCallback((presetId: string, visibility: PresetVisibility) => {
    const idx = presets.findIndex(p => p.id === presetId);
    if (idx === -1) return;
    const next = [...presets];
    next[idx] = { ...next[idx], visibility: normalizePresetVisibility(visibility) };
    savePresetsToServer(next);
  }, [presets, savePresetsToServer]);

  /**
   * 現在のモード (isLocal) と表示フィルタに応じて、表示してよいプリセットを返す。
   *  - public:  常に表示
   *  - unlisted: URL (?preset=ID) 経由で開く想定。一覧ではフィルタ out (showUnlisted=true で表示)
   *  - private:  ローカルモードでのみ表示。showPrivate は基本 true 固定 (private の存在を
   *              知らせないとアップロード済みの private を見つけられないため)。本番モードでは
   *              一切出さない。
   */
  const filterVisiblePresets = useCallback((opts: {
    showUnlisted: boolean;
    showPrivate: boolean;
  }): PresetData[] => {
    return presets.filter(p => {
      const v = normalizePresetVisibility(p.visibility);
      if (v === 'public') return true;
      if (v === 'unlisted') return !!opts.showUnlisted;
      if (v === 'private')  return isLocalRef.current && !!opts.showPrivate;
      return true;
    });
  }, [presets]);

  /**
   * URL パラメータ経由 (?preset=ID) で開く際のゲート。
   * プリセットが見つかっても現在のモードで許可されていなければ拒否する。
   * 戻り値: { allowed, reason?: 'not_found' | 'private_prod' }
   *   - 'not_found'    : プリセット ID が存在しない
   *   - 'private_prod' : 本番モードで private を開こうとした
   *  - public / unlisted は URL 経由で開ける (unlisted は URL を知っている人だけ
   *    がたどり着ける前提なので、本番モードでも拒否しない)
   */
  const checkPresetUrlAccess = useCallback((presetId: string): { allowed: boolean; reason?: 'not_found' | 'private_prod' } => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return { allowed: false, reason: 'not_found' };
    const v = normalizePresetVisibility(preset.visibility);
    if (v === 'private' && !isLocalRef.current) {
      return { allowed: false, reason: 'private_prod' };
    }
    return { allowed: true };
  }, [presets]);

  const setBossCustomDuration = useCallback((id: string, duration: number | undefined) => {
    setRouteRaw(prev => {
      const next = { ...(prev.bossCustomDurations || {}) };
      if (duration === undefined) delete next[id];
      else next[id] = duration;
      return { ...prev, bossCustomDurations: next };
    });
  }, []);

  const setBattleCustomDuration = useCallback((id: string, duration: number | undefined) => {
    setRouteRaw(prev => {
      const next = { ...(prev.battleCustomDurations || {}) };
      if (duration === undefined) delete next[id];
      else next[id] = duration;
      return { ...prev, battleCustomDurations: next };
    });
  }, []);

  const setPickingCustomDuration = useCallback((id: string, duration: number | undefined) => {
    setRouteRaw(prev => {
      const next = { ...(prev.pickingCustomDurations || {}) };
      if (duration === undefined) delete next[id];
      else next[id] = duration;
      return { ...prev, pickingCustomDurations: next };
    });
  }, []);

  const setLongPickingCustomDuration = useCallback((id: string, duration: number | undefined) => {
    setRouteRaw(prev => {
      const next = { ...(prev.longPickingCustomDurations || {}) };
      if (duration === undefined) delete next[id];
      else next[id] = duration;
      return { ...prev, longPickingCustomDurations: next };
    });
  }, []);

  const setPickyMarker = useCallback((id: string, picky: boolean) => {
    setRouteRaw(prev => {
      const next = { ...(prev.pickyMarkerIds || {}) };
      if (!picky) delete next[id];
      else next[id] = true;
      return { ...prev, pickyMarkerIds: next };
    });
  }, []);

  const applyMarkerScale = useCallback((scale: number | undefined) => {
    if (scale !== undefined) onMarkerScaleChange(scale);
  }, [onMarkerScaleChange]);

  // Internal helpers for cross-hook coordination (undo/redo, import).
  // Not part of the public API; tests would use these directly.
  const _replaceRoute = useCallback((next: RouteData) => {
    setRouteRaw(next);
  }, []);

  // Expose presets as a read-only set and a replace fn for the host
  // (used by the import flow to push migrated presets into the list).
  // Note: presets are normally updated via savePresetsToServer above.
  // setPresets mirrors the list to localStorage so the list survives
  // transient server failures (avoids "temporarily empty" preset list).
  // visibility は常に normalizePresets で正規化してから保存する (レガシーデータ
  // や壊れた JSON でも公開レベルが 'public' 補完される)。
  const setPresets = useCallback((next: PresetData[]) => {
    const normalized = normalizePresets(next);
    setPresetsState(normalized);
    DataManager.savePresetsToLocalStorage(normalized);
  }, []);

  return {
    route, setRoute, setRouteWithGlobalDefaults,
    saves, presets, setPresets, refreshSavesList,
    saveToLocal, saveAsCopy, createNewPlan,
    loadFromLocal, deleteFromLocal,
    saveAsPreset, overwritePreset, savePresetsToServer, deletePreset,
    setPresetVisibility, filterVisiblePresets, checkPresetUrlAccess,
    setBossCustomDuration, setBattleCustomDuration,
    setPickingCustomDuration, setLongPickingCustomDuration,
    setPickyMarker,
    applyMarkerScale,
    _replaceRoute
  };
}

function backfillMarkerDefaults(m: HeistMarker): HeistMarker {
  if (m.type === 'boss') {
    if (m.bossDurationSeconds === undefined) m.bossDurationSeconds = 60;
    if (m.bossDrops === undefined) m.bossDrops = [];
  } else if (m.type === 'battle' || m.type === 'gbattle') {
    if (m.battleDurationSeconds === undefined) m.battleDurationSeconds = 20;
  } else if (m.type === 'picking' || m.type === 'gpicking') {
    if (m.pickingDurationSeconds === undefined) m.pickingDurationSeconds = 5;
  } else if (m.type === 'long_picking' || m.type === 'glong_picking') {
    if (m.longPickingDurationSeconds === undefined) m.longPickingDurationSeconds = 8;
  }
  return m;
}
