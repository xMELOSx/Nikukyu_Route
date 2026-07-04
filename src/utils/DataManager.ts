export {
  generateId, TEXTCOLOR_OPTIONS, SPAWN_CATEGORIES, APPEARANCE_RATES,
  CATEGORY_TO_POOL, POOL_LABELS
} from './types'
export type {
  FloorType, MarkerType, Point, DrawingStroke, ScrollConfig, MediaItem,
  HeistMarker, RouteData, SaveDataMigration, MigrationResult,
  PresetVisibility, PresetData, PresetMeta, SkillCdMode, SkillCdPreset,
  TextColorOption, RegisteredItem, SpawnPointItem, SpawnCategory, SpawnPoint,
  AppearanceRate
} from './types'

export {
  AUTHOR_TAMPERED, AUTHOR_DEFAULT_PLAIN, AUTHOR_UNKNOWN_MARKER,
  AUTHOR_KEY, RENDER_CACHE_KEY, APP_VERSION, APP_BUILD_TIME, APP_DISPLAY_VERSION,
  SAVE_DATA_VERSION_HISTORY, SAVE_DATA_MIGRATIONS, PRESET_VISIBILITY_META,
  PRESET_BODY_KEY_PREFIX, TEXTCOLOR_META, MARKER_META, PRESET_MAPS_META,
  DEFAULT_ROUTE
} from './constants'

export {
  aesGcmEncrypt, aesGcmDecrypt, xorDecrypt, xorEncrypt,
  getOriginalAuthorKey, getRenderCacheKey
} from './encryption'

export {
  normalizePresetVisibility, getPresetVisibility, normalizePresets,
  presetBodyKey, savePresetBody, loadPresetBody, removePresetBody,
  migrateLegacyPresetBodies
} from './preset-utils'

export {
  isMovementMarker, isStopMarker, isCheckpointMarker,
  getStopDurationSeconds, getSkillCdIcon, getSkillCdColor,
  getSkillCdSeconds, getSkillCdDisplayValue, getSkillCdPerSecondRate,
  getSkillCdRemaining
} from './marker-utils'

export {
  runSaveDataMigrations, needsSaveDataMigration,
  migrateRouteCoordinates, migrateLoadedRoute,
  migrateOriginalAuthorToRenderCache
} from './migrations'

export {
  normalizeStrokes, insertPngMetadata, extractPngMetadata,
  compressStrokes, decompressStrokes, smoothStrokePoints,
  smoothStrokePointsKeepEnds
} from './png-utils'

import type { FloorType, RouteData, PresetData } from './types'
import { APP_VERSION, MARKER_META, DEFAULT_ROUTE, AUTHOR_TAMPERED, PRESET_MAPS_META } from './constants'
import { aesGcmDecrypt, getOriginalAuthorKey } from './encryption'
import { normalizePresets } from './preset-utils'
import { getSkillCdColor, getSkillCdIcon } from './marker-utils'
import { insertPngMetadata, extractPngMetadata, compressStrokes, decompressStrokes } from './png-utils'

export class DataManager {
  static saveToLocalStorage(route: RouteData): boolean {
    try {
      const saves = this.getSavesList();
      const index = saves.findIndex(s => s.id === route.id);
      const prevHasCustomBg = index >= 0 ? !!saves[index].hasCustomBg : false;
      const entry = {
        id: route.id, title: route.title, targetCash: route.targetCash || '',
        targetCoins: route.targetCoins || '', description: route.description || '',
        author: route.author || '', renderCache: route.renderCache || '',
        createdAt: route.createdAt, updatedAt: Date.now(), hasCustomBg: prevHasCustomBg
      };
      if (index >= 0) { saves[index] = entry; } else { saves.push(entry); }
      const stamped: RouteData = { ...route, saveDataVersion: APP_VERSION };
      localStorage.setItem(`heist_route_${route.id}`, JSON.stringify(stamped));
      localStorage.setItem('heist_routes_list', JSON.stringify(saves));
      return true;
    } catch (e: any) {
      console.error('DataManager.saveToLocalStorage failed:', e);
      return false;
    }
  }

  static setSaveMetaBg(routeId: string, hasCustomBg: boolean): void {
    try {
      const saves = this.getSavesList();
      const index = saves.findIndex(s => s.id === routeId);
      if (index < 0) return;
      saves[index] = { ...saves[index], hasCustomBg };
      localStorage.setItem('heist_routes_list', JSON.stringify(saves));
    } catch (e) {
      console.error('DataManager.setSaveMetaBg failed:', e);
    }
  }

  private static customBgDbName = 'heist_custom_bg_db';
  private static customBgStoreName = 'customBgs';
  private static customBgDbVersion = 1;
  private static customBgDbPromise: Promise<IDBDatabase | null> | null = null;

  private static openCustomBgDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (DataManager.customBgDbPromise) return DataManager.customBgDbPromise;
    DataManager.customBgDbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DataManager.customBgDbName, DataManager.customBgDbVersion);
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(DataManager.customBgStoreName)) {
              db.createObjectStore(DataManager.customBgStoreName, { keyPath: 'routeId' });
            }
          } catch (e) { console.error('customBg IDB upgrade failed:', e); }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { console.error('customBg IDB open failed:', req.error); resolve(null); };
        req.onblocked = () => resolve(null);
      } catch (e) { console.error('customBg IDB init failed:', e); resolve(null); }
    });
    return DataManager.customBgDbPromise;
  }

  static async saveCustomBg(routeId: string, dataUrl: string | null): Promise<boolean> {
    if (!routeId) return false;
    if (dataUrl == null) return DataManager.deleteCustomBg(routeId);
    const db = await DataManager.openCustomBgDb();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(DataManager.customBgStoreName, 'readwrite');
        const store = tx.objectStore(DataManager.customBgStoreName);
        const req = store.put({ routeId, dataUrl, updatedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => { console.error('customBg IDB put failed:', req.error); resolve(false); };
      } catch (e) { console.error('customBg IDB save failed:', e); resolve(false); }
    });
  }

  static async loadCustomBg(routeId: string): Promise<string | null> {
    if (!routeId) return null;
    const db = await DataManager.openCustomBgDb();
    if (!db) return null;
    return new Promise<string | null>((resolve) => {
      try {
        const tx = db.transaction(DataManager.customBgStoreName, 'readonly');
        const store = tx.objectStore(DataManager.customBgStoreName);
        const req = store.get(routeId);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec && typeof rec.dataUrl === 'string') resolve(rec.dataUrl);
          else resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch (e) { console.error('customBg IDB load failed:', e); resolve(null); }
    });
  }

  static async deleteCustomBg(routeId: string): Promise<boolean> {
    if (!routeId) return false;
    const db = await DataManager.openCustomBgDb();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(DataManager.customBgStoreName, 'readwrite');
        const store = tx.objectStore(DataManager.customBgStoreName);
        const req = store.delete(routeId);
        req.onsuccess = () => resolve(true);
        req.onerror = () => { console.error('customBg IDB delete failed:', req.error); resolve(false); };
      } catch (e) { console.error('customBg IDB delete failed:', e); resolve(false); }
    });
  }

  static getSavesList(): { id: string; title: string; targetCash: string; targetCoins: string; description: string; author: string; renderCache: string; createdAt: number; updatedAt: number; hasCustomBg?: boolean }[] {
    try {
      const listStr = localStorage.getItem('heist_routes_list');
      if (!listStr) return [];
      const parsed = JSON.parse(listStr);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: any) => {
        if (e && typeof e === 'object') {
          const out: any = { ...e };
          if (out.renderCache === undefined) {
            out.renderCache = typeof out.originalAuthor === 'string' ? out.originalAuthor : '';
          }
          if (out.hasCustomBg === undefined) out.hasCustomBg = false;
          return out;
        }
        return e;
      });
    } catch (e) {
      console.error('getSavesList: corrupted data, clearing', e);
      try { localStorage.removeItem('heist_routes_list'); } catch {}
      return [];
    }
  }

  static loadFromLocalStorage(id: string): RouteData | null {
    try {
      const dataStr = localStorage.getItem(`heist_route_${id}`);
      if (!dataStr) return null;
      const parsed = JSON.parse(dataStr);
      if (!parsed || typeof parsed !== 'object') return null;
      return DataManager.migrateMediaFields(parsed as RouteData);
    } catch (e) {
      console.error(`loadFromLocalStorage: corrupted route ${id}, removing`, e);
      try { localStorage.removeItem(`heist_route_${id}`); } catch {}
      return null;
    }
  }

  static deleteFromLocalStorage(id: string): void {
    localStorage.removeItem(`heist_route_${id}`);
    const saves = this.getSavesList().filter(s => s.id !== id);
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  static loadPresetsFromLocalStorage(): PresetData[] {
    const raw = localStorage.getItem('heist_presets');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return normalizePresets(parsed);
    } catch {
      return [];
    }
  }

  static savePresetsToLocalStorage(presets: PresetData[]): void {
    try {
      localStorage.setItem('heist_presets', JSON.stringify(presets));
    } catch {
      // Ignore quota / serialization errors — the server copy is the source of truth
    }
  }

  static migrateMarkerMediaFields = (m: any): any => {
    if (!m || typeof m !== 'object') return m;
    const next: any = { ...m };
    if (Array.isArray(next.mediaItems)) return next;
    if (typeof next.infoMediaUrl === 'string' && next.infoMediaUrl.trim()) {
      next.mediaItems = [{
        id: `media_migrated_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        url: next.infoMediaUrl.trim(),
        type: next.infoMediaType || 'image',
        description: ''
      }];
    } else {
      next.mediaItems = [];
    }
    delete next.infoMediaUrl;
    delete next.infoMediaType;
    return next;
  };

  static migrateMediaFields(route: RouteData | any): RouteData {
    if (!route || typeof route !== 'object') return route;
    if (!Array.isArray(route.markers)) return route;
    return { ...route, markers: route.markers.map(DataManager.migrateMarkerMediaFields) };
  }

  static sanitizeRouteForExport(route: RouteData | any): RouteData {
    const def = DEFAULT_ROUTE(route?.id);
    return {
      id: typeof route?.id === 'string' ? route.id : def.id,
      title: typeof route?.title === 'string' ? route.title : def.title,
      description: typeof route?.description === 'string' ? route.description : def.description,
      targetCash: typeof route?.targetCash === 'string' ? route.targetCash : def.targetCash,
      targetCoins: typeof route?.targetCoins === 'string' ? route.targetCoins : def.targetCoins,
      targetDuration: typeof route?.targetDuration === 'string' ? route.targetDuration : def.targetDuration,
      author: typeof route?.author === 'string' ? route.author : def.author,
      strokes: route?.strokes && typeof route.strokes === 'object' ? route.strokes : def.strokes,
      walls: route?.walls && typeof route.walls === 'object' ? route.walls : def.walls,
      markers: Array.isArray(route?.markers) ? route.markers.map(DataManager.migrateMarkerMediaFields) : def.markers,
      customBg: route?.customBg && typeof route.customBg === 'object' ? route.customBg : def.customBg,
      bgOffset: route?.bgOffset && typeof route.bgOffset === 'object' ? route.bgOffset : def.bgOffset,
      bgScale: route?.bgScale && typeof route.bgScale === 'object' ? route.bgScale : (def.bgScale ?? { x: 1, y: 1 }),
      createdAt: typeof route?.createdAt === 'number' ? route.createdAt : def.createdAt,
      bossCustomDurations: route?.bossCustomDurations && typeof route.bossCustomDurations === 'object' ? route.bossCustomDurations : def.bossCustomDurations,
      battleCustomDurations: route?.battleCustomDurations && typeof route.battleCustomDurations === 'object' ? route.battleCustomDurations : def.battleCustomDurations,
      pickingCustomDurations: route?.pickingCustomDurations && typeof route.pickingCustomDurations === 'object' ? route.pickingCustomDurations : def.pickingCustomDurations,
      longPickingCustomDurations: route?.longPickingCustomDurations && typeof route.longPickingCustomDurations === 'object' ? route.longPickingCustomDurations : def.longPickingCustomDurations,
      pickyMarkerIds: route?.pickyMarkerIds && typeof route.pickyMarkerIds === 'object' ? route.pickyMarkerIds : (def.pickyMarkerIds || {}),
      mapVersion: typeof route?.mapVersion === 'number' ? route.mapVersion : def.mapVersion,
      markerScale: typeof route?.markerScale === 'number' ? route.markerScale : def.markerScale,
      hiddenMarkers: Array.isArray(route?.hiddenMarkers) ? route.hiddenMarkers : def.hiddenMarkers,
      hiddenMarkerTypes: Array.isArray(route?.hiddenMarkerTypes) ? route.hiddenMarkerTypes : def.hiddenMarkerTypes,
      renderCache: typeof route?.renderCache === 'string' ? route.renderCache : (typeof route?.originalAuthor === 'string' ? route.originalAuthor : def.renderCache),
    };
  }

  static isIndivMarkerType(t: string): boolean {
    return ['start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking',
      'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'].includes(t);
  }

  static exportToJSON(route: RouteData): void {
    const dataStr = JSON.stringify(DataManager.sanitizeRouteForExport(route), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${route.title.replace(/\s+/g, '_')}_route_plan.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async exportToPNG(
    floor: FloorType,
    route: RouteData,
    _svgString: string,
    canvasElement: HTMLCanvasElement | null,
    onComplete: (dataUrl: string) => void,
    skipDataBar?: boolean,
    lineThickness?: number,
    showTimestamp?: boolean
  ): Promise<void> {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1600;
    exportCanvas.height = 4550;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    const bgImg = new Image();
    const drawAll = new Promise<void>((resolveAll) => {
      bgImg.onload = async () => {
        try { await drawAllImpl(); } finally { resolveAll(); }
      };
      bgImg.onerror = () => { resolveAll(); };
    });

    const drawAllImpl = async (): Promise<void> => {
      ctx.drawImage(bgImg, 0, 0, 1600, 4550);

      if (typeof lineThickness === 'number' && lineThickness > 0 && route.strokes?.[floor]) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const thicknessMultiplier = lineThickness / 3;
        for (const stroke of route.strokes[floor]) {
          if (!stroke.points || stroke.points.length < 2) continue;
          const isDashed = stroke.type === 'dashed';
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = Math.max(1, stroke.width * thicknessMultiplier);
          ctx.setLineDash(isDashed ? [8, 6] : []);
          ctx.beginPath();
          stroke.points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
        ctx.setLineDash([]);
      } else if (canvasElement) {
        ctx.drawImage(canvasElement, 0, 0, 1600, 4550);
      }

      const floorMarkers = route.markers.filter(m => m.floor === floor);
      const scaleMultiplier = (route.markerScale || 30) / 30;

      floorMarkers.forEach(m => {
        if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId) {
          const partner = floorMarkers.find(mk => mk.id === m.linkedWarpId);
          if (!partner) return;
          const isMutuallyLinked = partner.linkedWarpId === m.id;
          if (isMutuallyLinked && m.id > partner.id) return;
          const isWarp = m.type === 'warp' || m.type === 'iwarp';
          const color = isWarp ? '#ff00ff' : '#ffaa00';
          const lineWidth = (isWarp ? 2 : 1) * scaleMultiplier;
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.setLineDash(isWarp ? [6 * scaleMultiplier, 4 * scaleMultiplier] : [3 * scaleMultiplier, 3 * scaleMultiplier]);
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          const effectiveWaypoints = m.warpWaypoints && m.warpWaypoints.length > 0
            ? m.warpWaypoints
            : (isMutuallyLinked && partner.warpWaypoints && partner.warpWaypoints.length > 0
                ? [...partner.warpWaypoints].reverse() : []);
          if (effectiveWaypoints.length > 0) {
            effectiveWaypoints.forEach(wp => ctx.lineTo(wp.x, wp.y));
          }
          ctx.lineTo(partner.x, partner.y);
          ctx.stroke();
          const lastPt = effectiveWaypoints.length > 0 ? effectiveWaypoints[effectiveWaypoints.length - 1] : { x: m.x, y: m.y };
          const angle = Math.atan2(partner.y - lastPt.y, partner.x - lastPt.x);
          const headLength = Math.max(lineWidth * 5, 10);
          ctx.fillStyle = color;
          ctx.setLineDash([]);
          ctx.beginPath();
          const arrowOffsetX = partner.x - (isWarp ? 12 : 10) * scaleMultiplier * Math.cos(angle);
          const arrowOffsetY = partner.y - (isWarp ? 12 : 10) * scaleMultiplier * Math.sin(angle);
          ctx.moveTo(arrowOffsetX, arrowOffsetY);
          ctx.lineTo(arrowOffsetX - headLength * Math.cos(angle - Math.PI / 6), arrowOffsetY - headLength * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(arrowOffsetX - headLength * Math.cos(angle + Math.PI / 6), arrowOffsetY - headLength * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
          if (isMutuallyLinked) {
            const firstPt = effectiveWaypoints.length > 0 ? effectiveWaypoints[0] : { x: partner.x, y: partner.y };
            const startAngle = Math.atan2(m.y - firstPt.y, m.x - firstPt.x);
            ctx.beginPath();
            const startArrowOffsetX = m.x - (isWarp ? 12 : 10) * scaleMultiplier * Math.cos(startAngle);
            const startArrowOffsetY = m.y - (isWarp ? 12 : 10) * scaleMultiplier * Math.sin(startAngle);
            ctx.moveTo(startArrowOffsetX, startArrowOffsetY);
            ctx.lineTo(startArrowOffsetX - headLength * Math.cos(startAngle - Math.PI / 6), startArrowOffsetY - headLength * Math.sin(startAngle - Math.PI / 6));
            ctx.lineTo(startArrowOffsetX - headLength * Math.cos(startAngle + Math.PI / 6), startArrowOffsetY - headLength * Math.sin(startAngle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
          }
        }
      });
      ctx.setLineDash([]);

      floorMarkers.forEach(m => {
        const meta = MARKER_META[m.type];
        const isText = m.type === 'text';
        const isLargePin = m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs';
        const isSkillCd = m.type === 'skill_cd';
        const skillColor = isSkillCd ? getSkillCdColor(m) : meta.color;
        const skillIcon = isSkillCd ? getSkillCdIcon(m) : null;
        if (isText) {
          const tx = m.fixedOriginX ?? m.x;
          const ty = m.fixedOriginY ?? m.y;
          const s = m.textScaleWithMap ? scaleMultiplier : 1;
          ctx.fillStyle = m.textColor || '#ffffff';
          const fs = Math.round((m.textSize || 14) * s);
          ctx.font = `bold ${fs}px Rajdhani, Orbitron, Arial`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          const note = m.note || 'Text';
          const lines = note.split('\n');
          const lineH = Math.round(fs * 1.2);
          lines.forEach((line, li) => { ctx.fillText(line, tx - 5, ty - 5 + li * lineH); });
          ctx.shadowBlur = 0;
          return;
        }
        const radius = (isLargePin ? 9 : 8) * scaleMultiplier;
        const fontSize = (isLargePin ? 10 : 9) * scaleMultiplier;
        ctx.shadowColor = skillColor;
        ctx.shadowBlur = (isLargePin ? 8 : 6) * scaleMultiplier;
        ctx.fillStyle = 'rgba(10, 15, 28, 0.85)';
        ctx.strokeStyle = skillColor;
        ctx.lineWidth = 1.5 * scaleMultiplier;
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (m.type === 'eh' && m.ehHighRate) {
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5 * scaleMultiplier;
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 5 * scaleMultiplier;
          ctx.beginPath();
          ctx.arc(m.x, m.y, radius + 4 * scaleMultiplier, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (m.type === 'cardkey' && m.cardkeyHighRate) {
          ctx.strokeStyle = '#39ff14';
          ctx.lineWidth = 1.5 * scaleMultiplier;
          ctx.shadowColor = '#39ff14';
          ctx.shadowBlur = 5 * scaleMultiplier;
          ctx.beginPath();
          ctx.arc(m.x, m.y, radius + 4 * scaleMultiplier, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px Segoe UI Symbol, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(skillIcon ?? meta.emoji, m.x, m.y);
      });

      const GAP = 30;
      const HEADER_H = 180;
      const DATA_PAD = 10;
      const TARGET_EXTH = 1080;
      const MAP_H = TARGET_EXTH - HEADER_H - DATA_PAD;
      const MAP_W = Math.round(MAP_H * 1600 / 2275);
      const EXTW = MAP_W * 2 + GAP;
      const EXTH = HEADER_H + MAP_H + DATA_PAD;

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = EXTW;
      finalCanvas.height = EXTH;
      const fctx = finalCanvas.getContext('2d');
      if (!fctx) return;

      fctx.fillStyle = '#05070a';
      fctx.fillRect(0, 0, EXTW, EXTH);
      fctx.drawImage(exportCanvas, 0, 2275, 1600, 2275, 0, HEADER_H, MAP_W, MAP_H);
      fctx.drawImage(exportCanvas, 0, 0, 1600, 2275, MAP_W + GAP, HEADER_H, MAP_W, MAP_H);

      fctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.moveTo(MAP_W + GAP / 2, HEADER_H);
      fctx.lineTo(MAP_W + GAP / 2, EXTH - DATA_PAD);
      fctx.stroke();

      fctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      fctx.font = '12px Rajdhani, Orbitron, Arial';
      fctx.textAlign = 'center';
      fctx.fillText('▼ TOP', MAP_W + GAP / 2, HEADER_H + 18);
      fctx.fillText('▲ BOTTOM', MAP_W + GAP / 2, EXTH - DATA_PAD - 18);

      fctx.fillStyle = 'rgba(5, 7, 10, 0.94)';
      fctx.fillRect(0, 0, EXTW, HEADER_H);
      fctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
      fctx.lineWidth = 4;
      fctx.shadowColor = 'rgba(0,240,255,0.6)';
      fctx.shadowBlur = 14;
      fctx.beginPath();
      fctx.moveTo(0, HEADER_H);
      fctx.lineTo(EXTW, HEADER_H);
      fctx.stroke();
      fctx.shadowBlur = 0;

      fctx.fillStyle = '#00f0ff';
      fctx.font = 'bold 40px Rajdhani, Orbitron, Arial';
      fctx.textAlign = 'left';
      fctx.textBaseline = 'top';
      fctx.shadowColor = 'rgba(0,240,255,0.6)';
      fctx.shadowBlur = 12;
      fctx.fillText(route.title || 'UNTITLED PLAN', 20, 16);
      fctx.shadowBlur = 0;

      const versionLabel = `v${route.saveDataVersion || APP_VERSION}`;
      fctx.font = 'bold 16px Rajdhani, Orbitron, Arial';
      const vPadX = 12;
      const vTextW = fctx.measureText(versionLabel).width;
      const vBoxW = vTextW + vPadX * 2;
      const vBoxH = 28;
      const vBoxX = EXTW - vBoxW - 16;
      const vBoxY = 16;
      fctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      fctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
      fctx.lineWidth = 1.5;
      fctx.beginPath();
      fctx.rect(vBoxX, vBoxY, vBoxW, vBoxH);
      fctx.fill();
      fctx.stroke();
      fctx.fillStyle = '#00f0ff';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.shadowColor = 'rgba(0,240,255,0.5)';
      fctx.shadowBlur = 6;
      fctx.fillText(versionLabel, vBoxX + vBoxW / 2, vBoxY + vBoxH / 2);
      fctx.shadowBlur = 0;
      fctx.textAlign = 'left';
      fctx.textBaseline = 'top';

      if (showTimestamp) {
        const now = new Date();
        const tsLabel = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        fctx.font = '13px Rajdhani, Orbitron, Arial';
        const tsPadX = 8;
        const tsTextW = fctx.measureText(tsLabel).width;
        const tsBoxW = tsTextW + tsPadX * 2;
        const tsBoxH = 22;
        const tsBoxX = EXTW - tsBoxW - 16;
        const tsBoxY = vBoxY + vBoxH + 6;
        fctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
        fctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
        fctx.lineWidth = 1;
        fctx.beginPath();
        fctx.rect(tsBoxX, tsBoxY, tsBoxW, tsBoxH);
        fctx.fill();
        fctx.stroke();
        fctx.fillStyle = '#ffd700';
        fctx.textAlign = 'center';
        fctx.textBaseline = 'middle';
        fctx.fillText(tsLabel, tsBoxX + tsBoxW / 2, tsBoxY + tsBoxH / 2);
        fctx.textAlign = 'left';
        fctx.textBaseline = 'top';
      }

      const toNum = (s: string | undefined | null) => {
        const cleaned = (s || '').replace(/,/g, '');
        return cleaned && !isNaN(parseInt(cleaned)) ? parseInt(cleaned) : 0;
      };
      const cashNum = toNum(route.targetCash);
      const coinNum = toNum(route.targetCoins);
      const fmtCash = (route.targetCash && cashNum > 0) ? cashNum.toLocaleString() : (route.targetCash || '-');
      const fmtCoin = (route.targetCoins && coinNum > 0) ? coinNum.toLocaleString() : (route.targetCoins || '-');
      fctx.fillStyle = '#ffd700';
      fctx.font = 'bold 26px Rajdhani, Orbitron, Arial';
      fctx.shadowColor = 'rgba(255,215,0,0.4)';
      fctx.shadowBlur = 6;
      fctx.fillText(`目標値: ${fmtCash} ファンス  /  ${fmtCoin} コイン`, 20, 70);
      fctx.shadowBlur = 0;

      const durSec = parseInt(route.targetDuration || '');
      const durStr = !isNaN(durSec) && durSec > 0
        ? ` / 所要時間 ${String(Math.floor(durSec / 60)).padStart(2, '0')}:${String(durSec % 60).padStart(2, '0')}`
        : '';
      if (durStr) {
        fctx.fillStyle = '#ffd700';
        fctx.fillText(durStr, fctx.measureText(`目標値: ${fmtCash} ファンス  /  ${fmtCoin} コイン`).width + 26, 70);
      }

      const author = route.author || '';
      let originalAuthor = '';
      let showOriginal = false;
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1')) {
        originalAuthor = await aesGcmDecrypt(route.renderCache || '', getOriginalAuthorKey(route.id, route.createdAt));
        showOriginal = !!originalAuthor && originalAuthor !== author && originalAuthor !== AUTHOR_TAMPERED;
      }
      fctx.font = 'bold 18px Rajdhani, Orbitron, Arial';
      fctx.fillStyle = '#ffffff';
      let ax = 20;
      if (author) {
        fctx.fillText(`作者: ${author}`, ax, 115);
        ax += fctx.measureText(`作者: ${author}`).width + 16;
      }
      if (showOriginal) {
        fctx.fillStyle = '#a0a0a0';
        fctx.fillText(`原作者: ${originalAuthor}`, ax, 115);
      }

      let dataUrl: string;
      if (!skipDataBar) {
        const sanitized = DataManager.sanitizeRouteForExport(route);
        const compressed: any = { ...sanitized, _v: 2 };
        for (const floorKey of Object.keys(sanitized.strokes) as FloorType[]) {
          compressed.strokes = { ...compressed.strokes, [floorKey]: compressStrokes(sanitized.strokes[floorKey]) };
        }
        const jsonStr = JSON.stringify(compressed);
        const dataBytes = new TextEncoder().encode(jsonStr);
        const MAGIC = [0x4E, 0x4B, 0x4E, 0x59];
        const HEADER_SIZE = 8 + 4 + 4;
        const dataRows = Math.ceil((HEADER_SIZE + dataBytes.length + 8) / EXTW);
        const dataBarHeight = Math.max(dataRows, 2);

        const finalH = EXTH + dataBarHeight;
        const finalCanvas2 = document.createElement('canvas');
        finalCanvas2.width = EXTW;
        finalCanvas2.height = finalH;
        const fctx2 = finalCanvas2.getContext('2d');
        if (!fctx2) return;

        fctx2.drawImage(finalCanvas, 0, 0);
        const allBytes = new Uint8Array(HEADER_SIZE + dataBytes.length + 8);
        for (let j = 0; j < 8; j++) { allBytes[j] = 0xFF; }
        for (let j = 0; j < 4; j++) { allBytes[8 + j] = MAGIC[j]; }
        const len = dataBytes.length;
        allBytes[12] = (len >> 24) & 0xff;
        allBytes[13] = (len >> 16) & 0xff;
        allBytes[14] = (len >> 8) & 0xff;
        allBytes[15] = len & 0xff;
        allBytes.set(dataBytes, HEADER_SIZE);
        for (let j = 0; j < 8; j++) { allBytes[HEADER_SIZE + dataBytes.length + j] = 0xFF; }

        const imgData = fctx2.createImageData(EXTW, dataBarHeight);
        for (let i = 0; i < allBytes.length; i++) {
          const px = i % EXTW;
          const row = Math.floor(i / EXTW);
          const idx = (row * EXTW + px) * 4;
          const isMarker = (allBytes[i] === 0xFF && i < 8) || i >= HEADER_SIZE + dataBytes.length;
          imgData.data[idx] = isMarker ? 255 : 0;
          imgData.data[idx + 1] = isMarker ? 0 : allBytes[i];
          imgData.data[idx + 2] = isMarker ? 255 : 0;
          imgData.data[idx + 3] = 255;
        }
        fctx2.putImageData(imgData, 0, EXTH);
        dataUrl = finalCanvas2.toDataURL('image/png');
      } else {
        dataUrl = finalCanvas.toDataURL('image/png');
      }

      const decAuthor = route.author || '';
      const routeJson = JSON.stringify(DataManager.sanitizeRouteForExport(route));
      dataUrl = insertPngMetadata(dataUrl, {
        Title: route.title || '',
        Description: route.description || '',
        Author: decAuthor,
        TargetCash: route.targetCash || '',
        TargetCoins: route.targetCoins || '',
        TargetDuration: route.targetDuration || '',
        CreatedAt: String(route.createdAt || ''),
        RouteData: routeJson
      });
      onComplete(dataUrl);
    };

    if (route.customBg[floor]) {
      bgImg.src = route.customBg[floor] as string;
    } else {
      const preset = PRESET_MAPS_META[floor];
      if (preset.path) {
        bgImg.src = preset.path;
      } else {
        bgImg.src = `${import.meta.env.BASE_URL}nikukyu_map.webp`;
      }
    }
    await drawAll;
  }

  static async decodePngData(image: HTMLImageElement, rawBuffer?: ArrayBuffer): Promise<{ data: RouteData; source: 'dataBar' | 'metadata' } | null> {
    const fromBar = await DataManager.decodePngDataBar(image);
    if (fromBar) return { data: fromBar, source: 'dataBar' };

    try {
      let buf = rawBuffer;
      if (!buf) {
        const src = image.src;
        if (src && (src.startsWith('data:image/png') || src.startsWith('blob:'))) {
          const resp = await fetch(src);
          buf = await resp.arrayBuffer();
        }
      }
      if (buf) {
        const meta = extractPngMetadata(buf);
        if (meta.RouteData) {
          const parsed = JSON.parse(meta.RouteData);
          if (parsed && parsed.id && typeof parsed.title === 'string') {
            if (parsed._v === 2 && parsed.strokes && typeof parsed.strokes === 'object') {
              for (const floorKey of Object.keys(parsed.strokes)) {
                const val = parsed.strokes[floorKey];
                if (Array.isArray(val) && val.length > 0 && val[0].p && Array.isArray(val[0].p)) {
                  parsed.strokes[floorKey] = decompressStrokes(val);
                }
              }
              delete parsed._v;
            }
            return { data: parsed as RouteData, source: 'metadata' };
          }
        }
      }
    } catch { /* ignore metadata fallback errors */ }
    return null;
  }

  private static decodePngDataBar(image: HTMLImageElement): Promise<RouteData | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(image, 0, 0, w, h, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const pixels = imgData.data;

      const tryDecode = (markerStart: number): RouteData | null => {
        const afterMarker = markerStart + 32;
        const rMagic = [pixels[afterMarker + 1], pixels[afterMarker + 5], pixels[afterMarker + 9], pixels[afterMarker + 13]];
        if (rMagic[0] !== 0x4E || rMagic[1] !== 0x4B || rMagic[2] !== 0x4E || rMagic[3] !== 0x59) return null;
        const afterMagic = afterMarker + 16;
        const lenG = [pixels[afterMagic + 1], pixels[afterMagic + 5], pixels[afterMagic + 9], pixels[afterMagic + 13]];
        const view = new DataView(new Uint8Array(lenG).buffer);
        const dataLen = view.getUint32(0, false);
        if (dataLen === 0 || dataLen > 50_000_000) return null;
        const afterLen = afterMagic + 16;
        const dataBytes = new Uint8Array(dataLen);
        let read = 0;
        for (let i = 0; i < dataLen; i++) {
          const pixelOffset = afterLen + i * 4 + 1;
          if (pixelOffset >= pixels.length) break;
          dataBytes[i] = pixels[pixelOffset];
          read = i + 1;
        }
        if (read < dataLen) return null;
        try {
          const jsonStr = new TextDecoder().decode(dataBytes);
          const clean = jsonStr.replace(/\0+$/, '');
          const parsed = JSON.parse(clean);
          if (parsed && parsed.id && typeof parsed.title === 'string') {
            if (parsed._v === 2 && parsed.strokes && typeof parsed.strokes === 'object') {
              for (const floorKey of Object.keys(parsed.strokes)) {
                const val = parsed.strokes[floorKey];
                if (Array.isArray(val) && val.length > 0 && val[0].p && Array.isArray(val[0].p)) {
                  parsed.strokes[floorKey] = decompressStrokes(val);
                }
              }
              delete parsed._v;
            }
            return parsed as RouteData;
          }
          return null;
        } catch { return null; }
      };

      const isMagenta = (i: number): boolean => pixels[i] > 200 && pixels[i + 1] < 50 && pixels[i + 2] > 200;

      const findMagentaRuns = (startIdx: number, endIdx: number): number[] => {
        const runs: number[] = [];
        for (let i = startIdx; i < endIdx - 16; i += 4) {
          if (isMagenta(i)) {
            let count = 1;
            for (let j = 1; j < 8 && i + j * 4 < endIdx; j++) {
              if (isMagenta(i + j * 4)) count++;
              else break;
            }
            if (count >= 4) { runs.push(i); i += count * 4; }
          }
        }
        return runs;
      };

      const bottomRows = Math.min(Math.max(200, Math.ceil(h * 0.1)), h);
      const bottomStartIdx = (h - bottomRows) * w * 4;

      for (const runStart of findMagentaRuns(bottomStartIdx, pixels.length)) {
        const result = tryDecode(runStart);
        if (result) { resolve(result); return; }
      }
      for (const runStart of findMagentaRuns(0, pixels.length)) {
        if (runStart >= bottomStartIdx) break;
        const result = tryDecode(runStart);
        if (result) { resolve(result); return; }
      }
      resolve(null);
    });
  }
}
