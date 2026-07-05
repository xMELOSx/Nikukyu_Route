import type { Point } from '../utils/DataManager';
import { MARKER_META } from './constants';

const TAU = Math.PI * 2;

let tempMinimapCanvas: HTMLCanvasElement | null = null;
let tempMinimapCtx: CanvasRenderingContext2D | null = null;
let tempMinimapImageData: ImageData | null = null;

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
  walls: [Point, Point][]
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

    if (t > 0.1 && s >= 0 && s <= 1 && t < minDist) {
      minDist = t;
      hitWallIndex = i;
    }
  }

  return { distance: minDist, wallIndex: hitWallIndex };
}

export function castRays(
  player: PlayerState,
  walls: [Point, Point][],
  fov: number,
  numRays: number
): RayHit[] {
  const halfFov = fov / 2;
  const hits: RayHit[] = [];
  for (let i = 0; i < numRays; i++) {
    const frac = numRays > 1 ? i / (numRays - 1) : 0.5;
    const angle = player.angle - halfFov + frac * fov;
    hits.push(castRay({ x: player.x, y: player.y }, normalizeAngle(angle), walls));
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

  const check = (x: number, y: number): boolean => {
    for (const w of walls) {
      if (pointToSegmentDist(x, y, w[0].x, w[0].y, w[1].x, w[1].y) < radius) return false;
    }
    return true;
  };

  const steps = 4;
  const stepSpeed = speed / steps;
  let cx = player.x;
  let cy = player.y;

  for (let s = 0; s < steps; s++) {
    const dx = (forward * cos - strafe * sin) * stepSpeed;
    const dy = (forward * sin + strafe * cos) * stepSpeed;

    const nx = cx + dx;
    const ny = cy + dy;

    if (check(nx, ny)) {
      cx = nx;
      cy = ny;
    } else {
      const tryX = cx + dx;
      if (check(tryX, cy)) {
        cx = tryX;
      } else {
        const tryY = cy + dy;
        if (check(cx, tryY)) {
          cy = tryY;
        }
      }
    }
  }

  return { x: cx, y: cy, angle: player.angle };
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

  const check = (x: number, y: number): boolean => {
    for (const w of walls) {
      if (pointToSegmentDist(x, y, w[0].x, w[0].y, w[1].x, w[1].y) < radius) return false;
    }
    return true;
  };

  const steps = 4;
  const stepSpeed = speed / steps;
  let cx = player.x;
  let cy = player.y;

  for (let s = 0; s < steps; s++) {
    const dx = (forward * cos - strafe * sin) * stepSpeed;
    const dy = (forward * sin + strafe * cos) * stepSpeed;

    const nx = cx + dx;
    const ny = cy + dy;

    if (check(nx, ny)) {
      cx = nx;
      cy = ny;
    } else {
      const tryX = cx + dx;
      if (check(tryX, cy)) {
        cx = tryX;
      } else {
        const tryY = cy + dy;
        if (check(cx, tryY)) {
          cy = tryY;
        }
      }
    }
  }

  return { x: cx, y: cy, angle: player.angle };
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
  camHeight?: number;
  yOffset?: number;
  markers?: { x: number; y: number; type: string; id?: string; linkedWarpId?: string }[];
  playerDist?: number;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  if (hex && hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }
  return { r: 10, g: 15, b: 28 };
}

function renderWalls(
  args: WallRenderArgs
): { colHeights: { top: number; bottom: number; perpDist: number }[] } {
  const { ctx, canvas, origin, originAngle, walls, fov } = args;
  const W = canvas.width;
  const H = canvas.height;
  const numRays = W;
  const yOffset = args.yOffset ?? Math.round(H * -0.2083); // Hに対し比率で地平線を上にずらして見下ろしパースにする
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);
  const camHeight = args.camHeight ?? 24;
  const camHeightFrac = camHeight / 64;

  const hits = castRays({ x: origin.x, y: origin.y, angle: originAngle }, walls, fov, numRays);
  const colHeights: { top: number; bottom: number; perpDist: number }[] = [];

  // Create an offscreen pixel buffer to batch render the background, walls, and floor.
  // Writing to a raw Uint8ClampedArray is extremely fast and avoids ctx.fillRect overhead.
  const imgData = ctx.createImageData(W, H);
  const buf = imgData.data;

  // Pre-parse hex colors to RGB for fast pixel writing
  const c1_rgb = parseHexColor(args.ceilingColor1);
  const c2_rgb = parseHexColor(args.ceilingColor2);
  const f1_rgb = parseHexColor(args.floorColor1);
  const f2_rgb = parseHexColor(args.floorColor2);
  const w_rgb = parseHexColor(args.wallColor);
  const wd_rgb = parseHexColor(args.wallColorDark);

  for (let i = 0; i < numRays; i++) {
    const hit = hits[i];
    const dist = hit.distance;
    const rayAngle = normalizeAngle(originAngle - fov / 2 + (i / (numRays - 1)) * fov);
    const perpDist = dist * Math.cos(rayAngle - originAngle);

    const wallHeight = perpDist > 0.1 ? (64 / perpDist) * distPlane : H;
    const wallTop = Math.max(0, Math.floor(halfH - wallHeight * (1 - camHeightFrac))); // 天井側（遠い）
    const wallBottom = Math.min(H, Math.floor(halfH + wallHeight * camHeightFrac));    // 床側（近い）
    colHeights.push({ top: wallTop, bottom: wallBottom, perpDist });

    const isOverlayInFront = args.playerDist !== undefined && perpDist < args.playerDist;

    // Render Ceiling to buffer
    for (let y = 0; y < wallTop; y++) {
      const idx = (y * W + i) * 4;
      if (isOverlayInFront) {
        // Semi-transparent ceiling blending with base background (#0a0f1c)
        buf[idx] = 10;
        buf[idx + 1] = 15;
        buf[idx + 2] = 28;
      } else {
        const rgb = i % 2 === 0 ? c1_rgb : c2_rgb;
        buf[idx] = rgb.r;
        buf[idx + 1] = rgb.g;
        buf[idx + 2] = rgb.b;
      }
      buf[idx + 3] = 255;
    }

    // Render Wall slice to buffer
    const shade = Math.min(1, 4 / perpDist);
    const colR = Math.round(wd_rgb.r + (w_rgb.r - wd_rgb.r) * shade);
    const colG = Math.round(wd_rgb.g + (w_rgb.g - wd_rgb.g) * shade);
    const colB = Math.round(wd_rgb.b + (w_rgb.b - wd_rgb.b) * shade);

    for (let y = wallTop; y < wallBottom; y++) {
      const idx = (y * W + i) * 4;
      if (isOverlayInFront) {
        // Blending semi-transparent walls (15% opacity) with base background (#0a0f1c)
        buf[idx] = Math.round(colR * 0.15 + 10 * 0.85);
        buf[idx + 1] = Math.round(colG * 0.15 + 15 * 0.85);
        buf[idx + 2] = Math.round(colB * 0.15 + 28 * 0.85);
      } else {
        buf[idx] = colR;
        buf[idx + 1] = colG;
        buf[idx + 2] = colB;
      }
      buf[idx + 3] = 255;
    }

    // Render Floor pattern to buffer (Flat checkerboard floor pattern for maximum performance)
    for (let y = wallBottom; y < H; y++) {
      const idx = (y * W + i) * 4;
      const rgb = i % 2 === 0 ? f1_rgb : f2_rgb;
      buf[idx] = rgb.r;
      buf[idx + 1] = rgb.g;
      buf[idx + 2] = rgb.b;
      buf[idx + 3] = 255;
    }
  }

  // Draw the entire pixel buffer to canvas in one call
  ctx.putImageData(imgData, 0, 0);

  // Render map markers (warp, stairs, goals, and point info pins) in 3D space
  if (args.markers) {
    const sortedMarkers = args.markers
      .map(m => {
        const dx = m.x - origin.x;
        const dy = m.y - origin.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let relAngle = normalizeAngle(angle - originAngle);
        if (relAngle > Math.PI) relAngle -= TAU;
        return { m, dist, relAngle };
      })
      .filter(item => item.dist > 5 && Math.abs(item.relAngle) < fov / 2 + 0.2)
      .sort((a, b) => b.dist - a.dist);

    for (const item of sortedMarkers) {
      const { m, dist, relAngle } = item;
      const perpDist = dist * Math.cos(relAngle);
      if (perpDist < 5) continue;

      const col = Math.round(((relAngle + fov / 2) / fov) * (W - 1));
      const mHeight = perpDist > 0.1 ? (64 / perpDist) * distPlane : H;
      const isPortal = m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs' || m.type === 'start' || m.type === 'checkpoint';
      const isGoal = m.type === 'goal';

      // Lower marker heights relative to floor level (baseFloorY) to reduce portal heights and lower label text positions
      const baseFloorY = Math.floor(halfH + mHeight * 0.375);
      const markerHeight = isPortal ? mHeight * 0.35 : (isGoal ? mHeight * 0.5 : mHeight * 0.15);

      const wallTop = Math.max(0, Math.floor(baseFloorY - markerHeight));
      const wallBottom = Math.min(H, baseFloorY);

      // Get color and metadata from constants
      const meta = MARKER_META[m.type as keyof typeof MARKER_META] || { emoji: '📍', label: 'PIN', color: '#00f0ff' };
      const hexColor = meta.color;

      // Parse color to RGB
      let r = 0, g = 240, b = 255;
      if (hexColor.startsWith('#')) {
        r = parseInt(hexColor.slice(1, 3), 16);
        g = parseInt(hexColor.slice(3, 5), 16);
        b = parseInt(hexColor.slice(5, 7), 16);
      }

      // Check if marker is in front of the player (between camera and player) in TPS mode
      const isOverlayInFront = args.playerDist !== undefined && perpDist < args.playerDist;

      // Pillar thickness: Portals and goals are thick, others are very thin lines
      const mWidth = (isPortal || isGoal)
        ? Math.max(2, Math.round(mHeight * 0.15))
        : Math.max(1, Math.round(mHeight * 0.03));

      const left = Math.max(0, col - Math.round(mWidth / 2));
      const right = Math.min(W - 1, col + Math.round(mWidth / 2));

      // Fade out markers in the distance, or make them highly transparent if in front of player
      const distanceFade = Math.max(0.05, Math.min(1.0, 1.0 - (perpDist / 800)));
      const baseAlpha = isOverlayInFront 
        ? 0.05 
        : ((isPortal || isGoal) ? 0.45 : 0.25);
      const alpha = baseAlpha * distanceFade;
      const fillColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      const coreColor = `rgba(${r}, ${g}, ${b}, ${isOverlayInFront ? 0.08 : 0.85 * distanceFade})`;

      for (let xCol = left; xCol <= right; xCol++) {
        if (colHeights[xCol] && colHeights[xCol].perpDist < perpDist) {
          continue;
        }
        ctx.fillStyle = fillColor;
        ctx.fillRect(xCol, wallTop, 1, wallBottom - wallTop);

        if (xCol === col) {
          ctx.fillStyle = coreColor;
          ctx.fillRect(xCol, wallTop, 1, wallBottom - wallTop);
        }
      }

      // Render marker text labels (emoji + name/note)
      if (perpDist < 400 && col > 25 && col < W - 25) {
        // Skip label if the marker is occluded by a wall in its center column
        if (colHeights[col] && colHeights[col].perpDist < perpDist) {
          continue;
        }

        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';

        let labelText = `${meta.emoji} ${meta.label}`;
        if (!isPortal && !isGoal) {
          // If marker has a note/name, show it instead of the generic type label
          const noteText = (m as any).note?.trim();
          if (noteText) {
            labelText = `${meta.emoji} ${noteText}`;
          }
        } else if (isGoal) {
          labelText = `🚪 脱出口 (ESCAPE)`;
        }

        // Draw black stroke outline to guarantee visibility on light/white backgrounds
        ctx.strokeStyle = `rgba(0, 0, 0, ${isOverlayInFront ? 0.15 : 0.8 * distanceFade})`;
        ctx.lineWidth = 3;
        ctx.strokeText(labelText, col, wallTop - 6);

        ctx.fillStyle = `rgba(255, 255, 255, ${isOverlayInFront ? 0.12 : distanceFade})`;
        ctx.fillText(labelText, col, wallTop - 6);
      }
    }
  }

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
  markers?: { x: number; y: number; type: string; id?: string; linkedWarpId?: string }[]
): void {
  renderWalls({
    ctx, canvas,
    origin: { x: player.x, y: player.y },
    originAngle: player.angle,
    walls, fov,
    wallColor, wallColorDark,
    floorColor1, floorColor2,
    ceilingColor1, ceilingColor2,
    bgImageData,
    markers
  });
}

const PLAYER_HEIGHT = 6;
const PLAYER_WIDTH = 2;
const MINIMAP_SIZE = 90;
const MINIMAP_RANGE = 500;

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  walls: [Point, Point][],
  markers: { x: number; y: number; type: string }[],
  bgImageData?: ImageData | null
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

  if (bgImageData) {
    const bg = bgImageData;
    const invScale = 1 / scale;

    // キャッシュ用の一時キャンバスとImageDataの初期化
    if (!tempMinimapCanvas) {
      tempMinimapCanvas = document.createElement('canvas');
      tempMinimapCanvas.width = MINIMAP_SIZE;
      tempMinimapCanvas.height = MINIMAP_SIZE;
      tempMinimapCtx = tempMinimapCanvas.getContext('2d');
      if (tempMinimapCtx) {
        tempMinimapImageData = tempMinimapCtx.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
      }
    }

    const tempCtx = tempMinimapCtx;
    const imgData = tempMinimapImageData;
    if (tempCtx && imgData) {
      for (let my = 0; my < MINIMAP_SIZE; my++) {
        const wy = player.y + (my - half) * invScale;
        const ty = Math.floor(wy);
        const rowOffset = my * MINIMAP_SIZE * 4;

        for (let mx = 0; mx < MINIMAP_SIZE; mx++) {
          const wx = player.x + (mx - half) * invScale;
          const tx = Math.floor(wx);

          let r = 10, g = 15, b = 28, a = 200; // デフォルト背景色
          if (tx >= 0 && tx < bg.width && ty >= 0 && ty < bg.height) {
            const idx = (ty * bg.width + tx) * 4;
            r = bg.data[idx];
            g = bg.data[idx + 1];
            b = bg.data[idx + 2];
            a = 255;
          }

          const pIdx = rowOffset + mx * 4;
          imgData.data[pIdx] = r;
          imgData.data[pIdx + 1] = g;
          imgData.data[pIdx + 2] = b;
          imgData.data[pIdx + 3] = a;
        }
      }
      tempCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(tempMinimapCanvas, x, y);
    }
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
  if (!bgImageData) {
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
    ctx.beginPath();
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
    ctx.stroke();
  }

  // Markers within range
  for (const m of markers) {
    const dx = (m.x - player.x) * scale;
    const dy = (m.y - player.y) * scale;
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

  ctx.restore(); // クリッピング解除
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
  markers?: { x: number; y: number; type: string; id?: string; linkedWarpId?: string }[]
): void {
  // 手前にある壁やオブジェクトは自動的に半透明化されるため、カメラを壁の手前で止める必要はありません。
  // 常に一定のカメラ距離（camDistance）を維持することで、画面下にアバターが隠れる問題を根本解決します。
  const actualCamDistance = camDistance;
  const camX = player.x - Math.cos(player.angle) * actualCamDistance;
  const camY = player.y - Math.sin(player.angle) * actualCamDistance;
  
  const dx = player.x - camX;
  const dy = player.y - camY;
  const playerDist = Math.hypot(dx, dy);

  const { colHeights } = renderWalls({
    ctx, canvas,
    origin: { x: camX, y: camY },
    originAngle: player.angle,
    walls, fov,
    wallColor, wallColorDark,
    floorColor1, floorColor2,
    ceilingColor1, ceilingColor2,
    bgImageData,
    camHeight: 24,
    yOffset: Math.round(canvas.height * -0.2083),
    markers,
    playerDist
  });

  // Render player billboard
  const W = canvas.width;
  const H = canvas.height;
  const yOffset = Math.round(H * -0.2083);
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);

  // カメラがキャラクターに近すぎる（後ろにすぐ壁がある）場合は、
  // キャラ自身や手前の壁が視界を遮らないようにアバターを非表示にする
  if (playerDist < 25) return;

  const angleToPlayer = Math.atan2(dy, dx);
  let relAngle = normalizeAngle(angleToPlayer - player.angle);
  if (relAngle > Math.PI) relAngle -= TAU;
  const halfFov = fov / 2;
  if (Math.abs(relAngle) > halfFov + 0.05) return;

  const pCol = Math.round(((relAngle + halfFov) / fov) * (W - 1));
  const pAngularWidth = Math.atan2(PLAYER_WIDTH / 2, playerDist);
  const pHalfWidth = Math.max(1, Math.round((pAngularWidth / fov) * W));
  const pPerpDist = playerDist * Math.cos(relAngle);
  const pScreenHeight = Math.round((PLAYER_HEIGHT * distPlane) / pPerpDist);

  // アバターの足元をその距離の床面（固定 camHeight = 24）の射影位置に正確に接地させる
  const pBottom = Math.round(halfH + (24 * distPlane) / pPerpDist);
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
}
