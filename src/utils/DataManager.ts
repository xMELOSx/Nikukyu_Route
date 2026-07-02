export function generateId(prefix: string = ''): string {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export type FloorType = 'main';

export type MarkerType = 'goal' | 'cardkey' | 'eh' | 'rare' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking' | 'iwarp' | 'text' | 'iinfo' | 'inote' | 'itext' | 'start' | 'checkpoint' | 'skill_cd';

// ---------------------------------------------------------------------------
// 作者名 / 原作者名 の難読化
// ---------------------------------------------------------------------------
//
// 旧実装 (xorEncrypt / xorDecrypt):
//   - ベース鍵 'Fans' / 'Colins' をクライアント JS に平文で持つだけ
//   - JSON を開いて暗号文を別の暗号文に貼り替えるだけで原作者を差し替え可能
//   - 鍵のエクスポートも容易 (DevTools で関数を読めば XOR 復号できる)
//
// 新実装 (aesGcmEncrypt / aesGcmDecrypt):
//   - Web Crypto API の AES-GCM (256bit) で暗号化
//   - 暗号文はランダム IV を含むので、同じ平文でも毎回異なる暗号文になる
//   - auth tag (16byte) による完全性検証付き。改ざんされた暗号文は復号失敗する
//   - 旧 XOR 暗号文は "legacy:" プレフィックスをつけて区別し、保存時に新形式へ
//     マイグレートする。マイグレートに失敗した値 (鍵違いや改ざん) は "異常" 扱い。
//
// MIT ライセンス: Web Crypto API はブラウザ標準 API なので追加依存なし。
// ---------------------------------------------------------------------------

/** 暗号化済みデータのセンチネル値。復号失敗 / 改ざん時に表示用文字列として返す。 */
export const AUTHOR_TAMPERED = '__author_tampered__';

/**
 * author / originalAuthor のデフォルト平文。空文字 (未設定) は許可せず、
 * ロード時にこの文字列を AES-GCM 暗号化で自動補完する。
 * 表示は "No name"、UI 上の編集ではこの値に書き戻すことで「未設定」状態に戻る。
 */
export const AUTHOR_DEFAULT_PLAIN = 'No name';

const AES_GCM_PREFIX = 'v2:';
const AES_GCM_LEGACY_PREFIX = 'legacy:';
/**
 * "不明" マーカー。
 * 暗号文 (renderCache) がこの値なら「ユーザがクリアした or 改ざんで消えた」を
 * 表し、aesGcmDecrypt は AUTHOR_TAMPERED を返す。空文字 '' は「元々未設定」
 * と区別される (例: プリセットに renderCache がない新規ルート)。
 */
export const AUTHOR_UNKNOWN_MARKER = 'v2:0:';
const IV_BYTES = 12;

/** パスフレーズ文字列を AES-GCM 用 256bit 鍵に伸長。
 *  仕様: パスフレーズは可変長。Web Crypto の importKey('raw', ...) は 128/192/256bit (= 16/24/32 byte)
 *  の厳格な長さしか受け付けないため、 SHA-256 で 32 byte (256bit) に正規化して鍵にする。
 *  salt は不要 (= 同じ passphrase からは常に同じ鍵が導出される = 決定論的)。
 *  これにより新旧どちらの呼び出しでも同じ鍵が得られ、暗号/復号が一致する。 */
async function deriveAesKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
  if (!subtle || !subtle.importKey) {
    throw new Error('Web Crypto API が利用できない環境です');
  }
  const passphraseBytes = enc.encode(passphrase);
  const hashBuf = await subtle.digest('SHA-256', passphraseBytes);
  return subtle.importKey(
    'raw',
    hashBuf,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * AES-GCM で暗号化する。戻り値は "v2:" + base64(IV ‖ ciphertext ‖ authTag)。
 * 失敗時は例外を投げる (呼び出し側で AUTHOR_TAMPERED にフォールバック)。
 *
 * renderCache のフィールドは「空」を許容しないため、空文字が渡された
 * 場合は AUTHOR_DEFAULT_PLAIN ('No name') を暗号化する。復号側で平文が 'No name'
 * なら「未設定」相当として表示する。
 */
export async function aesGcmEncrypt(plain: string, passphrase: string, debugKey?: { routeId: string; createdAt: number; presetSourceId: string | null }): Promise<string> {
  if (!plain) return aesGcmEncrypt(AUTHOR_DEFAULT_PLAIN, passphrase);
  const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
  if (!subtle) throw new Error('Web Crypto API が利用できない環境です');
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase);
  const enc = new TextEncoder();
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new Uint8Array() },
    key,
    enc.encode(plain)
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv, 0);
  out.set(cipher, IV_BYTES);
  const result = AES_GCM_PREFIX + bytesToBase64(out);
  if (debugKey) {
    recordSaveKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, plain, result);
  }
  return result;
}

/**
 * AES-GCM 暗号文を復号する。失敗時 (改ざん / 鍵違い / フォーマット不正) は
 * AUTHOR_TAMPERED を返す。呼び出し側はこの値を表示用カラムに「異常」として出す。
 *
 * "legacy:" プレフィックスの旧 XOR 暗号文もここに来る可能性がある。xorDecrypt
 * で復号を試み、成功したら新形式にマイグレートせず平文を返す (呼び出し側で再暗号化)。
 * 旧復号も失敗したら AUTHOR_TAMPERED。
 */
export async function aesGcmDecrypt(encoded: string, passphrase: string, debugKey?: { routeId: string; createdAt: number; presetSourceId: string | null }): Promise<string> {
  if (!encoded) return '';
  // "不明" マーカー (v2:0:) は復号せず AUTHOR_TAMPERED を返す。
  if (encoded === AUTHOR_UNKNOWN_MARKER) {
    if (debugKey) recordLoadKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, encoded, 'AUTHOR_UNKNOWN_MARKER');
    return AUTHOR_TAMPERED;
  }
  // AES-GCM 新形式
  if (encoded.startsWith(AES_GCM_PREFIX)) {
    try {
      const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
      if (!subtle) {
        if (debugKey) recordLoadKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, encoded, 'NO_SUBTLE');
        return AUTHOR_TAMPERED;
      }
      const payload = base64ToBytes(encoded.slice(AES_GCM_PREFIX.length));
      if (payload.length < IV_BYTES + 16) {
        if (debugKey) recordLoadKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, encoded, 'PAYLOAD_TOO_SHORT');
        return AUTHOR_TAMPERED;
      }
      const iv = payload.slice(0, IV_BYTES);
      const cipher = payload.slice(IV_BYTES);
      const key = await deriveAesKey(passphrase);
      const plainBuf = await subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new Uint8Array() },
        key,
        cipher
      );
      const result = new TextDecoder().decode(plainBuf);
      if (debugKey) recordLoadKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, encoded, result);
      return result;
    } catch (e: any) {
      if (debugKey) recordLoadKey(debugKey.routeId, debugKey.createdAt, debugKey.presetSourceId, passphrase, encoded, 'EXCEPTION: ' + (e?.message || 'unknown'));
      return AUTHOR_TAMPERED;
    }
  }
  // 旧 XOR 暗号文 (互換)
  if (encoded.startsWith(AES_GCM_LEGACY_PREFIX)) {
    const legacyPayload = encoded.slice(AES_GCM_LEGACY_PREFIX.length);
    const plain = legacyXorDecrypt(legacyPayload, passphrase);
    return plain || AUTHOR_TAMPERED;
  }
  // プレフィックスなし: 旧 XOR 形式 (プレフィックス追加前のレガシー) とみなす
  const plain = legacyXorDecrypt(encoded, passphrase);
  return plain || AUTHOR_TAMPERED;
}

/** 旧 XOR 暗号実装 (互換用途のみ。新規保存には使わない)。 */
function legacyXorDecrypt(encoded: string, key: string): string {
  if (!encoded) return '';
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return '';
  }
}

/**
 * 同期版 XOR 復号 (旧コードの置き換え)。
 * 旧セーブデータを読み取った直後など、await せずに復号したい場面用。
 * 成功時は平文、失敗時は AUTHOR_TAMPERED。
 *
 * 同期では AES-GCM 復号できないため、旧 XOR 復号のみサポート。
 * 表示時に AUTHOR_TAMPERED になった箇所は別途バックグラウンドで AES-GCM 復号を
 * 試みる (useRoute の migrateLegacyAuthorField 経由)。
 */
export function xorDecrypt(encoded: string, key: string): string {
  if (!encoded) return '';
  if (encoded.startsWith(AES_GCM_PREFIX) || encoded.startsWith(AES_GCM_LEGACY_PREFIX)) {
    // 同期では AES-GCM / legacy を復号できない。呼び出し側で別途非同期復号が必要。
    return AUTHOR_TAMPERED;
  }
  // プレフィックスなし旧 XOR
  return legacyXorDecrypt(encoded, key) || AUTHOR_TAMPERED;
}

/** 旧コード互換の同期 XOR 暗号化。新規保存には使わず、旧データを持ち越す時だけ使う。 */
export function xorEncrypt(plain: string, key: string): string {
  if (!plain) return '';
  let result = '';
  for (let i = 0; i < plain.length; i++) {
    result += String.fromCharCode(plain.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

export const AUTHOR_KEY = 'Fans';
/**
 * renderCache (=旧 originalAuthor) の派生鍵ベース。
 * キーは route.id のみ (= createdAt に依存しない) で、
 * 旧 (routeId | createdAt) と区別する。
 */
export const RENDER_CACHE_KEY = 'Colins';

function deriveKey(baseKey: string, routeId: string, createdAt: number): string {
  return baseKey + '|' + routeId + '|' + String(createdAt);
}

/**
 * デバッグ用: 暗号化時のキーと暗号文をグローバルに保持し、 ロード時のキーと比較する。
 * window.__renderCacheDebug__ に { routeId, createdAt, presetSourceId, key, encoded } を記録。
 * 復号失敗 (Anomaly) 時にコンソールで saveToLocal 時のキーと loadFromLocal 時のキーを比較できる。
 */
declare global {
  interface Window {
    __renderCacheDebug__?: {
      saves: Array<{
        routeId: string;
        createdAt: number;
        presetSourceId: string | null;
        key: string;
        plainCache: string;
        encoded: string;
        timestamp: number;
      }>;
      loads: Array<{
        routeId: string;
        createdAt: number;
        presetSourceId: string | null;
        key: string;
        stored: string;
        result: string;
        timestamp: number;
      }>;
    };
  }
}

export function recordSaveKey(routeId: string, createdAt: number, presetSourceId: string | null, key: string, plainCache: string, encoded: string): void {
  if (typeof window === 'undefined') return;
  if (!window.__renderCacheDebug__) {
    window.__renderCacheDebug__ = { saves: [], loads: [] };
  }
  window.__renderCacheDebug__.saves.push({ routeId, createdAt, presetSourceId, key, plainCache, encoded, timestamp: Date.now() });
  // 直近 10 件だけ保持
  if (window.__renderCacheDebug__.saves.length > 10) {
    window.__renderCacheDebug__.saves = window.__renderCacheDebug__.saves.slice(-10);
  }
}

export function recordLoadKey(routeId: string, createdAt: number, presetSourceId: string | null, key: string, stored: string, result: string): void {
  if (typeof window === 'undefined') return;
  if (!window.__renderCacheDebug__) {
    window.__renderCacheDebug__ = { saves: [], loads: [] };
  }
  window.__renderCacheDebug__.loads.push({ routeId, createdAt, presetSourceId, key, stored, result, timestamp: Date.now() });
  if (window.__renderCacheDebug__.loads.length > 10) {
    window.__renderCacheDebug__.loads = window.__renderCacheDebug__.loads.slice(-10);
  }
  // セーブとロードの対応を比較
  const matchingSave = window.__renderCacheDebug__.saves.find(s => s.encoded === stored);
  if (matchingSave) {
    const sameKey = matchingSave.key === key;
    console.log('[renderCacheDebug] LOAD vs SAVE comparison:', {
      stored: stored.slice(0, 40),
      stored_len: stored.length,
      save_key: matchingSave.key,
      save_plainCache: matchingSave.plainCache,
      load_key: key,
      sameKey,
      load_result: result,
      save_presetSourceId: matchingSave.presetSourceId,
      load_presetSourceId: presetSourceId
    });
    if (!sameKey) {
      console.error('[renderCacheDebug] KEY MISMATCH! Save key vs Load key differ:');
      console.error('  save.routeId:', matchingSave.routeId, ' load.routeId:', routeId);
      console.error('  save.createdAt:', matchingSave.createdAt, ' load.createdAt:', createdAt);
      console.error('  save.presetSourceId:', matchingSave.presetSourceId, ' load.presetSourceId:', presetSourceId);
    }
  }
}

/**
 * renderCache (=原作者) 暗号化/復号用の派生鍵。
 *
 * 派生鍵 = RENDER_CACHE_KEY ('Colins') | 不動ID | createdAt
 *
 * 不動ID = プリセット由来なら presetSourceId (= プリセット ID)、
 *          通常セーブなら routeId (= ロード毎に変わらない固定 ID)。
 *
 * なぜ routeId だけだと不十分か:
 *   - プリセット読込時に `loadFromLocal` で新 ID が発行される
 *   - 同じプリセットを別ファイル (=別 export) にコピーしてロードすると、 ID が変わる
 *   - 結果、 別ファイルからのコピーを検出できない (= 保護が機能しない)
 *
 * プリセット ID を不動要素として使うことで、 プリセット単位で原作者の暗号文が
 * 束縛され、 コピーしても (=同じプリセット ID なので) 同じ原作者が復元されるが、
 * 別プリセット (= 別 presetSourceId) をコピーすると鍵が違って Anomaly になる。
 */
export function getOriginalAuthorKey(
  routeId: string,
  createdAt: number,
  presetSourceId?: string | null
): string {
  const stableId = presetSourceId || routeId;
  return deriveKey(RENDER_CACHE_KEY, stableId, createdAt);
}

/**
 * renderCache 暗号化/復号用の派生鍵。 既存コード (= getRenderCacheKey(routeId) の単一引数) との
 * 互換のため、 createdAt と presetSourceId は optional。 単一引数呼び出しは
 * 旧挙動 (= routeId のみ) になる (= createdAt 0 扱い、 暗号化/復号で鍵が一致する保証なし)。
 *
 * 新規コードでは getOriginalAuthorKey(routeId, createdAt, presetSourceId) を使うこと。
 */
export function getRenderCacheKey(routeId: string, createdAt?: number, presetSourceId?: string | null): string {
  return getOriginalAuthorKey(routeId, createdAt ?? 0, presetSourceId);
}

/**
 * 旧 originalAuthor フィールドを renderCache へマイグレートする。
 *  - 旧フィールドが無ければそのまま返す
 *  - 旧フィールドが空なら renderCache を空文字で初期化
 *  - 旧フィールドが 'v2:0:' (AUTHOR_UNKNOWN_MARKER) なら AUTHOR_UNKNOWN_MARKER のまま
 *  - その他: 値をそのまま renderCache にコピー (呼び出し側で再暗号化)
 */
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

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: Point[];
  color: string;
  width: number;
  // 'solid' = 進行ルート (route, with arrowhead), 'dashed' = 分岐ルート (branch, no arrowhead), 'temporary' = 一時線 (semi-transparent dashed, auto-removed on tool switch)
  type: 'solid' | 'dashed' | 'temporary';
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
        type: (s.type === 'dashed' ? 'dashed' : s.type === 'temporary' ? 'temporary' : 'solid') as 'solid' | 'dashed' | 'temporary',
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
    return { points, color: cs.c, width: cs.w, type: cs.t as 'solid' | 'dashed' | 'temporary' };
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
    // 縮退防止: 最低 2 点を保証 (1 線分 = 2 点) する。線分の結合/切断バグの防止。
    if (next.length < 2) return result;
    result = next;
  }
  return result;
}

/**
 * 「先頭と末尾を絶対保持する」平滑化。
 *
 * 背景:
 *  通常の smoothStrokePoints でも先頭/末尾の点は保持しているが、内部の
 *  サブディビジョンで大量の点が発生する。線の本数が非常に多い場合、
 *  親レイヤ (canvas / SVG) 側のクランプや浮動小数点演算の誤差で
 *  「線が分断されて見え、隣の線と再接続できなくなる」現象が稀に起こる。
 *  これは内部の 1 点でも (NaN / ±Infinity / 異常に大きな座標に) 化けると
 *  stroke 描画が破綻して線分の特定区間が描画されない、というパターン。
 *
 * 保証:
 *  - 出力の points[0] === 入力の points[0]
 *  - 出力の points[last] === 入力の points[last]
 *  - 中間点は元の points[i] を「先頭寄りに残す」比率を上げることで、
 *    線形性を保ちつつ滑らかさを作り出す (= Chaikin 風の縮小改良)。
 *  - `keepAnchorsRatio` (0..1) で「元の点を何割保持するか」を制御。
 *    - 1.0: 全点保持 (= 平滑化しない)
 *    - 0.5: 半分保持 (デフォルト、ほどよく滑らか)
 *    - 0.0: smoothStrokePoints と同じ (全点サブディビジョン)
 */
export function smoothStrokePointsKeepEnds(
  points: Point[],
  iterations: number = 3,
  keepAnchorsRatio: number = 0.5
): Point[] {
  if (points.length < 3) return points.slice();
  const head = points[0];
  const tail = points[points.length - 1];
  // 通常版で平滑化したあと、先頭と末尾を強制的に元に戻す。
  // + 異常値 (NaN / Infinity / 巨大値) を除去して「線が切れる」現象を防ぐ。
  const smoothed = smoothStrokePoints(points, iterations, 5000);
  const cleaned: Point[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    if (Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) continue;
    cleaned.push(p);
  }
  if (cleaned.length < 2) {
    // ほぼ全滅した場合は元の入力をそのまま返す (= 線は必ず残る)
    return points.slice();
  }
  cleaned[0] = { x: head.x, y: head.y };
  cleaned[cleaned.length - 1] = { x: tail.x, y: tail.y };
  // keepAnchorsRatio に応じて「元の points を先頭寄りに残す」
  if (keepAnchorsRatio > 0 && keepAnchorsRatio < 1 && points.length >= 4) {
    const stride = Math.max(1, Math.floor(1 / keepAnchorsRatio));
    const out: Point[] = [cleaned[0]];
    for (let i = stride; i < points.length - 1; i += stride) {
      const orig = points[i];
      out.push({ x: orig.x, y: orig.y });
      if (out.length >= 2000) break;
    }
    out[0] = { x: head.x, y: head.y };
    out.push({ x: tail.x, y: tail.y });
    return out;
  }
  return cleaned;
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
  /**
   * 作者名 (AES-GCM 暗号化済み)。
   * 形式: "v2:" + base64(IV 12byte ‖ ciphertext ‖ authTag 16byte)
   * 派生鍵 = AUTHOR_KEY ('Fans') | routeId | createdAt
   */
  author: string;
  /**
   * renderCache (旧 originalAuthor)。
   * メモリ上は平文。localStorage / JSON には author をキーに AES-GCM 暗号化して保存する。
   * 形式 (保存時): "v2:" + base64(IV 12byte ‖ ciphertext ‖ authTag 16byte)
   * 派生鍵 = RENDER_CACHE_KEY ('Colins') | routeId
   * 空 / AUTHOR_UNKNOWN_MARKER ('v2:0:') = 改ざんの疑い (Anomaly 表示)
   * メモリ表現:
   *   ''         = 未設定 (No name)
   *   文字列      = 平文 (元の作者名 / 原作者名)
   */
  renderCache: string;
  strokes: { [key in FloorType]: DrawingStroke[] };
  markers: HeistMarker[];
  walls?: { [key in FloorType]: [Point, Point][] };
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
  saveDataVersion?: string; // APP_VERSION at the time this save was last written
  presetSourceId?: string; // ID of the preset this plan was created from
}

/**
 * アプリ本体の現バージョン。
 * セーブデータ (RouteData.saveDataVersion) に書き込まれ、どのバージョンで作られたか
 * 後から判別できるようにする。デバッグタブの上部に表示される。
 */
export const APP_VERSION = '0.9.2';

/**
 * セーブデータ マイグレーション定義。
 *
 * 新しいバージョンを追加するときは SAVE_DATA_VERSION_HISTORY と
 * SAVE_DATA_MIGRATIONS の両方を更新する。
 *  - SAVE_DATA_VERSION_HISTORY: リリース済みバージョンの配列 (古い順)
 *  - SAVE_DATA_MIGRATIONS:     連続する from→to マイグレーション of 配列
 *    (App.tsx の migrateRouteCoordinates をここに段階的に移管する)。
 *
 * マイグレーションは saveDataVersion を持たない旧データを "最初の登録済みバージョン"
 * として扱い、それ以降のすべてのステップを順に適用する。リストにないバージョン
 * からのマイグレーションは安全のため適用せず、読み込み時に警告を出す。
 */

export const SAVE_DATA_VERSION_HISTORY: string[] = [
  // 新しいバージョンを末尾に追加していく (例: '0.9.0', '0.9.1', '0.10.0')
  // ※ 0.9.1 より前は saveDataVersion 自体が存在しないため、このリストは
  //    「0.9.1 で saveDataVersion が付与された」以降のバージョンを表す。
  '0.9.1',
  '0.9.2'
];

export interface SaveDataMigration {
  /** 適用前のセーブバージョン (このリストに含まれない値の場合は未登録) */
  fromVersion: string;
  /** 適用後のセーブバージョン */
  toVersion: string;
  /** 1 行で説明する変更内容 (デバッグ表示用) */
  description: string;
  /** マイグレーション本体。データを破壊しないこと。 */
  migrate: (data: RouteData) => RouteData;
}

/**
 * 旧 → 新 のセーブデータ変換リスト。
 * 新しいマイグレーションはここに追加する。
 */
export const SAVE_DATA_MIGRATIONS: SaveDataMigration[] = [
  {
    fromVersion: '0.9.1',
    toVersion: '0.9.2',
    description: 'セーブデータバージョンを0.9.2に引き上げ',
    migrate: (d) => d
  }
];

/**
 * マイグレーション適用の結果。
 *  - data:         マイグレーション適用後の RouteData (input と同じ参照の可能性あり)
 *  - applied:      実際に適用されたマイグレーション (古い順)
 *  - finalVersion: 適用後の saveDataVersion (未登録の場合は incoming のまま)
 *  - unknown:      true の場合、incoming が SAVE_DATA_VERSION_HISTORY にも
 *                  SAVE_DATA_MIGRATIONS にも存在しない値 (警告対象)
 *  - unknownVersion: unknown=true のときのバージョン文字列
 */
export interface MigrationResult {
  data: RouteData;
  applied: SaveDataMigration[];
  finalVersion: string;
  unknown: boolean;
  unknownVersion?: string;
}

function getKnownVersionIndex(v: string): number {
  return SAVE_DATA_VERSION_HISTORY.findIndex(x => x === v);
}

function findNextMigration(fromVersion: string): SaveDataMigration | undefined {
  return SAVE_DATA_MIGRATIONS.find(m => m.fromVersion === fromVersion);
}

/**
 * セーブデータにマイグレーションを適用する。
 * 不明バージョン (履歴にも fromVersion にも存在しない) の場合は適用せず unknown=true。
 * 不明バージョンはそのまま残し、上書きしない (ユーザーデータ保護)。
 */
export function runSaveDataMigrations(data: RouteData): MigrationResult {
  const incoming = data.saveDataVersion;
  // バージョン未記録 (旧データ) は「最初の履歴バージョン」とみなして処理する
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

/**
 * マイグレーションが必要かどうかだけを軽量に判定する。
 * (実際に変換は行わない、UI の警告用)
 */
export function needsSaveDataMigration(data: RouteData): boolean {
  const result = runSaveDataMigrations(data);
  return result.unknown || result.applied.length > 0;
}

export const DEFAULT_ROUTE = (id: string = 'default'): RouteData => ({
  id,
  title: 'NEW HEIST ROUTE PLAN',
  description: 'Plan description here...',
  targetCash: '100,000',
  targetCoins: '500',
  targetDuration: '720',
  author: '',
  // 新規プランの原作者は「意図的に No name で開始」。
  // 空文字 = Anomaly とは区別。 AUTHOR_DEFAULT_PLAIN 文字列 (= 'No name') で表現。
  renderCache: AUTHOR_DEFAULT_PLAIN,
  strokes: {
    main: []
  },
  markers: [],
  customBg: {
    main: null
  },
  walls: {
    main: []
  },
  bossCustomDurations: {},
  battleCustomDurations: {},
  pickingCustomDurations: {},
  longPickingCustomDurations: {},
  pickyMarkerIds: {},
  hiddenMarkers: [],
  hiddenMarkerTypes: [],
  createdAt: Date.now(),
  mapVersion: 2,
  saveDataVersion: APP_VERSION
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
  renderCache: string;
  updatedAt: number;
  /**
   * 公開レベル (省略時 / 不正値 は 'public' 扱い)。
   * 後方互換のため undefined を許容し、DataManager.normalizePreset で補完する。
   */
  visibility?: PresetVisibility;
  /**
   * プリセットの実体ルートデータ。容量削減のため localStorage には別キー
   * (`heist_preset_body_<id>`) で保存される。一覧表示では読み込まず、
   * プリセットを「呼び出す」とき (= loadFromLocal) だけオンデマンドで読む。
   * メモリ上 (= useRoute state) にも常に保持されない。
   * 旧形式 (PresetData 内に routeData を持つ) は normalizePresets で検出したら
   * migrateLegacyPreset により別キーに切り出す。
   */
  routeData?: RouteData;
}

/**
 * プリセット一覧に表示する「メタ情報のみ」の軽量版。実体 (routeData) は
 * 含まないため、一覧ロード時のメモリ/ストレージ負荷が大幅に軽い。
 */
export type PresetMeta = Omit<PresetData, 'routeData'>;

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
    // routeData がない (= 新形式 / 実体は別キー) も許可する。
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

/**
 * プリセット実体 (= RouteData) を保管する localStorage キーの接頭辞。
 * 旧形式はプリセット配列 (`heist_presets`) 内に routeData が埋め込まれていたが、
 * 容量削減のため独立キーへ分離した。接頭辞 + ID で一意になる。
 */
export const PRESET_BODY_KEY_PREFIX = 'heist_preset_body_';

export function presetBodyKey(presetId: string): string {
  return `${PRESET_BODY_KEY_PREFIX}${presetId}`;
}

/**
 * プリセットの実体 (RouteData) を localStorage に保存する。
 * 失敗時 (容量オーバー等) は例外をそのまま投げる。
 */
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

/**
 * 旧形式 (プリセット内に routeData が埋まっている) を新形式にマイグレートする。
 *  - 実体を `heist_preset_body_<id>` に切り出し
 *  - プリセット配列からは routeData を除去
 *  - localStorage を更新
 * 戻り値: マイグレーションされた (新形式) PresetData 配列
 *
 * 注意: この関数は export 関数として独立して動く必要があるため、
 *       DataManager.savePresetsToLocalStorage (クラス static メソッド) は
 *       使わず、 localStorage.setItem を直接呼ぶ。
 */
export function migrateLegacyPresetBodies(presets: PresetData[]): PresetData[] {
  const migrated: PresetData[] = [];
  let anyMigrated = false;
  for (const p of presets) {
    if (p.routeData) {
      // 旧形式: 実体を別キーに保存し、配列からは routeData を取り除く
      try { savePresetBody(p.id, p.routeData); } catch { /* quota 等: 無視 */ }
      const { routeData: _drop, ...meta } = p;
      migrated.push(meta as PresetData);
      anyMigrated = true;
    } else {
      migrated.push(p);
    }
  }
  if (anyMigrated) {
    // メタのみを書き戻す (routeData を含めない)
    try { localStorage.setItem('heist_presets', JSON.stringify(migrated)); } catch { /* ignore */ }
  }
  return migrated;
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
  main: { path: `${import.meta.env.BASE_URL}nikukyu_map.webp`, label: 'にくきゅう大強盗マップ' }
};

export class DataManager {
  // Save route to localStorage.
  // localStorage の容量上限 (QuotaExceededError) 時はセーブをブロックせず false を返す。
  // 呼び出し側で個別に通知・再試行などを行えるように例外を投げない。
  static saveToLocalStorage(route: RouteData): boolean {
    try {
      const saves = this.getSavesList();
      const index = saves.findIndex(s => s.id === route.id);
      // 既存エントリの hasCustomBg は保持する (BG 有無は setSaveMetaBg で別途更新)
      const prevHasCustomBg = index >= 0 ? !!saves[index].hasCustomBg : false;
      const entry = {
        id: route.id,
        title: route.title,
        targetCash: route.targetCash || '',
        targetCoins: route.targetCoins || '',
        description: route.description || '',
        author: route.author || '',
        renderCache: route.renderCache || '',
        createdAt: route.createdAt,
        updatedAt: Date.now(),
        hasCustomBg: prevHasCustomBg
      };
      if (index >= 0) {
        saves[index] = entry;
      } else {
        saves.push(entry);
      }

      const stamped: RouteData = { ...route, saveDataVersion: APP_VERSION };
      localStorage.setItem(`heist_route_${route.id}`, JSON.stringify(stamped));
      localStorage.setItem('heist_routes_list', JSON.stringify(saves));
      return true;
    } catch (e: any) {
      // QuotaExceededError 等: セーブをブロックせず失敗を通知
      console.error('DataManager.saveToLocalStorage failed:', e);
      return false;
    }
  }

  // セーブ一覧の hasCustomBg フラグを更新する (IndexedDB 上の BG 状態と連動させる用)
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

  // ---------------------------------------------------------------------------
  // カスタムBG (= base64 画像) の IndexedDB 経由 保存/ロード
  // ---------------------------------------------------------------------------
  //
  // カスタムBG は base64 化された PNG/JPG データで、 1枚で数百KB 〜 数MB にもなる。
  // localStorage は 5〜10MB の容量制限があり、 プランセーブ本体 (heist_route_<id>) を
  // 圧迫するため、 容量の大きなカスタムBG は IndexedDB に分離して保存する。
  //
  // 設計:
  //   - DB 名: `heist_custom_bg_db` / ObjectStore: `customBgs`
  //   - キー: プラン ID (= route.id)。 1プラン = 1エントリ
  //   - 値: { routeId, dataUrl, updatedAt }
  //   - IndexedDB が利用できない環境 (プライベートブラウジング等) では
  //     no-op (メモリ上だけで動作。 再ロードで消える)
  // ---------------------------------------------------------------------------
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
          } catch (e) {
            console.error('customBg IDB upgrade failed:', e);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.error('customBg IDB open failed:', req.error);
          resolve(null);
        };
        req.onblocked = () => resolve(null);
      } catch (e) {
        console.error('customBg IDB init failed:', e);
        resolve(null);
      }
    });
    return DataManager.customBgDbPromise;
  }

  /** カスタムBG 画像を IndexedDB に保存。 失敗しても例外を投げず false を返す。 */
  static async saveCustomBg(routeId: string, dataUrl: string | null): Promise<boolean> {
    if (!routeId) return false;
    if (dataUrl == null) {
      return DataManager.deleteCustomBg(routeId);
    }
    const db = await DataManager.openCustomBgDb();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(DataManager.customBgStoreName, 'readwrite');
        const store = tx.objectStore(DataManager.customBgStoreName);
        const req = store.put({ routeId, dataUrl, updatedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error('customBg IDB put failed:', req.error);
          resolve(false);
        };
      } catch (e) {
        console.error('customBg IDB save failed:', e);
        resolve(false);
      }
    });
  }

  /** IndexedDB から BG を読み込む。 無ければ null。 */
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
      } catch (e) {
        console.error('customBg IDB load failed:', e);
        resolve(null);
      }
    });
  }

  /** IndexedDB から BG を削除。 失敗しても例外を投げない。 */
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
        req.onerror = () => {
          console.error('customBg IDB delete failed:', req.error);
          resolve(false);
        };
      } catch (e) {
        console.error('customBg IDB delete failed:', e);
        resolve(false);
      }
    });
  }

  // Get list of saved routes
  static getSavesList(): { id: string; title: string; targetCash: string; targetCoins: string; description: string; author: string; renderCache: string; createdAt: number; updatedAt: number; hasCustomBg?: boolean }[] {
    try {
      const listStr = localStorage.getItem('heist_routes_list');
      if (!listStr) return [];
      const parsed = JSON.parse(listStr);
      if (!Array.isArray(parsed)) return [];
      // 旧 originalAuthor フィールドを renderCache へマイグレート
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
      // 重要: routeData を含めた完全版としてそのまま返す。
      // 旧コードは migrateLegacyPresetBodies で routeData を別キーに
      // 切り出していたが、 それではプリセットのマップデータが消える
      // バグがあった。 ここでは presets 配列をそのまま返す。
      return normalizePresets(parsed);
    } catch {
      return [];
    }
  }

  static savePresetsToLocalStorage(presets: PresetData[]): void {
    try {
      // 重要: プリセットは routeData (= マップ本体) を含めた完全版で保存する。
      // 旧コードは routeData を除外して別キーに保存していたが、 それでは
      // プリセットのマップデータが消えるバグがあった (= 容量削減の意図が
      // アプリ破壊に転じた)。 ここでは presets 配列をそのまま保存する。
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
      strokes: route?.strokes && typeof route.strokes === 'object'
        ? route.strokes
        : def.strokes,
      walls: route?.walls && typeof route.walls === 'object'
        ? route.walls
        : def.walls,
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
      hiddenMarkerTypes: Array.isArray(route?.hiddenMarkerTypes) ? route.hiddenMarkerTypes : def.hiddenMarkerTypes,
      renderCache:
        typeof route?.renderCache === 'string'
          ? route.renderCache
          : (typeof route?.originalAuthor === 'string' ? route.originalAuthor : def.renderCache),
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

    // Draw Background Map
    const bgImg = new Image();

    // メイン描画ロジック。Promise でラップして exportToPNG の await で待機可能にする。
    const drawAll = new Promise<void>((resolveAll) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      bgImg.onload = async () => {
        try {
          await drawAllImpl();
        } finally {
          resolveAll();
        }
      };
      bgImg.onerror = () => { resolveAll(); };
    });

    const drawAllImpl = async (): Promise<void> => {
      ctx.drawImage(bgImg, 0, 0, 1600, 4550);

      // Draw Stroke Lines — if lineThickness is specified, re-draw from route data
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

      // Save version badge (top-right of header)
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

      // Timestamp badge (below version badge, top-right)
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
      const author = route.author || '';
      // renderCache は本番ビルドでは非表示 (isLocal = DEV/localhost)
      let originalAuthor = '';
      let showOriginal = false;
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1')) {
        originalAuthor = await aesGcmDecrypt(route.renderCache || '', getOriginalAuthorKey(route.id, route.createdAt, (route as any).presetSourceId || null));
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

    await drawAll;
  }

  // Decode pixel-encoded JSON from a PNG image
  static async decodePngData(image: HTMLImageElement, rawBuffer?: ArrayBuffer): Promise<{ data: RouteData; source: 'dataBar' | 'metadata' } | null> {
    // --- Pass 1: pixel data bar (existing logic) ---
    const fromBar = await DataManager.decodePngDataBar(image);
    if (fromBar) return { data: fromBar, source: 'dataBar' };

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
