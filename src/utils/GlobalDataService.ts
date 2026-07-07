import type {
  HeistMarker, WallSegment, Point, GlobalLockedWalls, LockedWallSegment,
  SpawnPoint, RegisteredItem, PresetData, SkillCdPreset, SkillCdMode,
  RouteData
} from './types';
import { generateId, normalizePresets, loadPresetBody, savePresetBody, PRESET_BODY_KEY_PREFIX } from './DataManager';

// GlobalDefaults type — defined here to avoid circular dependency with deleted hook
export interface GlobalDefaults {
  hiddenMarkers: string[];
  hiddenMarkerTypes: string[];
  startupFocusMarkerId?: string;
  stopMarkerThreshold?: number;
  movementMarkerThreshold?: number;
  warpMarkerThreshold?: number;
  skillCdThreshold?: number;
  skillCdPresets?: SkillCdPreset[];
  storageLimitBytes?: number;
  spawnFeatureEnabled?: boolean;
}

// Backward-compat types for useFileIO, useRoute, LeftSidebar
export interface GlobalMarkersStore {
  globalMarkers: HeistMarker[];
  setGlobalMarkers: (markers: HeistMarker[] | ((prev: HeistMarker[]) => HeistMarker[])) => void;
  replace: (markers: HeistMarker[]) => void;
  mergeFromImport: (incoming: HeistMarker[]) => void;
  mergeOrUpdate: (markers: HeistMarker[]) => void;
}

export interface SpawnStore {
  points: SpawnPoint[];
  items: RegisteredItem[];
  setPoints: (p: SpawnPoint[]) => void;
  addPoint: (p: SpawnPoint) => void;
  updatePoint: (id: string, updates: Partial<SpawnPoint>) => void;
  removePoint: (id: string) => void;
  addItem: (item: RegisteredItem) => void;
  updateItem: (id: string, updates: Partial<RegisteredItem>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, direction: -1 | 1) => void;
}

type DataType = 'markers' | 'walls' | 'lockedWalls' | 'spawns' | 'defaults' | 'help' | 'presets';
type DataOperation = 'load' | 'merge' | 'save' | 'reset';
type DataSource = 'static' | 'api' | 'localStorage' | 'localStorage+api';

export interface DataEvent {
  operation: DataOperation;
  type: DataType;
  source: DataSource;
  detail?: string;
  success: boolean;
}

export type GlobalWalls = { [key: string]: WallSegment[] };
export interface HelpData { [tabId: string]: string; }
export interface HelpTab { id: string; label: string; }

export const HELP_TABS: HelpTab[] = [
  { id: 'spec', label: '仕様' },
  { id: 'updates', label: '最近の更新' },
  { id: 'bugs', label: '奇妙な動作' },
  { id: 'help', label: '操作ヘルプ' },
  { id: 'credits', label: '出展' },
  { id: 'settings', label: '⚙️ 設定' },
  { id: 'debug', label: 'デバッグ' }
];

const BASE = () => (typeof import.meta !== 'undefined' ? import.meta.env.BASE_URL : '/');
const EMPTY_WALLS: GlobalWalls = { main: [], second: [], third: [], fourth: [] };
const FLOORS = ['main', 'second', 'third', 'fourth'] as const;
const LOCAL_WALLS_KEY = 'heist_global_walls';
const LOCAL_MARKERS_KEY = 'heist_global_markers';
const LOCAL_LOCKED_WALLS_KEY = 'heist_global_locked_walls';
const SKILL_CD_PRESETS_CACHE_KEY = 'heist_skill_cd_presets_v1';
const STORAGE_LIMIT_KEY = 'heist_storage_limit_bytes_v1';
const STORAGE_LIMIT_DEFAULT_BYTES = 10 * 1024 * 1024;
const PRESETS_LOCAL_KEY = 'heist_presets';

function backfillDefaults(m: HeistMarker): HeistMarker {
  const u = { ...m };
  if (m.type === 'boss') {
    if (u.bossDurationSeconds === undefined) u.bossDurationSeconds = 60;
    if (u.bossDrops === undefined) u.bossDrops = [];
  } else if (m.type === 'battle' || m.type === 'gbattle') {
    if (u.battleDurationSeconds === undefined) u.battleDurationSeconds = 20;
  } else if (m.type === 'picking' || m.type === 'gpicking') {
    if (u.pickingDurationSeconds === undefined) u.pickingDurationSeconds = 5;
  } else if (m.type === 'long_picking' || m.type === 'glong_picking') {
    if (u.longPickingDurationSeconds === undefined) u.longPickingDurationSeconds = 8;
  } else if (m.type === 'drawer') {
    if (u.drawerRows === undefined) u.drawerRows = 3;
    if (u.drawerCols === undefined) u.drawerCols = 1;
    if (u.drawerAngle === undefined) u.drawerAngle = 0;
    if (u.drawerWidth === undefined) u.drawerWidth = 60;
    if (u.drawerHeight === undefined) u.drawerHeight = 70;
  }
  return u;
}

function filterGlobalMarkers(raw: HeistMarker[]): HeistMarker[] {
  const indiv = new Set(['start','p1','p2','p3','battle','picking','long_picking','iwarp','iinfo','inote','itext','checkpoint','skill_cd']);
  return raw.filter(m => m && typeof m === 'object' && typeof m.id === 'string' && !indiv.has(m.type) && m.type !== 'camera' as any && m.type !== 'guard' as any)
    .map(m => { const c = { ...m }; if (c.warpWaypoints) c.warpWaypoints = c.warpWaypoints.filter((wp: any) => wp != null); return backfillDefaults(c); });
}

function sanitizeWalls(raw: unknown): GlobalWalls {
  const out: GlobalWalls = { ...EMPTY_WALLS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [floor, segs] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(segs)) continue;
    const cleaned: WallSegment[] = [];
    for (const seg of segs) {
      if (!Array.isArray(seg) || seg.length < 2) continue;
      const a = seg[0] as Point, b = seg[1] as Point;
      if (!a || !b || typeof a.x !== 'number' || typeof a.y !== 'number' || typeof b.x !== 'number' || typeof b.y !== 'number') continue;
      const tex = typeof seg[2] === 'string' ? seg[2] : undefined;
      const rep = typeof seg[3] === 'number' ? seg[3] : undefined;
      if (tex && rep !== undefined) cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, tex, rep]);
      else if (tex) cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, tex]);
      else cleaned.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    }
    out[floor] = cleaned;
  }
  return out;
}

function ensureFloors(walls: GlobalWalls): GlobalWalls {
  const n = { ...walls };
  for (const f of FLOORS) { if (!Array.isArray(n[f])) n[f] = []; }
  return n;
}

function wallSig(w: WallSegment): string {
  return `${w[0].x},${w[0].y}-${w[1].x},${w[1].y}`;
}

function mergeWalls(base: GlobalWalls, incoming: GlobalWalls): GlobalWalls {
  const next = ensureFloors({ ...base });
  for (const [floor, segs] of Object.entries(incoming)) {
    if (!Array.isArray(segs) || segs.length === 0) continue;
    const existing = next[floor] || [];
    const sigs = new Set(existing.map(wallSig));
    for (const w of segs) {
      const sig = wallSig(w);
      if (!sigs.has(sig)) {
        const copy: WallSegment = w[2] !== undefined
          ? (w[3] !== undefined
            ? [{ x: w[0].x, y: w[0].y }, { x: w[1].x, y: w[1].y }, w[2], w[3]]
            : [{ x: w[0].x, y: w[0].y }, { x: w[1].x, y: w[1].y }, w[2]])
          : [{ x: w[0].x, y: w[0].y }, { x: w[1].x, y: w[1].y }];
        existing.push(copy);
        sigs.add(sig);
      }
    }
    next[floor] = existing;
  }
  return next;
}

function mergeMarkers(base: HeistMarker[], incoming: HeistMarker[]): HeistMarker[] {
  const byId = new Map(base.map(m => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    if (!byId.has(m.id)) { byId.set(m.id, m); changed = true; }
  }
  return changed ? [...byId.values()] : base;
}

function loadLocalJSON<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : null; } catch { return null; }
}

function saveLocalJSON(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}

export class GlobalDataService {
  private static _instance: GlobalDataService;
  private _isLocal: boolean;
  private _loaded = false;
  private _loading = false;
  private _loadPromise: Promise<void> | null = null;
  private _subscribers = new Set<() => void>();
  private _eventListeners = new Set<(event: DataEvent) => void>();
  private _writeQueue: Array<() => void> = [];

  private _markers: HeistMarker[] = [];
  private _walls: GlobalWalls = { ...EMPTY_WALLS };
  private _lockedWalls: GlobalLockedWalls = { main: [], second: [], third: [], fourth: [] };
  private _spawnPoints: SpawnPoint[] = [];
  private _spawnItems: RegisteredItem[] = [];
  private _defaults: GlobalDefaults | null = null;
  private _help: HelpData | null = null;
  private _presets: PresetData[] = [];

  private _skillCdPresets: SkillCdPreset[] = [];

  private constructor() {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    this._isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  static getInstance(): GlobalDataService {
    if (!GlobalDataService._instance) GlobalDataService._instance = new GlobalDataService();
    return GlobalDataService._instance;
  }

  get isLocal(): boolean { return this._isLocal; }
  get loaded(): boolean { return this._loaded; }

  subscribe(cb: () => void): () => void {
    this._subscribers.add(cb);
    return () => { this._subscribers.delete(cb); };
  }

  onEvent(cb: (event: DataEvent) => void): () => void {
    this._eventListeners.add(cb);
    return () => { this._eventListeners.delete(cb); };
  }

  private _emit(event: DataEvent): void {
    for (const cb of this._eventListeners) cb(event);
  }

  private _notify(): void {
    for (const cb of this._subscribers) cb();
  }

  private _url(path: string): string {
    return `${BASE()}${path}`;
  }

  private async _fetchJSON<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(this._url(path));
      return res.ok ? (await res.json() as T) : null;
    } catch { return null; }
  }

  private _postAPI(path: string, body: unknown): void {
    if (!this._isLocal) return;
    fetch(this._url(path), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).catch(() => {});
  }

  // --- Load Methods (private, called by loadAll) ---

  private async _loadMarkers(): Promise<void> {
    const fromStatic = await this._fetchJSON<HeistMarker[]>('global_markers.json');
    this._markers = filterGlobalMarkers(fromStatic || []);
    this._emit({ operation: 'load', type: 'markers', source: 'static', success: !!fromStatic, detail: `${this._markers.length} items` });

    if (this._isLocal && fromStatic) {
      const fromAPI = await this._fetchJSON<HeistMarker[]>('api/global-markers');
      if (fromAPI && Array.isArray(fromAPI) && fromAPI.length > 0) {
        const cleaned = filterGlobalMarkers(fromAPI);
        const merged = mergeMarkers(this._markers, cleaned);
        const added = merged.length - this._markers.length;
        if (added > 0) {
          this._markers = merged;
          this._emit({ operation: 'merge', type: 'markers', source: 'api', success: true, detail: `${added} new items` });
        }
      }
    }
  }

  private _mergeMarkersFromLocalStorage(): void {
    const local = loadLocalJSON<HeistMarker[]>(LOCAL_MARKERS_KEY);
    if (!local || !Array.isArray(local) || local.length === 0) {
      this._emit({ operation: 'merge', type: 'markers', source: 'localStorage', success: true, detail: 'skipped (empty)' });
      return;
    }
    const cleaned = filterGlobalMarkers(local);
    const byId = new Map(this._markers.map(m => [m.id, m]));
    let mergeCount = 0;
    for (const m of cleaned) {
      const existing = byId.get(m.id);
      if (existing) {
        const merged = { ...existing, ...m };
        byId.set(m.id, merged);
        mergeCount++;
      } else {
        byId.set(m.id, m);
        mergeCount++;
      }
    }
    this._markers = [...byId.values()];
    this._emit({ operation: 'merge', type: 'markers', source: 'localStorage', success: true, detail: `${mergeCount} items merged` });
  }

  private async _loadWalls(): Promise<void> {
    const fromStatic = await this._fetchJSON<GlobalWalls>('global_walls.json');
    this._walls = sanitizeWalls(fromStatic);
    this._emit({ operation: 'load', type: 'walls', source: 'static', success: !!fromStatic });

    if (this._isLocal && fromStatic) {
      const fromAPI = await this._fetchJSON<GlobalWalls>('api/global-walls');
      if (fromAPI && typeof fromAPI === 'object' && !Array.isArray(fromAPI)) {
        const sanitized = sanitizeWalls(fromAPI);
        const total = Object.values(sanitized).reduce((s, a) => s + a.length, 0);
        if (total > 0) {
          const merged = mergeWalls(this._walls, sanitized);
          const diff = Object.entries(merged).reduce((s, [f, segs]) => s + segs.length - (this._walls[f]?.length || 0), 0);
          this._walls = merged;
          if (diff > 0) this._emit({ operation: 'merge', type: 'walls', source: 'api', success: true, detail: `${diff} new segments` });
        }
      }
    }
  }

  private _mergeWallsFromLocalStorage(): void {
    const local = loadLocalJSON<GlobalWalls>(LOCAL_WALLS_KEY);
    if (!local || typeof local !== 'object') {
      this._emit({ operation: 'merge', type: 'walls', source: 'localStorage', success: true, detail: 'skipped (empty)' });
      return;
    }
    const sanitized = sanitizeWalls(local);
    const total = Object.values(sanitized).reduce((s, a) => s + a.length, 0);
    if (total === 0) {
      this._emit({ operation: 'merge', type: 'walls', source: 'localStorage', success: true, detail: 'skipped (empty)' });
      return;
    }
    const merged = mergeWalls(this._walls, sanitized);
    const diff = Object.entries(merged).reduce((s, [f, segs]) => s + segs.length - (this._walls[f]?.length || 0), 0);
    if (diff > 0) {
      this._walls = merged;
      this._emit({ operation: 'merge', type: 'walls', source: 'localStorage', success: true, detail: `${diff} local segments added` });
    } else {
      this._emit({ operation: 'merge', type: 'walls', source: 'localStorage', success: true, detail: 'no new segments' });
    }
  }

  private async _loadLockedWalls(): Promise<void> {
    if (this._isLocal) {
      const fromAPI = await this._fetchJSON<GlobalLockedWalls>('api/global-locked-walls');
      if (fromAPI && typeof fromAPI === 'object' && !Array.isArray(fromAPI)) {
        this._lockedWalls = this._parseLockedWalls(fromAPI);
        this._emit({ operation: 'load', type: 'lockedWalls', source: 'api', success: true });
        return;
      }
    }
    const fromStatic = await this._fetchJSON<GlobalLockedWalls>('global_locked_walls.json');
    if (fromStatic && typeof fromStatic === 'object' && !Array.isArray(fromStatic)) {
      this._lockedWalls = this._parseLockedWalls(fromStatic);
      this._emit({ operation: 'load', type: 'lockedWalls', source: 'static', success: true });
    } else {
      this._emit({ operation: 'load', type: 'lockedWalls', source: 'static', success: false, detail: 'no data' });
    }
  }

  private _mergeLockedWallsFromLocalStorage(): void {
    const local = loadLocalJSON<GlobalLockedWalls>(LOCAL_LOCKED_WALLS_KEY);
    if (!local) {
      this._emit({ operation: 'merge', type: 'lockedWalls', source: 'localStorage', success: true, detail: 'skipped (empty)' });
      return;
    }
    this._lockedWalls = this._parseLockedWalls(local);
    this._emit({ operation: 'merge', type: 'lockedWalls', source: 'localStorage', success: true, detail: 'restored from cache' });
  }

  private _parseLockedWalls(data: any): GlobalLockedWalls {
    const out: GlobalLockedWalls = {};
    for (const floor of FLOORS) {
      out[floor] = [];
      if (Array.isArray(data[floor])) {
        for (const seg of data[floor]) {
          if (seg?.p1 && seg?.p2 && typeof seg.p1.x === 'number' && typeof seg.p1.y === 'number' && typeof seg.p2.x === 'number' && typeof seg.p2.y === 'number') {
            out[floor].push({ p1: seg.p1, p2: seg.p2, isOpen: false });
          }
        }
      }
    }
    return out;
  }

  private async _loadSpawns(): Promise<void> {
    const fromStatic = await this._fetchJSON<{ points?: any[]; items?: any[] }>('global_spawns.json');
    this._emit({ operation: 'load', type: 'spawns', source: 'static', success: !!fromStatic });
    if (fromStatic) {
      this._setSpawnData(fromStatic);
      return;
    }
    if (this._isLocal) {
      const fromAPI = await this._fetchJSON<{ points?: any[]; items?: any[] }>('api/global-spawns');
      if (fromAPI && fromAPI.points) {
        this._setSpawnData(fromAPI);
        this._emit({ operation: 'load', type: 'spawns', source: 'api', success: true });
        return;
      }
    }
    const ls = localStorage.getItem('heist_global_spawns');
    if (ls) {
      try { const p = JSON.parse(ls); if (Array.isArray(p)) { this._spawnPoints = p.filter((s: any) => s && typeof s.id === 'string').map(this._normalizeSpawnPoint); this._emit({ operation: 'merge', type: 'spawns', source: 'localStorage', success: true, detail: `${this._spawnPoints.length} points migrated` }); } } catch {}
    }
  }

  private _setSpawnData(data: { points?: any[]; items?: any[] }): void {
    if (Array.isArray(data.points)) this._spawnPoints = data.points.filter((s: any) => s && typeof s.id === 'string').map(this._normalizeSpawnPoint);
    if (Array.isArray(data.items)) this._spawnItems = data.items.filter((s: any) => s && typeof s.id === 'string').map(this._normalizeSpawnItem);
  }

  private _normalizeSpawnPoint(p: any): SpawnPoint {
    const items = Array.isArray(p.items) ? p.items.map((pi: any) => ({ ...pi, playerCount: pi.playerCount ?? 0 })) : [];
    const category = p.category;
    const defaultRate = (category === '小金庫' || category === '中金庫') ? '中' as const : category === '絵画' ? '低' as const : '高' as const;
    return { ...p, items, appearanceRate: p.appearanceRate ?? defaultRate };
  }

  private _normalizeSpawnItem(i: any): RegisteredItem {
    return { id: i.id, name: i.name || '', textColor: i.textColor || 'blue', fans: i.fans ?? 0, coins: i.coins ?? 0, image: i.image, description: i.description };
  }

  private async _loadDefaults(): Promise<void> {
    let source: GlobalDefaults | null = null;
    const fromAPI = await this._fetchJSON<GlobalDefaults>('api/global-defaults');
    if (fromAPI) source = fromAPI;
    else source = await this._fetchJSON<GlobalDefaults>('global_defaults.json');
    this._emit({ operation: 'load', type: 'defaults', source: source ? (fromAPI ? 'api' : 'static') : 'static', success: !!source });
    this._applyDefaults(source);
  }

  private _mergeDefaultsFromLocalStorage(): void {
    const cached = loadLocalJSON<SkillCdPreset[]>(SKILL_CD_PRESETS_CACHE_KEY);
    if (!cached || !Array.isArray(cached)) {
      this._emit({ operation: 'merge', type: 'defaults', source: 'localStorage', success: true, detail: 'skipped (empty)' });
      return;
    }
    const serverIds = new Set((this._skillCdPresets || []).map(p => p.id));
    const extras = cached.filter(p => !serverIds.has(p.id));
    if (extras.length > 0) {
      this._skillCdPresets = [...(this._skillCdPresets || []), ...extras];
      this._saveSkillCdPresetsToCache(extras);
    }
    const diff = extras.length;
    this._emit({ operation: 'merge', type: 'defaults', source: 'localStorage', success: true, detail: diff > 0 ? `${diff} skill presets merged` : 'no new presets' });
  }

  private _applyDefaults(source: GlobalDefaults | null): void {
    const serverPresets = Array.isArray(source?.skillCdPresets) ? source!.skillCdPresets : [];
    const cached = loadLocalJSON<SkillCdPreset[]>(SKILL_CD_PRESETS_CACHE_KEY);
    const existingIds = new Set(serverPresets.map(p => p.id));
    const extraPresets = cached ? cached.filter(p => !existingIds.has(p.id)) : [];
    const presets: SkillCdPreset[] = [...serverPresets, ...extraPresets].map(p => ({
      id: p.id, label: p.label, color: p.color, mode: p.mode === 'per_second' ? 'per_second' as const : 'fixed' as const,
      seconds: typeof p.seconds === 'number' ? p.seconds : 0, perSecondCd: typeof p.perSecondCd === 'number' ? p.perSecondCd : 0
    }));
    if (extraPresets.length > 0) this._saveSkillCdPresetsToCache(extraPresets);
    this._defaults = {
      hiddenMarkers: source?.hiddenMarkers || [],
      hiddenMarkerTypes: source?.hiddenMarkerTypes || [],
      startupFocusMarkerId: source?.startupFocusMarkerId,
      stopMarkerThreshold: source?.stopMarkerThreshold,
      movementMarkerThreshold: source?.movementMarkerThreshold,
      warpMarkerThreshold: source?.warpMarkerThreshold,
      skillCdThreshold: source?.skillCdThreshold,
      skillCdPresets: presets,
      storageLimitBytes: this._loadStorageLimit(),
      spawnFeatureEnabled: source?.spawnFeatureEnabled ?? false
    };
    this._skillCdPresets = presets;
  }

  private _loadStorageLimit(): number {
    try { const r = localStorage.getItem(STORAGE_LIMIT_KEY); if (r) { const n = parseInt(r, 10); if (Number.isFinite(n) && n >= 1024 * 1024) return n; } } catch {}
    return STORAGE_LIMIT_DEFAULT_BYTES;
  }

  private _saveSkillCdPresetsToCache(presets: SkillCdPreset[]): void {
    try { localStorage.setItem(SKILL_CD_PRESETS_CACHE_KEY, JSON.stringify(presets)); } catch {}
  }

  private async _loadHelp(): Promise<void> {
    const fromAPI = await this._fetchJSON<HelpData>('api/global-help');
    if (fromAPI) {
      this._help = fromAPI;
      this._emit({ operation: 'load', type: 'help', source: 'api', success: true });
      return;
    }
    const fromStatic = await this._fetchJSON<HelpData>('global_help.json');
    this._help = fromStatic || {};
    this._emit({ operation: 'load', type: 'help', source: 'static', success: !!fromStatic });
  }

  private async _loadPresets(): Promise<void> {
    const fromAPI = await this._fetchJSON<PresetData[]>('api/presets');
    if (fromAPI && Array.isArray(fromAPI) && fromAPI.length > 0) {
      this._presets = normalizePresets(fromAPI);
      this._emit({ operation: 'load', type: 'presets', source: 'api', success: true, detail: `${this._presets.length} presets` });
      return;
    }
    const fromStatic = await this._fetchJSON<PresetData[]>('presets.json');
    if (fromStatic && Array.isArray(fromStatic) && fromStatic.length > 0) {
      this._presets = normalizePresets(fromStatic);
      this._emit({ operation: 'load', type: 'presets', source: 'static', success: true, detail: `${this._presets.length} presets` });
      return;
    }
    this._emit({ operation: 'load', type: 'presets', source: 'static', success: false, detail: 'no presets found' });
  }

  // --- Public API ---

  async loadAll(): Promise<void> {
    if (this._loaded) return;
    if (this._loading && this._loadPromise) return this._loadPromise;
    this._loading = true;

    this._loadPromise = (async () => {
      await Promise.all([
        this._loadMarkers(),
        this._loadWalls(),
        this._loadLockedWalls(),
        this._loadSpawns(),
        this._loadDefaults(),
        this._loadHelp(),
        this._loadPresets()
      ]);

      this._mergeMarkersFromLocalStorage();
      this._mergeWallsFromLocalStorage();
      this._mergeLockedWallsFromLocalStorage();
      this._mergeDefaultsFromLocalStorage();

      this._loaded = true;
      this._loading = false;

      const queue = this._writeQueue;
      this._writeQueue = [];
      for (const fn of queue) fn();

      this._notify();
    })();

    return this._loadPromise;
  }

  async reloadAll(includeLocalOverrides: boolean): Promise<void> {
    this._loaded = false;
    this._loading = true;
    this._writeQueue = [];

    this._loadPromise = (async () => {
      await Promise.all([
        this._loadMarkers(),
        this._loadWalls(),
        this._loadLockedWalls(),
        this._loadSpawns(),
        this._loadDefaults(),
        this._loadHelp(),
        this._loadPresets()
      ]);

      if (includeLocalOverrides) {
        this._mergeMarkersFromLocalStorage();
        this._mergeWallsFromLocalStorage();
        this._mergeLockedWallsFromLocalStorage();
        this._mergeDefaultsFromLocalStorage();
      } else {
        this._emit({ operation: 'reset', type: 'markers', source: 'localStorage', success: true, detail: 'skipped (新規)' });
        this._emit({ operation: 'reset', type: 'walls', source: 'localStorage', success: true, detail: 'skipped (新規)' });
        this._emit({ operation: 'reset', type: 'lockedWalls', source: 'localStorage', success: true, detail: 'skipped (新規)' });
        this._emit({ operation: 'reset', type: 'defaults', source: 'localStorage', success: true, detail: 'skipped (新規)' });
      }

      this._loaded = true;
      this._loading = false;

      const queue = this._writeQueue;
      this._writeQueue = [];
      for (const fn of queue) fn();

      this._notify();
    })();

    return this._loadPromise;
  }

  private _guard(): boolean {
    if (this._loaded) return true;
    if (this._loading) return false;
    return false;
  }

  private _save(fn: () => void): void {
    if (this._loaded) { fn(); return; }
    this._writeQueue.push(fn);
  }

  // --- Getters ---

  getMarkers(): HeistMarker[] { return this._markers; }
  getWalls(): GlobalWalls { return this._walls; }
  getLockedWalls(): GlobalLockedWalls { return this._lockedWalls; }
  getSpawnPoints(): SpawnPoint[] { return this._spawnPoints; }
  getSpawnItems(): RegisteredItem[] { return this._spawnItems; }
  getDefaults(): GlobalDefaults | null { return this._defaults; }
  getHelp(): HelpData | null { return this._help; }
  getPresets(): PresetData[] { return this._presets; }
  getSkillCdPresets(): SkillCdPreset[] { return this._skillCdPresets; }

  // --- Setters (auto-persist) ---

  saveMarkers(markers: HeistMarker[]): void {
    this._markers = markers;
    this._save(() => {
      saveLocalJSON(LOCAL_MARKERS_KEY, markers);
      if (this._isLocal && markers.length > 0) {
        this._postAPI('api/global-markers', markers);
        this._emit({ operation: 'save', type: 'markers', source: 'localStorage+api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'markers', source: 'localStorage', success: true });
      }
      this._notify();
    });
  }

  saveWalls(walls: GlobalWalls): void {
    this._walls = ensureFloors(walls);
    this._save(() => {
      saveLocalJSON(LOCAL_WALLS_KEY, this._walls);
      if (this._isLocal) {
        this._postAPI('api/global-walls', this._walls);
        this._emit({ operation: 'save', type: 'walls', source: 'localStorage+api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'walls', source: 'localStorage', success: true });
      }
      this._notify();
    });
  }

  saveLockedWalls(walls: GlobalLockedWalls): void {
    this._lockedWalls = walls;
    this._save(() => {
      saveLocalJSON(LOCAL_LOCKED_WALLS_KEY, walls);
      if (this._isLocal) {
        this._postAPI('api/global-locked-walls', walls);
        this._emit({ operation: 'save', type: 'lockedWalls', source: 'localStorage+api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'lockedWalls', source: 'localStorage', success: true });
      }
      this._notify();
    });
  }

  saveSpawns(points: SpawnPoint[], items: RegisteredItem[]): void {
    this._spawnPoints = points;
    this._spawnItems = items;
    this._save(() => {
      if (this._isLocal) {
        this._postAPI('api/global-spawns', { points, items });
        this._emit({ operation: 'save', type: 'spawns', source: 'api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'spawns', source: 'localStorage', success: false, detail: 'API unavailable' });
      }
      this._notify();
    });
  }

  saveDefaults(defaults: GlobalDefaults, skillCdPresets: SkillCdPreset[]): void {
    this._defaults = defaults;
    this._skillCdPresets = skillCdPresets;
    this._save(() => {
      try { localStorage.setItem(SKILL_CD_PRESETS_CACHE_KEY, JSON.stringify(skillCdPresets)); } catch {}
      try { localStorage.setItem(STORAGE_LIMIT_KEY, String(defaults.storageLimitBytes ?? STORAGE_LIMIT_DEFAULT_BYTES)); } catch {}
      if (this._isLocal) {
        this._postAPI('api/global-defaults', { ...defaults, skillCdPresets });
        this._emit({ operation: 'save', type: 'defaults', source: 'localStorage+api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'defaults', source: 'localStorage', success: true });
      }
      this._notify();
    });
  }

  saveHelp(help: HelpData): void {
    this._help = help;
    this._save(() => {
      if (this._isLocal) {
        fetch(this._url('api/global-help'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(help)
        }).then(r => {
          this._emit({ operation: 'save', type: 'help', source: 'api', success: r.ok });
        }).catch(() => {
          this._emit({ operation: 'save', type: 'help', source: 'api', success: false });
        });
      } else {
        this._emit({ operation: 'save', type: 'help', source: 'localStorage', success: false, detail: 'API unavailable' });
      }
    });
  }

  savePresets(presets: PresetData[]): void {
    this._presets = presets;
    this._save(() => {
      saveLocalJSON(PRESETS_LOCAL_KEY, presets);
      if (this._isLocal) {
        this._postAPI('api/presets', presets);
        this._emit({ operation: 'save', type: 'presets', source: 'localStorage+api', success: true });
      } else {
        this._emit({ operation: 'save', type: 'presets', source: 'localStorage', success: true });
      }
      this._notify();
    });
  }

  savePresetBody(presetId: string, routeData: RouteData): void {
    savePresetBody(presetId, routeData);
  }

  loadPresetBody(presetId: string): RouteData | null {
    return loadPresetBody(presetId);
  }

  setSkillCdPresets(presets: SkillCdPreset[]): void {
    this._skillCdPresets = presets;
    this._save(() => {
      try { localStorage.setItem(SKILL_CD_PRESETS_CACHE_KEY, JSON.stringify(presets)); } catch {}
      if (this._isLocal) {
        this._postAPI('api/global-defaults', { ...(this._defaults || {}), skillCdPresets: presets });
        this._emit({ operation: 'save', type: 'defaults', source: 'localStorage+api', success: true });
      }
      this._notify();
    });
  }

  setStorageLimit(bytes: number): void {
    const clamped = Math.max(1024 * 1024, Math.floor(bytes));
    if (this._defaults) this._defaults = { ...this._defaults, storageLimitBytes: clamped };
    try { localStorage.setItem(STORAGE_LIMIT_KEY, String(clamped)); } catch {}
  }

  get isLoaded(): boolean { return this._loaded; }
}
