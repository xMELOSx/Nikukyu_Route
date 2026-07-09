import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Point, HeistMarker, FloorType, LockedWallSegment, WallSegment } from '../utils/DataManager';
import type { RouteSegment } from '../utils/AutoRoute';
import { MARKER_META, PRESET_MAPS_META } from '../utils/DataManager';
import FpsView from './FpsView';

interface FpsTpsControlsProps {
  walls: WallSegment[];
  lockedWalls: LockedWallSegment[];
  partitionWalls?: { p1: Point; p2: Point }[];
  onLockedWallsChange?: (walls: LockedWallSegment[]) => void;
  markers: HeistMarker[];
  floor: FloorType;
  customBg: string | null;
  bgOffset?: Point;
  bgScale?: Point;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  startSmoothScroll: (pan: Point, zoom: number) => void;
  startupFocusMarkerId?: string;
  hideButtons?: boolean;
  currentPosition: Point | null;
  onPositionChange: (pos: Point) => void;
  hiddenMarkers?: string[];
  hiddenMarkerTypes?: string[];
  spawnPoints?: any[];
  strokes?: any;
  spawnItems?: any[];
  mapSnapshotCanvas?: HTMLCanvasElement | null;
  onFreeCamModeChange?: (active: boolean) => void;
  onToggleNearestPhone?: () => void;
  autoRouteActive?: boolean;
  autoRouteSegments?: RouteSegment[];
  autoRouteElapsed?: number;
  autoRouteTiming?: { totalTime: number; speed: number };
  ghost3d?: boolean;
  fpsResolutionScale?: number;
  tpsPinSize?: number;
  spawnVisible?: boolean;
  hideRouteLines?: boolean;
  hideBranchLines?: boolean;
  isLocal?: boolean;
  onWallsGenerated?: (walls: WallSegment[]) => void;
  onWallsChange?: (walls: WallSegment[]) => void;
}

function resolveInitialPos(markers: HeistMarker[], startupFocusMarkerId?: string): Point {
  let pos: Point | null = null;
  if (startupFocusMarkerId) {
    const m = markers.find(mk => mk.id === startupFocusMarkerId);
    if (m) {
      if (m.linkedWarpId) {
        const dest = markers.find(mk => mk.id === m.linkedWarpId);
        if (dest) pos = { x: dest.x, y: dest.y };
      }
      if (!pos) pos = { x: m.x, y: m.y };
    }
  }
  if (!pos) {
    const sm = markers.find(mk => mk.type === 'start');
    if (sm) pos = { x: sm.x, y: sm.y };
  }
  return pos || { x: 800, y: 2275 };
}

const FpsTpsControls: React.FC<FpsTpsControlsProps> = ({
  walls, lockedWalls = [], onLockedWallsChange, markers, floor, customBg, bgOffset, bgScale,
  wrapperRef, zoom, startSmoothScroll,
  startupFocusMarkerId, hideButtons,
  currentPosition, onPositionChange,
  hiddenMarkers = [], hiddenMarkerTypes = [], spawnPoints = [],
  strokes = {}, spawnItems = [], mapSnapshotCanvas,
  onFreeCamModeChange, onToggleNearestPhone,
  autoRouteActive, autoRouteSegments, autoRouteElapsed, autoRouteTiming,
  ghost3d = false,
  fpsResolutionScale = 2.0,
  tpsPinSize = 100,
  spawnVisible = true,
  hideRouteLines = false,
  hideBranchLines = false,
  partitionWalls = [],
  isLocal = false,
  onWallsGenerated,
  onWallsChange
}) => {
  const [bgImage, setBgImage] = useState<HTMLCanvasElement | null>(null);
  const [freeCamMode, setFreeCamMode] = useState<false | 'fps' | 'tps'>(false);
  const [autoRouteNoClip, setAutoRouteNoClip] = useState(false);
  const fpsCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const tpsOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement | null } | null>(null);
  const bgImageElementCacheRef = useRef<{ [url: string]: HTMLImageElement } | null>(null);
  const canvasScale = useMemo(() => fpsResolutionScale, [fpsResolutionScale]);

  useEffect(() => {
    onFreeCamModeChange?.(!!freeCamMode);
  }, [freeCamMode, onFreeCamModeChange]);

  // Resize overlay canvas to container display size
  useEffect(() => {
    const resize = () => {
      const ov = tpsOverlayRef.current;
      if (!ov || !freeCamMode) return;
      const p = ov.parentElement;
      if (!p) return;
      const r = p.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ov.width = Math.round(r.width * dpr);
      ov.height = Math.round(r.height * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [freeCamMode]);

  const captureLatestBgImageData = useCallback(() => {
    const bgUrl = customBg || PRESET_MAPS_META[floor]?.path;
    if (!bgUrl) {
      setBgImage(null);
      return;
    }

    const hMarkers = hiddenMarkers || [];
    const hTypes = hiddenMarkerTypes || [];
    const activeMarkers = markers.filter(m => !hMarkers.includes(m.id) && !hTypes.includes(m.type));

    const currentFloorStrokes = strokes[floor] || [];
    const waypointCount = markers.reduce((s, m) => s + (m.warpWaypoints?.length || 0), 0);
    const cacheKey = `${floor}|${customBg ?? ''}|${bgOffset?.x ?? 0},${bgOffset?.y ?? 0}|${bgScale?.x ?? 1},${bgScale?.y ?? 1}|m:${activeMarkers.length}|sp:${spawnPoints?.length ?? 0}|s:${currentFloorStrokes.length}|wp:${waypointCount}`;
    if (bgCacheRef.current && bgCacheRef.current.key === cacheKey && bgCacheRef.current.canvas) {
      setBgImage(bgCacheRef.current.canvas);
      return;
    }

    if (!bgImageElementCacheRef.current) {
      bgImageElementCacheRef.current = {};
    }

    const cachedImg = bgImageElementCacheRef.current[bgUrl];
    const drawCanvasWithImg = (img: HTMLImageElement) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 1600;
      tempCanvas.height = 4550;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.fillStyle = '#0a0f1c';
        tempCtx.fillRect(0, 0, 1600, 4550);

        if (customBg) {
          tempCtx.save();
          const ox = bgOffset?.x ?? 0;
          const oy = bgOffset?.y ?? 0;
          const sx = bgScale?.x ?? 1;
          const sy = bgScale?.y ?? 1;
          tempCtx.translate(ox, oy);
          tempCtx.scale(sx, sy);
          tempCtx.drawImage(img, 0, 0, 1600, 4550);
          tempCtx.restore();
        } else {
          tempCtx.drawImage(img, 0, 0, 1600, 4550);
        }

        // Draw Spawn Points on ground texture (matching rarity color from settings)
        if (spawnVisible && spawnPoints) {
          const itemMap: Record<string, any> = {};
          if (spawnItems) {
            for (const item of spawnItems) itemMap[item.id] = item;
          }
          const rarityRank: Record<string, number> = { green: 0, blue: 1, purple: 2, yellow: 3, red: 4, cyan: 5 };
          const rarityColor: Record<string, string> = { green: '#39ff14', blue: '#00bfff', purple: '#b388ff', yellow: '#ffd700', red: '#ff4444', cyan: '#00ffff' };

          for (const sp of spawnPoints) {
            if (sp.floor === floor) {
              let bestRank = -1;
              let color = '#888888';
              if (sp.items) {
                for (const pi of sp.items) {
                  const item = itemMap[pi.itemId];
                  if (!item) continue;
                  const rank = rarityRank[item.textColor] ?? -1;
                  if (rank > bestRank) {
                    bestRank = rank;
                    color = rarityColor[item.textColor] ?? '#888888';
                  }
                }
              }

              tempCtx.fillStyle = color;
              tempCtx.beginPath();
              tempCtx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
              tempCtx.fill();
              tempCtx.strokeStyle = '#000000';
              tempCtx.lineWidth = 1;
              tempCtx.stroke();
            }
          }
        }

        // Draw Route Strokes on ground texture
        if (!hideRouteLines) {
          for (const stroke of currentFloorStrokes) {
            if (stroke.points.length < 2) continue;
            tempCtx.beginPath();
            tempCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
              tempCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            tempCtx.strokeStyle = stroke.color || '#39ff14';
            tempCtx.lineWidth = stroke.width || 4;
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';
            tempCtx.globalAlpha = stroke.opacity !== undefined ? stroke.opacity : 1.0;
            tempCtx.stroke();
          }
          tempCtx.globalAlpha = 1.0; // Reset alpha
        }

        // Draw waypoint/link lines between connected markers
        if (!hideBranchLines) {
          for (const m of activeMarkers) {
            if (m.floor !== floor || !m.linkedWarpId) continue;
            const partner = activeMarkers.find(mk => mk.id === m.linkedWarpId);
            if (!partner || partner.floor !== floor) continue;
            const meta = MARKER_META[m.type];
            tempCtx.strokeStyle = meta?.color || '#ff00ff';
            tempCtx.lineWidth = 2;
            tempCtx.globalAlpha = 0.5;

          const waypoints = (m.warpWaypoints || []).filter((wp): wp is Point => wp !== null && wp !== undefined);
          if (waypoints.length > 0) {
            tempCtx.beginPath();
            tempCtx.moveTo(m.x, m.y);
            for (const wp of waypoints) tempCtx.lineTo(wp.x, wp.y);
            tempCtx.lineTo(partner.x, partner.y);
            tempCtx.stroke();
          } else {
            // Direct line (no waypoints)
            tempCtx.beginPath();
            tempCtx.moveTo(m.x, m.y);
            tempCtx.lineTo(partner.x, partner.y);
            tempCtx.stroke();
          }
        }
        }
        tempCtx.globalAlpha = 1.0;

        // Draw Active Markers on ground texture
        for (const m of activeMarkers) {
          if (m.floor === floor) {
            const meta = MARKER_META[m.type];
            const color = meta?.color || '#ff0055';
            // Colored ring (outer)
            tempCtx.strokeStyle = color;
            tempCtx.lineWidth = 2.5;
            tempCtx.beginPath();
            tempCtx.arc(m.x, m.y, 7, 0, Math.PI * 2);
            tempCtx.stroke();
            // White inner fill
            tempCtx.fillStyle = 'rgba(255,255,255,0.85)';
            tempCtx.beginPath();
            tempCtx.arc(m.x, m.y, 6, 0, Math.PI * 2);
            tempCtx.fill();
            // Emoji icon
            if (meta?.emoji) {
              tempCtx.font = '9px sans-serif';
              tempCtx.textAlign = 'center';
              tempCtx.textBaseline = 'middle';
              tempCtx.fillStyle = color;
              tempCtx.fillText(meta.emoji, m.x, m.y + 0.5);
            }
          }
        }

        bgCacheRef.current = { key: cacheKey, canvas: tempCanvas };
        setBgImage(tempCanvas);
      }
    };

    if (cachedImg && cachedImg.complete) {
      drawCanvasWithImg(cachedImg);
      return;
    }

    const img = cachedImg || new Image();
    if (!cachedImg) {
      img.crossOrigin = "anonymous";
      bgImageElementCacheRef.current[bgUrl] = img;
    }
    img.onload = () => {
      drawCanvasWithImg(img);
    };
    img.onerror = () => {
      setBgImage(null);
    };
    img.src = bgUrl;
  }, [floor, customBg, bgOffset, bgScale, markers, hiddenMarkers, hiddenMarkerTypes, spawnPoints]);

  const handleExit = useCallback(() => {
    setFreeCamMode(false);
    const pos = currentPosition;
    if (!pos) return;
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const W_v = wrapper.clientWidth;
      const H_v = wrapper.clientHeight;
      const tgtZoom = zoom || 1;
      const tgtPan = {
        x: W_v * 0.5 - 800 - (pos.x - 800) * tgtZoom,
        y: H_v * 0.6 - 2275 - (pos.y - 2275) * tgtZoom
      };
      startSmoothScroll(tgtPan, tgtZoom);
    }
  }, [wrapperRef, zoom, currentPosition, startSmoothScroll]);

  const handleReload = useCallback(() => {
    bgCacheRef.current = null;
    captureLatestBgImageData();
  }, [captureLatestBgImageData]);

  useEffect(() => {
    if (freeCamMode) {
      // ghost3d OFF + 自動案内中 → マウスキャプチャ不要 (オートウォーク)
      if (autoRouteActive && !ghost3d) {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        return;
      }
      // ghost3d ON + 自動案内中、または通常時 → マウスキャプチャ有効 (マウスルック)
      const c = fpsCanvasRef.current;
      if (c && document.pointerLockElement !== c) {
        const tryLock = () => { try { c.requestPointerLock(); } catch {} };
        requestAnimationFrame(() => requestAnimationFrame(tryLock));
      }
    }
  }, [freeCamMode, autoRouteActive, ghost3d]);

  const handleStart = useCallback((mode: 'fps' | 'tps') => {
    captureLatestBgImageData();
    if (!currentPosition) {
      onPositionChange(resolveInitialPos(markers, startupFocusMarkerId));
    }
    setFreeCamMode(mode);

    // ghost3d OFF + 自動案内中はマウスキャプチャ不要
    if (autoRouteActive && !ghost3d) return;

    const c = fpsCanvasRef.current;
    if (c) {
      try {
        c.requestPointerLock();
      } catch (e) {
        console.error("Pointer lock failed on button click:", e);
      }
    }
  }, [captureLatestBgImageData, currentPosition, onPositionChange, markers, startupFocusMarkerId, autoRouteActive, ghost3d]);

  const handlePlayerChange = useCallback((pos: Point) => {
    onPositionChange(pos);
  }, [onPositionChange]);

  const handleToggleMode = useCallback(() => {
    setFreeCamMode(prev => prev === 'tps' ? 'fps' : 'tps');
  }, []);

  return (
    <>
      {!hideButtons && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 100,
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          transform: 'scale(var(--zoom-hud-scale, 1))',
          transformOrigin: 'top right'
        }}>
          <button
            className="zoom-btn"
            onClick={() => handleStart('tps')}
            title="ストリートビュー: TPSモードでマップ上を歩く (TキーでFPS切替)"
            style={{ width: 'auto', padding: '0 8px', fontSize: '10px', gap: '4px', display: 'flex', alignItems: 'center', textTransform: 'none' }}
          >
            🏃 ストリートビュー
          </button>
        </div>
      )}

      <div style={{
        display: freeCamMode ? 'block' : 'none',
        position: 'absolute', inset: 0, zIndex: 9999,
        background: '#000', overflow: 'hidden'
      }}>
        <canvas
          ref={fpsCanvasRef}
          width={Math.round(424 * canvasScale)}
          height={Math.round(240 * canvasScale)}
          className="fps-overlay"
        />
        <canvas
          ref={tpsOverlayRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 3,
          }}
        />
        <canvas
          ref={minimapCanvasRef}
          width={560}
          height={560}
          style={{
            position: 'absolute',
            top: window.innerWidth < 768 ? '10px' : '14px',
            left: window.innerWidth < 768 ? '10px' : '14px',
            width: window.innerWidth < 768 ? '160px' : '280px',
            height: window.innerWidth < 768 ? '160px' : '280px',
            imageRendering: 'pixelated',
            borderRadius: '2px',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {/* HUD overlay (screen-resolution key hints, not canvas-rendered) */}
        {freeCamMode && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            fontSize: '24px', fontFamily: 'monospace', color: 'rgba(0, 240, 255, 0.85)',
            textShadow: '0 0 4px #000, 0 0 8px #000, 0 0 12px #000'
          }}>
            <div style={{ position: 'absolute', top: '12px', left: '14px', fontWeight: 'bold', fontSize: '32px' }}>
              {freeCamMode === 'tps' ? (
                <span style={{ color: 'rgba(255, 200, 50, 0.9)' }}>TPS</span>
              ) : (
                <span style={{ color: 'rgba(0, 240, 255, 0.9)' }}>FPS</span>
              )}
            </div>
            <div style={{ position: 'absolute', top: '14px', right: '14px', display: 'flex', gap: '6px', pointerEvents: 'auto', cursor: 'pointer' }}>
              <span style={{ background: 'rgba(0, 180, 255, 0.8)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '20px', border: '1px solid rgba(0, 200, 255, 0.8)', textShadow: 'none', fontWeight: 'bold' }}
                onClick={() => handleReload()}
                title="マップ床を再読み込み [P]"
              >
                ↻
              </span>
              <span style={{ background: 'rgba(200, 50, 50, 0.85)', color: '#fff', padding: '6px 16px', borderRadius: '4px', fontSize: '22px', border: '1px solid rgba(255, 100, 100, 0.9)', textShadow: 'none', fontWeight: 'bold' }}
                onClick={() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 })); }}
              >
                ✕ 終了
              </span>
            </div>
            <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', fontSize: '22px', opacity: 0.7, textAlign: 'center', whiteSpace: 'nowrap' }}>
               [WASD]移動 [Shift]ﾀﾞｯｼｭ [Q/E]回転 [R]電話 [T]切替 [F]鍵 [H]壁抜け [Alt]一時解放 [Ctrl]解放 [P]再読込{isLocal ? ' [C]撮影' : ''} [ESC]終了
            </div>
          </div>
        )}
        {freeCamMode && currentPosition && (
          <FpsView
            walls={walls}
            lockedWalls={lockedWalls}
            partitionWalls={partitionWalls}
            onLockedWallsChange={onLockedWallsChange}
            markers={markers}
            playerPos={currentPosition}
            onExit={handleExit}
            onPlayerChange={handlePlayerChange}
            mode={freeCamMode}
            canvasRef={fpsCanvasRef}
            minimapCanvasRef={minimapCanvasRef}
            bgImage={bgImage}
            hiddenMarkers={hiddenMarkers}
            hiddenMarkerTypes={hiddenMarkerTypes}
            mapSnapshotCanvas={mapSnapshotCanvas ?? null}
            onToggleNearestPhone={onToggleNearestPhone}
            onToggleMode={handleToggleMode}
            autoRouteActive={autoRouteActive}
            autoRouteSegments={autoRouteSegments}
            autoRouteElapsed={autoRouteElapsed}
            autoRouteTiming={autoRouteTiming}
            ghost3d={ghost3d}
            autoRouteNoClip={autoRouteNoClip}
            onAutoRouteNoClipChange={setAutoRouteNoClip}
            imageOverlayCanvasRef={tpsOverlayRef}
            tpsPinSize={tpsPinSize}
            onReload={handleReload}
            isLocal={isLocal}
            onWallsGenerated={onWallsGenerated}
            onWallsChange={onWallsChange}
          />
        )}
        {/* Mobile touch controls */}
        {freeCamMode && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '220px', zIndex: 10, pointerEvents: 'none',
            display: 'flex', justifyContent: 'space-between', padding: '0 20px 20px'
          }}>
            {/* D-pad: movement (cross layout) */}
            <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', alignSelf: 'flex-end' }}>
              <button
                style={{ width: 44, height: 44, fontSize: 18, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', keyCode: 87 })); }}
                onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', keyCode: 87 })); }}
                onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', keyCode: 87 })); }}
              >▲</button>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button
                  style={{ width: 44, height: 44, fontSize: 18, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                  onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', keyCode: 65 })); }}
                  onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', keyCode: 65 })); }}
                  onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', keyCode: 65 })); }}
                >◀</button>
                <button
                  style={{ width: 44, height: 44, fontSize: 18, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                  onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', keyCode: 83 })); }}
                  onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 's', keyCode: 83 })); }}
                  onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 's', keyCode: 83 })); }}
                >▼</button>
                <button
                  style={{ width: 44, height: 44, fontSize: 18, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                  onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', keyCode: 68 })); }}
                  onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', keyCode: 68 })); }}
                  onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', keyCode: 68 })); }}
                >▶</button>
              </div>
            </div>
            {/* Action buttons (vertical stack) + rotation */}
            <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', alignSelf: 'flex-end' }}>
              <button
                style={{ width: 52, height: 44, fontSize: 11, background: 'rgba(255,50,50,0.3)', border: '1px solid rgba(255,50,50,0.5)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', keyCode: 82 })); }}
              >📞 R</button>
              <button
                style={{ width: 52, height: 44, fontSize: 11, background: 'rgba(0,240,255,0.2)', border: '1px solid rgba(0,240,255,0.4)', borderRadius: 8, color: '#fff', touchAction: 'none' }}
                onTouchStart={e => { e.preventDefault(); const ev = new KeyboardEvent('keydown', { key: 't', keyCode: 84 }); window.dispatchEvent(ev); }}
              >切替 T</button>
              <button
                style={{ width: 52, height: 44, fontSize: 11, background: 'rgba(255,200,0,0.25)', border: '1px solid rgba(255,200,0,0.5)', borderRadius: 8, color: '#ffc800', touchAction: 'none' }}
                onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', keyCode: 70 })); }}
              >🔑 鍵 F</button>
              <button
                style={{ width: 52, height: 44, fontSize: 11, background: 'rgba(0,150,255,0.25)', border: '1px solid rgba(0,180,255,0.5)', borderRadius: 8, color: '#66d0ff', touchAction: 'none' }}
                onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', keyCode: 80 })); }}
              >↻ P</button>
              <button
                style={{ width: 52, height: 44, fontSize: 10, background: autoRouteNoClip ? 'rgba(255,200,0,0.35)' : 'rgba(180,0,255,0.3)', border: `1px solid ${autoRouteNoClip ? 'rgba(255,200,0,0.6)' : 'rgba(180,0,255,0.6)'}`, borderRadius: 8, color: autoRouteNoClip ? '#ffc800' : '#cc66ff', touchAction: 'none', lineHeight: 1.2 }}
                onClick={() => setAutoRouteNoClip(v => !v)}
              >壁抜け<br/>{(autoRouteNoClip ? 'ON' : 'OFF')}</button>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  style={{ width: 44, height: 44, fontSize: 14, background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)', borderRadius: 8, color: '#ffc800', touchAction: 'none' }}
                  onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', keyCode: 81 })); }}
                  onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', keyCode: 81 })); }}
                  onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', keyCode: 81 })); }}
                >↺</button>
                <button
                  style={{ width: 44, height: 44, fontSize: 14, background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)', borderRadius: 8, color: '#ffc800', touchAction: 'none' }}
                  onTouchStart={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', keyCode: 69 })); }}
                  onTouchEnd={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', keyCode: 69 })); }}
                  onTouchCancel={e => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', keyCode: 69 })); }}
                >↻</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default FpsTpsControls;
