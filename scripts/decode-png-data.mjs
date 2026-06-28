#!/usr/bin/env node
// Standalone PNG data bar decoder.
//
// Reads a PNG exported by the app's "PNG出力" feature, extracts the
// pixel-encoded JSON from the bottom data bar, and writes it to disk.
//
// Usage:
//   node scripts/decode-png-data.mjs <input.png> [output.json]
//
// The decoding logic mirrors `DataManager.decodePngData` in
// src/utils/DataManager.ts so any fixes to the in-app decoder should be
// mirrored here (or extracted to a shared module).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const MAGIC = [0x4e, 0x4b, 0x4e, 0x59]; // "N K N Y"
const MAX_DATA_LEN = 50_000_000;
const MARKER_PIXEL = { rMin: 200, gMax: 50, bMin: 200 };
const MARKER_RUN = 8; // Encoder writes exactly 8 consecutive magenta pixels

function isMagenta(pixels, idx) {
  if (idx + 3 >= pixels.length) return false;
  return (
    pixels[idx] >= MARKER_PIXEL.rMin &&
    pixels[idx + 1] <= MARKER_PIXEL.gMax &&
    pixels[idx + 2] >= MARKER_PIXEL.bMin
  );
}

function findStartMarker(pixels, width, height) {
  // The encoder writes exactly 8 consecutive magenta pixels for the start
  // marker, then the magic bytes. We need the BYTE INDEX of the FIRST
  // pixel of that 8-pixel run. Warp connection lines in the map itself
  // are also drawn in magenta, so a naive 8-pixel run check would land on
  // those first. Verify the magic bytes immediately after the run before
  // committing; if they don't match, keep scanning.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (!isMagenta(pixels, idx)) continue;
      let run = 1;
      while (run < MARKER_RUN && isMagenta(pixels, idx + run * 4)) {
        run++;
      }
      if (run < MARKER_RUN) {
        x += run;
        continue;
      }
      // Verify the 4 magic bytes (G channel) right after the 8-pixel run.
      const magicStart = idx + MARKER_RUN * 4;
      const m0 = pixels[magicStart + 1];
      const m1 = pixels[magicStart + 4 + 1];
      const m2 = pixels[magicStart + 8 + 1];
      const m3 = pixels[magicStart + 12 + 1];
      if (m0 === MAGIC[0] && m1 === MAGIC[1] && m2 === MAGIC[2] && m3 === MAGIC[3]) {
        return idx;
      }
      // Not the start marker; jump past the run and keep scanning.
      x += MARKER_RUN;
    }
  }
  return -1;
}

function extractPngMetadata(pngBuffer) {
  const result = {};
  // PNG signature is 8 bytes; each chunk: 4 len + 4 type + data + 4 crc
  let offset = 8;
  while (offset + 8 <= pngBuffer.length) {
    const len = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt' && offset + 12 + len <= pngBuffer.length) {
      const chunkData = pngBuffer.subarray(offset + 8, offset + 8 + len);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx > 0) {
        const key = chunkData.subarray(0, nullIdx).toString('utf8');
        const val = chunkData.subarray(nullIdx + 1).toString('utf8');
        result[key] = val;
      }
    }
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  return result;
}

function decodePngData(inputPath) {
  const buf = readFileSync(inputPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;

  // --- Pass 1: pixel data bar ---
  const markerStart = findStartMarker(data, width, height);
  if (markerStart >= 0) {
    return decodePngDataBar(data, markerStart);
  }

  // --- Pass 2: PNG tEXt metadata fallback ---
  const meta = extractPngMetadata(buf);
  if (meta.RouteData) {
    const parsed = JSON.parse(meta.RouteData);
    // Decompress v2 strokes (delta+zigzag encoded) if present
    if (parsed._v === 2 && parsed.strokes && typeof parsed.strokes === 'object') {
      for (const floorKey of Object.keys(parsed.strokes)) {
        const val = parsed.strokes[floorKey];
        if (Array.isArray(val) && val.length > 0 && val[0].p && Array.isArray(val[0].p)) {
          parsed.strokes[floorKey] = val.map(cs => {
            const points = [];
            let x = 0, y = 0;
            for (let i = 0; i < cs.p.length; i += 2) {
              x += (cs.p[i] >>> 1) ^ -(cs.p[i] & 1);
              y += (cs.p[i + 1] >>> 1) ^ -(cs.p[i + 1] & 1);
              points.push({ x, y });
            }
            return { points, color: cs.c, width: cs.w, type: cs.t };
          });
        }
      }
      delete parsed._v;
    }
    return parsed;
  }

  throw new Error('Start marker not found (no magenta run detected) and no tEXt metadata found');
}

function decodePngDataBar(data, markerStart) {
  // Skip 8 marker pixels (32 byte-stride entries).
  const afterMarker = markerStart + 32;

  // Magic "N K N Y" from G channel of the next 4 pixels.
  const magic = [];
  for (let j = 0; j < 4; j++) {
    magic.push(data[afterMarker + j * 4 + 1]);
  }
  for (let j = 0; j < 4; j++) {
    if (magic[j] !== MAGIC[j]) {
      throw new Error(
        `Magic mismatch at byte ${j}: got 0x${magic[j].toString(16)}, expected 0x${MAGIC[j].toString(16)}`
      );
    }
  }

  // 4-byte big-endian length from G channel.
  const afterMagic = afterMarker + 16;
  const lenBytes = [
    data[afterMagic + 1],
    data[afterMagic + 5],
    data[afterMagic + 9],
    data[afterMagic + 13]
  ];
  const dataLen =
    (lenBytes[0] << 24) | (lenBytes[1] << 16) | (lenBytes[2] << 8) | lenBytes[3];
  if (dataLen === 0) {
    throw new Error('Payload length is 0');
  }
  if (dataLen > MAX_DATA_LEN) {
    throw new Error(`Payload length ${dataLen} exceeds cap ${MAX_DATA_LEN}`);
  }

  // Read payload bytes from G channel.
  const afterLen = afterMagic + 16;
  const payload = Buffer.alloc(dataLen);
  for (let i = 0; i < dataLen; i++) {
    const px = afterLen + i * 4 + 1;
    if (px >= data.length) {
      throw new Error(`Payload truncated at byte ${i} of ${dataLen}`);
    }
    payload[i] = data[px];
  }

  // Strip trailing NUL padding the encoder uses, then parse.
  const cleaned = payload.toString('utf8').replace(/\0+$/, '');
  return JSON.parse(cleaned);
}

function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error('Usage: node scripts/decode-png-data.mjs <input.png> [output.json]');
    process.exit(1);
  }
  const inputPath = resolve(inputArg);
  let decoded;
  try {
    decoded = decodePngData(inputPath);
  } catch (err) {
    console.error(`[decode-png-data] ${err.message}`);
    process.exit(2);
  }
  const json = JSON.stringify(decoded, null, 2);
  if (outputArg) {
    const outPath = resolve(outputArg);
    writeFileSync(outPath, json, 'utf8');
    console.error(`[decode-png-data] wrote ${outPath} (${json.length} bytes)`);
  } else {
    process.stdout.write(json);
  }
}

main();
