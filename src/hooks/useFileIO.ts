import { useRef, useCallback } from 'react';
import {
  type FloorType,
  type RouteData,
  type HeistMarker,
  DataManager,
  xorEncrypt,
  xorDecrypt,
  getAuthorKey,
  getOriginalAuthorKey
} from '../utils/DataManager';
import type { UseRouteApi } from './useRoute';
import type { UseGlobalMarkersApi } from './useGlobalMarkers';

export interface UseFileIOOptions {
  routeApi: UseRouteApi;
  globalMarkersStore: UseGlobalMarkersApi;
  markerScale: number;
  showNotification: (msg: string, ms?: number) => void;
}

export interface UseFileIOApi {
  jsonFileInputRef: React.RefObject<HTMLInputElement | null>;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  exportJSON: () => void;
  exportPNG: (params: {
    floor: FloorType;
    canvas: HTMLCanvasElement | null;
    svgString: string;
  }) => void;
  onJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBgFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importPngFile: (file: File) => Promise<void>;
}

const GLOBAL_TYPES = new Set([
  'start', 'eh', 'rare', 'cardkey', 'vault', 'boss', 'phone',
  'warp', 'stairs', 'info', 'note', 'text', 'room',
  'gbattle', 'gpicking', 'glong_picking'
]);
const INDIV_TYPES = new Set([
  'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking',
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
    if (m.pickingPicky === undefined) m.pickingPicky = false;
  } else if (m.type === 'long_picking' || m.type === 'glong_picking') {
    if (m.longPickingDurationSeconds === undefined) m.longPickingDurationSeconds = 7;
    if (m.pickingPicky === undefined) m.pickingPicky = false;
  }
  return m;
}

/**
 * JSON / PNG import/export. The file input ref is owned by the hook and
 * exposed to the component so a single <input> element can dispatch both
 * `.json` and `.png` files to the appropriate code path.
 */
export function useFileIO(options: UseFileIOOptions): UseFileIOApi {
  const { routeApi, globalMarkersStore, markerScale, showNotification } = options;

  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const exportJSON = useCallback(() => {
    const toExport: RouteData = {
      ...routeApi.route, mapVersion: 2, markerScale
    };
    DataManager.exportToJSON(toExport);
  }, [routeApi.route, markerScale]);

  const exportPNG = useCallback((params: {
    floor: FloorType; canvas: HTMLCanvasElement | null; svgString: string;
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
      }
    );
  }, [routeApi.route, globalMarkersStore.globalMarkers, markerScale]);

  const importFromJsonText = useCallback((text: string) => {
    try {
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
        m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any)
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
      data.hiddenMarkers = data.hiddenMarkers || [];
      data.hiddenMarkerTypes = data.hiddenMarkerTypes || [];
      if (data.author === undefined) data.author = '';
      if (data.originalAuthor === undefined) data.originalAuthor = '';

      routeApi.setRouteWithGlobalDefaults(data);
      localStorage.setItem('heist_last_used_route_id', data.id);
      if (data.markerScale !== undefined) {
        localStorage.setItem('heist_marker_scale', String(data.markerScale));
      }
      showNotification(`インポート完了: ${data.title}`, 2000);
    } catch (err) {
      showNotification('JSONファイルの読み込みに失敗しました', 2000);
    }
  }, [globalMarkersStore, routeApi, showNotification]);

  const importPngFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png')) return;
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('load failed'));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const data = await DataManager.decodePngData(img);
      if (!data) {
        showNotification('PNGからデータを読み取れませんでした（データバー未検出）', 3000);
        return;
      }
      const clean = DataManager.sanitizeRouteForExport(data);
      const newId = `route_${Date.now()}`;
      const newCreatedAt = Date.now();
      const plainAuthor = xorDecrypt(clean.author || '', getAuthorKey(clean.id, clean.createdAt));
      const plainOriginal = xorDecrypt(clean.originalAuthor || '', getOriginalAuthorKey(clean.id, clean.createdAt));
      const allMarkers = clean.markers || [];
      const individualMarkers = allMarkers.filter(m => !isGlobalType(m.type));
      const importedGlobals = allMarkers.filter(m => isGlobalType(m.type));
      const importedRoute: RouteData = {
        ...clean,
        id: newId,
        createdAt: newCreatedAt,
        markers: individualMarkers,
        author: xorEncrypt(plainAuthor, getAuthorKey(newId, newCreatedAt)),
        originalAuthor: xorEncrypt(plainOriginal, getOriginalAuthorKey(newId, newCreatedAt))
      };
      DataManager.saveToLocalStorage(importedRoute);
      routeApi.setRouteWithGlobalDefaults(importedRoute);
      localStorage.setItem('heist_last_used_route_id', importedRoute.id);
      routeApi.refreshSavesList();
      if (importedGlobals.length > 0) {
        globalMarkersStore.mergeFromImport(importedGlobals);
      }
      showNotification(`PNGインポート完了: ${importedRoute.title}`, 2000);
    } catch (err) {
      showNotification('PNG読み込みに失敗しました', 3000);
    }
  }, [globalMarkersStore, routeApi, showNotification]);

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
