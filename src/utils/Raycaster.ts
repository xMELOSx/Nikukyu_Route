import type { Point } from '../utils/DataManager';

const TAU = Math.PI * 2;

let tempMinimapCanvas: HTMLCanvasElement | null = null;
let tempMinimapCtx: CanvasRenderingContext2D | null = null;

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
}

function renderWalls(
  args: WallRenderArgs
): { colHeights: { top: number; bottom: number; perpDist: number }[] } {
  const { ctx, canvas, origin, originAngle, walls, fov } = args;
  const W = canvas.width;
  const H = canvas.height;
  const numRays = W;
  const yOffset = args.yOffset ?? -50; // 地平線を上にずらして見下ろしパースにする
  const halfH = H / 2 + yOffset;
  const distPlane = (W / 2) / Math.tan(fov / 2);
  const camHeight = args.camHeight ?? 24;
  const camHeightFrac = camHeight / 64;

  const hits = castRays({ x: origin.x, y: origin.y, angle: originAngle }, walls, fov, numRays);
  const colHeights: { top: number; bottom: number; perpDist: number }[] = [];

  for (let i = 0; i < numRays; i++) {
    const hit = hits[i];
    const dist = hit.distance;
    const rayAngle = normalizeAngle(originAngle - fov / 2 + (i / (numRays - 1)) * fov);
    const perpDist = dist * Math.cos(rayAngle - originAngle);

    const wallHeight = perpDist > 0.1 ? (halfH / perpDist) * distPlane : H;
    const wallTop = Math.max(0, Math.floor(halfH - wallHeight * (1 - camHeightFrac))); // 天井側（遠い）
    const wallBottom = Math.min(H, Math.floor(halfH + wallHeight * camHeightFrac));    // 床側（近い）
    colHeights.push({ top: wallTop, bottom: wallBottom, perpDist });

    ctx.fillStyle = i % 2 === 0 ? args.ceilingColor1 : args.ceilingColor2;
    ctx.fillRect(i, 0, 1, wallTop);

    const shade = Math.min(1, 4 / perpDist);
    const r = parseInt(args.wallColor.slice(1, 3), 16);
    const g = parseInt(args.wallColor.slice(3, 5), 16);
    const b = parseInt(args.wallColor.slice(5, 7), 16);
    const darkR = parseInt(args.wallColorDark.slice(1, 3), 16);
    const darkG = parseInt(args.wallColorDark.slice(3, 5), 16);
    const darkB = parseInt(args.wallColorDark.slice(5, 7), 16);
    const colR = Math.round(darkR + (r - darkR) * shade);
    const colG = Math.round(darkG + (g - darkG) * shade);
    const colB = Math.round(darkB + (b - darkB) * shade);
    ctx.fillStyle = `rgb(${colR},${colG},${colB})`;
    ctx.fillRect(i, wallTop, 1, wallBottom - wallTop);

    // 床のレンダリング (Floor Casting)
    if (args.bgImageData) {
      const bg = args.bgImageData;
      const cosRay = Math.cos(rayAngle);
      const sinRay = Math.sin(rayAngle);
      const cosBeta = Math.cos(rayAngle - originAngle);

      for (let y = wallBottom; y < H; y++) {
        const denom = y - halfH;
        if (denom <= 0) continue;
        const perpDistFloor = (camHeight * distPlane) / denom;
        const straightDist = perpDistFloor / cosBeta;

        const wx = origin.x + cosRay * straightDist;
        const wy = origin.y + sinRay * straightDist;

        const tx = Math.floor(wx);
        const ty = Math.floor(wy);

        let fr = 13, fg = 20, fb = 36; // デフォルト床色
        if (tx >= 0 && tx < bg.width && ty >= 0 && ty < bg.height) {
          const idx = (ty * bg.width + tx) * 4;
          fr = bg.data[idx];
          fg = bg.data[idx + 1];
          fb = bg.data[idx + 2];
        }

        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.fillRect(i, y, 1, 1);
      }
    } else {
      ctx.fillStyle = i % 2 === 0 ? args.floorColor1 : args.floorColor2;
      ctx.fillRect(i, wallBottom, 1, H - wallBottom);
    }
  }

  // Render portal (warp/stairs) markers as light pillars in 3D space
  if (args.markers) {
    const sortedMarkers = args.markers
      .filter(m => m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs')
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
      const mHeight = perpDist > 0.1 ? (halfH / perpDist) * distPlane : H;
      const wallTop = Math.max(0, Math.floor(halfH - mHeight * 0.625));
      const wallBottom = Math.min(H, Math.floor(halfH + mHeight * 0.375));
      const mWidth = Math.max(2, Math.round(mHeight * 0.15));

      const left = Math.max(0, col - Math.round(mWidth / 2));
      const right = Math.min(W - 1, col + Math.round(mWidth / 2));

      const color = m.type === 'stairs' ? 'rgba(255, 170, 0, 0.45)' : 'rgba(255, 0, 255, 0.45)';
      const coreColor = m.type === 'stairs' ? '#ffaa00' : '#ff00ff';

      for (let xCol = left; xCol <= right; xCol++) {
        if (colHeights[xCol] && colHeights[xCol].perpDist < perpDist) {
          continue;
        }
        ctx.fillStyle = color;
        ctx.fillRect(xCol, wallTop, 1, wallBottom - wallTop);

        if (xCol === col) {
          ctx.fillStyle = coreColor;
          ctx.fillRect(xCol, wallTop, 1, wallBottom - wallTop);
        }
      }

      if (perpDist < 300 && col > 20 && col < W - 20) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        const text = m.type === 'stairs' ? '🪜 STAIRS' : '🌀 WARP';
        ctx.fillText(text, col, wallTop - 4);
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

    // キャッシュ用の一時キャンバスの初期化
    if (!tempMinimapCanvas) {
      tempMinimapCanvas = document.createElement('canvas');
      tempMinimapCanvas.width = MINIMAP_SIZE;
      tempMinimapCanvas.height = MINIMAP_SIZE;
      tempMinimapCtx = tempMinimapCanvas.getContext('2d');
    }

    const tempCtx = tempMinimapCtx;
    if (tempCtx) {
      const imgData = tempCtx.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
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
  // プレイヤーの真後ろ（角度 + Math.PI）にレイを飛ばし、壁との距離を測る
  const oppAngle = normalizeAngle(player.angle + Math.PI);
  const camHit = castRay({ x: player.x, y: player.y }, oppAngle, walls);
  const actualCamDistance = camHit.distance < camDistance
    ? Math.max(5, camHit.distance - 6) // 壁から6px離した位置に寄せる。最小5px
    : camDistance;
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
    camHeight: 24,
    yOffset: -50,
    markers
  });

  // Render player billboard
  const W = canvas.width;
  const H = canvas.height;
  const halfH = H / 2 - 50; // 固定 yOffset = -50
  const distPlane = (W / 2) / Math.tan(fov / 2);

  const dx = player.x - camX;
  const dy = player.y - camY;
  const playerDist = Math.hypot(dx, dy);
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
