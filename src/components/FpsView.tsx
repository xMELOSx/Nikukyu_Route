import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Point, HeistMarker, LockedWallSegment } from '../utils/DataManager';
import {
  type PlayerState,
  normalizeAngle,
  movePlayer,
  movePlayerTps,
  renderFpsView,
  renderTpsView,
  renderMinimapView,
  renderMarkers3D,
  pointToSegmentDist
} from '../utils/Raycaster';

interface FpsViewProps {
  walls: [Point, Point][];
  lockedWalls: LockedWallSegment[];
  markers: HeistMarker[];
  playerPos: { x: number; y: number };
  onExit: () => void;
  onPlayerChange: (pos: { x: number; y: number }) => void;
  onLockedWallsChange?: (walls: LockedWallSegment[]) => void;
  mode: 'fps' | 'tps';
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  minimapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgImage?: HTMLCanvasElement | HTMLImageElement | null;
  hiddenMarkers?: string[];
  hiddenMarkerTypes?: string[];
  mapSnapshotCanvas?: HTMLCanvasElement | null;
  onToggleNearestPhone?: () => void;
}

const FOV = Math.PI * 0.45;
const MOVE_SPEED = 1.5;
const ROTATE_SPEED = 0.0045;
const PLAYER_RADIUS = 6;
const TPS_CAM_DISTANCE = 60;

const FLOOR_COLOR_1 = '#0a0f1c';
const FLOOR_COLOR_2 = '#0d1424';
const CEILING_COLOR_1 = '#05070a';
const CEILING_COLOR_2 = '#080b16';
const WALL_COLOR = '#00f0ff';
const WALL_COLOR_DARK = '#003344';
const PLAYER_COLOR = '#39ff14';

const FpsView: React.FC<FpsViewProps> = ({
  walls, lockedWalls = [], markers, playerPos, onExit, onPlayerChange, onLockedWallsChange, mode, canvasRef, minimapCanvasRef, bgImage,
  hiddenMarkers = [], hiddenMarkerTypes = [], mapSnapshotCanvas, onToggleNearestPhone
}) => {
  const hMarkers = hiddenMarkers || [];
  const hTypes = hiddenMarkerTypes || [];
  const activeMarkers = markers.filter(m => !hMarkers.includes(m.id) && !hTypes.includes(m.type));

  const getInitialAngle = (): number => {
    const nearby = activeMarkers.find(m => {
      const d = Math.hypot(m.x - playerPos.x, m.y - playerPos.y);
      return d < 15 && m.teleportAngle !== undefined;
    });
    if (nearby && nearby.teleportAngle !== undefined) {
      return (nearby.teleportAngle * Math.PI) / 180;
    }
    return 0;
  };

  const playerRef = useRef<PlayerState>({
    x: playerPos.x,
    y: playerPos.y,
    angle: getInitialAngle()
  });
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  const [bgImageData, setBgImageData] = useState<ImageData | null>(null);

  useEffect(() => {
    const canvas = bgImage;
    if (!canvas) {
      setBgImageData(null);
      return;
    }

    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setBgImageData(data);
        } catch (e) {
          console.error("Failed to extract ImageData from bgImage canvas:", e);
        }
      }
    } else if (canvas instanceof HTMLImageElement) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.naturalWidth || canvas.width || 1600;
      tempCanvas.height = canvas.naturalHeight || canvas.height || 4550;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        try {
          tempCtx.drawImage(canvas, 0, 0);
          const data = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          setBgImageData(data);
        } catch (e) {
          console.error("Failed to extract ImageData from bgImage image:", e);
        }
      }
    }
  }, [bgImage]);

  const bgImageDataRef = useRef<ImageData | null>(null);
  bgImageDataRef.current = bgImageData;

  const bgImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  bgImageRef.current = bgImage ?? null;

  const mapSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  mapSnapshotRef.current = mapSnapshotCanvas ?? null;

  const wallsRef = useRef(walls);
  wallsRef.current = walls;
  const lockedWallsRef = useRef(lockedWalls);
  lockedWallsRef.current = lockedWalls;
  const markersRef = useRef(activeMarkers);
  markersRef.current = activeMarkers;

  const lastTeleportTimeRef = useRef<number>(0);
  const teleportEffectTimerRef = useRef<number>(0);
  const teleportEffectColorRef = useRef<string>('rgba(255,0,255,0.3)');
  const lastTeleportedPortalIdRef = useRef<string | null>(null);

  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const playerChangeRef = useRef(onPlayerChange);
  playerChangeRef.current = onPlayerChange;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key.toLowerCase());
    if (e.key === 'Escape') {
      exitRef.current();
    }
    if (e.key.toLowerCase() === 'f' && !e.repeat) {
      const curP = playerRef.current;
      const lw = lockedWallsRef.current;
      let nearestIdx = -1;
      let nearestDist = 16;
      for (let i = 0; i < lw.length; i++) {
        const seg = lw[i];
        const cx = (seg.p1.x + seg.p2.x) / 2;
        const cy = (seg.p1.y + seg.p2.y) / 2;
        const d = Math.hypot(cx - curP.x, cy - curP.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      if (nearestIdx >= 0 && onLockedWallsChange) {
        const next = lw.map((s, idx) => idx === nearestIdx ? { ...s, isOpen: !s.isOpen } : s);
        onLockedWallsChange(next);
      }
    }
    if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
      onToggleNearestPhone?.();
    }
  }, [onLockedWallsChange, onToggleNearestPhone]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key.toLowerCase());
  }, []);

  const hasLockedRef = useRef(false);
  const lockTimeRef = useRef<number>(0);

  const handlePointerLockChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && document.pointerLockElement === canvas) {
      hasLockedRef.current = true;
      lockTimeRef.current = Date.now();
    }

    if (hasLockedRef.current && !document.pointerLockElement) {
      requestAnimationFrame(() => {
        if (!document.pointerLockElement) {
          exitRef.current();
        }
      });
    }
  }, [canvasRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas && document.pointerLockElement === canvas) {
      // ポインターロック初期化時の巨大な初期入力（100ms以内）のみを遮断
      if (Date.now() - lockTimeRef.current < 100) {
        return;
      }
      // ブラウザのポインターロックバグによる突発的な超巨大移動スパイク（200px以上）を二重で遮断
      if (Math.abs(e.movementX) > 200) {
        return;
      }
      const clampedX = Math.max(-150, Math.min(150, e.movementX));
      playerRef.current.angle = normalizeAngle(
        playerRef.current.angle + clampedX * ROTATE_SPEED
      );
    }
  }, [canvasRef]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleKeyDown, handleKeyUp, handlePointerLockChange, handleMouseMove]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = (time: number) => {
      const dt = prevTimeRef.current ? Math.min((time - prevTimeRef.current) / 16.667, 2) : 1;
      prevTimeRef.current = time;

      const keys = keysRef.current;
      let forward = 0;
      let strafe = 0;

      if (keys.has('w') || keys.has('arrowup')) forward = 1;
      if (keys.has('s') || keys.has('arrowdown')) forward = -1;
      if (keys.has('a') || keys.has('arrowleft')) strafe = -1;
      if (keys.has('d') || keys.has('arrowright')) strafe = 1;
      const lw = wallsRef.current;
      const llw = lockedWallsRef.current;
      const closedLockedArr = llw.filter(s => !s.isOpen).map(s => [s.p1, s.p2] as [Point, Point]);
      const lm = markersRef.current;

      if (forward !== 0 || strafe !== 0) {
        const collisionWalls = closedLockedArr.length > 0 ? [...lw, ...closedLockedArr] : lw;
        if (mode === 'tps') {
          const newPlayer = movePlayerTps(
            playerRef.current,
            forward,
            strafe,
            playerRef.current.angle,
            collisionWalls,
            MOVE_SPEED * dt,
            6 // PLAYER_RADIUS → 6 に固定（ユーザー変更しやすいよう定数化）
          );
          playerRef.current = newPlayer;
        } else {
          const newPlayer = movePlayer(
            playerRef.current,
            forward,
            strafe,
            collisionWalls,
            MOVE_SPEED * dt,
            6
          );
          playerRef.current = newPlayer;
        }
        playerChangeRef.current({ x: playerRef.current.x, y: playerRef.current.y });
      }

      const now = Date.now();
      const curP = playerRef.current;

      // 最後にテレポートしたポータルから 15px 以上離れたら離脱ガードをリセット
      if (lastTeleportedPortalIdRef.current) {
        const lastPortal = lm.find(m => m.id === lastTeleportedPortalIdRef.current);
        if (lastPortal) {
          const distFromLast = Math.hypot(curP.x - lastPortal.x, curP.y - lastPortal.y);
          if (distFromLast >= 15) {
            lastTeleportedPortalIdRef.current = null;
          }
        } else {
          lastTeleportedPortalIdRef.current = null;
        }
      }

      if (now - lastTeleportTimeRef.current > 1500) {
        const portal = lm.find(m => {
          if (m.type !== 'warp' && m.type !== 'iwarp' && m.type !== 'stairs') return false;
          // 踏みっぱなしの離脱前ポータルは判定スキップ
          if (lastTeleportedPortalIdRef.current === m.id) return false;

          const dist = Math.hypot(curP.x - m.x, curP.y - m.y);
          return dist < 12;
        });

        if (portal && portal.linkedWarpId) {
          const partner = lm.find(m => m.id === portal.linkedWarpId);
          if (partner) {
            // 両方の marker に teleportAngle が設定されていれば相対角度保持
            let newAngle: number;
            if (portal.teleportAngle !== undefined && partner.teleportAngle !== undefined) {
              const srcRef = (portal.teleportAngle * Math.PI) / 180;
              const dstRef = (partner.teleportAngle * Math.PI) / 180;
              let offset = curP.angle - srcRef;
              offset = ((offset % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
              if (offset > Math.PI) offset -= Math.PI * 2;
              newAngle = dstRef + offset;
              newAngle = ((newAngle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
            } else if (partner.teleportAngle !== undefined) {
              newAngle = (partner.teleportAngle * Math.PI) / 180;
            } else {
              newAngle = curP.angle;
            }

            playerRef.current = {
              ...curP,
              x: partner.x,
              y: partner.y,
              angle: newAngle
            };
            playerChangeRef.current({ x: partner.x, y: partner.y });
            lastTeleportTimeRef.current = now;
            // パートナーのポータルIDを登録して離脱まで踏みっぱなし暴発を防止
            lastTeleportedPortalIdRef.current = partner.id;
            teleportEffectTimerRef.current = 15;
            teleportEffectColorRef.current = portal.type === 'stairs' ? 'rgba(255, 170, 0, 0.35)' : 'rgba(255, 0, 255, 0.35)';
          }
        }
      }

      const actualCamDist = TPS_CAM_DISTANCE;

      let colHeights: { top: number; bottom: number; perpDist: number }[];
      const LOCKED_WALL_COLOR = '#cc9900';
      const LOCKED_WALL_COLOR_DARK = '#664400';
      const closedLockedForRender = llw.filter(s => !s.isOpen).map(s => [s.p1, s.p2] as [Point, Point]);
      if (mode === 'tps') {
        colHeights = renderTpsView(
          ctx, canvas,
          playerRef.current,
          lw,
          FOV,
          actualCamDist,
          WALL_COLOR, WALL_COLOR_DARK,
          FLOOR_COLOR_1, FLOOR_COLOR_2,
          CEILING_COLOR_1, CEILING_COLOR_2,
          PLAYER_COLOR,
          bgImageDataRef.current,
          closedLockedForRender,
          LOCKED_WALL_COLOR, LOCKED_WALL_COLOR_DARK,
          0.3
        );
      } else {
        colHeights = renderFpsView(
          ctx, canvas,
          playerRef.current,
          lw,
          FOV,
          WALL_COLOR, WALL_COLOR_DARK,
          FLOOR_COLOR_1, FLOOR_COLOR_2,
          CEILING_COLOR_1, CEILING_COLOR_2,
          bgImageDataRef.current,
          closedLockedForRender,
          LOCKED_WALL_COLOR, LOCKED_WALL_COLOR_DARK,
          0.3
        );
      }

      // Render markers in 3D view
      const camPos = mode === 'tps'
        ? { x: playerRef.current.x - Math.cos(playerRef.current.angle) * actualCamDist, y: playerRef.current.y - Math.sin(playerRef.current.angle) * actualCamDist }
        : { x: playerRef.current.x, y: playerRef.current.y };
      renderMarkers3D(ctx, canvas, camPos, playerRef.current.angle, FOV, colHeights, lm);

      const minimapCvs = minimapCanvasRef.current;
      if (minimapCvs) {
        const mctx = minimapCvs.getContext('2d');
        if (mctx) {
          renderMinimapView(mctx, playerRef.current, mapSnapshotRef.current || bgImageRef.current);
          // Overlay phone status dots on minimap (active=green, inactive=red, locked=gray)
          const mw = minimapCvs.width; // 280
          const mRange = 250;
          const mScale = mw / mRange;
          const mcx = mw / 2;
          const mcy = mw / 2;
          for (const pm of lm) {
            if (pm.type !== 'phone') continue;
            const dx = (pm.x - playerRef.current.x) * mScale;
            const dy = (pm.y - playerRef.current.y) * mScale;
            if (Math.abs(dx) > mcx || Math.abs(dy) > mcy) continue;
            const px = mcx + dx;
            const py = mcy + dy;
            const dotColor = (pm.phoneActive || pm.phoneLocked) ? '#ff3333' : '#888888';
            mctx.fillStyle = dotColor;
            mctx.beginPath();
            mctx.arc(px, py, 3, 0, Math.PI * 2);
            mctx.fill();
            mctx.strokeStyle = '#000';
            mctx.lineWidth = 1;
            mctx.stroke();
          }
        }
      }

      if (teleportEffectTimerRef.current > 0) {
        ctx.fillStyle = teleportEffectColorRef.current;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        teleportEffectTimerRef.current--;
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx, cy + 8);
      ctx.stroke();

      const bracket = 20;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, 10 + bracket); ctx.lineTo(10, 10); ctx.lineTo(10 + bracket, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(canvas.width - 10 - bracket, 10); ctx.lineTo(canvas.width - 10, 10); ctx.lineTo(canvas.width - 10, 10 + bracket);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, canvas.height - 10 - bracket); ctx.lineTo(10, canvas.height - 10); ctx.lineTo(10 + bracket, canvas.height - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(canvas.width - 10 - bracket, canvas.height - 10); ctx.lineTo(canvas.width - 10, canvas.height - 10); ctx.lineTo(canvas.width - 10, canvas.height - 10 - bracket);
      ctx.stroke();

      const modeLabel = mode === 'tps' ? 'TPS' : 'FPS';
      const hudL = `${modeLabel}  X:${Math.round(playerRef.current.x)} Y:${Math.round(playerRef.current.y)}`;
      const hudR = `ESC: 終了`;

      ctx.font = '10px monospace';

      // Outline
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(hudL, 10, canvas.height - 10);
      ctx.strokeText(hudR, canvas.width - 80, canvas.height - 10);

      // Fill
      ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
      ctx.fillText(hudL, 10, canvas.height - 10);
      ctx.fillText(hudR, canvas.width - 80, canvas.height - 10);

      // Phone compass: nearest ACTIVE phone direction & status
      const activePhoneMarkers = lm.filter(m => m.type === 'phone' && m.phoneActive && !m.phoneLocked);
      let nearestPhone: typeof lm[0] | null = null;
      let nearestPhoneDist = Infinity;
      for (const pm of activePhoneMarkers) {
        const d = Math.hypot(pm.x - playerRef.current.x, pm.y - playerRef.current.y);
        if (d < nearestPhoneDist) { nearestPhoneDist = d; nearestPhone = pm; }
      }
      if (nearestPhone) {
        const pa = Math.atan2(nearestPhone.y - playerRef.current.y, nearestPhone.x - playerRef.current.x);
        const relAngle = normalizeAngle(pa - playerRef.current.angle);
        const cx3 = canvas.width - 44;
        const cy3 = 44;
        const r = 16;
        // Orbit ring (solid red)
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx3, cy3, r, 0, Math.PI * 2);
        ctx.stroke();
        // Direction arrow on ring (0=up in compass = forward)
        const arrowX = cx3 + Math.sin(relAngle) * r;
        const arrowY = cy3 - Math.cos(relAngle) * r;
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 3, 0, Math.PI * 2);
        ctx.fill();
        // Pulse glow
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 6 + Math.sin(Date.now() * 0.005) * 2, 0, Math.PI * 2);
        ctx.stroke();
        // Center label
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3333';
        ctx.fillText('📞', cx3, cy3);
        // Distance text
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,50,50,0.6)';
        ctx.fillText(`${Math.round(nearestPhoneDist)}px`, cx3, cy3 + r + 12);
      }

      // Locked door interaction prompt
      const llocked = lockedWallsRef.current;
      let nearDoor: LockedWallSegment | null = null;
      for (const seg of llocked) {
        const cx2 = (seg.p1.x + seg.p2.x) / 2;
        const cy2 = (seg.p1.y + seg.p2.y) / 2;
        const d = Math.hypot(cx2 - playerRef.current.x, cy2 - playerRef.current.y);
        if (d < 16) { nearDoor = seg; break; }
      }
      if (nearDoor) {
        const prompt = nearDoor.isOpen ? '[F] 閉める' : '[F] 開ける';
        const promptW = ctx.measureText(prompt).width;
        const px = (canvas.width - promptW) / 2;
        const py = canvas.height - 40;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(prompt, px, py);
        ctx.fillStyle = nearDoor.isOpen ? 'rgba(0, 200, 255, 0.9)' : 'rgba(255, 200, 0, 0.9)';
        ctx.fillText(prompt, px, py);
      }

      // 当たり判定デバッグ表示
      const pp = playerRef.current;
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,0,0.6)';
      let minDist = 10000;
      for (const w of lw) {
        const d = pointToSegmentDist(pp.x, pp.y, w[0].x, w[0].y, w[1].x, w[1].y);
        if (d < minDist) minDist = d;
      }
      ctx.fillText(`Radius:6 Nearest:${minDist < 10000 ? minDist.toFixed(1) : '-'}`, canvas.width - 120, 14);
      ctx.fillText(`Walls:${lw.length} Locked:${closedLockedArr.length}`, canvas.width - 120, 24);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode, canvasRef]);

  return null;
};

export default FpsView;
