import { isMovementMarker, isStopMarker, isCheckpointMarker, getStopDurationSeconds, getSkillCdSeconds } from './DataManager';
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
  // Fraction along the original segment a→b where the marker was detected.
  // Used by passedMarkerIds timing to compensate for the midpoint split.
  _markerFraction?: number;
}

const DEFAULT_CONFIG: AutoRouteConfig = {
  // Strict threshold for stop markers (picking, boss, etc.) — false positives
  // here would cause the auto-route to stop at unrelated markers.
  stopMarkerThreshold: 12,
  // Extra "capture" radius added on top of stopMarkerThreshold when the
  // user's polyline just barely misses the marker (e.g. SMOOTH-mode
  // polyline curves around the key, or the line ends visually on top of
  // the marker but a few px off in the recorded points). Without this,
  // a line that completely overlaps a key on screen can still slip
  // through hit detection. The default 6px matches the SMOOTH-mode
  // jitter threshold so any visible overlap is captured.
  stopMarkerCaptureRadius: 6,
  // Threshold for movement markers (stairs). The line must pass quite
  // close to the stairs for the auto-route to take it. 20px is strict
  // enough to avoid false positives from long line segments.
  movementMarkerThreshold: 20,
  // Warp markers (warp, iwarp) are slightly more lenient than stairs
  // since warp hotspots are often offset from the line. 25px is enough
  // to catch "line contact" but won't extend to neighbouring rooms.
  warpMarkerThreshold: 25,
  // スキルCDマーカー専用の閾値 (他より狭い: ルートがマーカー位置 ±Npx まで
  // 接近したときのみ発動する。線分への「かすり判定」はしない)。
  skillCdThreshold: 10,
  // Max distance (px) to consider two line endpoints "connected"
  lineConnectThreshold: 50,
  // Default stop (seconds) inserted at the START marker when the route
  // begins. Lets the player react before movement starts.
  startStopSeconds: 3,
};

export interface AutoRouteConfig {
  stopMarkerThreshold: number;
  stopMarkerCaptureRadius: number;
  movementMarkerThreshold: number;
  warpMarkerThreshold: number;
  skillCdThreshold: number;
  lineConnectThreshold: number;
  startStopSeconds: number;
}

function thresholdFor(markerType: MarkerType, cfg: AutoRouteConfig): number {
  if (isStopMarker(markerType)) {
    return cfg.stopMarkerThreshold + (cfg.stopMarkerCaptureRadius ?? 0);
  }
  if (markerType === 'warp' || markerType === 'iwarp') return cfg.warpMarkerThreshold;
  if (markerType === 'skill_cd') return cfg.skillCdThreshold;
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
  hiddenMarkerIds: string[] = [],
  pickyMarkerIds?: { [markerId: string]: boolean }
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
    (isMovementMarker(m.type) || isStopMarker(m.type) || isCheckpointMarker(m.type) || m.type === 'skill_cd')
  );

  const visitedStrokeIndices = new Set<number>();
  const visitedMarkerIds = new Set<string>([startMarker.id]);
  // スキルCDマーカーの消費履歴 (id -> 通過時の cumulativeStopTime)。
  // 同一マーカーが再通過したら CD の回転を再判定する。
  const skillCdConsumedAt = new Map<string, number>();
  // Warp markers currently "paused" (temporarily removed from consideration).
  // A marker is paused as soon as it is used as warp source OR destination,
  // and is un-paused once `currentPos` is farther than `lineConnectThreshold`
  // from BOTH endpoints of the warp. This prevents A→B→A ping-pong while
  // still allowing the same warp to be reused along a real route.
  type PausedWarp = { sourceId: string; linkedId: string; sourcePos: Point; linkedPos: Point };
  const pausedWarps: PausedWarp[] = [];
  const isPaused = (id: string): boolean => pausedWarps.some(p => p.sourceId === id || p.linkedId === id);
  const cleanupPaused = () => {
    const limit = cfg.lineConnectThreshold;
    for (let k = pausedWarps.length - 1; k >= 0; k--) {
      const p = pausedWarps[k];
      const distSrc = Math.hypot(currentPos.x - p.sourcePos.x, currentPos.y - p.sourcePos.y);
      const distLinked = Math.hypot(currentPos.x - p.linkedPos.x, currentPos.y - p.linkedPos.y);
      if (distSrc >= limit && distLinked >= limit) {
        pausedWarps.splice(k, 1);
      }
    }
  };
  let currentPos: Point = { x: startMarker.x, y: startMarker.y };
  let cumulativeDistance = 0;
  let cumulativeStopTime = 0;

  const tryWarp = (warpSource: HeistMarker): boolean => {
    // Resolve the destination. Try the explicit linkedWarpId first, then
    // fall back to looking up the partner that points BACK at warpSource
    // (some data files only set linkedWarpId on one side of the pair).
    let linked = warpSource.linkedWarpId
      ? markers.find(lm => lm.id === warpSource.linkedWarpId) || null
      : null;
    if (!linked) {
      linked = markers.find(lm =>
        lm.linkedWarpId === warpSource.id &&
        (lm.type === 'warp' || lm.type === 'iwarp' || lm.type === 'stairs')
      ) || null;
    }
    if (!linked) return false;
    if (isPaused(warpSource.id)) return false; // source is currently paused

    const warpDist = Math.hypot(warpSource.x - currentPos.x, warpSource.y - currentPos.y);
    cumulativeDistance += warpDist;
    segments.push({
      start: { ...currentPos },
      end: { x: warpSource.x, y: warpSource.y },
      distance: warpDist,
      stopDuration: 0,
      markerId: warpSource.id,
      markerType: warpSource.type,
      cumulativeDistance,
      cumulativeStopTime
    });
    segments.push({
      start: { x: warpSource.x, y: warpSource.y },
      end: { x: linked.x, y: linked.y },
      distance: 0,
      stopDuration: 0,
      markerId: linked.id,
      markerType: linked.type,
      cumulativeDistance,
      cumulativeStopTime
    });
    currentPos = { x: linked.x, y: linked.y };
    // Pause both endpoints until the route moves far enough away from BOTH.
    pausedWarps.push({
      sourceId: warpSource.id,
      linkedId: linked.id,
      sourcePos: { x: warpSource.x, y: warpSource.y },
      linkedPos: { x: linked.x, y: linked.y }
    });
    return true;
  };

  for (let safety = 0; safety < 500; safety++) {
    cleanupPaused();

    // --- Outer-loop warp priority check ---
    // Warp markers near currentPos take priority over following the next stroke.
    const warpSource = relevantMarkers
      .filter(m => (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId)
      .map(m => ({
        marker: m,
        dist: Math.hypot(m.x - currentPos.x, m.y - currentPos.y)
      }))
      .filter(h => h.dist < cfg.warpMarkerThreshold && !isPaused(h.marker.id))
      .sort((x, y) => x.dist - y.dist)[0] || null;

    if (warpSource && tryWarp(warpSource.marker)) {
      continue;
    }

    // --- Find next stroke ---
    let next: StrokeRef | null = findNextStroke(solidStrokes, currentPos, cfg.lineConnectThreshold, visitedStrokeIndices);
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
    const startPt = stroke.points[0];
    const endPt = stroke.points[stroke.points.length - 1];
    const distToStart = Math.hypot(startPt.x - currentPos.x, startPt.y - currentPos.y);
    const distToEnd = Math.hypot(endPt.x - currentPos.x, endPt.y - currentPos.y);
    const reversed = distToStart > distToEnd;
    const travelPoints = reversed
      ? [...stroke.points].reverse()
      : stroke.points;

    let i = fallbackNearestPtIdx !== null
      ? Math.max(1, reversed ? stroke.points.length - 1 - fallbackNearestPtIdx : fallbackNearestPtIdx)
      : 1;

    // Walk along the stroke. When a marker is hit:
    //  - non-warp marker: add a segment to it, advance past it
    //  - warp marker: try to warp. If warp succeeds, break out so the
    //    outer loop continues from the new position.
    // We always advance `i` after a marker hit (no `continue` with
    // currentPos on a marker) — that's what previously caused infinite
    // loops when the same marker was re-detected at distance 0.
    // Safety counter guards against any remaining edge case.
    let innerSafety = 0;
    const innerMax = travelPoints.length * 2 + 10;
    while (i < travelPoints.length) {
      if (++innerSafety > innerMax) break; // hard cap — never spin forever
      const a = currentPos;
      const b = travelPoints[i];

      const hits = relevantMarkers
        // Pause currently-paused warp endpoints (their id is in some paused
        // entry) so the same warp doesn't ping-pong. Other markers follow
        // the normal visitedMarkerIds check.
        .filter(m => {
          if (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') {
            if (isPaused(m.id)) return false;
            return true;
          }
          return !visitedMarkerIds.has(m.id);
        })
        .map(m => {
          const perpDist = distanceToSegment(m, a, b);
          const distToCurrent = Math.hypot(m.x - a.x, m.y - a.y);
          // For stop markers (picking/boss/etc), we accept proximity to
          // either the segment start (= current position) or the line
          // itself. For SKILL_CD markers specifically, we only accept
          // proximity to the CURRENT position — otherwise a long line
          // can trigger the CD long before the route physically reaches
          // the marker (the line is "in range" at a far endpoint).
          const useCurrentOnly = m.type === 'skill_cd';
          const dist = useCurrentOnly
            ? distToCurrent
            : Math.min(perpDist, distToCurrent);
          const t = projectionParameter(m, a, b);
          const th = thresholdFor(m.type, cfg);
          return { marker: m, dist, perpDist, distToCurrent, t, threshold: th };
        })
        .filter(h => {
          if (h.dist >= h.threshold) return false;
          return true;
        })
        .sort((x, y) => x.perpDist - y.perpDist || (x.t ?? 0) - (y.t ?? 0));

      if (hits.length === 0) {
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
        continue;
      }

      const hit = hits[0];
      const m = hit.marker;
      // Warp/iwarp/stairs markers stay re-detectable so the same warp
      // can be taken multiple times (e.g. A→B then B→A on a return).
      if (m.type !== 'warp' && m.type !== 'iwarp' && m.type !== 'stairs') {
        visitedMarkerIds.add(m.id);
      }
      const clampedT = Math.max(0, Math.min(1, hit.t));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const midDist = Math.hypot(midX - a.x, midY - a.y);
      cumulativeDistance += midDist;

      // スキルCDマーカー: 「スキル使用チェック」
      // - 1回目の通過: CDタイマーを開始 (=consumedAtに記録)。stopDuration=0 (チェックのみ、通過する)
      // - 2回目以降の通過: CDが回り終わっていれば CD秒数ぶん停止 (=次回CD開始)
      //                    CDが回っていれば通過のみ
      // - CD設定なし (cd=0): 純粋にマーカー通過 (常に0秒)
      let stopDur = 0;
      if (m.type === 'skill_cd') {
        const cd = getSkillCdSeconds(m);
        const consumedAt = skillCdConsumedAt.get(m.id);
        if (consumedAt === undefined) {
          // 1回目: 通過 (CDタイマー開始)
          stopDur = 0;
          skillCdConsumedAt.set(m.id, cumulativeStopTime);
        } else if (cd <= 0) {
          // CD設定なし: 通過のみ
          stopDur = 0;
        } else {
          // 2回目以降: CDが回っているかチェック
          const nowAtMarker = cumulativeStopTime;
          const cdReadyAt = consumedAt + cd;
          if (nowAtMarker < cdReadyAt) {
            // CD回ってる → 通過のみ
            stopDur = 0;
          } else {
            // CD回り終わってる → 次のCD開始 (停止)
            stopDur = cd;
            skillCdConsumedAt.set(m.id, nowAtMarker + cd);
          }
        }
      } else if (isStopMarker(m.type)) {
        stopDur = getStopDurationSeconds(m, pickyMarkerIds);
      }
      cumulativeStopTime += stopDur;

      let checkpointOnTime: boolean | undefined;
      const seg: RouteSegment = {
        start: { ...a },
        end: { x: midX, y: midY },
        distance: midDist,
        stopDuration: stopDur,
        markerId: m.id,
        markerType: m.type,
        cumulativeDistance,
        cumulativeStopTime,
        checkpointOnTime
      };
      (seg as any)._markerFraction = clampedT;
      if (isCheckpointMarker(m.type)) {
        (seg as any)._checkpointTarget = m.checkpointTargetTime ?? 0;
        (seg as any)._checkpointSpeed = m.checkpointSpeed;
        // _checkpointConflicted は computeRouteTiming で後付けする
      }
      if (m.type === 'skill_cd') {
        (seg as any)._skillCdConsumed = true;
      }
      segments.push(seg);
      currentPos = { x: midX, y: midY };

      // Warp? If it succeeds, break out. If it fails (at last warp dest),
      // just advance past the marker.
      if (isMovementMarker(m.type) && m.linkedWarpId) {
        if (tryWarp(m)) {
          break;
        }
      }

      // Continue from midpoint to the current polyline point (no skip)
      // so the route stays on the original path without back-tracking.
    }

    visitedStrokeIndices.add(idx);
  }

  // スタートマーカーでの停止 (cfg.startStopSeconds, デフォルト 3秒) を
  // 先頭に挿入する。位置は startMarker 上、距離 0。
  // 既存セグメントの cumulativeStopTime にも加算する。
  const startStopSeconds = Math.max(0, cfg.startStopSeconds ?? 0);
  if (startStopSeconds > 0) {
    cumulativeStopTime += startStopSeconds;
    for (const seg of segments) {
      seg.cumulativeStopTime += startStopSeconds;
    }
    segments.unshift({
      start: { x: startMarker.x, y: startMarker.y },
      end: { x: startMarker.x, y: startMarker.y },
      distance: 0,
      stopDuration: startStopSeconds,
      markerId: startMarker.id,
      markerType: startMarker.type,
      cumulativeDistance,
      cumulativeStopTime
    });
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
// prewarmAudio() は最初のサウンド再生時に AudioContext を作るだけにし、
// ユーザージェスチャと無関係な経路 (ページ表示時) では呼ばない。
// resume() を事前に発動するとページがバックグラウンドでも一瞬だけ
// サウンドプレイヤーが起動する危険があるため、再生と一体化して行う。
export function prewarmAudio() {
  // no-op (旧実装は start 時に呼ばれていたが、ユーザージェスチャと
  // 直接紐づかないため副作用が大きい。AudioContext の resume は
  // 最初の playCheckpointSound() 内で必要になったタイミングで行う)
}
function playBeep(freq: number = 880, durationMs: number = 120) {
  try {
    // バックグラウンドタブでは音声を出さない (= OS のサウンドプレイヤーを起動しない)
    if (typeof document !== 'undefined' && document.hidden) return;
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

// 最後に speak したテキスト。同一テキストの連発を抑止する (Chrome の
// speechSynthesis cancel() 連発バグ対策 + 1ページ表示で1回しか読まれない問題対策)。
let _lastSpokenText: string | null = null;
let _lastSpokenAt: number = 0;

/** Speak the checkpoint arrival time (e.g. "30秒地点です"). */
export function speakCheckpointTime(seconds: number, label?: string) {
  try {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!('speechSynthesis' in window)) return;
    const text = label
      ? `${seconds}秒地点、${label}です`
      : `${seconds}秒地点です`;
    const now = performance.now();
    // 同一テキストが短時間 (3秒以内) に再度要求された場合はスキップ。
    // 同一チェックポイントを複数回通過判定してしまうケースや、
    // 連続 cancel()+speak() で Chrome がドロップする問題を抑える。
    if (text === _lastSpokenText && now - _lastSpokenAt < 3000) return;
    _lastSpokenText = text;
    _lastSpokenAt = now;
    // cancel() は前回 utterance が「まだ再生中」または「ペンディング」の場合のみ実行。
    // 毎回 cancel() すると Chrome の実装で次の speak() が無視されることがあるため、
    // 一旦キューをリセットして新しい utterance を確実に積む形にする。
    try { window.speechSynthesis.cancel(); } catch { /* no-op */ }
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
 * Checkpoints do affect the speed: each checkpoint is reached at its
 * target time (or earlier/later based on interpolation). The route end
 * is still reached at targetDuration. The user's total-time setting is
 * sacrosanct, but checkpoints adjust per-segment speeds so the player
 * arrives at each checkpoint on time.
 *
 * If targetDuration is not provided or is invalid, the route-wide speed
 * falls back to a safety default (speed source marked as 'default').
 *
 * The total time displayed is always the base total — it does NOT change
 * with the speed multiplier. The multiplier only scales the animation
 * playback rate (elapsed advances at mult × wall-clock).
 */
export function computeRouteTiming(
  segments: RouteSegment[],
  targetDuration?: number,
  options?: { speedMode?: 'time' | 'speed'; manualSpeed?: number }
): {
  totalDistance: number;
  totalStopTime: number;
  totalTravelTime: number;
  totalTime: number;
  speed: number; // px / sec
  speedSource: 'targetDuration' | 'manual' | 'default';
  ignoredCheckpoint?: { reason: string; target: number; stopTime: number };
} {
  const totalDistance = segments.length > 0 ? segments[segments.length - 1].cumulativeDistance : 0;
  const totalStopTime = segments.length > 0 ? segments[segments.length - 1].cumulativeStopTime : 0;
  const speedMode = options?.speedMode ?? 'time';
  const manualSpeed = options?.manualSpeed ?? 0;

  let totalTravelTime: number;
  let speed: number;
  let speedSource: 'targetDuration' | 'manual' | 'default';

  if (speedMode === 'speed' && manualSpeed > 0 && totalDistance > 0) {
    // 速度ベース: ユーザー指定の px/s を使用。チェックポイントは速度計算から
    // 除外 (= totalDuration は使わず totalTravelTime = totalDistance / manualSpeed)
    speed = manualSpeed;
    totalTravelTime = totalDistance / speed;
    speedSource = 'manual';
  } else if (targetDuration !== undefined && targetDuration > totalStopTime && totalDistance > 0) {
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

  // Per-segment speed: calculate from the start using VALID checkpoints
  // AND the route end. Each segment gets a speed so that:
  //   - Each valid checkpoint is reached at its target time
  //   - The route end is reached at targetDuration
  // The last "waypoint" is either the next valid checkpoint or the route end.
  //
  // 「順序矛盾」(= 前のチェックポイントより小さい目標時間) のチェックポイントは
  // 速度計算から除外する。例: 40→30→60 では 30 が矛盾として除外され、
  // 40 と 60 だけで速度が決まる (30 は到達時刻が守られないが、それは「正常」)。
  type Waypoint = { segIdx: number; targetTime: number; cumDistAtWaypoint: number; cumStopsAtWaypoint: number };
  const waypoints: Waypoint[] = [];
  // First waypoint: start of route (time 0, distance 0, stops 0)
  waypoints.push({ segIdx: -1, targetTime: 0, cumDistAtWaypoint: 0, cumStopsAtWaypoint: 0 });
  // Checkpoint waypoints — 矛盾するものは除外 + フラグを保存
  // 速度ベースモードのとき: 速度計算には影響させないが、CP通過時の経過時間
  // (= cumDist/speed + cumStops) を _checkpointTarget に書き戻すことで
  // 読み上げ/サウンド/タイムライン表示は時間ベースと同じロジックで動く。
  let prevValidCpTarget = -Infinity;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.markerType === 'checkpoint') {
      const cpTarget = (seg as any)._checkpointTarget as number;
      if (speedMode === 'speed') {
        // 速度ベース: CP の「目標時間」を通過予定時刻 (= cumDist/speed + cumStops) で上書き
        // することで、エンジン側 (useAutoRouteEngine) の「経過時間ベース」読み上げが
        // そのまま機能する。_checkpointConflicted は false (順序判定の対象外)。
        if (speed > 0) {
          const passedAt = seg.cumulativeDistance / speed + seg.cumulativeStopTime;
          (seg as any)._checkpointTarget = Math.round(passedAt);
        } else {
          (seg as any)._checkpointTarget = 0;
        }
        (seg as any)._checkpointConflicted = false;
        continue;
      }
      if (cpTarget > 0) {
        const isConflicted = cpTarget < prevValidCpTarget;
        // セグメントに「矛盾かどうか」を保存 (エンジン側で読み上げ制御に使う)
        (seg as any)._checkpointConflicted = isConflicted;
        if (!isConflicted) {
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
          prevValidCpTarget = cpTarget;
        }
      } else {
        (seg as any)._checkpointConflicted = false;
      }
    }
  }
  // Final waypoint: route end at targetDuration (時間ベース時のみ)
  if (speedMode !== 'speed' && targetDuration !== undefined && targetDuration > 0) {
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

  // 速度ベースモード: チェックポイント単位の速度上書き
  if (speedMode === 'speed') {
    let lastCpSpeedIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.markerType === 'checkpoint') {
        const cpSpeed = (seg as any)._checkpointSpeed as number | undefined;
        if (cpSpeed !== undefined && cpSpeed > 0) {
          const startIdx = Math.max(0, lastCpSpeedIdx + 1);
          for (let j = startIdx; j <= i; j++) {
            const s = segments[j];
            if (s.distance > 0) {
              s.speed = cpSpeed;
            }
          }
          lastCpSpeedIdx = i;
        }
      }
    }
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
    if (seg.distance === 0 && seg.stopDuration === 0) {
      continue;
    }
    const segSpeed = seg.speed !== undefined ? seg.speed : speed;
    const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
    if (remaining <= travelTime) {
      const t = seg.distance > 0 ? remaining / travelTime : 1;
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      return { position: { x, y }, segment: seg, segmentProgress: t };
    }
    remaining -= travelTime;
    if (remaining <= seg.stopDuration) {
      return { position: { ...seg.end }, segment: seg, segmentProgress: 1 };
    }
    remaining -= seg.stopDuration;
  }

  const last = segments[segments.length - 1];
  return { position: { ...last.end }, segment: last, segmentProgress: 1 };
}
