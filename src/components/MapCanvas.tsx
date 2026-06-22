import React, { useRef, useState, useEffect } from 'react';
import { 
  type FloorType, 
  type DrawingStroke, 
  type HeistMarker, 
  type MarkerType, 
  type Point, 
  MARKER_META,
  PRESET_MAPS_META
} from '../utils/DataManager';
import { ZoomIn, ZoomOut, Maximize2, Move, Trash2 } from 'lucide-react';

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
  strokeType: 'solid' | 'dashed' | 'arrow';
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  onMarkersChange: (markers: HeistMarker[], shouldPushHistory?: boolean) => void;
  onSvgStringReady: (svgStr: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  focusTrigger?: { id: string; timestamp: number } | null;
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
  onStrokesChange,
  onMarkersChange,
  onSvgStringReady,
  canvasRef,
  focusTrigger,
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
  onMarkersDragEnd
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Helper function to check if marker is individual
  const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking'].includes(type);

  // Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  // Drag-and-drop Marker State
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<Point>({ x: 0, y: 0 });

  // Note Popover State
  const [activeNoteMarkerId, setActiveNoteMarkerId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [infoMediaUrl, setInfoMediaUrl] = useState('');
  const [infoMediaType, setInfoMediaType] = useState<'image' | 'webm' | 'x-embed'>('image');
  const [bossDrops, setBossDrops] = useState<string[]>([]);
  const [bossDurationSeconds, setBossDurationSeconds] = useState(60);
  const [battleDurationSeconds, setBattleDurationSeconds] = useState(20);
  const [pickingDurationSeconds, setPickingDurationSeconds] = useState(5);
  const [longPickingDurationSeconds, setLongPickingDurationSeconds] = useState(7);
  const [pickingPicky, setPickingPicky] = useState(false);
  const [customDropInput, setCustomDropInput] = useState('');
  const [useBossCustomDuration, setUseBossCustomDuration] = useState(false);
  const [bossCustomDurationVal, setBossCustomDurationVal] = useState<number | undefined>(undefined);
  const [useBattleCustomDuration, setUseBattleCustomDuration] = useState(false);
  const [battleCustomDurationVal, setBattleCustomDurationVal] = useState<number | undefined>(undefined);
  const [usePickingCustomDuration, setUsePickingCustomDuration] = useState(false);
  const [pickingCustomDurationVal, setPickingCustomDurationVal] = useState<number | undefined>(undefined);
  const [useLongPickingCustomDuration, setUseLongPickingCustomDuration] = useState(false);
  const [longPickingCustomDurationVal, setLongPickingCustomDurationVal] = useState<number | undefined>(undefined);
  const [popupDirection, setPopupDirection] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const [popupWidth, setPopupWidth] = useState<number>(300);
  const [popupOffset, setPopupOffset] = useState<Point>({ x: 0, y: -100 });
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const [popupDragStart, setPopupDragStart] = useState<Point>({ x: 0, y: 0 });
  const [popupOffsetStart, setPopupOffsetStart] = useState<Point>({ x: 0, y: -100 });
  const [currentPosition, setCurrentPosition] = useState<Point | null>(null);

  // Target states for smooth scrolling (use refs to avoid React 18 batching issues)
  const targetZoomRef = useRef<number>(2);
  const targetPanRef = useRef<Point>({ x: 0, y: 0 });
  const animFrameIdRef = useRef<number | null>(null);
  const animPanRef = useRef<Point>({ x: 0, y: 0 });
  const animZoomRef = useRef<number>(2);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, []);

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
      e.preventDefault();
      const zoomFactor = 1.12;
      const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;

      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      setZoom(prev => {
        const nz = Math.max(0.5, Math.min(4, prev * factor));
        targetZoomRef.current = nz;
        return nz;
      });
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
            const H_v = wrapper.clientHeight;
            const tgtZoom = 2;
            // CSS transform: screenPos = wrapperCenter + (markerLocal - containerCenter) * zoom + pan
            // To center horizontally: pan.x = (400 - marker.x) * zoom
            // To place at 60% down:   pan.y = H_v * 0.1 - (marker.y - 1137.5) * zoom
            const tgtPan = {
              x: (400 - marker.x) * tgtZoom,
              y: H_v * 0.1 - (marker.y - 1137.5) * tgtZoom
            };
            startSmoothScroll(tgtPan, tgtZoom);
          }
        }
      }
    }
  }, [focusTrigger, markers]);

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

  // Redraw all strokes on canvas
  const redrawStrokes = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, 800, 2275);

    strokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      
      if (stroke.type === 'dashed') {
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

      // Draw arrowhead if needed
      if (stroke.type === 'arrow' && stroke.points.length >= 2) {
        const p1 = stroke.points[stroke.points.length - 2];
        const p2 = stroke.points[stroke.points.length - 1];
        drawArrowhead(ctx, p1, p2, stroke.color, stroke.width);
      }
    });
  };

  const drawArrowhead = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    color: string,
    width: number
  ) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = Math.max(width * 3, 12);
    
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  };

  const handlePopupMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditMode) return;
    setIsDraggingPopup(true);
    setPopupDragStart({ x: e.clientX, y: e.clientY });
    setPopupOffsetStart(popupOffset);
  };

  const getPopupStyle = (offset: Point, w: number, color: string): React.CSSProperties => {
    return {
      position: 'absolute',
      left: `${offset.x}px`,
      top: `${offset.y}px`,
      width: `${w}px`,
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

  const getCanvasCoords = (e: React.MouseEvent<HTMLElement>): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 800;
    const y = ((e.clientY - rect.top) / rect.height) * 2275;
    return { x: Math.round(x), y: Math.round(y) };
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
      const newMarker: HeistMarker = {
        id: `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: activeMarkerType,
        x: coords.x,
        y: coords.y,
        note: '',
        floor: floor
      };
      if (activeMarkerType === 'info') {
        newMarker.infoMediaUrl = '';
        newMarker.infoMediaType = 'image';
        newMarker.infoExpanded = false;
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
      setNoteText('');
      setInfoMediaUrl('');
      setInfoMediaType('image');
      setBossDrops([]);
      setBossDurationSeconds(60);
      setBattleDurationSeconds(20);
      setPickingDurationSeconds(5);
      setLongPickingDurationSeconds(7);
      setPickingPicky(false);
      setCustomDropInput('');
      setUseBattleCustomDuration(false);
      setBattleCustomDurationVal(20);
      setUsePickingCustomDuration(false);
      setPickingCustomDurationVal(5);
      setUseLongPickingCustomDuration(false);
      setLongPickingCustomDurationVal(7);
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

    if (draggingMarkerId) {
      const marker = markers.find(m => m.id === draggingMarkerId);
      const canDrag = isEditMode || (marker && isIndiv(marker.type));
      if (canDrag) {
        onMarkersChange(
          markers.map(m => {
            if (m.id === draggingMarkerId) {
              const targetX = Math.max(0, Math.min(800, coords.x - dragStartOffset.x));
              const targetY = Math.max(0, Math.min(2275, coords.y - dragStartOffset.y));
              return { ...m, x: targetX, y: targetY };
            }
            return m;
          })
        );
      }
      return;
    }

    const isDrawingOrErasing = isDrawing && (toolMode === 'draw' || toolMode === 'erase');
    if (!isEditMode && !isDrawingOrErasing) return;

    if (isDrawing && toolMode === 'draw') {
      const newPoints = [...currentPoints, coords];
      setCurrentPoints(newPoints);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.lineTo(coords.x, coords.y);
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
        const newStroke: DrawingStroke = {
          points: currentPoints,
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
    e.stopPropagation();
    
    const canInteract = isEditMode || isIndiv(m.type);
    if (!canInteract) return;

    if (toolMode === 'erase') {
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
    setDragStartOffset({ x: coords.x - m.x, y: coords.y - m.y });
  };

  const handleMarkerClick = (e: React.MouseEvent, m: HeistMarker) => {
    e.stopPropagation();
    
    const isPresenterModeForGlobal = !isEditMode && !isIndiv(m.type);
    if (isPresenterModeForGlobal) {
      // Info toggle in presentation mode
      if (m.type === 'info') {
        onMarkersChange(
          markers.map(mk => mk.id === m.id ? { ...mk, infoExpanded: !mk.infoExpanded } : mk)
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
      // Phone toggle in presentation mode
      if (m.type === 'phone') {
        if (!m.phoneLocked) {
          onMarkersChange(
            markers.map(mk => mk.id === m.id ? { ...mk, phoneActive: !mk.phoneActive } : mk)
          );
        }
        return;
      }
      // Warp/stairs navigation: use partner's scrollConfig if available (manual setting priority)
      const isLinkable = m.type === 'warp' || m.type === 'stairs';
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
              const H_v = wrapper.clientHeight;
              const tgtZoom = zoom;
              const tgtPanX = (400 - partner.x) * tgtZoom;
              const tgtPanY = H_v * 0.1 - (partner.y - 1137.5) * tgtZoom;
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
    setInfoMediaUrl(m.infoMediaUrl || '');
    setInfoMediaType(m.infoMediaType || 'image');
    setBossDrops(m.bossDrops || []);
    setBossDurationSeconds(m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60);
    setBattleDurationSeconds(m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20);
    setPickingDurationSeconds(m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5);
    setLongPickingDurationSeconds(m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7);
    setPickingPicky(!!m.pickingPicky);
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

    setPopupDirection(m.popupDirection || 'top');
    setPopupWidth(m.popupWidth || ((m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') ? 280 : 300));
    setPopupOffset(m.popupOffset || { x: 0, y: -100 });
  };

  const handleZoom = (factor: number) => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    setZoom(prev => {
      const nz = Math.max(0.5, Math.min(4, prev * factor));
      targetZoomRef.current = nz;
      return nz;
    });
  };

  const resetView = () => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    startSmoothScroll({ x: 0, y: 0 }, 2);
  };

  const handleSaveNote = () => {
    if (activeNoteMarkerId) {
      onMarkersChange(
        markers.map(m => {
          if (m.id === activeNoteMarkerId) {
            const updated = { 
              ...m, 
              note: noteText,
              popupDirection: popupDirection,
              popupWidth: popupWidth,
              popupOffset: popupOffset
            };
            if (m.type === 'info') {
              updated.infoMediaUrl = infoMediaUrl;
              updated.infoMediaType = infoMediaType;
            }
            if (m.type === 'boss') {
              updated.bossDrops = bossDrops;
              updated.bossDurationSeconds = bossDurationSeconds;
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

      setActiveNoteMarkerId(null);
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
      onDoubleClick={(e) => {
        const coords = getCanvasCoords(e);
        setCurrentPosition(coords);
      }}
    >
      <div 
        className="canvas-container"
        ref={containerRef}
        style={{
          width: '800px',
          height: '2275px',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
        }}
      >
        <div ref={svgWrapperRef} className="map-bg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          {customBg ? (
            <img src={customBg} alt="Reference blueprint" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: 1, zIndex: 1 }} />
          ) : PRESET_MAPS_META[floor].path ? (
            <img src={PRESET_MAPS_META[floor].path as string} alt="Reference blueprint" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: 1, zIndex: 1 }} />
          ) : null}
        </div>

        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          width={800}
          height={2275}
        />

        {/* Warp & Stairs pair connector lines */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15 }}
          viewBox="0 0 800 2275"
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
            .filter(m => m.type === 'warp' && m.linkedWarpId && m.floor === floor)
            .map(m => {
              const partner = markers.find(mk => mk.id === m.linkedWarpId);
              if (!partner) return null;
              return (
                <line
                  key={`warp-line-${m.id}`}
                  x1={m.x} y1={m.y} x2={partner.x} y2={partner.y}
                  stroke="#ff00ff" strokeWidth="2" strokeDasharray="6 4" opacity="0.6"
                  markerEnd="url(#warp-arrow)"
                />
              );
            })
          }
          {markers
            .filter(m => m.type === 'stairs' && m.linkedWarpId && m.floor === floor)
            .map(m => {
              const partner = markers.find(mk => mk.id === m.linkedWarpId);
              if (!partner) return null;
              return (
                <line
                  key={`stairs-line-${m.id}`}
                  x1={m.x} y1={m.y} x2={partner.x} y2={partner.y}
                  stroke="#ffaa00" strokeWidth="1" strokeDasharray="3 3" opacity="0.35"
                  markerEnd="url(#stairs-arrow)"
                />
              );
            })
          }
          {/* Guide lines from pins to their corresponding draggable popups */}
          {markers
            .filter(m => (m.type === 'info' || m.type === 'boss' || m.type === 'battle' || m.type === 'gbattle' || m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && m.floor === floor)
            .map(m => {
              const meta = MARKER_META[m.type];
              const offset = (isEditMode && activeNoteMarkerId === m.id) ? popupOffset : m.popupOffset;
              if (!offset) return null;

              const isVisible = (m.type === 'info' && ((!isEditMode && m.infoExpanded) || (isEditMode && activeNoteMarkerId === m.id)))
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
              if (!isEditMode && m.type === 'room') return null;

              const isWarp = m.type === 'warp';
              const isStairs = m.type === 'stairs';
              const isPhone = m.type === 'phone';
              const isLargePin = isWarp || isStairs;
              const meta = MARKER_META[m.type];
              // Dynamic emoji for phone markers
              const displayEmoji = isPhone
                ? (m.phoneActive ? '📞' : '☎')
                : meta.emoji;
              // Phone markers that are locked show a small lock indicator
              const phoneClass = isPhone ? (m.phoneActive ? 'phone-active' : 'phone-inactive') : '';
              return (
                <div
                  key={m.id}
                  className={`map-marker ${isWarp ? 'warp-marker' : ''} ${isStairs ? 'stairs-marker' : ''} ${phoneClass}`}
                  data-note={m.note || (isWarp ? 'Warp Point' : isStairs ? 'Stairs' : isPhone ? (m.phoneLocked ? '🔒 Always On' : (m.phoneActive ? 'ACTIVE' : 'Inactive')) : m.type === 'info' ? 'Info Pin' : m.type === 'boss' ? 'Boss (Mamon)' : (m.type === 'battle' || m.type === 'gbattle') ? 'Battle' : (m.type === 'picking' || m.type === 'gpicking') ? 'Picking' : (m.type === 'long_picking' || m.type === 'glong_picking') ? 'Long Picking' : '')}
                  style={{
                     left: `${m.x}px`,
                     top: `${m.y}px`,
                     '--theme-color': m.phoneActive ? '#39ff14' : meta.color,
                     pointerEvents: (disablePinsDuringDraw && toolMode === 'draw') ? 'none' : 'auto'
                  } as React.CSSProperties}
                  onMouseDown={(e) => handleMarkerMouseDown(e, m)}
                  onClick={(e) => handleMarkerClick(e, m)}
                >
                  <div 
                    className="map-marker-icon"
                    style={isLargePin ? { width: '18px', height: '18px', fontSize: '10px' } : undefined}
                  >
                    {displayEmoji}
                  </div>
                  {showMarkerLabels && m.note.trim() && !isLargePin && (isEditMode || m.type !== 'info') && (
                    <div className="map-marker-label">
                      {m.note}
                    </div>
                  )}

                  {/* Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && m.type === 'info' && m.infoExpanded) || (isEditMode && activeNoteMarkerId === m.id && m.type === 'info')) && (
                    <div 
                      className="info-marker-popup"
                      style={getPopupStyle(
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 300),
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
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(Drag Header to Move)</span>}
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
                        {m.note.trim() && (
                          <div className="info-popup-desc">
                            {m.note}
                          </div>
                        )}
                        {m.infoMediaUrl && m.infoMediaUrl.trim() && (
                          <div className="info-popup-media">
                            {m.infoMediaType === 'image' && (
                              <img src={m.infoMediaUrl} alt="Media Attachment" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                            )}
                            {m.infoMediaType === 'webm' && (
                              <video src={m.infoMediaUrl} controls loop muted autoPlay playsInline onError={(e) => { (e.target as any).style.display = 'none'; }} />
                            )}
                            {m.infoMediaType === 'x-embed' && (
                              <TweetEmbed url={m.infoMediaUrl} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Boss Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && m.type === 'boss' && m.bossExpanded) || (isEditMode && activeNoteMarkerId === m.id && m.type === 'boss')) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 280),
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
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(Drag Header to Move)</span>}
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
                        {/* Drops display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>落としやすいアイテム (Drops):</span>
                          {m.bossDrops && m.bossDrops.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {m.bossDrops.map(item => (
                                <span key={item} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', textTransform: 'none', clipPath: 'none', background: 'rgba(255, 0, 85, 0.1)', borderColor: 'rgba(255, 0, 85, 0.3)', color: '#ff0055' }}>
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>設定なし</span>
                          )}
                        </div>

                        {/* Duration settings - editable in presentation mode (saved as plan-specific override) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dotted rgba(255, 0, 85, 0.2)', paddingTop: '6px', marginTop: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>所要時間 (Duration):</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button 
                              className="btn-cyber danger" 
                              style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                              onClick={() => {
                                const currentVal = bossCustomDurations[m.id] !== undefined ? bossCustomDurations[m.id] : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60);
                                const newVal = Math.max(0, currentVal - 10);
                                if (onBossCustomDurationChange) onBossCustomDurationChange(m.id, newVal);
                              }}
                            >
                              -10s
                            </button>
                            <input
                              type="number"
                              min="0"
                              className="input-cyber"
                              style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: '#ff0055', borderColor: 'rgba(255, 0, 85, 0.4)' }}
                              value={bossCustomDurations[m.id] !== undefined ? bossCustomDurations[m.id] : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60)}
                              onChange={(e) => {
                                const newVal = Math.max(0, parseInt(e.target.value) || 0);
                                if (onBossCustomDurationChange) onBossCustomDurationChange(m.id, newVal);
                              }}
                            />
                            <button 
                              className="btn-cyber success" 
                              style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                              onClick={() => {
                                const currentVal = bossCustomDurations[m.id] !== undefined ? bossCustomDurations[m.id] : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60);
                                const newVal = currentVal + 10;
                                if (onBossCustomDurationChange) onBossCustomDurationChange(m.id, newVal);
                              }}
                            >
                              +10s
                            </button>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--red-neon)', fontWeight: 'bold', marginTop: '2px' }}>
                            現在の設定: {Math.floor((bossCustomDurations[m.id] !== undefined ? bossCustomDurations[m.id] : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60)) / 60)}分 {(bossCustomDurations[m.id] !== undefined ? bossCustomDurations[m.id] : (m.bossDurationSeconds !== undefined ? m.bossDurationSeconds : 60)) % 60}秒
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Battle Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && (m.type === 'battle' || m.type === 'gbattle') && m.battleExpanded) || (isEditMode && activeNoteMarkerId === m.id && (m.type === 'battle' || m.type === 'gbattle'))) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 280),
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
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(Drag Header to Move)</span>}
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
                        {/* Duration settings - editable in presentation mode (saved as plan-specific override) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>所要時間 (Duration):</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button 
                              className="btn-cyber danger" 
                              style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                              onClick={() => {
                                const currentVal = battleCustomDurations[m.id] !== undefined ? battleCustomDurations[m.id] : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20);
                                const newVal = Math.max(0, currentVal - 10);
                                if (onBattleCustomDurationChange) onBattleCustomDurationChange(m.id, newVal);
                              }}
                            >
                              -10s
                            </button>
                            <input
                              type="number"
                              min="0"
                              className="input-cyber"
                              style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: 'var(--cyan-neon, #00f0ff)', borderColor: 'rgba(0, 240, 255, 0.4)' }}
                              value={battleCustomDurations[m.id] !== undefined ? battleCustomDurations[m.id] : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20)}
                              onChange={(e) => {
                                const newVal = Math.max(0, parseInt(e.target.value) || 0);
                                if (onBattleCustomDurationChange) onBattleCustomDurationChange(m.id, newVal);
                              }}
                            />
                            <button 
                              className="btn-cyber success" 
                              style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                              onClick={() => {
                                const currentVal = battleCustomDurations[m.id] !== undefined ? battleCustomDurations[m.id] : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20);
                                const newVal = currentVal + 10;
                                if (onBattleCustomDurationChange) onBattleCustomDurationChange(m.id, newVal);
                              }}
                            >
                              +10s
                            </button>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold', marginTop: '2px' }}>
                            現在の設定: {Math.floor((battleCustomDurations[m.id] !== undefined ? battleCustomDurations[m.id] : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20)) / 60)}分 {(battleCustomDurations[m.id] !== undefined ? battleCustomDurations[m.id] : (m.battleDurationSeconds !== undefined ? m.battleDurationSeconds : 20)) % 60}秒
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Picking / Long Picking Details Popup in Presentation Mode or Preview in Edit Mode */}
                  {((!isEditMode && (m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking') && m.pickingExpanded) || 
                    (isEditMode && activeNoteMarkerId === m.id && (m.type === 'picking' || m.type === 'gpicking' || m.type === 'long_picking' || m.type === 'glong_picking'))) && (
                    <div 
                      className="boss-marker-popup"
                      style={getPopupStyle(
                        isEditMode && activeNoteMarkerId === m.id ? popupOffset : (m.popupOffset || { x: 0, y: -100 }),
                        isEditMode && activeNoteMarkerId === m.id ? popupWidth : (m.popupWidth || 280),
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
                          {isEditMode && <span style={{ fontSize: '9px', opacity: 0.6 }}>(Drag Header to Move)</span>}
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
                        {/* Picky state indicator */}
                        {m.pickingPicky && (
                          <div style={{ fontSize: '11px', color: '#39ff14', fontWeight: 'bold', marginBottom: '6px' }}>
                            ⚡ ピッキー (0秒) 設定中
                          </div>
                        )}
                        {/* Duration settings - editable in presentation mode */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>所要時間 (Duration):</span>
                          {m.pickingPicky ? (
                            <div style={{ fontSize: '14px', color: '#39ff14', fontWeight: 'bold', padding: '4px 0' }}>
                              0秒 (Picky)
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                  className="btn-cyber danger" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  onClick={() => {
                                    const isLong = m.type === 'long_picking' || m.type === 'glong_picking';
                                    const customDurs = isLong ? longPickingCustomDurations : pickingCustomDurations;
                                    const defaultDur = isLong ? (m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7) : (m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5);
                                    const currentVal = (customDurs && customDurs[m.id] !== undefined) ? customDurs[m.id] : defaultDur;
                                    const newVal = Math.max(0, currentVal - 1);
                                    if (isLong) {
                                      if (onLongPickingCustomDurationChange) onLongPickingCustomDurationChange(m.id, newVal);
                                    } else {
                                      if (onPickingCustomDurationChange) onPickingCustomDurationChange(m.id, newVal);
                                    }
                                  }}
                                >
                                  -1s
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  className="input-cyber"
                                  style={{ width: '70px', fontSize: '11px', padding: '4px', textAlign: 'center', color: 'var(--cyan-neon, #00f0ff)', borderColor: 'rgba(0, 240, 255, 0.4)' }}
                                  value={
                                    (m.type === 'long_picking' || m.type === 'glong_picking')
                                      ? (longPickingCustomDurations && longPickingCustomDurations[m.id] !== undefined ? longPickingCustomDurations[m.id] : (m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7))
                                      : (pickingCustomDurations && pickingCustomDurations[m.id] !== undefined ? pickingCustomDurations[m.id] : (m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5))
                                  }
                                  onChange={(e) => {
                                    const newVal = Math.max(0, parseInt(e.target.value) || 0);
                                    const isLong = m.type === 'long_picking' || m.type === 'glong_picking';
                                    if (isLong) {
                                      if (onLongPickingCustomDurationChange) onLongPickingCustomDurationChange(m.id, newVal);
                                    } else {
                                      if (onPickingCustomDurationChange) onPickingCustomDurationChange(m.id, newVal);
                                    }
                                  }}
                                />
                                <button 
                                  className="btn-cyber success" 
                                  style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }}
                                  onClick={() => {
                                    const isLong = m.type === 'long_picking' || m.type === 'glong_picking';
                                    const customDurs = isLong ? longPickingCustomDurations : pickingCustomDurations;
                                    const defaultDur = isLong ? (m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7) : (m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5);
                                    const currentVal = (customDurs && customDurs[m.id] !== undefined) ? customDurs[m.id] : defaultDur;
                                    const newVal = currentVal + 1;
                                    if (isLong) {
                                      if (onLongPickingCustomDurationChange) onLongPickingCustomDurationChange(m.id, newVal);
                                    } else {
                                      if (onPickingCustomDurationChange) onPickingCustomDurationChange(m.id, newVal);
                                    }
                                  }}
                                >
                                  +1s
                                </button>
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold', marginTop: '2px' }}>
                                現在の設定: {
                                  (m.type === 'long_picking' || m.type === 'glong_picking')
                                    ? (longPickingCustomDurations && longPickingCustomDurations[m.id] !== undefined ? longPickingCustomDurations[m.id] : (m.longPickingDurationSeconds !== undefined ? m.longPickingDurationSeconds : 7))
                                    : (pickingCustomDurations && pickingCustomDurations[m.id] !== undefined ? pickingCustomDurations[m.id] : (m.pickingDurationSeconds !== undefined ? m.pickingDurationSeconds : 5))
                                }秒
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}

        </div>
      </div>

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
            <button 
              className="delete-btn"
              style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}
              onClick={() => handleDeleteMarker(activeNoteMarker.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          
          <textarea
            placeholder="Write route descriptions or heist tactics..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            autoFocus
          />

          {/* Info marker media URL & type editing */}
          {activeNoteMarker.type === 'info' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(79, 195, 247, 0.3)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ATTACHED MEDIA:</div>
              
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['image', 'webm', 'x-embed'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`btn-cyber ${infoMediaType === t ? 'active' : ''}`}
                    style={{ flex: 1, padding: '3px 0', fontSize: '9px', textTransform: 'uppercase', clipPath: 'none' }}
                    onClick={() => setInfoMediaType(t)}
                  >
                    {t === 'x-embed' ? 'X Post' : t}
                  </button>
                ))}
              </div>

              <input
                type="text"
                className="input-cyber"
                style={{ width: '100%', fontSize: '11px', padding: '4px 6px' }}
                placeholder={
                  infoMediaType === 'image' ? 'https://example.com/image.png' :
                  infoMediaType === 'webm' ? 'https://example.com/animation.webm' :
                  'https://x.com/username/status/123456789...'
                }
                value={infoMediaUrl}
                onChange={(e) => setInfoMediaUrl(e.target.value)}
              />
            </div>
          )}

          {/* Boss marker drops & duration editing */}
          {activeNoteMarker.type === 'boss' && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255, 0, 85, 0.3)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>BOSS DROPS:</div>

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
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic' }}>登録アイテムなし</div>
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
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>所要時間 (DURATION)</div>
                
                {/* Global Default Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>デフォルト (グローバル):</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                      {Math.floor(bossDurationSeconds / 60)}分 {bossDurationSeconds % 60}秒
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <input
                      type="number"
                      min="0"
                      className="input-cyber"
                      style={{ width: '80px', fontSize: '11px', padding: '4px' }}
                      value={bossDurationSeconds}
                      onChange={(e) => setBossDurationSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
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
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>個別設定値:</span>
                        <span style={{ fontSize: '11px', color: 'var(--red-neon)', fontWeight: 'bold' }}>
                          {Math.floor((bossCustomDurationVal || 0) / 60)}分 {(bossCustomDurationVal || 0) % 60}秒
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <input
                          type="number"
                          min="0"
                          className="input-cyber"
                          style={{ width: '80px', fontSize: '11px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.4)' }}
                          value={bossCustomDurationVal || 0}
                          onChange={(e) => setBossCustomDurationVal(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Battle marker duration editing */}
          {(activeNoteMarker.type === 'battle' || activeNoteMarker.type === 'gbattle') && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>所要時間 (DURATION)</div>
                
                {/* Global Default Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>デフォルト (グローバル):</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                      {Math.floor(battleDurationSeconds / 60)}分 {battleDurationSeconds % 60}秒
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <input
                      type="number"
                      min="0"
                      className="input-cyber"
                      style={{ width: '80px', fontSize: '11px', padding: '4px' }}
                      value={battleDurationSeconds}
                      onChange={(e) => setBattleDurationSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
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
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>個別設定値:</span>
                        <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>
                          {Math.floor((battleCustomDurationVal || 0) / 60)}分 {(battleCustomDurationVal || 0) % 60}秒
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <input
                          type="number"
                          min="0"
                          className="input-cyber"
                          style={{ width: '80px', fontSize: '11px', padding: '4px', borderColor: 'rgba(0, 240, 255, 0.4)' }}
                          value={battleCustomDurationVal || 0}
                          onChange={(e) => setBattleCustomDurationVal(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Picking / Long Picking marker duration & picky editing */}
          {(activeNoteMarker.type === 'picking' || activeNoteMarker.type === 'gpicking' || activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>所要時間 (DURATION)</div>
                
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

                {!pickingPicky && (
                  <>
                    {/* Global Default Duration */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>デフォルト (グローバル):</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                          {(activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? longPickingDurationSeconds : pickingDurationSeconds}秒
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <input
                          type="number"
                          min="0"
                          className="input-cyber"
                          style={{ width: '80px', fontSize: '11px', padding: '4px' }}
                          value={(activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? longPickingDurationSeconds : pickingDurationSeconds}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            if (activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') {
                              setLongPickingDurationSeconds(val);
                            } else {
                              setPickingDurationSeconds(val);
                            }
                          }}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
                      </div>
                    </div>

                    {/* Plan Specific Custom Duration */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0, 240, 255, 0.03)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input 
                          type="checkbox"
                          id="use-picking-custom-duration-cb"
                          checked={(activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? useLongPickingCustomDuration : usePickingCustomDuration}
                          onChange={(e) => {
                            const isLong = activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking';
                            if (isLong) {
                              setUseLongPickingCustomDuration(e.target.checked);
                              if (e.target.checked && (longPickingCustomDurationVal === undefined || longPickingCustomDurationVal === null)) {
                                setLongPickingCustomDurationVal(longPickingDurationSeconds);
                              }
                            } else {
                              setUsePickingCustomDuration(e.target.checked);
                              if (e.target.checked && (pickingCustomDurationVal === undefined || pickingCustomDurationVal === null)) {
                                setPickingCustomDurationVal(pickingDurationSeconds);
                              }
                            }
                          }}
                          style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                        />
                        <label htmlFor="use-picking-custom-duration-cb" style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                          このプラン独自の時間を設定する
                        </label>
                      </div>
                      
                      {((activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? useLongPickingCustomDuration : usePickingCustomDuration) && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>個別設定値:</span>
                            <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>
                              {((activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? longPickingCustomDurationVal : pickingCustomDurationVal) || 0}秒
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <input
                              type="number"
                              min="0"
                              className="input-cyber"
                              style={{ width: '80px', fontSize: '11px', padding: '4px', borderColor: 'rgba(0, 240, 255, 0.4)' }}
                              value={((activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') ? longPickingCustomDurationVal : pickingCustomDurationVal) || 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                if (activeNoteMarker.type === 'long_picking' || activeNoteMarker.type === 'glong_picking') {
                                  setLongPickingCustomDurationVal(val);
                                } else {
                                  setPickingCustomDurationVal(val);
                                }
                              }}
                            />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>秒</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {pickingPicky && (
                  <div style={{ fontSize: '11px', color: '#39ff14', fontWeight: 'bold', padding: '4px', background: 'rgba(57,255,20,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                    Picky (0秒) 設定中のため時間設定は無効化されています。
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>SCROLL TARGET:</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px' }}>Pan/zoom the map freely, then click below to capture this view.</div>
            {activeNoteMarker.scrollConfig ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--green-neon)' }}>
                  ✓ Registered (X: {Math.round(activeNoteMarker.scrollConfig.x)}, Y: {Math.round(activeNoteMarker.scrollConfig.y)}, Z: {activeNoteMarker.scrollConfig.zoom.toFixed(2)}x)
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn-cyber" style={{ padding: '2px 6px', fontSize: '9px', flex: 1 }} onClick={handleSetScrollTarget}>
                    Update
                  </button>
                  <button className="btn-cyber danger" style={{ padding: '2px 6px', fontSize: '9px', flex: 1 }} onClick={handleClearScrollTarget}>
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-cyber success" style={{ padding: '4px 8px', fontSize: '10px', width: '100%' }} onClick={handleSetScrollTarget}>
                Set Current View as Target
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
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Status: {activeNoteMarker.phoneLocked ? '🔒 Locked (Always Active)' : (activeNoteMarker.phoneActive ? '📞 Active' : '☎ Inactive')}
              </div>
            </div>
          )}

          {/* Warp & Stairs Point Linking */}
          {(activeNoteMarker.type === 'warp' || activeNoteMarker.type === 'stairs') && (
            <div style={{ marginTop: '8px', borderTop: `1px dashed rgba(${activeNoteMarker.type === 'warp' ? '255, 0, 255' : '255, 170, 0'}, 0.3)`, paddingTop: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {activeNoteMarker.type === 'warp' ? '🌀 WARP TARGET (Unidirectional):' : '🪜 STAIRS TARGET (Unidirectional):'}
              </div>
              {activeNoteMarker.linkedWarpId ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: activeNoteMarker.type === 'warp' ? 'var(--magenta-neon)' : '#ffaa00' }}>
                    ✓ Leads to: {markers.find(m => m.id === activeNoteMarker.linkedWarpId)?.note || activeNoteMarker.linkedWarpId.substring(activeNoteMarker.linkedWarpId.length - 6)}
                  </div>
                  <button className="btn-cyber danger" style={{ padding: '2px 6px', fontSize: '9px' }} onClick={() => {
                    onMarkersChange(
                      markers.map(m => {
                        if (m.id === activeNoteMarker.id) {
                          const { linkedWarpId, ...rest } = m;
                          return rest;
                        }
                        return m;
                      })
                    );
                  }}>
                    Remove Target
                  </button>
                </div>
              ) : (
                <select
                  className="input-cyber"
                  style={{ width: '100%', fontSize: '10px', padding: '4px' }}
                  value=""
                  onChange={(e) => {
                    const partnerId = e.target.value;
                    if (partnerId) {
                      onMarkersChange(
                        markers.map(m => {
                          if (m.id === activeNoteMarker.id) return { ...m, linkedWarpId: partnerId };
                          return m;
                        })
                      );
                    }
                  }}
                >
                  <option value="">-- Select target {activeNoteMarker.type === 'warp' ? 'warp' : 'stairs'} --</option>
                  {markers
                    .filter(m => m.type === activeNoteMarker.type && m.id !== activeNoteMarker.id)
                    .map(m => (
                      <option key={m.id} value={m.id}>
                        {activeNoteMarker.type === 'warp' ? '🌀' : '🪜'} {m.note.trim() ? m.note : `${activeNoteMarker.type === 'warp' ? 'Warp' : 'Stairs'} #${m.id.substring(m.id.length - 4)}`} (X:{m.x} Y:{m.y})
                      </option>
                    ))
                  }
                </select>
              )}
            </div>
          )}
          
          {/* Appearance (Direction & Size) configuration for Info & Boss markers */}
          {(activeNoteMarker.type === 'info' || activeNoteMarker.type === 'boss') && (
            <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ポップアップ表示設定 (APPEARANCE):</div>
              
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
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
            </div>
          )}

          <div className="note-popover-buttons" style={{ marginTop: '8px' }}>
            <button className="btn-cyber danger" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setActiveNoteMarkerId(null)}>
              Cancel
            </button>
            <button className="btn-cyber success" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={handleSaveNote}>
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
        <button className="zoom-btn" onClick={resetView} title="Reset View (2x)">
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
    </div>
  );
};
