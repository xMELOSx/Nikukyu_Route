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
  AUTHOR_TAMPERED,
  aesGcmEncrypt,
  aesGcmDecrypt,
  getRenderCacheKey,
  migrateOriginalAuthorToRenderCache,
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
  renderCache: string;
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
    renderCache: string;
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
    const list = DataManager.getSavesList().sort((a, b) => b.updatedAt - a.updatedAt);
    setSaves(list);
    // ---- デバッグ: 一覧取得結果をコンソールに出す ----
    console.log('[refreshSavesList] saves:', list.map(s => ({
      id: s.id,
      title: s.title,
      author: s.author,
      renderCache_preview: (s.renderCache || '').slice(0, 40),
      renderCache_len: (s.renderCache || '').length,
      isUnknownMarker: s.renderCache === AUTHOR_UNKNOWN_MARKER
    })));
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

  // 初回自動コピー: renderCache が空 + author が 'No name' 以外のとき、 author を
  // renderCache にコピー (= メモリ平文の代入のみ。 暗号化は保存時)。
  // 1 回だけ (= renderCache が一度セットされたら再発火しない)。
  useEffect(() => {
    if (!route || !route.id) return;
    if (!route.author || route.author === AUTHOR_DEFAULT_PLAIN) return;
    if (route.renderCache) return; // 既にセット済み (= 1回だけ)
    setRouteRaw(prev => {
      if (prev.id !== route.id) return prev;
      if (prev.renderCache) return prev;
      return { ...prev, renderCache: prev.author };
    });
  }, [route.id, route.author, route.renderCache]);

  // メモリの renderCache が暗号文 (= v2: / legacy:) になっていたら復号して平文に戻す。
  // (= メモリは常に平文という仕様への強制遵守。
  //  何かの race condition / 旧経路で暗号文が混入した場合のリカバリ用。)
  //  AUTHOR_UNKNOWN_MARKER ('v2:0:') は「No name として保存」されたセーブのセンチネル
  //  なので復号せず、メモリも AUTHOR_UNKNOWN_MARKER (= 空として表示) のままにする。
  useEffect(() => {
    if (!route || !route.id) return;
    const cache = route.renderCache;
    if (typeof cache !== 'string') return;
    if (!cache) return;
    if (cache === AUTHOR_UNKNOWN_MARKER) {
      // 'v2:0:' → メモリ上は空文字 (No name 表示) に正規化
      setRouteRaw(prev => prev.id === route.id && prev.renderCache === AUTHOR_UNKNOWN_MARKER
        ? { ...prev, renderCache: '' }
        : prev);
      return;
    }
    if (cache.startsWith('v2:') || cache.startsWith('legacy:')) {
      // 暗号文 → 復号して平文に戻す
      aesGcmDecrypt(cache, getRenderCacheKey(route.id)).then((plain) => {
        if (plain === AUTHOR_TAMPERED) {
          // 改ざん → メモリ上は空 (Anomaly として SaveListRowAuthor 側で表示)
          setRouteRaw(prev => prev.id === route.id && prev.renderCache === cache
            ? { ...prev, renderCache: '' }
            : prev);
          return;
        }
        setRouteRaw(prev => prev.id === route.id && prev.renderCache === cache
          ? { ...prev, renderCache: plain }
          : prev);
      }).catch(() => { /* ignore */ });
    }
  }, [route.id, route.renderCache]);

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
    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        // 自動コピー: renderCache が空 + author が No name 以外のとき、初回のみ
        // メモリに author (= 平文) を代入。 これは別 useEffect (= 初回コピー用) で
        // 行い、 ここでは読取のみ。 autoSave は「現在メモリの renderCache を
        // route.id 派生キーで暗号化して保存する」だけのシンプルな処理にする。
        const plainCache = route.renderCache || '';

        const safeAuthorKey = getRenderCacheKey(route.id);
        let encoded: string;
        try {
          encoded = plainCache
            ? await aesGcmEncrypt(plainCache, safeAuthorKey)
            : AUTHOR_UNKNOWN_MARKER;
        } catch (e) {
          // 暗号化失敗 -> 平文のまま保存 (セーブをブロックしない)
          console.error('renderCache encryption failed, saving as plain:', e);
          encoded = plainCache || '';
        }

        // ---- デバッグ: 暗号化内容と key をコンソールに出力 ----
        // Anomaly 調査の切り分け用。一時的に残す。
        console.log('[useRoute.autoSave]', {
          routeId: route.id,
          createdAt: route.createdAt,
          key: safeAuthorKey,
          plainCache,
          encoded_preview: encoded.slice(0, 40),
          encoded_len: encoded.length,
          isUnknownMarker: encoded === AUTHOR_UNKNOWN_MARKER
        });

        const dataToSave = {
          ...safeRoute,
          renderCache: encoded
        };
        DataManager.saveToLocalStorage(dataToSave);

        // ---- デバッグ: 保存直後に localStorage を読み直して検証 ----
        // 暗号文が実際に正しく保存されているか確認
        try {
          const written = localStorage.getItem(`heist_route_${route.id}`);
          if (written) {
            const parsed = JSON.parse(written);
            console.log('[useRoute.autoSave] localStorage written:', {
              key: `heist_route_${route.id}`,
              routeIdInData: parsed.id,
              storedRenderCache_preview: (parsed.renderCache || '').slice(0, 40),
              storedRenderCache_len: (parsed.renderCache || '').length,
              storedRenderCache_id_matches: parsed.id === route.id,
              storedRenderCache_idValue: parsed.id
            });
          } else {
            console.log('[useRoute.autoSave] localStorage NOT WRITTEN for', `heist_route_${route.id}`);
          }
        } catch (e: any) {
          console.error('[useRoute.autoSave] localStorage readback failed', e);
        }

        // 状態更新後の予想されるスナップショットを設定して、次のレンダリングループを防ぐ
        // (メモリの renderCache は平文のまま)
        const expectedNextRoute = {
          ...safeRoute,
          renderCache: plainCache
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

  const saveToLocal = useCallback(async () => {
    // メモリ上の renderCache (平文) を取得
    const plainCache = route.renderCache || '';
    // 保存用キーは author (= 保存対象の平文) を使う。
    // メモリ上の renderCache を route.id 派生キーで暗号化して localStorage に書く。
    const safeAuthorKey = getRenderCacheKey(route.id);
    let encoded: string;
    try {
      encoded = plainCache
        ? await aesGcmEncrypt(plainCache, safeAuthorKey)
        : AUTHOR_UNKNOWN_MARKER;
    } catch (e) {
      console.error('renderCache encryption failed, saving as plain:', e);
      encoded = plainCache || '';
    }

    // ---- デバッグ ----
    console.log('[useRoute.saveToLocal]', {
      routeId: route.id,
      createdAt: route.createdAt,
      key: safeAuthorKey,
      plainCache,
      encoded_preview: encoded.slice(0, 40),
      encoded_len: encoded.length,
      isUnknownMarker: encoded === AUTHOR_UNKNOWN_MARKER
    });

    const toSave: RouteData = {
      ...route,
      renderCache: encoded,
      mapVersion: 2,
      markerScale: initialMarkerScale
    };
    DataManager.saveToLocalStorage(toSave);

    // オートセーブのスナップショットと同期して、無駄な保存タイマーの再起動を防ぐ
    const expectedRouteState = {
      ...route,
      renderCache: plainCache
    };
    lastSavedSnapshotRef.current = JSON.stringify({
      ...expectedRouteState,
      markers: stripGlobalMarkersFromRoute(expectedRouteState.markers)
    });

    refreshSavesList();
    localStorage.setItem('heist_last_used_route_id', toSave.id);
    showNotificationRef.current(`保存完了: ${route.title}`);
  }, [route, initialMarkerScale, refreshSavesList]);

  const saveAsCopy = useCallback(async () => {
    const newId = generateId('route');
    const newCreatedAt = Date.now();
    // メモリ上の renderCache (平文) を新 ID のキーで暗号化して localStorage に保存
    const plainCache = route.renderCache || '';
    let encoded: string;
    if (plainCache) {
      try {
        encoded = await aesGcmEncrypt(plainCache, getRenderCacheKey(newId));
      } catch {
        encoded = plainCache;
      }
    } else {
      encoded = AUTHOR_UNKNOWN_MARKER;
    }
    // メモリには平文を書き戻す (暗号文は localStorage のみ)。
    // メモリ上は常に平文という仕様。
    const copy: RouteData = {
      ...route, id: newId, title: `${route.title} (COPY)`, createdAt: newCreatedAt,
      renderCache: plainCache
    };
    // localStorage には暗号文を保存するため、保存直前にもう一度コピーして暗号文を差し込む
    const toPersist: RouteData = { ...copy, renderCache: encoded };
    DataManager.saveToLocalStorage(toPersist);
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
      // 新規プランは renderCache 空 (= No name) から開始
      newRoute.renderCache = '';
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

      // 旧 originalAuthor フィールドを renderCache へマイグレート
      data = migrateOriginalAuthorToRenderCache(data as any) as RouteData;

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

      // renderCache ロード時フォールバック:
      //   1. 旧 originalAuthor キーが残っていれば migrate 済み
      //   2. 既に暗号文 (v2: / legacy:) なら復号を試みて平文にする
      //   3. 空 / AUTHOR_UNKNOWN_MARKER / 改ざん → メモリ上は空文字 (No name 表示)
      //   4. author と一致するならそのまま (= 元の作者が原作者を兼ねている)
      // 「ロード時に何事もなかったかのように No name に補完」すると改ざんに気づけなくなる
      // ため、復号失敗 = 改ざんの疑い として author には触らず renderCache は空に。
      const applyRenderCacheSync = () => {
        const stored = data!.renderCache;
        if (typeof stored !== 'string' || !stored) {
          data!.renderCache = '';
          return;
        }
        if (stored === AUTHOR_UNKNOWN_MARKER) {
          // 暗号文は AUTHOR_UNKNOWN_MARKER (v2:0:) → 空として扱う
          data!.renderCache = '';
          return;
        }
        if (stored.startsWith('v2:') || stored.startsWith('legacy:')) {
          // 同期では復号できないので、async で復号してから setRoute する
          // ここではまず空にし、後で非同期に復号結果を反映する
          data!.renderCache = '';
          aesGcmDecrypt(stored, getRenderCacheKey(data!.id)).then((plain) => {
            if (plain === AUTHOR_TAMPERED) {
              // 改ざん: 空のまま (= Anomaly として UI 側でハンドリング)
              return;
            }
            // 復号成功: 平文をメモリに反映
            setRouteRaw(prev => prev.id === data!.id ? { ...prev, renderCache: plain } : prev);
          }).catch(() => { /* ignore */ });
          return;
        }
        // プレフィックスなし: 旧平文 (旧マイグレート途中のデータ等) → そのまま
        data!.renderCache = stored;
      };
      applyRenderCacheSync();

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
    name: string; description: string; author: string; renderCache: string;
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
      renderCache: route.renderCache || '',
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
      renderCache: route.renderCache || '',
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
