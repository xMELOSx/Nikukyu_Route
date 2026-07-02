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
  migrateLoadedRoute,
  normalizeStrokes,
  AUTHOR_DEFAULT_PLAIN,
  AUTHOR_UNKNOWN_MARKER,
  AUTHOR_TAMPERED,
  aesGcmEncrypt,
  aesGcmDecrypt,
  getOriginalAuthorKey,
  migrateOriginalAuthorToRenderCache,
  savePresetBody,
  loadPresetBody,
  removePresetBody,
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
  hasCustomBg?: boolean;
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
  /** オートセーブの有効/無効 (デフォルト true)。設定タブから切り替え可能。 */
  autoSaveEnabled?: boolean;
  /** オートセーブ間隔 (ms)。デフォルト 300000 (5分)。最小 1500 (デバウンス即時)。 */
  autoSaveInterval?: number;
}

export interface UseRouteApi {
  route: RouteData;
  setRoute: React.Dispatch<React.SetStateAction<RouteData>>;
  /** setRoute that always force-applies the current global defaults (hidden lists). */
  setRouteWithGlobalDefaults: (action: RouteData | ((prev: RouteData) => RouteData)) => void;
  saves: SaveInfo[];
  presets: PresetData[];
  /**
   * プリセットがメモリに展開されているかどうか。プリセットは routeData が
   * 大きいため、ロードモーダルを開いた瞬間にだけメモリに展開し、
   * 閉じたら破棄する (App.tsx が ensurePresetsLoaded / releasePresets を
   * useEffect で制御する)。
   */
  presetsLoaded: boolean;
  /** Replace the preset list (used after fetching from server or import). */
  setPresets: (next: PresetData[], opts?: { fromServer?: boolean }) => void;
  /** プリセット一覧をメモリにロードする (idempotent)。 */
  ensurePresetsLoaded: () => PresetData[];
  /** プリセット一覧をメモリから破棄する (localStorage 側は変更しない)。 */
  releasePresets: () => void;
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
    initialMarkerScale, onMarkerScaleChange,
    autoSaveEnabled = true,
    autoSaveInterval = 300000
  } = options;

  const [route, setRouteRaw] = useState<RouteData>(DEFAULT_ROUTE());
  const [saves, setSaves] = useState<SaveInfo[]>([]);
  // プリセットはメモリ圧迫が大きいため、ロードモーダルを開いた瞬間にだけ
  // ローカルストレージから展開する (= 必要な時だけメモリに乗る)。
  // 閉じたら releasePresets() でメモリから破棄する。
  const [presets, setPresetsState] = useState<PresetData[] | null>(null);
  // presets state への参照を ref でも保持し、コールバック内で常に最新を参照する
  // (state は useCallback 依存配列に追加すると再生成されるため、ref を併用する)
  const presetsRef = useRef<PresetData[] | null>(null);
  presetsRef.current = presets;

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
  const autoSaveEnabledRef = useRef<boolean>(autoSaveEnabled);
  autoSaveEnabledRef.current = autoSaveEnabled;
  const autoSaveIntervalRef = useRef<number>(autoSaveInterval);
  autoSaveIntervalRef.current = autoSaveInterval;

  // メモリの renderCache が暗号文 (= v2: / legacy: プレフィックス) の場合、
  // 復号して平文に戻す (= メモリは常に平文という仕様)。
  // 何かの race condition / 旧経路で暗号文が混入した場合のリカバリ用。
  //
  // 復号結果の判定 (メモリ上の値):
  //   - AUTHOR_TAMPERED (改竄) → 空文字 ('') = Anomaly。 UI 側で「Anomaly」表示
  //   - 'No name' (AUTHOR_DEFAULT_PLAIN) → 「意図的に No name として保存された」正常値
  //     → メモリ上は AUTHOR_DEFAULT_PLAIN 文字列 (= 'No name') のまま保持
  //   - 正しい文字列 → そのまま平文として表示 (= 設計通りの原作者)
  //
  // AUTHOR_UNKNOWN_MARKER ('v2:0:') は No name の暗号文 (正常値)。
  // → メモリ上は AUTHOR_DEFAULT_PLAIN 文字列 (= 'No name') に正規化
  //
  // 空文字 ('') は異常値 (Anomaly)。 そのまま保持 (= UI 側で Anomaly 表示)
  //
  // 重要: author (=編集者) からは絶対に補完しない。 author 編集で原作者が変化してはならない。
  useEffect(() => {
    if (!route || !route.id) return;
    // オートセーブが無効なら何もしない (手動保存のみ有効)
    if (autoSaveEnabledRef.current !== true) {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
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
        // renderCache (=原作者) を保存。 author からは独立 (= author から補完しない)。
        // 復号キーは routeId + createdAt + presetSourceId を含む派生鍵 (= getOriginalAuthorKey)。
        const plainCache = route.renderCache;

        const safeAuthorKey = getOriginalAuthorKey(route.id, route.createdAt);
        let encoded: string;
        try {
          if (typeof plainCache === 'string' && plainCache.length > 0) {
            // 平文 renderCache → 暗号化
            encoded = await aesGcmEncrypt(plainCache, safeAuthorKey);
          } else {
            // 空文字 ('') または未定義 → どちらも No name として保存
            // (空文字は本来 Anomaly だが、 ロード直後の race condition で一時的に空になる
            //  ことがあるため、 ここでは No name センチネルで保存 = Anomaly 状態を回避)
            encoded = AUTHOR_UNKNOWN_MARKER;
          }
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
          renderCache: encoded,
          // customBg (base64 画像) は localStorage 容量を圧迫するため、
          // localStorage には保存しない (= メモリには残るが、再ロード時に BG は消える)
          customBg: { main: null }
        };
        const saved = DataManager.saveToLocalStorage(dataToSave);
        if (!saved) {
          console.warn('[useRoute.autoSave] save failed (quota?) — keeping in-memory only');
        }

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
    }, autoSaveIntervalRef.current);
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [route]);

  const saveToLocal = useCallback(async () => {
    // renderCache (=原作者) は author (=編集者) と完全に独立した保護対象。
    // 復号キーは routeId + createdAt を含む派生鍵 (= getOriginalAuthorKey) を使い、
    // 暗号化された値は author の編集では変わらない (= author から補完しない)。
    //
    // メモリ上の renderCache の取り得る値:
    //   - 正規の原作者名 (平文) → 暗号化して保存
    //   - AUTHOR_DEFAULT_PLAIN ('No name') → 暗号化 ('No name' の暗号文) して保存
    //   - 空文字 ('') → 異常値 (Anomaly)。 ロード直後の race condition で一時的に
    //     空になることがあるため、 ここでは No name センチネルで保存 (= Anomaly 状態を回避)
    //   - 未定義 → No name のセンチネルで保存
    const plainCache = route.renderCache;
    const safeAuthorKey = getOriginalAuthorKey(route.id, route.createdAt);
    let encoded: string;
    try {
      if (typeof plainCache === 'string' && plainCache.length > 0) {
        // 平文 renderCache → 暗号化
        encoded = await aesGcmEncrypt(plainCache, safeAuthorKey);
      } else {
        // 空文字 / 未定義 → No name のセンチネルで保存
        encoded = AUTHOR_UNKNOWN_MARKER;
      }
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
    // ---- デバッグ: 復号テスト (復号キーが正しいか) ----
    if (encoded.startsWith('v2:') && encoded !== AUTHOR_UNKNOWN_MARKER) {
      try {
        const decoded = await aesGcmDecrypt(encoded, safeAuthorKey);
        console.log('[useRoute.saveToLocal] self-decrypt check:', { encoded_preview: encoded.slice(0, 40), decoded });
      } catch (e) {
        console.error('[useRoute.saveToLocal] self-decrypt FAILED:', e);
      }
    }

    const toSave: RouteData = {
      ...route,
      renderCache: encoded,
      // customBg (base64 画像) は localStorage 容量を圧迫するため、
      // localStorage には保存しない (= メモリには残るが、再ロード時に BG は消える)
      customBg: { main: null },
      mapVersion: 2,
      markerScale: initialMarkerScale
    };
    const saved = DataManager.saveToLocalStorage(toSave);
    if (!saved) {
      showNotificationRef.current('⚠️ localStorage の容量上限を超えました。古いセーブデータを削除してください', 5000);
    }

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
    // renderCache (=原作者) は author と独立。 author から補完しない。
    // 新 ID + 新 createdAt で派生鍵を作り直す (= コピー後の新ルート用に再暗号化)。
    const plainCache = route.renderCache;
    let encoded: string;
    if (typeof plainCache === 'string' && plainCache.length > 0) {
      try {
        encoded = await aesGcmEncrypt(plainCache, getOriginalAuthorKey(newId, newCreatedAt));
      } catch {
        encoded = plainCache;
      }
    } else if (plainCache === '') {
      // 空文字 = 異常値 (Anomaly)。 警告ログを出してそのまま保存
      console.warn('[useRoute.saveAsCopy] renderCache is empty string (Anomaly), saving as-is', { routeId: route.id });
      encoded = '';
    } else {
      encoded = AUTHOR_UNKNOWN_MARKER;
    }
    // メモリには平文を書き戻す (暗号文は localStorage のみ)。
    // メモリ上は常に平文という仕様。
    const copy: RouteData = {
      ...route, id: newId, title: `${route.title} (COPY)`, createdAt: newCreatedAt,
      renderCache: plainCache ?? ''
    };
    // localStorage には暗号文を保存するため、保存直前にもう一度コピーして暗号文を差し込む
    // customBg は localStorage 容量圧迫のため null に
    const toPersist: RouteData = { ...copy, renderCache: encoded, customBg: { main: null } };
    const saved = DataManager.saveToLocalStorage(toPersist);
    if (!saved) {
      showNotificationRef.current('⚠️ localStorage の容量上限を超えました', 5000);
    }
    setRouteRaw(copy);
    refreshSavesList();
    showNotificationRef.current(`コピー保存: ${copy.title}`);
  }, [route, refreshSavesList]);

  const createNewPlan = useCallback(() => {
    const currentAuthor = route.author;
    const newId = generateId('route');
    const newRoute = DEFAULT_ROUTE(newId);
    if (currentAuthor && currentAuthor !== AUTHOR_DEFAULT_PLAIN) {
      // author は平文なのでそのまま引き継ぎ
      newRoute.author = currentAuthor;
      // 新規プラン作成時 (= 1回だけ): author を renderCache (=原作者) の初期値にする
      // (= 「作者 = 原作者を兼ねる」前提の初期化。 以降の author 編集では renderCache は不変)
      newRoute.renderCache = currentAuthor;
    } else {
      // author が未設定 (= 空 or 'No name') → 新規プランは renderCache = 'No name' (= AUTHOR_DEFAULT_PLAIN)
      newRoute.renderCache = AUTHOR_DEFAULT_PLAIN;
    }
    setRouteWithGlobalDefaults(newRoute);
    localStorage.setItem('heist_last_used_route_id', newId);
  }, [route, setRouteWithGlobalDefaults]);

  // サーバ (= static presets.json) のプリセット実体キャッシュ。
  // プリセット呼び出し時に fetch で取りに行き、メモリに保持する (= 再呼び出しを高速化)。
  // localStorage には絶対に保存しない (= 容量問題の主因)。
  const serverPresetBodiesRef = useRef<Map<string, RouteData> | null>(null);
  const ensureServerPresetBodies = useCallback(async (): Promise<Map<string, RouteData>> => {
    if (serverPresetBodiesRef.current !== null) return serverPresetBodiesRef.current;
    const map = new Map<string, RouteData>();
    try {
      // dev server API を試して、ダメなら static presets.json
      const tryFetch = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json() as PresetData[];
      };
      let data = await tryFetch(`${import.meta.env.BASE_URL}api/presets`);
      if (!data) data = await tryFetch(`${import.meta.env.BASE_URL}presets.json`);
      if (Array.isArray(data)) {
        for (const p of data) {
          if (p && typeof p === 'object' && typeof p.id === 'string' && p.routeData && typeof p.routeData === 'object') {
            map.set(p.id, migrateOriginalAuthorToRenderCache(p.routeData as any) as RouteData);
          }
        }
      }
    } catch { /* ネットワークエラー等は無視 (= そのプリセットは呼出せない) */ }
    serverPresetBodiesRef.current = map;
    return map;
  }, []);

  const loadFromLocal = useCallback(async (id: string) => {
    try {
      let data: RouteData | null = null;
      if (id.startsWith('__preset__')) {
        const presetId = id.replace('__preset__', '');
        // 実体は次の優先順で取得:
        //   1. localStorage 由来のメモリ上のプリセット (= presetsRef.current)
        //   2. プリセットメタに routeData が埋まっている (= 旧形式/サーバデータ)
        //   3. ローカルの heist_preset_body_<id> (= ユーザ作成プリセットの実体)
        //   4. サーバ presets.json からオンデマンド取得
        let preset: PresetData | undefined;
        let body: RouteData | null | undefined;

        // まずローカルストレージ由来のプリセットをチェック
        if (presetsRef.current) {
          preset = presetsRef.current.find(p => p.id === presetId);
          if (preset) {
            body = preset.routeData ?? loadPresetBody(presetId);
          }
        }

        // ローカルに見つからなければサーバにフォールバック
        if (!preset || !body) {
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}presets.json`);
            if (res.ok) {
              const fromServer = normalizePresets(await res.json());
              // サーバ由来のプリセットでメモリを更新（ローカルにない新規プリセットを補完）
              const merged = presetsRef.current
                ? [...fromServer.filter(s => !presetsRef.current!.find(l => l.id === s.id)), ...presetsRef.current]
                : fromServer;
              setPresetsState(merged);
              presetsRef.current = merged;
              if (!preset) preset = merged.find(p => p.id === presetId);
              if (preset && !body) body = preset.routeData ?? loadPresetBody(presetId);
            }
          } catch { /* ignore */ }
        }

        if (!preset || !body) {
          // 最終手段: サーバのオンデマンドキャッシュを確認
          if (!body) {
            const serverMap = await ensureServerPresetBodies();
            body = serverMap.get(presetId) || null;
          }
        }

        if (!preset || !body) {
          showNotificationRef.current('プリセットの実体が見つかりません (サーバから取得失敗?)');
          return;
        }
        data = {
          ...body,
          id: generateId('route'),
          title: body.title,
          // プリセット由来の BG を IndexedDB から引くためのキー
          presetSourceId: presetId
        };
      } else {
        data = DataManager.loadFromLocalStorage(id);
      }
      if (!data) return;

      // マイグレーションを適用 (座標系 v1 -> v2 や saveDataVersion 0.9.1 -> 0.9.2 など)
      const migration = migrateLoadedRoute(data);
      data = migration.data;

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
      //   3. 復号成功 (= AES-GCM 認証OK) → 平文をメモリに反映 (= 正規の原作者)
      //   4. 復号結果が 'No name' (= AUTHOR_DEFAULT_PLAIN) → 「意図的に No name として保存」
      //      された正常値。 メモリ上は No name (= 空に正規化) として表示
      //   5. 復号失敗 (AUTHOR_TAMPERED) → 改竄の疑い、 Anomaly として保持
      //   6. プレフィックスなしの平文 (旧マイグレート途中) → そのまま (= 旧平文)
      //   7. 空文字 ('') → 異常値 (= フィールド欠損/破壊)。 Anomaly として保持。
      //      (= 「空」は No name ではなく不正な状態。 「No name」は設定値 = AUTHOR_DEFAULT_PLAIN
      //        (= AUTHOR_UNKNOWN_MARKER 暗号文 v2:0: を復号した結果) で表現する)
      //   8. AUTHOR_UNKNOWN_MARKER ('v2:0:') → No name の正常な暗号文。
      //      メモリ上は No name (= 空に正規化) として表示
      //
      // 重要: author (=編集者) からは絶対に補完しない。
      // author は編集で変化する、 renderCache (=原作者) は不変で author と独立。
      //
      // 復号キーは暗号化時と同じ (data.id, data.createdAt) を使う。
      // プリセット由来データでも、 保存 (= saveToLocal) 時に data.id / data.createdAt で
      // 暗号化しているので、 ロード時も data.id / data.createdAt で復号する必要がある。
      // presetSourceId は BG 引き継ぎ等では使うが、 暗号鍵としては data.id (= 新 id) を使う。
      const decryptKeyId = data.id;

      // renderCache ロード時フォールバック (= 1回のみ):
      //   1. 旧 originalAuthor キーが残っていれば migrate 済み
      //   2. 暗号文 (v2: / legacy:) なら await で復号して data.renderCache を平文に置換
      //   3. AUTHOR_UNKNOWN_MARKER ('v2:0:') → AUTHOR_DEFAULT_PLAIN ('No name') に置換
      //   4. 旧平文 (プレフィックスなし) → そのまま
      //   5. 空文字 → そのまま (Anomaly として保持)
      // ※ 復号は同期で await してから setRouteWithGlobalDefaults する。 これにより
      //   メモリに暗号文が一瞬乗る問題 (= UI に暗号文が表示される) を防ぐ。
      const decryptRenderCache = async (): Promise<void> => {
        const stored = data!.renderCache;
        if (typeof stored !== 'string' || !stored) {
          // 空文字 → 異常値 (Anomaly)。 補完せずそのまま保持 (= UI で Anomaly 表示)。
          return;
        }
        // メモリに 'No name' (= AUTHOR_DEFAULT_PLAIN) が入った時点で「正常値」として扱い、
        // 1回だけ author を renderCache にコピー (= 「作者 = 原作者」前提)
        // author が空文字 or 'No name' の場合は補完しない (= 「作者 = 原作者 = No name」)
        const applyAuthorCopy = () => {
          if (data!.author && data!.author !== AUTHOR_DEFAULT_PLAIN) {
            data!.renderCache = data!.author;
          } else {
            data!.renderCache = AUTHOR_DEFAULT_PLAIN;
          }
        };

        if (stored === AUTHOR_UNKNOWN_MARKER) {
          applyAuthorCopy();
          return;
        }
        if (stored.startsWith('v2:') || stored.startsWith('legacy:')) {
          // 暗号文 → 同期で復号して data.renderCache を平文に置換
          let plain: string = '';
          try {
            plain = await aesGcmDecrypt(
              stored,
              getOriginalAuthorKey(decryptKeyId, data.createdAt)
            );
          } catch {
            plain = AUTHOR_TAMPERED;
          }
          if (plain === AUTHOR_TAMPERED) {
            // 改竄の疑い → 空文字 (Anomaly) に置換
            data!.renderCache = '';
          } else {
            data!.renderCache = plain;
            // 復号結果が 'No name' (= AUTHOR_DEFAULT_PLAIN) の場合のみ author から補完
            if (plain === AUTHOR_DEFAULT_PLAIN) {
              applyAuthorCopy();
            }
          }
          return;
        }
        if (stored === AUTHOR_DEFAULT_PLAIN) {
          applyAuthorCopy();
          return;
        }
        // プレフィックスなし: 旧平文 → そのまま
        data!.renderCache = stored;
      };
      await decryptRenderCache();

      if (data.id !== 'default') {
        const gd = globalDefaultsRefRef.current.current;
        data.hiddenMarkers = [...new Set([...data.hiddenMarkers, ...(gd.hiddenMarkers || [])])];
        data.hiddenMarkerTypes = [...new Set([...data.hiddenMarkerTypes, ...(gd.hiddenMarkerTypes || [])])];
      }
      // カスタムBG は IndexedDB から自動復元 (ローカルセーブには保存していないため)
      //   - localStorage 由来 (data.id に紐付く BG) があれば復元
      //   - プリセット由来 (data.id は新規採番) は元の presetId を探して復元
      const bgKeyForLookup = (data as any).presetSourceId || data.id;
      const bgFromDb = await DataManager.loadCustomBg(bgKeyForLookup);
      if (!data.customBg) data.customBg = { main: null };
      if (bgFromDb) {
        data.customBg = { ...data.customBg, main: bgFromDb };
        // 復元した BG は新 ID (= プラン本体) に紐付けて保存しなおす
        if (bgKeyForLookup !== data.id) {
          DataManager.saveCustomBg(data.id, bgFromDb).catch(() => { /* noop */ });
        }
      } else if (data.customBg.main) {
        // プラン本体に BG が埋まっている (= 他経路で持ち込まれたケース) なら
        // IndexedDB にもミラーして、次回ロードに備える
        DataManager.saveCustomBg(data.id, data.customBg.main).catch(() => { /* noop */ });
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
  }, [setRouteWithGlobalDefaults, onMarkerScaleChange, ensureServerPresetBodies]);

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
    // プリセット保存: routeData を含めてそのまま保存 (= プリセット本体を完全に保持)
    // 注: 旧コードは metaOnly (= routeData 抜き) で保存していたため、プリセット本体の
    //     ルートデータが消えるバグがあった。 ここでは routeData 込みで保存する。
    // メモリに展開されていれば (モーダル開時) state にも反映
    if (presetsRef.current !== null) {
      setPresetsState(normalized);
      presetsRef.current = normalized;
    }
    // 別キーに routeData を切り出す (旧形式との互換性のため)
    for (const p of normalized) {
      if (p.routeData) {
        try { savePresetBody(p.id, p.routeData); } catch { /* quota 等: 無視 */ }
      }
    }
    // localStorage と サーバには routeData 込みで保存
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
      // 容量問題解決済みのため routeData を直接埋め込む (確実に読み込めるように)
      routeData: toSave
    };
    // 実体を別キーに保存 (容量削減のため配列には入れない)
    try { savePresetBody(newPreset.id, toSave); } catch (e) {
      console.error('savePresetBody failed', e);
      showNotificationRef.current('プリセット本体の保存に失敗しました');
      return;
    }
    const current = presetsRef.current ?? normalizePresets(DataManager.loadPresetsFromLocalStorage());
    savePresetsToServer([...current, newPreset]);
    showNotificationRef.current(`プリセット追加: ${newPreset.name}`);
  }, [route, initialMarkerScale, savePresetsToServer]);

  const deletePreset = useCallback((presetId: string) => {
    const current = presetsRef.current ?? normalizePresets(DataManager.loadPresetsFromLocalStorage());
    // 実体キーも削除 (旧形式 (routeData 内蔵) の場合も含めて確実に消す)
    removePresetBody(presetId);
    savePresetsToServer(current.filter(p => p.id !== presetId));
    showNotificationRef.current('プリセットを削除しました');
  }, [savePresetsToServer]);

  /**
   * プリセットの内容 (ルートデータ + メタ情報) を現在の編集データで上書きする。
   * 注意: 公開レベル (visibility) は絶対に変更しない。
   *   既存の { ...presets[idx] } スプレッドに visibility フィールドが含まれ、
   *   その後に visibility 関連の代入は一切行わないため、元の値がそのまま保持される。
   *   公開レベルを変えたい場合は setPresetVisibility を明示的に呼ぶこと。
   */
  const overwritePreset = useCallback((presetId: string) => {
    const current = presetsRef.current ?? normalizePresets(DataManager.loadPresetsFromLocalStorage());
    const idx = current.findIndex(p => p.id === presetId);
    if (idx === -1) return;
    const toSave: RouteData = { ...route, mapVersion: 2, markerScale: initialMarkerScale };
    // 実体を別キーに保存 (旧実体キーは上書き)
    try { savePresetBody(presetId, toSave); } catch (e) {
      console.error('savePresetBody (overwrite) failed', e);
      showNotificationRef.current('プリセット本体の保存に失敗しました');
      return;
    }
    const updatedPreset: PresetData = {
      ...current[idx],
      name: route.title,
      description: route.description || '',
      targetCash: route.targetCash,
      targetCoins: route.targetCoins,
      author: route.author || '',
      renderCache: route.renderCache || '',
      updatedAt: Date.now(),
      // 容量問題解決済みのため routeData を直接埋め込む
      routeData: toSave
    };
    const nextPresets = [...current];
    nextPresets[idx] = updatedPreset;
    savePresetsToServer(nextPresets);
    showNotificationRef.current(`プリセットを上書きしました: ${updatedPreset.name}`);
  }, [route, initialMarkerScale, savePresetsToServer]);

  /**
   * 指定プリセットの公開レベルを変更する。サーバ + localStorage 両方を更新する。
   */
  const setPresetVisibility = useCallback((presetId: string, visibility: PresetVisibility) => {
    const current = presetsRef.current ?? normalizePresets(DataManager.loadPresetsFromLocalStorage());
    const idx = current.findIndex(p => p.id === presetId);
    if (idx === -1) return;
    const next = [...current];
    next[idx] = { ...next[idx], visibility: normalizePresetVisibility(visibility) };
    savePresetsToServer(next);
  }, [savePresetsToServer]);

  /**
   * 現在のモード (isLocal) と表示フィルタに応じて、表示してよいプリセットを返す。
   *  - public:   常に表示
   *  - unlisted: 本番モードでは一覧に出さない (URL (?preset=ID) 経由で開く前提)。
   *              showUnlisted=true を渡すとローカルモード以外でも出す (デバッグ用)。
   *  - private:  ローカルモードでのみ表示。showPrivate は基本 true 固定 (private の存在を
   *              知らせないとアップロード済みの private を見つけられないため)。本番モードでは
   *              一切出さない。
   */
  const filterVisiblePresets = useCallback((opts: {
    showUnlisted: boolean;
    showPrivate: boolean;
  }): PresetData[] => {
    const current = presetsRef.current ?? [];
    return current.filter(p => {
      const v = normalizePresetVisibility(p.visibility);
      if (v === 'public') return true;
      if (v === 'unlisted') return !!opts.showUnlisted;
      if (v === 'private')  return isLocalRef.current && !!opts.showPrivate;
      return true;
    });
  }, []);

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
    const current = presetsRef.current;
    // 未ロード時はプリセットアクセスを許可 (URL 経由で開こうとした瞬間に
    // loadFromLocal がプリセットをロードして進める)
    if (current === null) return { allowed: true };
    const preset = current.find(p => p.id === presetId);
    if (!preset) return { allowed: false, reason: 'not_found' };
    const v = normalizePresetVisibility(preset.visibility);
    if (v === 'private' && !isLocalRef.current) {
      return { allowed: false, reason: 'private_prod' };
    }
    return { allowed: true };
  }, []);

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
  //
  // 重要: プリセット保存時に routeData (= ルート本体データ) を切り捨てない。
  // 旧コードは metaOnly (= routeData 抜き) で保存していたが、 それでは
  // プリセット本体のルートデータが消えるバグがあった (= プリセットを
  // 1つ保存するたびに routeData が消える)。 ここでは normalized (= routeData 込み) を
  // そのまま保存する。
  const setPresets = useCallback((next: PresetData[], _opts?: { fromServer?: boolean }) => {
    const normalized = normalizePresets(next);
    // routeData を含めた完全な配列を保存 (= プリセット本体が消えない)
    if (presetsRef.current !== null) {
      setPresetsState(normalized);
      presetsRef.current = normalized;
    }
    DataManager.savePresetsToLocalStorage(normalized);
  }, []);

  /**
   * プリセット一覧をメモリにロードする (ロードモーダルを開く時に呼ぶ)。
   * 既にロード済み (=null でない) なら何もしない。
   */
  const ensurePresetsLoaded = useCallback(() => {
    if (presetsRef.current !== null) return presetsRef.current;
    const loaded = normalizePresets(DataManager.loadPresetsFromLocalStorage());
    setPresetsState(loaded);
    presetsRef.current = loaded;
    return loaded;
  }, []);

  /**
   * プリセット一覧をメモリから破棄する (ロードモーダルを閉じた時に呼ぶ)。
   * ローカルストレージ側のデータはそのまま残る (= 次回ロード時に復元できる)。
   */
  const releasePresets = useCallback(() => {
    setPresetsState(null);
    presetsRef.current = null;
  }, []);

  return {
    route, setRoute, setRouteWithGlobalDefaults,
    saves,
    // プリセットは遅延ロード。null = 未ロード (= モーダル閉じている)。
    // ホスト (App.tsx) はモーダルを開く直前に ensurePresetsLoaded() を呼ぶこと。
    presets: presets ?? [],
    presetsLoaded: presets !== null,
    setPresets, refreshSavesList,
    ensurePresetsLoaded, releasePresets,
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
