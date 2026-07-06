import type { Point } from '../utils/DataManager';

const TAU = Math.PI * 2;

export interface PlayerState {
  x: number;
  y: number;
  angle: number;
}

export interface RayHit {
  distance: number;
  wallIndex: number;
}

export function normalizeAngle(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

export function castRay(
  origin: { x: number; y: number },
  angle: number,
  walls: [Point, Point][],
  playerDist?: number
): RayHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minDist = Infinity;
  let hitWallIndex = -1;

  for (let i = 0; i < walls.length; i++) {
    const [a, b] = walls[i];
    const sdx = b.x - a.x;
    const sdy = b.y - a.y;
    const denom = dx * sdy - dy * sdx;
    if (Math.abs(denom) < 1e-10) continue;

    const t = ((a.x - origin.x) * sdy - (a.y - origin.y) * sdx) / denom;
    const s = ((a.x - origin.x) * dy - (a.y - origin.y) * dx) / denom;

    if (t > 0.1 && s >= 0 && s <= 1) {
      if (playerDist !== undefined && t < playerDist) {
        continue;
      }
      if (t < minDist) {
        minDist = t;
        hitWallIndex = i;
      }
    }
  }

  return { distance: minDist, wallIndex: hitWallIndex };
}

export function castRays(
  player: PlayerState,
  walls: [Point, Point][],
  fov: number,
  numRays: number,
  playerDist?: number
): RayHit[] {
  const halfFov = fov / 2;
  const hits: RayHit[] = [];
  for (let i = 0; i < numRays; i++) {
    const frac = numRays > 1 ? i / (numRays - 1) : 0.5;
    const angle = player.angle - halfFov + frac * fov;

    hits.push(castRay({ x: player.x, y: player.y }, normalizeAngle(angle), walls, playerDist));
  }
  return hits;
}

export function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function movePlayerCommon(
  player: PlayerState,
  dx: number, dy: number,
  walls: [Point, Point][],
  radius: number
): PlayerState {
  let nx = player.x + dx;
  let ny = player.y + dy;

  const check = (x: number, y: number): boolean => {
    for (const w of walls) {
      if (pointToSegmentDist(x, y, w[0].x, w[0].y, w[1].x, w[1].y) < radius) return false;
    }
    return true;
  };

  if (!check(nx, ny)) {
    const nxTest = player.x + dx;
    if (check(nxTest, player.y)) {
      nx = nxTest;
      ny = player.y;
    } else {
      const nyTest = player.y + dy;
      if (check(player.x, nyTest)) {
        nx = player.x;
        ny = nyTest;
      } else {
        nx = player.x;
        ny = player.y;
      }
    }
  }

  return { x: nx, y: ny, angle: player.angle };
}

export function movePlayer(
  player: PlayerState,
  forward: number,
  strafe: number,
  walls: [Point, Point][],
  speed: number,
  radius: number
): PlayerState {
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  const dx = (forward * cos - strafe * sin) * speed;
  const dy = (forward * sin + strafe * cos) * speed;
  return movePlayerCommon(player, dx, dy, walls, radius);
}

export function movePlayerTps(
  player: PlayerState,
  forward: number,
  strafe: number,
  camAngle: number,
  walls: [Point, Point][],
  speed: number,
  radius: number
): PlayerState {
  const cos = Math.cos(camAngle);
  const sin = Math.sin(camAngle);
  const dx = (forward * cos - strafe * sin) * speed;
  const dy = (forward * sin + strafe * cos) * speed;
  return movePlayerCommon(player, dx, dy, walls, radius);
}

interface WallRenderArgs {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  origin: { x: number; y: number };
  originAngle: number;
  walls: [Point, Point][];
  fov: number;
  wallColor: string;
  wallColorDark: string;
  floorColor1: string;
  floorColor2: string;
  ceilingColor1: string;
  ceilingColor2: string;
  bgImageData?: ImageData | null;
  playerDist?: number;
  lockedWalls?: [Point, Point][];
  lockedWallColor?: string;
  lockedWallColorDark?: string;
  lockedWallHeightFrac?: number;
  playerPos?: { x: number; y: number };
  wallFadeRadius?: number;
}

function renderWalls(
  args: WallRenderArgs
): { colHeights: { top: number; bottom: number; perpDist: number; rawDist: number }[] } {
  const { ctx, canvas, origin, originAngle, walls, fov } = args;
  const W = canvas.width;
  const H = canvas.height;
  const numRays = W;
  const yOffset = -50; // 地平線を上にずらして見下ろしパースにする
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);

  const hits = castRays({ x: origin.x, y: origin.y, angle: originAngle }, walls, fov, numRays, args.playerDist);
  const lw = args.lockedWalls;
  const lockedHits = lw && lw.length > 0
    ? castRays({ x: origin.x, y: origin.y, angle: originAngle }, lw, fov, numRays, args.playerDist)
    : null;
  const colHeights: { top: number; bottom: number; perpDist: number; rawDist: number }[] = [];

  // Create screen pixel buffer
  const imgData = ctx.createImageData(W, H);
  const buf = imgData.data;

  // Pre-parse wall colors
  const r = parseInt(args.wallColor.slice(1, 3), 16);
  const g = parseInt(args.wallColor.slice(3, 5), 16);
  const b = parseInt(args.wallColor.slice(5, 7), 16);
  const darkR = parseInt(args.wallColorDark.slice(1, 3), 16);
  const darkG = parseInt(args.wallColorDark.slice(3, 5), 16);
  const darkB = parseInt(args.wallColorDark.slice(5, 7), 16);

  // Pre-parse locked wall colors
  const lr = args.lockedWallColor ? parseInt(args.lockedWallColor.slice(1, 3), 16) : r;
  const lg = args.lockedWallColor ? parseInt(args.lockedWallColor.slice(3, 5), 16) : g;
  const lb = args.lockedWallColor ? parseInt(args.lockedWallColor.slice(5, 7), 16) : b;
  const lDarkR = args.lockedWallColorDark ? parseInt(args.lockedWallColorDark.slice(1, 3), 16) : darkR;
  const lDarkG = args.lockedWallColorDark ? parseInt(args.lockedWallColorDark.slice(3, 5), 16) : darkG;
  const lDarkB = args.lockedWallColorDark ? parseInt(args.lockedWallColorDark.slice(5, 7), 16) : darkB;
  const lhf = args.lockedWallHeightFrac ?? 0.5;

  // Pre-parse ceiling / floor colors
  const parseHex = (hex: string) => {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  };
  const c1 = parseHex(args.ceilingColor1);
  const c2 = parseHex(args.ceilingColor2);
  const f1 = parseHex(args.floorColor1);
  const f2 = parseHex(args.floorColor2);

  for (let i = 0; i < numRays; i++) {
    const hit = hits[i];
    const dist = hit.distance;

    // Check if a locked wall is closer
    let isLocked = false;
    let lockedDist = dist;
    if (lockedHits) {
      const lHit = lockedHits[i];
      if (lHit.distance < dist) {
        lockedDist = lHit.distance;
        isLocked = true;
      }
    }
    const effectiveDist = isLocked ? lockedDist : dist;
    const rayAngle = normalizeAngle(originAngle - fov / 2 + (i / (numRays - 1)) * fov);
    const perpDist = effectiveDist * Math.cos(rayAngle - originAngle);

    let fullWallHeight = perpDist > 0.1 ? (halfH / perpDist) * distPlane : H;
    // カメラの高さ比率を 0.375 とし、目線を少し下げて床面とパースを完全に合わせる
    const camHeightFrac = 0.375;
    const wallTopFull = Math.max(0, Math.floor(halfH - fullWallHeight * (1 - camHeightFrac))); // 天井側（遠い）
    const wallBottomFull = Math.min(H, Math.floor(halfH + fullWallHeight * camHeightFrac));    // 床側（近い）

    let wallTop = wallTopFull;
    let wallBottom = wallBottomFull;
    // Background wall info (for rendering behind locked walls)
    let bgWallTop = wallTopFull;
    let bgWallBottom = wallBottomFull;
    let bgPerpDist = perpDist;
    if (isLocked) {
      // 鍵付き壁は地面から lhf の高さまで描画（浮かせず地面設置）
      const lockedH = (wallBottomFull - wallTopFull) * lhf;
      wallTop = Math.max(0, Math.floor(wallBottomFull - lockedH));
      wallBottom = wallBottomFull;
      // 後ろにある通常壁の位置を計算
      if (hit.distance < Infinity) {
        const bgDist = hit.distance;
        bgPerpDist = bgDist * Math.cos(rayAngle - originAngle);
        const bgH = bgPerpDist > 0.1 ? (halfH / bgPerpDist) * distPlane : H;
        bgWallTop = Math.max(0, Math.floor(halfH - bgH * (1 - camHeightFrac)));
        bgWallBottom = Math.min(H, Math.floor(halfH + bgH * camHeightFrac));
      }
    }

    colHeights.push({ top: wallTop, bottom: wallBottom, perpDist, rawDist: effectiveDist });

    // 1. Render Ceiling / background wall to buffer
    const renderFloorGap = (yStart: number, yEnd: number) => {
      const bg = args.bgImageData;
      const cosRay = Math.cos(rayAngle);
      const sinRay = Math.sin(rayAngle);
      const cosBeta = Math.cos(rayAngle - originAngle);
      const camHeight = 24;
      for (let y = yStart; y < yEnd; y++) {
        const idx = (y * W + i) * 4;
        const denom = y - halfH;
        if (denom <= 0) {
          // 地平線より上 → 天井色
          const cc = i % 2 === 0 ? c1 : c2;
          buf[idx] = cc.r;
          buf[idx + 1] = cc.g;
          buf[idx + 2] = cc.b;
          buf[idx + 3] = 255;
          continue;
        }
        if (bg) {
          const perpDistFloor = (camHeight * distPlane) / denom;
          const straightDist = Math.min(perpDistFloor / cosBeta, 800);
          const wx = origin.x + cosRay * straightDist;
          const wy = origin.y + sinRay * straightDist;
          const tx = Math.floor(wx);
          const ty = Math.floor(wy);
          let fr = 13, fg = 20, fb = 36;
          if (tx >= 0 && tx < bg.width && ty >= 0 && ty < bg.height) {
            const bIdx = (ty * bg.width + tx) * 4;
            fr = bg.data[bIdx];
            fg = bg.data[bIdx + 1];
            fb = bg.data[bIdx + 2];
          }
          buf[idx] = fr;
          buf[idx + 1] = fg;
          buf[idx + 2] = fb;
        } else {
          const fcol = i % 2 === 0 ? f1 : f2;
          buf[idx] = fcol.r;
          buf[idx + 1] = fcol.g;
          buf[idx + 2] = fcol.b;
        }
        buf[idx + 3] = 255;
      }
    };

    if (isLocked && hit.distance < Infinity && bgWallTop < wallTop) {
      // 鍵壁の上に通常壁が見える部分を描画
      const bgShade = Math.min(1, 4 / bgPerpDist);
      const bgR = Math.round(darkR + (r - darkR) * bgShade);
      const bgG = Math.round(darkG + (g - darkG) * bgShade);
      const bgB = Math.round(darkB + (b - darkB) * bgShade);
      const renderTop = Math.max(0, bgWallTop);
      const renderBot = Math.min(wallTop, bgWallBottom);
      for (let y = renderTop; y < renderBot; y++) {
        const idx = (y * W + i) * 4;
        buf[idx] = bgR;
        buf[idx + 1] = bgG;
        buf[idx + 2] = bgB;
        buf[idx + 3] = 255;
      }
      // 天井 (背景壁の上)
      for (let y = 0; y < bgWallTop; y++) {
        const idx = (y * W + i) * 4;
        const cc = i % 2 === 0 ? c1 : c2;
        buf[idx] = cc.r;
        buf[idx + 1] = cc.g;
        buf[idx + 2] = cc.b;
        buf[idx + 3] = 255;
      }
      // 壁と床の間 (背景壁の下端〜鍵壁の上端) を床テクスチャで描画
      if (bgWallBottom < wallTop) {
        renderFloorGap(bgWallBottom, wallTop);
      }
    } else if (isLocked) {
      // 背後に壁がない／見えない鍵壁 → 壁の上は床テクスチャ
      renderFloorGap(0, wallTop);
    } else {
      for (let y = 0; y < wallTop; y++) {
        const idx = (y * W + i) * 4;
        const cc = i % 2 === 0 ? c1 : c2;
        buf[idx] = cc.r;
        buf[idx + 1] = cc.g;
        buf[idx + 2] = cc.b;
        buf[idx + 3] = 255;
      }
    }

    // 2. Render Wall to buffer (with player proximity fade)
    const shade = Math.min(1, 4 / perpDist);
    let colR = Math.round(isLocked ? (lDarkR + (lr - lDarkR) * shade) : (darkR + (r - darkR) * shade));
    let colG = Math.round(isLocked ? (lDarkG + (lg - lDarkG) * shade) : (darkG + (g - darkG) * shade));
    let colB = Math.round(isLocked ? (lDarkB + (lb - lDarkB) * shade) : (darkB + (b - darkB) * shade));

    // プレイヤー近距離フェード: 壁がプレイヤーに近いほど背景色に近づける
    let wallFade = 1.0;
    if (args.playerPos && args.wallFadeRadius && hit.wallIndex >= 0 && !isLocked) {
      const w = walls[hit.wallIndex];
      const pDist = pointToSegmentDist(args.playerPos.x, args.playerPos.y, w[0].x, w[0].y, w[1].x, w[1].y);
      if (pDist < args.wallFadeRadius) {
        wallFade = Math.max(0, pDist / args.wallFadeRadius);
      }
    }

    for (let y = wallTop; y < wallBottom; y++) {
      const idx = (y * W + i) * 4;
      if (wallFade < 1) {
        // 天井/床色にブレンドしてフェード
        const isTopHalf = y < halfH;
        const bgR = isTopHalf ? c1.r : f1.r;
        const bgG = isTopHalf ? c1.g : f1.g;
        const bgB = isTopHalf ? c1.b : f1.b;
        buf[idx] = Math.round(colR * wallFade + bgR * (1 - wallFade));
        buf[idx + 1] = Math.round(colG * wallFade + bgG * (1 - wallFade));
        buf[idx + 2] = Math.round(colB * wallFade + bgB * (1 - wallFade));
        buf[idx + 3] = 255;
      } else {
        buf[idx] = colR;
        buf[idx + 1] = colG;
        buf[idx + 2] = colB;
        buf[idx + 3] = 255;
      }
    }

    // 3. Render Floor to buffer (Floor Casting)
    if (args.bgImageData) {
      const bg = args.bgImageData;
      const camHeight = 24; // カメラの目線の高さ（32から24に下げて低くする）
      const cosRay = Math.cos(rayAngle);
      const sinRay = Math.sin(rayAngle);
      const cosBeta = Math.cos(rayAngle - originAngle);

      for (let y = wallBottom; y < H; y++) {
        const idx = (y * W + i) * 4;
        const denom = y - halfH;
        if (denom <= 0) {
          buf[idx] = 13; buf[idx+1] = 20; buf[idx+2] = 36; buf[idx+3] = 255;
          continue;
        }
        const perpDistFloor = (camHeight * distPlane) / denom;
        const straightDist = Math.min(perpDistFloor / cosBeta, 800);

        const wx = origin.x + cosRay * straightDist;
        const wy = origin.y + sinRay * straightDist;

        const tx = Math.floor(wx);
        const ty = Math.floor(wy);

        let fr = 13, fg = 20, fb = 36; // デフォルト床色
        if (tx >= 0 && tx < bg.width && ty >= 0 && ty < bg.height) {
          const bIdx = (ty * bg.width + tx) * 4;
          fr = bg.data[bIdx];
          fg = bg.data[bIdx + 1];
          fb = bg.data[bIdx + 2];
        }

        buf[idx] = fr;
        buf[idx + 1] = fg;
        buf[idx + 2] = fb;
        buf[idx + 3] = 255;
      }
    } else {
      for (let y = wallBottom; y < H; y++) {
        const idx = (y * W + i) * 4;
        const fc = i % 2 === 0 ? f1 : f2;
        buf[idx] = fc.r;
        buf[idx + 1] = fc.g;
        buf[idx + 2] = fc.b;
        buf[idx + 3] = 255;
      }
    }

  }

  // Draw buffer to canvas in 1 draw call!
  ctx.putImageData(imgData, 0, 0);

  return { colHeights };
}

export function renderFpsView(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  player: PlayerState,
  walls: [Point, Point][],
  fov: number,
  wallColor: string,
  wallColorDark: string,
  floorColor1: string,
  floorColor2: string,
  ceilingColor1: string,
  ceilingColor2: string,
  bgImageData?: ImageData | null,
  lockedWalls?: [Point, Point][],
  lockedWallColor?: string,
  lockedWallColorDark?: string,
  lockedWallHeightFrac?: number,
  playerPos?: { x: number; y: number },
  wallFadeRadius?: number
): { top: number; bottom: number; perpDist: number }[] {
  return renderWalls({
    ctx, canvas,
    origin: { x: player.x, y: player.y },
    originAngle: player.angle,
    walls, fov,
    wallColor, wallColorDark,
    floorColor1, floorColor2,
    ceilingColor1, ceilingColor2,
    bgImageData,
    lockedWalls, lockedWallColor, lockedWallColorDark, lockedWallHeightFrac,
    playerPos, wallFadeRadius
  }).colHeights;
}

const PLAYER_HEIGHT = 6;
const PLAYER_WIDTH = 2;
const MINIMAP_SIZE = 70;
const MINIMAP_RANGE = 500;

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  walls: [Point, Point][],
  markers: { x: number; y: number; type: string }[],
  bgImage?: HTMLCanvasElement | HTMLImageElement | null
): void {
  const margin = 14;
  const x = margin; // 左上に配置
  const y = margin;
  const half = MINIMAP_SIZE / 2;
  const scale = MINIMAP_SIZE / MINIMAP_RANGE;

  // クリッピング境界を設定してはみ出しを防ぐ
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.clip();

  if (bgImage) {
    const sw = MINIMAP_RANGE;
    const sh = MINIMAP_RANGE;
    const sx = player.x - sw / 2;
    const sy = player.y - sh / 2;
    ctx.drawImage(bgImage, sx, sy, sw, sh, x, y, MINIMAP_SIZE, MINIMAP_SIZE);
  } else {
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x, y, MINIMAP_SIZE, MINIMAP_SIZE);
  }

  // ミニマップ外枠のストローク
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, MINIMAP_SIZE, MINIMAP_SIZE);

  // グリッド線（背景画像がない場合のみ描画する、あるいは常に薄く重ねる）
  if (!bgImage) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let g = 100; g < MINIMAP_RANGE; g += 100) {
      const gp = g * scale;
      ctx.beginPath();
      ctx.moveTo(x, y + half - gp); ctx.lineTo(x + MINIMAP_SIZE, y + half - gp);
      ctx.moveTo(x + half + gp, y); ctx.lineTo(x + half + gp, y + MINIMAP_SIZE);
      ctx.moveTo(x + half - gp, y); ctx.lineTo(x + half - gp, y + MINIMAP_SIZE);
      ctx.stroke();
    }
  }

  // Walls within range
  ctx.strokeStyle = 'rgba(255, 85, 0, 0.5)';
  ctx.lineWidth = 1;
  for (const w of walls) {
    const ax = (w[0].x - player.x) * scale + half;
    const ay = (w[0].y - player.y) * scale + half;
    const bx = (w[1].x - player.x) * scale + half;
    const by = (w[1].y - player.y) * scale + half;
    if (Math.min(ax, bx) < -20 || Math.max(ax, bx) > MINIMAP_SIZE + 20 ||
        Math.min(ay, by) < -20 || Math.max(ay, by) > MINIMAP_SIZE + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
    ctx.stroke();
  }

  // Markers within range
  for (const m of markers) {
    const dx = (m.x - player.x) * scale;
    const dy = (m.y - player.y) * scale;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    const mx = x + half + dx;
    const my = y + half + dy;
    ctx.fillStyle = m.type === 'start' ? '#39ff14' : '#ff00ff';
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }

  // Player direction cone
  ctx.fillStyle = 'rgba(57, 255, 20, 0.12)';
  ctx.beginPath();
  ctx.moveTo(x + half, y + half);
  const coneLen = 14;
  ctx.lineTo(
    x + half + Math.cos(player.angle - 0.3) * coneLen,
    y + half + Math.sin(player.angle - 0.3) * coneLen
  );
  ctx.lineTo(
    x + half + Math.cos(player.angle + 0.3) * coneLen,
    y + half + Math.sin(player.angle + 0.3) * coneLen
  );
  ctx.fill();

  // Player dot
  ctx.fillStyle = '#39ff14';
  ctx.beginPath();
  ctx.arc(x + half, y + half, 3, 0, Math.PI * 2);
  ctx.fill();

  // Direction line
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + half, y + half);
  ctx.lineTo(
    x + half + Math.cos(player.angle) * coneLen,
    y + half + Math.sin(player.angle) * coneLen
  );
  ctx.stroke();

  ctx.restore();
}

/** 独立した高解像度ミニマップcanvasに描画。壁/マーカーの上書きはせずbgImageだけを表示 */
export function renderMinimapView(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  bgImage?: HTMLCanvasElement | HTMLImageElement | null
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const range = 250;
  const cx = W / 2;
  const cy = H / 2;

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  if (bgImage) {
    const sx = player.x - range / 2;
    const sy = player.y - range / 2;
    ctx.drawImage(bgImage, sx, sy, range, range, 0, 0, W, H);
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, W, H);
  }

  // Player dot
  ctx.fillStyle = '#39ff14';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Direction line
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(player.angle) * 20, cy + Math.sin(player.angle) * 20);
  ctx.stroke();

  ctx.restore();
}

function markerColor(type: string): string {
  switch (type) {
    case 'start': return '#39ff14';
    case 'stairs': return '#ffaa00';
    case 'warp':
    case 'iwarp': return '#ff44ff';
    case 'goal': return '#ffdd00';
    case 'boss':
    case 'gbattle': return '#ff3333';
    case 'info':
    case 'iinfo':
    case 'note':
    case 'inote':
    case 'text':
    case 'itext': return '#00bbff';
    case 'phone': return '#ff8800';
    default: return '#00ffcc';
  }
}

export function renderMarkers3D(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  origin: { x: number; y: number },
  originAngle: number,
  fov: number,
  colHeights: { top: number; bottom: number; perpDist: number; rawDist: number }[],
  markers: { x: number; y: number; type: string; infoLabel?: string; note?: string; phoneActive?: boolean; phoneLocked?: boolean }[]
): void {
  if (markers.length === 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const yOffset = -50;
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);
  const halfFov = fov / 2;
  const camHeight = 24;
  const MARKER_WORLD_HEIGHT = 12;
  const MARKER_WORLD_WIDTH = 1.5;

  const visible: { dist: number; screenX: number; perpDist: number; pTop: number; pBottom: number; pw: number; ph: number; color: string; type: string }[] = [];

  for (const m of markers) {
    const dx = m.x - origin.x;
    const dy = m.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;

    const angleToMarker = Math.atan2(dy, dx);
    let relAngle = normalizeAngle(angleToMarker - originAngle);
    if (relAngle > Math.PI) relAngle -= TAU;
    if (Math.abs(relAngle) > halfFov) continue;

    const screenX = Math.round(((relAngle + halfFov) / fov) * (W - 1));
    const perpDist = dist * Math.cos(relAngle);
    if (perpDist < 1 || screenX < 0 || screenX >= W) continue;

    if (colHeights[screenX].perpDist < perpDist) continue;

    const ph = Math.max(2, Math.round((MARKER_WORLD_HEIGHT * distPlane) / perpDist));
    const pw = Math.max(1, Math.round((MARKER_WORLD_WIDTH * distPlane) / perpDist));
    const pBottom = Math.round(halfH + (camHeight * distPlane) / perpDist);
    const pTop = pBottom - ph;

    let markerCol = markerColor(m.type);
    if (m.type === 'phone') {
      markerCol = (m.phoneActive || m.phoneLocked) ? '#ff3333' : '#888888';
    }
    visible.push({ dist, screenX, perpDist, pTop, pBottom, pw, ph, color: markerCol, type: m.type });
  }

  // Sort far to near for correct overdraw
  visible.sort((a, b) => b.dist - a.dist);

  // Track already-drawn label x-ranges to avoid overlap
  const drawnLabels: { x: number; y: number; halfW: number; h: number }[] = [];

  for (const v of visible) {
    const glow = v.color + '30';
    ctx.fillStyle = glow;
    ctx.fillRect(v.screenX - v.pw - 1, v.pTop - 1, v.pw * 2 + 2, v.ph + 2);
    ctx.fillStyle = v.color;
    ctx.fillRect(v.screenX - v.pw, v.pTop, v.pw * 2, v.ph);
  }

  // Render labels for markers that have infoLabel or note
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const m of markers) {
    const label = m.infoLabel || m.note;
    if (!label) continue;

    const dx = m.x - origin.x;
    const dy = m.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;

    const angleToMarker = Math.atan2(dy, dx);
    let relAngle = normalizeAngle(angleToMarker - originAngle);
    if (relAngle > Math.PI) relAngle -= TAU;
    if (Math.abs(relAngle) > halfFov) continue;

    const screenX = Math.round(((relAngle + halfFov) / fov) * (W - 1));
    const perpDist = dist * Math.cos(relAngle);
    if (perpDist < 1 || screenX < 0 || screenX >= W) continue;

    if (colHeights[screenX].perpDist < perpDist) continue;

    const labelPx = Math.max(4, Math.round(5 * distPlane / perpDist));
    const pBottom = Math.round(halfH + (camHeight * distPlane) / perpDist);
    const ph = Math.max(2, Math.round((12 * distPlane) / perpDist)); // MARKER_WORLD_HEIGHT = 12
    const pTop = pBottom - ph;
    ctx.font = `${labelPx}px monospace`;

    const truncated = label.length > 20 ? label.slice(0, 20) + '…' : label;
    const textWidth = ctx.measureText(truncated).width;

    // Check overlap with previously drawn labels
    const halfW = textWidth / 2;
    const labelX = screenX;
    const labelY = pTop - labelPx - 4;
    const labelH = labelPx + 2;
    const overlaps = drawnLabels.some(d =>
      Math.abs(d.x - labelX) < (halfW + d.halfW + 4) &&
      Math.abs(d.y - labelY) < labelH + 2
    );
    if (overlaps) continue;
    drawnLabels.push({ x: labelX, y: labelY, halfW: halfW + 2, h: labelH });

    ctx.fillStyle = '#000000cc';
    ctx.fillRect(labelX - textWidth / 2 - 2, labelY - 1, textWidth + 4, labelH + 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(truncated, labelX, labelY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncated, labelX, labelY);
  }
}

export function renderTpsView(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  player: PlayerState,
  walls: [Point, Point][],
  fov: number,
  camDistance: number,
  wallColor: string,
  wallColorDark: string,
  floorColor1: string,
  floorColor2: string,
  ceilingColor1: string,
  ceilingColor2: string,
  playerColor: string,
  bgImageData?: ImageData | null,
  lockedWalls?: [Point, Point][],
  lockedWallColor?: string,
  lockedWallColorDark?: string,
  lockedWallHeightFrac?: number,
  playerPos?: { x: number; y: number },
  wallFadeRadius?: number
): { top: number; bottom: number; perpDist: number }[] {
  const actualCamDistance = camDistance;

  const camX = player.x - Math.cos(player.angle) * actualCamDistance;
  const camY = player.y - Math.sin(player.angle) * actualCamDistance;

  const { colHeights } = renderWalls({
    ctx, canvas,
    origin: { x: camX, y: camY },
    originAngle: player.angle,
    walls, fov,
    wallColor, wallColorDark,
    floorColor1, floorColor2,
    ceilingColor1, ceilingColor2,
    bgImageData,
    playerDist: actualCamDistance,
    lockedWalls, lockedWallColor, lockedWallColorDark, lockedWallHeightFrac,
    playerPos, wallFadeRadius
  });

  // Render player billboard
  const W = canvas.width;
  const H = canvas.height;
  const yOffset = -50; // 地平線を上にずらして見下ろしパースにする
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);

  const dx = player.x - camX;
  const dy = player.y - camY;
  const playerDist = Math.hypot(dx, dy);
  if (playerDist < 1) return colHeights;

  const angleToPlayer = Math.atan2(dy, dx);
  let relAngle = normalizeAngle(angleToPlayer - player.angle);
  if (relAngle > Math.PI) relAngle -= TAU;
  const halfFov = fov / 2;
  if (Math.abs(relAngle) > halfFov + 0.05) return colHeights;

  const pCol = Math.round(((relAngle + halfFov) / fov) * (W - 1));
  const pAngularWidth = Math.atan2(PLAYER_WIDTH / 2, playerDist);
  const pHalfWidth = Math.max(1, Math.round((pAngularWidth / fov) * W));
  const pPerpDist = playerDist * Math.cos(relAngle);
  const pScreenHeight = Math.round((PLAYER_HEIGHT * distPlane) / pPerpDist);

  // アバターの足元をその距離の床面（camHeight = 30）の射影位置に正確に接地させ、手前に15px寄せる
  const camHeight = 30;
  const pBottom = Math.round(halfH + (camHeight * distPlane) / pPerpDist) + 15;
  const pTop = pBottom - pScreenHeight;

  const pr = parseInt(playerColor.slice(1, 3), 16);
  const pg = parseInt(playerColor.slice(3, 5), 16);
  const pb = parseInt(playerColor.slice(5, 7), 16);

  for (let i = Math.max(0, pCol - pHalfWidth); i <= Math.min(W - 1, pCol + pHalfWidth); i++) {
    const relI = pCol - i;
    const distFromCenter = Math.abs(relI) / pHalfWidth;
    if (distFromCenter > 1) continue;

    const thickness = 1 - distFromCenter;
    const bodyH = Math.round(pBottom - pTop);
    const bodyTop = Math.round(pTop + bodyH * 0.1 * (1 - thickness));

    if (colHeights[i].rawDist > playerDist) {
      const shade = 0.6 + 0.4 * thickness;
      ctx.fillStyle = `rgb(${Math.round(pr * shade)},${Math.round(pg * shade)},${Math.round(pb * shade)})`;
      ctx.fillRect(i, bodyTop, 1, pBottom - bodyTop);

      // head circle
      const headSize = Math.max(2, Math.round(pScreenHeight * 0.12 * thickness));
      const headY = Math.round(bodyTop - headSize * 1.2);
      ctx.fillRect(i, headY, 1, headSize);
    }
  }
  return colHeights;
}
