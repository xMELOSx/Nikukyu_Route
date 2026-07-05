import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Point, HeistMarker } from '../utils/DataManager';
import {
  type PlayerState,
  normalizeAngle,
  movePlayer,
  movePlayerTps,
  renderFpsView,
  renderTpsView,
  renderMinimap,
  renderMarkers3D
} from '../utils/Raycaster';

interface FpsViewProps {
  walls: [Point, Point][];
  markers: HeistMarker[];
  playerPos: { x: number; y: number };
  onExit: () => void;
  onPlayerChange: (pos: { x: number; y: number }) => void;
  mode: 'fps' | 'tps';
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgImage?: HTMLCanvasElement | HTMLImageElement | null;
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

const FpsView: React.FC<FpsViewProps> = ({ walls, markers, playerPos, onExit, onPlayerChange, mode, canvasRef, bgImage }) => {
  const getInitialAngle = (): number => {
    const nearby = markers.find(m => {
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

  const wallsRef = useRef(walls);
  wallsRef.current = walls;
  const markersRef = useRef(markers);
  markersRef.current = markers;

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
  }, []);

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
      const dt = prevTimeRef.current ? (time - prevTimeRef.current) / 16.667 : 1;
      prevTimeRef.current = time;

      const keys = keysRef.current;
      let forward = 0;
      let strafe = 0;

      if (keys.has('w') || keys.has('arrowup')) forward = 1;
      if (keys.has('s') || keys.has('arrowdown')) forward = -1;
      if (keys.has('a') || keys.has('arrowleft')) strafe = -1;
      if (keys.has('d') || keys.has('arrowright')) strafe = 1;

      const lw = wallsRef.current;
      const lm = markersRef.current;

      if (forward !== 0 || strafe !== 0) {
        if (mode === 'tps') {
          const newPlayer = movePlayerTps(
            playerRef.current,
            forward,
            strafe,
            playerRef.current.angle,
            lw,
            MOVE_SPEED * dt,
            PLAYER_RADIUS
          );
          playerRef.current = newPlayer;
        } else {
          const newPlayer = movePlayer(
            playerRef.current,
            forward,
            strafe,
            lw,
            MOVE_SPEED * dt,
            PLAYER_RADIUS
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
          return dist < 8;
        });

        if (portal && portal.linkedWarpId) {
          const partner = lm.find(m => m.id === portal.linkedWarpId);
          if (partner) {
            let newAngle = curP.angle;
            if (partner.teleportAngle !== undefined) {
              newAngle = (partner.teleportAngle * Math.PI) / 180;
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
          bgImageDataRef.current
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
          bgImageDataRef.current
        );
      }

      // Render markers in 3D view
      const camPos = mode === 'tps'
        ? { x: playerRef.current.x - Math.cos(playerRef.current.angle) * actualCamDist, y: playerRef.current.y - Math.sin(playerRef.current.angle) * actualCamDist }
        : { x: playerRef.current.x, y: playerRef.current.y };
      renderMarkers3D(ctx, canvas, camPos, playerRef.current.angle, FOV, colHeights, lm);

      renderMinimap(ctx, playerRef.current, lw, lm, bgImageRef.current);

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
