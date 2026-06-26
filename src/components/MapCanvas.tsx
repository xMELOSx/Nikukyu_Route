import React, { useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  type FloorType, 
  type DrawingStroke, 
  type HeistMarker, 
  type MarkerType, 
  type Point,
  type MediaItem,
  MARKER_META,
  PRESET_MAPS_META
} from '../utils/DataManager';
import { ZoomIn, ZoomOut, Maximize2, Move, Trash2 } from 'lucide-react';
import { buildAutoRoute, computeRouteTiming, interpolateRoute, playCheckpointSound, prewarmAudio, speakCheckpointTime, type RouteSegment } from '../utils/AutoRoute';

// TweetEmbed Component using official Twitter widgets SDK
const TweetEmbed: React.FC<{ url: string }> = ({ url }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(!!(window as any).twttr);

  useEffect(() => {
    if ((window as any).twttr) {
      setSdkReady(true);
      return;
    }

    let script = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('src', 'https://platform.twitter.com/widgets.js');
      script.setAttribute('charset', 'utf-8');
      script.setAttribute('async', 'true');
      document.head.appendChild(script);
    }

    const handleLoad = () => setSdkReady(true);
    script.addEventListener('load', handleLoad);
    return () => {
      script.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    if (sdkReady && (window as any).twttr) {
      const tweetId = url.split('/status/')[1]?.split('?')[0];
      if (tweetId) {
        (window as any).twttr.widgets.createTweet(tweetId, containerRef.current, {
          theme: 'dark',
          align: 'center'
        }).then((el: any) => {
          if (!active && el) {
            el.remove();
          }
        }).catch((err: any) => {
          console.error('Failed to create tweet widget:', err);
        });
      } else {
        renderFallback();
      }
    } else {
      renderFallback();
    }

    function renderFallback() {
      if (!containerRef.current) return;
      const placeholder = document.createElement('div');
      placeholder.className = 'twitter-tweet-placeholder';
      placeholder.style.padding = '16px';
      placeholder.style.textAlign = 'center';
      placeholder.style.color = 'var(--text-muted, #888)';
      placeholder.style.fontSize = '12px';
      
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View Tweet on X / Twitter';
      link.style.color = 'var(--accent-cyan, #00f0ff)';
      link.style.textDecoration = 'underline';
      link.style.display = 'block';
      link.style.marginTop = '4px';

      placeholder.textContent = 'Loading Tweet...';
      placeholder.appendChild(link);
      containerRef.current.appendChild(placeholder);
    }

    return () => {
      active = false;
    };
  }, [url, sdkReady]);

  return <div ref={containerRef} className="twitter-tweet-container" />;
};

interface MapCanvasProps {
  floor: FloorType;
  strokes: DrawingStroke[];
  markers: HeistMarker[];
  customBg: string | null;
  toolMode: 'select' | 'draw' | 'erase' | 'pan' | 'add-marker';
  activeMarkerType: MarkerType | null;
  strokeColor: string;
  strokeWidth: number;
  strokeType: 'solid' | 'dashed';
  drawMode?: 'free' | 'smooth' | 'straight';
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  onMarkersChange: (markers: HeistMarker[], shouldPushHistory?: boolean) => void;
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
  disablePinsDuringDraw?: boolean;
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
  globalMarkerIds?: string[];
  onShowGlobalMarker?: (id: string) => void;
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
    waitRemaining: number; // seconds left in initial wait (0 when not waiting)
    checkpoints: { elapsed: number; label: string; passed: boolean }[];
  }) => void;
  // Auto-route command from parent — when the ts changes, the action is run.
  autoRouteCommand?: { action: 'start' | 'pause' | 'resume' | 'reset' | 'seek'; ts: number; seekTo?: number } | null;
  // Auto-route settings — read at the moment a command is processed
  autoRouteSettings?: {
    waitEnabled: boolean;
    waitSeconds: number;
    speedMultiplier: 1 | 2 | 3 | 5;
    followCamera: boolean;
  };
  // Follow camera state — when true, the view scrolls to keep the current
  // position slightly below center during the auto-route animation.
  followCamera?: boolean;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  floor,
  strokes,
  markers,
  customBg,
  toolMode,
  activeMarkerType,
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
  disablePinsDuringDraw = true,
  onMarkersDragStart,
  onMarkersDragEnd,
  markerScale = 30,
  onHideGlobalMarker,
  hiddenMarkers = [],
  hiddenMarkerTypes = [],
  showDetectionRanges = false,
  stopMarkerThreshold = 12,
  movementMarkerThreshold = 20,
  warpMarkerThreshold = 12,
  globalMarkerIds = [],
  onShowGlobalMarker,
  leftSidebarCollapsed = false,
  rightSidebarCollapsed = false,
  targetDurationSeconds,
  onAutoRouteStatusChange,
  autoRouteCommand,
  autoRouteSettings,
  followCamera = false
}) => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname === '::1';

  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Helper to resolve connection properties between Warp/Stairs
  const getWarpConnectionInfo = (m: HeistMarker, allMarkers: HeistMarker[]) => {
    if (m.type !== 'warp' && m.type !== 'iwarp' && m.type !== 'stairs') {
      return { hasLink: false, isPrimary: false, primary: null, partner: null, isReversed: false, isMutuallyLinked: false };
    }

    // 1. Find partner (destination m.linkedWarpId or incoming link pointing to m)
    let partner = m.linkedWarpId ? allMarkers.find(mk => mk.id === m.linkedWarpId) : null;
    let isIncoming = false;
    if (!partner) {
      partner = allMarkers.find(mk => mk.linkedWarpId === m.id && mk.floor === m.floor && (mk.type === 'warp' || mk.type === 'iwarp' || mk.type === 'stairs'));
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
  const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint'].includes(type);
  // Helpers to check type family (global or individual variant)
  const isInfoType = (type: string) => type === 'info' || type === 'iinfo';
  const isNoteType = (type: string) => type === 'note' || type === 'inote';
  const isTextType = (type: string) => type === 'text' || type === 'itext';

  const detectMediaType = (url: string): MediaItem['type'] => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('x.com') || url.includes('twitter.com')) return 'x-embed';
    if (url.includes('.webm') || url.includes('video/webm')) return 'webm';
    return 'image';
  };

  const [mediaUrlInputs, setMediaUrlInputs] = useState<Record<string, string>>({});

  const renderMediaManager = (m: HeistMarker) => {
    const inputVal = mediaUrlInputs[m.id] || '';
    const submitUrl = () => {
      if (!inputVal.trim()) return;
      const newItem: MediaItem = { id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, url: inputVal.trim(), type: detectMediaType(inputVal.trim()), description: '' };
      const next = [...(m.mediaItems || []), newItem];
      onMarkersChange(markers.map(mk => mk.id === m.id ? { ...mk, mediaItems: next } : mk));
      setMediaItems(next);
      setMediaUrlInputs(prev => ({ ...prev, [m.id]: '' }));
    };
    return (
      <div style={{ marginTop: '6px', borderTop: '1px dashed rgba(79, 195, 247, 0.2)', paddingTop: '6px' }}>
        {m.mediaItems && m.mediaItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '6px' }}>
            {m.mediaItems.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', background: 'rgba(79,195,247,0.05)', borderRadius: '3px' }}>
                <span style={{ fontSize: '8px', color: '#7ec8e3', textTransform: 'uppercase', minWidth: '24px' }}>{item.type === 'youtube' ? 'YT' : item.type === 'x-embed' ? 'X' : item.type}</span>
                <input type="text" className="input-cyber" style={{ flex: 1, fontSize: '9px', padding: '1px 4px' }} placeholder="説明" value={item.description || ''} onChange={(e) => {
                  const next = [...(m.mediaItems || [])];
                  next[idx] = { ...next[idx], description: e.target.value };
                  onMarkersChange(markers.map(mk => mk.id === m.id ? { ...mk, mediaItems: next } : mk));
                  setMediaItems(next);
                }} />
                <span style={{ cursor: 'pointer', color: 'var(--red-neon)', fontWeight: 'bold', fontSize: '10px' }} onClick={() => {
                  const removed = (m.mediaItems || [])[idx];
                  const next = (m.mediaItems || []).filter((_, i) => i !== idx);
                  onMarkersChange(markers.map(mk => mk.id === m.id ? { ...mk, mediaItems: next } : mk));
                  setMediaItems(next);
                  // If the media was uploaded to the server, delete the file too
                  if (removed && removed.url && removed.url.includes('/uploads/')) {
                    const filename = removed.url.split('/uploads/').pop() || '';
                    if (filename) {
                      fetch('/api/upload-media', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename })
                      }).catch(() => { /* ignore */ });
                    }
                  }
                }}>×</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button type="button" className="btn-cyber" style={{ flex: 1, padding: '3px', fontSize: '9px', clipPath: 'none' }} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,video/webm';
            input.multiple = true;
            input.onchange = async () => {
              if (!input.files) return;
              for (const file of Array.from(input.files)) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                  const res = await fetch('/api/upload-media', { method: 'POST', body: formData });
                  const data = await res.json();
                  if (data.url) {
                    const isVideo = file.type === 'video/webm' || file.name.endsWith('.webm');
                    const newItem: MediaItem = { id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, url: data.url, type: isVideo ? 'webm' : 'image', description: '' };
                    const next = [...(m.mediaItems || []), newItem];
                    onMarkersChange(markers.map(mk => mk.id === m.id ? { ...mk, mediaItems: next } : mk));
                    setMediaItems(next);
                  }
                } catch (err) { console.error('Upload failed:', err); }
              }
            };
            input.click();
          }}>📎 添付</button>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <input type="text" className="input-cyber" style={{ flex: 1, fontSize: '9px', padding: '3px 4px' }} placeholder="画像/動画/X/YouTube URL" value={inputVal} onChange={(e) => setMediaUrlInputs(prev => ({ ...prev, [m.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }} />
          <button type="button" className="btn-cyber" style={{ padding: '3px 8px', fontSize: '9px', clipPath: 'none' }} onClick={submitUrl}>追加</button>
        </div>
      </div>
    );
  };

  // Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  // Drag-and-drop Marker State
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [draggingWaypoint, setDraggingWaypoint] = useState<{ markerId: string; index: number } | null>(null);

  // Note Popover State
  const [activeNoteMarkerId, setActiveNoteMarkerId] = useState<string | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [noteText, setNoteText] = useState('');
  const [infoLabel, setInfoLabel] = useState('');
  const [infoMediaUrl, setInfoMediaUrl] = useState('');
  const [infoMediaType, setInfoMediaType] = useState<'image' | 'webm' | 'x-embed' | 'youtube'>('image');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [zoomedMedia, setZoomedMedia] = useState<{ url: string; type: 'image' | 'webm' | 'youtube' } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const lightboxDragRef = useRef(false);
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
  const [longPickingDurationSeconds, setLongPickingDurationSeconds] = useState(7);
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

  // Auto-route state
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

  // Target states for smooth scrolling (use refs to avoid React 18 batching issues)
  const targetZoomRef = useRef<number>(1);
  const targetPanRef = useRef<Point>({ x: 0, y: 0 });
  const animFrameIdRef = useRef<number | null>(null);
  const animPanRef = useRef<Point>({ x: 0, y: 0 });
  const animZoomRef = useRef<number>(1);
  // Latest followCamera value — read by the tick so toggling follow during
  // playback takes effect immediately (avoids stale closure).
  const followCameraRef = useRef<boolean>(false);
  // Sync state to anim refs whenever state changes
  animPanRef.current = pan;
  animZoomRef.current = zoom;
  followCameraRef.current = followCamera;

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, []);

  // On desktop (or any layout where the left pane starts open), markers were
  // saved with the left pane open, so opening the page on mobile (where the
  // left pane starts closed) leaves them visually offset by the pane width.
  // Initializing the prev ref to `false` makes the shift useEffect run on
  // mount and pull those markers left by 280px to compensate.
  // The right pane ref still matches the current state, so its shift only
  // fires on subsequent toggles (preserving the original behavior).
  const prevLeftCollapsedRef = useRef(false);
  const prevRightCollapsedRef = useRef(rightSidebarCollapsed);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  // Tracks whether the initial shift for the current sidebar layout has been
  // applied. Global markers are loaded asynchronously in App.tsx, so on the
  // first useEffect run `markersRef.current` is still empty. The effect must
  // re-run once the markers are populated; `hasAppliedInitialShiftRef`
  // ensures we shift exactly once per layout, not on every re-render.
  const hasAppliedInitialShiftRef = useRef(false);

  useEffect(() => {
    const prevLeft = prevLeftCollapsedRef.current;
    const prevRight = prevRightCollapsedRef.current;

    const currentMarkers = markersRef.current;
    if (currentMarkers.length === 0) return;

    const sidebarStateChanged = prevLeft !== leftSidebarCollapsed || prevRight !== rightSidebarCollapsed;
    if (hasAppliedInitialShiftRef.current && !sidebarStateChanged) return;

    const midX = window.innerWidth / 2;

    // Compute the shifted markers. Track whether any marker actually
    // changed so we only call `onMarkersChange` when a real shift occurred.
    // Otherwise the call would re-enter `updateMarkers` in App.tsx and
    // overwrite `globalMarkers` (and its localStorage entry) with whatever
    // subset the current markers cover — wiping data on initial mount.
    let anyChanged = false;
    const next = currentMarkers.map(m => {
      if (!m.textFixedPosition || m.floor !== floor) return m;
      const side: 'left' | 'right' =
        m.trackSide === 'auto' || !m.trackSide
          ? (m.x < midX ? 'left' : 'right')
          : m.trackSide;

      if (prevLeft !== leftSidebarCollapsed && side === 'left') {
        const shift = leftSidebarCollapsed ? -280 : 280;
        anyChanged = true;
        return { ...m, x: m.x + shift };
      }
      if (prevRight !== rightSidebarCollapsed && side === 'right') {
        const shift = rightSidebarCollapsed ? 340 : -340;
        anyChanged = true;
        return { ...m, x: m.x + shift };
      }
      return m;
    });

    prevLeftCollapsedRef.current = leftSidebarCollapsed;
    prevRightCollapsedRef.current = rightSidebarCollapsed;
    hasAppliedInitialShiftRef.current = true;

    if (!anyChanged) return;
    onMarkersChange(next);
  }, [leftSidebarCollapsed, rightSidebarCollapsed, markers.length]);

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
      if (prevZoom === newZoom) return;

      const wRect = wrapper.getBoundingClientRect();
      // アンカー: 可視エリア中央（wrapper 中心）。画面基準の座標。
      const anchorX = wRect.left + wRect.width / 2;
      const anchorY = wRect.top + wRect.height / 2;
      // wrapper 中心を基準としたアンカーオフセット
      const localCenterX = anchorX;
      const localCenterY = anchorY;
      // アンカー位置にある map 座標を逆算
      //   screenX = localCenterX + prevZoom * (mapX - 800) + prevPan.x
      //   => mapX = 800 + (anchorX - localCenterX - prevPan.x) / prevZoom
      const mapX = 800 + (anchorX - localCenterX - prevPan.x) / prevZoom;
      const mapY = 2275 + (anchorY - localCenterY - prevPan.y) / prevZoom;
      // 同じ map 座標が新しい zoom でもアンカー位置に来るように newPan を計算
      //   anchorX = localCenterX + newZoom * (mapX - 800) + newPan.x
      //   => newPan.x = anchorX - localCenterX - newZoom * (mapX - 800)
      const newPanX = anchorX - localCenterX - newZoom * (mapX - 800);
      const newPanY = anchorY - localCenterY - newZoom * (mapY - 2275);

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

  // Handle focusTrigger updates
  useEffect(() => {
    if (focusTrigger) {
      const marker = markers.find(m => m.id === focusTrigger.id);
      if (marker) {
        // Update current position indicator
        setCurrentPosition({ x: marker.x, y: marker.y });

        if (marker.scrollConfig) {
          // If custom scrollConfig is registered, use it directly
          startSmoothScroll(
            { x: marker.scrollConfig.x, y: marker.scrollConfig.y },
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
  }, [focusTrigger, markers]);

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

  // ---- Auto-route logic ----
  const startAutoRoute = () => {
    setAutoRouteError(null);
    // Pre-warm the AudioContext on this user gesture so checkpoint sounds
    // can play without a separate click later (browsers block audio until
    // a user interaction resumes the context).
    prewarmAudio();
    const startMarker = markers.find(m => m.type === 'start');
    if (!startMarker) {
      setAutoRouteError('スタートマーカー (🐾) が見つかりません。グローバルマーカーに追加してください。');
      return;
    }
    const routeSegments = buildAutoRoute(strokes, markers, startMarker, {
      stopMarkerThreshold,
      movementMarkerThreshold,
      warpMarkerThreshold
    }, hiddenMarkers || []);
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
    // Multiplier scales the speed only; totalTime stays at base so the
    // displayed total is always the natural route duration. Elapsed is
    // advanced in route-time units (mult × wall-clock) so it matches
    // the base total when the route completes.
    const timing = { ...baseTiming, speed: baseTiming.speed * mult, totalTime: baseTiming.totalTime };
    const waitEnabled = autoRouteSettings?.waitEnabled ?? false;
    const waitSeconds = autoRouteSettings?.waitSeconds ?? 0;
    setAutoRouteSegments(routeSegments);
    setAutoRouteTiming(timing);
    setAutoRouteElapsed(0);
    setAutoRouteActive(true);
    setAutoRouteRunning(!waitEnabled); // Paused during initial wait
    autoRouteStartTimeRef.current = performance.now();
    autoRouteElapsedAtStartRef.current = 0;
    autoRouteWaitUntilRef.current = waitEnabled ? performance.now() + waitSeconds * 1000 : 0;
    setCurrentPosition({ x: startMarker.x, y: startMarker.y });
    // Snap the view to the start marker immediately. The tick's follow
    // camera keeps it correct afterwards (when followCamera is on).
    if (followCamera && wrapperRef.current) {
      const W_v = wrapperRef.current.clientWidth;
      const H_v = wrapperRef.current.clientHeight;
      const tgtZoom = zoom || 1;
      const tgtPan = {
        x: W_v * 0.5 - 800 - (startMarker.x - 800) * tgtZoom,
        y: H_v * 0.6 - 2275 - (startMarker.y - 2275) * tgtZoom
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
    autoRouteElapsedAtStartRef.current = autoRouteElapsed;
  };

  const resetAutoRoute = () => {
    setAutoRouteRunning(false);
    setAutoRouteActive(false);
    setAutoRouteElapsed(0);
    setAutoRouteSegments([]);
    setAutoRouteTiming({ totalTime: 0, totalDistance: 0, totalStopTime: 0, speed: 0 });
    if (autoRouteAnimRef.current) cancelAnimationFrame(autoRouteAnimRef.current);
  };

  // Auto-route animation loop
  // We use `autoRouteActive` (not `autoRouteRunning`) as the gate so the
  // tick keeps running during the initial wait — this is what updates the
  // countdown UI, and it lets the loop auto-resume once the wait ends
  // without needing to call setAutoRouteRunning(true) (which would re-fire
  // this effect and cancel the in-flight frame).
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

      // Initial-wait countdown: don't advance the position yet, but keep
      // ticking so the countdown UI can update.
      if (autoRouteWaitUntilRef.current > 0 && now < autoRouteWaitUntilRef.current) {
        autoRouteAnimRef.current = requestAnimationFrame(tick);
        return;
      }
      if (autoRouteWaitUntilRef.current > 0 && now >= autoRouteWaitUntilRef.current) {
        // Wait finished — start the actual animation now
        autoRouteWaitUntilRef.current = 0;
        autoRouteStartTimeRef.current = now;
        autoRouteElapsedAtStartRef.current = 0;
        // Auto-resume after the wait completes. setAutoRouteRunning will
        // re-fire this effect's cleanup, but the new tick is already
        // scheduled below — the cleanup just cancels any older frame.
        setAutoRouteRunning(true);
      }

      // If the user paused, just keep ticking so we can resume seamlessly.
      if (!autoRouteRunning) {
        autoRouteAnimRef.current = requestAnimationFrame(tick);
        return;
      }

      const realElapsed = (now - autoRouteStartTimeRef.current) / 1000;
      // Advance elapsed in route-time units so the display matches totalTime.
      // Multiplier = current speed / base speed (1, 2, or 3).
      const baseSpd = autoRouteBaseTiming.speed || autoRouteTiming.speed || 1;
      const mult = autoRouteTiming.speed / baseSpd;
      const elapsed = autoRouteElapsedAtStartRef.current + realElapsed * mult;
      if (elapsed >= autoRouteTiming.totalTime) {
        setAutoRouteElapsed(autoRouteTiming.totalTime);
        const last = autoRouteSegments[autoRouteSegments.length - 1];
        setCurrentPosition({ x: last.end.x, y: last.end.y });
        setAutoRouteRunning(false);
        return;
      }
      setAutoRouteElapsed(elapsed);
      const interp = interpolateRoute(autoRouteSegments, autoRouteTiming.speed, autoRouteTiming.totalTime, elapsed);
      if (interp) {
        setCurrentPosition({ x: interp.position.x, y: interp.position.y });

        // Checkpoint pass: when the current segment transitions and the
        // PREVIOUS segment ended at a checkpoint, play the configured sound.
        // (The speed is calculated from the first checkpoint's target, so
        //  arrival is always on-time by construction — we don't compare
        //  against the target here.)
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
              // Voice announcement: "X秒地点です" — uses the global
              // checkpointVoiceOn flag (default ON) so the user can disable
              // it separately from the beep sound.
              if (cpTarget > 0 && checkpointVoiceOn) {
                speakCheckpointTime(cpTarget, passedMarker.note?.trim() || undefined);
              }
            }
          }
        }
        autoRoutePrevSegmentIdRef.current = segId;

        // Follow camera: scroll the view to keep the current position
        // slightly below center (60% from top).
        // Read followCamera from a ref so toggling follow during playback
        // takes effect on the very next frame.
        if (followCameraRef.current) {
          const wrapper = wrapperRef.current;
          if (wrapper) {
            const W_v = wrapper.clientWidth;
            const H_v = wrapper.clientHeight;
            // Use animZoomRef to avoid stale closure (zoom state can lag
            // when the user changes zoom mid-animation).
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

  // Listen for auto-route commands from parent (e.g. プレイデータ tab)
  useEffect(() => {
    if (!autoRouteCommand) return;
    if (autoRouteCommand.action === 'start') startAutoRoute();
    else if (autoRouteCommand.action === 'pause') pauseAutoRoute();
    else if (autoRouteCommand.action === 'resume') resumeAutoRoute();
    else if (autoRouteCommand.action === 'reset') resetAutoRoute();
    else if (autoRouteCommand.action === 'seek' && autoRouteCommand.seekTo !== undefined) {
      // Jump the animation to a specific elapsed time (timeline click).
      // Update the visual position immediately so there is no perceptible
      // lag between the click and the marker moving on the map.
      // Guard against: no segments built yet, invalid seekTo (NaN), zero totalTime.
      if (!isFinite(autoRouteCommand.seekTo)) return;
      if (autoRouteSegments.length === 0 || autoRouteTiming.totalTime <= 0) return;
      const t = Math.max(0, Math.min(autoRouteTiming.totalTime, autoRouteCommand.seekTo));
      setAutoRouteElapsed(t);
      autoRouteStartTimeRef.current = performance.now();
      autoRouteElapsedAtStartRef.current = t;
      autoRoutePrevSegmentIdRef.current = '';
      try {
        const interp = interpolateRoute(autoRouteSegments, autoRouteTiming.speed, autoRouteTiming.totalTime, t);
        if (interp && interp.position && isFinite(interp.position.x) && isFinite(interp.position.y)) {
          setCurrentPosition({ x: interp.position.x, y: interp.position.y });
          if (followCamera && wrapperRef.current) {
            const W_v = wrapperRef.current.clientWidth;
            const H_v = wrapperRef.current.clientHeight;
            // Use the ref for zoom to avoid stale closure issues when zoom
            // changes mid-animation. animZoomRef is synced every render.
            const tgtZoom = (animZoomRef.current && isFinite(animZoomRef.current)) ? animZoomRef.current : 1;
            // Place current position at 50% horizontal, 60% vertical (center-bottom)
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

  // Push auto-route status updates to parent for the プレイデータ tab UI
  useEffect(() => {
    if (!onAutoRouteStatusChange) return;
    const sendStatus = () => {
      const waitRemaining = autoRouteWaitUntilRef.current > 0
        ? Math.max(0, (autoRouteWaitUntilRef.current - performance.now()) / 1000)
        : 0;
      // Build checkpoint list with their elapsed times for timeline display.
      // Use the checkpoint's TARGET time directly (set by the user) so the
      // timeline line is at the correct position regardless of per-segment
      // speed variations. Fall back to distance-based estimate if no target.
      const cpList: { elapsed: number; label: string; passed: boolean }[] = [];
      for (const seg of autoRouteSegments) {
        if (seg.markerType === 'checkpoint') {
          const m = markers.find(mk => mk.id === seg.markerId);
          const cpTarget = (seg as any)._checkpointTarget as number;
          // Use the user-set target time directly. This is the "contract":
          // the auto-route promises to reach this point in exactly this time.
          const elapsedAt = cpTarget > 0
            ? cpTarget
            : seg.cumulativeDistance / Math.max(1, autoRouteTiming.speed) + seg.cumulativeStopTime;
          cpList.push({
            elapsed: elapsedAt,
            label: m?.note || 'Checkpoint',
            passed: autoRouteElapsed >= elapsedAt
          });
        }
      }

      onAutoRouteStatusChange({
        active: autoRouteActive,
        running: autoRouteRunning,
        elapsed: autoRouteElapsed,
        totalTime: autoRouteTiming.totalTime,
        totalDistance: autoRouteTiming.totalDistance,
        totalStopTime: autoRouteTiming.totalTime - autoRouteTiming.totalDistance / Math.max(1, autoRouteTiming.speed),
        speed: autoRouteTiming.speed,
        error: autoRouteError,
        nextMarkerLabel: nextMarkerLabel(autoRouteSegments, autoRouteElapsed, autoRouteTiming.speed),
        waitRemaining,
        checkpoints: cpList
      });
    };
    sendStatus();
    // While the auto-route is active, poll every 100ms so the wait
    // countdown and elapsed time stay fresh in the parent UI.
    const interval = setInterval(sendStatus, 100);
    return () => clearInterval(interval);
  }, [autoRouteActive, autoRouteRunning, autoRouteElapsed, autoRouteTiming, autoRouteError, autoRouteSegments, onAutoRouteStatusChange]);

  // Spacebar toggles pause/resume while the auto-route is active.
  // Skips when focus is in an input/textarea so typing is unaffected.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!autoRouteActive) return;
      e.preventDefault();
      if (autoRouteRunning) pauseAutoRoute();
      else resumeAutoRoute();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRouteActive, autoRouteRunning]);

  // Apply speed multiplier changes mid-animation. Only the speed changes;
  // totalTime/stopTime stay at base so the displayed totals never change.
  // Elapsed is preserved so the current position is maintained.
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
    // Keep elapsed time the same so the current position is preserved
    autoRouteStartTimeRef.current = performance.now();
    autoRouteElapsedAtStartRef.current = autoRouteElapsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRouteSettings?.speedMultiplier, autoRouteActive]);

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
  }, [strokes]);

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

  // Redraw all strokes on canvas
  const redrawStrokes = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, 1600, 4550);

    strokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;

      const isDashed = stroke.type === 'dashed';

      if (isDashed) {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      stroke.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      // No arrowhead drawn. Direction is conveyed by line continuity and the
      // auto-route animation, not by an arrow tip at the end of each line.
    });
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
      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
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

  // Auto-route helper: label of the next marker (for status display)
  const nextMarkerLabel = (segments: RouteSegment[], elapsed: number, speed: number): string => {
    if (segments.length === 0) return '';
    let remaining = elapsed;
    for (const seg of segments) {
      // Use the per-segment speed (if set) to match the actual auto-route timing.
      const segSpeed = seg.speed !== undefined && seg.speed > 0 ? seg.speed : speed;
      const travelTime = seg.distance / Math.max(segSpeed, 0.0001);
      if (remaining <= travelTime) return '';
      remaining -= travelTime;
      if (remaining <= seg.stopDuration) {
        // Currently stopping at this marker
        if (seg.markerType && MARKER_META[seg.markerType as keyof typeof MARKER_META]) {
          const meta = MARKER_META[seg.markerType as keyof typeof MARKER_META];
          return `${meta.emoji} ${meta.label} (停止中)`;
        }
        return seg.markerType || '';
      }
      remaining -= seg.stopDuration;
    }
    return '';
  };

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
      const localCenterX = wRect ? wRect.left + wRect.width / 2 : 0;
      const localCenterY = wRect ? wRect.top + wRect.height / 2 : 0;
      touchStartRef.current = {
        dist: Math.sqrt(dx * dx + dy * dy),
        zoom,
        pan: { x: animPanRef.current.x, y: animPanRef.current.y },
        midX: midX - localCenterX,
        midY: midY - localCenterY
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
      const scale = dist / ts.dist;
      const newZoom = Math.max(0.1, Math.min(5, ts.zoom * scale));
      if (newZoom === ts.zoom) return;
      // アンカーは 2 本指の中点（wrapper 中心からの相対位置）
      // screenX = 0 + newZoom * (mapX - 800) + newPan.x
      //   => mapX = 800 + (ts.midX - newPan.x) / ts.zoom
      //   => newPan.x = ts.midX - newZoom * (mapX - 800)
      //                = ts.midX - newZoom * ((ts.midX - ts.pan.x) / ts.zoom)
      const newPanX = ts.midX - (newZoom / ts.zoom) * (ts.midX - ts.pan.x);
      const newPanY = ts.midY - (newZoom / ts.zoom) * (ts.midY - ts.pan.y);
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

    // When popover is open, allow panning but block placing new markers or drawing.
    // The popover stays open so the user can navigate then set a scroll target.
    if (activeNoteMarkerId) {
      // Allow pan (shift or pan tool)
      if (toolMode === 'pan' || e.shiftKey) {
        if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
      return;
    }

    const isPanTool = toolMode === 'pan' || e.shiftKey;
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

    if (toolMode === 'add-marker' && activeMarkerType) {
      if (!isLocal && !isIndiv(activeMarkerType)) {
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
        newMarker.infoMediaUrl = '';
        newMarker.infoMediaType = 'image';
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
        newMarker.pickingPicky = false;
        newMarker.pickingExpanded = false;
      }
      if (activeMarkerType === 'long_picking' || activeMarkerType === 'glong_picking') {
        newMarker.longPickingDurationSeconds = 7;
        newMarker.pickingPicky = false;
        newMarker.pickingExpanded = false;
      }
      onMarkersChange([...markers, newMarker], true);
      setActiveNoteMarkerId(newMarker.id);
      setNoteText(newMarker.note);
      setInfoMediaUrl('');
      setInfoMediaType('image');
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
      return;
    }

    if (toolMode === 'draw') {
      setIsDrawing(true);
      setCurrentPoints([coords]);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        if (strokeType === 'dashed') ctx.setLineDash([8, 6]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
      }
      return;
    }

    if (toolMode === 'erase') {
      eraseStrokesAtPoint(coords);
      setIsDrawing(true);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasCoords(e);

    if (isPanning) {
      const nextPan = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      };
      targetPanRef.current = nextPan;
      setPan(nextPan);
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
                } else if (mk.id === conn.partner.id && mk.id !== conn.primary.id) {
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
        if (marker?.textFixedPosition) {
          const targetX = e.clientX - dragStartOffset.x;
          const targetY = e.clientY - dragStartOffset.y;
          onMarkersChange(
            markers.map(m => {
              if (m.id === draggingMarkerId) {
                return { ...m, x: Math.round(targetX), y: Math.round(targetY) };
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

    const isDrawingOrErasing = isDrawing && (toolMode === 'draw' || toolMode === 'erase');
    if (!isEditMode && !isDrawingOrErasing) return;

    if (isDrawing && toolMode === 'draw') {
      // 'straight' mode: only record the start and end points; intermediate
      // mouse moves are drawn but not stored.
      if (drawMode === 'straight') {
        setCurrentPoints([currentPoints[0], coords]);
        const ctx = ctxRef.current;
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
          ctx.lineTo(coords.x, coords.y);
          ctx.stroke();
        }
        return;
      }
      // 'smooth' mode: real-time jitter reduction.
      // - Skip micro-movements (< 6px) to avoid recording hand jitter
      // - Average the new point with the previous 2 to smooth out
      //   larger wobbles (exponential-style moving average)
      let effectiveCoord = coords;
      if (drawMode === 'smooth' && currentPoints.length > 0) {
        const last = currentPoints[currentPoints.length - 1];
        const dx = coords.x - last.x;
        const dy = coords.y - last.y;
        if (dx * dx + dy * dy < 36) {
          // Less than ~6px movement — treat as jitter, skip
          return;
        }
        // 3-point moving average: (prev2 + prev1*2 + new) / 4
        if (currentPoints.length >= 2) {
          const prev2 = currentPoints[currentPoints.length - 2];
          const prev1 = last;
          effectiveCoord = {
            x: (prev2.x + prev1.x * 2 + coords.x) / 4,
            y: (prev2.y + prev1.y * 2 + coords.y) / 4
          };
        }
      }
      const newPoints = [...currentPoints, effectiveCoord];
      setCurrentPoints(newPoints);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.lineTo(effectiveCoord.x, effectiveCoord.y);
        ctx.stroke();
      }
      return;
    }

    if (isDrawing && toolMode === 'erase') {
      eraseStrokesAtPoint(coords);
      return;
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
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
      if (toolMode === 'draw' && currentPoints.length >= 2) {
        let points = currentPoints;
        // Snap endpoints of solid (route) lines to nearby existing solid line endpoints
        // to maintain a connected route network.
        if (strokeType === 'solid') {
          const SNAP_THRESHOLD = 25;
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
          type: strokeType
        };
        onStrokesChange([...strokes, newStroke]);
      }
      setCurrentPoints([]);
    }
  };

  const eraseStrokesAtPoint = (pt: Point) => {
    const threshold = 12;
    const filteredStrokes = strokes.filter(stroke => {
      const dist = getDistanceToStroke(pt, stroke);
      return dist > threshold;
    });
    if (filteredStrokes.length !== strokes.length) {
      onStrokesChange(filteredStrokes);
    }
  };

  const handleMarkerMouseDown = (e: React.MouseEvent, m: HeistMarker) => {
    if (e.button === 1) return;
    e.stopPropagation();
    
    const isIndivMarker = isIndiv(m.type);
    const canInteract = isEditMode && (isLocal ? true : (toolMode === 'erase' ? true : isIndivMarker));
    if (!canInteract) return;

    if (toolMode === 'erase') {
      // Eraser mode always actually deletes from the current view, regardless
      // of whether the marker is global or local. Global markers will be
      // re-merged from global_markers.json on the next page load, but during
      // this session the marker is gone — matching the user's mental model
      // of "the eraser removed this pin". A history snapshot is pushed so the
      // user can undo with Ctrl+Z.
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
        true
      );
      if (activeNoteMarkerId === m.id) {
        setActiveNoteMarkerId(null);
      }
      return;
    }

    const coords = getCanvasCoords(e as React.MouseEvent<HTMLElement>);
    if (onMarkersDragStart) onMarkersDragStart();
    setDraggingMarkerId(m.id);
    if (m.textFixedPosition) {
      setDragStartOffset({ x: e.clientX - m.x, y: e.clientY - m.y });
    } else {
      setDragStartOffset({ x: coords.x - m.x, y: coords.y - m.y });
    }
  };

  const handleMarkerClick = (e: React.MouseEvent, m: HeistMarker) => {
    e.stopPropagation();

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
          const canBidirectional = isBidirectional && source.type !== 'iwarp' && m.type !== 'iwarp'
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
            // Partner has manually-set scroll target → use it
            startSmoothScroll(
              { x: partner.scrollConfig.x, y: partner.scrollConfig.y },
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
        startSmoothScroll(
          { x: m.scrollConfig.x, y: m.scrollConfig.y },
          m.scrollConfig.zoom
        );
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
    setInfoMediaUrl(m.infoMediaUrl || '');
    setInfoMediaType(m.infoMediaType || 'image');
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
    setLongPickingDurationSeconds(m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7);
    setPickingPicky(!!m.pickingPicky);
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
    setLongPickingCustomDurationVal(hasLongPickingCustom ? longPickingCustomDurations[m.id] : m.longPickingDurationSeconds || 7);

    // Checkpoint fields
    setCheckpointTargetTime(m.checkpointTargetTime ?? 60);
    setCheckpointSoundOn(!!m.checkpointSoundOn);
    setCheckpointVoiceOn(m.checkpointVoiceOn !== false);

    setPopupDirection(m.popupDirection || 'top');
    setPopupWidth(m.popupWidth || ((m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') ? 280 : 300));
    setPopupHeight(m.popupHeight || 0);
    setPopupOffset(m.popupOffset || { x: 0, y: -100 });
    setMediaItems((m.mediaItems || []).map(item => ({ ...item, description: item.description || '' })));
  };

  const handleZoom = (factor: number) => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    const prevZoom = animZoomRef.current;
    const prevPan = animPanRef.current;
    const newZoom = Math.max(0.1, Math.min(4, prevZoom * factor));
    if (prevZoom === newZoom) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      setZoom(newZoom);
      return;
    }
    const wRect = wrapper.getBoundingClientRect();
    const anchorX = wRect.left + wRect.width / 2;
    const anchorY = wRect.top + wRect.height / 2;
    const localCenterX = anchorX;
    const localCenterY = anchorY;
    const mapX = 800 + (anchorX - localCenterX - prevPan.x) / prevZoom;
    const mapY = 2275 + (anchorY - localCenterY - prevPan.y) / prevZoom;
    const newPanX = anchorX - localCenterX - newZoom * (mapX - 800);
    const newPanY = anchorY - localCenterY - newZoom * (mapY - 2275);
    animZoomRef.current = newZoom;
    animPanRef.current = { x: newPanX, y: newPanY };
    targetZoomRef.current = newZoom;
    targetPanRef.current = { x: newPanX, y: newPanY };
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const resetView = () => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    startSmoothScroll({ x: 0, y: 0 }, 1);
  };

  const handleSaveNote = (closePanel = true) => {
    if (activeNoteMarkerId) {
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
              // If the infoMediaUrl changed and the old one was an uploaded
              // file, delete it from the server to avoid orphaned files.
              if (m.infoMediaUrl && m.infoMediaUrl !== infoMediaUrl && m.infoMediaUrl.includes('/uploads/')) {
                const oldFilename = m.infoMediaUrl.split('/uploads/').pop() || '';
                if (oldFilename) {
                  fetch('/api/upload-media', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: oldFilename })
                  }).catch(() => { /* ignore */ });
                }
              }
              updated.infoLabel = infoLabel;
              updated.infoMediaUrl = infoMediaUrl;
              updated.infoMediaType = infoMediaType;
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
              updated.pickingPicky = pickingPicky;
            }
            if (m.type === 'long_picking' || m.type === 'glong_picking') {
              updated.longPickingDurationSeconds = pickingPicky ? 0 : longPickingDurationSeconds;
              updated.pickingPicky = pickingPicky;
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
            if (isInfoType(m.type) || m.type === 'eh' || m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle') {
              updated.mediaItems = mediaItems;
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
      true
    );
    setActiveNoteMarkerId(null);
  };

  const handleSetScrollTarget = () => {
    if (activeNoteMarkerId) {
      // Save the CURRENT view position (pan & zoom) as the scroll target.
      // When the user clicks "Go" in the sidebar, it restores this exact view.
      onMarkersChange(
        markers.map(m => m.id === activeNoteMarkerId ? {
          ...m,
          scrollConfig: { x: pan.x, y: pan.y, zoom: zoom }
        } : m),
        true
      );
    }
  };

  const handleClearScrollTarget = () => {
    if (activeNoteMarkerId) {
      onMarkersChange(
        markers.map(m => {
          if (m.id === activeNoteMarkerId) {
            const { scrollConfig, ...rest } = m;
            return rest;
          }
          return m;
        }),
        true
      );
    }
  };

  const activeNoteMarker = markers.find(m => m.id === activeNoteMarkerId);

  let cursorClass = '';
  if (toolMode === 'pan' || !isEditMode) {
    cursorClass = isPanning ? 'grabbing' : 'grab';
  }

  return (
    <div 
      className={`canvas-wrapper ${cursorClass}`} 
      ref={wrapperRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
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
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#ff00ff" />
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
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#ffaa00" />
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
              const color = isWarp ? '#ff00ff' : '#ffaa00';
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
          {markers
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
                const isCheckpoint = m.type === 'checkpoint';
                const radius = isWarp ? warpMarkerThreshold : isStairs ? movementMarkerThreshold : isStart ? movementMarkerThreshold : isStop ? stopMarkerThreshold : isCheckpoint ? movementMarkerThreshold : 0;
                if (radius === 0) return null;
                const color = isWarp ? '#ff9500' : isStairs ? '#39ff14' : isStart ? '#39ff14' : isStop ? '#ff4444' : isCheckpoint ? '#ff9500' : '#888';
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
              className="current-position-marker"
              style={{
                left: `${currentPosition.x}px`,
                top: `${currentPosition.y}px`,
                transform: `translate(-50%, -100%) scale(${1 / Math.sqrt(zoom)})`,
                transformOrigin: 'bottom center'
              }}
            >
              <div className="current-position-arrow">▼</div>
              <div className="current-position-pulse" />
            </div>
          )}

          {markers
            .filter(m => m.floor === floor)
            .map(m => {
              // The START marker (🐾) is always visible — it's required for
              // the auto-route to work, so we never hide it even if the
              // user toggled its type in the visibility settings.
              const isHidden = m.type !== 'start' && (hiddenMarkers.includes(m.id) || hiddenMarkerTypes.includes(m.type));
              if (isHidden && !isEditMode) return null;
              if (!isEditMode && m.type === 'room') return null;

              const isWarp = m.type === 'warp' || m.type === 'iwarp';
              const isStairs = m.type === 'stairs';
              const isPhone = m.type === 'phone';
              const isText = isTextType(m.type);
              const isLargePin = isWarp || isStairs;
              const meta = MARKER_META[m.type];
              // Dynamic emoji for phone markers
              const displayEmoji = isPhone
                ? (m.phoneActive ? '📞' : '☎')
                : meta.emoji;
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
                  ? (displayDesc || m.note || 'Text')
                  : '';
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
                textShadow: displayGlow
                  ? `0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5), 0 0 12px ${displayColor}, 0 0 20px ${displayColor}`
                  : '0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
                      whiteSpace: 'pre',
                      textAlign: 'center',
                      cursor: 'move',
                      pointerEvents: 'auto',
                      opacity: isHidden ? 0.35 : 1,
                      filter: isHidden ? 'grayscale(90%)' : 'none',
                      zIndex: 20,
                      userSelect: 'none'
                    } as React.CSSProperties}
                    onMouseDown={(e) => handleMarkerMouseDown(e, m)}
                    onClick={(e) => handleMarkerClick(e, m)}
                  >
                    {m.note || 'Text'}
                  </div>
                );
              }
              const nonTextTooltip = isInfoType(m.type) ? (m.infoLabel?.trim() || 'Info Pin') : isNoteType(m.type) ? (m.note || 'Memo') : m.note || (isWarp ? 'Warp Point' : isStairs ? 'Stairs' : isPhone ? (m.phoneLocked ? '🔒 Always On' : (m.phoneActive ? 'ACTIVE' : 'Inactive')) : m.type === 'boss' ? (m.note?.trim() || 'Boss') : (m.type === 'battle' || m.type === 'gbattle') ? 'Battle' : (m.type === 'picking' || m.type === 'gpicking') ? 'Picking' : (m.type === 'long_picking' || m.type === 'glong_picking') ? 'Long Picking' : m.type === 'eh' ? 'エターナルハート発見地点' : m.type === 'cardkey' ? 'カードキー発見ポイント' : m.type === 'checkpoint' ? '🏁 Checkpoint' : '');
              return (
                <div
                  key={m.id}
                   className={`map-marker ${isWarp ? 'warp-marker' : ''} ${isStairs ? 'stairs-marker' : ''} ${phoneClass} ${m.type === 'eh' && m.ehHighRate ? 'eh-high-rate' : ''} ${m.type === 'cardkey' && m.cardkeyHighRate ? 'cardkey-high-rate' : ''} ${isHidden && !(isLocal && isEditMode) ? 'hidden-marker-pin' : isHidden ? 'editor-hidden-marker' : ''}`}
                   onMouseEnter={nonTextTooltip ? (e) => { setHoveredMarkerId(m.id); setHoverPos({ x: e.clientX, y: e.clientY }); } : undefined}
                   onMouseMove={nonTextTooltip ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                   onMouseLeave={nonTextTooltip ? () => setHoveredMarkerId(null) : undefined}
                  style={{
                     left: `${m.x}px`,
                     top: `${m.y}px`,
                     width: `${(isLargePin ? 18 : 16) * scaleMultiplier}px`,
                     height: `${(isLargePin ? 18 : 16) * scaleMultiplier}px`,
                     '--theme-color': m.phoneActive ? '#39ff14' : meta.color,
                     pointerEvents: (disablePinsDuringDraw && toolMode === 'draw') ? 'none' : 'auto',
                     opacity: isHidden ? 0.35 : 1,
                     filter: isHidden ? 'grayscale(90%)' : 'none'
                  } as React.CSSProperties}
                  onMouseDown={(e) => handleMarkerMouseDown(e, m)}
                  onClick={(e) => handleMarkerClick(e, m)}
                >
                  <div 
                    className="map-marker-icon"
                    style={{
                      fontSize: `${(isLargePin ? 10 : 9) * scaleMultiplier}px`,
                      borderWidth: `${1.5 * scaleMultiplier}px`,
                      boxShadow: `0 0 ${6 * scaleMultiplier}px var(--theme-color, var(--cyan-neon))`
                    }}
                  >
                    {displayEmoji}
                  </div>
                  {showMarkerLabels && (m.note.trim() || (isInfoType(m.type) && m.infoLabel?.trim())) && !isLargePin && (isEditMode || !isInfoType(m.type)) && (
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
                      {isInfoType(m.type) ? (m.infoLabel?.trim() || m.note) : m.note}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Render draggable waypoint handles for the active warp/stairs pin in Edit Mode */}
          {markers
            .filter(m => m.floor === floor)
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
          {markers
            .filter(m => m.floor === floor)
            .map(m => {
              const isHidden = hiddenMarkers.includes(m.id);
              if (isHidden && !isEditMode) return null;
              const meta = MARKER_META[m.type];
              return (
                <React.Fragment key={`popups-${m.id}`}>
                  {/* Details Popup in Presentation Mode or Preview in Edit Mode */}
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
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(ヘッダーをドラッグで移動)</span>}
                        </span>
                        {!isEditMode && (
                          <button 
                            className="info-popup-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, infoExpanded: false } : mk)
                              );
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="info-popup-content">
                        {m.infoLabel?.trim() && (
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: meta.color, marginBottom: '6px' }}>
                            {m.infoLabel}
                          </div>
                        )}
                        {m.note.trim() && (
                          <div className="info-popup-desc">
                            {m.note}
                          </div>
                        )}
                        {m.infoMediaUrl && m.infoMediaUrl.trim() && (
                          <div className="info-popup-media">
                            {m.infoMediaType === 'image' && (
                              <img
                                src={m.infoMediaUrl}
                                alt="Media Attachment"
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => setZoomedMedia({ url: m.infoMediaUrl!, type: 'image' })}
                                onError={(e) => { (e.target as any).style.display = 'none'; }}
                              />
                            )}
                            {m.infoMediaType === 'webm' && (
                              <video
                                src={m.infoMediaUrl}
                                controls
                                loop
                                muted
                                autoPlay
                                playsInline
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => setZoomedMedia({ url: m.infoMediaUrl!, type: 'webm' })}
                                onError={(e) => { (e.target as any).style.display = 'none'; }}
                              />
                            )}
                            {m.infoMediaType === 'x-embed' && (
                              <TweetEmbed url={m.infoMediaUrl} />
                            )}
                            {m.infoMediaType === 'youtube' && (() => {
                              const ytMatch = m.infoMediaUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                              const videoId = ytMatch ? ytMatch[1] : null;
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>YouTube URLが無効</div>;
                            })()}
                          </div>
                        )}
                        {m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.map(item => (
                          <div key={item.id} style={{ marginTop: '4px' }}>
                            {item.type === 'image' && <img src={item.url} alt={item.description || 'Media'} style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'image' })} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            {item.type === 'webm' && <video src={item.url} controls loop muted autoPlay playsInline style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => setZoomedMedia({ url: item.url, type: 'webm' })} />}
                            {item.type === 'x-embed' && <TweetEmbed url={item.url} />}
                            {item.type === 'youtube' && (() => {
                              const ytMatch = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                              const videoId = ytMatch ? ytMatch[1] : null;
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>YouTube URLが無効</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                        {isEditMode && isLocal && renderMediaManager(m)}
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
                            {m.note}
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
                          <span>📝</span> MEMO
                          <span style={{ fontSize: '9px', opacity: 0.6 }}>(ヘッダーをドラッグで移動)</span>
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
                          <span>😈</span> {m.note.trim() ? m.note : 'BOSS STATUS'}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(ヘッダーをドラッグで移動)</span>}
                        </span>
                        {!isEditMode && (
                          <button 
                            className="info-popup-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, bossExpanded: false } : mk)
                              );
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="info-popup-content">
                        {/* Boss description display */}
                        {m.bossDescription && m.bossDescription.trim() && (
                          <div style={{ fontSize: '12px', color: '#e0e0e0', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(255, 0, 85, 0.08)', border: '1px solid rgba(255, 0, 85, 0.25)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                            {m.bossDescription}
                          </div>
                        )}

                        {/* Drops display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#b0b0b0' }}>ボスドロップ:</span>
                          {m.bossDrops && m.bossDrops.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {m.bossDrops.map(item => (
                                <span key={item} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', textTransform: 'none', clipPath: 'none', background: 'rgba(255, 0, 85, 0.1)', borderColor: 'rgba(255, 0, 85, 0.3)', color: '#ff0055' }}>
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>設定なし</span>
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
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>YouTube URLが無効</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                        {isEditMode && isLocal && renderMediaManager(m)}

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
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>所要時間:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                  className="btn-cyber danger" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  disabled={!isEditMode}
                                  onClick={() => handleValChange(Math.max(0, currentVal - 10))}
                                >
                                  -10s
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  className="input-cyber"
                                  disabled={!isEditMode}
                                  style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: '#ff0055', borderColor: 'rgba(255, 0, 85, 0.4)' }}
                                  value={currentVal}
                                  onChange={(e) => handleValChange(Math.max(0, parseInt(e.target.value) || 0))}
                                />
                                <button 
                                  className="btn-cyber success" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  disabled={!isEditMode}
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
                          <span>⚔️</span> {m.note.trim() ? m.note : 'BATTLE STATUS'}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(ヘッダーをドラッグで移動)</span>}
                        </span>
                        {!isEditMode && (
                          <button 
                            className="info-popup-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, battleExpanded: false } : mk)
                              );
                            }}
                          >
                            ✕
                          </button>
                        )}
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
                              return videoId ? <iframe src={`https://www.youtube.com/embed/${videoId}`} style={{ width: '100%', aspectRatio: '16/9', borderRadius: '4px', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div style={{ color: '#f44', fontSize: '10px' }}>YouTube URLが無効</div>;
                            })()}
                            {item.description && <div style={{ fontSize: '12px', color: '#e8e8e8', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>}
                          </div>
                        ))}
                        {isEditMode && isLocal && renderMediaManager(m)}
                        {/* Duration settings - editable in presentation mode (saved as plan-specific override) */}
                        {(() => {
                          const isGlobalPin = m.type === 'gbattle';
                          const canEditDuration = isEditMode;
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
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>所要時間:</span>
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
                          <span>{meta.emoji}</span> {m.note.trim() ? m.note : `${meta.label} STATUS`}
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(ヘッダーをドラッグで移動)</span>}
                        </span>
                        {!isEditMode && (
                          <button 
                            className="info-popup-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkersChange(
                                markers.map(mk => mk.id === m.id ? { ...mk, pickingExpanded: false } : mk)
                              );
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="info-popup-content">
                        {/* Picky Checkbox - editable directly in presentation mode */}
                        {(() => {
                          const isGlobalPin = m.type === 'gpicking' || m.type === 'glong_picking';
                          const canEditDuration = isEditMode;
                          const isPicky = (isGlobalPin && !isLocal && pickingCustomDurations[m.id] !== undefined)
                            ? (pickingCustomDurations[m.id] === 0)
                            : (isGlobalPin && !isLocal && longPickingCustomDurations[m.id] !== undefined)
                              ? (longPickingCustomDurations[m.id] === 0)
                              : !!m.pickingPicky;

                          const handlePickyChange = (updatedPicky: boolean) => {
                            const isLong = m.type === 'long_picking' || m.type === 'glong_picking';
                            if (isGlobalPin && !isLocal) {
                              if (isLong) {
                                if (onLongPickingCustomDurationChange) {
                                  onLongPickingCustomDurationChange(m.id, updatedPicky ? 0 : undefined);
                                }
                              } else {
                                if (onPickingCustomDurationChange) {
                                  onPickingCustomDurationChange(m.id, updatedPicky ? 0 : undefined);
                                }
                              }
                            } else {
                              onMarkersChange(
                                markers.map(mk => {
                                  if (mk.id === m.id) {
                                    const updated = { ...mk, pickingPicky: updatedPicky };
                                    if (isLong) {
                                      updated.longPickingDurationSeconds = updatedPicky ? 0 : 7;
                                    } else {
                                      updated.pickingDurationSeconds = updatedPicky ? 0 : 5;
                                    }
                                    return updated;
                                  }
                                  return mk;
                                }),
                                true
                              );
                            }
                          };

                          return (
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
                          );
                        })()}

                        {/* Duration settings - read-only display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#b0b0b0' }}>所要時間:</span>
                          <div style={{ fontSize: '14px', color: (
                            (m.type === 'gpicking' || m.type === 'glong_picking')
                              ? (((m.type === 'glong_picking' ? longPickingCustomDurations[m.id] : pickingCustomDurations[m.id]) === 0) || (m.pickingPicky))
                              : !!m.pickingPicky
                          ) ? '#39ff14' : 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold', padding: '2px 0' }}>
                            {
                              ((m.type === 'gpicking' || m.type === 'glong_picking')
                                ? (((m.type === 'glong_picking' ? longPickingCustomDurations[m.id] : pickingCustomDurations[m.id]) === 0) || (m.pickingPicky))
                                : !!m.pickingPicky
                              ) ? '0秒' : (m.type === 'long_picking' || m.type === 'glong_picking' ? '7秒' : '5秒')
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                    )}
                </React.Fragment>
              );
            })}

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
            return (
              <div
                key={`fixed-${m.id}`}
                className={`map-marker ${isHidden && !(isLocal && isEditMode) ? 'hidden-marker-pin' : isHidden ? 'editor-hidden-marker' : ''}`}
                onMouseEnter={tooltipNote ? (e) => { setHoveredMarkerId(m.id); setHoverPos({ x: e.clientX, y: e.clientY }); } : undefined}
                onMouseMove={tooltipNote ? (e) => setHoverPos({ x: e.clientX, y: e.clientY }) : undefined}
                onMouseLeave={tooltipNote ? () => setHoveredMarkerId(null) : undefined}
                style={{
                  position: 'fixed',
                  left: `${m.x}px`,
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
                  pointerEvents: 'auto',
                  opacity: isHidden ? 0.35 : 1,
                  filter: isHidden ? 'grayscale(90%)' : 'none',
                  zIndex: 9000,
                  userSelect: 'none'
                } as React.CSSProperties}
                onMouseDown={(e) => handleMarkerMouseDown(e, m)}
                onClick={(e) => handleMarkerClick(e, m)}
              >
                <div style={{ fontSize: `${displaySize}px` }}>{m.note || 'Text'}</div>
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
            text = isInfoType(hm.type) ? (hm.infoLabel?.trim() || 'Info Pin') : isNoteType(hm.type) ? (hm.note || 'Memo') : hm.note || (hm.type === 'warp' ? 'Warp Point' : hm.type === 'iwarp' ? 'Warp Point' : hm.type === 'stairs' ? 'Stairs' : hm.type === 'phone' ? (hm.phoneLocked ? '🔒 Always On' : (hm.phoneActive ? 'ACTIVE' : 'Inactive')) : hm.type === 'boss' ? (hm.note?.trim() || 'Boss') : (hm.type === 'battle' || hm.type === 'gbattle') ? 'Battle' : (hm.type === 'picking' || hm.type === 'gpicking') ? 'Picking' : (hm.type === 'long_picking' || hm.type === 'glong_picking') ? 'Long Picking' : hm.type === 'eh' ? 'エターナルハート発見地点' : hm.type === 'cardkey' ? 'カードキー発見ポイント' : '');
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
          const pad = 14;
          const ttW = 200;
          const ttH = 70;
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
              <div style={{ fontSize: '11px', color: '#ff9500', fontWeight: 'bold', marginBottom: '4px' }}>🏁 チェックポイント</div>
              <div style={{ fontSize: '12px', color: '#ffffff', marginBottom: '4px' }}>
                目標時間: <strong style={{ color: '#ffb84d' }}>{target === 0 ? '未設定' : `${target}秒`}</strong>
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
              const isGlobal = globalMarkerIds.includes(activeNoteMarker.id);
              const isHidden = hiddenMarkers.includes(activeNoteMarker.id);

              return (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {isGlobal && (
                    isHidden ? (
                      <button 
                        className="delete-btn"
                         style={{ background: 'none', border: 'none', color: '#39ff14', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                        onClick={() => {
                          if (onShowGlobalMarker) {
                            onShowGlobalMarker(activeNoteMarker.id);
                          }
                        }}
                        title="Show this global marker in this plan"
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
                        title="Hide this global marker in this plan only"
                      >
                        非表示
                      </button>
                    )
                  )}
                  {activeNoteMarker.type === 'checkpoint' && !hiddenMarkers.includes(activeNoteMarker.id) && (
                    <button
                      className="delete-btn"
                      style={{ background: 'none', border: 'none', color: '#ffaa00', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={() => { onHideGlobalMarker?.(activeNoteMarker.id); }}
                      title="このチェックポイントを非表示"
                    >
                      非表示
                    </button>
                  )}
                  {activeNoteMarker.type === 'checkpoint' && hiddenMarkers.includes(activeNoteMarker.id) && (
                    <button
                      className="delete-btn"
                      style={{ background: 'none', border: 'none', color: '#39ff14', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={() => { onShowGlobalMarker?.(activeNoteMarker.id); }}
                      title="Show this checkpoint"
                    >
                      表示
                    </button>
                  )}
                  {(!isGlobal || isLocal) && (
                    <button
                      className="delete-btn"
                      style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}
                      onClick={() => handleDeleteMarker(activeNoteMarker.id)}
                      title="Delete Marker"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {isGlobal && !isLocal && (
                    <button
                      className="delete-btn"
                      style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}
                      onClick={() => {
                        // The popover stays in sync with the markers prop, so
                        // the user can always hit Undo (Ctrl+Z) to bring the
                        // global marker back if it was deleted by mistake.
                        handleDeleteMarker(activeNoteMarker.id);
                      }}
                      title="このマップからこのグローバルマーカーを削除 (次回ロード時に再表示)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          
          {isInfoType(activeNoteMarker.type) && (
            <div style={{ marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>ラベル</label>
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
            placeholder={isInfoType(activeNoteMarker.type) ? '説明テキスト' : 'ルートのメモや攻略情報を記入...'}
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
              <span>▼ 詳細設定</span>
              <span style={{ fontSize: '9px', opacity: 0.6 }}>{noteSettingsExpanded ? '折りたたむ' : '展開する'}</span>
            </button>
          )}

          {noteSettingsExpanded && activeNoteMarker && (
          <div style={{ marginTop: '6px', borderTop: '1px dashed rgba(0, 255, 255, 0.15)', paddingTop: '8px' }}>

          {/* Text marker color & size editing */}
          {isTextType(activeNoteMarker.type) && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.3)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: '#7ec8e3' }}>テキスト設定:</div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '10px', color: '#b0b0b0' }}>色:</label>
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
                  <span>サイズ:</span>
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
                          return { ...m, fixedOriginX: m.x, fixedOriginY: m.y, x: Math.round(vpX), y: Math.round(vpY), textFixedPosition: true, trackSide: side };
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
                  <div style={{ fontSize: '9px', color: '#b0b0b0' }}>ペイン追従:</div>
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
                <label style={{ fontSize: '9px', color: '#b0b0b0' }}>説明文:</label>
                <textarea
                  className="input-cyber"
                  style={{ fontSize: '10px', padding: '4px', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                  value={textDescription}
                  onChange={(e) => setTextDescription(e.target.value)}
                  placeholder="テキストの説明（任意）"
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
              <div style={{ fontSize: '10px', color: '#ff6b9d', marginTop: '4px' }}>ボスドロップ:</div>

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
                <div style={{ fontSize: '9px', color: '#666', fontStyle: 'italic' }}>登録アイテムなし</div>
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
                <div style={{ fontSize: '10px', color: '#ff6b9d', fontWeight: 'bold' }}>所要時間</div>
                
                {/* Global Default Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#b0b0b0' }}>デフォルト:</span>
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
                    <span>0秒</span>
                    <span>12分</span>
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
                        <span style={{ fontSize: '10px', color: '#b0b0b0' }}>個別設定値:</span>
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
                        <span>0秒</span>
                        <span>12分</span>
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
                  <div style={{ fontSize: '10px', color: '#7ec8e3', fontWeight: 'bold' }}>所要時間</div>
                  
                  {isGlobal ? (
                    <>
                      {/* Global Default Duration */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#b0b0b0' }}>デフォルト:</span>
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
                          <span>0秒</span>
                          <span>12分</span>
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
                              <span style={{ fontSize: '10px', color: '#b0b0b0' }}>個別設定値:</span>
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
                              <span>0秒</span>
                              <span>12分</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Individual Pin Duration */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0, 240, 255, 0.03)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#b0b0b0' }}>所要時間:</span>
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
                        <span>0秒</span>
                        <span>12分</span>
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
                <div style={{ fontSize: '10px', color: '#7ec8e3', fontWeight: 'bold' }}>所要時間</div>
                
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
                  現在の設定: <strong style={{ color: 'var(--cyan-neon)' }}>{pickingPicky ? '0秒' : (activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking' ? '7秒' : '5秒')}</strong>
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
                  出現率が高い (High Spawn Rate) - 強調表示する
                </label>
              </div>
              {isLocal && activeNoteMarker && renderMediaManager(activeNoteMarker)}
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
                  出現率が高い (High Spawn Rate) - 強調表示する
                </label>
              </div>
            </div>
          )}

          {/* Checkpoint marker: target time + sound */}
          {activeNoteMarker && activeNoteMarker.type === 'checkpoint' && (
            <div style={{ marginTop: '10px', borderTop: '1px dashed rgba(255, 149, 0, 0.4)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', color: '#ff9500', fontWeight: 'bold' }}>🏁 チェックポイント設定</div>

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
                  設定した秒数に自動追従がこの場所へ辿り着くよう、<br />
                  <strong style={{ color: '#ffb84d' }}>移動速度が自動で調整</strong>されます。<br />
                  <span style={{ color: '#e0e0e0', fontSize: '12px' }}>
                    ※ 0 = 速度調整なし (デフォルト 200 px/s)
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

          <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#7ec8e3', marginBottom: '4px' }}>スクロールターゲット:</div>
            <div style={{ fontSize: '9px', color: '#b0b0b0', marginBottom: '4px' }}>マップを自由に移動・ズームしてから、以下をクリックでこのビューを記録。</div>
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
                      <option value="">-- またはドロップダウンで選択 --</option>
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
                        const canBidirectional = activeNoteMarker.type !== 'iwarp'
                          && partnerMarker?.type !== 'iwarp'
                          && (!partnerMarker?.linkedWarpId || partnerMarker.linkedWarpId === activeNoteMarker.id);
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
                                if (m.id === partner.id) return { ...m, warpWaypoints: [] };
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
                                if (m.id === activeNoteMarker.id) return { ...m, warpWaypoints: [] };
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
                                if (m.id === partner.id || m.id === activeNoteMarker.id) {
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
              <div style={{ fontSize: '10px', color: '#7ec8e3' }}>ポップアップ表示設定:</div>
              
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
                  <span>ポップアップの幅:</span>
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
                  <span>ポップアップの高さ:</span>
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

      <div className="zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Zoom percentage display */}
        <div style={{
          padding: '2px 10px',
          fontSize: '13px',
          fontWeight: 700,
          height: '36px',
          lineHeight: '36px',
          background: 'rgba(10, 15, 28, 0.85)',
          color: 'var(--cyan-neon)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          minWidth: '60px',
          textAlign: 'center',
          userSelect: 'none'
        }}>
          {Math.round(zoom * 100)}%
        </div>

        <button className="zoom-btn" onClick={() => handleZoom(1.2)} title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <button className="zoom-btn" onClick={() => handleZoom(0.8)} title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <button className="zoom-btn" onClick={resetView} title="Reset View (1x)">
          <Maximize2 size={18} />
        </button>
        {isEditMode && (
          <button
            className={`zoom-btn ${toolMode === 'pan' ? 'active' : ''}`}
            onClick={() => {}}
            title="Press Shift to Pan, or use Pan tool"
          >
            <Move size={18} />
          </button>
        )}
      </div>

      {/* Media lightbox — click on image/video to enlarge */}
      {zoomedMedia && ReactDOM.createPortal(
        <div
          onClick={() => { setZoomedMedia(null); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}
          onWheel={(e) => {
            if (zoomedMedia.type !== 'image') return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.1 : 1/1.1;
            setLightboxZoom(z => Math.max(0.5, Math.min(8, z * delta)));
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: lightboxZoom > 1 ? 'grab' : 'zoom-out',
            padding: '40px',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          {zoomedMedia.type === 'image' && (
            <img
              src={zoomedMedia.url}
              alt="Zoomed"
              draggable={false}
              style={{
                maxWidth: lightboxZoom > 1 ? 'none' : '100%',
                maxHeight: lightboxZoom > 1 ? 'none' : '100%',
                width: lightboxZoom > 1 ? `${lightboxZoom * 80}%` : 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '6px',
                boxShadow: '0 0 30px rgba(0, 240, 255, 0.3)',
                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px)`,
                transition: lightboxZoom === 1 ? 'transform 0.2s' : 'none',
                cursor: lightboxZoom > 1 ? 'grab' : 'zoom-in'
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (lightboxDragRef.current) {
                  lightboxDragRef.current = false;
                  return;
                }
                if (lightboxZoom === 1) {
                  setLightboxZoom(2.5);
                } else {
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                }
              }}
              onMouseDown={(e) => {
                if (lightboxZoom <= 1) return;
                e.preventDefault();
                e.stopPropagation();
                lightboxDragRef.current = false;
                const startX = e.clientX - lightboxPan.x;
                const startY = e.clientY - lightboxPan.y;
                const originX = e.clientX;
                const originY = e.clientY;
                const onMove = (ev: MouseEvent) => {
                  if (Math.abs(ev.clientX - originX) > 3 || Math.abs(ev.clientY - originY) > 3) {
                    lightboxDragRef.current = true;
                  }
                  setLightboxPan({ x: ev.clientX - startX, y: ev.clientY - startY });
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
          )}
          {zoomedMedia.type === 'webm' && (
            <video
              src={zoomedMedia.url}
              controls
              autoPlay
              loop
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '6px', boxShadow: '0 0 30px rgba(0, 240, 255, 0.3)' }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {/* Zoom controls for images */}
          {zoomedMedia.type === 'image' && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                background: 'rgba(0,0,0,0.7)',
                padding: '8px 12px',
                borderRadius: '20px',
                alignItems: 'center'
              }}
            >
              <button onClick={() => setLightboxZoom(z => Math.max(0.5, z / 1.3))} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>−</button>
              <span style={{ color: '#fff', fontSize: '13px', minWidth: '60px', textAlign: 'center', fontFamily: 'monospace' }}>
                {Math.round(lightboxZoom * 100)}%
              </span>
              <button onClick={() => setLightboxZoom(z => Math.min(8, z * 1.3))} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>+</button>
              <button onClick={() => { setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px' }}>リセット</button>
              <button onClick={() => { setZoomedMedia(null); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }} style={{ background: 'rgba(255,80,80,0.25)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px' }}>閉じる</button>
            </div>
          )}
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            color: '#fff',
            fontSize: '14px',
            background: 'rgba(0,0,0,0.6)',
            padding: '6px 12px',
            borderRadius: '4px',
            userSelect: 'none'
          }}>
            ✕ 閉じる (ESC)
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
