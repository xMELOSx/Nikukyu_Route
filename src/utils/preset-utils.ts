import type { PresetVisibility, PresetData, RouteData } from './types'
import { PRESET_BODY_KEY_PREFIX } from './constants'
import { migrateOriginalAuthorToRenderCache } from './migrations'

export function normalizePresetVisibility(v: unknown): PresetVisibility {
  return v === 'unlisted' || v === 'private' ? v : 'public';
}

export function getPresetVisibility(preset: Pick<PresetData, 'visibility'>): PresetVisibility {
  return normalizePresetVisibility(preset.visibility);
}

export function normalizePresets(raw: unknown): PresetData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p: any) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      description: typeof p.description === 'string' ? p.description : '',
      targetCash: typeof p.targetCash === 'string' ? p.targetCash : '',
      targetCoins: typeof p.targetCoins === 'string' ? p.targetCoins : '',
      author: typeof p.author === 'string' ? p.author : '',
      renderCache: typeof p.renderCache === 'string' ? p.renderCache : (typeof (p as any).originalAuthor === 'string' ? (p as any).originalAuthor : ''),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      visibility: normalizePresetVisibility(p.visibility),
      routeData: p.routeData && typeof p.routeData === 'object'
        ? migrateOriginalAuthorToRenderCache(p.routeData as any)
        : undefined
    }));
}

export function presetBodyKey(presetId: string): string {
  return `${PRESET_BODY_KEY_PREFIX}${presetId}`;
}

export function savePresetBody(presetId: string, routeData: RouteData): void {
  localStorage.setItem(presetBodyKey(presetId), JSON.stringify(routeData));
}

export function loadPresetBody(presetId: string): RouteData | null {
  try {
    const raw = localStorage.getItem(presetBodyKey(presetId));
    if (!raw) return null;
    return JSON.parse(raw) as RouteData;
  } catch {
    return null;
  }
}

export function removePresetBody(presetId: string): void {
  try { localStorage.removeItem(presetBodyKey(presetId)); } catch { /* ignore */ }
}

export function migrateLegacyPresetBodies(presets: PresetData[]): PresetData[] {
  const migrated: PresetData[] = [];
  let anyMigrated = false;
  for (const p of presets) {
    if (p.routeData) {
      try { savePresetBody(p.id, p.routeData); } catch { /* quota 等: 無視 */ }
      const { routeData: _drop, ...meta } = p;
      migrated.push(meta as PresetData);
      anyMigrated = true;
    } else {
      migrated.push(p);
    }
  }
  if (anyMigrated) {
    try { localStorage.setItem('heist_presets', JSON.stringify(migrated)); } catch { /* ignore */ }
  }
  return migrated;
}
