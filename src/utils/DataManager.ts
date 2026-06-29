export function generateId(prefix: string = ''): string {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export type FloorType = 'main';

export type MarkerType = 'goal' | 'cardkey' | 'eh' | 'rare' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking' | 'iwarp' | 'text' | 'iinfo' | 'inote' | 'itext' | 'start' | 'checkpoint' | 'skill_cd';

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
  // 'solid' = 進行ルート (route, with arrowhead), 'dashed' = 分岐ルート (branch, no arrowhead)
  type: 'solid' | 'dashed';
  // 補正後・接続前のポイント列 (post-smooth, pre-snap) — 距離計測用
  // 未設定なら points を使う (古いデータとの後方互換)
  originalPoints?: Point[];
}

export function normalizeStrokes(strokes: DrawingStroke[]): DrawingStroke[] {
  if (!Array.isArray(strokes)) return [];
  return strokes
    .filter(s => s && typeof s === 'object' && Array.isArray(s.points) && s.points.length >= 2)
    .map(s => {
      const normPoints = s.points
        .filter((p: any) => p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y))
        .map((p: any) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      const normOriginal = Array.isArray(s.originalPoints)
        ? s.originalPoints
            .filter((p: any) => p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y))
            .map((p: any) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
        : undefined;
      return {
        points: normPoints,
        originalPoints: normOriginal && normOriginal.length >= 2 ? normOriginal : undefined,
        color: typeof s.color === 'string' ? s.color : '#00ff00',
        width: typeof s.width === 'number' && s.width > 0 ? s.width : 3,
        type: (s.type === 'dashed' ? 'dashed' : 'solid') as 'solid' | 'dashed',
      };
    })
    .filter(s => s.points.length >= 2);
}

// --- PNG metadata helpers (CRC32 + tEXt chunk insertion) ---

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const lenBuf = new Uint8Array(4);
  new DataView(lenBuf.buffer).setUint32(0, data.length, false);
  const combined = new Uint8Array(typeBytes.length + data.length);
  combined.set(typeBytes, 0);
  combined.set(data, typeBytes.length);
  const crcVal = crc32(combined);
  const crcBuf = new Uint8Array(4);
  new DataView(crcBuf.buffer).setUint32(0, crcVal, false);
  const chunk = new Uint8Array(4 + typeBytes.length + data.length + 4);
  chunk.set(lenBuf, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 4 + typeBytes.length);
  chunk.set(crcBuf, 4 + typeBytes.length + data.length);
  return chunk;
}

/**
 * Insert tEXt metadata chunks into a PNG data-URL.
 * Chunks are inserted just before the IEND chunk.
 */
export function insertPngMetadata(
  dataUrl: string,
  metadata: Record<string, string>
): string {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  // Find IEND chunk (always the last chunk: 00 00 00 00 49 45 4E 44 ...)
  const iendSig = new Uint8Array([0x49, 0x45, 0x4E, 0x44]);
  let iendOffset = -1;
  for (let i = bytes.length - 12; i >= 8; i--) {
    if (bytes[i + 4] === iendSig[0] && bytes[i + 5] === iendSig[1] &&
        bytes[i + 6] === iendSig[2] && bytes[i + 7] === iendSig[3]) {
      iendOffset = i;
      break;
    }
  }
  if (iendOffset < 0) return dataUrl;

  // Build tEXt chunks
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = encoder.encode(key);
    const valBytes = encoder.encode(value);
    const data = new Uint8Array(keyBytes.length + 1 + valBytes.length);
    data.set(keyBytes, 0);
    data[keyBytes.length] = 0; // null separator
    data.set(valBytes, keyBytes.length + 1);
    chunks.push(makeChunk('tEXt', data));
  }

  // Assemble new PNG
  const totalExtra = chunks.reduce((s, c) => s + c.length, 0);
  const newBytes = new Uint8Array(bytes.length + totalExtra);
  newBytes.set(bytes.subarray(0, iendOffset), 0);
  let offset = iendOffset;
  for (const chunk of chunks) {
    newBytes.set(chunk, offset);
    offset += chunk.length;
  }
  newBytes.set(bytes.subarray(iendOffset), offset);

  // Re-encode to base64
  let newBase64 = '';
  for (let i = 0; i < newBytes.length; i++) {
    newBase64 += String.fromCharCode(newBytes[i]);
  }
  return `data:image/png;base64,${btoa(newBase64)}`;
}

/**
 * Extract tEXt metadata chunks from a PNG ArrayBuffer.
 * Returns a map of keyword → value.
 */
export function extractPngMetadata(pngBuffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(pngBuffer);
  const decoder = new TextDecoder();
  const result: Record<string, string> = {};
  // PNG signature is 8 bytes; each chunk: 4 len + 4 type + data + 4 crc
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(0, false);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'tEXt' && offset + 12 + len <= bytes.length) {
      const chunkData = bytes.subarray(offset + 8, offset + 8 + len);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx > 0) {
        const key = decoder.decode(chunkData.subarray(0, nullIdx));
        const val = decoder.decode(chunkData.subarray(nullIdx + 1));
        result[key] = val;
      }
    }
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  return result;
}

// --- Stroke compression for PNG pixel-encoded data bar ---

interface CompressedStroke {
  c: string;   // color
  w: number;   // width
  t: string;   // type
  p: number[]; // delta-encoded flat array [dx0,dy0,dx1,dy1,...] with zigzag
}

function zigzagEncode(n: number): number {
  return (n << 1) ^ (n >> 31);
}

function zigzagDecode(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

export function compressStrokes(strokes: DrawingStroke[]): CompressedStroke[] {
  return strokes.map(s => {
    const flat: number[] = [];
    let prevX = 0;
    let prevY = 0;
    for (const pt of s.points) {
      flat.push(zigzagEncode(pt.x - prevX));
      flat.push(zigzagEncode(pt.y - prevY));
      prevX = pt.x;
      prevY = pt.y;
    }
    return { c: s.color, w: s.width, t: s.type, p: flat };
  });
}

export function decompressStrokes(compressed: CompressedStroke[]): DrawingStroke[] {
  return compressed.map(cs => {
    const points: Point[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < cs.p.length; i += 2) {
      x += zigzagDecode(cs.p[i]);
      y += zigzagDecode(cs.p[i + 1]);
      points.push({ x, y });
    }
    return { points, color: cs.c, width: cs.w, type: cs.t as 'solid' | 'dashed' };
  });
}

/**
 * Smooth a polyline using Chaikin's corner-cutting algorithm.
 * Each iteration replaces every interior point with two new points
 * that are 1/4 and 3/4 along each segment, producing a smooth curve
 * from the original points. Endpoints are preserved.
 *
 * `iterations` controls smoothness (more = smoother, fewer = closer to original).
 * `maxPoints` caps the result so excessive smoothing can't produce tens of
 * thousands of points and freeze the canvas.
 */
export function smoothStrokePoints(points: Point[], iterations: number = 3, maxPoints: number = 1500): Point[] {
  if (points.length < 3) return points;
  let result = points.slice();
  for (let it = 0; it < iterations; it++) {
    // Stop early if we've already hit the cap
    if (result.length >= maxPoints) break;
    const next: Point[] = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
      const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
      next.push(q, r);
      if (next.length >= maxPoints) break;
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

export interface ScrollConfig {
  x: number;
  y: number;
  zoom: number;
  viewWidth?: number;
  viewHeight?: number;
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
  infoExpanded?: boolean; // For info markers: whether details are expanded in presentation mode
  noteExpanded?: boolean; // For note markers: whether popup is expanded in presentation mode
  infoLabel?: string;     // For info markers: short label displayed under the pin
  bossDrops?: string[];   // For boss markers: list of drop items
  bossDurationSeconds?: number; // For boss markers: duration in seconds
  bossExpanded?: boolean; // For boss markers: whether details are expanded in presentation mode
  bossDescription?: string; // For boss markers: detailed description (separate from name in note)
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
  trackSide?: 'auto' | 'left' | 'right'; // For fixed text markers: which sidebar side to track for collapse shift ('auto' = resolve from viewport position)
  textDescription?: string;   // For text markers: description text shown below label
  textTooltip?: boolean;      // For text markers: show mouseover tooltip
  textGlow?: boolean;         // For text markers: show glow effect
  mediaItems?: MediaItem[]; // For info/eh/boss/battle markers: multiple media attachments
  // Checkpoint marker fields (type === 'checkpoint')
  checkpointTargetTime?: number;  // Target arrival time in seconds (0 = no target)
  checkpointSoundOn?: boolean;    // Play a beep when the auto-route passes this checkpoint
  checkpointVoiceOn?: boolean;   // Voice announcement "X秒地点です" when passing
  checkpointExpanded?: boolean;  // Whether the popup is expanded in presentation mode
  connectionColor?: string;      // Custom color for warp/stairs connection lines
  // Skill CD marker fields (type === 'skill_cd')
  // CDは「セッション開始時にリセット」なので永続化はしない。
  // 同じプリセット（時間泥棒等）を何度でも呼び出せるよう、識別子として presetId を保持する。
  // label/color/mode/seconds/perSecondCd は呼び出された時点のプリセット値をスナップショットとして固定し、
  // 後からプリセットを編集しても過去の配置済みのマーカーは変わらない（予測可能性のため）。
  skillPresetId?: string;        // 詳細設定で定義したプリセットの id
  skillLabel?: string;           // 個別上書きしたラベル（空文字なら note を使う）
  skillColor?: string;           // 個別上書きした色（hex）
  skillMode?: SkillCdMode;       // CD計算モード (fixed / per_second)
  skillCdSeconds?: number;       // mode='fixed' の CD秒数 / mode='per_second' の「使用秒数」
  skillPerSecondCd?: number;     // mode='per_second' の係数 (1秒使用→N秒CD)
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
  pickyMarkerIds?: { [markerId: string]: boolean }; // Plan-specific: true = picky (0s) for that marker
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
  targetDuration: '720',
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
  pickyMarkerIds: {},
  hiddenMarkers: [],
  hiddenMarkerTypes: [],
  createdAt: Date.now(),
  mapVersion: 2
});

/**
 * プリセットの公開レベル。
 *  - 'public':   一覧に表示、URL(?preset=ID)でも開ける (デフォルト)
 *  - 'unlisted': 一覧には出さないが URL (?preset=ID) を知っていれば開ける (限定公開)
 *  - 'private':  ローカルモード (npm run dev) でのみ一覧/URL 双方で開ける (非公開)。
 *                本番ビルド (dist 配信) では一覧/URL ともに非表示・ロード不可。
 */
export type PresetVisibility = 'public' | 'unlisted' | 'private';

export const PRESET_VISIBILITY_META: { [key in PresetVisibility]: { label: string; emoji: string; color: string; description: string } } = {
  public:   { label: '公開',       emoji: '🌐', color: '#39ff14', description: '一覧に表示され、URL共有でも開ける' },
  unlisted: { label: '限定公開',   emoji: '🔗', color: '#ffe600', description: '一覧には出ない。URL (?preset=ID) を知っていれば開ける' },
  private:  { label: '非公開',     emoji: '🔒', color: '#ff0055', description: 'ローカルモード (npm run dev) でのみ開ける。本番ビルドでは不可' }
};

export interface PresetData {
  id: string;
  name: string;
  description: string;
  targetCash: string;
  targetCoins: string;
  author: string;
  originalAuthor: string;
  updatedAt: number;
  /**
   * 公開レベル (省略時 / 不正値 は 'public' 扱い)。
   * 後方互換のため undefined を許容し、DataManager.normalizePreset で補完する。
   */
  visibility?: PresetVisibility;
  routeData: RouteData;
}

/** プリセットを公開レベル別に分類する。unknown は public に正規化。 */
export function normalizePresetVisibility(v: unknown): PresetVisibility {
  return v === 'unlisted' || v === 'private' ? v : 'public';
}

export function getPresetVisibility(preset: Pick<PresetData, 'visibility'>): PresetVisibility {
  return normalizePresetVisibility(preset.visibility);
}

/**
 * プリセット配列を正規化する。
 *  - 不正な型 / null / プリセット以外の値を除去
 *  - 公開レベル (visibility) を normalizePresetVisibility で 'public' 補完
 * サーバ (presets.json) や localStorage から読み込んだ直後に必ず通すこと。
 */
export function normalizePresets(raw: unknown): PresetData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p: any) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && p.routeData && typeof p.routeData === 'object')
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      description: typeof p.description === 'string' ? p.description : '',
      targetCash: typeof p.targetCash === 'string' ? p.targetCash : '',
      targetCoins: typeof p.targetCoins === 'string' ? p.targetCoins : '',
      author: typeof p.author === 'string' ? p.author : '',
      originalAuthor: typeof p.originalAuthor === 'string' ? p.originalAuthor : '',
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      visibility: normalizePresetVisibility(p.visibility),
      routeData: p.routeData
    }));
}

/**
 * スキルCDプリセット。詳細設定で「時間泥棒 / 緑 / 50秒」のように登録する。
 * 呼び出された時点の値をマーカーにスナップショットとして固定するため、
 * 後から編集しても過去のマーカーには影響しない。
 *
 * mode:
 *   - 'fixed':      単純CD。stopDuration = seconds (固定秒数ぶん停止)
 *   - 'per_second': 変動CD。stopDuration = useSeconds * perSecondCd (使用秒数×係数ぶん停止)
 */
export type SkillCdMode = 'fixed' | 'per_second';

export interface SkillCdPreset {
  id: string;
  label: string;                // 表示名 (例: "時間泥棒")
  color: string;                // 表示色 (例: "#39ff14")
  mode: SkillCdMode;            // CD計算モード
  seconds: number;              // mode='fixed' の時の CD秒数 (例: 50)
  perSecondCd: number;          // mode='per_second' の時の 1秒あたりCD秒数 (例: 2)
}

// Marker Metadata helper for styling and emoji representation
export const MARKER_META: { [key in MarkerType]: { emoji: string; label: string; color: string } } = {
  goal: { emoji: '🏁', label: 'ESCAPE AREA', color: '#39ff14' },
  cardkey: { emoji: '💳', label: 'CARD KEY', color: '#39ff14' },
  eh: { emoji: '💎', label: 'EH', color: '#00f0ff' },
  rare: { emoji: '💴', label: 'RARE', color: '#ffd700' },
  vault: { emoji: '💰', label: 'MDP', color: '#ffe600' },
  boss: { emoji: '😈', label: 'BOSS', color: '#ff0055' },
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
  itext: { emoji: 'T', label: 'I-TEXT', color: '#ffffff' },
  start: { emoji: '🐾', label: 'START', color: '#39ff14' },
  checkpoint: { emoji: '🏁', label: 'CHECKPOINT', color: '#ff9500' },
  skill_cd: { emoji: 'S', label: 'SKILL CD', color: '#39ff14' }
};

/**
 * Auto-route helper: returns true if the marker is a movement marker
 * (i.e. traversal continues through it without pausing).
 */
export function isMovementMarker(type: MarkerType): boolean {
  return type === 'warp' || type === 'iwarp' || type === 'stairs' || type === 'start';
}

/**
 * Auto-route helper: returns true if the marker is a stop marker
 * (i.e. traversal pauses for the marker's configured duration).
 */
export function isStopMarker(type: MarkerType): boolean {
  return type === 'picking' || type === 'gpicking' ||
         type === 'long_picking' || type === 'glong_picking' ||
         type === 'boss' || type === 'gbattle' || type === 'battle';
}

/**
 * Auto-route helper: returns true if the marker is a checkpoint marker
 * (i.e. the auto-route should detect when it passes it for on-time checks).
 */
export function isCheckpointMarker(type: MarkerType): boolean {
  return type === 'checkpoint';
}

/**
 * Returns the stop duration in seconds for a stop marker.
 * Falls back to a sensible default if not configured.
 *
 * The picky state lives on the ROUTE (`pickyMarkerIds`, plan-specific),
 * not on the marker itself. This applies uniformly to all 4 picking
 * types, including global pins, so each plan can independently mark
 * a gpicking/glong_picking pin as picky. Migration from the legacy
 * marker-level `pickingPicky` happens at load time (see useRoute /
 * useFileIO) so the data is preserved for existing routes.
 */
export function getStopDurationSeconds(
  marker: HeistMarker,
  pickyMarkerIds?: { [markerId: string]: boolean }
): number {
  const isPicky = !!(pickyMarkerIds && pickyMarkerIds[marker.id]);
  if (marker.type === 'picking' || marker.type === 'gpicking') {
    if (isPicky) return 0;
    return marker.pickingDurationSeconds ?? 5;
  }
  if (marker.type === 'long_picking' || marker.type === 'glong_picking') {
    if (isPicky) return 0;
    return marker.longPickingDurationSeconds ?? 8;
  }
  if (marker.type === 'boss') {
    return marker.bossDurationSeconds ?? 60;
  }
  if (marker.type === 'battle' || marker.type === 'gbattle') {
    return marker.battleDurationSeconds ?? 20;
  }
  if (marker.type === 'skill_cd') {
    // CDマーカーは stopDuration を持たない（CD秒数で別途管理）
    return 0;
  }
  return 0;
}

/**
 * スキルCDマーカーの表示用アイコン文字を返す。
 * プリセット使用時 (=skillPresetId あり): skillLabel の先頭1文字
 * 未使用時: note の先頭1文字 (リアルタイム編集で即時反映)
 * どちらも空: 'S'
 */
export function getSkillCdIcon(marker: HeistMarker): string {
  if (marker.skillPresetId) {
    const fromLabel = (marker.skillLabel || '').trim();
    if (fromLabel) return fromLabel.charAt(0);
  }
  const fromNote = (marker.note || '').trim();
  if (fromNote) return fromNote.charAt(0);
  return 'S';
}

/** スキルCDマーカーの表示色を返す。優先順位: skillColor > note (色名/hex) は解釈しない > meta 既定色 */
export function getSkillCdColor(marker: HeistMarker): string {
  if (marker.skillColor && /^#[0-9a-fA-F]{3,8}$/.test(marker.skillColor)) {
    return marker.skillColor;
  }
  return MARKER_META.skill_cd.color;
}

/** スキルCDマーカーの現在の停止秒数を計算する。 */
export function getSkillCdSeconds(marker: HeistMarker): number {
  const mode = marker.skillMode ?? 'fixed';
  if (mode === 'per_second') {
    const use = typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0 ? marker.skillCdSeconds : 0;
    const rate = typeof marker.skillPerSecondCd === 'number' && marker.skillPerSecondCd > 0 ? marker.skillPerSecondCd : 0;
    if (use <= 0 || rate <= 0) return 0;
    return use * rate;
  }
  // fixed
  if (typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0) {
    return marker.skillCdSeconds;
  }
  return 0;
}

/** モード別の表示用設定値。fixed: CD秒数 / per_second: 使用秒数。 */
export function getSkillCdDisplayValue(marker: HeistMarker): number {
  if (typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0) {
    return marker.skillCdSeconds;
  }
  return 0;
}

/** per_secondモード時の係数 (1秒あたりのCD秒数)。 */
export function getSkillCdPerSecondRate(marker: HeistMarker): number {
  if (typeof marker.skillPerSecondCd === 'number' && marker.skillPerSecondCd > 0) {
    return marker.skillPerSecondCd;
  }
  return 0;
}

/** スキルCDマーカーの現在の残りCD秒数。負数は0にクランプ。未消費は cd をそのまま返す。 */
export function getSkillCdRemaining(marker: HeistMarker, currentElapsed: number, consumedAtElapsed?: number): number {
  const cd = getSkillCdSeconds(marker);
  if (cd <= 0) return 0;
  if (consumedAtElapsed === undefined) return cd;
  return Math.max(0, cd - (currentElapsed - consumedAtElapsed));
}

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
    try {
      const listStr = localStorage.getItem('heist_routes_list');
      if (!listStr) return [];
      const parsed = JSON.parse(listStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('getSavesList: corrupted data, clearing', e);
      try { localStorage.removeItem('heist_routes_list'); } catch {}
      return [];
    }
  }

  // Load route from localStorage
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

  // Delete route from localStorage
  static deleteFromLocalStorage(id: string): void {
    localStorage.removeItem(`heist_route_${id}`);
    const saves = this.getSavesList().filter(s => s.id !== id);
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  // Presets are normally persisted to the server (presets.json) but we also
  // keep a localStorage mirror so the list survives an offline startup or a
  // transient server failure and the user never sees a "temporarily empty"
  // preset list.
  static loadPresetsFromLocalStorage(): PresetData[] {
    const raw = localStorage.getItem('heist_presets');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as PresetData[] : [];
    } catch {
      return [];
    }
  }

  static savePresetsToLocalStorage(presets: PresetData[]): void {
    try {
      localStorage.setItem('heist_presets', JSON.stringify(presets));
    } catch {
      // Ignore quota / serialization errors — the server copy is the source
      // of truth and the list will be refreshed on the next successful sync.
    }
  }

  // 旧 infoMediaUrl (単一 URL) / infoMediaType 形式のデータがあれば
  // mediaItems 形式に変換する。
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

  // Strip legacy/unknown fields and backfill defaults so exported payloads
  // match the current RouteData schema (e.g. remove `difficulty` from older
  // builds, ensure `targetDuration` is always present, and keep only the
  // custom-duration maps that the schema actually declares).
  static sanitizeRouteForExport(route: RouteData | any): RouteData {
    const def = DEFAULT_ROUTE(route?.id);
    return {
      id: typeof route?.id === 'string' ? route.id : def.id,
      title: typeof route?.title === 'string' ? route.title : def.title,
      description: typeof route?.description === 'string' ? route.description : def.description,
      targetCash: typeof route?.targetCash === 'string' ? route.targetCash : def.targetCash,
      targetCoins: typeof route?.targetCoins === 'string' ? route.targetCoins : def.targetCoins,
      targetDuration:
        typeof route?.targetDuration === 'string' ? route.targetDuration : def.targetDuration,
      author: typeof route?.author === 'string' ? route.author : def.author,
      originalAuthor:
        typeof route?.originalAuthor === 'string' ? route.originalAuthor : def.originalAuthor,
      strokes: route?.strokes && typeof route.strokes === 'object'
        ? route.strokes
        : def.strokes,
      markers: Array.isArray(route?.markers)
        ? route.markers.map(DataManager.migrateMarkerMediaFields)
        : def.markers,
      customBg: route?.customBg && typeof route.customBg === 'object'
        ? route.customBg
        : def.customBg,
      createdAt: typeof route?.createdAt === 'number' ? route.createdAt : def.createdAt,
      bossCustomDurations:
        route?.bossCustomDurations && typeof route.bossCustomDurations === 'object'
          ? route.bossCustomDurations
          : def.bossCustomDurations,
      battleCustomDurations:
        route?.battleCustomDurations && typeof route.battleCustomDurations === 'object'
          ? route.battleCustomDurations
          : def.battleCustomDurations,
      pickingCustomDurations:
        route?.pickingCustomDurations && typeof route.pickingCustomDurations === 'object'
          ? route.pickingCustomDurations
          : def.pickingCustomDurations,
      longPickingCustomDurations:
        route?.longPickingCustomDurations && typeof route.longPickingCustomDurations === 'object'
          ? route.longPickingCustomDurations
          : def.longPickingCustomDurations,
      pickyMarkerIds:
        route?.pickyMarkerIds && typeof route.pickyMarkerIds === 'object'
          ? route.pickyMarkerIds
          : (def.pickyMarkerIds || {}),
      mapVersion: typeof route?.mapVersion === 'number' ? route.mapVersion : def.mapVersion,
      markerScale: typeof route?.markerScale === 'number' ? route.markerScale : def.markerScale,
      hiddenMarkers: Array.isArray(route?.hiddenMarkers) ? route.hiddenMarkers : def.hiddenMarkers,
      hiddenMarkerTypes: Array.isArray(route?.hiddenMarkerTypes) ? route.hiddenMarkerTypes : def.hiddenMarkerTypes
    };
  }

  // スキルCDマーカーは個人用 (indiv) として扱う。
  // グローバルにしない理由は、P1の「前」など作者の意図する位置に置きたいため。
  // 必要になった時点で RouteData.markers 経由で plan 毎に保持される。
  static isIndivMarkerType(t: string): boolean {
    return [
      'start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking',
      'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'
    ].includes(t);
  }

  // Export route to JSON file
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

  // Export merged map to PNG
  static exportToPNG(
    floor: FloorType,
    route: RouteData,
    _svgString: string,
    canvasElement: HTMLCanvasElement | null,
    onComplete: (dataUrl: string) => void,
    skipDataBar?: boolean
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
          lines.forEach((line, li) => {
            ctx.fillText(line, tx - 5, ty - 5 + li * lineH);
          });
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

      let dataUrl: string;

      if (!skipDataBar) {
        // Draw pixel-encoded JSON data bar BELOW the map (appended, not overwriting).
        // Stroke points are delta+zigzag compressed to drastically reduce JSON size.
        // Format: [8 magenta pixels][4 magic N-K-N-Y][4 length BE][JSON data][8 magenta end]
        const sanitized = DataManager.sanitizeRouteForExport(route);
        const compressed: any = { ...sanitized, _v: 2 };
        for (const floorKey of Object.keys(sanitized.strokes) as FloorType[]) {
          compressed.strokes = { ...compressed.strokes, [floorKey]: compressStrokes(sanitized.strokes[floorKey]) };
        }
        const jsonStr = JSON.stringify(compressed);
        const dataBytes = new TextEncoder().encode(jsonStr);
        const MAGIC = [0x4E, 0x4B, 0x4E, 0x59]; // "N K N Y"
        const HEADER_SIZE = 8 + 4 + 4; // 8 marker + 4 magic + 4 length
        const dataRows = Math.ceil((HEADER_SIZE + dataBytes.length + 8) / EXTW);
        const dataBarHeight = Math.max(dataRows, 2);

        // Extend the final canvas to fit the data bar below the map content
        const finalH = EXTH + dataBarHeight;
        const finalCanvas2 = document.createElement('canvas');
        finalCanvas2.width = EXTW;
        finalCanvas2.height = finalH;
        const fctx2 = finalCanvas2.getContext('2d');
        if (!fctx2) return;

        // Copy the already-drawn map content onto the extended canvas
        fctx2.drawImage(finalCanvas, 0, 0);

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

        const imgData = fctx2.createImageData(EXTW, dataBarHeight);
        for (let i = 0; i < allBytes.length; i++) {
          const px = i % EXTW;
          const row = Math.floor(i / EXTW);
          const idx = (row * EXTW + px) * 4;
          const isMarker = (allBytes[i] === 0xFF && i < 8) || i >= HEADER_SIZE + dataBytes.length;
          imgData.data[idx] = isMarker ? 255 : 0;     // R: marker=255, data=0
          imgData.data[idx + 1] = isMarker ? 0 : allBytes[i]; // G: marker=0, data=byte value
          imgData.data[idx + 2] = isMarker ? 255 : 0; // B: marker=255, data=0
          imgData.data[idx + 3] = 255;
        }
        fctx2.putImageData(imgData, 0, EXTH);

        dataUrl = finalCanvas2.toDataURL('image/png');
      } else {
        dataUrl = finalCanvas.toDataURL('image/png');
      }

      // Embed route metadata as PNG tEXt chunks (always, regardless of data bar)
      const decAuthor = xorDecrypt(route.author || '', getAuthorKey(route.id, route.createdAt));
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
  static async decodePngData(image: HTMLImageElement, rawBuffer?: ArrayBuffer): Promise<RouteData | null> {
    // --- Pass 1: pixel data bar (existing logic) ---
    const fromBar = await DataManager.decodePngDataBar(image);
    if (fromBar) return fromBar;

    // --- Pass 2: PNG tEXt metadata fallback ---
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
            return parsed as RouteData;
          }
        }
      }
    } catch { /* ignore metadata fallback errors */ }

    return null;
  }

  private static decodePngDataBar(image: HTMLImageElement): Promise<RouteData | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      // The encoder writes a data bar at the bottom whose height scales
      // with the JSON size — anything beyond ~40 rows used to be invisible
      // to the decoder. Read the full image so we can find the start
      // marker regardless of how tall the data bar is.
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(image, 0, 0, w, h, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const pixels = imgData.data;

      // Try to decode the data bar starting at a given pixel offset.
      // Returns the parsed RouteData on success, or null if the marker is
      // not a valid data bar (wrong magic, bad length, truncated payload,
      // unparseable JSON, etc.).
      const tryDecode = (markerStart: number): RouteData | null => {
        // 8 marker pixels × 4 bytes/pixel = 32 bytes
        const afterMarker = markerStart + 32;
        // Read magic "N K N Y" from G channel
        const rMagic = [
          pixels[afterMarker + 1],
          pixels[afterMarker + 5],
          pixels[afterMarker + 9],
          pixels[afterMarker + 13]
        ];
        if (rMagic[0] !== 0x4E || rMagic[1] !== 0x4B || rMagic[2] !== 0x4E || rMagic[3] !== 0x59) {
          return null;
        }
        // Read 4-byte length (big-endian) from G channel
        const afterMagic = afterMarker + 16;
        const lenG = [
          pixels[afterMagic + 1],
          pixels[afterMagic + 5],
          pixels[afterMagic + 9],
          pixels[afterMagic + 13]
        ];
        const view = new DataView(new Uint8Array(lenG).buffer);
        const dataLen = view.getUint32(0, false);
        // Sanity cap: refuse anything obviously broken. The encoder writes
        // the route JSON, so well-formed exports stay well under this.
        if (dataLen === 0 || dataLen > 50_000_000) return null;
        // Read data from G channel
        const afterLen = afterMagic + 16;
        const dataBytes = new Uint8Array(dataLen);
        let read = 0;
        for (let i = 0; i < dataLen; i++) {
          const pixelOffset = afterLen + i * 4 + 1; // +1 for G channel
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
            // Decompress v2 strokes (delta+zigzag encoded)
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
        } catch {
          return null;
        }
      };

      // Magenta pixel check: R > 200, G < 50, B > 200
      const isMagenta = (i: number): boolean =>
        pixels[i] > 200 && pixels[i + 1] < 50 && pixels[i + 2] > 200;

      // Find the starting byte offsets of runs of 4+ consecutive magenta
      // pixels within the given byte range. Skips past each run so we
      // don't report the same run multiple times.
      const findMagentaRuns = (startIdx: number, endIdx: number): number[] => {
        const runs: number[] = [];
        for (let i = startIdx; i < endIdx - 16; i += 4) {
          if (isMagenta(i)) {
            let count = 1;
            for (let j = 1; j < 8 && i + j * 4 < endIdx; j++) {
              if (isMagenta(i + j * 4)) count++;
              else break;
            }
            if (count >= 4) {
              runs.push(i);
              i += count * 4; // Skip past this run
            }
          }
        }
        return runs;
      };

      // The data bar is always written at the bottom of the exported PNG,
      // so scan that region first. This avoids being misled by magenta-
      // colored UI elements (phone/warp/p3 pins, magenta strokes, magenta
      // text markers) drawn in the upper part of the image — those would
      // otherwise be matched first and the magic check would fail,
      // producing a false "data bar not found".
      const bottomRows = Math.min(Math.max(200, Math.ceil(h * 0.1)), h);
      const bottomStartIdx = (h - bottomRows) * w * 4;

      // Pass 1: scan the bottom region
      for (const runStart of findMagentaRuns(bottomStartIdx, pixels.length)) {
        const result = tryDecode(runStart);
        if (result) { resolve(result); return; }
      }

      // Pass 2: scan the entire image (fallback if the data bar is not at
      // the bottom — e.g. a PNG that was cropped or assembled differently).
      for (const runStart of findMagentaRuns(0, pixels.length)) {
        if (runStart >= bottomStartIdx) break; // Already tried in pass 1
        const result = tryDecode(runStart);
        if (result) { resolve(result); return; }
      }

      resolve(null);
    });
  }
}
