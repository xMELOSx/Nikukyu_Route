import {
  type FloorType,
  type RouteData,
  type HeistMarker,
  DataManager,
  aesGcmEncrypt,
  aesGcmDecrypt,
  getOriginalAuthorKey,
  AUTHOR_TAMPERED,
  AUTHOR_DEFAULT_PLAIN,
  AUTHOR_UNKNOWN_MARKER,
  APP_VERSION,
  migrateOriginalAuthorToRenderCache,
  runSaveDataMigrations,
  migrateLoadedRoute,
  loadPresetBody,
} from './DataManager';

const GLOBAL_TYPES = new Set([
  'eh', 'rare', 'cardkey', 'vault', 'boss', 'phone',
  'warp', 'stairs', 'info', 'note', 'text', 'room',
  'gbattle', 'gpicking', 'glong_picking'
]);

function isGlobalType(t: string): boolean {
  return GLOBAL_TYPES.has(t);
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

// ---------------------------------------------------------------------------
// 暗号化 / 復号化（統一）
// ---------------------------------------------------------------------------

export async function encryptRenderCache(route: RouteData): Promise<string> {
  const key = getOriginalAuthorKey(route.id, route.createdAt);
  const plain = route.renderCache;
  if (typeof plain === 'string' && plain.length > 0) {
    try {
      return await aesGcmEncrypt(plain, key);
    } catch {
      return plain;
    }
  }
  return AUTHOR_UNKNOWN_MARKER;
}

export type DecryptResult =
  | { kind: 'ok'; plain: string }
  | { kind: 'anomaly' }
  | { kind: 'noname' };

export async function decryptRenderCache(
  encoded: string,
  routeId: string,
  createdAt: number,
): Promise<DecryptResult> {
  if (typeof encoded !== 'string' || !encoded) {
    return { kind: 'anomaly' };
  }
  if (encoded === AUTHOR_UNKNOWN_MARKER) {
    return { kind: 'noname' };
  }
  if (encoded.startsWith('v2:') || encoded.startsWith('legacy:')) {
    try {
      const plain = await aesGcmDecrypt(encoded, getOriginalAuthorKey(routeId, createdAt));
      if (plain === AUTHOR_TAMPERED) {
        return { kind: 'anomaly' };
      }
      if (plain === AUTHOR_DEFAULT_PLAIN) {
        return { kind: 'noname' };
      }
      return { kind: 'ok', plain };
    } catch {
      return { kind: 'anomaly' };
    }
  }
  if (encoded === AUTHOR_DEFAULT_PLAIN) {
    return { kind: 'noname' };
  }
  return { kind: 'ok', plain: encoded };
}

// ---------------------------------------------------------------------------
// 保存（localStorage）
// ---------------------------------------------------------------------------

export async function saveRoute(route: RouteData): Promise<boolean> {
  const encoded = await encryptRenderCache(route);
  const toSave: RouteData = {
    ...route,
    renderCache: encoded,
    customBg: { main: null },
    bgOffset: route.bgOffset,
    bgScale: route.bgScale,
    markerScale: route.markerScale,
    saveDataVersion: APP_VERSION,
  };
  const saved = DataManager.saveToLocalStorage(toSave);
  return saved;
}

// ---------------------------------------------------------------------------
// 読込（localStorage / プリセット）
// ---------------------------------------------------------------------------

export interface LoadedRoute {
  data: RouteData;
  anomaly: boolean;
  noname: boolean;
}

export async function loadRoute(id: string): Promise<LoadedRoute | null> {
  let data: RouteData | null = null;
  if (id.startsWith('__preset__')) {
    data = await loadPresetRoute(id.replace('__preset__', ''));
  } else {
    data = DataManager.loadFromLocalStorage(id);
  }
  if (!data) return null;
  return resolveRoute(data);
}

async function loadPresetRoute(presetId: string): Promise<RouteData | null> {
  const presets = DataManager.loadPresetsFromLocalStorage();
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return null;
  const body = preset.routeData ?? loadPresetBody(presetId);
  if (!body) return null;
  return { ...body, id: presetId };
}

export async function resolveRoute(data: RouteData): Promise<LoadedRoute> {
  const migration = migrateLoadedRoute(data);
  data = migration.data;

  data = migrateOriginalAuthorToRenderCache(data as any) as RouteData;

  const decryptResult = await decryptRenderCache(
    data.renderCache || '',
    data.id,
    data.createdAt,
  );

  if (decryptResult.kind === 'anomaly') {
    data.renderCache = '';
  } else if (decryptResult.kind === 'noname') {
    data.renderCache = AUTHOR_DEFAULT_PLAIN;
  } else {
    data.renderCache = decryptResult.plain;
  }

  return {
    data,
    anomaly: decryptResult.kind === 'anomaly',
    noname: decryptResult.kind === 'noname',
  };
}

// ---------------------------------------------------------------------------
// JSON エクスポート / インポート
// ---------------------------------------------------------------------------

export async function exportJSON(route: RouteData, markerScale: number): Promise<void> {
  const encoded = await encryptRenderCache(route);
  const toExport: RouteData = {
    ...DataManager.sanitizeRouteForExport(route),
    renderCache: encoded,
    mapVersion: 2,
    markerScale,
  };
  DataManager.exportToJSON(toExport);
}

export interface ImportResult {
  data: RouteData;
  globalMarkers: HeistMarker[];
  anomaly: boolean;
  noname: boolean;
}

export async function importJSON(text: string): Promise<ImportResult | null> {
  try {
    const raw = JSON.parse(text) as RouteData;
    if (!raw.strokes || !raw.markers) return null;

    let data: RouteData = { ...raw };
    if (data.strokes && !data.strokes.main) {
      const merged = ([] as any[]).concat(...Object.values(data.strokes));
      data.strokes = { main: merged as any };
    }
    data.markers = (data.markers || []).filter(
      m => m.type !== ('camera' as any) && m.type !== ('guard' as any)
    );

    const allMarkers = data.markers.map(m => backfillMarker({ ...m, floor: 'main' as FloorType }));
    const globalMarkers = allMarkers.filter(m => isGlobalType(m.type));
    const indivMarkers = allMarkers.filter(m => !isGlobalType(m.type));

    data.markers = indivMarkers;
    if (!data.customBg || !data.customBg.main) data.customBg = { main: null };
    if (!data.bgOffset) data.bgOffset = { x: 0, y: 0 };
    if (!data.bgScale) data.bgScale = { x: 1, y: 1 };
    data.bossCustomDurations = data.bossCustomDurations || {};
    data.battleCustomDurations = data.battleCustomDurations || {};
    data.pickingCustomDurations = data.pickingCustomDurations || {};
    data.longPickingCustomDurations = data.longPickingCustomDurations || {};
    data.pickyMarkerIds = data.pickyMarkerIds || {};

    for (const m of allMarkers) {
      if (m && m.pickingPicky) {
        data.pickyMarkerIds[m.id] = true;
      }
    }

    data.hiddenMarkers = data.hiddenMarkers || [];
    data.hiddenMarkerTypes = data.hiddenMarkerTypes || [];
    if (data.author === undefined) data.author = '';

    const migratedAny: any = migrateOriginalAuthorToRenderCache(data as any);
    data.renderCache = typeof migratedAny.renderCache === 'string' ? migratedAny.renderCache : '';

    const mig = runSaveDataMigrations(data);
    data = mig.data;

    const decryptResult = await decryptRenderCache(
      data.renderCache || '',
      data.id,
      data.createdAt,
    );

    if (decryptResult.kind === 'anomaly') {
      data.renderCache = '';
    } else if (decryptResult.kind === 'noname') {
      data.renderCache = AUTHOR_DEFAULT_PLAIN;
    } else {
      data.renderCache = decryptResult.plain;
    }

    return {
      data,
      globalMarkers,
      anomaly: decryptResult.kind === 'anomaly',
      noname: decryptResult.kind === 'noname',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PNG エクスポート / インポート
// ---------------------------------------------------------------------------

export async function exportPNG(
  floor: FloorType,
  route: RouteData,
  svgString: string,
  canvas: HTMLCanvasElement | null,
  onComplete: (dataUrl: string) => void,
  globalMarkers: HeistMarker[],
  markerScale: number,
  skipDataBar?: boolean,
  lineThickness?: number,
  showTimestamp?: boolean,
): Promise<void> {
  const merged: RouteData = {
    ...route,
    markers: [...globalMarkers, ...route.markers],
    markerScale,
  };
  return DataManager.exportToPNG(
    floor, merged, svgString, canvas, onComplete,
    skipDataBar, lineThickness, showTimestamp,
  );
}

export async function importPNG(
  file: File,
): Promise<ImportResult | null> {
  if (!file.name.toLowerCase().endsWith('.png')) return null;

  try {
    const rawBuffer = await file.arrayBuffer();
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('load failed'));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const result = await DataManager.decodePngData(img, rawBuffer);
    if (!result) return null;

    const { data } = result;
    const clean = DataManager.sanitizeRouteForExport(data);
    const cleanMigrated = migrateOriginalAuthorToRenderCache(clean as any) as RouteData;
    const mig = runSaveDataMigrations(cleanMigrated);
    const migrated = mig.data;

    const newId = `route_${Date.now()}`;
    const newCreatedAt = Date.now();

    const plainAuthor = (migrated.author && !migrated.author.startsWith('v2:') && !migrated.author.startsWith('legacy:'))
      ? migrated.author : '';

    const decryptResult = await decryptRenderCache(
      migrated.renderCache || '',
      migrated.id,
      migrated.createdAt,
    );

    let safeOriginal: string;
    if (decryptResult.kind === 'anomaly') {
      safeOriginal = '';
    } else if (decryptResult.kind === 'noname') {
      safeOriginal = AUTHOR_DEFAULT_PLAIN;
    } else {
      safeOriginal = decryptResult.plain;
    }

    const encoded = await encryptRenderCache({
      ...migrated,
      id: newId,
      createdAt: newCreatedAt,
      renderCache: safeOriginal,
    });

    const allMarkers = migrated.markers || [];
    const individualMarkers = allMarkers.filter(m => !isGlobalType(m.type));
    const importedGlobals = allMarkers.filter(m => isGlobalType(m.type));

    const importedPickyMarkerIds: { [markerId: string]: boolean } = {};
    for (const m of allMarkers) {
      if (m && m.pickingPicky) importedPickyMarkerIds[m.id] = true;
    }

    const importedRoute: RouteData = {
      ...migrated,
      id: newId,
      createdAt: newCreatedAt,
      markers: individualMarkers,
      pickyMarkerIds: { ...(migrated.pickyMarkerIds || {}), ...importedPickyMarkerIds },
      author: plainAuthor,
      renderCache: encoded,
    };

    return {
      data: importedRoute,
      globalMarkers: importedGlobals,
      anomaly: decryptResult.kind === 'anomaly',
      noname: decryptResult.kind === 'noname',
    };
  } catch {
    return null;
  }
}
