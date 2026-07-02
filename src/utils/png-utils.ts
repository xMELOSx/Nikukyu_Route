import type { Point, DrawingStroke } from './types'

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

export function insertPngMetadata(
  dataUrl: string,
  metadata: Record<string, string>
): string {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

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

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = encoder.encode(key);
    const valBytes = encoder.encode(value);
    const data = new Uint8Array(keyBytes.length + 1 + valBytes.length);
    data.set(keyBytes, 0);
    data[keyBytes.length] = 0;
    data.set(valBytes, keyBytes.length + 1);
    chunks.push(makeChunk('tEXt', data));
  }

  const totalExtra = chunks.reduce((s, c) => s + c.length, 0);
  const newBytes = new Uint8Array(bytes.length + totalExtra);
  newBytes.set(bytes.subarray(0, iendOffset), 0);
  let offset = iendOffset;
  for (const chunk of chunks) {
    newBytes.set(chunk, offset);
    offset += chunk.length;
  }
  newBytes.set(bytes.subarray(iendOffset), offset);

  let newBase64 = '';
  for (let i = 0; i < newBytes.length; i++) {
    newBase64 += String.fromCharCode(newBytes[i]);
  }
  return `data:image/png;base64,${btoa(newBase64)}`;
}

export function extractPngMetadata(pngBuffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(pngBuffer);
  const decoder = new TextDecoder();
  const result: Record<string, string> = {};
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

interface CompressedStroke {
  c: string;
  w: number;
  t: string;
  p: number[];
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

export function smoothStrokePoints(points: Point[], iterations: number = 3, maxPoints: number = 1500): Point[] {
  if (points.length < 3) return points;
  let result = points.slice();
  for (let it = 0; it < iterations; it++) {
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
    if (next.length < 2) return result;
    result = next;
  }
  return result;
}

export function smoothStrokePointsKeepEnds(
  points: Point[],
  iterations: number = 3,
  keepAnchorsRatio: number = 0.5
): Point[] {
  if (points.length < 3) return points.slice();
  const head = points[0];
  const tail = points[points.length - 1];
  const smoothed = smoothStrokePoints(points, iterations, 5000);
  const cleaned: Point[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    if (Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) continue;
    cleaned.push(p);
  }
  if (cleaned.length < 2) {
    return points.slice();
  }
  cleaned[0] = { x: head.x, y: head.y };
  cleaned[cleaned.length - 1] = { x: tail.x, y: tail.y };
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
