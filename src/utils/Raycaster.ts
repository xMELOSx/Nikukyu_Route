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
      if (playerDist !== undefined && t < (playerDist - 12)) {
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

    let diff = angle - player.angle;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const isCenterRay = Math.abs(diff) < 0.25;

    hits.push(castRay({ x: player.x, y: player.y }, normalizeAngle(angle), walls, isCenterRay ? playerDist : undefined));
  }
  return hits;
}

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
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
  let nx = player.x + dx;
  let ny = player.y + dy;

  const check = (x: number, y: number): boolean => {
    for (const w of walls) {
      if (pointToSegmentDist(x, y, w[0].x, w[0].y, w[1].x, w[1].y) < radius) return false;
    }
    return true;
  };

  if (!check(nx, ny)) {
    nx = player.x + dx;
    ny = player.y;
    if (!check(nx, ny)) nx = player.x;
    nx = player.x;
    ny = player.y + dy;
    if (!check(nx, ny)) ny = player.y;
  }

  return { x: nx, y: ny, angle: player.angle };
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
  let nx = player.x + dx;
  let ny = player.y + dy;

  const check = (x: number, y: number): boolean => {
    for (const w of walls) {
      if (pointToSegmentDist(x, y, w[0].x, w[0].y, w[1].x, w[1].y) < radius) return false;
    }
    return true;
  };

  if (!check(nx, ny)) {
    nx = player.x + dx;
    ny = player.y;
    if (!check(nx, ny)) nx = player.x;
    nx = player.x;
    ny = player.y + dy;
    if (!check(nx, ny)) ny = player.y;
  }

  return { x: nx, y: ny, angle: player.angle };
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
}

function renderWalls(
  args: WallRenderArgs
): { colHeights: { top: number; bottom: number; perpDist: number }[] } {
  const { ctx, canvas, origin, originAngle, walls, fov } = args;
  const W = canvas.width;
  const H = canvas.height;
  const numRays = W;
  const yOffset = -50; // 地平線を上にずらして見下ろしパースにする
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);

  const hits = castRays({ x: origin.x, y: origin.y, angle: originAngle }, walls, fov, numRays, args.playerDist);
  const colHeights: { top: number; bottom: number; perpDist: number }[] = [];

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
    const rayAngle = normalizeAngle(originAngle - fov / 2 + (i / (numRays - 1)) * fov);
    const perpDist = dist * Math.cos(rayAngle - originAngle);

    const wallHeight = perpDist > 0.1 ? (halfH / perpDist) * distPlane : H;
    // カメラの高さ比率を 0.375 とし、目線を少し下げて床面とパースを完全に合わせる
    const camHeightFrac = 0.375;
    const wallTop = Math.max(0, Math.floor(halfH - wallHeight * (1 - camHeightFrac))); // 天井側（遠い）
    const wallBottom = Math.min(H, Math.floor(halfH + wallHeight * camHeightFrac));    // 床側（近い）

    colHeights.push({ top: wallTop, bottom: wallBottom, perpDist });

    // 1. Render Ceiling to buffer
    for (let y = 0; y < wallTop; y++) {
      const idx = (y * W + i) * 4;
      const cc = i % 2 === 0 ? c1 : c2;
      buf[idx] = cc.r;
      buf[idx + 1] = cc.g;
      buf[idx + 2] = cc.b;
      buf[idx + 3] = 255;
    }

    // 2. Render Wall to buffer
    const shade = Math.min(1, 4 / perpDist);
    const colR = Math.round(darkR + (r - darkR) * shade);
    const colG = Math.round(darkG + (g - darkG) * shade);
    const colB = Math.round(darkB + (b - darkB) * shade);

    for (let y = wallTop; y < wallBottom; y++) {
      const idx = (y * W + i) * 4;
      buf[idx] = colR;
      buf[idx + 1] = colG;
      buf[idx + 2] = colB;
      buf[idx + 3] = 255;
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
        const straightDist = perpDistFloor / cosBeta;

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

    // 4. Render Front Translucent Wall Overlay (if any)
    const frontHit = castRay({ x: origin.x, y: origin.y }, rayAngle, walls);
    const frontDist = frontHit.distance;
    const frontPerpDist = frontDist * Math.cos(rayAngle - originAngle);

    let diff = rayAngle - originAngle;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const isCenterRay = Math.abs(diff) < 0.25;

    if (args.playerDist !== undefined && isCenterRay && frontDist < (args.playerDist - 12)) {
      const frontWallHeight = frontPerpDist > 0.1 ? (halfH / frontPerpDist) * distPlane : H;
      const frontWallTop = Math.max(0, Math.floor(halfH - frontWallHeight * (1 - camHeightFrac)));
      const frontWallBottom = Math.min(H, Math.floor(halfH + frontWallHeight * camHeightFrac));

      const alpha = 0.35; // 35% opacity for front walls
      const invAlpha = 1 - alpha;
      const fShade = Math.min(1, 4 / frontPerpDist);
      const fR = Math.round(darkR + (r - darkR) * fShade);
      const fG = Math.round(darkG + (g - darkG) * fShade);
      const fB = Math.round(darkB + (b - darkB) * fShade);

      for (let y = frontWallTop; y < frontWallBottom; y++) {
        const idx = (y * W + i) * 4;
        buf[idx] = Math.round(buf[idx] * invAlpha + fR * alpha);
        buf[idx + 1] = Math.round(buf[idx + 1] * invAlpha + fG * alpha);
        buf[idx + 2] = Math.round(buf[idx + 2] * invAlpha + fB * alpha);
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
  bgImageData?: ImageData | null
): { top: number; bottom: number; perpDist: number }[] {
  return renderWalls({
    ctx, canvas,
    origin: { x: player.x, y: player.y },
    originAngle: player.angle,
    walls, fov,
    wallColor, wallColorDark,
    floorColor1, floorColor2,
    ceilingColor1, ceilingColor2,
    bgImageData
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
  colHeights: { top: number; bottom: number; perpDist: number }[],
  markers: { x: number; y: number; type: string; infoLabel?: string; note?: string }[]
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

    visible.push({ dist, screenX, perpDist, pTop, pBottom, pw, ph, color: markerColor(m.type), type: m.type });
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
  bgImageData?: ImageData | null
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
    playerDist: actualCamDistance
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

    if (colHeights[i].perpDist > playerDist) {
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
