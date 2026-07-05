import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Point, HeistMarker, FloorType } from '../utils/DataManager';
import { PRESET_MAPS_META } from '../utils/DataManager';
import FpsView from './FpsView';

interface FpsTpsControlsProps {
  walls: [Point, Point][];
  markers: HeistMarker[];
  floor: FloorType;
  customBg: string | null;
  bgOffset?: Point;
  bgScale?: Point;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  startSmoothScroll: (pan: Point, zoom: number) => void;
  startupFocusMarkerId?: string;
  hideButtons?: boolean;
  currentPosition: Point | null;
  onPositionChange: (pos: Point) => void;
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
  walls, markers, floor, customBg, bgOffset, bgScale,
  canvasRef, wrapperRef, zoom, startSmoothScroll,
  startupFocusMarkerId, hideButtons,
  currentPosition, onPositionChange
}) => {
  const [bgImageData, setBgImageData] = useState<ImageData | null>(null);
  const [freeCamMode, setFreeCamMode] = useState<false | 'fps' | 'tps'>(false);
  const fpsCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCacheRef = useRef<{ key: string; data: ImageData | null } | null>(null);

  const captureLatestBgImageData = useCallback(() => {
    const bgUrl = customBg || PRESET_MAPS_META[floor]?.path;
    if (!bgUrl) {
      setBgImageData(null);
      return;
    }

    const cacheKey = `${floor}|${customBg ?? ''}|${bgOffset?.x ?? 0},${bgOffset?.y ?? 0}|${bgScale?.x ?? 1},${bgScale?.y ?? 1}`;
    if (bgCacheRef.current && bgCacheRef.current.key === cacheKey && bgCacheRef.current.data) {
      setBgImageData(bgCacheRef.current.data);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
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

        try {
          const data = tempCtx.getImageData(0, 0, 1600, 4550);
          bgCacheRef.current = { key: cacheKey, data };
          setBgImageData(data);
        } catch (e) {
          console.error("Failed to capture latest bg image data:", e);
          setBgImageData(null);
        }
      }
    };
    img.onerror = () => {
      setBgImageData(null);
    };
    img.src = bgUrl;
  }, [floor, customBg, bgOffset, bgScale]);

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

  useEffect(() => {
    if (freeCamMode) {
      const c = fpsCanvasRef.current;
      if (c) {
        const tryLock = () => { try { c.requestPointerLock(); } catch {} };
        // requestPointerLock は要素が可視になってからでないと失敗する場合がある
        requestAnimationFrame(() => requestAnimationFrame(tryLock));
      }
    }
  }, [freeCamMode]);

  const handleStart = useCallback((mode: 'fps' | 'tps') => {
    captureLatestBgImageData();
    if (!currentPosition) {
      onPositionChange(resolveInitialPos(markers, startupFocusMarkerId));
    }
    setFreeCamMode(mode);
  }, [captureLatestBgImageData, currentPosition, onPositionChange, markers, startupFocusMarkerId]);

  const handlePlayerChange = useCallback((pos: Point) => {
    onPositionChange(pos);
  }, [onPositionChange]);

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
            onClick={() => handleStart('fps')}
            title="FPSモード: 一人称でマップ上を歩く"
            style={{ width: 'auto', padding: '0 8px', fontSize: '10px', gap: '4px', display: 'flex', alignItems: 'center', textTransform: 'none' }}
          >
            🎮 FPS
          </button>
          <button
            className="zoom-btn"
            onClick={() => handleStart('tps')}
            title="TPSモード: 三人称でマップ上を歩く"
            style={{ width: 'auto', padding: '0 8px', fontSize: '10px', gap: '4px', display: 'flex', alignItems: 'center', textTransform: 'none' }}
          >
            🏃 TPS
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
          width={424}
          height={240}
          className="fps-overlay"
        />
        {freeCamMode && currentPosition && (
          <FpsView
            walls={walls}
            markers={markers}
            playerPos={currentPosition}
            onExit={handleExit}
            onPlayerChange={handlePlayerChange}
            mode={freeCamMode}
            canvasRef={fpsCanvasRef}
            bgImageData={bgImageData}
          />
        )}
      </div>
    </>
  );
};

export default FpsTpsControls;
