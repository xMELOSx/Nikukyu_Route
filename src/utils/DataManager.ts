export type FloorType = 'main';

export type MarkerType = 'goal' | 'cardkey' | 'eh' | 'rare' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking' | 'iwarp' | 'text' | 'iinfo' | 'inote' | 'itext';

// Simple XOR cipher for author name obfuscation
export function xorEncrypt(plain: string, key: string): string {
  if (!plain) return '';
  let result = '';
  for (let i = 0; i < plain.length; i++) {
    result += String.fromCharCode(plain.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

export function xorDecrypt(encoded: string, key: string): string {
  if (!encoded) return '';
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return encoded;
  }
}

export const AUTHOR_KEY = 'Fans';
export const ORIGINAL_AUTHOR_KEY = 'Colins';

function deriveKey(baseKey: string, routeId: string, createdAt: number): string {
  return baseKey + '|' + routeId + '|' + String(createdAt);
}

export function getAuthorKey(routeId: string, createdAt: number): string {
  return deriveKey(AUTHOR_KEY, routeId, createdAt);
}

export function getOriginalAuthorKey(routeId: string, createdAt: number): string {
  return deriveKey(ORIGINAL_AUTHOR_KEY, routeId, createdAt);
}

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: Point[];
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'arrow';
}

export interface ScrollConfig {
  x: number;
  y: number;
  zoom: number;
}

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'webm' | 'x-embed' | 'youtube';
  description?: string;
}

export interface HeistMarker {
  id: string;
  type: MarkerType;
  x: number; // 0-800 coordinate
  y: number; // 0-2275 coordinate
  note: string;
  floor: FloorType;
  scrollConfig?: ScrollConfig; // Scroll coordinates configuration
  linkedWarpId?: string; // For warp pairs: ID of the linked warp marker
  phoneActive?: boolean;  // For phone markers: true = 📞 (active), false/undefined = ☎ (inactive)
  phoneLocked?: boolean;  // For phone markers: always active, not affected by reset/toggle
  infoMediaUrl?: string;  // For info markers: URL to image, webm or X post
  infoMediaType?: 'image' | 'webm' | 'x-embed' | 'youtube'; // For info markers: type of media
  infoExpanded?: boolean; // For info markers: whether details are expanded in presentation mode
  noteExpanded?: boolean; // For note markers: whether popup is expanded in presentation mode
  infoLabel?: string;     // For info markers: short label displayed under the pin
  bossDrops?: string[];   // For boss markers: list of drop items
  bossDurationSeconds?: number; // For boss markers: duration in seconds
  bossExpanded?: boolean; // For boss markers: whether details are expanded in presentation mode
  battleDurationSeconds?: number; // For battle markers: duration in seconds
  battleExpanded?: boolean; // For battle markers: whether details are expanded in presentation mode
  popupDirection?: 'top' | 'bottom' | 'left' | 'right'; // Direction of detail popup
  popupWidth?: number;    // Width of detail popup in pixels
  popupHeight?: number;   // Height of detail popup in pixels (0 or undefined = auto)
  popupOffset?: { x: number; y: number }; // Offset position from pin center
  pickingDurationSeconds?: number; // For picking markers: duration in seconds
  longPickingDurationSeconds?: number; // For long picking markers: duration in seconds
  pickingPicky?: boolean;  // For picking/long_picking markers: true = Picky (0s)
  pickingExpanded?: boolean; // For picking markers: whether details are expanded in presentation mode
  ehHighRate?: boolean;   // For EH markers: true = high appearance rate highlighted glow
  cardkeyHighRate?: boolean; // For Card Key markers: true = high appearance rate highlighted glow
  warpWaypoints?: Point[]; // For warp/stairs markers: custom path waypoints
  textColor?: string;     // For text markers: color of the text
  textSize?: number;      // For text markers: font size in px
  textScaleWithMap?: boolean; // For text markers: scale size with map zoom
  textFixedPosition?: boolean; // For text markers: fixed to viewport, not affected by pan/zoom
  fixedOriginX?: number;      // For text markers: original map X before fixing to viewport
  fixedOriginY?: number;      // For text markers: original map Y before fixing to viewport
  trackSide?: 'left' | 'right'; // For fixed text markers: which sidebar side to track for collapse shift
  textDescription?: string;   // For text markers: description text shown below label
  textTooltip?: boolean;      // For text markers: show mouseover tooltip
  textGlow?: boolean;         // For text markers: show glow effect
  mediaItems?: MediaItem[]; // For info/eh/boss/battle markers: multiple media attachments
}

export interface RouteData {
  id: string;
  title: string;
  description: string;
  targetCash: string;
  targetCoins: string;
  targetDuration: string; // Target duration in seconds (0-720)
  author: string;
  originalAuthor: string; // XOR-encrypted with key 'Colins'
  strokes: { [key in FloorType]: DrawingStroke[] };
  markers: HeistMarker[];
  customBg: { [key in FloorType]: string | null }; // base64 images
  createdAt: number;
  bossCustomDurations?: { [markerId: string]: number }; // Plan-specific override for boss timers
  battleCustomDurations?: { [markerId: string]: number }; // Plan-specific override for battle timers
  pickingCustomDurations?: { [markerId: string]: number }; // Plan-specific override for picking timers
  longPickingCustomDurations?: { [markerId: string]: number }; // Plan-specific override for long picking timers
  mapVersion?: number; // Version of map coordinate scale (e.g. 2 = 3200x9100)
  markerScale?: number; // Optional scale of markers (e.g. 30 = 100%)
  hiddenMarkers?: string[]; // Global markers hidden in this specific plan
  hiddenMarkerTypes?: string[]; // Marker types hidden in this plan (e.g. ['eh', 'boss'])
}

export const DEFAULT_ROUTE = (id: string = 'default'): RouteData => ({
  id,
  title: 'NEW HEIST ROUTE PLAN',
  description: 'Plan description here...',
  targetCash: '100,000',
  targetCoins: '500',
  targetDuration: '',
  author: '',
  originalAuthor: '',
  strokes: {
    main: []
  },
  markers: [],
  customBg: {
    main: null
  },
  bossCustomDurations: {},
  battleCustomDurations: {},
  pickingCustomDurations: {},
  longPickingCustomDurations: {},
  hiddenMarkers: [],
  hiddenMarkerTypes: [],
  createdAt: Date.now(),
  mapVersion: 2
});

export interface PresetData {
  id: string;
  name: string;
  description: string;
  targetCash: string;
  targetCoins: string;
  author: string;
  originalAuthor: string;
  updatedAt: number;
  routeData: RouteData;
}

// Marker Metadata helper for styling and emoji representation
export const MARKER_META: { [key in MarkerType]: { emoji: string; label: string; color: string } } = {
  goal: { emoji: '🏁', label: 'ESCAPE AREA', color: '#39ff14' },
  cardkey: { emoji: '💳', label: 'CARD KEY', color: '#39ff14' },
  eh: { emoji: '💎', label: 'EH', color: '#00f0ff' },
  rare: { emoji: '💴', label: 'RARE', color: '#ffd700' },
  vault: { emoji: '💰', label: 'MDP', color: '#ffe600' },
  boss: { emoji: '😈', label: 'BOSS (MAMON)', color: '#ff0055' },
  phone: { emoji: '☎', label: 'ESCAPE PHONE', color: '#ff00ff' },
  note: { emoji: '📌', label: 'MEMO', color: '#64748b' },
  room: { emoji: '🚪', label: 'ROOM / ZONE', color: '#00f0ff' },
  warp: { emoji: '🌀', label: 'WARP POINT', color: '#ff00ff' },
  stairs: { emoji: '🪜', label: 'STAIRS', color: '#ffaa00' },
  battle: { emoji: '⚔', label: 'BATTLE', color: '#ff0055' },
  picking: { emoji: '🔑', label: 'PICKING', color: '#ffe600' },
  long_picking: { emoji: '🔐', label: 'L-PICKING', color: '#ffaa00' },
  p1: { emoji: '1', label: 'PIN 1', color: '#00f0ff' },
  p2: { emoji: '2', label: 'PIN 2', color: '#ffe600' },
  p3: { emoji: '3', label: 'PIN 3', color: '#ff00ff' },
  info: { emoji: 'ⓘ', label: 'INFO PIN', color: '#4fc3f7' },
  gbattle: { emoji: '⚔', label: 'BATTLE (GLOBAL)', color: '#ff0055' },
  gpicking: { emoji: '🔑', label: 'PICKING (GLOBAL)', color: '#ffe600' },
  glong_picking: { emoji: '🔐', label: 'L-PICKING (GLOBAL)', color: '#ffaa00' },
  iwarp: { emoji: '🌀', label: 'I-WARP', color: '#ff00ff' },
  text: { emoji: 'T', label: 'TEXT', color: '#ffffff' },
  iinfo: { emoji: 'ⓘ', label: 'I-INFO', color: '#4fc3f7' },
  inote: { emoji: '📝', label: 'I-MEMO', color: '#39ff14' },
  itext: { emoji: 'T', label: 'I-TEXT', color: '#ffffff' }
};

// Preset Maps metadata with local paths
export const PRESET_MAPS_META: { [key in FloorType]: { path: string | null; label: string } } = {
  main: { path: `${import.meta.env.BASE_URL}nikukyu_map.webp`, label: 'にくきゅうまっぷ' }
};

export class DataManager {
  // Save route to localStorage
  static saveToLocalStorage(route: RouteData): void {
    const saves = this.getSavesList();
    const index = saves.findIndex(s => s.id === route.id);
    const entry = {
      id: route.id,
      title: route.title,
      targetCash: route.targetCash || '',
      targetCoins: route.targetCoins || '',
      description: route.description || '',
      author: route.author || '',
      originalAuthor: route.originalAuthor || '',
      createdAt: route.createdAt,
      updatedAt: Date.now()
    };
    if (index >= 0) {
      saves[index] = entry;
    } else {
      saves.push(entry);
    }
    
    localStorage.setItem(`heist_route_${route.id}`, JSON.stringify(route));
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  // Get list of saved routes
  static getSavesList(): { id: string; title: string; targetCash: string; targetCoins: string; description: string; author: string; originalAuthor: string; createdAt: number; updatedAt: number }[] {
    const listStr = localStorage.getItem('heist_routes_list');
    return listStr ? JSON.parse(listStr) : [];
  }

  // Load route from localStorage
  static loadFromLocalStorage(id: string): RouteData | null {
    const dataStr = localStorage.getItem(`heist_route_${id}`);
    return dataStr ? JSON.parse(dataStr) : null;
  }

  // Delete route from localStorage
  static deleteFromLocalStorage(id: string): void {
    localStorage.removeItem(`heist_route_${id}`);
    const saves = this.getSavesList().filter(s => s.id !== id);
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  // Export route to JSON file
  static exportToJSON(route: RouteData): void {
    const dataStr = JSON.stringify(route, null, 2);
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

  // Export merged map to PNG
  static exportToPNG(
    floor: FloorType,
    route: RouteData,
    _svgString: string,
    canvasElement: HTMLCanvasElement | null,
    onComplete: (dataUrl: string) => void
  ): void {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1600;
    exportCanvas.height = 4550;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Draw Background Map
    const bgImg = new Image();
    
    bgImg.onload = () => {
      ctx.drawImage(bgImg, 0, 0, 1600, 4550);
      
      // Draw Stroke Lines
      if (canvasElement) {
        ctx.drawImage(canvasElement, 0, 0, 1600, 4550);
      }
      
      // Draw Markers and connection lines on full canvas
      const floorMarkers = route.markers.filter(m => m.floor === floor);
      const scaleMultiplier = (route.markerScale || 30) / 30;

      // Draw Warp & Stairs connection lines
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
                ? [...partner.warpWaypoints].reverse()
                : []);
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

      // Draw marker icons and text on full canvas
      floorMarkers.forEach(m => {
        const meta = MARKER_META[m.type];
        const isText = m.type === 'text';
        const isLargePin = m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs';
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
          lines.forEach((line, li) => {
            ctx.fillText(line, tx - 5, ty - 5 + li * lineH);
          });
          ctx.shadowBlur = 0;
          return;
        }
        const radius = (isLargePin ? 9 : 8) * scaleMultiplier;
        const fontSize = (isLargePin ? 10 : 9) * scaleMultiplier;
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = (isLargePin ? 8 : 6) * scaleMultiplier;
        ctx.fillStyle = 'rgba(10, 15, 28, 0.85)';
        ctx.strokeStyle = meta.color;
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
        ctx.fillText(meta.emoji, m.x, m.y);
      });

      // Create split layout: bottom half (left) + top half (right), fit within 1080px height
      const GAP = 30;
      const HEADER_H = 180;
      const DATA_PAD = 10;
      // Calculate MAP_W to fit TARGET_EXTH
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

      // Bottom half on left, top half on right
      fctx.drawImage(exportCanvas, 0, 2275, 1600, 2275, 0, HEADER_H, MAP_W, MAP_H);
      fctx.drawImage(exportCanvas, 0, 0, 1600, 2275, MAP_W + GAP, HEADER_H, MAP_W, MAP_H);

      // Divider
      fctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.moveTo(MAP_W + GAP / 2, HEADER_H);
      fctx.lineTo(MAP_W + GAP / 2, EXTH - DATA_PAD);
      fctx.stroke();

      // Separator labels
      fctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      fctx.font = '12px Rajdhani, Orbitron, Arial';
      fctx.textAlign = 'center';
      fctx.fillText('▼ TOP', MAP_W + GAP / 2, HEADER_H + 18);
      fctx.fillText('▲ BOTTOM', MAP_W + GAP / 2, EXTH - DATA_PAD - 18);

      // Draw header text overlay — prominent plan info
      fctx.fillStyle = 'rgba(5, 7, 10, 0.94)';
      fctx.fillRect(0, 0, EXTW, HEADER_H);

      // Glow border
      fctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
      fctx.lineWidth = 4;
      fctx.shadowColor = 'rgba(0,240,255,0.6)';
      fctx.shadowBlur = 14;
      fctx.beginPath();
      fctx.moveTo(0, HEADER_H);
      fctx.lineTo(EXTW, HEADER_H);
      fctx.stroke();
      fctx.shadowBlur = 0;

      // Title
      fctx.fillStyle = '#00f0ff';
      fctx.font = 'bold 40px Rajdhani, Orbitron, Arial';
      fctx.textAlign = 'left';
      fctx.textBaseline = 'top';
      fctx.shadowColor = 'rgba(0,240,255,0.6)';
      fctx.shadowBlur = 12;
      fctx.fillText(route.title || 'UNTITLED PLAN', 20, 16);
      fctx.shadowBlur = 0;

      // Target values
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
      // Duration
      const durSec = parseInt(route.targetDuration || '');
      const durStr = !isNaN(durSec) && durSec > 0
        ? ` / 所要時間 ${String(Math.floor(durSec / 60)).padStart(2, '0')}:${String(durSec % 60).padStart(2, '0')}`
        : '';
      if (durStr) {
        fctx.fillStyle = '#ffd700';
        fctx.fillText(durStr, fctx.measureText(`目標値: ${fmtCash} ファンス  /  ${fmtCoin} コイン`).width + 26, 70);
      }

      // Author info
      const author = xorDecrypt(route.author || '', getAuthorKey(route.id, route.createdAt));
      const originalAuthor = xorDecrypt(route.originalAuthor || '', getOriginalAuthorKey(route.id, route.createdAt));
      const showOriginal = originalAuthor && originalAuthor !== author;
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

      // Draw pixel-encoded JSON data bar at bottom
      // Format: [8 magenta pixels][4 magic N-K-N-Y][4 length BE][JSON data][8 magenta end]
      const jsonStr = JSON.stringify(route);
      const dataBytes = new TextEncoder().encode(jsonStr);
      const MAGIC = [0x4E, 0x4B, 0x4E, 0x59]; // "N K N Y"
      const HEADER_SIZE = 8 + 4 + 4; // 8 marker + 4 magic + 4 length
      const dataRows = Math.ceil((HEADER_SIZE + dataBytes.length + 8) / EXTW);
      const dataBarHeight = Math.max(dataRows, 2);
      const dataBarY = EXTH - dataBarHeight;
      
      const allBytes = new Uint8Array(HEADER_SIZE + dataBytes.length + 8);
      // Start marker: 8 magenta pixels
      for (let j = 0; j < 8; j++) { allBytes[j] = 0xFF; }
      // Magic
      for (let j = 0; j < 4; j++) { allBytes[8 + j] = MAGIC[j]; }
      // Length (big-endian)
      const len = dataBytes.length;
      allBytes[12] = (len >> 24) & 0xff;
      allBytes[13] = (len >> 16) & 0xff;
      allBytes[14] = (len >> 8) & 0xff;
      allBytes[15] = len & 0xff;
      // Data
      allBytes.set(dataBytes, HEADER_SIZE);
      // End marker: 8 magenta pixels
      for (let j = 0; j < 8; j++) { allBytes[HEADER_SIZE + dataBytes.length + j] = 0xFF; }
      
      const imgData = fctx.getImageData(0, dataBarY, EXTW, dataBarHeight);
      for (let i = 0; i < allBytes.length; i++) {
        const px = i % EXTW;
        const row = Math.floor(i / EXTW);
        const idx = (row * EXTW + px) * 4;
        const isMarker = allBytes[i] === 0xFF && i < 8 || i >= HEADER_SIZE + dataBytes.length;
        imgData.data[idx] = isMarker ? 255 : 0;     // R: marker=255, data=0
        imgData.data[idx + 1] = isMarker ? 0 : allBytes[i]; // G: marker=0, data=byte value
        imgData.data[idx + 2] = isMarker ? 255 : 0; // B: marker=255, data=0
        imgData.data[idx + 3] = 255;
      }
      fctx.putImageData(imgData, 0, dataBarY);

      const dataUrl = finalCanvas.toDataURL('image/png');
      onComplete(dataUrl);
    };

    // Set source for background image
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
  }

  // Decode pixel-encoded JSON from a PNG image
  static decodePngData(image: HTMLImageElement): Promise<RouteData | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const maxDataRows = 40;
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      canvas.width = w;
      canvas.height = maxDataRows;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(image, 0, h - maxDataRows, w, maxDataRows, 0, 0, w, maxDataRows);
      const imgData = ctx.getImageData(0, 0, w, maxDataRows);
      const pixels = imgData.data;
      
      // Scan for magenta marker (R=255, B=255 in same pixel, G≈0)
      // We look for 4 consecutive magenta pixels
      let markerStart = -1;
      for (let i = 0; i < pixels.length - 16; i += 4) {
        if (pixels[i] > 200 && pixels[i+1] < 50 && pixels[i+2] > 200) {
          // Check 4 consecutive magenta pixels
          let count = 1;
          for (let j = 1; j < 4 && i + j*4 < pixels.length; j++) {
            if (pixels[i+j*4] > 200 && pixels[i+j*4+1] < 50 && pixels[i+j*4+2] > 200) count++;
            else break;
          }
          if (count >= 4) { markerStart = i; break; }
        }
      }
      if (markerStart < 0) { resolve(null); return; }
      
      // Skip 8 marker pixels (32 bytes in pixel data)
      const afterMarker = markerStart + 32;
      
      // Read magic "N K N Y" from G channel
      const rMagic = [];
      for (let j = 0; j < 4; j++) rMagic.push(pixels[afterMarker + j*4 + 1]);
      if (rMagic[0] !== 0x4E || rMagic[1] !== 0x4B || rMagic[2] !== 0x4E || rMagic[3] !== 0x59) {
        resolve(null); return;
      }
      
      // Read 4-byte length (big-endian) from G channel
      const afterMagic = afterMarker + 16; // 4 magic bytes = 16 pixel bytes
      const lenG = [pixels[afterMagic+1], pixels[afterMagic+5], pixels[afterMagic+9], pixels[afterMagic+13]];
      const view = new DataView(new Uint8Array(lenG).buffer);
      const dataLen = view.getUint32(0, false);
      if (dataLen === 0 || dataLen > 500000) { resolve(null); return; }
      
      // Read data from G channel
      const afterLen = afterMagic + 16; // 4 length bytes = 16 pixel bytes
      const dataBytes = new Uint8Array(dataLen);
      for (let i = 0; i < dataLen; i++) {
        const pixelOffset = afterLen + i * 4 + 1; // +1 for G channel
        if (pixelOffset >= pixels.length) break;
        dataBytes[i] = pixels[pixelOffset];
      }
      
      try {
        const jsonStr = new TextDecoder().decode(dataBytes);
        const clean = jsonStr.replace(/\0+$/, '');
        const parsed = JSON.parse(clean);
        if (parsed && parsed.id && typeof parsed.title === 'string') {
          resolve(parsed as RouteData);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  }
}
