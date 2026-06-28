import { useState, useRef, useEffect } from 'react';
import {
  type DrawingStroke,
  type HeistMarker,
  MARKER_META,
} from '../utils/DataManager';
import {
  buildAutoRoute,
  computeRouteTiming,
  interpolateRoute,
  playCheckpointSound,
  prewarmAudio,
  speakCheckpointTime,
  type RouteSegment,
} from '../utils/AutoRoute';
import type { AutoRouteStatus, AutoRouteSettings, AutoRouteCommand } from './useAutoRoute';

export interface UseAutoRouteEngineParams {
  markers: HeistMarker[];
  strokes: DrawingStroke[];
  floor: string;
  stopMarkerThreshold: number;
  movementMarkerThreshold: number;
  warpMarkerThreshold: number;
  hiddenMarkers: string[];
  targetDurationSeconds?: number;
  autoRouteSettings?: AutoRouteSettings;
  followCamera: boolean;
  autoRouteCommand?: AutoRouteCommand | null;
  onAutoRouteStatusChange?: (status: AutoRouteStatus) => void;
  checkpointVoiceOn: boolean;
  pickyMarkerIds?: { [markerId: string]: boolean };
  // Viewport refs for follow-camera
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  animZoomRef: React.MutableRefObject<number>;
  animPanRef: React.MutableRefObject<{ x: number; y: number }>;
  targetPanRef: React.MutableRefObject<{ x: number; y: number }>;
  setPan: (pan: { x: number; y: number }) => void;
  setCurrentPosition: (pos: { x: number; y: number } | null) => void;
  zoom: number;
  onAutoStartMarkerSet?: (marker: HeistMarker | null) => void;
  onTick?: (elapsed: number, pos: { x: number; y: number }) => void;
  onStartPlayback?: () => void;
  onStart?: () => void;
}

function nextMarkerLabel(segments: RouteSegment[], elapsed: number, speed: number): string {
  if (segments.length === 0) return '';
  let remaining = elapsed;
  for (const seg of segments) {
    const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
    const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
    if (remaining <= travelTime) return '';
    remaining -= travelTime;
    if (remaining <= seg.stopDuration) {
      if (seg.markerType && MARKER_META[seg.markerType as keyof typeof MARKER_META]) {
        const meta = MARKER_META[seg.markerType as keyof typeof MARKER_META];
        return `${meta.emoji} ${meta.label} (停止中)`;
      }
      return seg.markerType || '';
    }
    remaining -= seg.stopDuration;
  }
  return '';
}

export function useAutoRouteEngine({
  markers,
  strokes,
  floor,
  stopMarkerThreshold,
  movementMarkerThreshold,
  warpMarkerThreshold,
  hiddenMarkers,
  targetDurationSeconds,
  autoRouteSettings,
  followCamera,
  autoRouteCommand,
  onAutoRouteStatusChange,
  checkpointVoiceOn,
  pickyMarkerIds,
  wrapperRef,
  animZoomRef,
  animPanRef,
  targetPanRef,
  setPan,
  setCurrentPosition,
  zoom,
  onAutoStartMarkerSet,
  onTick,
  onStart,
}: UseAutoRouteEngineParams) {
  const latestElapsedRef = useRef<number>(0);
  const latestPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [autoRouteActive, setAutoRouteActive] = useState(false);
  const [autoRouteRunning, setAutoRouteRunning] = useState(false);
  const [autoRouteElapsed, setAutoRouteElapsed] = useState(0);
  const [autoRouteSegments, setAutoRouteSegments] = useState<RouteSegment[]>([]);
  const [autoRouteTiming, setAutoRouteTiming] = useState<{ totalTime: number; totalDistance: number; totalStopTime: number; speed: number }>({ totalTime: 0, totalDistance: 0, totalStopTime: 0, speed: 0 });
  const [autoRouteBaseTiming, setAutoRouteBaseTiming] = useState<{ speed: number; totalTime: number; totalDistance: number; totalStopTime: number }>({ speed: 0, totalTime: 0, totalDistance: 0, totalStopTime: 0 });
  const [autoRouteError, setAutoRouteError] = useState<string | null>(null);

  const autoRouteStartTimeRef = useRef<number>(0);
  const autoRouteElapsedAtStartRef = useRef<number>(0);
  const autoRouteAnimRef = useRef<number | null>(null);
  const autoRouteWaitUntilRef = useRef<number>(0);
  const autoRoutePrevSegmentIdRef = useRef<string>('');
  const followCameraRef = useRef<boolean>(false);
  followCameraRef.current = followCamera;
  const autoRouteElapsedRef = useRef<number>(0);
  const markersRef = useRef<HeistMarker[]>(markers);
  markersRef.current = markers;
  const pickyMarkerIdsRef = useRef<{ [markerId: string]: boolean } | undefined>(pickyMarkerIds);
  pickyMarkerIdsRef.current = pickyMarkerIds;

  const resetAutoRoute = () => {
    setAutoRouteRunning(false);
    setAutoRouteActive(false);
    setAutoRouteElapsed(0);
    autoRouteElapsedRef.current = 0;
    setAutoRouteSegments([]);
    setAutoRouteTiming({ totalTime: 0, totalDistance: 0, totalStopTime: 0, speed: 0 });
    if (autoRouteAnimRef.current) cancelAnimationFrame(autoRouteAnimRef.current);
    if (onAutoStartMarkerSet) onAutoStartMarkerSet(null);
  };

  const startAutoRoute = () => {
    onStart?.();
    setAutoRouteError(null);
    prewarmAudio();
    const startMarker = markers.find(m => m.type === 'start');
    let effectiveStartMarker = startMarker;
    if (!effectiveStartMarker) {
      const solidStrokes = strokes.filter(s => s.type === 'solid');
      if (solidStrokes.length === 0 || solidStrokes[0].points.length === 0) {
        setAutoRouteError('スタートマーカー (🐾) も進行ルート (実線) も見つかりません。');
        return;
      }
      const startPoint = solidStrokes[0].points[0];
      effectiveStartMarker = {
        id: '__auto_start__',
        type: 'start',
        x: startPoint.x,
        y: startPoint.y,
        note: '',
        floor: floor as any,
      } as HeistMarker;
      if (onAutoStartMarkerSet) onAutoStartMarkerSet(effectiveStartMarker);
    }
    const routeSegments = buildAutoRoute(strokes, markers, effectiveStartMarker, {
      stopMarkerThreshold,
      movementMarkerThreshold,
      warpMarkerThreshold
    }, hiddenMarkers || [], pickyMarkerIds);
    if (routeSegments.length === 0) {
      setAutoRouteError('スタートから繋がる進行ルート (実線) が見つかりません。');
      return;
    }
    const targetDur = targetDurationSeconds && targetDurationSeconds > 0 ? targetDurationSeconds : undefined;
    const baseTiming = computeRouteTiming(routeSegments, targetDur);
    setAutoRouteBaseTiming(baseTiming);
    if (baseTiming.ignoredCheckpoint) {
      setAutoRouteError(`⚠ チェックポイント目標が無効: ${baseTiming.ignoredCheckpoint.reason} (目標 ${baseTiming.ignoredCheckpoint.target}秒 / 停止 ${baseTiming.ignoredCheckpoint.stopTime}秒)`);
    }
    const mult = autoRouteSettings?.speedMultiplier ?? 1;
    const timing = { ...baseTiming, speed: baseTiming.speed * mult, totalTime: baseTiming.totalTime };
    const waitEnabled = autoRouteSettings?.waitEnabled ?? false;
    const waitSeconds = autoRouteSettings?.waitSeconds ?? 0;
    setAutoRouteSegments(routeSegments);
    setAutoRouteTiming(timing);
    setAutoRouteElapsed(0);
    autoRouteElapsedRef.current = 0;
    setAutoRouteActive(true);
    setAutoRouteRunning(!waitEnabled);
    autoRouteStartTimeRef.current = performance.now();
    autoRouteElapsedAtStartRef.current = 0;
    autoRouteWaitUntilRef.current = waitEnabled ? performance.now() + waitSeconds * 1000 : 0;
    setCurrentPosition({ x: effectiveStartMarker.x, y: effectiveStartMarker.y });
    if (followCamera && wrapperRef.current) {
      const W_v = wrapperRef.current.clientWidth;
      const H_v = wrapperRef.current.clientHeight;
      const tgtZoom = zoom || 1;
      const tgtPan = {
        x: W_v * 0.5 - 800 - (effectiveStartMarker.x - 800) * tgtZoom,
        y: H_v * 0.6 - 2275 - (effectiveStartMarker.y - 2275) * tgtZoom
      };
      setPan(tgtPan);
      animPanRef.current = tgtPan;
    }
  };

  const pauseAutoRoute = () => {
    setAutoRouteRunning(false);
  };

  const resumeAutoRoute = () => {
    if (!autoRouteActive) return;
    setAutoRouteRunning(true);
    autoRouteStartTimeRef.current = performance.now();
    autoRouteElapsedAtStartRef.current = autoRouteElapsedRef.current;
  };

  // Auto-route animation loop
  useEffect(() => {
    if (!autoRouteActive || autoRouteSegments.length === 0) {
      if (autoRouteAnimRef.current) {
        cancelAnimationFrame(autoRouteAnimRef.current);
        autoRouteAnimRef.current = null;
      }
      return;
    }

    const tick = () => {
      const now = performance.now();

      if (autoRouteWaitUntilRef.current > 0 && now < autoRouteWaitUntilRef.current) {
        autoRouteAnimRef.current = requestAnimationFrame(tick);
        return;
      }
      if (autoRouteWaitUntilRef.current > 0 && now >= autoRouteWaitUntilRef.current) {
        autoRouteWaitUntilRef.current = 0;
        autoRouteStartTimeRef.current = now;
        autoRouteElapsedAtStartRef.current = 0;
        setAutoRouteRunning(true);
      }

      if (!autoRouteRunning) {
        return;
      }

      const realElapsed = (now - autoRouteStartTimeRef.current) / 1000;
      const baseSpd = autoRouteBaseTiming.speed || autoRouteTiming.speed || 1;
      const mult = autoRouteTiming.speed / baseSpd;
      const elapsed = autoRouteElapsedAtStartRef.current + realElapsed * mult;
      if (elapsed >= autoRouteTiming.totalTime) {
        latestElapsedRef.current = autoRouteTiming.totalTime;
        const last = autoRouteSegments[autoRouteSegments.length - 1];
        latestPositionRef.current = { x: last.end.x, y: last.end.y };
        setAutoRouteRunning(false);
        setAutoRouteElapsed(autoRouteTiming.totalTime);
        setCurrentPosition({ x: last.end.x, y: last.end.y });
        return;
      }
      latestElapsedRef.current = elapsed;
      autoRouteElapsedRef.current = elapsed;
      const interp = interpolateRoute(autoRouteSegments, autoRouteTiming.speed, autoRouteTiming.totalTime, elapsed);
      if (interp) {
        latestPositionRef.current = { x: interp.position.x, y: interp.position.y };
        if (onTick) {
          onTick(elapsed, interp.position);
        }

        const segId = `${interp.segment.markerId || interp.segment.start.x},${interp.segment.start.y}`;
        if (autoRoutePrevSegmentIdRef.current && autoRoutePrevSegmentIdRef.current !== segId) {
          const prev = autoRouteSegments.find(s =>
            `${s.markerId || s.start.x},${s.start.y}` === autoRoutePrevSegmentIdRef.current
          );
          if (prev?.markerId && prev.markerType === 'checkpoint') {
            const passedMarker = markers.find(m => m.id === prev.markerId);
            if (passedMarker?.type === 'checkpoint') {
              const cpTarget = (prev as any)._checkpointTarget as number;
              if (passedMarker.checkpointSoundOn) {
                playCheckpointSound(true);
              }
              if (cpTarget > 0 && checkpointVoiceOn) {
                speakCheckpointTime(cpTarget, passedMarker.note?.trim() || undefined);
              }
            }
          }
        }
        autoRoutePrevSegmentIdRef.current = segId;

        if (followCameraRef.current) {
          const wrapper = wrapperRef.current;
          if (wrapper) {
            const W_v = wrapper.clientWidth;
            const H_v = wrapper.clientHeight;
            const tgtZoom = (animZoomRef.current && isFinite(animZoomRef.current)) ? animZoomRef.current : 1;
            const tgtPan = {
              x: W_v * 0.5 - 800 - (interp.position.x - 800) * tgtZoom,
              y: H_v * 0.6 - 2275 - (interp.position.y - 2275) * tgtZoom
            };
            if (isFinite(tgtPan.x) && isFinite(tgtPan.y)) {
              targetPanRef.current = tgtPan;
              animPanRef.current = tgtPan;
              setPan(tgtPan);
            }
          }
        }
      }
      autoRouteAnimRef.current = requestAnimationFrame(tick);
    };
    autoRouteAnimRef.current = requestAnimationFrame(tick);

    return () => {
      if (autoRouteAnimRef.current) {
        cancelAnimationFrame(autoRouteAnimRef.current);
        autoRouteAnimRef.current = null;
      }
    };
  }, [autoRouteActive, autoRouteRunning, autoRouteSegments, autoRouteTiming]);

  // Cleanup auto-route on floor change
  useEffect(() => {
    resetAutoRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  // Listen for auto-route commands from parent
  useEffect(() => {
    if (!autoRouteCommand) return;
    if (autoRouteCommand.action === 'start') startAutoRoute();
    else if (autoRouteCommand.action === 'pause') pauseAutoRoute();
    else if (autoRouteCommand.action === 'resume') resumeAutoRoute();
    else if (autoRouteCommand.action === 'reset') resetAutoRoute();
    else if (autoRouteCommand.action === 'seek' && autoRouteCommand.seekTo !== undefined) {
      if (!isFinite(autoRouteCommand.seekTo)) return;
      if (autoRouteSegments.length === 0 || autoRouteTiming.totalTime <= 0) return;
      const t = Math.max(0, Math.min(autoRouteTiming.totalTime, autoRouteCommand.seekTo));
      setAutoRouteElapsed(t);
      autoRouteElapsedRef.current = t;
      latestElapsedRef.current = t;
      autoRouteStartTimeRef.current = performance.now();
      autoRouteElapsedAtStartRef.current = t;
      autoRoutePrevSegmentIdRef.current = '';
      try {
        const interp = interpolateRoute(autoRouteSegments, autoRouteTiming.speed, autoRouteTiming.totalTime, t);
        if (interp && interp.position && isFinite(interp.position.x) && isFinite(interp.position.y)) {
          setCurrentPosition({ x: interp.position.x, y: interp.position.y });
          latestPositionRef.current = { x: interp.position.x, y: interp.position.y };
          if (onTick) {
            onTick(t, interp.position);
          }
          if (followCamera && wrapperRef.current) {
            const W_v = wrapperRef.current.clientWidth;
            const H_v = wrapperRef.current.clientHeight;
            const tgtZoom = (animZoomRef.current && isFinite(animZoomRef.current)) ? animZoomRef.current : 1;
            const tgtPan = {
              x: W_v * 0.5 - 800 - (interp.position.x - 800) * tgtZoom,
              y: H_v * 0.6 - 2275 - (interp.position.y - 2275) * tgtZoom
            };
            if (isFinite(tgtPan.x) && isFinite(tgtPan.y)) {
              targetPanRef.current = tgtPan;
              animPanRef.current = tgtPan;
              setPan(tgtPan);
            }
          }
        }
      } catch (e) {
        console.warn('[seek] interpolation failed:', e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRouteCommand]);

  // Push auto-route status updates to parent
  useEffect(() => {
    if (!onAutoRouteStatusChange) return;
    const sendStatus = () => {
      setAutoRouteElapsed(autoRouteElapsedRef.current);
      if (latestPositionRef.current) {
        setCurrentPosition(latestPositionRef.current);
      }
      const elapsed = autoRouteElapsedRef.current;
      const mks = markersRef.current;
      const waitRemaining = autoRouteWaitUntilRef.current > 0
        ? Math.max(0, (autoRouteWaitUntilRef.current - performance.now()) / 1000)
        : 0;
      const cpList: { elapsed: number; label: string; passed: boolean }[] = [];
      for (const seg of autoRouteSegments) {
        if (seg.markerType === 'checkpoint') {
          const m = mks.find(mk => mk.id === seg.markerId);
          const cpTarget = (seg as any)._checkpointTarget as number;
          const elapsedAt = cpTarget > 0
            ? cpTarget
            : seg.cumulativeDistance / Math.max(1, autoRouteTiming.speed) + seg.cumulativeStopTime;
          cpList.push({
            elapsed: elapsedAt,
            label: m?.note || 'Checkpoint',
            passed: elapsed >= elapsedAt
          });
        }
      }

      onAutoRouteStatusChange({
        active: autoRouteActive,
        running: autoRouteRunning,
        elapsed,
        totalTime: autoRouteTiming.totalTime,
        totalDistance: autoRouteTiming.totalDistance,
        totalStopTime: autoRouteTiming.totalTime - autoRouteTiming.totalDistance / Math.max(1, autoRouteTiming.speed),
        speed: autoRouteTiming.speed,
        error: autoRouteError,
        nextMarkerLabel: nextMarkerLabel(autoRouteSegments, elapsed, autoRouteTiming.speed),
        waitRemaining,
        checkpoints: cpList
      });
    };
    sendStatus();
    const interval = setInterval(sendStatus, 100);
    return () => clearInterval(interval);
  }, [autoRouteActive, autoRouteRunning, autoRouteError, autoRouteSegments, autoRouteTiming, onAutoRouteStatusChange]);

  // Spacebar toggles pause/resume (or restarts when finished)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!autoRouteActive) return;
      e.preventDefault();
      if (autoRouteRunning) {
        pauseAutoRoute();
      } else if (
        autoRouteTiming.totalTime > 0 &&
        autoRouteElapsedRef.current >= autoRouteTiming.totalTime
      ) {
        startAutoRoute();
      } else {
        resumeAutoRoute();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRouteActive, autoRouteRunning, autoRouteTiming.totalTime]);

  // Apply speed multiplier changes mid-animation
  useEffect(() => {
    if (!autoRouteActive) return;
    if (autoRouteBaseTiming.speed === 0) return;
    const mult = autoRouteSettings?.speedMultiplier ?? 1;
    const newSpeed = autoRouteBaseTiming.speed * mult;
    setAutoRouteTiming({
      speed: newSpeed,
      totalTime: autoRouteBaseTiming.totalTime,
      totalDistance: autoRouteBaseTiming.totalDistance,
      totalStopTime: autoRouteBaseTiming.totalStopTime
    });
    autoRouteStartTimeRef.current = performance.now();
    autoRouteElapsedAtStartRef.current = autoRouteElapsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRouteSettings?.speedMultiplier, autoRouteActive]);

  return {
    autoRouteActive,
    autoRouteElapsed,
    autoRouteSegments,
    autoRouteTiming
  };
}
