import type { RouteData, MigrationResult, SaveDataMigration, FloorType, DrawingStroke } from './types'
import { SAVE_DATA_VERSION_HISTORY, SAVE_DATA_MIGRATIONS } from './constants'

export function migrateOriginalAuthorToRenderCache<T extends { originalAuthor?: unknown; renderCache?: unknown }>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  if (data.renderCache !== undefined) return data;
  const prev = data.originalAuthor;
  const next: any = { ...data };
  if (typeof prev === 'string') {
    next.renderCache = prev;
  } else {
    next.renderCache = '';
  }
  delete next.originalAuthor;
  return next as T;
}

function getKnownVersionIndex(v: string): number {
  return SAVE_DATA_VERSION_HISTORY.findIndex(x => x === v);
}

function findNextMigration(fromVersion: string): SaveDataMigration | undefined {
  return SAVE_DATA_MIGRATIONS.find(m => m.fromVersion === fromVersion);
}

export function runSaveDataMigrations(data: RouteData): MigrationResult {
  const incoming = data.saveDataVersion;
  const knownIndex = incoming ? getKnownVersionIndex(incoming) : 0;
  const unknown = incoming !== undefined && incoming !== null && incoming !== '' && knownIndex < 0;

  if (unknown) {
    return { data, applied: [], finalVersion: incoming!, unknown: true, unknownVersion: incoming };
  }

  let current = data;
  const applied: SaveDataMigration[] = [];
  let next = findNextMigration(current.saveDataVersion ?? SAVE_DATA_VERSION_HISTORY[0]);
  let safety = SAVE_DATA_MIGRATIONS.length + 1;
  while (next && safety-- > 0) {
    current = next.migrate(current);
    current = { ...current, saveDataVersion: next.toVersion };
    applied.push(next);
    next = findNextMigration(current.saveDataVersion ?? '');
  }
  return { data: current, applied, finalVersion: current.saveDataVersion ?? incoming ?? '', unknown: false };
}

export function needsSaveDataMigration(data: RouteData): boolean {
  const result = runSaveDataMigrations(data);
  return result.unknown || result.applied.length > 0;
}

export function migrateRouteCoordinates(data: RouteData): RouteData {
  if (data.mapVersion && data.mapVersion >= 2) {
    return data;
  }
  const migratedMarkers = (data.markers || []).map(m => {
    const updated = { ...m, x: m.x * 2, y: m.y * 2 };
    if (m.scrollConfig) {
      updated.scrollConfig = {
        ...m.scrollConfig,
        x: m.scrollConfig.x * 2,
        y: m.scrollConfig.y * 2
      };
    }
    return updated;
  });
  const migratedStrokes: { [key in FloorType]: DrawingStroke[] } = { main: [] };
  if (data.strokes) {
    Object.keys(data.strokes).forEach(floorKey => {
      const floorStrokes = data.strokes[floorKey as FloorType];
      if (Array.isArray(floorStrokes)) {
        migratedStrokes[floorKey as FloorType] = floorStrokes.map(stroke => ({
          ...stroke,
          points: (stroke.points || []).map(pt => ({ x: pt.x * 2, y: pt.y * 2 }))
        }));
      }
    });
  }
  return { ...data, markers: migratedMarkers, strokes: migratedStrokes, mapVersion: 2 };
}

export function migrateLoadedRoute(data: RouteData): { data: RouteData; result: MigrationResult; legacyMigrated: boolean } {
  const legacyMigrated = !data.mapVersion || data.mapVersion < 2;
  const afterLegacy = migrateRouteCoordinates(data);
  const result = runSaveDataMigrations(afterLegacy);
  return { data: result.data, result, legacyMigrated };
}
