import { useRef, useCallback } from 'react';
import {
  type FloorType,
  type RouteData,
  DataManager,
} from '../utils/DataManager';
import {
  encryptRenderCache,
  importJSON as unifiedImportJSON,
  importPNG as unifiedImportPNG,
} from '../utils/SaveLoadService';
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
    lineThickness?: number;
    showTimestamp?: boolean;
  }) => void;
  onJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBgFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importPngFile: (file: File) => Promise<void>;
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

  const exportJSON = useCallback(async () => {
    const encoded = await encryptRenderCache(routeApi.route);
    const toExport: RouteData = {
      ...routeApi.route, mapVersion: 2, markerScale,
      renderCache: encoded
    };
    DataManager.exportToJSON(toExport);
  }, [routeApi.route, markerScale]);

  const exportPNG = useCallback((params: {
    floor: FloorType; canvas: HTMLCanvasElement | null; svgString: string; skipDataBar?: boolean; lineThickness?: number; showTimestamp?: boolean;
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
      params.skipDataBar,
      params.lineThickness,
      params.showTimestamp
    );
  }, [routeApi.route, globalMarkersStore.globalMarkers, markerScale]);

  const importFromJsonText = useCallback(async (text: string) => {
    try {
      onBeforeLoad?.();
      const result = await unifiedImportJSON(text);
      if (!result) {
        showNotification('JSONファイルの形式が無効です', 2000);
        return;
      }
      const { data, globalMarkers, anomaly } = result;

      if (globalMarkers.length > 0) {
        globalMarkersStore.mergeFromImport(globalMarkers);
      }

      if (data.customBg.main) {
        DataManager.saveCustomBg(data.id, data.customBg.main).catch(() => {});
      }

      if (anomaly) {
        showNotification('⚠️ renderCache の復号に失敗しました（Anomaly）', 4000);
      }

      routeApi.setRouteWithGlobalDefaults(data);
      localStorage.setItem('heist_last_used_route_id', data.id);
      if (data.markerScale !== undefined) {
        localStorage.setItem('heist_marker_scale', String(data.markerScale));
      }
      showNotification(`インポート完了: ${data.title}`, 2000);
    } catch (err) {
      showNotification('JSONファイルの読み込みに失敗しました', 2000);
    }
  }, [globalMarkersStore, routeApi, showNotification, onBeforeLoad]);

  const importPngFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png')) return;
    try {
      onBeforeLoad?.();
      const result = await unifiedImportPNG(file);
      if (!result) {
        showNotification('PNGからデータを読み取れませんでした', 3000);
        return;
      }
      const { data: importedRoute, globalMarkers: importedGlobals, anomaly } = result;

      if (anomaly) {
        showNotification('⚠️ renderCache の復号に失敗しました（Anomaly）', 4000);
      }

      const toSaveToStorage: RouteData = {
        ...importedRoute,
        customBg: { main: null }
      };
      const saved = DataManager.saveToLocalStorage(toSaveToStorage);
      if (!saved) {
        showNotification('⚠️ PNG は読み込まれましたが、 localStorage の容量上限を超えたためセーブリストには反映されません', 5000);
      }
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
      const id = routeApi.route.id;
      // メモリに反映
      routeApi.setRoute(prev => ({ ...prev, customBg: { main: dataUrl } }));
      // IndexedDB にも保存 (プランロード時に自動復元するため)
      DataManager.saveCustomBg(id, dataUrl).then((ok) => {
        if (!ok) {
          showNotification('⚠️ カスタムBGの保存に失敗しました (次回ロード時に復元できません)', 3000);
        }
      });
      // ロードモーダル用のメタ (= heist_routes_list) にもフラグを立てる
      DataManager.setSaveMetaBg(id, true);
      routeApi.refreshSavesList();
    };
    reader.readAsDataURL(f);
  }, [routeApi, routeApi.route.id, showNotification]);

  return {
    jsonFileInputRef, bgFileInputRef,
    exportJSON, exportPNG,
    onJsonFileChange, onBgFileChange, importPngFile
  };
}
