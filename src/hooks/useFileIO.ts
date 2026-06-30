import { useRef, useCallback } from 'react';
import {
  type FloorType,
  type RouteData,
  type HeistMarker,
  DataManager,
  aesGcmEncrypt,
  aesGcmDecrypt,
  AUTHOR_TAMPERED,
  AUTHOR_UNKNOWN_MARKER,
  getOriginalAuthorKey,
  runSaveDataMigrations
} from '../utils/DataManager';
import type { UseRouteApi } from './useRoute';
import type { UseGlobalMarkersApi } from './useGlobalMarkers';

export interface UseFileIOOptions {
  routeApi: UseRouteApi;
  globalMarkersStore: UseGlobalMarkersApi;
  markerScale: number;
  showNotification: (msg: string, ms?: number) => void;
  /** Called at the start of any import (JSON / PNG) that overwrites the
   *  current route. Use this to stop long-running features (e.g. the
   *  auto-route guide) before the route is replaced. */
  onBeforeLoad?: () => void;
}

export interface UseFileIOApi {
  jsonFileInputRef: React.RefObject<HTMLInputElement | null>;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  exportJSON: () => void;
  exportPNG: (params: {
    floor: FloorType;
    canvas: HTMLCanvasElement | null;
    svgString: string;
    skipDataBar?: boolean;
  }) => void;
  onJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBgFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importPngFile: (file: File) => Promise<void>;
}

const GLOBAL_TYPES = new Set([
  'eh', 'rare', 'cardkey', 'vault', 'boss', 'phone',
  'warp', 'stairs', 'info', 'note', 'text', 'room',
  'gbattle', 'gpicking', 'glong_picking'
]);
const INDIV_TYPES = new Set([
  'start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking',
  'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint'
]);
const isGlobalType = (t: string) => GLOBAL_TYPES.has(t);

function splitMarkers(markers: HeistMarker[]): { indiv: HeistMarker[]; global: HeistMarker[] } {
  const indiv: HeistMarker[] = [];
  const global: HeistMarker[] = [];
  for (const m of markers) {
    if (INDIV_TYPES.has(m.type)) indiv.push(m);
    else global.push(m);
  }
  return { indiv, global };
}

function backfillMarker(m: HeistMarker): HeistMarker {
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

/**
 * JSON / PNG import/export. The file input ref is owned by the hook and
 * exposed to the component so a single <input> element can dispatch both
 * `.json` and `.png` files to the appropriate code path.
 */
export function useFileIO(options: UseFileIOOptions): UseFileIOApi {
  const { routeApi, globalMarkersStore, markerScale, showNotification, onBeforeLoad } = options;

  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const exportJSON = useCallback(() => {
    const toExport: RouteData = {
      ...routeApi.route, mapVersion: 2, markerScale
    };
    DataManager.exportToJSON(toExport);
  }, [routeApi.route, markerScale]);

  const exportPNG = useCallback((params: {
    floor: FloorType; canvas: HTMLCanvasElement | null; svgString: string; skipDataBar?: boolean;
  }) => {
    const routeForExport: RouteData = {
      ...routeApi.route,
      markers: [...globalMarkersStore.globalMarkers, ...routeApi.route.markers],
      markerScale
    };
    DataManager.exportToPNG(
      params.floor,
      routeForExport,
      params.svgString,
      params.canvas,
      (dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${routeApi.route.title.replace(/\s+/g, '_')}_full_map.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      params.skipDataBar
    );
  }, [routeApi.route, globalMarkersStore.globalMarkers, markerScale]);

  const importFromJsonText = useCallback((text: string) => {
    try {
      onBeforeLoad?.();
      const raw = JSON.parse(text) as RouteData;
      if (!raw.strokes || !raw.markers) {
        showNotification('JSONファイルの形式が無効です', 2000);
        return;
      }
      // Coordinate scale + structure migration
      const data: RouteData = { ...raw };
      if (data.strokes && !data.strokes.main) {
        const merged = ([] as any[]).concat(...Object.values(data.strokes));
        data.strokes = { main: merged as any };
      }
      data.markers = (data.markers || []).filter(
        m => m.type !== ('camera' as any) && m.type !== ('guard' as any)
      );
      const { indiv, global } = splitMarkers(data.markers.map(m => backfillMarker({ ...m, floor: 'main' as FloorType })));
      if (global.length > 0) {
        globalMarkersStore.mergeFromImport(global);
      }
      data.markers = indiv;
      if (!data.customBg || !data.customBg.main) data.customBg = { main: null };
      data.bossCustomDurations = data.bossCustomDurations || {};
      data.battleCustomDurations = data.battleCustomDurations || {};
      data.pickingCustomDurations = data.pickingCustomDurations || {};
      data.longPickingCustomDurations = data.longPickingCustomDurations || {};
      data.pickyMarkerIds = data.pickyMarkerIds || {};
      // Migrate legacy marker-level `pickingPicky` into the route-level
      // `pickyMarkerIds`. The picky state belongs to the plan, not the
      // (possibly global) marker. Cover BOTH the individual markers and
      // the global ones, so gpicking/glong_picking pickies are preserved.
      const legacyPickySources: HeistMarker[] = [
        ...(Array.isArray(indiv) ? indiv : []),
        ...(Array.isArray(global) ? global : [])
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
      //   author: 平文フィールド。 空文字 = 「No name」 (デフォルト値) として扱う。
      //   originalAuthor: AES-GCM 暗号化。 空 / AUTHOR_UNKNOWN_MARKER は改ざんの疑い
      //                  として Anomaly 表示 (= v2:0: のまま残す)。
      if (!data.author) {
        data.author = '';
      }
      if (!data.originalAuthor) {
        data.originalAuthor = AUTHOR_UNKNOWN_MARKER;
      }

      // バージョンアップ済みならマイグレーションを適用
      const mig = runSaveDataMigrations(data);
      if (mig.unknown) {
        showNotification(
          `⚠️ 未登録バージョンのJSONです (v${mig.unknownVersion})。そのまま読み込みます。`,
          5000
        );
      } else if (mig.applied.length > 0) {
        showNotification(
          `JSONを ${mig.applied.length} 件マイグレーションしました (→ v${mig.finalVersion})`,
          3000
        );
      }
      const finalData: RouteData = mig.data;

      routeApi.setRouteWithGlobalDefaults(finalData);
      localStorage.setItem('heist_last_used_route_id', finalData.id);
      if (finalData.markerScale !== undefined) {
        localStorage.setItem('heist_marker_scale', String(finalData.markerScale));
      }
      showNotification(`インポート完了: ${finalData.title}`, 2000);
    } catch (err) {
      showNotification('JSONファイルの読み込みに失敗しました', 2000);
    }
  }, [globalMarkersStore, routeApi, showNotification, onBeforeLoad]);

  const importPngFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png')) return;
    try {
      onBeforeLoad?.();
      // Read raw bytes first (for metadata fallback) and create blob URL for image display
      const rawBuffer = await file.arrayBuffer();
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('load failed'));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const data = await DataManager.decodePngData(img, rawBuffer);
      if (!data) {
        showNotification('PNGからデータを読み取れませんでした（データバー未検出）', 3000);
        return;
      }
      const clean = DataManager.sanitizeRouteForExport(data);
      // バージョンアップ済みならマイグレーションを適用
      const mig = runSaveDataMigrations(clean);
      const migrated = mig.data;
      const newId = `route_${Date.now()}`;
      const newCreatedAt = Date.now();
      // author は平文フィールド (旧 v2: 暗号文でもロード後に平文化されている前提)。
      // originalAuthor は AES-GCM 暗号化なので新鍵で再暗号化する。
      const plainAuthor = (migrated.author && !migrated.author.startsWith('v2:') && !migrated.author.startsWith('legacy:'))
        ? migrated.author : '';
      const plainOriginal = await aesGcmDecrypt(migrated.originalAuthor || '', getOriginalAuthorKey(migrated.id, migrated.createdAt));
      const allMarkers = migrated.markers || [];
      const individualMarkers = allMarkers.filter(m => !isGlobalType(m.type));
      const importedGlobals = allMarkers.filter(m => isGlobalType(m.type));
      // Migrate legacy marker-level `pickingPicky` for BOTH individual
      // and global markers into the route-level `pickyMarkerIds`.
      const importedPickyMarkerIds: { [markerId: string]: boolean } = {};
      for (const m of allMarkers) {
        if (m && m.pickingPicky) importedPickyMarkerIds[m.id] = true;
      }
      const safeOriginal = plainOriginal === AUTHOR_TAMPERED ? '' : (plainOriginal || '');
      const importedRoute: RouteData = {
        ...migrated,
        id: newId,
        createdAt: newCreatedAt,
        markers: individualMarkers,
        pickyMarkerIds: { ...(migrated.pickyMarkerIds || {}), ...importedPickyMarkerIds },
        author: plainAuthor,
        originalAuthor: safeOriginal
          ? await aesGcmEncrypt(safeOriginal, getOriginalAuthorKey(newId, newCreatedAt))
          : AUTHOR_UNKNOWN_MARKER
      };
      DataManager.saveToLocalStorage(importedRoute);
      routeApi.setRouteWithGlobalDefaults(importedRoute);
      localStorage.setItem('heist_last_used_route_id', importedRoute.id);
      routeApi.refreshSavesList();
      if (importedGlobals.length > 0) {
        globalMarkersStore.mergeFromImport(importedGlobals);
      }
      if (mig.unknown) {
        showNotification(
          `⚠️ 未登録バージョンのPNGです (v${mig.unknownVersion})。そのまま読み込みます。`,
          5000
        );
      } else if (mig.applied.length > 0) {
        showNotification(
          `PNGを ${mig.applied.length} 件マイグレーションしました (→ v${mig.finalVersion})`,
          3000
        );
      }
      showNotification(`PNGインポート完了: ${importedRoute.title}`, 2000);
    } catch (err) {
      showNotification('PNG読み込みに失敗しました', 3000);
    }
  }, [globalMarkersStore, routeApi, showNotification, onBeforeLoad]);

  const onJsonFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.name.toLowerCase().endsWith('.png')) {
      importPngFile(f);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => importFromJsonText(ev.target?.result as string);
      reader.readAsText(f);
    }
  }, [importFromJsonText, importPngFile]);

  const onBgFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      routeApi.setRoute(prev => ({ ...prev, customBg: { main: dataUrl } }));
    };
    reader.readAsDataURL(f);
  }, [routeApi]);

  return {
    jsonFileInputRef, bgFileInputRef,
    exportJSON, exportPNG,
    onJsonFileChange, onBgFileChange, importPngFile
  };
}
