import { isMovementMarker, isStopMarker, isCheckpointMarker, getStopDurationSeconds } from './DataManager';
import type { DrawingStroke, HeistMarker, MarkerType, Point } from './DataManager';

export interface RouteSegment {
  start: Point;
  end: Point;
  // Travel distance (px in map space)
  distance: number;
  // Stop duration in seconds at the end of this segment (0 for movement markers and line endpoints)
  stopDuration: number;
  // The marker at the end of this segment, if any
  markerId?: string;
  markerType?: string;
  // Cumulative travel distance from the route start
  cumulativeDistance: number;
  // Cumulative stop time from the route start
  cumulativeStopTime: number;
  // For checkpoint segments: whether the checkpoint was reached on time
  checkpointOnTime?: boolean;
  // Per-segment travel speed (px/s). Set by computeRouteTiming so the
  // route completes in exactly targetDuration. Recomputed at the last
  // checkpoint so the final arrival matches the target.
  speed?: number;
}

const DEFAULT_CONFIG: AutoRouteConfig = {
  // Strict threshold for stop markers (picking, boss, etc.) — false positives
  // here would cause the auto-route to stop at unrelated markers.
  stopMarkerThreshold: 12,
  // Threshold for movement markers (stairs). The line must pass quite
  // close to the stairs for the auto-route to take it. 20px is strict
  // enough to avoid false positives from long line segments.
  movementMarkerThreshold: 20,
  // Warp markers (warp, iwarp) are slightly more lenient than stairs
  // since warp hotspots are often offset from the line. 25px is enough
  // to catch "line contact" but won't extend to neighbouring rooms.
  warpMarkerThreshold: 25,
  // Max distance (px) to consider two line endpoints "connected"
  lineConnectThreshold: 50,
};

export interface AutoRouteConfig {
  stopMarkerThreshold: number;
  movementMarkerThreshold: number;
  warpMarkerThreshold: number;
  lineConnectThreshold: number;
}

function thresholdFor(markerType: MarkerType, cfg: AutoRouteConfig): number {
  if (isStopMarker(markerType)) return cfg.stopMarkerThreshold;
  if (markerType === 'warp' || markerType === 'iwarp') return cfg.warpMarkerThreshold;
  return cfg.movementMarkerThreshold;
}

/**
 * Builds an auto-route from the START marker by following solid (route) lines.
 * Each segment is a straight portion of the path with an optional stop at its end.
 */
export function buildAutoRoute(
  strokes: DrawingStroke[],
  markers: HeistMarker[],
  startMarker: HeistMarker,
  config: Partial<AutoRouteConfig> = {},
  hiddenMarkerIds: string[] = []
): RouteSegment[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const segments: RouteSegment[] = [];

  const solidStrokes = strokes
    .map((s, i) => ({ stroke: s, idx: i }))
    .filter(({ stroke }) => stroke.type === 'solid');

  if (solidStrokes.length === 0) return segments;

  const hiddenSet = new Set(hiddenMarkerIds);
  const relevantMarkers = markers.filter(m =>
    m.id !== startMarker.id &&
    !hiddenSet.has(m.id) &&
    (isMovementMarker(m.type) || isStopMarker(m.type) || isCheckpointMarker(m.type))
  );

  const visitedStrokeIndices = new Set<number>();
  const visitedMarkerIds = new Set<string>([startMarker.id]);
  let currentPos: Point = { x: startMarker.x, y: startMarker.y };
  let cumulativeDistance = 0;
  let cumulativeStopTime = 0;

  // Track the last warp destination to suppress the warp-priority check
  // while we're still sitting on the destination marker (prevents A→B→A ping-pong).
  let lastWarpDest: Point | null = null;

  for (let safety = 0; safety < 500; safety++) {
    // --- Warp priority check ---
    // When the current position is near a warp/stairs marker that hasn't
    // been visited yet, prioritize the warp over following the next stroke.
    // Suppress while we're still within warpMarkerThreshold of the last
    // warp destination to prevent A→B→A→B loops.
    let warpHit: { marker: HeistMarker; dist: number } | null = null;
    const distFromLastWarp = lastWarpDest
      ? Math.hypot(currentPos.x - lastWarpDest.x, currentPos.y - lastWarpDest.y)
      : Infinity;
    lastWarpDest = null;
    if (distFromLastWarp >= cfg.warpMarkerThreshold) {
      warpHit = relevantMarkers
        .filter(m => !visitedMarkerIds.has(m.id) &&
          (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId)
        .map(m => {
          const dist = Math.hypot(m.x - currentPos.x, m.y - currentPos.y);
          return { marker: m, dist };
        })
        .find(h => h.dist < cfg.warpMarkerThreshold) || null;
    }

    if (warpHit) {
      const m = warpHit.marker;
      const linked = markers.find(lm => lm.id === m.linkedWarpId);
      if (linked && !visitedMarkerIds.has(linked.id)) {
        visitedMarkerIds.add(m.id);
        visitedMarkerIds.add(linked.id);
        const warpDist = warpHit.dist;
        cumulativeDistance += warpDist;
        segments.push({
          start: { ...currentPos },
          end: { x: m.x, y: m.y },
          distance: warpDist,
          stopDuration: 0,
          markerId: m.id,
          markerType: m.type,
          cumulativeDistance,
          cumulativeStopTime
        });
        segments.push({
          start: { x: m.x, y: m.y },
          end: { x: linked.x, y: linked.y },
          distance: 0,
          stopDuration: 0,
          markerId: linked.id,
          markerType: linked.type,
          cumulativeDistance,
          cumulativeStopTime
        });
        currentPos = { x: linked.x, y: linked.y };
        lastWarpDest = { x: linked.x, y: linked.y };
        continue;
      }
    }

    // --- Find next stroke ---
    let next: StrokeRef | null = null;
    next = findNextStroke(solidStrokes, currentPos, cfg.lineConnectThreshold, visitedStrokeIndices);
    // Fallback: if no stroke endpoint is near, check if any stroke's
    // polyline passes through the current position.
    let fallbackNearestPtIdx: number | null = null;
    if (!next) {
      const hit = findStrokeThroughPosition(solidStrokes, currentPos, cfg.warpMarkerThreshold, visitedStrokeIndices);
      if (hit) {
        next = hit.ref;
        fallbackNearestPtIdx = hit.nearestPtIdx;
      }
    }
    if (!next) break;

    const { stroke, idx } = next;

    const refPos = currentPos;
    const startPt = stroke.points[0];
    const endPt = stroke.points[stroke.points.length - 1];
    const distToStart = Math.hypot(startPt.x - refPos.x, startPt.y - refPos.y);
    const distToEnd = Math.hypot(endPt.x - refPos.x, endPt.y - refPos.y);
    const reversed = distToStart > distToEnd;
    const travelPoints = reversed
      ? [...stroke.points].reverse()
      : stroke.points;

    let i = 1;
    if (fallbackNearestPtIdx !== null) {
      const tpIdx = reversed
        ? stroke.points.length - 1 - fallbackNearestPtIdx
        : fallbackNearestPtIdx;
      i = Math.max(1, tpIdx);
    }

    while (i < travelPoints.length) {
      const a = currentPos;
      const b = travelPoints[i];

      const hits = relevantMarkers
        .filter(m => !visitedMarkerIds.has(m.id))
        .map(m => {
          const perpDist = distanceToSegment(m, a, b);
          const distToCurrent = Math.hypot(m.x - a.x, m.y - a.y);
          const distToNext = Math.hypot(m.x - b.x, m.y - b.y);
          const dist = Math.min(perpDist, distToCurrent, distToNext);
          const t = projectionParameter(m, a, b);
          const th = thresholdFor(m.type, cfg);
          return { marker: m, dist, perpDist, t, threshold: th };
        })
        .filter(h => h.dist < h.threshold && h.t >= -0.1 && h.t <= 1.1)
        .sort((x, y) => x.perpDist - y.perpDist || x.t - y.t);

      if (hits.length > 0) {
        const hit = hits[0];
        const m = hit.marker;
        visitedMarkerIds.add(m.id);
        const clampedT = Math.max(0, Math.min(1, hit.t));
        const segDist = Math.hypot(b.x - a.x, b.y - a.y) * clampedT;
        cumulativeDistance += segDist;
        const stopDur = isStopMarker(m.type) ? getStopDurationSeconds(m) : 0;
        cumulativeStopTime += stopDur;

        let checkpointOnTime: boolean | undefined;
        const seg: RouteSegment = {
          start: { ...a },
          end: { x: m.x, y: m.y },
          distance: segDist,
          stopDuration: stopDur,
          markerId: m.id,
          markerType: m.type,
          cumulativeDistance,
          cumulativeStopTime,
          checkpointOnTime
        };
        if (isCheckpointMarker(m.type)) {
          (seg as any)._checkpointTarget = m.checkpointTargetTime ?? 0;
        }
        segments.push(seg);
        currentPos = { x: m.x, y: m.y };

        // If this is a movement marker with a linked warp, instantly warp
        // to the linked marker and break out of the inner stroke traversal.
        if (isMovementMarker(m.type) && m.linkedWarpId) {
          const linked = markers.find(lm => lm.id === m.linkedWarpId);
          if (linked && !visitedMarkerIds.has(linked.id)) {
            visitedMarkerIds.add(linked.id);
            segments.push({
              start: { ...currentPos },
              end: { x: linked.x, y: linked.y },
              distance: 0,
              stopDuration: 0,
              markerId: linked.id,
              markerType: linked.type,
              cumulativeDistance,
              cumulativeStopTime
            });
            lastWarpDest = { x: linked.x, y: linked.y };
            currentPos = { x: linked.x, y: linked.y };
            break;
          }
        }
        // If currentPos is now at or very close to b, advance to next segment
        // to prevent re-detecting the same marker in an infinite loop.
        if (Math.hypot(currentPos.x - b.x, currentPos.y - b.y) < 1) {
          i++;
        }
        continue;
      } else {
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        cumulativeDistance += segDist;
        segments.push({
          start: { ...a },
          end: { x: b.x, y: b.y },
          distance: segDist,
          stopDuration: 0,
          cumulativeDistance,
          cumulativeStopTime
        });
        currentPos = { x: b.x, y: b.y };
        i++;
      }
    }

    visitedStrokeIndices.add(idx);
  }

  return segments;
}

interface StrokeRef {
  stroke: DrawingStroke;
  idx: number;
}

function findNextStroke(
  strokes: StrokeRef[],
  pos: Point,
  threshold: number,
  visited: Set<number>
): StrokeRef | null {
  let best: StrokeRef | null = null;
  let bestDist = threshold;
  for (const ref of strokes) {
    if (visited.has(ref.idx)) continue;
    if (ref.stroke.points.length < 2) continue;
    const startPt = ref.stroke.points[0];
    const endPt = ref.stroke.points[ref.stroke.points.length - 1];
    const dStart = Math.hypot(startPt.x - pos.x, startPt.y - pos.y);
    const dEnd = Math.hypot(endPt.x - pos.x, endPt.y - pos.y);
    if (dStart < bestDist) { bestDist = dStart; best = ref; }
    if (dEnd < bestDist) { bestDist = dEnd; best = ref; }
  }
  return best;
}

/**
 * Fallback after warps: find a stroke whose polyline passes near `pos`,
 * even if no endpoint is close. Returns the stroke ref and the index of
 * the nearest polyline point (so the caller can start traversal from there).
 */
function findStrokeThroughPosition(
  strokes: StrokeRef[],
  pos: Point,
  threshold: number,
  visited: Set<number>
): { ref: StrokeRef; nearestPtIdx: number } | null {
  let best: { ref: StrokeRef; nearestPtIdx: number; dist: number } | null = null;
  for (const ref of strokes) {
    if (visited.has(ref.idx)) continue;
    if (ref.stroke.points.length < 2) continue;
    for (let k = 0; k < ref.stroke.points.length; k++) {
      const pt = ref.stroke.points[k];
      const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      if (d < threshold && (!best || d < best.dist)) {
        best = { ref, nearestPtIdx: k, dist: d };
      }
    }
  }
  return best ? { ref: best.ref, nearestPtIdx: best.nearestPtIdx } : null;
}

// Simple Web Audio beep utility for checkpoint sounds. Lazily creates the
// AudioContext on first use (browsers require a user gesture before audio
// can play, so we don't construct it at module load).
let _audioCtx: AudioContext | null = null;
export function prewarmAudio() {
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
  } catch { /* no-op */ }
}
function playBeep(freq: number = 880, durationMs: number = 120) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) {
      _audioCtx = new Ctx();
    }
    const ctx = _audioCtx;
    // Browsers require a user gesture before audio can play. If the
    // context is still suspended (e.g. the user gesture was on a
    // different element), try to resume it again.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* no-op */ });
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    const t = ctx.currentTime;
    // Louder volume: peak gain raised from 0.18 to 0.5
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(t + durationMs / 1000);
  } catch { /* no-op */ }
}

/** Play the checkpoint "on-time" / "late" sound. */
export function playCheckpointSound(onTime: boolean) {
  playBeep(onTime ? 1320 : 220, 140);
}

/** Speak the checkpoint arrival time (e.g. "30秒地点です"). */
export function speakCheckpointTime(seconds: number, label?: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = label
      ? `${seconds}秒地点、${label}です`
      : `${seconds}秒地点です`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ja-JP';
    utter.rate = 1.3;
    utter.pitch = 1.0;
    utter.volume = 0.8;
    window.speechSynthesis.speak(utter);
  } catch { /* no-op */ }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

function projectionParameter(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
}

/**
 * Computes the total travel time and total distance of the route.
 *
 * The total time is ALWAYS the user-provided targetDuration. The speed
 * is calculated so the route completes in exactly that time:
 *   speed = totalDistance / (targetDuration - totalStopTime)
 *
 * Checkpoints are reference-only — they store a target time for display
 * and sound triggers, but they DO NOT affect the speed or the total time.
 * The user's total-time setting is sacrosanct.
 *
 * If targetDuration is not provided or is invalid, falls back to
 * 200 px/s as a safety default (speed source marked as 'default').
 *
 * The total time displayed is always the base total — it does NOT change
 * with the speed multiplier. The multiplier only scales the animation
 * playback rate (elapsed advances at mult × wall-clock).
 */
export function computeRouteTiming(segments: RouteSegment[], targetDuration?: number): {
  totalDistance: number;
  totalStopTime: number;
  totalTravelTime: number;
  totalTime: number;
  speed: number; // px / sec
  speedSource: 'targetDuration' | 'default';
  ignoredCheckpoint?: { reason: string; target: number; stopTime: number };
} {
  const totalDistance = segments.length > 0 ? segments[segments.length - 1].cumulativeDistance : 0;
  const totalStopTime = segments.length > 0 ? segments[segments.length - 1].cumulativeStopTime : 0;

  let totalTravelTime: number;
  let speed: number;
  let speedSource: 'targetDuration' | 'default';

  if (targetDuration !== undefined && targetDuration > totalStopTime && totalDistance > 0) {
    // User-provided total time is authoritative. Speed is derived from it.
    totalTravelTime = Math.max(0, targetDuration - totalStopTime);
    speed = totalDistance / totalTravelTime;
    speedSource = 'targetDuration';
  } else if (totalDistance > 0) {
    // Safety fallback when no targetDuration is set.
    speed = 200;
    totalTravelTime = totalDistance / speed;
    speedSource = 'default';
  } else {
    speed = 0;
    totalTravelTime = 0;
    speedSource = 'default';
  }

  // Per-segment speed: calculate from the start using ALL checkpoints
  // AND the route end. Each segment gets a speed so that:
  //   - Each checkpoint is reached at its target time
  //   - The route end is reached at targetDuration
  // The last "waypoint" is either the next checkpoint or the route end.
  type Waypoint = { segIdx: number; targetTime: number; cumDistAtWaypoint: number; cumStopsAtWaypoint: number };
  const waypoints: Waypoint[] = [];
  // First waypoint: start of route (time 0, distance 0, stops 0)
  waypoints.push({ segIdx: -1, targetTime: 0, cumDistAtWaypoint: 0, cumStopsAtWaypoint: 0 });
  // Checkpoint waypoints
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.markerType === 'checkpoint') {
      const cpTarget = (seg as any)._checkpointTarget as number;
      if (cpTarget > 0) {
        // The checkpoint is reached when cumulative travel time +
        // cumulative stop time up to (but not including) the checkpoint stop
        // equals cpTarget. We treat the target as "time at checkpoint
        // position" (before any stop AT the checkpoint itself, since
        // checkpoints have no stop duration).
        waypoints.push({
          segIdx: i,
          targetTime: cpTarget,
          cumDistAtWaypoint: seg.cumulativeDistance,
          cumStopsAtWaypoint: seg.cumulativeStopTime
        });
      }
    }
  }
  // Final waypoint: route end at targetDuration
  if (targetDuration !== undefined && targetDuration > 0) {
    waypoints.push({
      segIdx: segments.length,
      targetTime: targetDuration,
      cumDistAtWaypoint: totalDistance,
      cumStopsAtWaypoint: totalStopTime
    });
  }

  // For each pair of consecutive waypoints, calculate the speed for the
  // segments between them.
  for (let w = 0; w < waypoints.length - 1; w++) {
    const a = waypoints[w];
    const b = waypoints[w + 1];
    const distDelta = b.cumDistAtWaypoint - a.cumDistAtWaypoint;
    const stopsDelta = b.cumStopsAtWaypoint - a.cumStopsAtWaypoint;
    const timeDelta = b.targetTime - a.targetTime;
    if (distDelta > 0 && timeDelta > stopsDelta) {
      const segSpeed = distDelta / Math.max(0.001, timeDelta - stopsDelta);
      // Apply to segments between a.segIdx+1 and b.segIdx (inclusive)
      const startIdx = Math.max(0, a.segIdx + 1);
      const endIdx = b.segIdx;
      for (let i = startIdx; i <= endIdx && i < segments.length; i++) {
        segments[i].speed = segSpeed;
      }
    }
  }
  // Fill any segments without a per-segment speed with the route-wide default
  for (const seg of segments) {
    if (seg.speed === undefined) seg.speed = speed;
  }

  // Recalculate totalTravelTime using the actual per-segment speeds
  // (which may differ from the route-wide speed when checkpoints are set).
  totalTravelTime = 0;
  for (const seg of segments) {
    const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
    if (segSpeed > 0 && seg.distance > 0) {
      totalTravelTime += seg.distance / segSpeed;
    }
  }

  return {
    totalDistance,
    totalStopTime,
    totalTravelTime,
    totalTime: totalTravelTime + totalStopTime,
    speed,
    speedSource
  };
}

/**
 * Computes the current position and current segment at the given elapsed time.
 * Returns null if elapsed time exceeds total time.
 */
export function interpolateRoute(
  segments: RouteSegment[],
  speed: number,
  totalTime: number,
  elapsed: number
): { position: Point; segment: RouteSegment; segmentProgress: number } | null {
  if (segments.length === 0 || totalTime <= 0) return null;
  if (elapsed >= totalTime) {
    const last = segments[segments.length - 1];
    return { position: { ...last.end }, segment: last, segmentProgress: 1 };
  }

  let remaining = elapsed;
  for (const seg of segments) {
    // Warp segment: instant teleportation, 0 travel time
    if (seg.distance === 0 && seg.stopDuration === 0) {
      continue;
    }
    // Use the segment's per-segment speed if set, otherwise the global speed
    const segSpeed = seg.speed !== undefined ? seg.speed : speed;
    const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
    if (remaining <= travelTime) {
      // Inside this segment's travel phase
      const t = seg.distance > 0 ? remaining / travelTime : 1;
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      return { position: { x, y }, segment: seg, segmentProgress: t };
    }
    remaining -= travelTime;
    if (remaining <= seg.stopDuration) {
      // Inside this segment's stop phase
      return { position: { ...seg.end }, segment: seg, segmentProgress: 1 };
    }
    remaining -= seg.stopDuration;
  }

  // Should not reach here
  const last = segments[segments.length - 1];
  return { position: { ...last.end }, segment: last, segmentProgress: 1 };
}
