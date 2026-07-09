import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { Point, HeistMarker, LockedWallSegment, WallSegment } from '../utils/DataManager';
import type { RouteSegment } from '../utils/AutoRoute';
import { interpolateRoute } from '../utils/AutoRoute';
import heroImg from '../assets/hero.png';
import {
  type PlayerState,
  normalizeAngle,
  movePlayer,
  movePlayerTps,
  renderFpsView,
  renderTpsView,
  renderMinimap,
  renderMarkers3D,
  renderGhostBillboard,
  pointToSegmentDist,
  castRay
} from '../utils/Raycaster';

interface FpsViewProps {
  walls: WallSegment[];
  lockedWalls: LockedWallSegment[];
  partitionWalls?: { p1: Point; p2: Point }[];
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
  onToggleMode?: () => void;
  autoRouteActive?: boolean;
  autoRouteSegments?: RouteSegment[];
  autoRouteElapsed?: number;
  autoRouteTiming?: { totalTime: number; speed: number };
  ghost3d?: boolean;
  autoRouteNoClip?: boolean;
  onAutoRouteNoClipChange?: (v: boolean) => void;
  imageOverlayCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  tpsPinSize?: number;
  onReload?: () => void;
  isLocal?: boolean;
  onWallsGenerated?: (walls: WallSegment[]) => void;
  onWallsChange?: (walls: WallSegment[]) => void;
}

const FOV = Math.PI * 0.45;
const MOVE_SPEED = 1.5;
const ROTATE_SPEED = 0.0045;

const FLOOR_COLOR_1 = '#0a0f1c';
const FLOOR_COLOR_2 = '#0d1424';
const CEILING_COLOR_1 = '#05070a';
const CEILING_COLOR_2 = '#080b16';
const WALL_COLOR = '#00f0ff';
const WALL_COLOR_DARK = '#003344';
const PLAYER_COLOR = '#39ff14';

const FpsView: React.FC<FpsViewProps> = ({
  walls, lockedWalls = [], markers, playerPos, onExit, onPlayerChange, onLockedWallsChange, mode, canvasRef, minimapCanvasRef, bgImage,
  hiddenMarkers = [], hiddenMarkerTypes = [],
  autoRouteActive = false, autoRouteSegments = [], autoRouteElapsed = 0, autoRouteTiming, ghost3d = false, autoRouteNoClip = false, onAutoRouteNoClipChange,
  mapSnapshotCanvas, imageOverlayCanvasRef,
  tpsPinSize = 100,
  onToggleNearestPhone,
  onToggleMode,
  onReload,
  partitionWalls = [],
  isLocal = false,
  onWallsGenerated,
  onWallsChange
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
    return -Math.PI / 2;
  };

  const playerRef = useRef<PlayerState>({
    x: playerPos.x,
    y: playerPos.y,
    angle: getInitialAngle()
  });
  const tpsCamDistanceRef = useRef<number>(30);
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const tpsImagesRef = useRef<{ [markerId: string]: HTMLImageElement }>({});

  useEffect(() => {
    const img = new Image();
    img.src = heroImg;
    img.onload = () => {
      heroImageRef.current = img;
    };
  }, []);

  // Load TPS marker images
  useEffect(() => {
    const imgCache = tpsImagesRef.current;
    for (const m of activeMarkers) {
      if (m.type !== 'tps' && m.type !== 'itps') continue;
      if (imgCache[m.id]) continue;
      const imgUrl = m.mediaItems?.[0]?.url;
      if (!imgUrl) continue;
      const img = new Image();
      // data: URL の場合は crossOrigin を設定しない（設定すると読み込みに失敗する）
      if (!imgUrl.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = imgUrl;
      img.onload = () => { imgCache[m.id] = img; };
    }
  }, [activeMarkers]);

  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  const [bgImageData, setBgImageData] = useState<ImageData | null>(null);

  const lastBgImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  useEffect(() => {
    const canvas = bgImage;
    if (!canvas) {
      setBgImageData(null);
      lastBgImageRef.current = null;
      return;
    }
    // 同一インスタンスなら、無駄なgetImageDataを完全にスキップして爆速化！
    if (lastBgImageRef.current === canvas && bgImageData) {
      return;
    }
    lastBgImageRef.current = canvas;

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
  }, [bgImage, bgImageData]);

  const bgImageDataRef = useRef<ImageData | null>(null);
  bgImageDataRef.current = bgImageData;

  const bgImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  bgImageRef.current = bgImage ?? null;

  const mapSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  mapSnapshotRef.current = mapSnapshotCanvas ?? null;

  const wallsRef = useRef(walls);
  useEffect(() => { wallsRef.current = walls; }, [walls]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const isLocalRef = useRef(isLocal);
  useEffect(() => { isLocalRef.current = isLocal; }, [isLocal]);

  // 壁テクスチャ画像のロード・キャッシュ管理
  const wallTexturesRef = useRef<Record<string, ImageData>>({});
  const loadedTextureNamesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 現在の壁の中で設定されているすべてのテクスチャ名を抽出
    const needed = new Set<string>();
    for (const w of walls) {
      if (w[2] && typeof w[2] === 'string') {
        needed.add(w[2]);
      }
    }

    needed.forEach(texName => {
      if (loadedTextureNamesRef.current.has(texName)) return;
      loadedTextureNamesRef.current.add(texName); // ロード中/ロード済みにマーク

      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || img.width || 512;
        tempCanvas.height = img.naturalHeight || img.height || 512;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          try {
            tempCtx.drawImage(img, 0, 0);
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            wallTexturesRef.current[texName] = imgData;
          } catch (e) {
            console.error("Failed to load wall texture ImageData:", texName, e);
          }
        }
      };
      img.src = `${import.meta.env.BASE_URL}texture/${texName}`;
    });
  }, [walls]);

  const lockedWallsRef = useRef(lockedWalls);
  useEffect(() => { lockedWallsRef.current = lockedWalls; }, [lockedWalls]);
  const markersRef = useRef(activeMarkers);
  useEffect(() => { markersRef.current = activeMarkers; }, [activeMarkers]);

  const lastTeleportTimeRef = useRef<number>(0);
  const prevAutoElapsedRef = useRef<number>(-1);
  const teleportEffectTimerRef = useRef<number>(0);
  const teleportEffectColorRef = useRef<string>('rgba(255,0,255,0.3)');
  const lastTeleportedPortalIdRef = useRef<string | null>(null);

  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const playerChangeRef = useRef(onPlayerChange);
  playerChangeRef.current = onPlayerChange;
  const unlockedWallsChangeRef = useRef(onLockedWallsChange);
  unlockedWallsChangeRef.current = onLockedWallsChange;
  const toggleNearestPhoneRef = useRef(onToggleNearestPhone);
  toggleNearestPhoneRef.current = onToggleNearestPhone;
  const toggleModeRef = useRef(onToggleMode);
  toggleModeRef.current = onToggleMode;
  const autoRouteNoClipToggleRef = useRef(onAutoRouteNoClipChange);
  autoRouteNoClipToggleRef.current = onAutoRouteNoClipChange;
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const onWallsGeneratedRef = useRef(onWallsGenerated);
  onWallsGeneratedRef.current = onWallsGenerated;
  const onWallsChangeRef = useRef(onWallsChange);
  onWallsChangeRef.current = onWallsChange;

  const autoRouteActiveRef = useRef(autoRouteActive);
  autoRouteActiveRef.current = autoRouteActive;
  const autoRouteNoClipRef = useRef(autoRouteNoClip);
  autoRouteNoClipRef.current = autoRouteNoClip;
  const autoRouteSegmentsRef = useRef(autoRouteSegments);
  autoRouteSegmentsRef.current = autoRouteSegments;
  const autoRouteElapsedRef = useRef(autoRouteElapsed);
  autoRouteElapsedRef.current = autoRouteElapsed;
  const autoRouteTimingRef = useRef(autoRouteTiming);
  autoRouteTimingRef.current = autoRouteTiming;
  const ghost3dRef = useRef(ghost3d);
  ghost3dRef.current = ghost3d;

  const ctrlHeldRef = useRef(false);
  const altHeldRef = useRef(false);
  const ghostPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key.toLowerCase());
    if (e.key === 'Escape') {
      exitRef.current();
    }
    if (e.key === 'Control' && !e.repeat) {
      ctrlHeldRef.current = true;
      document.exitPointerLock();
    }
    if (e.key === 'Alt' && !e.repeat) {
      altHeldRef.current = true;
      document.exitPointerLock();
    }
    if (e.key.toLowerCase() === 'f' && !e.repeat) {
      const curP = playerRef.current;
      const lw = lockedWallsRef.current;
      const unlockFn = unlockedWallsChangeRef.current;
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
      if (nearestIdx >= 0 && unlockFn) {
        const next = lw.map((s, idx) => idx === nearestIdx ? { ...s, isOpen: !s.isOpen } : s);
        lockedWallsRef.current = next;
        flushSync(() => {
          unlockFn(next);
        });
      }
    }
    if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
      toggleNearestPhoneRef.current?.();
    }
    if ((e.key === 't' || e.key === 'T') && !e.repeat) {
      toggleModeRef.current?.();
    }
    if ((e.key === 'h' || e.key === 'H') && !e.repeat) {
      autoRouteNoClipToggleRef.current?.(!(autoRouteNoClipRef.current ?? false));
    }
    if ((e.key === 'p' || e.key === 'P') && !e.repeat) {
      reloadRef.current?.();
    }
    if ((e.key === 'c' || e.key === 'C') && !e.repeat && modeRef.current === 'tps' && isLocalRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const photoCanvas = document.createElement('canvas');
      photoCanvas.width = 1920;
      photoCanvas.height = 1080;
      const pctx = photoCanvas.getContext('2d');
      if (!pctx) return;
      pctx.imageSmoothingEnabled = true;
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(canvas, 0, 0, 1920, 1080);
      const texCtx = document.createElement('canvas').getContext('2d');
      if (!texCtx) return;
      texCtx.canvas.width = 1920;
      texCtx.canvas.height = 1080;
      texCtx.drawImage(photoCanvas, 0, 0);
      const imgData = texCtx.getImageData(0, 0, 1920, 1080);
      const texName = `_capture_${Date.now()}`;
      wallTexturesRef.current[texName] = imgData;
      loadedTextureNamesRef.current.add(texName);
      const pp = playerRef.current;
      const lw = wallsRef.current;
      const fwdX = Math.cos(pp.angle);
      const fwdY = Math.sin(pp.angle);
      const perpX = -fwdY;
      const perpY = fwdX;
      const cx = pp.x + fwdX * 15;
      const cy = pp.y + fwdY * 15;
      const hw = 16;
      const hd = 9;
      const corners = [
        { x: cx + perpX * hw - fwdX * hd, y: cy + perpY * hw - fwdY * hd },
        { x: cx - perpX * hw - fwdX * hd, y: cy - perpY * hw - fwdY * hd },
        { x: cx - perpX * hw + fwdX * hd, y: cy - perpY * hw + fwdY * hd },
        { x: cx + perpX * hw + fwdX * hd, y: cy + perpY * hw + fwdY * hd },
      ];
      const newWalls: WallSegment[] = [
        [corners[0], corners[1], texName],
        [corners[1], corners[2], texName],
        [corners[2], corners[3], texName],
        [corners[3], corners[0], texName],
      ];
      onWallsGeneratedRef.current?.(newWalls);
      const hit = castRay({ x: pp.x, y: pp.y }, pp.angle, lw);
      if (hit.wallIndex >= 0 && hit.distance < Infinity && hit.distance < 30) {
        const painted = [...lw];
        painted[hit.wallIndex] = [lw[hit.wallIndex][0], lw[hit.wallIndex][1], texName] as WallSegment;
        onWallsChangeRef.current?.(painted);
      }
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key.toLowerCase());
    if (e.key === 'Control') {
      ctrlHeldRef.current = false;
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch {}
      }
    }
    if (e.key === 'Alt') {
      altHeldRef.current = false;
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch {}
      }
    }
  }, [canvasRef]);

  const hasLockedRef = useRef(false);
  const lockTimeRef = useRef<number>(0);

  const handlePointerLockChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && document.pointerLockElement === canvas) {
      hasLockedRef.current = true;
      lockTimeRef.current = Date.now();
    }

    if (hasLockedRef.current && !document.pointerLockElement) {
      // 自動案内中 + ghost3d OFF (オートウォーク) はキャプチャ解除で終了しない
      if (autoRouteActiveRef.current && !ghost3dRef.current) return;
      // Ctrl/Alt 解放中は終了しない (一時的なキャプチャ解除)
      if (ctrlHeldRef.current) return;
      if (altHeldRef.current) return;
      requestAnimationFrame(() => {
        if (!document.pointerLockElement && !ctrlHeldRef.current && !altHeldRef.current) {
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

    const handleWheel = (e: WheelEvent) => {
      if (mode === 'tps') {
        e.preventDefault();
        e.stopPropagation();
        const zoomStep = 10;
        if (e.deltaY > 0) {
          tpsCamDistanceRef.current = Math.min(150, tpsCamDistanceRef.current + zoomStep);
        } else if (e.deltaY < 0) {
          tpsCamDistanceRef.current = Math.max(30, tpsCamDistanceRef.current - zoomStep);
        }
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    const loop = (time: number) => {
      const dt = prevTimeRef.current ? Math.min((time - prevTimeRef.current) / 16.667, 2) : 1;
      prevTimeRef.current = time;

      const keys = keysRef.current;
      let forward = 0;
      let strafe = 0;
      const speedMul = keys.has('shift') ? 2.5 : 1;

      if (keys.has('w') || keys.has('arrowup')) forward = 1;
      if (keys.has('s') || keys.has('arrowdown')) forward = -1;
      if (keys.has('a') || keys.has('arrowleft')) strafe = -1;
      if (keys.has('d') || keys.has('arrowright')) strafe = 1;
      if (keys.has('q')) playerRef.current.angle = normalizeAngle(playerRef.current.angle - ROTATE_SPEED * 30 * dt);
      if (keys.has('e')) playerRef.current.angle = normalizeAngle(playerRef.current.angle + ROTATE_SPEED * 30 * dt);
      const lw = wallsRef.current;
      const llw = lockedWallsRef.current;
      const closedLockedArr = llw.filter(s => !s.isOpen).map(s => [s.p1, s.p2] as [Point, Point]);
      const lm = markersRef.current;

      if (forward !== 0 || strafe !== 0) {
        if (autoRouteNoClipRef.current) {
          // 壁抜けON: 衝突判定なしで直接移動
          const cosA = Math.cos(playerRef.current.angle);
          const sinA = Math.sin(playerRef.current.angle);
          playerRef.current.x += (cosA * forward - sinA * strafe) * MOVE_SPEED * speedMul * dt;
          playerRef.current.y += (sinA * forward + cosA * strafe) * MOVE_SPEED * speedMul * dt;
        } else {
          const collisionWalls = closedLockedArr.length > 0 ? [...lw, ...closedLockedArr] : lw;
          if (mode === 'tps') {
            const newPlayer = movePlayerTps(
              playerRef.current,
              forward,
              strafe,
              playerRef.current.angle,
              collisionWalls,
              MOVE_SPEED * speedMul * dt,
              6
            );
            playerRef.current = newPlayer;
          } else {
            const newPlayer = movePlayer(
              playerRef.current,
              forward,
              strafe,
              collisionWalls,
              MOVE_SPEED * speedMul * dt,
              6
            );
            playerRef.current = newPlayer;
          }
        }
        playerChangeRef.current({ x: playerRef.current.x, y: playerRef.current.y });
      }

      // Auto-walk along route in street view (壁を無視、進行方向を向く)
      // ghost3d が ON のときはプレイヤーをルートに拘束せず、自由操作可能にする
      const aaActive = autoRouteActiveRef.current;
      const aaSegs = autoRouteSegmentsRef.current;
      const aaElapsed = autoRouteElapsedRef.current;
      const aaTiming = autoRouteTimingRef.current;
      const ghostOn = ghost3dRef.current;
      if (aaActive && aaSegs.length > 0 && aaTiming && !ghostOn) {
        const speed = aaTiming.speed;
        let remaining = aaElapsed;
        let targetX = aaSegs[0]?.start.x ?? playerRef.current.x;
        let targetY = aaSegs[0]?.start.y ?? playerRef.current.y;
        let faceX = 0;
        let faceY = 0;

        for (let si = 0; si < aaSegs.length; si++) {
          const seg = aaSegs[si];
          if (seg.distance === 0 && seg.stopDuration === 0) continue;
          const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
          const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
          if (remaining <= travelTime) {
            const t = seg.distance > 0 ? remaining / travelTime : 1;
            targetX = seg.start.x + (seg.end.x - seg.start.x) * t;
            targetY = seg.start.y + (seg.end.y - seg.start.y) * t;
            faceX = seg.end.x - seg.start.x;
            faceY = seg.end.y - seg.start.y;
            remaining = 0;
          } else {
            targetX = seg.end.x;
            targetY = seg.end.y;
            remaining -= travelTime;
            if (remaining <= seg.stopDuration) {
              const nextSeg = aaSegs.slice(si + 1).find(s => !(s.distance === 0 && s.stopDuration === 0));
              if (nextSeg) {
                faceX = nextSeg.end.x - nextSeg.start.x;
                faceY = nextSeg.end.y - nextSeg.start.y;
              } else {
                faceX = seg.end.x - seg.start.x;
                faceY = seg.end.y - seg.start.y;
              }
              remaining = 0;
            } else {
              remaining -= seg.stopDuration;
              faceX = seg.end.x - seg.start.x;
              faceY = seg.end.y - seg.start.y;
              continue;
            }
          }
          if (remaining <= 0) break;
        }

        playerRef.current.x = targetX;
        playerRef.current.y = targetY;

        if (faceX !== 0 || faceY !== 0) {
          playerRef.current.angle = Math.atan2(faceY, faceX);
        }
        playerChangeRef.current({ x: playerRef.current.x, y: playerRef.current.y });
      }

      // ドア自動解除: ghost3d の有無に関わらずゴースト/オートウォークが通過した鍵を開ける
      if (aaActive && aaSegs.length > 0 && aaTiming) {
        const prevElapsed = prevAutoElapsedRef.current;
        if (prevElapsed >= 0) {
          const spd = aaTiming.speed;
          for (const seg of aaSegs) {
            if (seg.stopDuration > 0 && seg.markerId) {
              const segSpd = seg.speed !== undefined && seg.speed > 0 ? seg.speed : spd;
              const stopEnd = seg.cumulativeDistance / Math.max(segSpd, 0.0001) + seg.cumulativeStopTime;
              if (prevElapsed < stopEnd && aaElapsed >= stopEnd) {
                const ulw = lockedWallsRef.current;
                const segMarker = markersRef.current.find(m => m.id === seg.markerId);
                const curP = segMarker ? { x: segMarker.x, y: segMarker.y } : seg.end;
                let nearestIdx = -1;
                let nearestDist = 20;
                for (let wi = 0; wi < ulw.length; wi++) {
                  const wseg = ulw[wi];
                  const wcx = (wseg.p1.x + wseg.p2.x) / 2;
                  const wcy = (wseg.p1.y + wseg.p2.y) / 2;
                  const wd = Math.hypot(wcx - curP.x, wcy - curP.y);
                  if (wd < nearestDist) {
                    nearestDist = wd;
                    nearestIdx = wi;
                  }
                }
                if (nearestIdx >= 0) {
                  const unlockFn = unlockedWallsChangeRef.current;
                  if (unlockFn) {
                    const next = ulw.map((s, idx) => idx === nearestIdx ? { ...s, isOpen: true } : s);
                    lockedWallsRef.current = next;
                    flushSync(() => {
                      unlockFn(next);
                    });
                  }
                }
              }
            }
          }
        }
        prevAutoElapsedRef.current = aaElapsed;
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
            // partner 側は teleportExitAngle があれば優先して使用
            const partnerExitAngle = partner.teleportExitAngle ?? partner.teleportAngle;
            let newAngle: number;
            if (portal.teleportAngle !== undefined && partnerExitAngle !== undefined) {
              const srcRef = (portal.teleportAngle * Math.PI) / 180;
              const dstRef = (partnerExitAngle * Math.PI) / 180;
              let offset = curP.angle - srcRef;
              offset = ((offset % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
              if (offset > Math.PI) offset -= Math.PI * 2;
              newAngle = dstRef + offset;
              newAngle = ((newAngle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
            } else if (partnerExitAngle !== undefined) {
              newAngle = (partnerExitAngle * Math.PI) / 180;
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

      const actualCamDist = tpsCamDistanceRef.current;

      let colHeights: { top: number; bottom: number; perpDist: number; rawDist: number }[];
      const LOCKED_WALL_COLOR = '#cc9900';
      const LOCKED_WALL_COLOR_DARK = '#664400';
      const PARTITION_WALL_COLOR = '#b43cff';
      const PARTITION_WALL_COLOR_DARK = '#6a1fb3';
      const closedLockedForRender = llw.filter(s => !s.isOpen).map(s => [s.p1, s.p2] as [Point, Point]);
      const partitionForRender = partitionWalls.map(s => [s.p1, s.p2] as [Point, Point]);
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
          0.3,
          { x: playerRef.current.x, y: playerRef.current.y },
          30,
          heroImageRef.current,
          wallTexturesRef.current,
          partitionForRender,
          PARTITION_WALL_COLOR, PARTITION_WALL_COLOR_DARK,
          0.6
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
          0.3,
          { x: playerRef.current.x, y: playerRef.current.y },
          30,
          wallTexturesRef.current,
          partitionForRender,
          PARTITION_WALL_COLOR, PARTITION_WALL_COLOR_DARK,
          0.6
        );
      }

      // Render markers in 3D view
      const camPos = mode === 'tps'
        ? { x: playerRef.current.x - Math.cos(playerRef.current.angle) * actualCamDist, y: playerRef.current.y - Math.sin(playerRef.current.angle) * actualCamDist }
        : { x: playerRef.current.x, y: playerRef.current.y };
      renderMarkers3D(ctx, canvas, camPos, playerRef.current.angle, FOV, colHeights, lm.map(m => ({
        ...m,
        image_loaded: (m.type === 'tps' || m.type === 'itps') ? tpsImagesRef.current[m.id] : undefined
      })));

      // 自動ルート案内マーカーを3D描画
      const aaActive2 = autoRouteActiveRef.current;
      const aaSegs2 = autoRouteSegmentsRef.current;
      const aaElapsed2 = autoRouteElapsedRef.current;
      const aaTiming2 = autoRouteTimingRef.current;
      if (aaActive2 && aaSegs2.length > 0 && aaTiming2) {
        const routeMarkers: { x: number; y: number; type: string; infoLabel?: string }[] = [];
        const speed = aaTiming2.speed;

        let pathRemaining = aaElapsed2;
        const stepInterval = 80;
        for (const seg of aaSegs2) {
          if (seg.distance === 0 && seg.stopDuration === 0) continue;
          const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
          const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
          let segElapsed = 0;
          if (pathRemaining > 0) {
            segElapsed = Math.min(pathRemaining, travelTime);
            pathRemaining -= segElapsed;
            if (pathRemaining < seg.stopDuration) pathRemaining = 0;
            else pathRemaining -= seg.stopDuration;
          }
          const segProgress = seg.distance > 0 ? segElapsed / travelTime : 1;
          const stepsOnSeg = Math.floor(seg.distance / stepInterval);
          for (let s = 1; s <= stepsOnSeg; s++) {
            const frac = s / stepsOnSeg;
            if (frac <= segProgress) continue;
            routeMarkers.push({
              x: seg.start.x + (seg.end.x - seg.start.x) * frac,
              y: seg.start.y + (seg.end.y - seg.start.y) * frac,
              type: 'checkpoint',
              infoLabel: '',
            });
          }
        }

        renderMarkers3D(ctx, canvas, camPos, playerRef.current.angle, FOV, colHeights, routeMarkers);
      }

      // 3D ghost rendering
      if (ghost3dRef.current && mode === 'tps' && autoRouteActiveRef.current && autoRouteSegmentsRef.current.length > 0 && autoRouteTimingRef.current) {
        const ghostElapsed = autoRouteElapsedRef.current;
        const ghostInterp = interpolateRoute(autoRouteSegmentsRef.current, autoRouteTimingRef.current.speed, autoRouteTimingRef.current.totalTime, ghostElapsed);
        if (ghostInterp) {
          ghostPosRef.current = { x: ghostInterp.position.x, y: ghostInterp.position.y };
          renderGhostBillboard(ctx, canvas, ghostInterp.position, camPos, playerRef.current.angle, FOV, colHeights, heroImageRef.current);
        } else {
          ghostPosRef.current = null;
        }
      } else {
        ghostPosRef.current = null;
      }

      const minimapCvs = minimapCanvasRef.current;
      if (minimapCvs) {
        const mctx = minimapCvs.getContext('2d');
        if (mctx) {
          mctx.clearRect(0, 0, minimapCvs.width, minimapCvs.height);
          renderMinimap(mctx, playerRef.current, lw, lm, mapSnapshotRef.current || bgImageRef.current);
        }
      }
      // Ghost dot on minimap overlay
      if (ghostPosRef.current && minimapCvs) {
        const mctx = minimapCvs.getContext('2d');
        if (mctx) {
          const margin = 28;
          const half = 504 / 2;
          const scale = 504 / 500;
          const gp = ghostPosRef.current;
          const dx = (gp.x - playerRef.current.x) * scale;
          const dy = (gp.y - playerRef.current.y) * scale;
          const gx = margin + half + dx;
          const gy = margin + half + dy;
          if (Math.abs(dx) <= half && Math.abs(dy) <= half) {
            mctx.fillStyle = 'rgba(150, 200, 255, 0.8)';
            mctx.beginPath();
            mctx.arc(gx, gy, 10, 0, Math.PI * 2);
            mctx.fill();
            mctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            mctx.lineWidth = 2;
            mctx.stroke();
            // direction indicator
            if (Math.hypot(dx, dy) > 20) {
              const angle = Math.atan2(gp.y - playerRef.current.y, gp.x - playerRef.current.x);
              const tipX = gx + Math.cos(angle) * 14;
              const tipY = gy + Math.sin(angle) * 14;
              mctx.strokeStyle = 'rgba(150, 200, 255, 0.6)';
              mctx.lineWidth = 2;
              mctx.beginPath();
              mctx.moveTo(gx, gy);
              mctx.lineTo(tipX, tipY);
              mctx.stroke();
            }
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

      const coordText = `X:${Math.round(playerRef.current.x)} Y:${Math.round(playerRef.current.y)}`;
      ctx.textAlign = 'start';
      ctx.font = 'bold 16px monospace';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(coordText, 10, canvas.height - 10);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
      ctx.fillText(coordText, 10, canvas.height - 10);

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

      // Ghost direction compass
      if (ghostPosRef.current && mode === 'tps') {
        const gp = ghostPosRef.current;
        const pa = Math.atan2(gp.y - playerRef.current.y, gp.x - playerRef.current.x);
        const relAngle = normalizeAngle(pa - playerRef.current.angle);
        const cx3 = canvas.width - 44;
        const cy3 = 84;
        const r = 16;
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx3, cy3, r, 0, Math.PI * 2);
        ctx.stroke();
        const arrowX = cx3 + Math.sin(relAngle) * r;
        const arrowY = cy3 - Math.cos(relAngle) * r;
        ctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(150, 200, 255, 0.4)';
        const gDist = Math.round(Math.hypot(gp.x - playerRef.current.x, gp.y - playerRef.current.y));
        ctx.fillText(`👻${gDist}px`, cx3, cy3 + r + 12);
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

      // TPS画像: マーカー3D位置に追従する高画質オーバーレイ
      const ovCanvas = imageOverlayCanvasRef?.current;
      if (ovCanvas && mode === 'tps') {
        const octx = ovCanvas.getContext('2d');
        if (octx) {
          octx.clearRect(0, 0, ovCanvas.width, ovCanvas.height);
          const tpsImgs = tpsImagesRef.current;
          const scaleX = ovCanvas.width / canvas.width;
          const scaleY = ovCanvas.height / canvas.height;
          const scale = Math.min(scaleX, scaleY);
          const offX = (ovCanvas.width - canvas.width * scale) / 2;
          const offY = (ovCanvas.height - canvas.height * scale) / 2;
          const halfFov = FOV / 2;
          const distPlane = (canvas.height / 2) / Math.tan(FOV / 2);
          for (const m of lm) {
            if ((m.type !== 'tps' && m.type !== 'itps') || !tpsImgs[m.id]) continue;
            const img = tpsImgs[m.id];
            // 看板的な近接表示: マーカーに接近したときだけ表示
            const worldDist = Math.hypot(m.x - playerRef.current.x, m.y - playerRef.current.y);
            if (worldDist > 18) continue;
            const dx = m.x - camPos.x, dy = m.y - camPos.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1) continue;
            const angleToMarker = Math.atan2(dy, dx);
            let relAngle = normalizeAngle(angleToMarker - playerRef.current.angle);
            if (relAngle > Math.PI) relAngle -= Math.PI * 2;
            if (Math.abs(relAngle) > halfFov) continue;
            const screenX = ((relAngle + halfFov) / FOV) * (canvas.width - 1);
            if (screenX < 0 || screenX >= canvas.width) continue;
            const perpDist = dist * Math.cos(relAngle);
            if (perpDist < 1) continue;
            if (colHeights[Math.round(screenX)].perpDist < perpDist) continue;
            const baseWorldHeight = 18 * (tpsPinSize / 100);
            const ph = Math.max(2, Math.round((baseWorldHeight * distPlane) / perpDist));
            const imgW = Math.round(ph * 2);
            const imgH = Math.round(imgW * img.height / img.width);
            // 地面から 15 ワールド単位上の位置を画像の中心に（視線の高さ）
            const centerWorldHeight = 15;
            const centerY = Math.round(canvas.height / 2 - 50 + ((24 - centerWorldHeight) * distPlane) / perpDist);
            const drawTop = Math.round(centerY - imgH / 2);
            const drawLeft = screenX - imgW / 2;
            // Convert to overlay canvas coordinates (uniform scale preserves aspect ratio)
            const sx = drawLeft * scale + offX;
            const sy = drawTop * scale + offY;
            const sw = imgW * scale;
            const sh = imgH * scale;
            octx.save();
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';
            const angle = ((m.teleportAngle ?? 0) % 360) * Math.PI / 180;
            if (Math.abs(angle) > 0.001) {
              octx.translate(sx + sw / 2, sy + sh / 2);
              octx.rotate(angle);
              octx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
            } else {
              octx.drawImage(img, sx, sy, sw, sh);
            }
            octx.restore();
            break;
          }
        }
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [mode, canvasRef]);

  return null;
};

export default FpsView;
