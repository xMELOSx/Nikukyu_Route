import React, { useRef, useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  type FloorType,
  type DrawingStroke,
  type HeistMarker,
  type MarkerType,
  type Point,
  type SkillCdPreset,
  type SpawnRecord,
  type SpawnItemType,
  MARKER_META,
  SPAWN_ITEM_META,
  TEXTCOLOR_DETAIL_META,
  PRESET_MAPS_META,
  getSkillCdIcon,
  getSkillCdColor
} from '../utils/DataManager';
import { ZoomIn, ZoomOut, Maximize2, Trash2 } from 'lucide-react';
import { useAutoRouteEngine } from '../hooks/useAutoRouteEngine';
import TweetEmbed from './TweetEmbed';
import MediaManager from './MediaManager';
import MediaLightbox from './MediaLightbox';
import { t, tNote, useLangState } from '../i18n';
import { getUserDictFor, subscribe as subscribeUserDict } from '../i18n/userDict';

interface MapCanvasProps {
  floor: FloorType;
  strokes: DrawingStroke[];
  markers: HeistMarker[];
  customBg: string | null;
  toolMode: 'select' | 'draw' | 'erase' | 'move' | 'measure' | 'add-marker' | 'toggle-vis' | 'edit-stroke' | 'draw-wall' | 'erase-wall' | 'add-spawn';
  walls?: [Point, Point][];
  onWallsChange?: (walls: [Point, Point][]) => void;
  hideStrokesDuringWalls?: boolean;
  hideMarkersDuringWalls?: boolean;
  activeMarkerType: MarkerType | null;
  eraseTarget?: 'all' | 'marker' | 'route' | 'branch';
  eraseDefaultBehavior?: 'normal' | 'split';
  eraseSize?: number;
  /** 線分編集ツールで選択中のストロークインデックス集合 */
  editStrokeIdxs?: Set<number>;
  /** 線分編集ツールの選択集合を更新する */
  onEditStrokeIdxsChange?: (next: Set<number>) => void;
  /** 距離計測ツールの選択集合 (App 側でツールバー表示するため) */
  measureSelectedStrokeIdxs?: Set<number>;
  /** 距離計測ツールの選択集合を更新する */
  onMeasureSelectedStrokeIdxsChange?: (next: Set<number>) => void;
  /** ツール使用中 (draw / edit-stroke / measure) にマーカーへのヒットを無効化
   *  (= ピンに隠れて線がクリックできない問題を防ぐ共通トグル) */
  blockMarkerClicksDuringTools?: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeType: 'solid' | 'dashed' | 'temporary';
  drawMode?: 'free' | 'smooth' | 'straight';
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  onMarkersChange: (markers: HeistMarker[], shouldPushHistory?: boolean, options?: { isDelete?: boolean }) => void;
  onSvgStringReady: (svgStr: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  focusTrigger?: { id: string; timestamp: number } | null;
  currentPosTrigger?: number;
  onClearFocusTrigger?: () => void;
  isEditMode?: boolean;
  showMarkerLabels?: boolean;
  bossCustomDurations?: { [markerId: string]: number };
  onBossCustomDurationChange?: (markerId: string, duration: number) => void;
  battleCustomDurations?: { [markerId: string]: number };
  onBattleCustomDurationChange?: (markerId: string, duration: number) => void;
  pickingCustomDurations?: { [markerId: string]: number };
  onPickingCustomDurationChange?: (markerId: string, duration: number | undefined) => void;
  longPickingCustomDurations?: { [markerId: string]: number };
  onLongPickingCustomDurationChange?: (markerId: string, duration: number | undefined) => void;
  pickyMarkerIds?: { [markerId: string]: boolean };
  onPickyMarkerChange?: (markerId: string, picky: boolean) => void;
  textPinPassThrough?: boolean;
  showPhoneCompass?: boolean;
  showPhoneBoxHud?: boolean;
  phoneBoxHudOpen?: boolean;
  onPhoneBoxHudOpenChange?: (open: boolean) => void;
  phoneBoxHudSize?: number;
  showBottomRightHud?: boolean;
  zoomHudSize?: number;
  onMarkersDragStart?: () => void;
  onMarkersDragEnd?: () => void;
  markerScale?: number;
  onHideGlobalMarker?: (id: string) => void;
  hiddenMarkers?: string[];
  hiddenMarkerTypes?: string[];
  showDetectionRanges?: boolean;
  stopMarkerThreshold?: number;
  movementMarkerThreshold?: number;
  warpMarkerThreshold?: number;
  skillCdThreshold?: number;
  onShowGlobalMarker?: (id: string) => void;
  onToggleMarkerVisibility?: (id: string) => void;
  leftSidebarCollapsed?: boolean;
  rightSidebarCollapsed?: boolean;
  targetDurationSeconds?: number;
  // Auto-route status callback — fired when status changes. Parent uses this
  // to render the auto-route UI (e.g. in the プレイデータ tab).
  onAutoRouteStatusChange?: (status: {
    active: boolean;
    running: boolean;
    elapsed: number;
    totalTime: number;
    totalDistance: number;
    totalStopTime: number;
    speed: number;
    error: string | null;
    nextMarkerLabel: string;
    currentStopLabel: string;
    stopRemaining: number;
    waitRemaining: number; // seconds left in initial wait (0 when not waiting)
    checkpoints: { elapsed: number; label: string; passed: boolean; ignored: boolean; unset: boolean; conflicted: boolean; targetTime: number }[];
    skillCdInfo: { label: string; color: string; remaining: number; total: number } | null;
  }) => void;
  // Auto-route command from parent — when the ts changes, the action is run.
  autoRouteCommand?: { action: 'start' | 'pause' | 'resume' | 'reset' | 'seek'; ts: number; seekTo?: number } | null;
  // Auto-route settings — read at the moment a command is processed
  autoRouteSettings?: {
    waitEnabled: boolean;
    waitSeconds: number;
    speedMode: 'time' | 'speed';
    manualSpeed: number;
    speedMultiplier: 1 | 2 | 3 | 5 | 10;
    followCamera: boolean;
    startStopSeconds: number;
  };
  // Follow camera state — when true, the view scrolls to keep the current
  // position slightly below center during the auto-route animation.
  followCamera?: boolean;
  // Auto-placed start marker (dummy) when no real start marker exists
  autoStartMarker?: HeistMarker | null;
  onAutoStartMarkerChange?: (marker: HeistMarker | null) => void;
  warpColor?: string;
  stairsColor?: string;
  fuseMode?: boolean;
  inactiveMarkersMode?: boolean;
  onAutoRouteStart?: () => void;
  hideRouteLines?: boolean;
  routeLines1px?: boolean;
  hideBranchLines?: boolean;
  branchLines1px?: boolean;
  // スキルCDマーカー編集時のプリセット選択肢。App から渡される。
  skillCdPresets?: SkillCdPreset[];
  // ヘルプモーダル設定タブを開く (プリセット管理用)
  onOpenSkillCdSettings?: () => void;
  // 起動時フッカスマーカーID（リセット時にその位置へ移動する）
  startupFocusMarkerId?: string;
  // スポーン記録関連
  spawnRecords?: SpawnRecord[];
  spawnVisibleTypes?: Set<SpawnItemType>;
  activeSpawnItem?: SpawnItemType | null;
  spawnDetail?: string;
  onSpawnAdd?: (x: number, y: number) => void;
  onSpawnDelete?: (id: string) => void;
  onSpawnEdit?: (id: string) => void;
  spawnToolMode?: 'place' | 'edit' | 'erase' | 'manage';
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  floor,
  strokes,
  markers,
  customBg,
  toolMode,
  activeMarkerType,
  walls = [],
  onWallsChange,
  hideStrokesDuringWalls = false,
  hideMarkersDuringWalls = false,
  eraseTarget = 'all',
  eraseDefaultBehavior = 'normal',
  eraseSize = 16,
  editStrokeIdxs,
  onEditStrokeIdxsChange,
  measureSelectedStrokeIdxs,
  onMeasureSelectedStrokeIdxsChange,
  blockMarkerClicksDuringTools,
  strokeColor,
  strokeWidth,
  strokeType,
  drawMode = 'free',
  onStrokesChange,
  onMarkersChange,
  onSvgStringReady,
  canvasRef,
  focusTrigger,
  currentPosTrigger,
  onClearFocusTrigger,
  isEditMode = true,
  showMarkerLabels = true,
  bossCustomDurations = {},
  onBossCustomDurationChange,
  battleCustomDurations = {},
  onBattleCustomDurationChange,
  pickingCustomDurations = {},
  onPickingCustomDurationChange,
  longPickingCustomDurations = {},
  onLongPickingCustomDurationChange,
  pickyMarkerIds = {},
  onPickyMarkerChange,
  textPinPassThrough = true,
  showPhoneCompass = false,
  showPhoneBoxHud = false,
  phoneBoxHudOpen = false,
  onPhoneBoxHudOpenChange,
  phoneBoxHudSize = 100,
  showBottomRightHud = true,
  zoomHudSize = 100,
  onMarkersDragStart,
  onMarkersDragEnd,
  markerScale = 30,
  onHideGlobalMarker,
  hiddenMarkers = [],
  hiddenMarkerTypes = [],
  showDetectionRanges = false,
  stopMarkerThreshold = 10,
  movementMarkerThreshold = 10,
  warpMarkerThreshold = 10,
  skillCdThreshold = 10,
  onShowGlobalMarker,
  onToggleMarkerVisibility,
  leftSidebarCollapsed = false,
  rightSidebarCollapsed = false,
  targetDurationSeconds,
  onAutoRouteStatusChange,
  autoRouteCommand,
  autoRouteSettings,
  followCamera = false,
  autoStartMarker = null,
  onAutoStartMarkerChange,
  warpColor = '#ff00ff',
  stairsColor = '#ffaa00',
  fuseMode = true,
  inactiveMarkersMode = true,
  onAutoRouteStart,
  hideRouteLines = false,
  routeLines1px = false,
  hideBranchLines = false,
  branchLines1px = false,
  skillCdPresets = [],
  onOpenSkillCdSettings,
  startupFocusMarkerId,
  spawnRecords = [],
  spawnVisibleTypes,
  onSpawnAdd,
  onSpawnDelete,
  onSpawnEdit,
  spawnToolMode = 'place'
}) => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname === '::1';

  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const redrawStrokesRef = useRef<((overrideElapsed?: number) => void) | null>(null);
  const lastRedrawnElapsedRef = useRef<number>(-999);
  const lastRedrawnStrokesLengthRef = useRef<number>(-1);
  const runnerDotRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const markersRef = useRef<HeistMarker[]>(markers);
  const erasedMarkerIdsRef = useRef<Set<string>>(new Set());

  // Helper to resolve connection properties between Warp/Stairs
  const getWarpConnectionInfo = (m: HeistMarker, allMarkers: HeistMarker[]) => {
    if (m.type !== 'warp' && m.type !== 'iwarp' && m.type !== 'stairs') {
      return { hasLink: false, isPrimary: false, primary: null, partner: null, isReversed: false, isMutuallyLinked: false };
    }

    // 1. Find partner (destination m.linkedWarpId or incoming link pointing to m)
    let partner = m.linkedWarpId ? allMarkers.find(mk => mk.id === m.linkedWarpId) : null;
    let isIncoming = false;
    if (!partner) {
      partner = allMarkers.find(mk => mk.linkedWarpId === m.id && (mk.type === 'warp' || mk.type === 'iwarp' || mk.type === 'stairs'));
      if (partner) {
        isIncoming = true;
      }
    }

    if (!partner) {
      return { hasLink: false, isPrimary: false, primary: null, partner: null, isReversed: false, isMutuallyLinked: false };
    }

    const isMutuallyLinked = m.linkedWarpId === partner.id && partner.linkedWarpId === m.id;

    let primary: HeistMarker;
    let isPrimary: boolean;
    let isReversed: boolean;

    if (isMutuallyLinked) {
      const isMPrimary = m.id < partner.id;
      primary = isMPrimary ? m : partner;
      isPrimary = isMPrimary;
      isReversed = !isMPrimary; // If m is secondary, path is reversed (from m's perspective)
    } else {
      if (isIncoming) {
        // Link starts at partner, ends at m
        primary = partner;
        isPrimary = false;
        isReversed = true;
      } else {
        // Link starts at m, ends at partner
        primary = m;
        isPrimary = true;
        isReversed = false;
      }
    }

    return {
      hasLink: true,
      isPrimary,
      primary,
      partner,
      isReversed,
      isMutuallyLinked
    };
  };

  // Helper function to check if marker is individual
  const isIndiv = (type: string) => ['start', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint', 'skill_cd'].includes(type);
  // Helpers to check type family (global or individual variant)
  const isInfoType = (type: string) => type === 'info' || type === 'iinfo';
  const isNoteType = (type: string) => type === 'note' || type === 'inote';
  const isTextType = (type: string) => type === 'text' || type === 'itext';



  // Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPanState] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Re-render when user dictionary changes (so tNote() picks up new entries)
  useLangState();
  const [, setUserDictTick] = useState(0);
  useEffect(() => {
    return subscribeUserDict(() => setUserDictTick(t => t + 1));
  }, []);

  const getClampedPan = (p: Point, z: number): Point => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return p;
    const W_v = wrapper.clientWidth;
    const H_v = wrapper.clientHeight;

    const minPanX = -800 - 800 * z + 100;
    const maxPanX = W_v - 800 + 800 * z - 100;
    const minPanY = -2275 - 2275 * z + 100;
    const maxPanY = H_v - 2275 + 2275 * z - 100;

    return {
      x: Math.max(minPanX, Math.min(maxPanX, p.x)),
      y: Math.max(minPanY, Math.min(maxPanY, p.y))
    };
  };

  const setPan = (p: Point | ((prev: Point) => Point)) => {
    setPanState(prev => {
      const next = typeof p === 'function' ? p(prev) : p;
      return getClampedPan(next, animZoomRef.current);
    });
  };

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, _setCurrentPoints] = useState<Point[]>([]);
  const currentPointsRef = useRef<Point[]>([]);
  const setCurrentPoints = (pts: Point[] | ((prev: Point[]) => Point[])) => {
    _setCurrentPoints(prev => {
      const next = typeof pts === 'function' ? pts(prev) : pts;
      currentPointsRef.current = next;
      return next;
    });
  };

  // Distance Measure mode: 選択中のストロークインデックス集合 (セッションをまたいで保持)
  // - 通常クリック: 集合を「クリックした線だけ」に置き換える
  // - Alt+クリック: 集合にトグル追加 (前の選択を保持)
  // - 空所クリック: 通常はクリア、Alt 押下時は維持
  // - 計測モード再突入時: 空集合なら最後に描画した線を自動追加、
  //                       非空なら「最後に表示していたセット」を復元
  const [highlightedStrokeIdxs, setHighlightedStrokeIdxs] = useState<Set<number>>(() => new Set());

  // Eraser cursor: Canvas で動的にカーソル画像を生成し CSS cursor に適用
  const eraseCursorUrl = useMemo(() => {
    const size = Math.max(eraseSize * 2, 4);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'crosshair';
    const r = size / 2;
    ctx.strokeStyle = 'rgba(80, 180, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(80, 180, 255, 0.12)';
    ctx.fill();
    return `url(${canvas.toDataURL()}) ${r} ${r}, crosshair`;
  }, [eraseSize]);

  // 線分編集モードのラバーバンド矩形: ドラッグ範囲選択
  // - pressedAlt: MouseDown 時の Alt 状態を覚える (MouseUp 時の最終判定用)
  const [editRect, setEditRect] = useState<{ start: Point; end: Point; pressedAlt: boolean } | null>(null);

  // Drag-and-drop Marker State
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [draggingWaypoint, setDraggingWaypoint] = useState<{ markerId: string; index: number } | null>(null);

  // Note Popover State
  const [activeNoteMarkerId, setActiveNoteMarkerId] = useState<string | null>(null);

  // Viewport culling: only render markers visible in the current viewport + margin for popups.
  // Uses getBoundingClientRect() on both wrapper (viewport clip) and container (transformed canvas)
  // to correctly map visible bounds back to canvas coordinates regardless of zoom/pan.
  const PIN_MARGIN = 350;
  const visibleMarkers = useMemo(() => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!containerRect || !wrapperRect) return markers;
    const viewLeft = ((wrapperRect.left - containerRect.left) / containerRect.width) * 1600 - PIN_MARGIN;
    const viewTop = ((wrapperRect.top - containerRect.top) / containerRect.height) * 4550 - PIN_MARGIN;
    const viewRight = ((wrapperRect.right - containerRect.left) / containerRect.width) * 1600 + PIN_MARGIN;
    const viewBottom = ((wrapperRect.bottom - containerRect.top) / containerRect.height) * 4550 + PIN_MARGIN;
    return markers.filter(m => {
      if (m.floor !== floor) return false;
      const isWallMode = toolMode === 'draw-wall' || toolMode === 'erase-wall';
      if (isWallMode && hideMarkersDuringWalls) return false;
      if (erasedMarkerIdsRef.current.has(m.id)) return false;
      if (m.id === draggingMarkerId || m.id === activeNoteMarkerId) return true;
      return m.x >= viewLeft && m.x <= viewRight && m.y >= viewTop && m.y <= viewBottom;
    });
  }, [markers, floor, draggingMarkerId, activeNoteMarkerId, zoom, pan]);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [noteText, setNoteText] = useState('');
  const [infoLabel, setInfoLabel] = useState('');
  const [zoomedMedia, setZoomedMedia] = useState<{ url: string; type: 'image' | 'webm' | 'youtube' } | null>(null);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(14);
  const [textScaleWithMap, setTextScaleWithMap] = useState(false);
  const [textFixedPosition, setTextFixedPosition] = useState(false);
  const [textTrackSide, setTextTrackSide] = useState<'auto' | 'left' | 'right'>('left');
  const [textDescription, setTextDescription] = useState('');
  const [textTooltip, setTextTooltip] = useState(false);
  const [textGlow, setTextGlow] = useState(false);
  const [warpLinkTargetId, setWarpLinkTargetId] = useState<string>('');
  const [warpLinkMode, setWarpLinkMode] = useState<'idle' | 'selecting-bi' | 'selecting-oneway'>('idle');
  const [bossDrops, setBossDrops] = useState<string[]>([]);
  const [bossDescription, setBossDescription] = useState<string>('');
  const [bossDurationSeconds, setBossDurationSeconds] = useState(60);
  const [battleDurationSeconds, setBattleDurationSeconds] = useState(20);
  const [pickingDurationSeconds, setPickingDurationSeconds] = useState(5);
  const [longPickingDurationSeconds, setLongPickingDurationSeconds] = useState(8);
  const [pickingPicky, setPickingPicky] = useState(false);
  const [ehHighRate, setEhHighRate] = useState(false);
  const [cardkeyHighRate, setCardkeyHighRate] = useState(false);
  const [customDropInput, setCustomDropInput] = useState('');
  const [useBossCustomDuration, setUseBossCustomDuration] = useState(false);
  const [bossCustomDurationVal, setBossCustomDurationVal] = useState<number | undefined>(undefined);
  const [useBattleCustomDuration, setUseBattleCustomDuration] = useState(false);
  const [battleCustomDurationVal, setBattleCustomDurationVal] = useState<number | undefined>(undefined);
  const [usePickingCustomDuration, setUsePickingCustomDuration] = useState(false);
  const [pickingCustomDurationVal, setPickingCustomDurationVal] = useState<number | undefined>(undefined);
  const [useLongPickingCustomDuration, setUseLongPickingCustomDuration] = useState(false);
  const [longPickingCustomDurationVal, setLongPickingCustomDurationVal] = useState<number | undefined>(undefined);

  // Checkpoint-specific state
  const [checkpointTargetTime, setCheckpointTargetTime] = useState(60);
  const [checkpointSoundOn, setCheckpointSoundOn] = useState(false);
  const [checkpointVoiceOn, setCheckpointVoiceOn] = useState(true);
  const [popupDirection, setPopupDirection] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const [popupWidth, setPopupWidth] = useState<number>(300);
  const [popupHeight, setPopupHeight] = useState<number>(0);
  const [popupOffset, setPopupOffset] = useState<Point>({ x: 0, y: -100 });
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const [popupDragStart, setPopupDragStart] = useState<Point>({ x: 0, y: 0 });
  const [popupOffsetStart, setPopupOffsetStart] = useState<Point>({ x: 0, y: -100 });
  const [currentPosition, setCurrentPosition] = useState<Point | null>(null);
  const [noteSettingsExpanded, setNoteSettingsExpanded] = useState(false);

  // スキルCD編集用ステート
  // プリセット未使用時 (=skillPresetId が空) は note がラベルの役割。編集の頭文字がリアルタイムでアイコンに反映される。
  // プリセット使用時は skillLabel がアイコン/名称の元になる (note はメモ扱い)。
  const [skillCdColor, setSkillCdColor] = useState<string>('#39ff14');
  const [skillCdMode, setSkillCdMode] = useState<'fixed' | 'per_second'>('fixed');
  // skillCdSeconds: mode='fixed' の CD秒数 / mode='per_second' の「使用秒数」
  const [skillCdSeconds, setSkillCdSeconds] = useState<number>(2);
  // mode='per_second' の係数
  const [skillCdPerSecondRate, setSkillCdPerSecondRate] = useState<number>(2);

  // Target states for smooth scrolling (use refs to avoid React 18 batching issues)
  const targetZoomRef = useRef<number>(1);
  const targetPanRef = useRef<Point>({ x: 0, y: 0 });
  const animFrameIdRef = useRef<number | null>(null);
  const animPanRef = useRef<Point>({ x: 0, y: 0 });
  const animZoomRef = useRef<number>(1);
  animPanRef.current = pan;
  animZoomRef.current = zoom;

  // Auto-route engine
  const {
    autoRouteActive,
    autoRouteElapsed,
    autoRouteSegments,
    autoRouteTiming
  } = useAutoRouteEngine({
    markers,
    strokes,
    floor,
    stopMarkerThreshold,
    movementMarkerThreshold,
    warpMarkerThreshold,
    skillCdThreshold,
    hiddenMarkers,
    targetDurationSeconds,
    autoRouteSettings,
    followCamera,
    autoRouteCommand,
    onAutoRouteStatusChange,
    checkpointVoiceOn,
    pickyMarkerIds,
    wrapperRef,
    containerRef,
    animZoomRef,
    animPanRef,
    targetPanRef,
    setPan,
    setCurrentPosition,
    zoom,
    onAutoStartMarkerSet: onAutoStartMarkerChange,
    onTick: (elapsed, pos) => {
      if (runnerDotRef.current) {
        runnerDotRef.current.style.left = `${pos.x}px`;
        runnerDotRef.current.style.top = `${pos.y}px`;
      }
      if (redrawStrokesRef.current) redrawStrokesRef.current(elapsed);
    },
    onStart: onAutoRouteStart
  });

  // Pre-calculate passed marker IDs to optimize performance from O(N*M) to O(N+M)
  const passedMarkerIds = useMemo(() => {
    if (!autoRouteActive || !autoRouteSegments || autoRouteSegments.length === 0) return new Set<string>();
    const passed = new Set<string>();
    const speed = autoRouteTiming.speed;
    autoRouteSegments.forEach(seg => {
      if (seg.markerId) {
        const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
        const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
        const passedTime = seg.cumulativeDistance / Math.max(segSpeed, 0.0001) + seg.cumulativeStopTime + travelTime;
        if (autoRouteElapsed >= passedTime) {
          passed.add(seg.markerId);
        }
      }
    });
    return passed;
  }, [autoRouteActive, autoRouteSegments, autoRouteElapsed, autoRouteTiming.speed]);

  // 違反状態 (= 速度計算/読み上げから除外された) のチェックポイントID セット
  // useAutoRouteEngine.ts と同じ判定を MapCanvas 側でも行い、
  // 違反しているピンにだけ赤いパルスグローを適用する。
  // EH ピンの `eh-high-rate` と同様「単体で」光らせるための仕組み。
  const violatingCheckpointIds = useMemo(() => {
    const ids = new Set<string>();
    if (!autoRouteSegments || autoRouteSegments.length === 0) return ids;
    let prevCpTarget = -Infinity;
    for (const seg of autoRouteSegments) {
      if (seg.markerType !== 'checkpoint') continue;
      const cpTarget = (seg as any)._checkpointTarget as number | undefined;
      if (cpTarget === undefined) continue;
      // ignored : マイナス (異常値) — 速度計算でも読み上げでも除外
      // unset   : 0 (未設定) — 速度計算でも読み上げでも除外
      // conflicted: 順序矛盾 (前の有効値より小さい) — 速度計算でも読み上げでも除外
      const ignored = cpTarget < 0;
      const unset = cpTarget === 0;
      const conflicted = cpTarget > 0 && cpTarget < prevCpTarget;
      if (ignored || unset || conflicted) {
        if (seg.markerId) ids.add(seg.markerId);
      }
      if (cpTarget > 0 && !conflicted) prevCpTarget = cpTarget;
    }
    return ids;
  }, [autoRouteSegments]);

  // 現在地から一番近く、起動中 (=phoneActive=true) の ReroRero電話ボックスを
  // 常時起動 (=phoneLocked=true) を除外して求める。コンパス表示用。
  // autoRouteActive には依存しない (手動で現在地を設定しているだけでも表示する)
  const nearestActivePhone = useMemo(() => {
    if (!showPhoneCompass || !currentPosition) return null;
    let best: HeistMarker | null = null;
    let bestDist = Infinity;
    for (const m of markers) {
      if (m.type !== 'phone') continue;
      if (!m.phoneActive) continue;
      if (m.phoneLocked) continue;
      const dx = m.x - currentPosition.x;
      const dy = m.y - currentPosition.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = m;
      }
    }
    return best;
  }, [showPhoneCompass, currentPosition, markers]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, []);

  // Close all popups and reset expanded states on mode switch
  useEffect(() => {
    setActiveNoteMarkerId(null);
    const hasExpanded = markers.some(
      m => m.infoExpanded || m.noteExpanded || m.bossExpanded || m.battleExpanded || m.pickingExpanded || m.checkpointExpanded
    );
    if (hasExpanded) {
      onMarkersChange(
        markers.map(m => ({
          ...m,
          infoExpanded: false,
          noteExpanded: false,
          bossExpanded: false,
          battleExpanded: false,
          pickingExpanded: false,
          checkpointExpanded: false,
        }))
      );
    }
  }, [isEditMode]);

  // Fixed text-pin pane tracking — display-only offset.
  // The pane offset is NOT persisted to marker data. Instead, the offset is
  // computed directly from the current pane state at render time. Since the
  // base state is "panes closed", when a pane is open the pin shifts by the
  // pane width to maintain its visual position relative to the map content.
  // This approach works for all markers regardless of when they are loaded.
  const computePaneOffset = (m: HeistMarker): number => {
    if (!m.textFixedPosition) return 0;
    const midX = window.innerWidth / 2;
    const side: 'left' | 'right' =
      m.trackSide === 'auto' || !m.trackSide
        ? (m.x < midX ? 'left' : 'right')
        : m.trackSide;
    const isMobile = window.innerWidth < 768;
    if (side === 'left') return leftSidebarCollapsed ? 0 : (isMobile ? 320 : 280);
    return rightSidebarCollapsed ? 0 : (isMobile ? -320 : -340);
  };

  // Sync state to anim refs whenever state changes
  // This ensures that user manual zoom/pan (which update state)
  // are immediately reflected in the anim refs, preventing stale start positions.
  useEffect(() => {
    animPanRef.current = pan;
    animZoomRef.current = zoom;
  }, [pan, zoom]);

  // Register mouse wheel event listener on wrapperRef for custom zoom behavior
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.info-marker-popup, .boss-marker-popup, .edit-popup, .control-panel, .map-sidebar')) {
        return;
      }
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);

      const prevZoom = animZoomRef.current;
      const prevPan = animPanRef.current;
      const newZoom = Math.max(0.1, Math.min(4, prevZoom * factor));
      if (!isFinite(newZoom) || prevZoom === newZoom) return;

      const wRect = wrapper.getBoundingClientRect();
      // アンカー: wrapper の中心（wrapper 相対座標 = 要素ローカル座標と一致）。
      // レンダリングは transform-origin: center center 付きの
      //   screenX = (mapX - 800) * zoom + pan.x + 800
      // なので、+800 の transform-origin 定数を数式側で反映する必要がある。
      const anchorX = wRect.width / 2;
      const anchorY = wRect.height / 2;
      // アンカー位置にある map 座標を逆算
      //   anchorX = (mapX - 800) * prevZoom + prevPan.x + 800
      //   => mapX = 800 + (anchorX - prevPan.x - 800) / prevZoom
      const mapX = 800 + (anchorX - prevPan.x - 800) / prevZoom;
      const mapY = 2275 + (anchorY - prevPan.y - 2275) / prevZoom;
      // 同じ map 座標が新しい zoom でもアンカー位置に来るように newPan を計算
      //   anchorX = (mapX - 800) * newZoom + newPan.x + 800
      //   => newPan.x = anchorX - 800 - (mapX - 800) * newZoom
      const newPanX = anchorX - 800 - (mapX - 800) * newZoom;
      const newPanY = anchorY - 2275 - (mapY - 2275) * newZoom;

      animZoomRef.current = newZoom;
      animPanRef.current = { x: newPanX, y: newPanY };
      targetZoomRef.current = newZoom;
      targetPanRef.current = { x: newPanX, y: newPanY };
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Adjust scrollConfig pan values for the current viewport size.
  // When scrollConfig was saved on a different viewport, pan.x/y contain
  // offsets relative to that viewport's center. We recalculate so the same
  // map area appears centered on the current viewport.
  const adjustScrollConfigForViewport = (cfg: { x: number; y: number; zoom: number; viewWidth?: number; viewHeight?: number }) => {
    if (cfg.viewWidth == null || cfg.viewHeight == null) return { x: cfg.x, y: cfg.y };
    const wrapper = wrapperRef.current;
    if (!wrapper) return { x: cfg.x, y: cfg.y };
    const curW = wrapper.clientWidth;
    const curH = wrapper.clientHeight;
    return {
      x: cfg.x + (curW - cfg.viewWidth) / 2,
      y: cfg.y + (curH - cfg.viewHeight) / 2
    };
  };

  // Smooth scroll logic using requestAnimationFrame
  // Uses refs to track animation progress (avoids React 18 batching issues
  // where state updater callbacks don't run synchronously)
  const startSmoothScroll = (tgtPan: Point, tgtZoom: number) => {
    targetPanRef.current = tgtPan;
    targetZoomRef.current = tgtZoom;

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
    }

    const tick = () => {
      const curPan = animPanRef.current;
      const curZoom = animZoomRef.current;

      const dx = targetPanRef.current.x - curPan.x;
      const dy = targetPanRef.current.y - curPan.y;
      const dz = targetZoomRef.current - curZoom;

      const panDone = Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5;
      const zoomDone = Math.abs(dz) <= 0.005;

      const newPan = panDone
        ? { ...targetPanRef.current }
        : { x: curPan.x + dx * 0.15, y: curPan.y + dy * 0.15 };
      const newZoom = zoomDone
        ? targetZoomRef.current
        : curZoom + dz * 0.15;

      if (!isFinite(newPan.x) || !isFinite(newPan.y) || !isFinite(newZoom)) {
        animPanRef.current = { ...targetPanRef.current };
        animZoomRef.current = targetZoomRef.current;
        setPan(targetPanRef.current);
        setZoom(targetZoomRef.current);
        animFrameIdRef.current = null;
        if (onClearFocusTrigger) onClearFocusTrigger();
        return;
      }

      animPanRef.current = newPan;
      animZoomRef.current = newZoom;
      setPan(newPan);
      setZoom(newZoom);

      if (!panDone || !zoomDone) {
        animFrameIdRef.current = requestAnimationFrame(tick);
      } else {
        animFrameIdRef.current = null;
        if (onClearFocusTrigger) {
          onClearFocusTrigger();
        }
      }
    };

    animFrameIdRef.current = requestAnimationFrame(tick);
  };

  // Keep markersRef in sync with the markers prop
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Handle focusTrigger updates
  // NOTE: Uses markersRef (not `markers`) to avoid re-triggering on every
  // render when the parent creates a new array reference (e.g. spread).
  // Without this fix, the effect re-runs on every render while focusTrigger
  // is non-null, cancelling and restarting the smooth scroll → infinite loop.
  useEffect(() => {
    if (focusTrigger) {
      const marker = markersRef.current.find(m => m.id === focusTrigger.id);
      if (marker) {
        // Update current position indicator
        setCurrentPosition({ x: marker.x, y: marker.y });

        if (marker.scrollConfig) {
          // If custom scrollConfig is registered, adjust for current viewport
          const adjusted = adjustScrollConfigForViewport(marker.scrollConfig);
          startSmoothScroll(
            { x: adjusted.x, y: adjusted.y },
            marker.scrollConfig.zoom
          );
        } else {
          // Default scroll: center marker horizontally, place slightly below center
          const wrapper = wrapperRef.current;
          if (wrapper) {
            const W_v = wrapper.clientWidth;
            const H_v = wrapper.clientHeight;
            const tgtZoom = 2;
            const tgtPan = {
              x: W_v * 0.5 - 800 - (marker.x - 800) * tgtZoom,
              y: H_v * 0.6 - 2275 - (marker.y - 2275) * tgtZoom
            };
            startSmoothScroll(tgtPan, tgtZoom);
          }
        }
      }
    }
  }, [focusTrigger]);

  // Handle "現在位置に移動" button — scroll to the current route position
  // using the same warp-scroll formula that already works correctly.
  useEffect(() => {
    if (!currentPosTrigger) return;
    if (!currentPosition) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const W_v = wrapper.clientWidth;
    const H_v = wrapper.clientHeight;
    const tgtZoom = zoom || 1;
    const tgtPan = {
      x: W_v * 0.5 - 800 - (currentPosition.x - 800) * tgtZoom,
      y: H_v * 0.6 - 2275 - (currentPosition.y - 2275) * tgtZoom
    };
    startSmoothScroll(tgtPan, tgtZoom);
  }, [currentPosTrigger]);

  // Extract SVG string for PNG export
  useEffect(() => {
    if (svgWrapperRef.current) {
      const svgElement = svgWrapperRef.current.querySelector('svg');
      if (svgElement) {
        onSvgStringReady(svgElement.outerHTML);
      }
    }
  }, [floor, onSvgStringReady]);

  // Setup Canvas Context
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctxRef.current = ctx;
        redrawStrokes();
      }
    }
  }, [strokes, hideRouteLines, routeLines1px, hideBranchLines, branchLines1px, spawnRecords, spawnVisibleTypes]);

  // Redraw strokes when animation ticks (highly efficient)
  useEffect(() => {
    redrawStrokes();
  }, [autoRouteActive, autoRouteElapsed, autoRouteSegments, fuseMode, hideRouteLines, routeLines1px, hideBranchLines, branchLines1px, highlightedStrokeIdxs, editStrokeIdxs, toolMode, hideStrokesDuringWalls, spawnRecords, spawnVisibleTypes]);

  // 距離計測モード:
  // - 計測モード進入時: セットが空 → 最後に描画した線を自動追加、
  //                     セットに何かある → 「最後に表示していたセット」をそのまま復元
  // - 計測モード解除時: セットを保持 (次回進入時に復元される)
  // ストローク数の変化を監視:
  // - 増加 (新規描画) → 旧選択を破棄し、「次回表示セット」として新規末尾だけ覚える
  //   (計測モードに入ったらこれが点灯する)
  // - 減少 (削除・分割) → 範囲外インデックスを掃除
  // - 計測モード進入時 (strokes.length 変化とは別): セットが空なら新規末尾を点灯
  useEffect(() => {
    setHighlightedStrokeIdxs(prev => {
      // まず範囲外を掃除
      const cleaned = new Set<number>();
      for (const idx of prev) {
        if (idx < strokes.length && strokes[idx]?.type !== 'temporary') cleaned.add(idx);
      }
      return cleaned;
    });
  }, [strokes.length]);

  // ストローク数が増加した瞬間に旧選択を破棄し、新規末尾を「次回表示セット」にする
  const realStrokesCount = strokes.filter(s => s.type !== 'temporary').length;
  const lastRealStrokeIdx = (() => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i] && strokes[i].type !== 'temporary') return i;
    }
    return -1;
  })();

  const prevRealCountRef = useRef<number>(realStrokesCount);
  useEffect(() => {
    const prev = prevRealCountRef.current;
    if (realStrokesCount > prev && lastRealStrokeIdx >= 0) {
      // ライン追加 → 旧選択を破棄して新規末尾だけ覚える
      const next = new Set([lastRealStrokeIdx]);
      setHighlightedStrokeIdxs(next);
      onMeasureSelectedStrokeIdxsChange?.(next);
    }
    prevRealCountRef.current = realStrokesCount;
  }, [realStrokesCount, lastRealStrokeIdx]);

  // 距離計測モード:
  // - 計測モード進入時: セットが空 → 最後に描画した線を自動追加、
  //                     セットに何かある → 「最後に表示していたセット」をそのまま復元
  // - 計測モード解除時: セットを保持 (次回進入時に復元される)
  useEffect(() => {
    if (toolMode === 'measure') {
      setHighlightedStrokeIdxs(prev => {
        if (prev.size > 0) return prev; // 既に表示セットあり → 維持
        if (lastRealStrokeIdx < 0) return prev; // 実線が無い → 何もしない
        const next = new Set(prev);
        next.add(lastRealStrokeIdx);
        return next;
      });
    }
    // 計測モード解除時はクリアしない (セッションをまたいで保持)
  }, [toolMode, lastRealStrokeIdx]);

  // 線分編集モード:
  // - ストローク数変化 (削除・分割) に追随して範囲外インデックスを掃除
  // - モード切替時 (edit-stroke → 他): 選択を保持 (次回モード入りで再利用)
  useEffect(() => {
    if (!onEditStrokeIdxsChange || !editStrokeIdxs) return;
    const cleaned = new Set<number>();
    let needsUpdate = false;
    for (const idx of editStrokeIdxs) {
      if (idx < strokes.length) cleaned.add(idx);
      else needsUpdate = true;
    }
    if (needsUpdate) onEditStrokeIdxsChange(cleaned);
  }, [strokes.length, onEditStrokeIdxsChange, editStrokeIdxs]);

  // Keyboard shortcut listener to toggle the nearest phone box with the "R" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zoomedMedia) {
        e.preventDefault();
        setZoomedMedia(null);
        return;
      }
      if (e.key === 'Escape' && activeNoteMarkerId) {
        e.preventDefault();
        setActiveNoteMarkerId(null);
        return;
      }
      // Presentation-mode popups (picking / info / boss / battle) are
      // tracked on the marker via `*Expanded` flags rather than
      // `activeNoteMarkerId`, so the ESC check above misses them.
      // Close any open presentation popup here.
      if (e.key === 'Escape') {
        const hasOpenPopup = markers.some(
          m => m.pickingExpanded || m.infoExpanded || m.bossExpanded || m.battleExpanded || m.noteExpanded
        );
        if (hasOpenPopup) {
          e.preventDefault();
          onMarkersChange(
            markers.map(mk => mk.pickingExpanded || mk.infoExpanded || mk.bossExpanded || mk.battleExpanded || mk.noteExpanded
              ? { ...mk, pickingExpanded: false, infoExpanded: false, bossExpanded: false, battleExpanded: false, noteExpanded: false }
              : mk
            )
          );
          return;
        }
      }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (!currentPosition) return;
        
        // Find all phone markers on the current floor
        const phoneMarkers = markers.filter(m => m.type === 'phone' && m.floor === floor);
        if (phoneMarkers.length === 0) return;
        
        // Find the closest phone marker
        let closestPhone: HeistMarker | null = null;
        let minDistance = Infinity;
        
        phoneMarkers.forEach(m => {
          const dist = Math.hypot(m.x - currentPosition.x, m.y - currentPosition.y);
          if (dist < minDistance) {
            minDistance = dist;
            closestPhone = m;
          }
        });
        
        if (closestPhone && !(closestPhone as HeistMarker).phoneLocked) {
          onMarkersChange(
            markers.map(mk => {
              if (mk.id === (closestPhone as HeistMarker).id) {
                return { ...mk, phoneActive: !mk.phoneActive };
              }
              return mk;
            }),
            true // should push history
          );
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPosition, markers, floor, onMarkersChange, activeNoteMarkerId]);

  useEffect(() => {
    redrawStrokesRef.current = redrawStrokes;
  });

  // Redraw all strokes on canvas
  const redrawStrokes = (overrideElapsed?: number, forceWhileDrawing?: boolean) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    // 描画中 (mousedown → mouseup 間) はキャンバスをクリアしない。
    // これにより、useEffect 経由の redrawStrokes が進行中の描画を消すのを防ぐ。
    // ただし forceWhileDrawing=true の場合は直線ツール等からの意図的な呼び出しなので許可。
    if (isDrawingRef.current && !forceWhileDrawing) return;

    let remaining = overrideElapsed !== undefined ? overrideElapsed : autoRouteElapsed;

    // Cache guard: If elapsed time has barely changed and stroke counts match, skip expensive redraw
    if (
      autoRouteActive &&
      Math.abs(lastRedrawnElapsedRef.current - remaining) < 0.04 &&
      lastRedrawnStrokesLengthRef.current === strokes.length
    ) {
      return;
    }
    lastRedrawnElapsedRef.current = remaining;
    lastRedrawnStrokesLengthRef.current = strokes.length;

    ctx.clearRect(0, 0, 1600, 4550);
    ctx.globalAlpha = 1;

    const isWallMode = toolMode === 'draw-wall' || toolMode === 'erase-wall';
    if (isWallMode && hideStrokesDuringWalls) {
      return;
    }

    if (autoRouteActive && fuseMode && autoRouteSegments && autoRouteSegments.length > 0) {
      if (!hideRouteLines) {
        const speed = autoRouteTiming.speed;

        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = routeLines1px ? 1 : 3;
        ctx.setLineDash([]);
        ctx.beginPath();

      let lastX: number | null = null;
      let lastY: number | null = null;
      const addLineToPath = (x1: number, y1: number, x2: number, y2: number) => {
        if (lastX === null || lastY === null || Math.abs(lastX - x1) > 0.1 || Math.abs(lastY - y1) > 0.1) {
          ctx.moveTo(x1, y1);
        }
        ctx.lineTo(x2, y2);
        lastX = x2;
        lastY = y2;
      };

      autoRouteSegments.forEach(seg => {
        const isWarp = seg.distance === 0 && seg.stopDuration === 0;
        if (isWarp) return;

        const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
        const travelTime = seg.distance / Math.max(segSpeed, 0.0001);

        if (remaining > 0) {
          if (remaining < travelTime) {
            const t = remaining / travelTime;
            const startPt = {
              x: seg.start.x + (seg.end.x - seg.start.x) * t,
              y: seg.start.y + (seg.end.y - seg.start.y) * t
            };
            addLineToPath(startPt.x, startPt.y, seg.end.x, seg.end.y);
            remaining = 0;
          } else {
            remaining -= travelTime;
            if (remaining < seg.stopDuration) {
              remaining = 0;
            } else {
              remaining -= seg.stopDuration;
            }
          }
        } else {
          addLineToPath(seg.start.x, seg.start.y, seg.end.x, seg.end.y);
        }
      });
        ctx.stroke();
      }

      // Also draw branch lines (dashed) during auto-route playback unless hidden
      strokes.forEach(stroke => {
        const isDashed = stroke.type === 'dashed';
        const isTemporary = stroke.type === 'temporary';
        if ((!isDashed && !isTemporary) || (isDashed && hideBranchLines)) return;

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = branchLines1px ? 1 : stroke.width;
        ctx.setLineDash([8, 6]);

        if (isTemporary) {
          ctx.globalAlpha = 0.4;
          ctx.setLineDash([6, 4]);
        }

        ctx.beginPath();
        stroke.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        if (isTemporary) {
          ctx.globalAlpha = 1;
        }
      });

      // ルート案内中 (fuseMode) はメインルート以外 (実線) は描画されないため、
      // その間に新規描画した線 (= strokes の末尾) を半透明で再描画して
      // 「書きかけ」が消えないようにする。
      // - 直前に draw ツールで描いて追加された線を対象とする
      // - 編集中の線は不透明度 1 で扱う (途中の編集がルート案内の影響を受けて薄くなるのを避ける)
      if (strokes.length > 0) {
        const last = strokes[strokes.length - 1];
        if (last && last.points && last.points.length >= 2 && last.type === 'solid') {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = last.color;
          ctx.lineWidth = routeLines1px ? 1 : last.width;
          ctx.setLineDash([]);
          ctx.beginPath();
          last.points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
          ctx.restore();
        }
      }
    } else {
      strokes.forEach(stroke => {
        const isDashed = stroke.type === 'dashed';
        const isTemporary = stroke.type === 'temporary';

        if (isDashed && hideBranchLines) return;
        if (!isDashed && !isTemporary && hideRouteLines) return;

        ctx.strokeStyle = stroke.color;

        if (isTemporary) {
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = stroke.width;
          ctx.setLineDash([6, 4]);
        } else if (isDashed) {
          ctx.lineWidth = branchLines1px ? 1 : stroke.width;
          ctx.setLineDash([8, 6]);
        } else {
          ctx.lineWidth = routeLines1px ? 1 : stroke.width;
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        stroke.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        if (isTemporary) {
          ctx.globalAlpha = 1;
        }
      });
    }

    // ハイライト描画 (measure と edit-stroke 共通)
    // - measure: 計測用に選択した線を光らせる
    // - edit-stroke: 編集中に選択した線を光らせる
    const activeHighlight = (toolMode === 'measure'
      ? (measureSelectedStrokeIdxs ?? highlightedStrokeIdxs)
      : (editStrokeIdxs ?? new Set<number>()));
    if ((toolMode === 'measure' || toolMode === 'edit-stroke') && activeHighlight.size > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      for (const idx of activeHighlight) {
        if (idx < 0 || idx >= strokes.length) continue;
        const hs = strokes[idx];
        if (!hs || !hs.points || hs.points.length < 2) continue;
        const baseColor = hs.color || '#00ff00';
        // 1. アウターハロー (白・半透明) — 黄色の線でも見えるよう白でコントラスト確保
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = (hs.width || 3) + 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        hs.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        // 2. インナーコア — 元の線の色を保持 (元の色 + 同じ色のシャドウで「自発光」感)
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = (hs.width || 3) + 2;
        ctx.beginPath();
        hs.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Render the active uncommitted hand-drawn path
    if (isDrawingRef.current && currentPointsRef.current.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;

      if (strokeType === 'temporary') {
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([6, 4]);
      } else if (strokeType === 'dashed') {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      if (autoRouteActive && strokeType !== 'temporary') {
        ctx.globalAlpha = 0.5;
      }

      ctx.beginPath();
      currentPointsRef.current.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 4. Render spawn records as colored dots
    if (spawnRecords.length > 0 && !isWallMode) {
      const visibleFilter = spawnVisibleTypes;
      for (const s of spawnRecords) {
        if (s.floor !== floor) continue;
        if (visibleFilter && !visibleFilter.has(s.item)) continue;
        let color = SPAWN_ITEM_META[s.item]?.color ?? '#888';
        if (s.item === 'textcolor' && s.detail && TEXTCOLOR_DETAIL_META[s.detail as keyof typeof TEXTCOLOR_DETAIL_META]) {
          color = TEXTCOLOR_DETAIL_META[s.detail as keyof typeof TEXTCOLOR_DETAIL_META].color;
        }
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  const handlePopupMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) return;
    e.stopPropagation();
    if (!isEditMode) return;
    setIsDraggingPopup(true);
    setPopupDragStart({ x: e.clientX, y: e.clientY });
    setPopupOffsetStart(popupOffset);
  };

  const getPopupStyle = (m: HeistMarker, offset: Point, w: number, h: number, color: string): React.CSSProperties => {
    return {
      position: 'absolute',
      left: `${m.x + offset.x}px`,
      top: `${m.y + offset.y}px`,
      width: `${w}px`,
      ...(h > 0 ? { height: `${h}px`, maxHeight: `${h}px` } : {}),
      transform: `translate(-50%, -50%) scale(${Math.min(3, 1 / zoom)})`,
      transformOrigin: 'center center',
      zIndex: 1000,
      cursor: isEditMode ? 'move' : 'default',
      ['--theme-color' as any]: color
    } as React.CSSProperties;
  };

  const getDistanceToSegment = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    
    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;
    return Math.hypot(p.x - closestX, p.y - closestY);
  };

  const getDistanceToStroke = (p: Point, stroke: DrawingStroke) => {
    let minDistance = Infinity;
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const dist = getDistanceToSegment(p, stroke.points[i], stroke.points[i + 1]);
      if (dist < minDistance) minDistance = dist;
    }
    return minDistance;
  };

  const getCanvasCoords = (e: { clientX: number; clientY: number }): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1600;
    const y = ((e.clientY - rect.top) / rect.height) * 4550;
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Touch state for pinch-zoom
  const touchStartRef = useRef<{ dist: number; zoom: number; pan: Point; midX: number; midY: number } | null>(null);
  const touchDragRef = useRef<{ id: number; startX: number; startY: number } | null>(null);

  const toFakeMouse = (t: React.Touch) => ({
    clientX: t.clientX, clientY: t.clientY, button: 0,
    preventDefault: () => {}, shiftKey: false
  } as React.MouseEvent<HTMLDivElement>);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const wrapper = wrapperRef.current;
      const wRect = wrapper?.getBoundingClientRect();
      const wLeft = wRect ? wRect.left : 0;
      const wTop = wRect ? wRect.top : 0;
      touchStartRef.current = {
        dist: Math.sqrt(dx * dx + dy * dy),
        zoom,
        pan: { x: animPanRef.current.x, y: animPanRef.current.y },
        midX: midX - wLeft,
        midY: midY - wTop
      };
      return;
    }
    if (e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      touchDragRef.current = { id: t.identifier, startX: t.clientX, startY: t.clientY };
      handleMouseDown(toFakeMouse(t));
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      const ts = touchStartRef.current;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (ts.dist < 1 || !isFinite(dist / ts.dist)) return;
      const scale = dist / ts.dist;
      const newZoom = Math.max(0.1, Math.min(5, ts.zoom * scale));
      if (newZoom === ts.zoom) return;
      // アンカーは 2 本指の中点（wrapper 左上からの相対座標）。
      // ホイールと同じく transform-origin 定数 (800, 2275) を反映した二段階数式を使う。
      //   anchorX = (mapX - 800) * ts.zoom + ts.pan.x + 800
      //   => mapX = 800 + (anchorX - ts.pan.x - 800) / ts.zoom
      //   newPan.x = anchorX - 800 - (mapX - 800) * newZoom
      const anchorX = ts.midX;
      const anchorY = ts.midY;
      const mapX = 800 + (anchorX - ts.pan.x - 800) / ts.zoom;
      const mapY = 2275 + (anchorY - ts.pan.y - 2275) / ts.zoom;
      const newPanX = anchorX - 800 - (mapX - 800) * newZoom;
      const newPanY = anchorY - 2275 - (mapY - 2275) * newZoom;
      animZoomRef.current = newZoom;
      animPanRef.current = { x: newPanX, y: newPanY };
      targetZoomRef.current = newZoom;
      targetPanRef.current = { x: newPanX, y: newPanY };
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
      return;
    }
    if (e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      handleMouseMove(toFakeMouse(t));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartRef.current = null;
    }
    if (e.touches.length === 0) {
      touchDragRef.current = null;
      handleMouseUp();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Middle-click (wheel button) overrides everything and starts panning
    if (e.button === 1) {
      e.preventDefault();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return;

    if (!isEditMode) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // When popover is open, allow panning freely so the user can navigate the
    // map to set a scroll target. Block placing new markers or drawing.
    if (activeNoteMarkerId) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const isPanTool = toolMode === 'move' || e.shiftKey;
    const isLockedPresentation = !isEditMode && !isPanTool && (
      toolMode !== 'draw' && toolMode !== 'erase' && (
        toolMode !== 'add-marker' || !activeMarkerType || !isIndiv(activeMarkerType)
      )
    );

    if (isPanTool || isLockedPresentation) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const coords = getCanvasCoords(e);

    // 距離計測モード: クリックで線を選択 (Alt で累積追加、通常クリックで置き換え)
    if (toolMode === 'measure' && isEditMode) {
      const HIT_THRESHOLD = 16;
      let bestIdx = -1;
      let bestDist = HIT_THRESHOLD;
      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (!s || !s.points || s.points.length < 2 || s.type === 'temporary') continue;
        const d = getDistanceToStroke(coords, s);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        if (e.altKey) {
          // Alt: 常に追加
          setHighlightedStrokeIdxs(prev => {
            const next = new Set(prev);
            next.add(bestIdx);
            onMeasureSelectedStrokeIdxsChange?.(next);
            return next;
          });
        } else {
          // 通常: クリックした線だけにする (置き換え)
          const next = new Set([bestIdx]);
          setHighlightedStrokeIdxs(next);
          onMeasureSelectedStrokeIdxsChange?.(next);
        }
      } else if (!e.altKey) {
        // 空所クリック (Alt なし): クリア
        setHighlightedStrokeIdxs(new Set());
        onMeasureSelectedStrokeIdxsChange?.(new Set());
      }
      // Alt 押下時の空所クリック → 何もせず前のセットを保持
      return;
    }

    // 線分編集モード: クリックで線を選択 (Alt で複数追加、通常クリックで置き換え)
    // - クリック位置に近い線が HIT_THRESHOLD 以内ならその線をトグル/置換
    // - 空所クリックでドラッグ開始 (矩形ラバーバンド選択)。
    //   MouseMove で矩形を更新、MouseUp で矩形内の全線を Alt の有無に応じて追加/置換
    if (toolMode === 'edit-stroke' && isEditMode) {
      const HIT_THRESHOLD = 16;
      let bestIdx = -1;
      let bestDist = HIT_THRESHOLD;
      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (!s || !s.points || s.points.length < 2 || s.type === 'temporary') continue;
        const d = getDistanceToStroke(coords, s);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        // ヒットした: クリック選択 (矩形ドラッグは開始しない)
        // Alt: 常に「追加」 (トグルではなく累積)
        if (e.altKey) {
          const base = editStrokeIdxs ?? new Set<number>();
          const next = new Set(base);
          next.add(bestIdx);
          onEditStrokeIdxsChange?.(next);
        } else {
          onEditStrokeIdxsChange?.(new Set([bestIdx]));
        }
      } else {
        // 空所クリック: 矩形ラバーバンドの起点に。
        // Alt 押下時は既存選択に追加、空所ドラッグで累積選択。
        // 通常時は既存選択をリセットして新規矩形選択に備える。
        if (!e.altKey) {
          onEditStrokeIdxsChange?.(new Set());
        }
        setEditRect({ start: coords, end: coords, pressedAlt: !!e.altKey });
      }
      return;
    }

    if (toolMode === 'add-marker' && activeMarkerType) {
      if (!isLocal && !isIndiv(activeMarkerType)) {
        return;
      }
      if (markers.length >= 500) {
        return;
      }
      const newMarker: HeistMarker = {
        id: `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: activeMarkerType,
        x: coords.x,
        y: coords.y,
        note: activeMarkerType === 'vault' ? 'マルチドロップポイント' :
              activeMarkerType === 'eh' ? 'エターナルハート発見地点' :
              activeMarkerType === 'cardkey' ? 'カードキー発見ポイント' :
              activeMarkerType === 'start' ? 'スタート' : '',
        floor: floor
      };
      if (activeMarkerType === 'eh') {
        newMarker.ehHighRate = false;
      }
      if (activeMarkerType === 'cardkey') {
        newMarker.cardkeyHighRate = false;
      }
      if (activeMarkerType === 'warp' || activeMarkerType === 'iwarp' || activeMarkerType === 'stairs') {
        newMarker.warpWaypoints = [];
      }
      if (activeMarkerType === 'info') {
        newMarker.mediaItems = [];
        newMarker.infoExpanded = false;
      }
      if (activeMarkerType === 'text') {
        newMarker.textColor = '#ffffff';
        newMarker.textSize = 14;
      }
      if (activeMarkerType === 'boss') {
        newMarker.bossDrops = [];
        newMarker.bossDurationSeconds = 60;
        newMarker.bossExpanded = false;
      }
      if (activeMarkerType === 'battle' || activeMarkerType === 'gbattle') {
        newMarker.battleDurationSeconds = 20;
        newMarker.battleExpanded = false;
      }
      if (activeMarkerType === 'picking' || activeMarkerType === 'gpicking') {
        newMarker.pickingDurationSeconds = 5;
        newMarker.pickingExpanded = false;
      }
      if (activeMarkerType === 'long_picking' || activeMarkerType === 'glong_picking') {
        newMarker.longPickingDurationSeconds = 8;
        newMarker.pickingExpanded = false;
      }
      if (activeMarkerType === 'skill_cd') {
        // スキルCDマーカー: プリセット未選択で配置 (アイコンは 'S')。
        // 配置後にマーカー詳細設定でプリセットを選ぶと、その値 (色/名前/モード/CD秒数) が反映される。
        newMarker.skillPresetId = undefined;
        newMarker.skillLabel = '';
        newMarker.skillColor = MARKER_META.skill_cd.color;
        newMarker.skillMode = 'fixed';
        newMarker.skillCdSeconds = 0;
        newMarker.skillPerSecondCd = 0;
        newMarker.note = '';
      }
      onMarkersChange([...markers, newMarker], true);
      // If a real start marker is placed, remove the auto-placed dummy
      if (activeMarkerType === 'start' && autoStartMarker && onAutoStartMarkerChange) {
        onAutoStartMarkerChange(null);
      }
      setActiveNoteMarkerId(newMarker.id);
      setNoteText(newMarker.note);
      setBossDrops([]);
      setBossDurationSeconds(60);
      setBattleDurationSeconds(20);
      setPickingDurationSeconds(5);
      setLongPickingDurationSeconds(7);
      setPickingPicky(false);
      setEhHighRate(false);
      setCardkeyHighRate(false);
      setCustomDropInput('');
      setUseBattleCustomDuration(false);
      setBattleCustomDurationVal(20);
      setUsePickingCustomDuration(false);
      setPickingCustomDurationVal(5);
      setUseLongPickingCustomDuration(false);
      setLongPickingCustomDurationVal(7);
      setCheckpointTargetTime(60);
      setCheckpointSoundOn(false);
      setCheckpointVoiceOn(false);
      setSkillCdColor(MARKER_META.skill_cd.color);
      setSkillCdMode('fixed');
      setSkillCdSeconds(0);
      setSkillCdPerSecondRate(0);
      return;
    }

    if (toolMode === 'add-spawn' && isEditMode) {
      if (spawnToolMode === 'place' && onSpawnAdd) {
        onSpawnAdd(coords.x, coords.y);
      } else if (spawnToolMode === 'edit' && onSpawnEdit) {
        const HIT = 10;
        let bestId: string | null = null;
        let bestDist = HIT;
        for (const s of spawnRecords) {
          if (s.floor !== floor) continue;
          const d = Math.hypot(s.x - coords.x, s.y - coords.y);
          if (d < bestDist) { bestDist = d; bestId = s.id; }
        }
        if (bestId) onSpawnEdit(bestId);
      } else if (spawnToolMode === 'erase' && onSpawnDelete) {
        const HIT = 10;
        let bestId: string | null = null;
        let bestDist = HIT;
        for (const s of spawnRecords) {
          if (s.floor !== floor) continue;
          const d = Math.hypot(s.x - coords.x, s.y - coords.y);
          if (d < bestDist) { bestDist = d; bestId = s.id; }
        }
        if (bestId) onSpawnDelete(bestId);
      }
      return;
    }

    if (toolMode === 'draw') {
      setIsDrawing(true);
      isDrawingRef.current = true;
      setCurrentPoints([coords]);
      return;
    }

    if (toolMode === 'erase') {
      unifiedEraseAtPoint(coords, e.altKey);
      setIsDrawing(true);
      return;
    }

    if (toolMode === 'draw-wall') {
      setIsDrawing(true);
      setCurrentPoints([coords]);
      return;
    }

    if (toolMode === 'erase-wall') {
      setIsDrawing(true);
      eraseWallsAtPoint(coords);
      return;
    }

    if (toolMode === 'toggle-vis') {
      toggledIdsRef.current = new Set();
      toggleVisibilityAtPoint(coords);
      setIsDrawing(true);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasCoords(e);

    // Fast-path: if actively drawing or erasing, handle only that and return immediately
    // to bypass heavy dragging/collision checks on every single mousemove event.
    if (isDrawing && (toolMode === 'draw' || toolMode === 'erase' || toolMode === 'draw-wall' || toolMode === 'erase-wall' || toolMode === 'toggle-vis')) {
      // 45-degree angle snap logic when Alt key is pressed during straight lines
      let effectiveCoords = coords;
      if (e.altKey && currentPoints.length > 0 && (toolMode === 'draw-wall' || (toolMode === 'draw' && drawMode === 'straight'))) {
        const startPt = currentPoints[0];
        const dx = coords.x - startPt.x;
        const dy = coords.y - startPt.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 1) {
          // Calculate angle in radians, snap to closest 45 degrees (PI / 4)
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          
          effectiveCoords = {
            x: Math.round(startPt.x + dist * Math.cos(snappedAngle)),
            y: Math.round(startPt.y + dist * Math.sin(snappedAngle))
          };
        }
      }

      if (toolMode === 'draw') {
        if (drawMode === 'straight') {
          setCurrentPoints([currentPoints[0], effectiveCoords]);
          redrawStrokes(undefined, true);
          return;
        }

        const newPoints = [...currentPoints, coords];
        setCurrentPoints(newPoints);
        redrawStrokes(undefined, true);
        return;
      }
      if (toolMode === 'erase') {
        unifiedEraseAtPoint(coords, e.altKey);
        return;
      }
      if (toolMode === 'draw-wall') {
        setCurrentPoints([currentPoints[0], effectiveCoords]);
        return;
      }
      if (toolMode === 'erase-wall') {
        eraseWallsAtPoint(coords);
        return;
      }
      if (toolMode === 'toggle-vis') {
        toggleVisibilityAtPoint(coords);
        return;
      }
      return;
    }

    if (isPanning) {
      const nextPan = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      };
      targetPanRef.current = nextPan;
      setPan(nextPan);
      return;
    }

    // 線分編集モード: ラバーバンド矩形を更新中
    if (toolMode === 'edit-stroke' && isEditMode && editRect) {
      setEditRect(prev => prev ? { ...prev, end: coords } : prev);
      return;
    }

    if (isDraggingPopup) {
      const dx = (e.clientX - popupDragStart.x) / zoom;
      const dy = (e.clientY - popupDragStart.y) / zoom;
      setPopupOffset({
        x: Math.round(popupOffsetStart.x + dx),
        y: Math.round(popupOffsetStart.y + dy)
      });
      return;
    }

    if (draggingWaypoint) {
      const dm = markers.find(mk => mk.id === draggingWaypoint.markerId);
      const isIndivWarp = dm && isIndiv(dm.type);
      const canEditWaypoint = isEditMode && (isLocal ? true : isIndivWarp);
      if (canEditWaypoint) {
        // EDIT GUARD: ドラッグ中の waypoint が現在の markers に居ることを確認。
        // stale な参照なら no-op (App 側の mergeOrUpdate は無いものを保持する)。
        if (!dm) {
          console.warn('[edit guard] dragging waypoint marker not found, skipping', draggingWaypoint.markerId);
          return;
        }
        onMarkersChange(
          markers.map(mk => {
            if (dm) {
              const conn = getWarpConnectionInfo(dm, markers);
              if (conn.hasLink && conn.primary && conn.partner) {
                if (mk.id === conn.primary.id) {
                  const nextWaypoints = conn.primary.warpWaypoints
                    ? conn.primary.warpWaypoints.filter((wp): wp is Point => wp !== null && wp !== undefined)
                    : [];
                  const targetIdx = conn.isReversed
                    ? nextWaypoints.length - 1 - draggingWaypoint.index
                    : draggingWaypoint.index;

                  nextWaypoints[targetIdx] = {
                    x: Math.max(0, Math.min(1600, coords.x)),
                    y: Math.max(0, Math.min(4550, coords.y))
                  };
                  return { ...mk, warpWaypoints: nextWaypoints };
                } else if (conn.isMutuallyLinked && mk.id === conn.partner.id && mk.id !== conn.primary.id) {
                  return { ...mk, warpWaypoints: [] };
                }
              }
            }
            if (mk.id === draggingWaypoint.markerId && mk.warpWaypoints) {
              const nextWaypoints = mk.warpWaypoints.filter((wp): wp is Point => wp !== null && wp !== undefined);
              nextWaypoints[draggingWaypoint.index] = {
                x: Math.max(0, Math.min(1600, coords.x)),
                y: Math.max(0, Math.min(4550, coords.y))
              };
              return { ...mk, warpWaypoints: nextWaypoints };
            }
            return mk;
          })
        );
      }
      return;
    }

    if (draggingMarkerId) {
      const marker = markers.find(m => m.id === draggingMarkerId);
      const isIndivMarker = marker && isIndiv(marker.type);
      const canDrag = isEditMode && (isLocal ? true : isIndivMarker);
      if (canDrag) {
        // EDIT GUARD: ドラッグ対象が現在の markers リストに居ることを確認。
        // 万一 stale な参照 (直前の state で削除済み等) なら no-op。
        // mergeOrUpdate 側で既存マーカーは保持されるので、ここでは単に
        // 「この ID の更新だけ反映する」形にすれば十分。
        if (!marker) {
          console.warn('[edit guard] dragging marker not found in current snapshot, skipping', draggingMarkerId);
          return;
        }
        if (marker.textFixedPosition) {
          const targetX = e.clientX - dragStartOffset.x;
          const targetY = e.clientY - dragStartOffset.y;
          // Subtract the display offset to store the pane-closed base position.
          const offset = computePaneOffset(marker);
          onMarkersChange(
            markers.map(m => {
              if (m.id === draggingMarkerId) {
                return { ...m, x: Math.round(targetX - offset), y: Math.round(targetY) };
              }
              return m;
            })
          );
        } else {
          const targetX = Math.max(0, Math.min(1600, coords.x - dragStartOffset.x));
          const targetY = Math.max(0, Math.min(4550, coords.y - dragStartOffset.y));
          onMarkersChange(
            markers.map(m => {
              if (m.id === draggingMarkerId) {
                return { ...m, x: targetX, y: targetY };
              }
              return m;
            })
          );
        }
      }
      return;
    }

  };

  const handleMouseUp = () => {
    setIsPanning(false);
    // 線分編集: ラバーバンド矩形による選択確定
    if (toolMode === 'edit-stroke' && isEditMode && editRect) {
      const r = editRect;
      const xMin = Math.min(r.start.x, r.end.x);
      const xMax = Math.max(r.start.x, r.end.x);
      const yMin = Math.min(r.start.y, r.end.y);
      const yMax = Math.max(r.start.y, r.end.y);
      // 矩形内に「線分が一部でも入っていれば」採用 (BBox ヒットテスト)
      const inRect: number[] = [];
      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (!s || !s.points || s.points.length < 2) continue;
        let hits = false;
        for (const p of s.points) {
          if (p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax) { hits = true; break; }
        }
        if (hits) inRect.push(i);
      }
      const base = editStrokeIdxs ?? new Set<number>();
      const next = r.pressedAlt ? new Set(base) : new Set<number>();
      // Alt 押下時はトグルせず常に追加。通常時は矩形内だけで置換。
      for (const idx of inRect) {
        next.add(idx);
      }
      onEditStrokeIdxsChange?.(next);
      setEditRect(null);
    }
    if (draggingWaypoint) {
      if (onMarkersDragEnd) onMarkersDragEnd();
      setDraggingWaypoint(null);
      return;
    }
    if (draggingMarkerId) {
      if (onMarkersDragEnd) onMarkersDragEnd();
      setDraggingMarkerId(null);
    }
    if (isDraggingPopup) {
      setIsDraggingPopup(false);
      return;
    }
    if (isDrawing) {
      setIsDrawing(false);
      isDrawingRef.current = false;
      if (toolMode === 'toggle-vis') {
        toggledIdsRef.current.clear();
      }
      if (toolMode === 'erase') {
        erasedMarkerIdsRef.current.clear();
      }
      if (toolMode === 'draw-wall' && currentPoints.length === 2) {
        let p1 = currentPoints[0];
        let p2 = currentPoints[1];
        const SNAP_WALL_THRESHOLD = 8;

        const getClosestPointOnSegment = (p: Point, a: Point, b: Point) => {
          const abx = b.x - a.x;
          const aby = b.y - a.y;
          const l2 = abx * abx + aby * aby;
          if (l2 === 0) return { point: a, dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
          let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
          t = Math.max(0, Math.min(1, t));
          const h = { x: a.x + t * abx, y: a.y + t * aby };
          return { point: h, dist: Math.hypot(p.x - h.x, p.y - h.y), t };
        };

        let activeWalls = walls.map(w => [{ ...w[0] }, { ...w[1] }] as [Point, Point]);

        const snapAndAlignOldPoints = (pt: Point): Point => {
          let bestPt = pt;
          let bestDist = SNAP_WALL_THRESHOLD;
          let snapType = 'none';
          let targetWallIdx = -1;
          let targetPtIdx = -1;

          // 1. Scan endpoint snap first
          for (let i = 0; i < activeWalls.length; i++) {
            const w = activeWalls[i];
            for (let j = 0; j < 2; j++) {
              const c = w[j];
              const d = Math.hypot(c.x - pt.x, c.y - pt.y);
              if (d < bestDist) {
                bestDist = d;
                bestPt = c;
                snapType = 'endpoint';
                targetWallIdx = i;
                targetPtIdx = j;
              }
            }
          }

          // 2. Scan T-junction intersection if no endpoint snap
          if (snapType === 'none') {
            for (let i = 0; i < activeWalls.length; i++) {
              const w = activeWalls[i];
              const { point, dist, t } = getClosestPointOnSegment(pt, w[0], w[1]);
              if (dist < bestDist) {
                bestDist = dist;
                bestPt = point;
                if (t > 0.01 && t < 0.99) {
                  snapType = 'midpoint';
                  targetWallIdx = i;

                }
              }
            }
          }

          // Align coordinates to the newest point
          if (snapType === 'endpoint' && targetWallIdx >= 0 && targetPtIdx >= 0) {
            activeWalls[targetWallIdx][targetPtIdx] = { ...pt };
            return pt;
          } else if (snapType === 'midpoint' && targetWallIdx >= 0) {
            const w = activeWalls[targetWallIdx];
            activeWalls.splice(targetWallIdx, 1, [w[0], { ...pt }], [{ ...pt }, w[1]]);
            return pt;
          }
          return bestPt;
        };

        p1 = snapAndAlignOldPoints(p1);
        p2 = snapAndAlignOldPoints(p2);

        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 1) {
          const merged = mergeWalls([...activeWalls, [p1, p2]], [p1, p2]);
          onWallsChange?.(merged);
        }
      }
      if (toolMode === 'draw' && currentPoints.length >= 2) {
        let points = currentPoints;
        
        // Apply 3-point moving average smoothing ONLY for 'smooth' mode on MouseUp
        if (drawMode === 'smooth' && points.length >= 3) {
          const smoothed: Point[] = [points[0]];
          for (let idx = 1; idx < points.length - 1; idx++) {
            const prev = points[idx - 1];
            const curr = points[idx];
            const next = points[idx + 1];
            smoothed.push({
              x: Math.round((prev.x + curr.x * 2 + next.x) / 4),
              y: Math.round((prev.y + curr.y * 2 + next.y) / 4)
            });
          }
          smoothed.push(points[points.length - 1]);
          points = smoothed;
        }

        // 補正後・接続前のポイント列を保持
        const originalPoints = points.map(p => ({ x: p.x, y: p.y }));
        // Snap endpoints of solid (route) lines to nearby existing solid line endpoints
        // to maintain a connected route network.
        if (strokeType === 'solid') {
          const SNAP_THRESHOLD = drawMode === 'straight' ? 12 : 6;
          const first = points[0];
          const last = points[points.length - 1];
          const snap = (pt: Point): Point => {
            let best = pt;
            let bestDist = SNAP_THRESHOLD;
            for (const s of strokes) {
              if (s.type === 'dashed') continue;
              if (s.points.length < 2) continue;
              const candidates = [s.points[0], s.points[s.points.length - 1]];
              for (const c of candidates) {
                const d = Math.hypot(c.x - pt.x, c.y - pt.y);
                if (d < bestDist) {
                  bestDist = d;
                  best = c;
                }
              }
            }
            return best;
          };
          const snappedFirst = snap(first);
          const snappedLast = snap(last);
          points = [
            snappedFirst,
            ...points.slice(1, -1),
            snappedLast
          ];
        }
        const newStroke: DrawingStroke = {
          points,
          color: strokeColor,
          width: strokeWidth,
          type: strokeType,
          originalPoints
        };
        onStrokesChange([...strokes, newStroke]);
      }
      setCurrentPoints([]);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      redrawStrokes(undefined, true);
    }
  };

  const eraseStrokesAtPoint = (pt: Point, isAltPressed: boolean = false, lineTypeFilter: 'all' | 'solid' | 'dashed' = 'all') => {
    // Alt 動作: デフォルトが normal なら Alt で split、split なら Alt で normal
    const effectiveSplit = eraseDefaultBehavior === 'split' ? !isAltPressed : isAltPressed;
    // 共通の閾値(マーカーサイズ)を使用。normal/split とも同じ半径で判定する。
    const threshold = eraseSize;

    if (effectiveSplit) {
      let anySplit = false;
      const nextStrokes: DrawingStroke[] = [];

      strokes.forEach(stroke => {
        if (lineTypeFilter === 'solid' && stroke.type !== 'solid') {
          nextStrokes.push(stroke);
          return;
        }
        if (lineTypeFilter === 'dashed' && stroke.type !== 'dashed') {
          nextStrokes.push(stroke);
          return;
        }
        const groups: Point[][] = [];
        let currentGroup: Point[] = [];

        stroke.points.forEach(p => {
          const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
          if (dist > threshold) {
            currentGroup.push(p);
          } else {
            if (currentGroup.length >= 2) {
              groups.push(currentGroup);
            }
            currentGroup = [];
            anySplit = true;
          }
        });

        if (currentGroup.length >= 2) {
          groups.push(currentGroup);
        }

        if (groups.length > 0) {
          groups.forEach(group => {
            nextStrokes.push({
              ...stroke,
              points: group,
              // 部分削除で残った区間は「現在の長さ」を距離計測の基準にする
              // (元の originalPoints は線全体の長さなので、分割後の points に揃える)
              originalPoints: group,
            });
          });
        }
      });

      if (anySplit) {
        onStrokesChange(nextStrokes);
      }
    } else {
      const filteredStrokes = strokes.filter(stroke => {
        if (lineTypeFilter === 'solid' && stroke.type !== 'solid') return true;
        if (lineTypeFilter === 'dashed' && stroke.type !== 'dashed') return true;
        const dist = getDistanceToStroke(pt, stroke);
        return dist > threshold;
      });
      if (filteredStrokes.length !== strokes.length) {
        onStrokesChange(filteredStrokes);
      }
    }
  };



  const mergeWalls = (rawWalls: [Point, Point][], newestWall?: [Point, Point]): [Point, Point][] => {
    if (rawWalls.length < 2) return rawWalls;
    const list = rawWalls.map(w => [{ ...w[0] }, { ...w[1] }] as [Point, Point]);
    const priorityPoints: Point[] = newestWall ? [newestWall[0], newestWall[1]] : [];
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const w1 = list[i];
          const w2 = list[j];
          const matchThreshold = 1.5; // allow tiny snaps
          let pStart = w1[0];
          let pMid1 = w1[1];
          let pMid2 = w2[0];
          let pEnd = w2[1];
          let connected = false;

          if (Math.hypot(w1[1].x - w2[0].x, w1[1].y - w2[0].y) < matchThreshold) {
            pStart = w1[0]; pMid1 = w1[1]; pMid2 = w2[0]; pEnd = w2[1];
            connected = true;
          } else if (Math.hypot(w1[1].x - w2[1].x, w1[1].y - w2[1].y) < matchThreshold) {
            pStart = w1[0]; pMid1 = w1[1]; pMid2 = w2[1]; pEnd = w2[0];
            connected = true;
          } else if (Math.hypot(w1[0].x - w2[0].x, w1[0].y - w2[0].y) < matchThreshold) {
            pStart = w1[1]; pMid1 = w1[0]; pMid2 = w2[0]; pEnd = w2[1];
            connected = true;
          } else if (Math.hypot(w1[0].x - w2[1].x, w1[0].y - w2[1].y) < matchThreshold) {
            pStart = w1[1]; pMid1 = w1[0]; pMid2 = w2[1]; pEnd = w2[0];
            connected = true;
          }

          if (connected) {
            const cross = (pMid1.x - pStart.x) * (pEnd.y - pMid2.y) - (pMid1.y - pStart.y) * (pEnd.x - pMid2.x);
            const len1 = Math.hypot(pMid1.x - pStart.x, pMid1.y - pStart.y);
            const len2 = Math.hypot(pEnd.x - pMid2.x, pEnd.y - pMid2.y);
            const isParallel = Math.abs(cross) / Math.max(1, len1 * len2) < 0.05;
            const dot = (pMid1.x - pStart.x) * (pEnd.x - pMid2.x) + (pMid1.y - pStart.y) * (pEnd.y - pMid2.y);

            if (isParallel && dot > 0) {
              const snapToPriority = (pt: Point): Point => {
                for (const p of priorityPoints) {
                  if (Math.hypot(p.x - pt.x, p.y - pt.y) < matchThreshold + 1) {
                    return p;
                  }
                }
                return pt;
              };
              const finalStart = snapToPriority(pStart);
              const finalEnd = snapToPriority(pEnd);
              list[i] = [finalStart, finalEnd];
              list.splice(j, 1);
              merged = true;
              break;
            }
          }
        }
        if (merged) break;
      }
    }
    return list;
  };

  const eraseWallsAtPoint = (pt: Point) => {
    const r = eraseSize;
    const remaining = walls.filter(w => {
      return getDistanceToSegment(pt, w[0], w[1]) > r;
    });
    if (remaining.length !== walls.length) {
      onWallsChange?.(mergeWalls(remaining));
    }
  };

  // 指定点でマーカーを削除 (グローバル or 個人ピン)
  const eraseMarkersAtPoint = (pt: Point, threshold?: number) => {
    const r = threshold ?? eraseSize;
    const toErase: string[] = [];
    markers.forEach(m => {
      if (m.floor !== floor) return;
      if (m.type === 'start') return;
      if (erasedMarkerIdsRef.current.has(m.id)) return;
      const dist = Math.hypot(m.x - pt.x, m.y - pt.y);
      if (dist <= r) {
        toErase.push(m.id);
      }
    });
    if (toErase.length === 0) return;
    toErase.forEach(id => erasedMarkerIdsRef.current.add(id));
    const isIndivType = (type: string) =>
      ['start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'].includes(type);
    const remaining = markers
      .filter(m => !toErase.includes(m.id) && !erasedMarkerIdsRef.current.has(m.id))
      .map(m => {
        if (m.linkedWarpId && (toErase.includes(m.linkedWarpId) || erasedMarkerIdsRef.current.has(m.linkedWarpId))) {
          const { linkedWarpId, ...rest } = m;
          return rest;
        }
        return m;
      });
    const removedGlobalIds = toErase.filter(id => {
      const m = markers.find(x => x.id === id);
      return m && !isIndivType(m.type);
    });
    if (removedGlobalIds.length > 0) {
      // グローバルマーカーも一緒に削除。App 側の updateMarkers を経由するのが
      // 正攻法だが、ここは drag 連続呼び出しのため onMarkersChange を直接呼ぶ
      // (App 側 updateMarkers は isDelete=true 相当の動作)。
      onMarkersChange(remaining, true, { isDelete: true });
    } else {
      onMarkersChange(remaining, true, { isDelete: true });
    }
    if (activeNoteMarkerId && toErase.includes(activeNoteMarkerId)) {
      setActiveNoteMarkerId(null);
    }
  };

  const toggledIdsRef = useRef<Set<string>>(new Set());

  // 統合消しゴム: 対象(全部/マーカー/進行/分岐)に応じて
  // 線・マーカーをまとめて削除する。Alt キーはデフォルト挙動を
  // シフト(反転)させる。
  const unifiedEraseAtPoint = (pt: Point, isAltPressed: boolean) => {
    const lineTypeFilter: 'all' | 'solid' | 'dashed' =
      eraseTarget === 'route' ? 'solid' :
      eraseTarget === 'branch' ? 'dashed' : 'all';

    if (eraseTarget === 'all' || eraseTarget === 'route' || eraseTarget === 'branch') {
      eraseStrokesAtPoint(pt, isAltPressed, lineTypeFilter);
    }
    if (eraseTarget === 'all' || eraseTarget === 'marker') {
      eraseMarkersAtPoint(pt);
    }
  };

  const toggleVisibilityAtPoint = (pt: Point) => {
    if (!onToggleMarkerVisibility) return;
    const threshold = 20;
    markers.forEach(m => {
      if (m.floor !== floor) return;
      if (m.type === 'start') return;
      const dist = Math.hypot(m.x - pt.x, m.y - pt.y);
      if (dist <= threshold && !toggledIdsRef.current.has(m.id)) {
        toggledIdsRef.current.add(m.id);
        onToggleMarkerVisibility(m.id);
      }
    });
  };

  const handleMarkerMouseDown = (e: React.MouseEvent, m: HeistMarker) => {
    if (e.button === 1) return;

    // 表示切替モード: マーカー自身のドラッグを開始せず Canvas 側へイベントを
    // 透過させ、Canvas 側の toggleVisibilityAtPoint に処理を任せる
    // (mousedown/mousemove で順次 visibility がトグルされ、ポップアップも出ない)
    if (toolMode === 'toggle-vis') {
      return;
    }

    e.stopPropagation();

    const isIndivMarker = isIndiv(m.type);
    const canInteract = isEditMode && (isLocal ? true : (toolMode === 'erase' ? true : isIndivMarker));
    if (!canInteract) return;

    if (toolMode === 'erase') {
      if (!isLocal && !isIndivMarker) {
        // 個人表示モード（!isLocal）かつグローバルピン（!isIndivMarker）の場合：
        // 削除するのではなく、非表示にします。
        if (onHideGlobalMarker) {
          onHideGlobalMarker(m.id);
        }
      } else {
        // ローカル編集モードまたは個人ピンの場合：削除します。
        onMarkersChange(
          markers
            .filter(item => item.id !== m.id)
            .map(item => {
              if (item.linkedWarpId === m.id) {
                const { linkedWarpId, ...rest } = item;
                return rest;
              }
              return item;
            }),
          true,
          { isDelete: true }
        );
      }
      if (activeNoteMarkerId === m.id) {
        setActiveNoteMarkerId(null);
      }
      return;
    }

    const coords = getCanvasCoords(e as React.MouseEvent<HTMLElement>);
    if (onMarkersDragStart) onMarkersDragStart();
    setDraggingMarkerId(m.id);
    if (m.textFixedPosition) {
      const displayX = m.x + computePaneOffset(m);
      setDragStartOffset({ x: e.clientX - displayX, y: e.clientY - m.y });
    } else {
      setDragStartOffset({ x: coords.x - m.x, y: coords.y - m.y });
    }
  };

  const handleMarkerClick = (e: React.MouseEvent, m: HeistMarker) => {
    e.stopPropagation();

    // 表示切替モードではクリックでポップアップを開かず、ドラッグのみ許可する
    // (mousedown で draggingMarkerId は既に設定済み)
    if (toolMode === 'toggle-vis') {
      return;
    }

    // Click-to-link mode for warp/stairs
    if (warpLinkMode !== 'idle' && activeNoteMarkerId) {
      const source = markers.find(mk => mk.id === activeNoteMarkerId);
      if (source && (source.type === 'warp' || source.type === 'iwarp' || source.type === 'stairs')) {
        const isValidTarget = m.id !== source.id
          && (source.type === 'iwarp' || m.type === 'iwarp'
            ? (source.type === 'warp' || source.type === 'iwarp') && (m.type === 'warp' || m.type === 'iwarp')
            : m.type === source.type);
        if (isValidTarget) {
          const isBidirectional = warpLinkMode === 'selecting-bi';
          const partnerMarker = markers.find(mk => mk.id === m.id);
          const canBidirectional = isBidirectional
            && (!partnerMarker?.linkedWarpId || partnerMarker.linkedWarpId === source.id);
          onMarkersChange(
            markers.map(mk => {
              if (mk.id === source.id) {
                return { ...mk, linkedWarpId: m.id };
              }
              if (canBidirectional && mk.id === m.id) {
                return { ...mk, linkedWarpId: source.id };
              }
              return mk;
            }),
            true
          );
        }
      }
      setWarpLinkMode('idle');
      return;
    }

    const isPresenterModeForGlobal = !isEditMode;
    if (isPresenterModeForGlobal) {
      // Info toggle in presentation mode
      if (isInfoType(m.type)) {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, infoExpanded: !mk.infoExpanded } : mk)
        );
        return;
      }
      // Note toggle in presentation mode
      if (isNoteType(m.type)) {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, noteExpanded: !mk.noteExpanded } : mk)
        );
        return;
      }
      // Boss toggle in presentation mode
      if (m.type === 'boss') {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, bossExpanded: !mk.bossExpanded } : mk)
        );
        return;
      }
      // Battle global toggle in presentation mode
      if (m.type === 'gbattle') {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, battleExpanded: !mk.battleExpanded } : mk)
        );
        return;
      }
      // Picking / Long Picking toggle in presentation mode
      if (m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, pickingExpanded: !mk.pickingExpanded } : mk)
        );
        return;
      }
      // Phone toggle in presentation mode or external indiv edit mode
      if (m.type === 'phone') {
        if (!m.phoneLocked) {
          onMarkersChange(
            markers.map(mk => mk.id === m.id ? { ...mk, phoneActive: !mk.phoneActive } : mk)
          );
        }
        return;
      }
      // Checkpoint toggle in presentation mode
      if (m.type === 'checkpoint') {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, checkpointExpanded: !mk.checkpointExpanded } : mk)
        );
        return;
      }
      // Warp/stairs navigation: use partner's scrollConfig if available (manual setting priority)
      const isLinkable = m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs';
      if (isLinkable && m.linkedWarpId) {
        const partner = markers.find(mk => mk.id === m.linkedWarpId);
        if (partner) {
          // Set current position pointer to target warp/stairs
          setCurrentPosition({ x: partner.x, y: partner.y });

          if (partner.scrollConfig) {
            // Partner has manually-set scroll target → adjust for current viewport
            const adjusted = adjustScrollConfigForViewport(partner.scrollConfig);
            startSmoothScroll(
              { x: adjusted.x, y: adjusted.y },
              partner.scrollConfig.zoom
            );
          } else {
            // Fallback: calculate position from partner coordinates
            const wrapper = wrapperRef.current;
            if (wrapper) {
              const W_v = wrapper.clientWidth;
              const H_v = wrapper.clientHeight;
              const tgtZoom = zoom;
              const tgtPanX = W_v * 0.5 - 800 - (partner.x - 800) * tgtZoom;
              const tgtPanY = H_v * 0.6 - 2275 - (partner.y - 2275) * tgtZoom;
              startSmoothScroll({ x: tgtPanX, y: tgtPanY }, tgtZoom);
            }
          }
        }
      } else if (isLinkable && m.scrollConfig) {
        const adjusted = adjustScrollConfigForViewport(m.scrollConfig);
        startSmoothScroll(
          { x: adjusted.x, y: adjusted.y },
          m.scrollConfig.zoom
        );
      }
      return;
    }

    // 個人編集モード: グローバルマーカーは表示トグルのみ（編集ポップアップを開かない）
    if (isEditMode && !isLocal && !isIndiv(m.type)) {
      const toggleExpanded = (field: string): HeistMarker => ({
        ...m,
        [field]: !(m as any)[field]
      });
      const isInfo = isInfoType(m.type);
      const isNote = isNoteType(m.type);
      if (isInfo || isNote || m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle'
        || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking'
        || m.type === 'checkpoint' || m.type === 'phone') {
        const field = isInfo ? 'infoExpanded' : isNote ? 'noteExpanded'
          : m.type === 'boss' ? 'bossExpanded'
          : m.type === 'battle' || m.type === 'gbattle' ? 'battleExpanded'
          : m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking' ? 'pickingExpanded'
          : m.type === 'phone' ? 'phoneActive'
          : 'checkpointExpanded';
        if (m.type === 'phone' && m.phoneLocked) return;
        onMarkersChange(markers.map(mk => mk.id === m.id ? toggleExpanded(field) : mk));
      }
      return;
    }

    // If popover is already open for a different marker, save that one first
    if (activeNoteMarkerId && activeNoteMarkerId !== m.id) {
      handleSaveNote();
    }
    setActiveNoteMarkerId(m.id);
    setNoteText(m.note);
    setInfoLabel(m.infoLabel || '');
    setTextColor(m.textColor || '#ffffff');
    setTextSize(m.textSize || 14);
    setTextScaleWithMap(!!m.textScaleWithMap);
    setTextFixedPosition(!!m.textFixedPosition);
    setTextTrackSide(m.trackSide || 'left');
    setTextDescription(m.textDescription || '');
    setTextTooltip(!!m.textTooltip);
    setTextGlow(!!m.textGlow);
    setBossDrops(m.bossDrops || []);
    setBossDescription(m.bossDescription || '');
    setBossDurationSeconds(m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60);
    setBattleDurationSeconds(m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20);
    setPickingDurationSeconds(m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5);
    setLongPickingDurationSeconds(m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 8);
    setPickingPicky(!!pickyMarkerIds[m.id]);
    setEhHighRate(!!m.ehHighRate);
    setCardkeyHighRate(!!m.cardkeyHighRate);
    setCustomDropInput('');

    // Load custom durations if it exists for Boss
    const hasBossCustom = bossCustomDurations && bossCustomDurations[m.id] !== undefined;
    setUseBossCustomDuration(hasBossCustom);
    setBossCustomDurationVal(hasBossCustom ? bossCustomDurations[m.id] : m.bossDurationSeconds || 60);

    // Load custom durations if it exists for Battle
    const hasBattleCustom = battleCustomDurations && battleCustomDurations[m.id] !== undefined;
    setUseBattleCustomDuration(hasBattleCustom);
    setBattleCustomDurationVal(hasBattleCustom ? battleCustomDurations[m.id] : m.battleDurationSeconds || 20);

    // Load custom durations if it exists for Picking
    const hasPickingCustom = pickingCustomDurations && pickingCustomDurations[m.id] !== undefined;
    setUsePickingCustomDuration(hasPickingCustom);
    setPickingCustomDurationVal(hasPickingCustom ? pickingCustomDurations[m.id] : m.pickingDurationSeconds || 5);

    // Load custom durations if it exists for Long Picking
    const hasLongPickingCustom = longPickingCustomDurations && longPickingCustomDurations[m.id] !== undefined;
    setUseLongPickingCustomDuration(hasLongPickingCustom);
    setLongPickingCustomDurationVal(hasLongPickingCustom ? longPickingCustomDurations[m.id] : m.longPickingDurationSeconds || 8);

    // Checkpoint fields
    setCheckpointTargetTime(m.checkpointTargetTime ?? 60);
    setCheckpointSoundOn(!!m.checkpointSoundOn);
    setCheckpointVoiceOn(m.checkpointVoiceOn !== false);

    // スキルCD編集用: 既存値 or プリセット既定値
    setSkillCdColor(m.skillColor || MARKER_META.skill_cd.color);
    setSkillCdMode(m.skillMode || 'fixed');
    setSkillCdSeconds(m.skillCdSeconds !== undefined ? m.skillCdSeconds : 0);
    setSkillCdPerSecondRate(m.skillPerSecondCd !== undefined ? m.skillPerSecondCd : 0);

    setPopupDirection(m.popupDirection || 'top');
    setPopupWidth(m.popupWidth || ((m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') ? 280 : 300));
    setPopupHeight(m.popupHeight || 0);
    setPopupOffset(m.popupOffset || { x: 0, y: -100 });
  };

  const handleZoom = (factor: number) => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    const prevZoom = animZoomRef.current;
    const prevPan = animPanRef.current;
    const newZoom = Math.max(0.1, Math.min(4, prevZoom * factor));
    if (!isFinite(newZoom) || prevZoom === newZoom) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      setZoom(newZoom);
      return;
    }
    const wRect = wrapper.getBoundingClientRect();
    const anchorX = wRect.width / 2;
    const anchorY = wRect.height / 2;
    const mapX = 800 + (anchorX - prevPan.x - 800) / prevZoom;
    const mapY = 2275 + (anchorY - prevPan.y - 2275) / prevZoom;
    const newPanX = anchorX - 800 - (mapX - 800) * newZoom;
    const newPanY = anchorY - 2275 - (mapY - 2275) * newZoom;
    animZoomRef.current = newZoom;
    animPanRef.current = { x: newPanX, y: newPanY };
    targetZoomRef.current = newZoom;
    targetPanRef.current = { x: newPanX, y: newPanY };
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const resetView = () => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    
    if (startupFocusMarkerId) {
      const marker = markersRef.current.find(m => m.id === startupFocusMarkerId);
      if (marker) {
        if (marker.scrollConfig) {
          const adjusted = adjustScrollConfigForViewport(marker.scrollConfig);
          startSmoothScroll({ x: adjusted.x, y: adjusted.y }, marker.scrollConfig.zoom);
        } else {
          const wrapper = wrapperRef.current;
          if (wrapper) {
            const W_v = wrapper.clientWidth;
            const H_v = wrapper.clientHeight;
            const tgtZoom = 2;
            const tgtPan = {
              x: W_v * 0.5 - 800 - (marker.x - 800) * tgtZoom,
              y: H_v * 0.6 - 2275 - (marker.y - 2275) * tgtZoom
            };
            startSmoothScroll(tgtPan, tgtZoom);
          }
        }
        return;
      }
    }
    startSmoothScroll({ x: 0, y: 0 }, 1);
  };

  const handleSaveNote = (closePanel = true) => {
    if (activeNoteMarkerId) {
      // 個人編集モード: グローバルマーカーの内容変更を保存しない
      const noteMarker = markers.find(m => m.id === activeNoteMarkerId);
      if (!isLocal && noteMarker && !isIndiv(noteMarker.type)) {
        if (closePanel) setActiveNoteMarkerId(null);
        return;
      }
      onMarkersChange(
        markers.map(m => {
          if (m.id === activeNoteMarkerId) {
            const updated = { 
              ...m, 
              note: noteText,
              popupDirection: popupDirection,
              popupOffset: popupOffset
            } as any;
            if (isInfoType(m.type) || m.type === 'boss') {
              updated.popupWidth = popupWidth;
              updated.popupHeight = popupHeight;
            }
            if (isInfoType(m.type)) {
              updated.infoLabel = infoLabel;
              // 旧 infoMediaUrl / infoMediaType は廃止
              delete updated.infoMediaUrl;
              delete updated.infoMediaType;
            }
            if (isTextType(m.type)) {
              updated.textColor = textColor;
              updated.textSize = textSize;
              updated.textScaleWithMap = textScaleWithMap;
              updated.textFixedPosition = textFixedPosition;
              updated.trackSide = textFixedPosition ? textTrackSide : undefined;
              updated.textDescription = textDescription;
              updated.textTooltip = textTooltip;
              updated.textGlow = textGlow;
            }
            if (m.type === 'boss') {
              updated.bossDrops = bossDrops;
              updated.bossDescription = bossDescription;
              updated.bossDurationSeconds = bossDurationSeconds;
              updated.checkpointSoundOn = checkpointSoundOn;
              updated.checkpointVoiceOn = checkpointVoiceOn;
            }
            if (m.type === 'battle' || m.type === 'gbattle') {
              updated.battleDurationSeconds = battleDurationSeconds;
            }
            if (m.type === 'picking' || m.type === 'gpicking') {
              updated.pickingDurationSeconds = pickingPicky ? 0 : pickingDurationSeconds;
            }
            if (m.type === 'long_picking' || m.type === 'glong_picking') {
              updated.longPickingDurationSeconds = pickingPicky ? 0 : longPickingDurationSeconds;
            }
            if (m.type === 'eh') {
              updated.ehHighRate = ehHighRate;
            }
            if (m.type === 'cardkey') {
              updated.cardkeyHighRate = cardkeyHighRate;
            }
            if (m.type === 'checkpoint') {
              updated.checkpointTargetTime = checkpointTargetTime;
              updated.checkpointSoundOn = checkpointSoundOn;
              updated.checkpointVoiceOn = checkpointVoiceOn;
            }
            if (m.type === 'skill_cd') {
              // ラベルは presetId からのみ導出 (テキスト入力欄は廃止)。
              // ユーザーが手動でラベルを変えたい場合はプリセットを再選択 or プリセット自体を編集する運用。
              updated.skillColor = skillCdColor;
              updated.skillMode = skillCdMode;
              updated.skillCdSeconds = skillCdSeconds;
              updated.skillPerSecondCd = skillCdPerSecondRate;
            }
            return updated;
          }
          return m;
        }),
        true
      );

      // Save custom duration override for Boss
      const marker = markers.find(m => m.id === activeNoteMarkerId);
      if (marker && marker.type === 'boss' && onBossCustomDurationChange) {
        if (useBossCustomDuration && bossCustomDurationVal !== undefined) {
          onBossCustomDurationChange(activeNoteMarkerId, bossCustomDurationVal);
        } else {
          onBossCustomDurationChange(activeNoteMarkerId, undefined as any);
        }
      }

      // Save custom duration override for Battle
      if (marker && (marker.type === 'battle' || marker.type === 'gbattle') && onBattleCustomDurationChange) {
        if (useBattleCustomDuration && battleCustomDurationVal !== undefined) {
          onBattleCustomDurationChange(activeNoteMarkerId, battleCustomDurationVal);
        } else {
          onBattleCustomDurationChange(activeNoteMarkerId, undefined as any);
        }
      }

      // Save custom duration override for Picking
      if (marker && (marker.type === 'picking' || marker.type === 'gpicking') && onPickingCustomDurationChange) {
        if (usePickingCustomDuration && pickingCustomDurationVal !== undefined) {
          onPickingCustomDurationChange(activeNoteMarkerId, pickingPicky ? 0 : pickingCustomDurationVal);
        } else {
          onPickingCustomDurationChange(activeNoteMarkerId, undefined as any);
        }
      }

      // Save custom duration override for Long Picking
      if (marker && (marker.type === 'long_picking' || marker.type === 'glong_picking') && onLongPickingCustomDurationChange) {
        if (useLongPickingCustomDuration && longPickingCustomDurationVal !== undefined) {
          onLongPickingCustomDurationChange(activeNoteMarkerId, pickingPicky ? 0 : longPickingCustomDurationVal);
        } else {
          onLongPickingCustomDurationChange(activeNoteMarkerId, undefined as any);
        }
      }

      // Save the plan-level picky override (used by the green highlight and
      // by the auto-route timing). Replaces the previous marker-level
      // `m.pickingPicky`, which incorrectly globalized the state for
      // gpicking/glong_picking pins.
      if (marker && (marker.type === 'picking' || marker.type === 'gpicking' || marker.type === 'long_picking' || marker.type === 'glong_picking') && onPickyMarkerChange) {
        onPickyMarkerChange(activeNoteMarkerId, pickingPicky);
      }

      if (closePanel) setActiveNoteMarkerId(null);
    }
  };

  const handleDeleteMarker = (id: string) => {
    onMarkersChange(
      markers
        .filter(m => m.id !== id)
        .map(m => {
          if (m.linkedWarpId === id) {
            const { linkedWarpId, ...rest } = m;
            return rest;
          }
          return m;
        }),
      true,
      { isDelete: true }
    );
    setActiveNoteMarkerId(null);
  };

  const handleSetScrollTarget = () => {
    if (activeNoteMarkerId) {
      // 個人編集モード: グローバルマーカーの scrollConfig を変更しない
      const noteMarker = markers.find(m => m.id === activeNoteMarkerId);
      if (!isLocal && noteMarker && !isIndiv(noteMarker.type)) return;
      const wrapper = wrapperRef.current;
      const vw = wrapper ? wrapper.clientWidth : undefined;
      const vh = wrapper ? wrapper.clientHeight : undefined;
      onMarkersChange(
        markers.map(m => m.id === activeNoteMarkerId ? {
          ...m,
          scrollConfig: { x: pan.x, y: pan.y, zoom: zoom, viewWidth: vw, viewHeight: vh }
        } : m),
        true
      );
    }
  };

  const handleClearScrollTarget = () => {
    if (activeNoteMarkerId) {
      // 個人編集モード: グローバルマーカーの scrollConfig を変更しない
      const noteMarker = markers.find(m => m.id === activeNoteMarkerId);
      if (!isLocal && noteMarker && !isIndiv(noteMarker.type)) return;
      onMarkersChange(
        markers.map(m => {
          if (m.id === activeNoteMarkerId) {
            return { ...m, scrollConfig: undefined };
          }
          return m;
        }),
        true
      );
    }
  };

  const activeNoteMarker = markers.find(m => m.id === activeNoteMarkerId);

  // 距離計測: ハイライト中の全線の計測値を算出 (補正後・接続前のポイント列で計算)
  const measureInfos = useMemo(() => {
    if (highlightedStrokeIdxs.size === 0) return [] as {
      strokeIdx: number;
      lengthPx: number;
      labelX: number;
      labelY: number;
    }[];
    const result: {
      strokeIdx: number;
      lengthPx: number;
      labelX: number;
      labelY: number;
    }[] = [];
    // 安定した表示順を確保するためインデックス昇順で処理
    const sortedIdxs = Array.from(highlightedStrokeIdxs).sort((a, b) => a - b);
    for (const idx of sortedIdxs) {
      if (idx < 0 || idx >= strokes.length) continue;
      const hs = strokes[idx];
      if (!hs || !hs.points || hs.points.length < 2) continue;
      // 補正後・接続前のポイント列を使う (なければ現在の points)
      const pts = (hs.originalPoints && hs.originalPoints.length >= 2)
        ? hs.originalPoints
        : hs.points;
      let length = 0;
      let lowerLeftIdx = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i > 0) {
          const prev = pts[i - 1];
          length += Math.hypot(p.x - prev.x, p.y - prev.y);
        }
        // 「左下」 = y が大きい方の中で x が小さい方
        if (p.y > pts[lowerLeftIdx].y || (p.y === pts[lowerLeftIdx].y && p.x < pts[lowerLeftIdx].x)) {
          lowerLeftIdx = i;
        }
      }
      const anchor = pts[lowerLeftIdx];
      result.push({
        strokeIdx: idx,
        lengthPx: Math.round(length),
        labelX: anchor.x,
        labelY: anchor.y,
      });
    }
    return result;
  }, [highlightedStrokeIdxs, strokes]);

  let cursorClass = '';
  if (toolMode === 'move' || !isEditMode) {
    cursorClass = isPanning ? 'grabbing' : 'grab';
  } else if (toolMode === 'measure') {
    cursorClass = 'measure-cursor';
  } else if (toolMode === 'edit-stroke') {
    cursorClass = 'edit-stroke-cursor';
  }

  const eraseCursorStyle = (toolMode === 'erase' || toolMode === 'erase-wall') && isEditMode
    ? { cursor: eraseCursorUrl }
    : undefined;

  return (
    <div
      className={`canvas-wrapper ${cursorClass}`}
      ref={wrapperRef}
      style={{ ...eraseCursorStyle, '--phone-hud-scale': phoneBoxHudSize / 100, '--zoom-hud-scale': zoomHudSize / 100 } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        handleMouseUp();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={(e) => {
        const coords = getCanvasCoords(e);
        setCurrentPosition(coords);
      }}
    >
      <div
        className="canvas-container"
        ref={containerRef}
        style={{
          width: '1600px',
          height: '4550px',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <div ref={svgWrapperRef} className="map-bg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          {customBg ? (
            <img src={customBg} alt="Reference blueprint" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', opacity: 1, zIndex: 1 }} />
          ) : PRESET_MAPS_META[floor].path ? (
            <img src={PRESET_MAPS_META[floor].path as string} alt="Reference blueprint" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: 1, zIndex: 1 }} />
          ) : null}
        </div>

        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          width={1600}
          height={4550}
        />

        {/* Walls visualization layer - Rendered on TOP (zIndex: 200) in Neon Orange (#ff5500) - Only visible in Wall editing mode */}
        {(toolMode === 'draw-wall' || toolMode === 'erase-wall') && ((walls && walls.length > 0) || (toolMode === 'draw-wall' && isDrawing && currentPoints.length === 2)) && (
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 200 }}
            viewBox="0 0 1600 4550"
          >
            {walls.map((w, idx) => (
              <line
                key={`wall-${idx}`}
                x1={w[0].x}
                y1={w[0].y}
                x2={w[1].x}
                y2={w[1].y}
                stroke="rgba(255, 85, 0, 0.85)"
                strokeWidth={5}
                strokeDasharray="6,4"
              />
            ))}
            {toolMode === 'draw-wall' && isDrawing && currentPoints.length === 2 && (
              <line
                x1={currentPoints[0].x}
                y1={currentPoints[0].y}
                x2={currentPoints[1].x}
                y2={currentPoints[1].y}
                stroke="#ff5500"
                strokeWidth={5}
                strokeDasharray="6,4"
              />
            )}
          </svg>
        )}

        {/* Warp & Stairs pair connector lines */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15 }}
          viewBox="0 0 1600 4550"
        >
          <defs>
            <marker 
              id="warp-arrow" 
              viewBox="0 0 10 10" 
              refX="18" // Offset to avoid overlapping the marker dot itself
              refY="5" 
              markerWidth="6" 
              markerHeight="6" 
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" />
            </marker>
            <marker 
              id="stairs-arrow" 
              viewBox="0 0 10 10" 
              refX="18" 
              refY="5" 
              markerWidth="4.5" 
              markerHeight="4.5" 
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="currentColor" />
            </marker>
          </defs>
          {markers
            .filter(m => (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.floor === floor)
            .map(m => {
              const conn = getWarpConnectionInfo(m, markers);
              if (!conn.hasLink || !conn.partner || !conn.primary) return null;

              // Draw only from the primary side to avoid duplicate overlapping lines
              if (m.id !== conn.primary.id) return null;

              const partner = conn.partner;
              const isMHidden = hiddenMarkers.includes(m.id);
              const isPartnerHidden = hiddenMarkers.includes(partner.id);
              if (!isEditMode && (isMHidden || isPartnerHidden)) return null;

              const isMutuallyLinked = m.linkedWarpId === partner.id && partner.linkedWarpId === m.id;

              const isWarp = m.type === 'warp' || m.type === 'iwarp';
              const color = m.connectionColor || partner.connectionColor || (isWarp ? warpColor : stairsColor);
              const strokeWidth = isWarp ? "2" : "1";
              const strokeDasharray = isWarp ? "6 4" : "3 3";
              const markerEnd = isWarp ? "url(#warp-arrow)" : "url(#stairs-arrow)";
              const markerStart = isMutuallyLinked ? (isWarp ? "url(#warp-arrow)" : "url(#stairs-arrow)") : undefined;
              const opacity = (isMHidden || isPartnerHidden) ? "0.15" : (isWarp ? "0.6" : "0.35");
              
              // primary has the source of truth warpWaypoints
              const effectiveWaypoints = (m.warpWaypoints || []).filter((wp): wp is Point => wp !== null && wp !== undefined);

              if (effectiveWaypoints.length > 0) {
                const pathD = `M ${m.x} ${m.y} ` + effectiveWaypoints.map(wp => `L ${wp.x} ${wp.y}`).join(' ') + ` L ${partner.x} ${partner.y}`;
                return (
                  <path
                    key={`warp-path-${m.id}`}
                    d={pathD}
                    fill="none"
                    stroke={color}
                    color={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    opacity={opacity}
                    markerStart={markerStart}
                    markerEnd={markerEnd}
                  />
                );
              }

              return (
                <line
                  key={`warp-line-${m.id}`}
                  x1={m.x} y1={m.y} x2={partner.x} y2={partner.y}
                  stroke={color}
                  color={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  opacity={opacity}
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                />
              );
            })
          }
          {/* Guide lines from pins to their corresponding draggable popups */}
          {zoom >= 0.25 && markers
            .filter(m => (isInfoType(m.type) || m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && m.floor === floor)
            .map(m => {
              const isHidden = hiddenMarkers.includes(m.id);
              if (isHidden && !isEditMode) return null;
              const meta = MARKER_META[m.type];
              const offset = (isEditMode && activeNoteMarkerId === m.id) ? popupOffset : m.popupOffset;
              if (!offset) return null;

              const isVisible = (isInfoType(m.type) && ((!isEditMode && m.infoExpanded) || (isEditMode && activeNoteMarkerId === m.id)))
                || (m.type === 'boss' && ((!isEditMode && m.bossExpanded) || (isEditMode && activeNoteMarkerId === m.id)))
                || ((m.type === 'battle' || m.type === 'gbattle') && ((!isEditMode && m.battleExpanded) || (isEditMode && activeNoteMarkerId === m.id)))
                || ((m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && ((!isEditMode && m.pickingExpanded) || (isEditMode && activeNoteMarkerId === m.id)));

              if (!isVisible) return null;

              const color = (m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') ? meta.color : '#4fc3f7';
              return (
                <line
                  key={`popup-connector-${m.id}`}
                  x1={m.x} y1={m.y}
                  x2={m.x + offset.x} y2={m.y + offset.y}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.8"
                />
              );
            })
          }
        </svg>

        <div className="markers-layer">
          {/* Detection range visualization (debug) — always on top */}
          {showDetectionRanges && (
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                overflow: 'visible',
                zIndex: 100
              }}
            >
              {markers.filter(m => m.floor === floor).map(m => {
                const isWarp = m.type === 'warp' || m.type === 'iwarp';
                const isStairs = m.type === 'stairs';
                const isStart = m.type === 'start';
                const isStop = ['picking','gpicking','long_picking','glong_picking','boss','gbattle','battle'].includes(m.type);
                const isSkillCd = m.type === 'skill_cd';
                const isCheckpoint = m.type === 'checkpoint';
                const radius = isWarp ? warpMarkerThreshold : isStairs ? movementMarkerThreshold : isStart ? movementMarkerThreshold : isStop ? stopMarkerThreshold : isSkillCd ? skillCdThreshold : isCheckpoint ? movementMarkerThreshold : 0;
                if (radius === 0) return null;
                const color = isWarp ? '#ff9500' : isStairs ? '#39ff14' : isStart ? '#39ff14' : isStop ? '#ff4444' : isSkillCd ? '#39ff14' : isCheckpoint ? '#ff9500' : '#888';
                return (
                  <g key={`range-${m.id}`}>
                    <circle
                      cx={m.x}
                      cy={m.y}
                      r={radius}
                      fill={color}
                      fillOpacity={0.08}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      opacity={0.9}
                    />
                    <text
                      x={m.x}
                      y={m.y - radius - 4}
                      fill={color}
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {radius}px
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Current Position Marker (▼) */}
          {currentPosition && (
            <div
              ref={runnerDotRef}
              className="current-position-marker"
              style={{
                left: `${currentPosition.x}px`,
                top: `${currentPosition.y}px`,
                transform: `translate(-50%, -100%) scale(${Math.min(3, 1 / Math.sqrt(zoom))})`,
                transformOrigin: 'bottom center'
              }}
            >
              <div className="current-position-arrow">▼</div>
              <div className="current-position-pulse" />
            </div>
          )}

          {/* Nearest active ReroRero電話ボックス の方向コンパス (常時起動は除外) */}
          {currentPosition && showPhoneCompass && nearestActivePhone && (() => {
            const dx = nearestActivePhone.x - currentPosition.x;
            const dy = nearestActivePhone.y - currentPosition.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const dist = Math.hypot(dx, dy);
            const compScale = Math.min(3, 1 / Math.sqrt(zoom));
            const orbitRadius = 30;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${currentPosition.x}px`,
                  top: `${currentPosition.y}px`,
                  transform: `translate(-50%, -50%) scale(${compScale})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  zIndex: 99
                }}
                title={`📞 ${Math.round(dist)}px 方向`}
              >
                {/* 軌道の円 (半透明) */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${orbitRadius * 2}px`,
                  height: `${orbitRadius * 2}px`,
                  transform: 'translate(-50%, -50%)',
                  border: '1px dashed rgba(255, 0, 255, 0.3)',
                  borderRadius: '50%'
                }} />
                {/* 📞 中央ラベル */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '14px',
                  lineHeight: 1,
                  filter: 'drop-shadow(0 0 3px rgba(255, 0, 255, 0.8))',
                  zIndex: 2
                }}>📞</div>
                {/* ▲ 軌道上を回転し起動中電話の方向を指す */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  transformOrigin: 'center center',
                  fontSize: '18px',
                  color: '#ff00ff',
                  textShadow: '0 0 4px #fff, 0 0 8px #ff00ff',
                  lineHeight: 1,
                  animation: 'phone-compass-pulse 1.4s infinite ease-in-out',
                  zIndex: 3
                }}>
                  <div style={{
                    position: 'absolute',
                    left: `${orbitRadius}px`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    transformOrigin: `-${orbitRadius}px center`,
                    rotate: '0deg'
                  }}>▶</div>
                </div>
              </div>
            );
          })()}

          {/* Auto-placed start marker (dummy) */}
          {autoStartMarker && autoStartMarker.floor === floor && (
            <div
              className="map-marker"
              style={{
                position: 'absolute',
                left: `${autoStartMarker.x}px`,
                top: `${autoStartMarker.y}px`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                opacity: 0.7,
                filter: 'drop-shadow(0 0 6px rgba(57, 255, 20, 0.6))'
              }}
            >
              <div className="map-marker-icon" style={{ fontSize: `${(markerScale / 30) * 24}px` }}>
                {MARKER_META.start.emoji}
              </div>
              <div className="map-marker-label" style={{ fontSize: '10px', color: '#39ff14', whiteSpace: 'nowrap' }}>
                （自動配置）
              </div>
            </div>
          )}

          {visibleMarkers.map(m => {
              const isHidden = hiddenMarkers.includes(m.id) || hiddenMarkerTypes.includes(m.type);
              if (isHidden && !isEditMode) return null;
              if (!isEditMode && m.type === 'room') return null;

              const isWarp = m.type === 'warp' || m.type === 'iwarp';
              const isStairs = m.type === 'stairs';
              const isPhone = m.type === 'phone';
              const isText = isTextType(m.type);
              const isLargePin = isWarp || isStairs;
              const isSkillCd = m.type === 'skill_cd';
              const meta = MARKER_META[m.type];
              // Dynamic emoji for phone markers
              const displayEmoji = isPhone
                ? (m.phoneActive ? '📞' : '☎')
                : isSkillCd
                  ? getSkillCdIcon(m)
                  : meta.emoji;
              // スキルCDマーカーは個別上書きの色を優先 (テーマカラーに渡す)
              const skillColor = isSkillCd ? getSkillCdColor(m) : null;
              // Phone markers that are locked show a small lock indicator
              const phoneClass = isPhone ? (m.phoneActive ? 'phone-active' : 'phone-inactive') : '';
              const scaleMultiplier = markerScale / 30;
              if (isText) {
                const isFixed = activeNoteMarkerId === m.id ? textFixedPosition : !!m.textFixedPosition;
                if (isFixed) return null;
                const isEditing = activeNoteMarkerId === m.id;
                const displayColor = isEditing ? textColor : (m.textColor || '#ffffff');
                const displaySize = isEditing ? textSize : (m.textSize || 14);
                const displayScaleWithMap = isEditing ? textScaleWithMap : !!m.textScaleWithMap;
                const displayDesc = isEditing ? textDescription : (m.textDescription || '');
                const showTooltip = isEditing ? textTooltip : !!m.textTooltip;
                const displayGlow = isEditing ? textGlow : !!m.textGlow;
                const tooltipText = showTooltip
                  ? (displayDesc || tNote(m.note) || t('Text'))
                  : '';
                // 表示モード中はクリック判定を透過させ、UI 操作の邪魔にならないようにする。
                // 編集モードではドラッグ・選択のため従来通りクリックを拾う。
                const passThrough = !isEditMode && textPinPassThrough;
                return (
                  <div
                    key={m.id}
                    className={`map-marker ${isHidden && !(isLocal && isEditMode) ? 'hidden-marker-pin' : isHidden ? 'editor-hidden-marker' : ''}`}
                    onMouseEnter={tooltipText ? (e) => { setHoveredMarkerId(m.id); setHoverPos({ x: e.clientX, y: e.clientY }); } : undefined}
                    onMouseMove={tooltipText ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                    onMouseLeave={tooltipText ? () => setHoveredMarkerId(null) : undefined}
                    style={{
                      position: 'absolute',
                      left: `${m.x}px`,
                      top: `${m.y}px`,
                      transform: 'translate(-50%, -50%)',
                      color: displayColor,
                      fontSize: `${displayScaleWithMap ? displaySize * scaleMultiplier : displaySize}px`,
                      fontWeight: 'bold',
                      textShadow: (zoom < 0.25)
                        ? 'none'
                        : (displayGlow
                          ? `0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5), 0 0 12px ${displayColor}, 0 0 20px ${displayColor}`
                          : '0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)'),
                      whiteSpace: 'pre',
                      textAlign: 'center',
                      cursor: 'move',
                      pointerEvents: passThrough ? 'none' : 'auto',
                      opacity: isHidden ? 0.35 : ((inactiveMarkersMode && !isWarp && passedMarkerIds.has(m.id)) ? 0.4 : 1),
                      filter: (zoom < 0.25) ? 'none' : (isHidden ? 'grayscale(90%)' : 'none'),
                      zIndex: 20,
                      userSelect: 'none'
                    } as React.CSSProperties}
                    onMouseDown={passThrough ? undefined : (e) => handleMarkerMouseDown(e, m)}
                    onClick={passThrough ? undefined : (e) => handleMarkerClick(e, m)}
                  >
                    {(() => {
                      const note = (m.note || '').trim();
                      if (!note) return t('Text');
                      const translated = t(note);
                      if (translated !== note) return translated;
                      const en = getUserDictFor('en');
                      if (en[note]) return en[note];
                      const ja = getUserDictFor('ja');
                      if (ja[note]) return ja[note];
                      return tNote(m.note) || note;
                    })()}
                  </div>
                );
              }
              const nonTextTooltip = isInfoType(m.type) ? (m.infoLabel?.trim() || t('Info Pin')) : isNoteType(m.type) ? (tNote(m.note) || t('Memo')) : tNote(m.note) || (isWarp ? t('Warp Point') : isStairs ? t('Stairs') : isPhone ? (m.phoneLocked ? t('🔒 Always On') : (m.phoneActive ? t('ACTIVE') : t('Inactive'))) : m.type === 'boss' ? (tNote(m.note)?.trim() || t('Boss')) : (m.type === 'battle' || m.type === 'gbattle') ? t('Battle') : (m.type === 'picking' || m.type === 'gpicking') ? t('Picking') : (m.type === 'long_picking' || m.type === 'glong_picking') ? t('Long Picking') : m.type === 'eh' ? t('エターナルハート発見地点') : m.type === 'cardkey' ? t('カードキー発見ポイント') : m.type === 'checkpoint' ? t('🏁 Checkpoint') : isSkillCd ? `${(m.skillLabel || tNote(m.note) || t('スキル')).trim() || t('スキル')} (CD ${m.skillCdSeconds ?? 0}${t('秒')})` : '');
              return (
                <div
                  key={m.id}
                   className={`map-marker ${isWarp ? 'warp-marker' : ''} ${isStairs ? 'stairs-marker' : ''} ${phoneClass} ${m.type === 'eh' && m.ehHighRate ? 'eh-high-rate' : ''} ${m.type === 'cardkey' && m.cardkeyHighRate ? 'cardkey-high-rate' : ''} ${m.type === 'checkpoint' && violatingCheckpointIds.has(m.id) ? 'checkpoint-marker' : ''} ${(m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && pickyMarkerIds[m.id] ? 'picking-picky' : ''} ${isHidden && !(isLocal && isEditMode) ? 'hidden-marker-pin' : isHidden ? 'editor-hidden-marker' : ''}`}
                   onMouseEnter={nonTextTooltip ? (e) => { setHoveredMarkerId(m.id); setHoverPos({ x: e.clientX, y: e.clientY }); } : undefined}
                   onMouseMove={nonTextTooltip ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                   onMouseLeave={nonTextTooltip ? () => setHoveredMarkerId(null) : undefined}
                  style={{
                     left: `${m.x}px`,
                     top: `${m.y}px`,
                     width: `${(isLargePin ? 18 : 16) * scaleMultiplier}px`,
                     height: `${(isLargePin ? 18 : 16) * scaleMultiplier}px`,
                     '--theme-color': m.phoneActive ? '#39ff14' : (isSkillCd && skillColor ? skillColor : meta.color),
                      pointerEvents: (blockMarkerClicksDuringTools && (toolMode === 'draw' || toolMode === 'edit-stroke' || toolMode === 'measure'))
                        ? 'none' : 'auto',
                      opacity: isHidden ? 0.35 : ((inactiveMarkersMode && !isWarp && passedMarkerIds.has(m.id)) ? 0.4 : 1),
                      filter: (zoom < 0.25) ? 'none' : (isHidden ? 'grayscale(90%)' : 'none')
                  } as React.CSSProperties}
                  onMouseDown={(e) => handleMarkerMouseDown(e, m)}
                  onClick={(e) => handleMarkerClick(e, m)}
                >
                  <div 
                    className="map-marker-icon"
                    style={{
                      fontSize: `${(isLargePin ? 10 : 9) * scaleMultiplier}px`,
                      borderWidth: `${1.5 * scaleMultiplier}px`,
                      boxShadow: zoom < 0.25 ? 'none' : `0 0 ${6 * scaleMultiplier}px var(--theme-color, var(--cyan-neon))`
                    }}
                  >
                    {displayEmoji}
                  </div>
                  {showMarkerLabels && zoom >= 0.25 && (m.note.trim() || (isInfoType(m.type) && m.infoLabel?.trim())) && !isLargePin && (isEditMode || !isInfoType(m.type)) && (
                    <div 
                      className="map-marker-label"
                      style={{
                        fontSize: `${10 * scaleMultiplier}px`,
                        padding: `${2 * scaleMultiplier}px ${6 * scaleMultiplier}px`,
                        borderRadius: `${4 * scaleMultiplier}px`,
                        maxWidth: `${140 * scaleMultiplier}px`,
                        marginTop: `${4 * scaleMultiplier}px`,
                        borderWidth: `${1 * scaleMultiplier}px`,
                        boxShadow: `0 ${2 * scaleMultiplier}px ${5 * scaleMultiplier}px rgba(0, 0, 0, 0.5)`
                      }}
                    >
                      {isInfoType(m.type) ? (tNote(m.infoLabel)?.trim() || tNote(m.note)) : tNote(m.note)}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Render draggable waypoint handles for the active warp/stairs pin in Edit Mode */}
          {visibleMarkers
            .map(m => {
              if (isEditMode && activeNoteMarkerId === m.id) {
                const isIndivMarker = isIndiv(m.type);
                const canEditWaypoints = isLocal ? true : isIndivMarker;
                if (canEditWaypoints) {
                  const conn = getWarpConnectionInfo(m, markers);
                  if (conn.hasLink && conn.primary) {
                    const waypoints = (conn.primary.warpWaypoints || []).filter((wp): wp is Point => wp !== null && wp !== undefined);
                    const showWaypoints = conn.isReversed ? [...waypoints].reverse() : waypoints;

                    if (showWaypoints.length > 0) {
                      const meta = MARKER_META[m.type];
                      return showWaypoints.map((wp, wpIdx) => (
                        <div
                          key={`wp-${m.id}-${wpIdx}`}
                          className="warp-waypoint-handle"
                          style={{
                            position: 'absolute',
                            left: `${wp.x}px`,
                            top: `${wp.y}px`,
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: meta.color,
                            border: '2px solid #fff',
                            boxShadow: '0 0 6px rgba(0,0,0,0.6)',
                            cursor: 'pointer',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 35,
                            pointerEvents: 'auto'
                          }}
                          onMouseDown={(e) => {
                            if (e.button === 1) return;
                            e.stopPropagation();
                            if (onMarkersDragStart) onMarkersDragStart();
                            setDraggingWaypoint({ markerId: m.id, index: wpIdx });
                          }}
                          title={`Drag to adjust waypoint #${wpIdx + 1}`}
                        />
                      ));
                    }
                  }
                }
              }
              return null;
            })}

          {/* Details Popups rendered in flat layer at the end to stay on top of everything */}
          {visibleMarkers
            .map(m => {
              const isHidden = hiddenMarkers.includes(m.id);
              if (isHidden && !isEditMode) return null;
              const meta = MARKER_META[m.type];
              return (
                <React.Fragment key={`popups-${m.id}`}>
                  {/* Details Popup in Presentation Mode */}
                  {((!isEditMode && isInfoType(m.type) && m.infoExpanded) || (isEditMode && activeNoteMarkerId === m.id && isInfoType(m.type))) && (
                    <div 
                      className="info-marker-popup"
                      style={getPopupStyle(
                        m,
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 300),
                        isEditMode && activeNoteMarkerId === m.id ? popupHeight : (m.popupHeight || 0),
                        meta.color
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div 
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>ⓘ</span> {meta.label}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>{t('(ヘッダーをドラッグで移動)')}</span>}
                        </span>
                        <button 
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeNoteMarkerId === m.id) setActiveNoteMarkerId(null);
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, infoExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content">
                        {m.infoLabel?.trim() && (
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: meta.color, marginBottom: '6px' }}>
                            {tNote(m.infoLabel)}
                          </div>
                        )}
                        {m.note.trim() && (
                          <div className="info-popup-desc">
                            {tNote(m.note)}
                          </div>
                        )}
                        {isEditMode && <MediaManager marker={m} markers={markers} onMarkersChange={onMarkersChange} isLocal={isLocal} isIndividual={isIndiv} />}
                        {!isEditMode && m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.map(item => (
                          <div key={item.id} style={{ marginTop: '4px' }}>
                            {item.type === 'image' && <img src={item.url} alt={item.description || 'Media'} style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'image' })} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            {item.type === 'webm' && <video src={item.url} controls loop muted autoPlay playsInline style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'webm' })} />}
                            {item.type === 'x-embed' && <TweetEmbed url={item.url} />}
                            {item.type === 'youtube' && (() => {
                              const ytMatch = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                              const videoId = ytMatch ? ytMatch[1] : null;
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>{t('YouTube URLが無効')}</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Note popup in Presentation Mode */}
                  {(!isEditMode && isNoteType(m.type) && m.noteExpanded) && (
                    <div
                      className="info-marker-popup"
                      style={getPopupStyle(
                        m,
                        m.popupOffset || { x: 0, y: -100 },
                        m.popupWidth || 300,
                        m.popupHeight || 0,
                        meta.color
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>📝</span> MEMO
                        </span>
                        <button
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, noteExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content">
                        {m.note.trim() && (
                          <div className="info-popup-desc">
                            {tNote(m.note)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Checkpoint inline popup (presentation mode) */}
                  {m.type === 'checkpoint' && m.checkpointExpanded && (
                    <div
                      className="info-marker-popup"
                      style={getPopupStyle(
                        m,
                        m.popupOffset || { x: 0, y: -100 },
                        220,
                        0,
                        '#ff9500'
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="info-popup-header">
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff9500' }}>
                          <span>🏁</span> チェックポイント
                        </span>
                        <button
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, checkpointExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content" style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: '13px', color: '#ffffff', marginBottom: '8px' }}>
                          目標時間: <strong style={{ color: '#ffb84d' }}>{(m.checkpointTargetTime ?? 0) === 0 ? '未設定' : `${m.checkpointTargetTime}秒`}</strong>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#ffffff', cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!m.checkpointSoundOn}
                            onChange={(e) => {
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, checkpointSoundOn: e.target.checked } : mk)
                              );
                            }}
                            style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                          />
                          🔔 通過時に音を鳴らす
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#ffffff', cursor: 'pointer', userSelect: 'none', marginTop: '4px' }}>
                          <input
                            type="checkbox"
                            checked={m.checkpointVoiceOn !== false}
                            onChange={(e) => {
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, checkpointVoiceOn: e.target.checked } : mk)
                              );
                            }}
                            style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                          />
                          🗣 通過時に「X秒地点です」と読み上げ
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Note (MEMO) inline editing popup near the pin */}
                  {isEditMode && activeNoteMarkerId === m.id && isNoteType(m.type) && (
                    <div
                      className="info-marker-popup"
                      style={{
                        ...getPopupStyle(
                          m,
                          popupOffset,
                          350,
                          popupHeight || 0,
                          meta.color
                        ),
                        minHeight: '80px'
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>📝</span> {t('MEMO')}
                          <span style={{ fontSize: '9px', opacity: 0.6 }}>{t('(ヘッダーをドラッグで移動)')}</span>
                        </span>
                        <button
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveNote();
                            setActiveNoteMarkerId(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ padding: '6px 0' }}>
                        <textarea
                          style={{
                            width: '100%',
                            minHeight: '60px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(79,195,247,0.3)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px',
                            padding: '6px',
                            resize: 'vertical',
                            fontFamily: 'inherit'
                          }}
                          placeholder="メモを入力..."
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onBlur={() => handleSaveNote(false)}
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {/* Boss Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && m.type === 'boss' && m.bossExpanded) || (isEditMode && activeNoteMarkerId === m.id && m.type === 'boss')) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        m,
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 280),
                        isEditMode && activeNoteMarkerId === m.id ? popupHeight : (m.popupHeight || 0),
                        meta.color
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div 
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>😈</span> {m.note.trim() ? tNote(m.note) : t('BOSS STATUS')}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>{t('(ヘッダーをドラッグで移動)')}</span>}
                        </span>
                        <button 
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeNoteMarkerId === m.id) setActiveNoteMarkerId(null);
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, bossExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content">
                        {/* Boss description display */}
                        {m.bossDescription && m.bossDescription.trim() && (
                          <div style={{ fontSize: '12px', color: '#e0e0e0', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(255, 0, 85, 0.08)', border: '1px solid rgba(255, 0, 85, 0.25)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                            {tNote(m.bossDescription)}
                          </div>
                        )}

                        {/* Drops display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('ボスドロップ:')}</span>
                          {m.bossDrops && m.bossDrops.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {m.bossDrops.map(item => (
                                <span key={item} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', textTransform: 'none', clipPath: 'none', background: 'rgba(255, 0, 85, 0.1)', borderColor: 'rgba(255, 0, 85, 0.3)', color: '#ff0055' }}>
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>{t('設定なし')}</span>
                          )}
                        </div>

                        {/* Boss media items */}
                        {m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.map(item => (
                          <div key={item.id} style={{ marginTop: '4px' }}>
                            {item.type === 'image' && <img src={item.url} alt={item.description || 'Media'} style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'image' })} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            {item.type === 'webm' && <video src={item.url} controls loop muted autoPlay playsInline style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'webm' })} />}
                            {item.type === 'x-embed' && <TweetEmbed url={item.url} />}
                            {item.type === 'youtube' && (() => {
                              const ytMatch = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                              const videoId = ytMatch ? ytMatch[1] : null;
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>{t('YouTube URLが無効')}</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                        {isEditMode && <MediaManager marker={m} markers={markers} onMarkersChange={onMarkersChange} isLocal={isLocal} isIndividual={isIndiv} />}

                        {/* Duration settings - editable in presentation mode (saved as plan-specific override) */}
                        {(() => {
                          const currentVal = (!isLocal && bossCustomDurations[m.id] !== undefined)
                            ? bossCustomDurations[m.id]
                            : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60);
                          
                          const handleValChange = (newVal: number) => {
                            if (isLocal) {
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, bossDurationSeconds: newVal } : mk),
                                true
                              );
                            } else {
                              if (onBossCustomDurationChange) onBossCustomDurationChange(m.id, newVal);
                            }
                          };

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dotted rgba(255, 0, 85, 0.2)', paddingTop: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('所要時間:')}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                  className="btn-cyber danger" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  onClick={() => handleValChange(Math.max(0, currentVal - 10))}
                                >
                                  -10s
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  className="input-cyber"
                                  style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: '#ff0055', borderColor: 'rgba(255, 0, 85, 0.4)' }}
                                  value={currentVal}
                                  onChange={(e) => handleValChange(Math.max(0, parseInt(e.target.value) || 0))}
                                />
                                <button 
                                  className="btn-cyber success" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  onClick={() => handleValChange(currentVal + 10)}
                                >
                                  +10s
                                </button>
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--red-neon)', fontWeight: 'bold', marginTop: '2px' }}>
                                現在の設定: {Math.floor(currentVal / 60)}分 {currentVal % 60}秒
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Battle Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && (m.type === 'battle' || m.type === 'gbattle') && m.battleExpanded) || (isEditMode && activeNoteMarkerId === m.id && (m.type === 'battle' || m.type === 'gbattle'))) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        m,
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        220,
                        isEditMode && activeNoteMarkerId === m.id ? popupHeight : (m.popupHeight || 0),
                        meta.color
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div 
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>⚔️</span> {m.note.trim() ? tNote(m.note) : t('BATTLE STATUS')}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>{t('(ヘッダーをドラッグで移動)')}</span>}
                        </span>
                        <button 
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeNoteMarkerId === m.id) setActiveNoteMarkerId(null);
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, battleExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content">
                        {/* Battle media items */}
                        {m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.map(item => (
                          <div key={item.id} style={{ marginTop: '4px' }}>
                            {item.type === 'image' && <img src={item.url} alt={item.description || 'Media'} style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'image' })} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            {item.type === 'webm' && <video src={item.url} controls loop muted autoPlay playsInline style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'webm' })} />}
                            {item.type === 'x-embed' && <TweetEmbed url={item.url} />}
                            {item.type === 'youtube' && (() => {
                              const ytMatch = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                              const videoId = ytMatch ? ytMatch[1] : null;
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>{t('YouTube URLが無効')}</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                        {isEditMode && <MediaManager marker={m} markers={markers} onMarkersChange={onMarkersChange} isLocal={isLocal} isIndividual={isIndiv} />}
                        {/* Duration settings - editable in presentation mode (saved as plan-specific override) */}
                        {(() => {
                          const isGlobalPin = m.type === 'gbattle';
                          const canEditDuration = true;
                          const currentVal = (isGlobalPin && !isLocal && battleCustomDurations[m.id] !== undefined)
                            ? battleCustomDurations[m.id]
                            : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20);

                          const handleValChange = (newVal: number) => {
                            if (isGlobalPin && !isLocal) {
                              if (onBattleCustomDurationChange) onBattleCustomDurationChange(m.id, newVal);
                            } else {
                              // isLocal global pin OR individual pin
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, battleDurationSeconds: newVal } : mk),
                                true
                              );
                            }
                          };

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('所要時間:')}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                  className="btn-cyber danger" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  disabled={!canEditDuration}
                                  onClick={() => handleValChange(Math.max(0, currentVal - 10))}
                                >
                                  -10s
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  className="input-cyber"
                                  disabled={!canEditDuration}
                                  style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: 'var(--cyan-neon, #00f0ff)', borderColor: 'rgba(0, 240, 255, 0.4)' }}
                                  value={currentVal}
                                  onChange={(e) => handleValChange(Math.max(0, parseInt(e.target.value) || 0))}
                                />
                                <button 
                                  className="btn-cyber success" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  disabled={!canEditDuration}
                                  onClick={() => handleValChange(currentVal + 10)}
                                >
                                  +10s
                                </button>
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold', marginTop: '2px' }}>
                                現在の設定: {Math.floor(currentVal / 60)}分 {currentVal % 60}秒
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Picking / Long Picking Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && (m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && m.pickingExpanded) || 
                    (isEditMode && activeNoteMarkerId === m.id && (m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking'))) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        m,
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        220,
                        isEditMode && activeNoteMarkerId === m.id ? popupHeight : (m.popupHeight || 0),
                        meta.color
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div 
                        className="info-popup-header"
                        onMouseDown={(e) => handlePopupMouseDown(e)}
                      >
                        <span className="info-popup-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{meta.emoji}</span> {m.note.trim() ? tNote(m.note) : `${t(meta.label)} ${t('STATUS')}`}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>{t('(ヘッダーをドラッグで移動)')}</span>}
                        </span>
                        <button 
                          className="info-popup-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeNoteMarkerId === m.id) setActiveNoteMarkerId(null);
                            onMarkersChange(
                              markers.map(mk => mk.id === m.id ? { ...mk, pickingExpanded: false } : mk)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="info-popup-content">
                        {(() => {
                          const canEditDuration = true;
                          // The picky state lives on the ROUTE (plan-specific),
                          // not on the marker. This applies uniformly to all 4
                          // picking types, including global pins, so the user
                          // can toggle them from personal display mode too.
                          const isPicky = !!pickyMarkerIds[m.id];

                          const handlePickyChange = (updatedPicky: boolean) => {
                            const isLong = m.type === 'long_picking' || m.type === 'glong_picking';
                            onMarkersChange(
                              markers.map(mk => {
                                if (mk.id === m.id) {
                                  const updated = { ...mk };
                                  if (isLong) {
                                    updated.longPickingDurationSeconds = updatedPicky ? 0 : 8;
                                  } else {
                                    updated.pickingDurationSeconds = updatedPicky ? 0 : 5;
                                  }
                                  return updated;
                                }
                                return mk;
                              }),
                              true
                            );
                            if (onPickyMarkerChange) {
                              onPickyMarkerChange(m.id, updatedPicky);
                            }
                          };

                          return (
                            <>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(57, 255, 20, 0.05)',
                                padding: '6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(57, 255, 20, 0.15)',
                                marginBottom: '6px'
                              }}>
                                <input
                                  type="checkbox"
                                  id={`picky-cb-${m.id}`}
                                  checked={isPicky}
                                  disabled={!canEditDuration}
                                  onChange={(e) => handlePickyChange(e.target.checked)}
                                  style={{ accentColor: '#39ff14', cursor: canEditDuration ? 'pointer' : 'default' }}
                                />
                                <label htmlFor={`picky-cb-${m.id}`} style={{ fontSize: '10px', color: '#39ff14', fontWeight: 'bold', cursor: canEditDuration ? 'pointer' : 'default', userSelect: 'none' }}>
                                  ピッキー (Picky) — 所要時間を0秒にする
                                </label>
                              </div>

                              {/* Duration settings - read-only display */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('所要時間:')}</span>
                                <div style={{ fontSize: '14px', color: isPicky ? '#39ff14' : 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold', padding: '2px 0' }}>
                                  {isPicky ? '0秒' : (m.type === 'long_picking' || m.type === 'glong_picking' ? '8秒' : '5秒')}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    )}
                </React.Fragment>
              );
            })}

          {/* 線分編集モード: ラバーバンド矩形 (選択プレビュー) */}
          {toolMode === 'edit-stroke' && editRect && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(editRect.start.x, editRect.end.x)}px`,
                top: `${Math.min(editRect.start.y, editRect.end.y)}px`,
                width: `${Math.abs(editRect.end.x - editRect.start.x)}px`,
                height: `${Math.abs(editRect.end.y - editRect.start.y)}px`,
                border: '1px dashed var(--cyan-neon, #00f0ff)',
                background: 'rgba(0, 240, 255, 0.08)',
                pointerEvents: 'none',
                boxShadow: '0 0 8px rgba(0, 240, 255, 0.4)',
                zIndex: 5000
              }}
            />
          )}

          {/* 距離計測モード: ハイライト中の各線の左下に距離ラベルを表示 */}
          {toolMode === 'measure' && measureInfos.map((info, infoIdx) => (
            <div
              key={`measure-label-${info.strokeIdx}-${infoIdx}`}
              className="measure-label"
              style={{
                position: 'absolute',
                // 線の左下点をアンカーに、ラベル本体を左下方向へオフセット
                left: `${info.labelX}px`,
                top: `${info.labelY}px`,
                transform: `translate(-100%, 8px) scale(${Math.min(3, 1 / Math.sqrt(zoom))})`,
                transformOrigin: '0 0',
                pointerEvents: 'none',
                zIndex: 200 + infoIdx,
                background: 'rgba(5, 7, 10, 0.92)',
                border: '1px solid #ffff66',
                borderRadius: '4px',
                padding: '3px 8px',
                color: '#ffff66',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'var(--font-cyber, monospace)',
                whiteSpace: 'nowrap',
                boxShadow: '0 0 10px rgba(255, 255, 102, 0.6), 0 2px 6px rgba(0, 0, 0, 0.7)',
                textShadow: '0 0 4px rgba(255, 255, 0, 0.8)',
                userSelect: 'none',
              }}
            >
              <span style={{ marginRight: '4px', opacity: 0.75 }}>📏</span>
              {info.lengthPx.toLocaleString()} px
            </div>
          ))}

        </div>
      </div>

      {/* Fixed-position text markers rendered via portal to escape overflow:hidden on iOS Safari */}
      {ReactDOM.createPortal(
        markers
          .filter(m => m.floor === floor && isTextType(m.type) && (activeNoteMarkerId === m.id ? textFixedPosition : !!m.textFixedPosition))
          .map(m => {
            const isHidden = hiddenMarkers.includes(m.id) || hiddenMarkerTypes.includes(m.type);
            if (isHidden && !isEditMode) return null;
            const isEditing = activeNoteMarkerId === m.id;
            const displayColor = isEditing ? textColor : (m.textColor || '#ffffff');
            const displaySize = isEditing ? textSize : (m.textSize || 14);
            const displayDesc = isEditing ? textDescription : (m.textDescription || '');
            const showTooltip = isEditing ? textTooltip : !!m.textTooltip;
            const displayGlow = isEditing ? textGlow : !!m.textGlow;
            const tooltipNote = showTooltip
              ? (displayDesc || m.note || 'Text')
              : '';
            // 表示モード中はクリック判定を透過させる
            const passThrough = !isEditMode && textPinPassThrough;
            return (
              <div
                key={`fixed-${m.id}`}
                className={`map-marker ${isHidden && !(isLocal && isEditMode) ? 'hidden-marker-pin' : isHidden ? 'editor-hidden-marker' : ''}`}
                onMouseEnter={tooltipNote ? (e) => { setHoveredMarkerId(m.id); setHoverPos({ x: e.clientX, y: e.clientY }); } : undefined}
                onMouseMove={tooltipNote ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                onMouseLeave={tooltipNote ? () => setHoveredMarkerId(null) : undefined}
                style={{
                  position: 'fixed',
                  left: `${m.x + computePaneOffset(m)}px`,
                  top: `${m.y}px`,
                  transform: 'translate(-50%, -50%)',
                  color: displayColor,
                  fontWeight: 'bold',
                textShadow: displayGlow
                  ? `0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5), 0 0 12px ${displayColor}, 0 0 20px ${displayColor}`
                  : '0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
                  whiteSpace: 'pre',
                  textAlign: 'center',
                  cursor: 'move',
                  pointerEvents: passThrough ? 'none' : 'auto',
                  opacity: isHidden ? 0.35 : 1,
                  filter: isHidden ? 'grayscale(90%)' : 'none',
                  zIndex: 100,
                  userSelect: 'none'
                } as React.CSSProperties}
                onMouseDown={passThrough ? undefined : (e) => handleMarkerMouseDown(e, m)}
                onClick={passThrough ? undefined : (e) => handleMarkerClick(e, m)}
              >
                <div style={{ fontSize: `${displaySize}px` }}>{tNote(m.note) || m.note || 'Text'}</div>
              </div>
            );
          }),
        document.body
      )}

      {/* Tooltip rendered via portal */}
      {hoveredMarkerId && ReactDOM.createPortal(
        (() => {
          const hm = markers.find(mk => mk.id === hoveredMarkerId);
          if (!hm) return null;
          const isEditing = activeNoteMarkerId === hm.id;
          let text = '';
          if (isTextType(hm.type)) {
            const desc = isEditing ? textDescription : (hm.textDescription || '');
            const showTT = isEditing ? textTooltip : !!hm.textTooltip;
            if (showTT) text = desc || hm.note || 'Text';
          } else {
            text = isInfoType(hm.type) ? (hm.infoLabel?.trim() || t('Info Pin')) : isNoteType(hm.type) ? (tNote(hm.note) || t('Memo')) : tNote(hm.note) || (hm.type === 'warp' ? t('Warp Point') : hm.type === 'iwarp' ? t('Warp Point') : hm.type === 'stairs' ? t('Stairs') : hm.type === 'phone' ? (hm.phoneLocked ? t('🔒 Always On') : (hm.phoneActive ? t('ACTIVE') : t('Inactive'))) : hm.type === 'boss' ? (tNote(hm.note)?.trim() || t('Boss')) : (hm.type === 'battle' || hm.type === 'gbattle') ? t('Battle') : (hm.type === 'picking' || hm.type === 'gpicking') ? t('Picking') : (hm.type === 'long_picking' || hm.type === 'glong_picking') ? t('Long Picking') : hm.type === 'eh' ? t('エターナルハート発見地点') : hm.type === 'cardkey' ? t('カードキー発見ポイント') : hm.type === 'skill_cd' ? `${(hm.skillLabel || tNote(hm.note) || t('スキル')).trim() || t('スキル')} (CD ${hm.skillCdSeconds ?? 0}${t('秒')})` : '');
          }
          if (!text) return null;
          const pad = 14;
          const ttW = Math.min(text.length * 7 + 16, 260);
          const ttH = 28;
          const vw = window.innerWidth;
          let tx = hoverPos.x - ttW / 2;
          let ty = hoverPos.y - ttH - pad;
          if (ty < 4) ty = hoverPos.y + pad;
          if (tx < 4) tx = 4;
          if (tx + ttW > vw - 4) tx = vw - ttW - 4;
          return (
            <div style={{
              position: 'fixed',
              left: `${tx}px`,
              top: `${ty}px`,
              background: 'rgba(5,7,10,0.95)',
              border: '1px solid var(--theme-color, var(--cyan-neon))',
              color: '#fff',
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
              zIndex: 9500,
              maxWidth: '260px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'var(--font-cyber)',
            }}>
              {text}
            </div>
          );
        })(),
        document.body
      )}

      {/* Checkpoint hover tooltip — presentation mode shows target time + sound toggle */}
      {!isEditMode && hoveredMarkerId && ReactDOM.createPortal(
        (() => {
          const hm = markers.find(mk => mk.id === hoveredMarkerId);
          if (!hm || hm.type !== 'checkpoint') return null;
          const target = hm.checkpointTargetTime ?? 0;
          const soundOn = !!hm.checkpointSoundOn;
          const voiceOn = hm.checkpointVoiceOn !== false;
          const pad = 14;
          const ttW = 220;
          const ttH = 110;
          const vw = window.innerWidth;
          let tx = hoverPos.x - ttW / 2;
          let ty = hoverPos.y - ttH - pad;
          if (ty < 4) ty = hoverPos.y + pad;
          if (tx < 4) tx = 4;
          if (tx + ttW > vw - 4) tx = vw - ttW - 4;
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: `${tx}px`,
                top: `${ty}px`,
                background: 'rgba(5,7,10,0.95)',
                border: '1px solid #ff9500',
                color: '#fff',
                fontSize: '12px',
                padding: '8px 10px',
                borderRadius: '4px',
                pointerEvents: 'auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
                zIndex: 9500,
                minWidth: '180px',
                fontFamily: 'var(--font-cyber)',
              }}>
              <div style={{ fontSize: '11px', color: '#ff9500', fontWeight: 'bold', marginBottom: '4px' }}>{t('🏁 チェックポイント')}</div>
              <div style={{ fontSize: '12px', color: '#ffffff', marginBottom: '4px' }}>
                {t('目標時間: ')}<strong style={{ color: '#ffb84d' }}>{target === 0 ? t('未設定') : `${target}${t('秒')}`}</strong>
              </div>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer', userSelect: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={soundOn}
                  onChange={(e) => {
                    onMarkersChange(
                      markers.map(mk => mk.id === hm.id ? { ...mk, checkpointSoundOn: e.target.checked } : mk)
                    );
                  }}
                  style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                />
                🔔 通過時に音を鳴らす
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer', userSelect: 'none', marginTop: '2px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => {
                    onMarkersChange(
                      markers.map(mk => mk.id === hm.id ? { ...mk, checkpointVoiceOn: e.target.checked } : mk)
                    );
                  }}
                  style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                />
                🗣 通過時に「X秒地点です」と読み上げ
              </label>
            </div>
          );
        })(),
        document.body
      )}

      {/* Popover rendered as fixed overlay on the wrapper, always visible on screen */}
      {isEditMode && activeNoteMarker && (
        <div
          className="note-popover"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            left: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: MARKER_META[activeNoteMarker.type].color }}>
              {MARKER_META[activeNoteMarker.type].label}
            </span>
            {(() => {
              const isHidden = hiddenMarkers.includes(activeNoteMarker.id);

              return (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {isHidden ? (
                    <button 
                      className="delete-btn"
                       style={{ background: 'none', border: 'none', color: '#39ff14', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={() => {
                        if (onShowGlobalMarker) {
                          onShowGlobalMarker(activeNoteMarker.id);
                        }
                      }}
                      title="このマーカーを表示"
                    >
                      表示
                    </button>
                  ) : (
                    <button 
                      className="delete-btn"
                      style={{ background: 'none', border: 'none', color: '#ffaa00', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={() => {
                        if (onHideGlobalMarker) {
                          onHideGlobalMarker(activeNoteMarker.id);
                        }
                      }}
                      title="このマーカーを非表示"
                    >
                      非表示
                    </button>
                  )}
                  <button
                    className="delete-btn"
                    style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}
                    onClick={() => handleDeleteMarker(activeNoteMarker.id)}
                    title="Delete Marker"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })()}
          </div>
          
          {isInfoType(activeNoteMarker.type) && (
            <div style={{ marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{t('ラベル')}</label>
              <input
                type="text"
                className="input-cyber"
                style={{ width: '100%', fontSize: '11px', padding: '4px 6px' }}
                placeholder="ピンのタイトル（上部に表示）"
                value={infoLabel}
                onChange={(e) => setInfoLabel(e.target.value)}
              />
            </div>
          )}

          <textarea
            placeholder={isInfoType(activeNoteMarker.type) ? t('説明テキスト') : t('ルートのメモや攻略情報を記入...')}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            autoFocus
          />

          {activeNoteMarker && (
            <button
              type="button"
              onClick={() => setNoteSettingsExpanded(!noteSettingsExpanded)}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '10px',
                background: 'rgba(0, 255, 255, 0.05)',
                border: '1px solid rgba(0, 255, 255, 0.15)',
                borderRadius: '4px',
                color: 'var(--cyan-neon)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '6px'
              }}
            >
              <span>{t('▼ 詳細設定')}</span>
              <span style={{ fontSize: '9px', opacity: 0.6 }}>{noteSettingsExpanded ? '折りたたむ' : '展開する'}</span>
            </button>
          )}

          {noteSettingsExpanded && activeNoteMarker && (
          <div style={{ marginTop: '6px', borderTop: '1px dashed rgba(0, 255, 255, 0.15)', paddingTop: '8px' }}>

          {/* Text marker color & size editing */}
          {isTextType(activeNoteMarker.type) && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.3)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: '#7ec8e3' }}>{t('テキスト設定:')}</div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('色:')}</label>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  style={{ width: '30px', height: '24px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                />
                <input
                  type="text"
                  className="input-cyber"
                  style={{ width: '80px', fontSize: '10px', padding: '2px 4px' }}
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#b0b0b0' }}>
                  <span>{t('サイズ:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{textSize}px</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="48"
                  step="1"
                  value={textSize}
                  onChange={(e) => setTextSize(parseInt(e.target.value))}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#b0b0b0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={textScaleWithMap}
                  onChange={(e) => setTextScaleWithMap(e.target.checked)}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                ピン・ラベルと同率で拡大
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#b0b0b0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={textFixedPosition}
                  onChange={(e) => {
                    const nowFixed = e.target.checked;
                    setTextFixedPosition(nowFixed);
                    if (activeNoteMarkerId) {
                      onMarkersChange(markers.map(m => {
                        if (m.id !== activeNoteMarkerId) return m;
                        if (nowFixed) {
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (!rect) return m;
                          const vpX = rect.left + (m.x / 1600) * rect.width;
                          const vpY = rect.top + (m.y / 4550) * rect.height;
                          const side: 'auto' | 'left' | 'right' = textTrackSide || 'left';
                          const effectiveSide = side === 'auto' ? (vpX < window.innerWidth / 2 ? 'left' : 'right') : side;
                          // Save the pane-closed base position: subtract the
                          // current pane offset so the stored coordinate does
                          // not include the pane shift.
                          const paneOffsetX = effectiveSide === 'left'
                            ? (leftSidebarCollapsed ? 0 : 280)
                            : (rightSidebarCollapsed ? 0 : -340);
                          const baseX = vpX - paneOffsetX;
                          return { ...m, fixedOriginX: m.x, fixedOriginY: m.y, x: Math.round(baseX), y: Math.round(vpY), textFixedPosition: true, trackSide: side };
                        } else {
                          const origX = m.fixedOriginX ?? m.x;
                          const origY = m.fixedOriginY ?? m.y;
                          return { ...m, x: origX, y: origY, fixedOriginX: undefined, fixedOriginY: undefined, textFixedPosition: false, trackSide: undefined };
                        }
                      }));
                    }
                  }}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                画面に固定（ズーム影響なし）
              </label>
              {textFixedPosition && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '18px' }}>
                  <div style={{ fontSize: '9px', color: '#b0b0b0' }}>{t('ペイン追従:')}</div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '9px', color: '#b0b0b0' }}>
                    {(['auto', 'left', 'right'] as const).map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="text-track-side"
                          checked={textTrackSide === opt}
                          onChange={() => {
                            setTextTrackSide(opt);
                            if (activeNoteMarkerId) {
                              onMarkersChange(markers.map(m => {
                                if (m.id !== activeNoteMarkerId) return m;
                                return { ...m, trackSide: opt };
                              }));
                            }
                          }}
                          style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                        />
                        {opt === 'auto' ? '自動' : opt === 'left' ? '左' : '右'}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', color: '#b0b0b0' }}>{t('説明文:')}</label>
                <textarea
                  className="input-cyber"
                  style={{ fontSize: '10px', padding: '4px', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                  value={textDescription}
                  onChange={(e) => setTextDescription(e.target.value)}
                  placeholder={t('テキストの説明（任意）')}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#b0b0b0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={textTooltip}
                  onChange={(e) => setTextTooltip(e.target.checked)}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                マウスオーバーでツールチップ表示
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#b0b0b0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={textGlow}
                  onChange={(e) => setTextGlow(e.target.checked)}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                文字を光らせる
              </label>
            </div>
          )}

          {/* Boss marker drops & duration editing */}
          {activeNoteMarker.type === 'boss' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255, 0, 85, 0.3)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <textarea
                className="input-cyber"
                value={bossDescription}
                onChange={(e) => setBossDescription(e.target.value)}
                placeholder="注意事項・攻略メモ"
                rows={3}
                style={{ width: '100%', fontSize: '12px', padding: '4px 6px', resize: 'vertical', minHeight: '50px', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: '10px', color: '#ff6b9d', marginTop: '4px' }}>{t('ボスドロップ:')}</div>

              {/* Drops List */}
              {bossDrops.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                  {bossDrops.map(item => (
                    <span key={item} className="btn-cyber" style={{ padding: '2px 4px', fontSize: '9px', textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', clipPath: 'none', background: 'rgba(255, 0, 85, 0.1)', borderColor: 'rgba(255, 0, 85, 0.3)' }}>
                      {item}
                      <span 
                        style={{ cursor: 'pointer', color: 'var(--red-neon)', fontWeight: 'bold' }} 
                        onClick={() => setBossDrops(bossDrops.filter(i => i !== item))}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '9px', color: '#666', fontStyle: 'italic' }}>{t('登録アイテムなし')}</div>
              )}

              {/* Custom Drop Input */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  className="input-cyber"
                  style={{ flex: 1, fontSize: '10px', padding: '3px 6px' }}
                  placeholder="ドロップアイテム名を入力..."
                  value={customDropInput}
                  onChange={(e) => setCustomDropInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = customDropInput.trim();
                      if (val) {
                        const itemsToAdd = val.split(/[,，、\s]+/).map(i => i.trim()).filter(i => i && !bossDrops.includes(i));
                        if (itemsToAdd.length > 0) {
                          setBossDrops([...bossDrops, ...itemsToAdd]);
                        }
                        setCustomDropInput('');
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-cyber success"
                  style={{ padding: '2px 8px', fontSize: '10px', clipPath: 'none' }}
                  onClick={() => {
                    const val = customDropInput.trim();
                    if (val) {
                      const itemsToAdd = val.split(/[,，、\s]+/).map(i => i.trim()).filter(i => i && !bossDrops.includes(i));
                      if (itemsToAdd.length > 0) {
                        setBossDrops([...bossDrops, ...itemsToAdd]);
                      }
                      setCustomDropInput('');
                    }
                  }}
                >
                  追加
                </button>
              </div>

              {/* Duration Setting */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', borderTop: '1px dotted rgba(255, 0, 85, 0.2)', paddingTop: '6px' }}>
                <div style={{ fontSize: '10px', color: '#ff6b9d', fontWeight: 'bold' }}>{t('所要時間')}</div>
                
                {/* Global Default Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('デフォルト:')}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                      {Math.floor(bossDurationSeconds / 60)}分 {bossDurationSeconds % 60}秒
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={720}
                    step={1}
                    value={Math.max(0, Math.min(720, bossDurationSeconds))}
                    onChange={(e) => setBossDurationSeconds(parseInt(e.target.value))}
                    style={{ accentColor: '#ff6b9d', cursor: 'pointer', width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                    <span>{t('0秒')}</span>
                    <span>{t('12分')}</span>
                  </div>
                </div>

                {/* Plan Specific Custom Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 0, 85, 0.03)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 0, 85, 0.15)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                      type="checkbox"
                      id="use-custom-duration-cb"
                      checked={useBossCustomDuration}
                      onChange={(e) => {
                        setUseBossCustomDuration(e.target.checked);
                        if (e.target.checked && (bossCustomDurationVal === undefined || bossCustomDurationVal === null)) {
                          setBossCustomDurationVal(bossDurationSeconds);
                        }
                      }}
                      style={{ accentColor: 'var(--red-neon)', cursor: 'pointer' }}
                    />
                    <label htmlFor="use-custom-duration-cb" style={{ fontSize: '10px', color: 'var(--red-neon)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                      このプラン独自の時間を設定する
                    </label>
                  </div>
                  
                  {useBossCustomDuration && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('個別設定値:')}</span>
                        <span style={{ fontSize: '11px', color: 'var(--red-neon)', fontWeight: 'bold' }}>
                          {Math.floor((bossCustomDurationVal || 60) / 60)}分 {(bossCustomDurationVal || 60) % 60}秒
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={720}
                        step={1}
                        value={Math.max(0, Math.min(720, bossCustomDurationVal ?? 0))}
                        onChange={(e) => setBossCustomDurationVal(parseInt(e.target.value))}
                        style={{ accentColor: 'var(--red-neon)', cursor: 'pointer', width: '100%' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                        <span>{t('0秒')}</span>
                        <span>{t('12分')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Battle marker duration editing */}
          {(activeNoteMarker.type === 'battle' || activeNoteMarker.type === 'gbattle') && (() => {
            const isGlobal = activeNoteMarker.type === 'gbattle';
            return (
              <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#7ec8e3', fontWeight: 'bold' }}>{t('所要時間')}</div>
                  
                  {isGlobal ? (
                    <>
                      {/* Global Default Duration */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('デフォルト:')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                            {Math.floor(battleDurationSeconds / 60)}分 {battleDurationSeconds % 60}秒
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={720}
                          step={1}
                          value={Math.max(0, Math.min(720, battleDurationSeconds))}
                          onChange={(e) => setBattleDurationSeconds(parseInt(e.target.value))}
                          style={{ accentColor: '#7ec8e3', cursor: 'pointer', width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                          <span>{t('0秒')}</span>
                          <span>{t('12分')}</span>
                        </div>
                      </div>

                      {/* Plan Specific Custom Duration */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0, 240, 255, 0.03)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            id="use-battle-custom-duration-cb"
                            checked={useBattleCustomDuration}
                            onChange={(e) => {
                              setUseBattleCustomDuration(e.target.checked);
                              if (e.target.checked && (battleCustomDurationVal === undefined || battleCustomDurationVal === null)) {
                                setBattleCustomDurationVal(battleDurationSeconds);
                              }
                            }}
                            style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                          />
                          <label htmlFor="use-battle-custom-duration-cb" style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                            このプラン独自の時間を設定する
                          </label>
                        </div>
                        
                        {useBattleCustomDuration && (
                          <div style={{ marginTop: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('個別設定値:')}</span>
                              <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>
                                {Math.floor((battleCustomDurationVal || 60) / 60)}分 {(battleCustomDurationVal || 60) % 60}秒
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={720}
                              step={1}
                              value={Math.max(0, Math.min(720, battleCustomDurationVal ?? 0))}
                              onChange={(e) => setBattleCustomDurationVal(parseInt(e.target.value))}
                              style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                              <span>{t('0秒')}</span>
                              <span>{t('12分')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Individual Pin Duration */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0, 240, 255, 0.03)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('所要時間:')}</span>
                        <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>
                          {Math.floor(battleDurationSeconds / 60)}分 {battleDurationSeconds % 60}秒
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={720}
                        step={1}
                        value={Math.max(0, Math.min(720, battleDurationSeconds))}
                        onChange={(e) => setBattleDurationSeconds(parseInt(e.target.value))}
                        style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                        <span>{t('0秒')}</span>
                        <span>{t('12分')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Picking / Long Picking marker duration & picky editing */}
          {(activeNoteMarker.type === 'picking' || activeNoteMarker.type === 'gpicking' || activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: '#7ec8e3', fontWeight: 'bold' }}>{t('所要時間')}</div>
                
                {/* Picky Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(57, 255, 20, 0.05)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(57, 255, 20, 0.15)', marginBottom: '4px' }}>
                  <input 
                    type="checkbox"
                    id="picky-cb"
                    checked={pickingPicky}
                    onChange={(e) => setPickingPicky(e.target.checked)}
                    style={{ accentColor: '#39ff14', cursor: 'pointer' }}
                  />
                  <label htmlFor="picky-cb" style={{ fontSize: '10px', color: '#39ff14', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                    ピッキー (Picky) — 所要時間を0秒にする
                  </label>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '2px' }}>
                  現在の設定: <strong style={{ color: 'var(--cyan-neon)' }}>{pickingPicky ? '0秒' : (activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking' ? '8秒' : '5秒')}</strong>
                </div>

                {pickingPicky && (
                  <div style={{ fontSize: '11px', color: '#39ff14', fontWeight: 'bold', padding: '4px', background: 'rgba(57,255,20,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                    Picky (0秒) 設定中のため時間設定は無効化されています。
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EH marker high appearance rate editing */}
          {activeNoteMarker.type === 'eh' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 240, 255, 0.05)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.15)', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="eh-high-rate-cb"
                  checked={ehHighRate}
                  onChange={(e) => setEhHighRate(e.target.checked)}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                <label htmlFor="eh-high-rate-cb" style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                  {t('出現率が高い')} (High Spawn Rate) - {t('強調表示する')}
                </label>
              </div>
              {activeNoteMarker && <MediaManager marker={activeNoteMarker} markers={markers} onMarkersChange={onMarkersChange} isLocal={isLocal} isIndividual={isIndiv} />}
            </div>
          )}

          {/* I-MEMO (inote) marker media manager - personal memo with media URLs */}
          {activeNoteMarker.type === 'inote' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(57, 255, 20, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--green-neon)', fontWeight: 'bold' }}>{t('📝 I-MEMO 添付メディア')}</div>
              {activeNoteMarker && <MediaManager marker={activeNoteMarker} markers={markers} onMarkersChange={onMarkersChange} isLocal={isLocal} isIndividual={isIndiv} />}
            </div>
          )}

          {/* Card Key marker high appearance rate editing */}
          {activeNoteMarker.type === 'cardkey' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(57, 255, 20, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(57, 255, 20, 0.05)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(57, 255, 20, 0.15)', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="cardkey-high-rate-cb"
                  checked={cardkeyHighRate}
                  onChange={(e) => setCardkeyHighRate(e.target.checked)}
                  style={{ accentColor: 'var(--green-neon)', cursor: 'pointer' }}
                />
                <label htmlFor="cardkey-high-rate-cb" style={{ fontSize: '10px', color: 'var(--green-neon)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                  {t('出現率が高い')} (High Spawn Rate) - {t('強調表示する')}
                </label>
              </div>
            </div>
          )}

          {/* Checkpoint marker: target time + sound */}
          {activeNoteMarker && activeNoteMarker.type === 'checkpoint' && (
            <div style={{ marginTop: '10px', borderTop: '1px dashed rgba(255, 149, 0, 0.4)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', color: '#ff9500', fontWeight: 'bold' }}>{t('🏁 チェックポイント設定')}</div>

              {/* Target arrival time */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                  目標到達時間 (秒)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="range"
                    min="0" max="720" step="1"
                    value={checkpointTargetTime}
                    onChange={(e) => setCheckpointTargetTime(parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: '#ff9500', height: '22px' }}
                  />
                  <input
                    type="number"
                    min="0" max="720"
                    value={checkpointTargetTime}
                    onChange={(e) => setCheckpointTargetTime(Math.max(0, Math.min(720, parseInt(e.target.value) || 0)))}
                    style={{ width: '64px', fontSize: '13px', textAlign: 'center', padding: '3px 4px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(255,149,0,0.4)', color: '#ff9500', borderRadius: '3px' }}
                  />
                </div>
                <div style={{ fontSize: '13px', color: '#ffffff', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.35)', borderRadius: '3px' }}>
                  {t('設定した秒数に自動追従がこの場所へ辿り着くよう、')}<br />
                  <strong style={{ color: '#ffb84d' }}>{t('移動速度が自動で調整')}</strong>{t('されます。')}<br />
                  <span style={{ color: '#e0e0e0', fontSize: '12px' }}>
                    ※ 0 = このチェックポイントは速度調整に使用されません (タイムライン上で赤マーカーになります)
                  </span>
                </div>
                {checkpointTargetTime > 0 && checkpointTargetTime < 1 && (
                  <div style={{ fontSize: '12px', color: '#ff4444', fontWeight: 'bold', padding: '4px 6px', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,68,68,0.4)', borderRadius: '3px' }}>
                    ⚠ 目標時間が1秒未満です。無視されます。
                  </div>
                )}
              </div>

              {/* Sound on pass */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', background: 'rgba(255,149,0,0.08)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,149,0,0.25)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="checkpoint-sound-cb"
                  checked={checkpointSoundOn}
                  onChange={(e) => setCheckpointSoundOn(e.target.checked)}
                  style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                />
                <label htmlFor="checkpoint-sound-cb" style={{ fontSize: '13px', color: '#ff9500', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                  🔔 通過時に音を鳴らす
                </label>
              </label>

              {/* Voice announcement on pass */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', background: 'rgba(255,149,0,0.05)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,149,0,0.2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="checkpoint-voice-cb"
                  checked={checkpointVoiceOn}
                  onChange={(e) => setCheckpointVoiceOn(e.target.checked)}
                  style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                />
                <label htmlFor="checkpoint-voice-cb" style={{ fontSize: '13px', color: '#ffb84d', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                  🗣 「X秒地点です」と読み上げ
                </label>
              </label>
            </div>
          )}

          {activeNoteMarker && activeNoteMarker.type === 'skill_cd' && (
            <div style={{ marginTop: '10px', borderTop: '1px dashed rgba(57, 255, 20, 0.4)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', color: skillCdColor, fontWeight: 'bold' }}>{t('⏱️ スキルCD')}</div>

              {/* プリセット選択 + 設定画面ボタン */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <select
                  value={activeNoteMarker.skillPresetId || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      onMarkersChange(
                        markers.map(mk => mk.id === activeNoteMarker.id ? {
                          ...mk,
                          skillPresetId: undefined,
                          skillLabel: '',
                          skillColor: MARKER_META.skill_cd.color,
                          skillMode: 'fixed',
                          skillCdSeconds: 0,
                          skillPerSecondCd: 0
                        } : mk),
                        true
                      );
                      setSkillCdColor(MARKER_META.skill_cd.color);
                      setSkillCdMode('fixed');
                      setSkillCdSeconds(0);
                      setSkillCdPerSecondRate(0);
                      return;
                    }
                    const preset = skillCdPresets.find(p => p.id === id);
                    if (!preset) return;
                    // プリセット反映: ラベル/色/モード/秒数 をマーカーに反映し、
                    // note (=ラベル) もプリセット名で上書きする。
                    onMarkersChange(
                      markers.map(mk => mk.id === activeNoteMarker.id ? {
                        ...mk,
                        skillPresetId: preset.id,
                        skillLabel: preset.label,
                        skillColor: preset.color,
                        skillMode: preset.mode,
                        skillCdSeconds: preset.seconds,
                        skillPerSecondCd: preset.perSecondCd,
                        note: preset.label
                      } : mk),
                      true
                    );
                    setSkillCdColor(preset.color);
                    setSkillCdMode(preset.mode);
                    setSkillCdSeconds(preset.seconds);
                    setSkillCdPerSecondRate(preset.perSecondCd);
                    setNoteText(preset.label);
                  }}
                  style={{ flex: 1, fontSize: '12px', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px' }}
                >
                  <option value="">{t('(なし)')}</option>
                  {skillCdPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label} {p.mode === 'per_second'
                        ? `(${p.seconds}秒 × ${p.perSecondCd}秒CD/秒 = ${(p.seconds || 0) * (p.perSecondCd || 0)}秒)`
                        : `(CD ${p.seconds}秒)`}
                    </option>
                  ))}
                </select>
                {onOpenSkillCdSettings && (
                  <button
                    className="btn-cyber"
                    style={{ fontSize: '10px', padding: '4px 8px', clipPath: 'none' }}
                    onClick={onOpenSkillCdSettings}
                    title="スキルCDプリセットの管理画面を開く"
                  >
                    ⚙️ 設定
                  </button>
                )}
              </div>

              {/* 色 + アイコンプレビュー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold', minWidth: '40px' }}>{t('色')}</span>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(skillCdColor) ? skillCdColor : '#39ff14'}
                  onChange={(e) => setSkillCdColor(e.target.value)}
                  style={{ width: '32px', height: '24px', padding: 0, border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px', cursor: 'pointer' }}
                />
                {/* リアルタイムプレビュー: プリセット使用時は skillLabel、未使用時は noteText の頭文字 */}
                {(() => {
                  const iconChar = activeNoteMarker.skillPresetId
                    ? ((activeNoteMarker.skillLabel || '').trim() || 'S').charAt(0)
                    : (noteText.trim() || 'S').charAt(0);
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      プレビュー
                      <span style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(10,15,28,0.85)', color: skillCdColor, border: `1.5px solid ${skillCdColor}`, textAlign: 'center', lineHeight: '18px', fontSize: '12px', fontWeight: 700, boxShadow: `0 0 6px ${skillCdColor}80` }}>
                        {iconChar}
                      </span>
                    </span>
                  );
                })()}
              </div>

              {/* モード表示: プリセットで設定 (= ここでは個別上書き不可)。
                  モードを変更したい場合は、設定タブでプリセットを編集する。 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>モード:</span>
                <span style={{ fontSize: '11px', color: skillCdColor, fontWeight: 700 }}>
                  {skillCdMode === 'per_second' ? '変動 (使用秒×係数)' : '固定 (CD秒数)'}
                </span>
                {!activeNoteMarker.skillPresetId && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(プリセット未選択)</span>
                )}
              </div>

              {skillCdMode === 'per_second' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold', minWidth: '70px' }}>使用秒数</span>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={skillCdSeconds}
                      onChange={(e) => setSkillCdSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ flex: 1, fontSize: '13px', textAlign: 'center', fontWeight: 'bold', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: skillCdColor, border: `1px solid ${skillCdColor}80`, borderRadius: '3px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>秒 ×</span>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={skillCdPerSecondRate}
                      onChange={(e) => setSkillCdPerSecondRate(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: '50px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: skillCdColor, border: `1px solid ${skillCdColor}80`, borderRadius: '3px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>秒CD/秒</span>
                  </div>
                  <div style={{ fontSize: '11px', color: skillCdColor, fontWeight: 'bold', textAlign: 'right' }}>
                    合計CD: {skillCdSeconds * skillCdPerSecondRate}秒
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold', minWidth: '60px' }}>CD秒数</span>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={skillCdSeconds}
                      onChange={(e) => setSkillCdSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ flex: 1, fontSize: '14px', textAlign: 'center', fontWeight: 'bold', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: skillCdColor, border: `1px solid ${skillCdColor}80`, borderRadius: '3px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>秒</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={1}
                    value={skillCdSeconds}
                    onChange={(e) => setSkillCdSeconds(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: skillCdColor, height: '20px' }}
                  />
                </div>
              )}

              {activeNoteMarker.skillPresetId
                ? <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>※ プリセットの名称と色が反映。色は個別変更可。使用秒数/CD秒数も上書き可。</div>
                : <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>※ 上の「メモ」がスキル名。先頭1文字がアイコン。</div>}
            </div>
          )}

          <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#7ec8e3', marginBottom: '4px' }}>{t('スクロールターゲット:')}</div>
            <div style={{ fontSize: '9px', color: '#b0b0b0', marginBottom: '4px' }}>{t('マップを自由に移動・ズームしてから、以下をクリックでこのビューを記録。')}</div>
            {activeNoteMarker.scrollConfig ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--green-neon)' }}>
                  ✓ 登録済み (X: {Math.round(activeNoteMarker.scrollConfig.x)}, Y: {Math.round(activeNoteMarker.scrollConfig.y)}, Z: {activeNoteMarker.scrollConfig.zoom.toFixed(2)}x)
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn-cyber" style={{ padding: '2px 6px', fontSize: '9px', flex: 1 }} onClick={handleSetScrollTarget}>
                    更新
                  </button>
                  <button className="btn-cyber danger" style={{ padding: '2px 6px', fontSize: '9px', flex: 1 }} onClick={handleClearScrollTarget}>
                    クリア
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-cyber success" style={{ padding: '4px 8px', fontSize: '10px', width: '100%' }} onClick={handleSetScrollTarget}>
                現在のビューをターゲットに設定
              </button>
            )}
          </div>

          {/* Phone marker: Always-On lock toggle */}
          {activeNoteMarker.type === 'phone' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255, 0, 255, 0.2)', paddingTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!activeNoteMarker.phoneLocked}
                  onChange={(e) => {
                    onMarkersChange(
                      markers.map(m => m.id === activeNoteMarker.id
                        ? { ...m, phoneLocked: e.target.checked, phoneActive: e.target.checked ? true : m.phoneActive }
                        : m)
                    );
                  }}
                  style={{ accentColor: '#39ff14' }}
                />
                🔒 常時起動 (Always On) — リセット・切り替えの影響を受けない
              </label>
              <div style={{ fontSize: '9px', color: '#b0b0b0', marginTop: '4px' }}>
                ステータス: {activeNoteMarker.phoneLocked ? '🔒 ロック中 (常時有効)' : (activeNoteMarker.phoneActive ? '📞 有効' : '☎ 無効')}
              </div>
            </div>
          )}

          {/* Warp & Stairs Point Linking */}
          {(activeNoteMarker.type === 'warp' || activeNoteMarker.type === 'iwarp' || activeNoteMarker.type === 'stairs') && (() => {
            const conn = getWarpConnectionInfo(activeNoteMarker, markers);
            const canLink = true;
            return (
              <div style={{ marginTop: '8px', borderTop: `1px dashed rgba(${(activeNoteMarker.type === 'warp' || activeNoteMarker.type === 'iwarp') ? '255, 0, 255' : '255, 170, 0'}, 0.3)`, paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: '#7ec8e3', marginBottom: '4px' }}>
                  {activeNoteMarker.type === 'iwarp'
                    ? '🌀 ワープ先（片道）:'
                    : '🔗 リンク先:'}
                </div>
                {/* Show incoming link info if any */}
                {conn.hasLink && conn.partner && !activeNoteMarker.linkedWarpId && (
                  <div style={{ fontSize: '10px', color: '#b0b0b0', marginBottom: '4px', padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                    ← 来たリンク: {conn.partner.note.trim() ? conn.partner.note : `#${conn.partner.id.substring(conn.partner.id.length - 4)}`}
                  </div>
                )}
                {/* Show outgoing link and remove button */}
                {activeNoteMarker.linkedWarpId && conn.partner ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '10px', color: (activeNoteMarker.type === 'warp' || activeNoteMarker.type === 'iwarp') ? 'var(--magenta-neon)' : '#ffaa00' }}>
                      {conn.isMutuallyLinked ? '↔' : '→'} Leads to: {conn.partner.note.trim() ? conn.partner.note : `${activeNoteMarker.type === 'stairs' ? 'Stairs' : 'Warp'} #${conn.partner.id.substring(conn.partner.id.length - 4)}`}
                      <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: '4px' }}>({conn.isMutuallyLinked ? '双方向' : '片道'})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#b0b0b0' }}>{t('接続線の色:')}</span>
                      <input
                        type="color"
                        value={activeNoteMarker.connectionColor || conn.partner.connectionColor || (activeNoteMarker.type === 'stairs' ? '#ffaa00' : '#ff00ff')}
                        onChange={(e) => {
                          const newColor = e.target.value;
                          onMarkersChange(
                            markers.map(m => {
                              if (m.id === activeNoteMarker.id) {
                                return { ...m, connectionColor: newColor };
                              }
                              if (conn.isMutuallyLinked && conn.partner && m.id === conn.partner.id) {
                                return { ...m, connectionColor: newColor };
                              }
                              return m;
                            }),
                            true
                          );
                        }}
                        style={{ width: '40px', height: '20px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', cursor: 'pointer', background: 'none', padding: 0 }}
                      />
                    </div>
                    <button className="btn-cyber danger" style={{ padding: '2px 6px', fontSize: '9px' }} disabled={!canLink} onClick={() => {
                      onMarkersChange(
                        markers.map(m => {
                          if (m.id === activeNoteMarker.id) {
                            const { linkedWarpId, ...rest } = m;
                            return rest;
                          }
                          // Also remove link back from partner if mutually linked
                          if (conn.partner && m.id === conn.partner.id && m.linkedWarpId === activeNoteMarker.id) {
                            const { linkedWarpId, ...rest } = m;
                            return rest;
                          }
                          return m;
                        }),
                        true
                      );
                    }}>
                      Remove Target
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      className="btn-cyber"
                      style={{ width: '100%', padding: '4px', fontSize: '9px', clipPath: 'none' }}
                      disabled={!canLink}
                      onClick={() => setWarpLinkMode(warpLinkMode === 'idle' ? 'selecting-bi' : 'idle')}
                    >
                      {warpLinkMode === 'selecting-bi' ? '... ターゲットをクリック (双方向)' : '↔ マップから選択 (双方向)'}
                    </button>
                    <button
                      className="btn-cyber"
                      style={{ width: '100%', padding: '4px', fontSize: '9px', clipPath: 'none' }}
                      disabled={!canLink}
                      onClick={() => setWarpLinkMode(warpLinkMode === 'idle' ? 'selecting-oneway' : 'idle')}
                    >
                      {warpLinkMode === 'selecting-oneway' ? '... ターゲットをクリック (片道)' : '→ マップから選択 (片道)'}
                    </button>
                    <select
                      className="input-cyber"
                      style={{ width: '100%', fontSize: '10px', padding: '4px' }}
                      value={warpLinkTargetId}
                      disabled={!canLink}
                      onChange={(e) => setWarpLinkTargetId(e.target.value)}
                    >
                      <option value="">{t('-- またはドロップダウンで選択 --')}</option>
                      {markers
                        .filter(m => {
                          if (m.id === activeNoteMarker.id) return false;
                          if (activeNoteMarker.type === 'warp' || activeNoteMarker.type === 'iwarp') {
                            return m.type === 'warp' || m.type === 'iwarp';
                          }
                          return m.type === activeNoteMarker.type;
                        })
                        .map(m => (
                          <option key={m.id} value={m.id}>
                            {(m.type === 'warp' || m.type === 'iwarp') ? '🌀' : '🪜'} {m.note.trim() ? m.note : `${m.type === 'iwarp' ? 'iWarp' : m.type === 'warp' ? 'Warp' : 'Stairs'} #${m.id.substring(m.id.length - 4)}`} (X:{m.x} Y:{m.y})
                          </option>
                        ))
                      }
                    </select>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '9px', clipPath: 'none' }} disabled={!canLink || !warpLinkTargetId} onClick={() => {
                        const partnerId = warpLinkTargetId;
                        const partnerMarker = markers.find(mk => mk.id === partnerId);
                        const canBidirectional = !partnerMarker?.linkedWarpId
                          || partnerMarker.linkedWarpId === activeNoteMarker.id;
                        onMarkersChange(
                          markers.map(m => {
                            if (m.id === activeNoteMarker.id) {
                              return { ...m, linkedWarpId: partnerId };
                            }
                            if (canBidirectional && m.id === partnerId) {
                              return { ...m, linkedWarpId: activeNoteMarker.id };
                            }
                            return m;
                          }),
                          true
                        );
                        setWarpLinkTargetId('');
                      }}>
                        ↔ 双方向
                      </button>
                      <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '9px', clipPath: 'none' }} disabled={!canLink || !warpLinkTargetId} onClick={() => {
                        const partnerId = warpLinkTargetId;
                        onMarkersChange(
                          markers.map(m => {
                            if (m.id === activeNoteMarker.id) {
                              return { ...m, linkedWarpId: partnerId };
                            }
                            return m;
                          }),
                          true
                        );
                        setWarpLinkTargetId('');
                      }}>
                        → 片道
                      </button>
                    </div>
                  </div>
                )}

                {/* Waypoint controls - visible when connection exists */}
                {conn.hasLink && conn.primary && conn.partner && (
                  <>
                    <div style={{ fontSize: '10px', color: '#7ec8e3', marginTop: '8px', marginBottom: '4px' }}>
                      経由点操作:
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-cyber success"
                        style={{ flex: 1, padding: '4px 6px', fontSize: '9px', clipPath: 'none' }}
                        disabled={!canLink}
                        onClick={() => {
                          const primary = conn.primary!;
                          const partner = conn.partner!;
                          const waypoints = (primary.warpWaypoints || []).filter((wp): wp is Point => wp !== null && wp !== undefined);
                          
                          if (!conn.isReversed) {
                            const startPt = waypoints.length > 0
                              ? waypoints[waypoints.length - 1]
                              : { x: primary.x, y: primary.y };
                            const endPt = { x: partner.x, y: partner.y };
                            const midpoint = {
                              x: Math.round((startPt.x + endPt.x) / 2),
                              y: Math.round((startPt.y + endPt.y) / 2)
                            };
                            onMarkersChange(
                              markers.map(m => {
                                if (m.id === primary.id) return { ...m, warpWaypoints: [...waypoints, midpoint] };
                                if (conn.isMutuallyLinked && m.id === partner.id) return { ...m, warpWaypoints: [] };
                                return m;
                              }),
                              true
                            );
                          } else {
                            const startPt = { x: activeNoteMarker.x, y: activeNoteMarker.y };
                            const endPt = waypoints.length > 0
                              ? waypoints[0]
                              : { x: partner.x, y: partner.y };
                            const midpoint = {
                              x: Math.round((startPt.x + endPt.x) / 2),
                              y: Math.round((startPt.y + endPt.y) / 2)
                            };
                            onMarkersChange(
                              markers.map(m => {
                                if (m.id === primary.id) return { ...m, warpWaypoints: [midpoint, ...waypoints] };
                                if (conn.isMutuallyLinked && m.id === activeNoteMarker.id) return { ...m, warpWaypoints: [] };
                                return m;
                              }),
                              true
                            );
                          }
                        }}
                      >
                        経由点を追加
                      </button>
                      <button
                        type="button"
                        className="btn-cyber danger"
                        style={{ flex: 1, padding: '4px 6px', fontSize: '9px', clipPath: 'none' }}
                        disabled={!canLink || !(conn.primary.warpWaypoints && conn.primary.warpWaypoints.length > 0)}
                        onClick={() => {
                          const primary = conn.primary!;
                          const partner = conn.partner!;
                          const waypoints = (primary.warpWaypoints || []).filter((wp): wp is Point => wp !== null && wp !== undefined);
                          if (waypoints.length > 0) {
                            onMarkersChange(
                              markers.map(m => {
                                if (m.id === primary.id) {
                                  const nextWaypoints = conn.isReversed
                                    ? waypoints.slice(1)
                                    : waypoints.slice(0, -1);
                                  return { ...m, warpWaypoints: nextWaypoints };
                                }
                                if (conn.isMutuallyLinked && (m.id === partner.id || m.id === activeNoteMarker.id)) {
                                  if (m.id !== primary.id) return { ...m, warpWaypoints: [] };
                                }
                                return m;
                              }),
                              true
                            );
                          }
                        }}
                      >
                        最後を削除
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          
          {/* Appearance (Direction & Size) configuration for Info & Boss markers */}
          {(isInfoType(activeNoteMarker.type) || activeNoteMarker.type === 'boss') && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: '#7ec8e3' }}>{t('ポップアップ表示設定:')}</div>
              
              {/* Reset offset button */}
              <button
                type="button"
                className="btn-cyber"
                style={{ padding: '4px 8px', fontSize: '10px', width: '100%', clipPath: 'none' }}
                onClick={() => setPopupOffset({ x: 0, y: -120 })}
              >
                表示位置をデフォルト（上部）にリセット
              </button>

              {/* Width slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#b0b0b0' }}>
                  <span>{t('ポップアップの幅:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{popupWidth}px</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="500"
                  step="10"
                  value={popupWidth}
                  onChange={(e) => setPopupWidth(parseInt(e.target.value))}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                />
              </div>

              {/* Height slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#b0b0b0' }}>
                  <span>{t('ポップアップの高さ:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{popupHeight === 0 ? 'AUTO' : `${popupHeight}px`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="10"
                  value={popupHeight}
                  onChange={(e) => setPopupHeight(parseInt(e.target.value))}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                />
              </div>
            </div>
          )}

          </div>
          )}

          <div className="note-popover-buttons" style={{ marginTop: '8px' }}>
            <button className="btn-cyber danger" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setActiveNoteMarkerId(null)}>
              Cancel
            </button>
            <button className="btn-cyber success" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => handleSaveNote()}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* 電話ボックス状態HUD (左下) — 開閉トグル付きコンパクト版 */}
      {showPhoneBoxHud && (() => {
        const phoneMarkers = markers.filter(m => m.type === 'phone');
        const matchNote = (note: string, prefix: string) => note.trim().startsWith(prefix);
        const sortByIdx = (prefix: string) => (a: HeistMarker, b: HeistMarker) => {
          const na = parseInt((a.note || '').match(new RegExp(prefix + '-(\\d+)'))?.[1] || '0');
          const nb = parseInt((b.note || '').match(new RegExp(prefix + '-(\\d+)'))?.[1] || '0');
          return na - nb;
        };
        const findByIdx = (list: HeistMarker[], prefix: string, idx: number) =>
          list.find(m => parseInt((m.note || '').match(new RegExp(prefix + '-(\\d+)'))?.[1] || '0') === idx);

        const lg1 = phoneMarkers.filter(m => matchNote(m.note || '', 'LG1')).sort(sortByIdx('LG1'));
        const lg2 = phoneMarkers.filter(m => matchNote(m.note || '', 'LG2')).sort(sortByIdx('LG2'));
        const lg3 = phoneMarkers.filter(m => matchNote(m.note || '', 'LG3')).sort(sortByIdx('LG3'));

        const handleToggle = (marker: HeistMarker) => {
          if (marker.phoneLocked) return;
          onMarkersChange(
            markers.map(mk => mk.id === marker.id ? { ...mk, phoneActive: !mk.phoneActive } : mk),
            true
          );
        };

        // 起動中件数
        const activeCount = phoneMarkers.filter(m => m.phoneActive && !m.phoneLocked).length;

        return (
          <div className="phone-box-hud">
            {!phoneBoxHudOpen && (
              <button
                className="phone-hud-toggle"
                onClick={() => onPhoneBoxHudOpenChange?.(true)}
                title={`電話ボックスを開く (起動中: ${activeCount})`}
              >
                ☎{activeCount}
              </button>
            )}

            {phoneBoxHudOpen && (
              <div className="phone-hud-body">
                <button
                  className="phone-hud-close"
                  onClick={() => onPhoneBoxHudOpenChange?.(false)}
                  title="閉じる"
                >
                  ×
                </button>
                <div className="phone-hud-rows">
                  {/* LG1: UP=4, DOWN=1, LEFT=3, RIGHT=2 */}
                  <div className="phone-hud-grid">
                    <div />
                    <PhoneHudCell marker={findByIdx(lg1, 'LG1', 4)} onToggle={handleToggle} />
                    <div />
                    <PhoneHudCell marker={findByIdx(lg1, 'LG1', 3)} onToggle={handleToggle} />
                    <div className="phone-hud-area-label">LG1</div>
                    <PhoneHudCell marker={findByIdx(lg1, 'LG1', 2)} onToggle={handleToggle} />
                    <div />
                    <PhoneHudCell marker={findByIdx(lg1, 'LG1', 1)} onToggle={handleToggle} />
                    <div />
                  </div>

                  {/* LG2: UP=4, DOWN=1, LEFT=2, RIGHT=3 */}
                  {lg2.length > 0 && (
                    <div className="phone-hud-grid">
                      <div />
                      <PhoneHudCell marker={findByIdx(lg2, 'LG2', 4)} onToggle={handleToggle} />
                      <div />
                      <PhoneHudCell marker={findByIdx(lg2, 'LG2', 2)} onToggle={handleToggle} />
                      <div className="phone-hud-area-label">LG2</div>
                      <PhoneHudCell marker={findByIdx(lg2, 'LG2', 3)} onToggle={handleToggle} />
                      <div />
                      <PhoneHudCell marker={findByIdx(lg2, 'LG2', 1)} onToggle={handleToggle} />
                      <div />
                    </div>
                  )}

                  {/* LG3: 下(1) 右(2) 上(locked) */}
                  {lg3.length > 0 && (
                    <div className="phone-hud-grid">
                      <div />
                      <PhoneHudCell marker={lg3.find(m => m.phoneLocked)} onToggle={handleToggle} />
                      <div />
                      <div />
                      <div className="phone-hud-area-label">LG3</div>
                      <PhoneHudCell marker={findByIdx(lg3, 'LG3', 2)} onToggle={handleToggle} />
                      <div />
                      <PhoneHudCell marker={findByIdx(lg3, 'LG3', 1)} onToggle={handleToggle} />
                      <div />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 右下HUD (ズームコントロール) */}
      {showBottomRightHud && (
      <div className="zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Zoom percentage display */}
        <div style={{
          padding: '0 8px',
          fontSize: '11px',
          fontWeight: 700,
          height: '28px',
          lineHeight: '28px',
          background: 'rgba(10, 15, 28, 0.85)',
          color: 'var(--cyan-neon)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          minWidth: '48px',
          textAlign: 'center',
          userSelect: 'none'
        }}>
          {Math.round(zoom * 100)}%
        </div>

        <button className="zoom-btn" onClick={() => handleZoom(1.2)} title="Zoom In">
          <ZoomIn size={14} />
        </button>
        <button className="zoom-btn" onClick={() => handleZoom(0.8)} title="Zoom Out">
          <ZoomOut size={14} />
        </button>
        <button className="zoom-btn" onClick={resetView} title="Reset View (1x)">
          <Maximize2 size={14} />
        </button>
      </div>
      )}

      {/* Media lightbox — click on image/video to enlarge */}
      <MediaLightbox media={zoomedMedia} onClose={() => setZoomedMedia(null)} />
    </div>
  );
};

/** 電話ボックスHUDのセル (コンポーネント外で定義 → Reactが毎回新型として扱わない) */
function PhoneHudCell({ marker, onToggle }: { marker?: HeistMarker; onToggle: (m: HeistMarker) => void }) {
  if (!marker) return <div className="phone-hud-cell phone-hud-empty" />;
  const isActive = !!marker.phoneActive;
  const isLocked = !!marker.phoneLocked;
  return (
    <div
      className={`phone-hud-cell ${isActive ? 'phone-hud-active' : 'phone-hud-inactive'} ${isLocked ? 'phone-hud-locked' : ''}`}
      onClick={() => onToggle(marker)}
      title={`${marker.note || '電話ボックス'} ${isLocked ? '🔒常時起動' : isActive ? '📞起動中' : '☎停止中'}\nクリックでトグル`}
    >
      {isLocked ? '🔒' : isActive ? '📞' : '☎'}
    </div>
  );
}
