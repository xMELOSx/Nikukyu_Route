import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapCanvas } from './components/MapCanvas';
import { HistoryModal } from './components/HistoryModal';
import { HelpModal } from './components/HelpModal';
import { PlayDataPanel } from './components/PlayDataPanel';
import {
  type FloorType,
  type MarkerType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  type PresetData,
  MARKER_META,
  DataManager,
  normalizeStrokes,
  smoothStrokePoints,
  xorEncrypt,
  xorDecrypt,
  getAuthorKey,
  getOriginalAuthorKey
} from './utils/DataManager';
import { type HelpData, fetchHelpData } from './utils/HelpDataManager';
import { useNotifications } from './hooks/useNotifications';
import { useGlobalDefaults, type GlobalDefaults } from './hooks/useGlobalDefaults';
import { useGlobalMarkers } from './hooks/useGlobalMarkers';
import { useRoute, type SaveInfo } from './hooks/useRoute';
import { useHistory } from './hooks/useHistory';
import { useFileIO } from './hooks/useFileIO';
import { useAutoRoute } from './hooks/useAutoRoute';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  Save,
  Download,
  Upload,
  Image as ImageIcon,
  Eraser,
  Eye,
  Paintbrush,
  Move,
  RotateCcw,
  Undo,
  Redo,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Play,
  Pause,
  Square
} from 'lucide-react';

const migrateRouteCoordinates = (data: RouteData): RouteData => {
  if (data.mapVersion && data.mapVersion >= 2) {
    return data;
  }
  const migratedMarkers = (data.markers || []).map(m => {
    const updated = { ...m, x: m.x * 2, y: m.y * 2 };
    if (m.scrollConfig) {
      updated.scrollConfig = {
        ...m.scrollConfig,
        x: m.scrollConfig.x * 2,
        y: m.scrollConfig.y * 2
      };
    }
    return updated;
  });
  const migratedStrokes: { [key in FloorType]: DrawingStroke[] } = { main: [] };
  if (data.strokes) {
    Object.keys(data.strokes).forEach(floorKey => {
      const floorStrokes = data.strokes[floorKey as FloorType];
      if (Array.isArray(floorStrokes)) {
        migratedStrokes[floorKey as FloorType] = floorStrokes.map(stroke => ({
          ...stroke,
          points: (stroke.points || []).map(pt => ({ x: pt.x * 2, y: pt.y * 2 }))
        }));
      }
    });
  }
  return { ...data, markers: migratedMarkers, strokes: migratedStrokes, mapVersion: 2 };
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function App() {
  const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1';

  const currentFloor: FloorType = 'main';

  // --- Local UI / settings state (kept in the component) ---
  const [autoLoadLastRoute, setAutoLoadLastRoute] = useState<boolean>(() => {
    const stored = localStorage.getItem('heist_auto_load_last');
    return stored === null ? true : stored === 'true';
  });
  useEffect(() => {
    localStorage.setItem('heist_auto_load_last', String(autoLoadLastRoute));
  }, [autoLoadLastRoute]);

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [helpActiveTab, setHelpActiveTab] = useState<string>('spec');
  const [isHelpPreviewMode, setIsHelpPreviewMode] = useState<boolean>(false);
  const [showDetectionRanges, setShowDetectionRanges] = useState<boolean>(false);
  const [stopMarkerThreshold, setStopMarkerThresholdState] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_threshold_stop') || '');
    return !isNaN(v) && v >= 5 && v <= 30 ? v : 12;
  });
  const [movementMarkerThreshold, setMovementMarkerThresholdState] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_threshold_movement') || '');
    return !isNaN(v) && v >= 5 && v <= 30 ? v : 20;
  });
  const [warpMarkerThreshold, setWarpMarkerThresholdState] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_threshold_warp') || '');
    return !isNaN(v) && v >= 5 && v <= 30 ? v : 12;
  });
  const setStopMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setStopMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_stop', String(clamped));
  };
  const setMovementMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setMovementMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_movement', String(clamped));
  };
  const setWarpMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setWarpMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_warp', String(clamped));
  };
  const [helpTexts, setHelpTexts] = useState<HelpData>({});
  const [showMarkerLabels, setShowMarkerLabels] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_labels');
    return saved !== null ? saved === 'true' : true;
  });
  const [markerVisExpanded, setMarkerVisExpanded] = useState<boolean>(false);

  const [toolMode, setToolMode] = useState<'select' | 'draw' | 'erase' | 'pan' | 'add-marker' | 'toggle-display'>('pan');
  const [activeMarkerType, setActiveMarkerType] = useState<MarkerType | null>('cardkey');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => window.innerWidth < 768);

  const [strokeColor, setStrokeColor] = useState('#ff0055');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokeType, setStrokeType] = useState<'solid' | 'dashed'>('solid');
  const [drawMode, setDrawMode] = useState<'free' | 'smooth' | 'straight'>('smooth');
  const [disablePinsDuringDraw, setDisablePinsDuringDraw] = useState<boolean>(true);

  const [svgString, setSvgString] = useState<string>('');
  const [rightTab, setRightTab] = useState<'route' | 'play'>('route');
  const [markerScale, setMarkerScale] = useState<number>(() => {
    const saved = localStorage.getItem('heist_marker_scale');
    return saved !== null ? parseInt(saved) : 30;
  });
  const [presetListVisible, setPresetListVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [presetDeleteConfirmId, setPresetDeleteConfirmId] = useState<string | null>(null);
  const [historyDeleteConfirmId, setHistoryDeleteConfirmId] = useState<string | null>(null);
  const [newPlanConfirm, setNewPlanConfirm] = useState(false);
  const [resetTarget, setResetTarget] = useState<'lines' | 'pins' | 'both' | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<{ id: string; timestamp: number } | null>(null);
  const [currentPosTrigger, setCurrentPosTrigger] = useState<number>(0);

  // Preset editor state was previously used by an inline "Save as preset" form
  // that was removed during the hook extraction. Kept removed; the saveAsPreset
  // hook action is still available but the JSX form is no longer rendered.
  // (Future work: add a preset-editor modal that uses these state vars.)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetDurationSliderRef = useRef<HTMLInputElement | null>(null);
  const targetDurationTextRef = useRef<HTMLInputElement | null>(null);

  // --- Hooks (in dependency order) ---
  const notification = useNotifications(2000);

  // Global-defaults ref is created here so both useRoute (for applying
  // defaults on setRouteWithGlobalDefaults) and useGlobalDefaults (for
  // loading + setters) share the same instance.
  const globalDefaultsRef = useRef<GlobalDefaults>({ hiddenMarkers: [], hiddenMarkerTypes: [] });

  const globalMarkersStore = useGlobalMarkers({ isLocal });

  const routeApi = useRoute({
    isLocal,
    globalDefaultsRef,
    globalMarkersStore,
    showNotification: notification.show,
    initialMarkerScale: markerScale,
    onMarkerScaleChange: (s) => {
      setMarkerScale(s);
      localStorage.setItem('heist_marker_scale', String(s));
    }
  });

  const globalDefaults = useGlobalDefaults(globalDefaultsRef, (gd) => {
    routeApi.setRouteWithGlobalDefaults(prev => ({
      ...prev,
      hiddenMarkers: gd.hiddenMarkers || [],
      hiddenMarkerTypes: gd.hiddenMarkerTypes || []
    }));
  });

  const memoizedStrokes = useMemo(
    () => normalizeStrokes(routeApi.route.strokes[currentFloor]),
    [routeApi.route.strokes, currentFloor]
  );

  const historyApi = useHistory({
    getRoute: () => routeApi.route,
    getGlobalMarkers: () => globalMarkersStore.globalMarkers,
    replaceRoute: routeApi._replaceRoute,
    replaceGlobalMarkers: globalMarkersStore.replace,
    persistGlobalMarkers: (markers) => {
      localStorage.setItem('heist_global_markers', JSON.stringify(markers));
      if (isLocal) {
        fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markers)
        }).catch(() => { });
      }
    },
    onRestore: () => {
      setToolMode('pan');
      setActiveMarkerType(null);
    }
  });

  const fileIO = useFileIO({
    routeApi,
    globalMarkersStore,
    markerScale,
    showNotification: notification.show
  });

  const autoRoute = useAutoRoute();

  useKeyboardShortcuts({
    onUndo: historyApi.undo,
    onRedo: historyApi.redo,
    onToggleEditMode: () => setIsEditMode(prev => {
      const next = !prev;
      if (next === false) setToolMode('pan');
      return next;
    }),
    onToggleLeftSidebar: () => setLeftSidebarCollapsed(prev => !prev),
    onToggleRightSidebar: () => setRightSidebarCollapsed(prev => !prev),
    hasOpenModal: showHelpModal,
    onCloseModal: () => setShowHelpModal(false)
  });

  // --- Cross-cutting handlers (coordinate multiple stores) ---

  const updateStrokes = (newStrokes: DrawingStroke[]) => {
    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
    routeApi.setRoute(prev => ({
      ...prev,
      strokes: { ...prev.strokes, [currentFloor]: newStrokes }
    }));
  };

  const updateMarkers = (newMarkers: HeistMarker[], shouldPushHistory = false, options: { isDelete?: boolean } = {}) => {
    if (shouldPushHistory) {
      historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
    }
    const isIndivType = (type: string) =>
      ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint'].includes(type);
    const incomingGlobal = newMarkers.filter(m => !isIndivType(m.type));
    const newIndividual = newMarkers.filter(m => isIndivType(m.type));
    if (options.isDelete) {
      // Eraser: 受け取ったリストを「正」とみなしてそのまま反映 (削除込み)。
      // mergeOrUpdate は partial な更新にしか使えないので、ここだけ replace。
      globalMarkersStore.replace(incomingGlobal);
    } else {
      // 通常編集: グローバル側は globalMarkersStore が source of truth。
      // incoming は「マージ元」であり「置き換え元」ではない: mergeOrUpdate
      // は現在のグローバル状態をベースに、ID 一致分のみ上書きし、存在しない
      // ID は追加し、incoming に載っていない既存マーカーは保持する。これで
      // 「ドラッグした瞬間の位置」しか残らない問題を根治する。
      globalMarkersStore.mergeOrUpdate(incomingGlobal);
    }
    // ルートは display state (indiv マーカー + hidden リスト) のみ保持。
    routeApi.setRoute(prev => ({ ...prev, markers: newIndividual }));
  };

  const postGlobalDefaults = (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => {
    globalDefaults.setHidden(hiddenMarkers, hiddenMarkerTypes);
    if (isLocal) {
      fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenMarkers, hiddenMarkerTypes })
      });
    }
  };

  const handleHideGlobalMarker = (markerId: string) => {
    const current = routeApi.route.hiddenMarkers || [];
    const nextHidden = current.includes(markerId) ? current : [...current, markerId];
    const nextHiddenTypes = routeApi.route.hiddenMarkerTypes || [];
    postGlobalDefaults(nextHidden, nextHiddenTypes);
    routeApi.setRoute(prev => ({ ...prev, hiddenMarkers: nextHidden }));
  };
  const handleShowGlobalMarker = (markerId: string) => {
    const current = routeApi.route.hiddenMarkers || [];
    const nextHidden = current.filter(id => id !== markerId);
    const nextHiddenTypes = routeApi.route.hiddenMarkerTypes || [];
    postGlobalDefaults(nextHidden, nextHiddenTypes);
    routeApi.setRoute(prev => ({ ...prev, hiddenMarkers: nextHidden }));
  };
  const handleHideGlobalMarkerType = (markerType: MarkerType) => {
    const current = routeApi.route.hiddenMarkerTypes || [];
    const nextHiddenTypes = current.includes(markerType) ? current : [...current, markerType];
    const nextHidden = routeApi.route.hiddenMarkers || [];
    postGlobalDefaults(nextHidden, nextHiddenTypes);
    routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: nextHiddenTypes }));
  };
  const handleShowGlobalMarkerType = (markerType: MarkerType) => {
    const current = routeApi.route.hiddenMarkerTypes || [];
    const nextHiddenTypes = current.filter(t => t !== markerType);
    const nextHidden = routeApi.route.hiddenMarkers || [];
    postGlobalDefaults(nextHidden, nextHiddenTypes);
    routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: nextHiddenTypes }));
  };

  // --- Background effects: initial load, help data, target duration sync, startup focus ---

  // Load presets, help data, and auto-load last route on startup.
  useEffect(() => {
    localStorage.setItem('heist_global_markers_migrated_v2', 'true');
    routeApi.refreshSavesList();
    fetchHelpData().then(data => setHelpTexts(data));

    if (autoLoadLastRoute) {
      const lastId = localStorage.getItem('heist_last_used_route_id');
      if (lastId) {
        const data = DataManager.loadFromLocalStorage(lastId);
        if (data) {
          const migrated = migrateRouteCoordinates(data);
          if (migrated.mapVersion !== data.mapVersion) {
            DataManager.saveToLocalStorage(migrated);
          }
          routeApi.setRouteWithGlobalDefaults(migrated);
          if (migrated.markerScale !== undefined) {
            setMarkerScale(migrated.markerScale);
            localStorage.setItem('heist_marker_scale', String(migrated.markerScale));
          }
          notification.show(`前回データを読み込みました: ${migrated.title}`);
        }
      }
    }

    // Fetch presets with fallback to old default_preset.json
    fetch(`${import.meta.env.BASE_URL}api/presets`)
      .then(res => res.ok ? res.json() : [])
      .then((data: PresetData[]) => {
        if (Array.isArray(data) && data.length > 0) {
          routeApi.setPresets(data);
          return;
        }
        fetch(`${import.meta.env.BASE_URL}api/default-preset`)
          .then(res => res.ok ? res.json() : null)
          .then((oldPreset: RouteData | null) => {
            if (oldPreset) {
              const migratedPreset: PresetData = {
                id: 'preset_migrated',
                name: oldPreset.title || 'Default Preset',
                description: '',
                targetCash: oldPreset.targetCash || '',
                targetCoins: oldPreset.targetCoins || '',
                author: '',
                originalAuthor: '',
                updatedAt: Date.now(),
                routeData: oldPreset
              };
              routeApi.saveAsPreset({
                name: migratedPreset.name,
                description: '',
                author: '',
                originalAuthor: ''
              });
            }
          })
          .catch(() => { });
        const savesList = DataManager.getSavesList();
        if (savesList.length === 0) {
          fetch(`${import.meta.env.BASE_URL}default_preset.json`)
            .then(res => res.ok ? res.json() : null)
            .then((d: RouteData | null) => {
              if (d) {
                const migrated = migrateRouteCoordinates(d);
                routeApi.setRouteWithGlobalDefaults({ ...migrated, id: 'default' });
              }
            })
            .catch(() => { });
        }
      })
      .catch(() => { });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync target duration slider DOM value with state when the user is NOT
  // actively interacting with the slider. The slider is uncontrolled
  // (defaultValue) so the drag itself isn't interrupted by React reconciliation.
  useEffect(() => {
    if (targetDurationSliderRef.current &&
        document.activeElement !== targetDurationSliderRef.current) {
      const v = routeApi.route.targetDuration || '0';
      if (targetDurationSliderRef.current.value !== v) {
        targetDurationSliderRef.current.value = v;
      }
    }
  }, [routeApi.route.targetDuration]);

  // Startup focus: auto-pan to a configured marker on app load
  const startupFocusedRef = useRef(false);
  useEffect(() => {
    if (startupFocusedRef.current || globalMarkersStore.globalMarkers.length === 0) return;
    const targetId = globalDefaultsRef.current.startupFocusMarkerId;
    if (!targetId) return;
    const exists =
      globalMarkersStore.globalMarkers.some(m => m.id === targetId) ||
      routeApi.route.markers.some(m => m.id === targetId);
    if (!exists) return;
    startupFocusedRef.current = true;
    setTimeout(() => setFocusTrigger({ id: targetId, timestamp: Date.now() }), 300);
  }, [globalMarkersStore.globalMarkers, routeApi.route.markers]);

  // --- DnD handlers (window-level) ---
  const fileIORef = useRef(fileIO);
  fileIORef.current = fileIO;
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.json')) {
        fileIORef.current.onJsonFileChange({
          target: { files: e.dataTransfer?.files, value: '' }
        } as any);
      } else if (file.name.toLowerCase().endsWith('.png')) {
        await fileIORef.current.importPngFile(file);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Derived
  // (currentStrokesCount / currentMarkersCount intentionally not surfaced
  //  in the new UI; left as comments for future reference if needed.)

  // Wire handleExportPNG with the current refs/state
  const handleExportPNG = () => {
    fileIO.exportPNG({ floor: currentFloor, canvas: canvasRef.current, svgString });
  };

  const handleExportJSON = () => {
    fileIO.exportJSON();
  };

  const handleDeletePreset = (presetId: string) => {
    if (presetDeleteConfirmId === presetId) {
      routeApi.deletePreset(presetId);
      setPresetDeleteConfirmId(null);
    } else {
      setPresetDeleteConfirmId(presetId);
      setTimeout(() => setPresetDeleteConfirmId(null), 3000);
    }
  };

  const handleDeleteFromLocal = (e: React.MouseEvent, id: string) => {
    if (deleteConfirmId === id) {
      routeApi.deleteFromLocal(e, id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const createNewPlan = () => {
    if (!newPlanConfirm) {
      setNewPlanConfirm(true);
      setTimeout(() => setNewPlanConfirm(false), 3000);
      return;
    }
    setNewPlanConfirm(false);
    routeApi.createNewPlan();
  };

  // Quick-add current save as a preset
  const handleQuickPreset = (s: SaveInfo) => {
    const save = DataManager.loadFromLocalStorage(s.id);
    if (!save) return;
    const toSave: RouteData = { ...save, mapVersion: 2, markerScale };
    const newPreset: PresetData = {
      id: `preset_${Date.now()}`,
      name: save.title,
      description: save.description || '',
      targetCash: save.targetCash || '',
      targetCoins: save.targetCoins || '',
      author: xorDecrypt(save.author || '', getAuthorKey(save.id, save.createdAt)),
      originalAuthor: xorDecrypt(save.originalAuthor || '', getOriginalAuthorKey(save.id, save.createdAt)),
      updatedAt: Date.now(),
      routeData: toSave
    };
    fetch(`${import.meta.env.BASE_URL}api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([...routeApi.presets, newPreset])
    }).catch(() => { });
    routeApi.setPresets([...routeApi.presets, newPreset]);
    notification.show(`プリセット追加: ${newPreset.name}`);
  };

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------
  return (
    <div className="app-container">
      {notification.message && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0, 200, 100, 0.9)', color: '#fff', padding: '8px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, zIndex: 9999, boxShadow: '0 0 12px rgba(0, 200, 100, 0.5)' }}>
          {notification.message}
        </div>
      )}

      <main
        className="main-content"
        style={{
          gridTemplateColumns: `${leftSidebarCollapsed ? '0px' : '280px'} 1fr ${rightSidebarCollapsed ? '0px' : '340px'}`
        }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (!file) return;
          if (file.name.toLowerCase().endsWith('.png')) await fileIO.importPngFile(file);
          else fileIO.onJsonFileChange({ target: { files: e.dataTransfer.files, value: '' } } as any);
        }}
      >
        {/* Left Sidebar */}
        <section
          className="sidebar glass-panel"
          style={{ display: leftSidebarCollapsed ? 'none' : 'flex' }}
        >
          <div className="sidebar-fixed">
            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'rgba(5, 7, 10, 0.6)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <button
                  className={`btn-cyber ${isEditMode ? 'active' : ''}`}
                  style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                  onClick={() => { setIsEditMode(true); }}
                >
                  ✏️ 編集モード
                </button>
                <button
                  className={`btn-cyber ${!isEditMode ? 'active success' : ''}`}
                  style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                  onClick={() => { setIsEditMode(false); setToolMode('pan'); }}
                >
                  👁 表示モード
                </button>
              </div>
            </div>
          </div>

          <div className="sidebar-scroll">
            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
              <button
                className="btn-cyber"
                onClick={() => setShowHelpModal(true)}
                style={{ width: '100%', padding: '6px', fontSize: '12px', clipPath: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              >
                ❓ ヘルプ・設定
              </button>
            </div>

            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setMarkerVisExpanded(!markerVisExpanded)}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  fontSize: '11px',
                  background: 'rgba(0, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 255, 255, 0.15)',
                  borderRadius: '4px',
                  color: 'var(--cyan-neon)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 'bold'
                }}
              >
                <span>🏷️ マーカー表示設定</span>
                <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{markerVisExpanded ? '▼ 折りたたむ' : '▶ 展開'}</span>
              </button>

              {markerVisExpanded && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginBottom: '6px', marginTop: '8px' }}>
                    <input
                      type="checkbox"
                      checked={showMarkerLabels}
                      onChange={(e) => {
                        setShowMarkerLabels(e.target.checked);
                        localStorage.setItem('heist_show_labels', String(e.target.checked));
                      }}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    🏷️ ラベル表示
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <span>📌 ピン・ラベル倍率:</span>
                      <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{markerScale}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="200"
                      step="5"
                      value={markerScale}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setMarkerScale(val);
                        localStorage.setItem('heist_marker_scale', String(val));
                      }}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
                      <span>最小 (30%)</span>
                      <span>最大 (200%)</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <div className="panel-title" style={{ marginBottom: '6px' }}>MARKER VISIBILITY</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#7ec8e3', fontWeight: 'bold' }}>GLOBAL:</div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                          onClick={() => {
                            (['start', 'eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).forEach(t => {
                              if ((routeApi.route.hiddenMarkerTypes || []).includes(t)) handleShowGlobalMarkerType(t);
                            });
                          }}>ALL ON</button>
                        <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                          onClick={() => {
                            (['start', 'eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).forEach(t => {
                              if (!(routeApi.route.hiddenMarkerTypes || []).includes(t)) handleHideGlobalMarkerType(t);
                            });
                          }}>ALL OFF</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {(['start', 'eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
                        const meta = MARKER_META[t];
                        const isTypeHidden = (routeApi.route.hiddenMarkerTypes || []).includes(t);
                        return (
                          <button key={t} className="btn-cyber"
                            style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none', opacity: isTypeHidden ? 0.4 : 1, borderColor: isTypeHidden ? '#555' : meta.color, color: isTypeHidden ? '#555' : meta.color }}
                            onClick={() => { isTypeHidden ? handleShowGlobalMarkerType(t) : handleHideGlobalMarkerType(t); }}>
                            {meta.emoji} {meta.label.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0 8px' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#ff6b9d', fontWeight: 'bold' }}>INDIVIDUAL:</div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                          onClick={() => {
                            (['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'] as MarkerType[]).forEach(t => {
                              if ((routeApi.route.hiddenMarkerTypes || []).includes(t)) handleShowGlobalMarkerType(t);
                            });
                          }}>ALL ON</button>
                        <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                          onClick={() => {
                            (['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'] as MarkerType[]).forEach(t => {
                              if (!(routeApi.route.hiddenMarkerTypes || []).includes(t)) handleHideGlobalMarkerType(t);
                            });
                          }}>ALL OFF</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {(['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'] as MarkerType[]).map(t => {
                        const meta = MARKER_META[t];
                        const isTypeHidden = (routeApi.route.hiddenMarkerTypes || []).includes(t);
                        return (
                          <button key={t} className="btn-cyber"
                            style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none', opacity: isTypeHidden ? 0.4 : 1, borderColor: isTypeHidden ? '#555' : meta.color, color: isTypeHidden ? '#555' : meta.color }}
                            onClick={() => { isTypeHidden ? handleShowGlobalMarkerType(t) : handleHideGlobalMarkerType(t); }}>
                            {meta.emoji} {meta.label.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="panel-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="panel-title" style={{ marginBottom: 0 }}>階層移動</div>
                <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none' }} onClick={() => setCurrentPosTrigger(Date.now())} title="現在の自動ルート位置にカメラを移動">
                  📍 現在位置に移動
                </button>
              </div>
              <div className="saves-list" style={{ maxHeight: '175px' }}>
                {globalMarkersStore.globalMarkers.filter(m => m.type === 'room').length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                    No room markers placed. Select 🚪 in markers below and click map to place.
                  </div>
                ) : (
                  globalMarkersStore.globalMarkers
                    .filter(m => m.type === 'room')
                    .map(m => {
                      const meta = MARKER_META[m.type];
                      return (
                        <div key={m.id} className="save-item" onClick={() => setFocusTrigger({ id: m.id, timestamp: Date.now() })}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                            <strong>{meta.emoji} {m.note.trim() ? m.note : `${meta.label} #${m.id.substring(m.id.length - 4)}`}</strong>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--cyan-neon)' }}>Go ➔</span>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {isEditMode && (
              <div className="panel-section">
                <div className="panel-title">モード選択</div>
                <div className="tool-grid">
                  <button className={`tool-btn ${toolMode === 'draw' ? 'active' : ''}`} onClick={() => setToolMode('draw')} id="tool-draw-btn">
                    <Paintbrush size={18} /><span>Draw Line</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'erase' ? 'active' : ''}`} onClick={() => setToolMode('erase')} id="tool-erase-btn">
                    <Eraser size={18} /><span>Eraser</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'toggle-display' ? 'active' : ''}`} onClick={() => setToolMode('toggle-display')} id="tool-toggle-btn">
                    <Eye size={18} /><span>表示切替</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'pan' ? 'active' : ''}`} onClick={() => setToolMode('pan')} id="tool-pan-btn">
                    <Move size={18} /><span>Pan Map</span>
                  </button>
                  {!resetTarget ? (
                    <button className="tool-btn" onClick={() => setResetTarget('both')} id="tool-reset-btn">
                      <RotateCcw size={18} /><span>Reset Map</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', background: 'rgba(255,100,100,0.1)', borderRadius: '6px', border: '1px solid rgba(255,100,100,0.3)' }}>
                      <div style={{ fontSize: '10px', color: '#ff6b6b', textAlign: 'center', marginBottom: '2px' }}>削除対象を選択:</div>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] } }));
                        setResetTarget(null);
                      }}>📝 ラインのみ</button>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, markers: [], hiddenMarkers: [] }));
                        setResetTarget(null);
                      }}>📍 ピンのみ</button>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] }, markers: [], hiddenMarkers: [] }));
                        setResetTarget(null);
                      }}>🗑️ 両方削除</button>
                      <button className="btn-cyber" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => setResetTarget(null)}>キャンセル</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {toolMode === 'draw' && (
              <div className="panel-section">
                <div className="panel-title">3. BRUSH CONFIG</div>
                <div className="color-picker">
                  {['#ff0055', '#ffe600', '#39ff14', '#00f0ff', '#ff00ff', '#ffffff'].map(c => (
                    <div key={c} className={`color-dot ${strokeColor === c ? 'active' : ''}`} style={{ backgroundColor: c, color: c }} onClick={() => setStrokeColor(c)} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {(['solid', 'dashed'] as const).map(t => (
                    <button key={t} className={`btn-cyber ${strokeType === t ? 'active' : ''}`} style={{ flex: 1, padding: '4px 2px', fontSize: '11px' }} onClick={() => setStrokeType(t)}>
                      {t === 'solid' ? '進行ルート' : '分岐ルート'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {(['free', 'smooth', 'straight'] as const).map(m => (
                    <button key={m} className={`btn-cyber ${drawMode === m ? 'active' : ''}`} style={{ flex: 1, padding: '4px 2px', fontSize: '10px' }} onClick={() => setDrawMode(m)} title={m === 'free' ? '通常描画 (全ポイント記録)' : m === 'smooth' ? '間引き描画 (滑らかな線)' : '直線ツール (始点→終点のみ)'}>
                      {m === 'free' ? 'FREE' : m === 'smooth' ? 'SMOOTH' : '直線'}
                    </button>
                  ))}
                </div>
                <button className="btn-cyber" style={{ width: '100%', marginTop: '6px', padding: '5px', fontSize: '10px' }} onClick={() => {
                  if (routeApi.route.strokes[currentFloor] && routeApi.route.strokes[currentFloor].length > 0) {
                    const lastIdx = routeApi.route.strokes[currentFloor].length - 1;
                    const last = routeApi.route.strokes[currentFloor][lastIdx];
                    const smoothed = smoothStrokePoints(last.points, 3, 1500);
                    updateStrokes([...routeApi.route.strokes[currentFloor].slice(0, lastIdx), { ...last, points: smoothed }]);
                  }
                }}>
                  ✨ 最後の線を平滑化
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Brush Width: {strokeWidth}px</span>
                  <input type="range" min="2" max="12" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '8px', userSelect: 'none' }}>
                  <input type="checkbox" checked={disablePinsDuringDraw} onChange={(e) => setDisablePinsDuringDraw(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                  ライン描画時のピン干渉防止 (遮断)
                </label>
              </div>
            )}

            {isEditMode && isLocal && (
              <div className="panel-section">
                <div className="panel-title">マーカー(グローバル)</div>
                <div className="marker-list">
                  {(['start', 'eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'room', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
                    const meta = MARKER_META[t];
                    return (
                      <button key={t} className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                        onClick={() => { setToolMode('add-marker'); setActiveMarkerType(t); }}
                        style={{ '--theme-color': meta.color } as React.CSSProperties}>
                        <span className="marker-icon-preview">{meta.emoji}</span>
                        <span>{t === 'start' ? 'START' : t === 'cardkey' ? 'CARD KEY' : meta.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isEditMode && (
              <div className="panel-section">
                <div className="panel-title">マーカー</div>
                <div className="marker-list">
                  {(['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'] as MarkerType[]).map(t => {
                    const meta = MARKER_META[t];
                    return (
                      <button key={t} className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                        onClick={() => { setToolMode('add-marker'); setActiveMarkerType(t); }}
                        style={{ '--theme-color': meta.color } as React.CSSProperties}>
                        <span className="marker-icon-preview">{meta.emoji}</span>
                        <span>{t === 'iwarp' ? 'I-WARP' : meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(() => {
              const allPhones = globalMarkersStore.globalMarkers.filter(m => m.type === 'phone');
              const activeCount = allPhones.filter(m => m.phoneActive).length;
              if (allPhones.length === 0) return null;
              return (
                <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 0, 255, 0.1)', paddingTop: '6px' }}>
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📞 ReroRero電話ボックス</span>
                    <span style={{ fontSize: '10px', color: 'var(--magenta-neon, #ff00ff)', fontWeight: 'bold' }}>{activeCount}/{allPhones.length}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-cyber" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const updated = globalMarkersStore.globalMarkers.map(m =>
                        m.type === 'phone' && !m.phoneLocked ? { ...m, phoneActive: false } : m
                      );
                      globalMarkersStore.replace(updated);
                    }}>☎ Reset All</button>
                    <button className="btn-cyber success" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const unlocked = globalMarkersStore.globalMarkers
                        .map((m, i) => ({ m, i }))
                        .filter(({ m }) => m.type === 'phone' && !m.phoneLocked);
                      const shuffled = [...unlocked].sort(() => Math.random() - 0.5);
                      const toActivate = new Set(shuffled.slice(0, 5).map(({ i }) => i));
                      const updated = globalMarkersStore.globalMarkers.map((m, i) => {
                        if (m.type === 'phone' && !m.phoneLocked) {
                          return { ...m, phoneActive: toActivate.has(i) };
                        }
                        return m;
                      });
                      globalMarkersStore.replace(updated);
                    }}>📞 Random 5</button>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const allInfos = globalMarkersStore.globalMarkers.filter(m => m.type === 'info');
              if (allInfos.length === 0) return null;
              return (
                <div className="panel-section" style={{ borderTop: '1px solid rgba(79, 195, 247, 0.15)', paddingTop: '6px' }}>
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ℹ️ INFO</span>
                    <span style={{ fontSize: '10px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold' }}>{allInfos.filter(m => m.infoExpanded).length}/{allInfos.length}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-cyber success" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const updated = globalMarkersStore.globalMarkers.map(m => m.type === 'info' ? { ...m, infoExpanded: true } : m);
                      globalMarkersStore.replace(updated);
                    }}>すべて開く</button>
                    <button className="btn-cyber danger" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const updated = globalMarkersStore.globalMarkers.map(m => m.type === 'info' ? { ...m, infoExpanded: false } : m);
                      globalMarkersStore.replace(updated);
                    }}>すべて閉じる</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        {/* Map area */}
        <section style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
          <MapCanvas
            floor={currentFloor}
            strokes={memoizedStrokes}
            markers={[...globalMarkersStore.globalMarkers, ...routeApi.route.markers]}
            customBg={routeApi.route.customBg[currentFloor] ?? null}
            toolMode={toolMode}
            activeMarkerType={activeMarkerType}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            strokeType={strokeType}
            drawMode={drawMode}
            onStrokesChange={updateStrokes}
            onMarkersChange={updateMarkers}
            onSvgStringReady={setSvgString}
            canvasRef={canvasRef}
            focusTrigger={focusTrigger}
            onClearFocusTrigger={() => setFocusTrigger(null)}
            currentPosTrigger={currentPosTrigger}
            isEditMode={isEditMode}
            showMarkerLabels={showMarkerLabels}
            markerScale={markerScale}
            bossCustomDurations={routeApi.route.bossCustomDurations}
            onBossCustomDurationChange={(id, dur) => routeApi.setBossCustomDuration(id, dur)}
            battleCustomDurations={routeApi.route.battleCustomDurations}
            onBattleCustomDurationChange={(id, dur) => routeApi.setBattleCustomDuration(id, dur)}
            pickingCustomDurations={routeApi.route.pickingCustomDurations}
            onPickingCustomDurationChange={(id, dur) => routeApi.setPickingCustomDuration(id, dur)}
            longPickingCustomDurations={routeApi.route.longPickingCustomDurations}
            onLongPickingCustomDurationChange={(id, dur) => routeApi.setLongPickingCustomDuration(id, dur)}
            disablePinsDuringDraw={disablePinsDuringDraw}
            onMarkersDragStart={historyApi.startDragSnapshot}
            onMarkersDragEnd={historyApi.commitDragSnapshot}
            stopMarkerThreshold={stopMarkerThreshold}
            movementMarkerThreshold={movementMarkerThreshold}
            warpMarkerThreshold={warpMarkerThreshold}
            showDetectionRanges={showDetectionRanges}
            hiddenMarkers={routeApi.route.hiddenMarkers || []}
            hiddenMarkerTypes={routeApi.route.hiddenMarkerTypes || []}
            globalMarkerIds={globalMarkersStore.globalMarkers.map(m => m.id)}
            onHideGlobalMarker={handleHideGlobalMarker}
            onShowGlobalMarker={handleShowGlobalMarker}
            onAutoRouteStatusChange={autoRoute.setStatus}
            autoRouteCommand={autoRoute.command}
            autoRouteSettings={{
              waitEnabled: autoRoute.waitEnabled,
              waitSeconds: autoRoute.waitSeconds,
              speedMultiplier: autoRoute.speedMultiplier,
              followCamera: autoRoute.followCamera
            }}
            followCamera={autoRoute.followCamera}
          />
          {/* Sidebar collapse buttons */}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 100, background: 'rgba(10, 15, 28, 0.9)', border: '1px solid var(--border-color)',
              borderLeft: 'none', color: 'var(--cyan-neon)', padding: '12px 4px', borderRadius: '0 8px 8px 0',
              cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '2px 0 10px rgba(0, 240, 255, 0.2)'
            }}
            title={leftSidebarCollapsed ? "Show Left Panel (Shortcut: [)" : "Hide Left Panel (Shortcut: [)"}
          >
            {leftSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <button
            onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 100, background: 'rgba(10, 15, 28, 0.9)', border: '1px solid var(--border-color)',
              borderRight: 'none', color: 'var(--cyan-neon)', padding: '12px 4px', borderRadius: '8px 0 0 8px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '-2px 0 10px rgba(0, 240, 255, 0.2)'
            }}
            title={rightSidebarCollapsed ? "Show Right Panel (Shortcut: ])" : "Hide Right Panel (Shortcut: ])"}
          >
            {rightSidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </section>

        {/* Right Sidebar */}
        <section
          className="sidebar-right glass-panel"
          style={{ display: rightSidebarCollapsed ? 'none' : 'flex' }}
        >
          <div className="sidebar-fixed">
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'route' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'route' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'route' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('route')}>ルート計画</button>
              <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'play' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'play' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'play' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('play')}>プレイデータ</button>
            </div>
          </div>

          <div className="sidebar-scroll">
            {rightTab === 'route' && (<>
              <div className="panel-section">
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={routeApi.saveToLocal}>
                    <Save size={12} /> セーブ
                  </button>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => setPresetListVisible(true)}>
                    <Upload size={12} /> 読込
                  </button>
                  <button className="btn-cyber danger" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={createNewPlan}>
                    <FilePlus size={12} /> {newPlanConfirm ? '実行?' : '新規'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportJSON}>
                    <Download size={12} /> JSON保存
                  </button>
                  <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportPNG}>
                    <ImageIcon size={12} /> 画像保存
                  </button>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => fileIO.jsonFileInputRef.current?.click()}>
                    <Upload size={12} /> インポート
                  </button>
                  <input
                    type="file"
                    ref={fileIO.jsonFileInputRef}
                    onChange={fileIO.onJsonFileChange}
                    accept=".json,.png"
                    style={{ display: 'none' }}
                  />
                </div>

                <div className={isEditMode ? 'route-plan-fields' : 'route-plan-fields display-mode'} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>プラン名</label>
                  {isEditMode ? (
                    <input type="text" className="input-cyber" value={routeApi.route.title}
                      onChange={(e) => routeApi.setRoute({ ...routeApi.route, title: e.target.value })}
                      onFocus={(e) => { (e.target as HTMLInputElement).dataset.origTitle = routeApi.route.title; }}
                      onBlur={(e) => {
                        const orig = e.target.dataset.origTitle || '';
                        const next = e.target.value.trim();
                        if (!next || next === orig) return;
                        const newRoute: RouteData = { ...routeApi.route, id: `route_${Date.now()}`, title: next, createdAt: Date.now() };
                        DataManager.saveToLocalStorage(newRoute);
                        routeApi.setRoute(newRoute);
                        routeApi.refreshSavesList();
                      }}
                    />
                  ) : (
                    <div className="display-field">{routeApi.route.title || <span className="empty">(未設定)</span>}</div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>想定獲得ファンス</label>
                      {isEditMode ? (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>$</span>
                          <input type="text" className="input-cyber" style={{ paddingLeft: '24px', width: '100%' }} value={routeApi.route.targetCash}
                            onChange={(e) => routeApi.setRoute({ ...routeApi.route, targetCash: e.target.value.replace(/,/g, '') })}
                            onBlur={(e) => {
                              const raw = e.target.value.replace(/,/g, '');
                              const n = parseInt(raw);
                              if (raw === '' || isNaN(n)) return;
                              routeApi.setRoute(prev => ({ ...prev, targetCash: n.toLocaleString() }));
                            }}
                            onFocus={(e) => {
                              const raw = e.target.value.replace(/,/g, '');
                              if (raw) routeApi.setRoute(prev => ({ ...prev, targetCash: raw }));
                            }}
                          />
                        </div>
                      ) : (
                        <div className="display-field"><span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginRight: '4px' }}>$</span>{routeApi.route.targetCash || <span className="empty">(未設定)</span>}</div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>にくきゅうコイン</label>
                      {isEditMode ? (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>🪙</span>
                          <input type="text" className="input-cyber" style={{ paddingLeft: '30px', width: '100%' }} value={routeApi.route.targetCoins}
                            onChange={(e) => routeApi.setRoute({ ...routeApi.route, targetCoins: e.target.value.replace(/,/g, '') })}
                            onBlur={(e) => {
                              const raw = e.target.value.replace(/,/g, '');
                              const n = parseInt(raw);
                              if (raw === '' || isNaN(n)) return;
                              routeApi.setRoute(prev => ({ ...prev, targetCoins: n.toLocaleString() }));
                            }}
                            onFocus={(e) => {
                              const raw = e.target.value.replace(/,/g, '');
                              if (raw) routeApi.setRoute(prev => ({ ...prev, targetCoins: raw }));
                            }}
                          />
                        </div>
                      ) : (
                        <div className="display-field"><span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginRight: '4px' }}>🪙</span>{routeApi.route.targetCoins || <span className="empty">(未設定)</span>}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>
                      目標所要時間{isEditMode && (
                        <span style={{ color: 'var(--yellow-neon, #ffe600)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginLeft: '4px' }}>
                          {(() => { const s = parseInt(routeApi.route.targetDuration || '0'); return !isNaN(s) ? `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : '--:--'; })()}
                        </span>
                      )}
                    </label>
                    {isEditMode ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <input ref={targetDurationSliderRef} type="range" style={{ flex: 1, accentColor: 'var(--cyan-neon)', height: '24px', cursor: 'pointer' }}
                          min="0" max="720" step="1" defaultValue={routeApi.route.targetDuration || '0'}
                          onChange={(e) => routeApi.setRoute(prev => ({ ...prev, targetDuration: e.target.value }))}
                          onWheel={(e) => {
                            if (!isEditMode) return;
                            e.preventDefault();
                            const cur = parseInt(routeApi.route.targetDuration || '0');
                            const next = Math.min(720, Math.max(0, cur + (e.deltaY < 0 ? 1 : -1)));
                            routeApi.setRoute(prev => ({ ...prev, targetDuration: String(next) }));
                          }}
                        />
                        <input ref={targetDurationTextRef} type="text" className="input-cyber" style={{ width: '56px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', padding: '3px 2px', color: 'var(--cyan-neon)' }}
                          defaultValue={(() => { const sec = parseInt(routeApi.route.targetDuration || '0'); return isNaN(sec) ? '0' : String(sec); })()}
                          onFocus={(e) => {
                            const sec = parseInt(routeApi.route.targetDuration || '0');
                            (e.target as HTMLInputElement).value = isNaN(sec) ? '' : String(sec);
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            const num = parseInt(v) || 0;
                            const total = v.length >= 4 ? Math.floor(num / 100) * 60 + (num % 100) : num;
                            routeApi.setRoute(prev => ({ ...prev, targetDuration: String(Math.min(720, Math.max(0, total))) }));
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          placeholder="秒数か4桁"
                        />
                      </div>
                    ) : (
                      <div className="display-field-time" style={{ marginTop: '4px' }}>
                        {(() => { const s = parseInt(routeApi.route.targetDuration || '0'); return !isNaN(s) ? `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : '--:--'; })()}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>作者名</label>
                      {isEditMode ? (
                        <input type="text" className="input-cyber" style={{ width: '100%', boxSizing: 'border-box' }}
                          value={xorDecrypt(routeApi.route.author, getAuthorKey(routeApi.route.id, routeApi.route.createdAt))}
                          onChange={(e) => routeApi.setRoute({ ...routeApi.route, author: xorEncrypt(e.target.value, getAuthorKey(routeApi.route.id, routeApi.route.createdAt)) })}
                          placeholder="名前"
                        />
                      ) : (
                        <div className="display-field">
                          {(() => { const v = xorDecrypt(routeApi.route.author, getAuthorKey(routeApi.route.id, routeApi.route.createdAt)); return v || <span className="empty">(未設定)</span>; })()}
                        </div>
                      )}
                    </div>
                    {isLocal && (
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>原作者名</label>
                        {isEditMode ? (
                          <input type="text" className="input-cyber" style={{ width: '100%', boxSizing: 'border-box' }}
                            value={xorDecrypt(routeApi.route.originalAuthor, getOriginalAuthorKey(routeApi.route.id, routeApi.route.createdAt))}
                            onChange={(e) => routeApi.setRoute({ ...routeApi.route, originalAuthor: xorEncrypt(e.target.value, getOriginalAuthorKey(routeApi.route.id, routeApi.route.createdAt)) })}
                            disabled={routeApi.route.originalAuthor !== undefined && routeApi.route.originalAuthor !== ''}
                            placeholder="元の作者"
                          />
                        ) : (
                          <div className="display-field">
                            {(() => { const v = xorDecrypt(routeApi.route.originalAuthor, getOriginalAuthorKey(routeApi.route.id, routeApi.route.createdAt)); return v || <span className="empty">(未設定)</span>; })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {isLocal && (
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>CUSTOM BG</label>
                        {isEditMode ? (
                          <>
                            <button className="btn-cyber" style={{ width: '100%', marginTop: '4px', padding: '6px' }} onClick={() => fileIO.bgFileInputRef.current?.click()}>
                              <ImageIcon size={12} /> Upload Map
                            </button>
                            <input type="file" ref={fileIO.bgFileInputRef} onChange={fileIO.onBgFileChange} accept="image/*" style={{ display: 'none' }} id="bg-file-input" />
                          </>
                        ) : (
                          <div className="display-field" style={{ marginTop: '4px' }}>
                            {routeApi.route.customBg[currentFloor] ? 'カスタムBG: 設定済み' : <span className="empty">デフォルトBG使用中</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {routeApi.route.customBg[currentFloor] && isEditMode && (
                      <button className="btn-cyber danger" style={{ padding: '4px', fontSize: '10px', marginTop: '4px' }} onClick={() => routeApi.setRoute(prev => ({ ...prev, customBg: { main: null } }))}>
                        Reset to Default Background
                      </button>
                    )}
                  </div>

                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700, marginTop: '4px' }}>備考</label>
                  {isEditMode ? (
                    <textarea className="textarea-cyber" placeholder="Write overall heist instructions..." value={routeApi.route.description} onChange={(e) => routeApi.setRoute({ ...routeApi.route, description: e.target.value })} />
                  ) : (
                    <div className="display-field display-field-multi">{routeApi.route.description || <span className="empty">(未設定)</span>}</div>
                  )}
                </div>
              </div>

              <div className="panel-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="panel-title" style={{ flex: 1 }}>マーカー編集履歴 (50件)</div>
                  <button className="btn-cyber" onClick={() => setShowHistoryModal(true)} style={{ padding: '2px 6px', fontSize: '9px', clipPath: 'none' }}>全履歴</button>
                  <button className="btn-cyber" onClick={historyApi.undo} disabled={!historyApi.canUndo} title="Undo (Ctrl+Z)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canUndo ? 1 : 0.4, cursor: historyApi.canUndo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Undo size={12} /></button>
                  <button className="btn-cyber" onClick={historyApi.redo} disabled={!historyApi.canRedo} title="Redo (Ctrl+Y)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canRedo ? 1 : 0.4, cursor: historyApi.canRedo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Redo size={12} /></button>
                </div>
                <div className="placed-notes-list">
                  {(() => {
                    const historyMarkers = isLocal
                      ? [...globalMarkersStore.globalMarkers, ...routeApi.route.markers]
                      : [...routeApi.route.markers];
                    if (historyMarkers.length === 0) {
                      return <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>マーカーがありません</div>;
                    }
                    return historyMarkers.reverse().slice(0, 50).map(m => {
                      const meta = MARKER_META[m.type];
                      return (
                        <div key={m.id} className="placed-note-item" style={{ borderLeft: `3px solid ${meta.color}`, cursor: 'pointer' }} onClick={() => setFocusTrigger({ id: m.id, timestamp: Date.now() })} title={m.scrollConfig ? 'クリックでこのピンに移動 (カスタムスクロール)' : 'クリックでこのピンに移動 (デフォルトスクロール)'}>
                          <div className="placed-note-item-header">
                            <span className="placed-note-type" style={{ color: meta.color }}>{meta.emoji} {meta.label}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>X:{m.x} Y:{m.y}</span>
                            {isEditMode && (historyDeleteConfirmId === m.id ? (
                              <>
                                <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); routeApi.setRoute(prev => ({ ...prev, markers: prev.markers.filter(x => x.id !== m.id) })); globalMarkersStore.setGlobalMarkers(prev => prev.filter(x => x.id !== m.id)); setHistoryDeleteConfirmId(null); notification.show('マーカーを削除しました'); }}>削除する</button>
                                <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(null); }}>×</button>
                              </>
                            ) : (
                              <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(m.id); setTimeout(() => setHistoryDeleteConfirmId(null), 3000); }}>削除</button>
                            ))}
                          </div>
                          <div className="placed-note-text">{m.note.trim() ? m.note : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No text note details</span>}</div>
                          <div style={{ fontSize: '9px', color: m.scrollConfig ? 'var(--cyan-neon)' : 'var(--text-muted)', marginTop: '2px', textAlign: 'right' }}>{m.scrollConfig ? '🎯 Click to Pan ➔' : 'Click to Pan ➔'}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </>)}

            {rightTab === 'play' && (
              <>
                <div className="panel-section">
                  <button type="button" onClick={autoRoute.toggleCollapsed} style={{ width: '100%', padding: '4px 8px', fontSize: '11px', background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '4px', color: 'var(--cyan-neon)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: autoRoute.collapsed ? 0 : '8px' }} title="自動ルート案内を使わない場合は畳んで非表示にできます">
                    <span>🐾 自動ルート案内</span>
                    <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{autoRoute.collapsed ? '▶ 展開' : '▼ 折りたたむ'}</span>
                  </button>

                  {!autoRoute.collapsed && (
                    <div style={{ background: 'rgba(10, 15, 28, 0.6)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '6px', padding: '8px' }}>
                      {autoRoute.status.error && (
                        <div style={{ fontSize: '10px', color: 'var(--magenta-neon, #ff00ff)', padding: '4px', background: 'rgba(255,0,85,0.1)', borderRadius: '3px', marginBottom: '4px' }}>⚠ {autoRoute.status.error}</div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px', padding: '4px', background: 'rgba(0,0,0,0.25)', borderRadius: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <input type="checkbox" checked={autoRoute.waitEnabled} onChange={(e) => autoRoute.setWaitEnabled(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)' }} />
                          開始前に待機 (<input type="number" min="0" max="60" value={autoRoute.waitSeconds} onChange={(e) => autoRoute.setWaitSeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} disabled={!autoRoute.waitEnabled} style={{ width: '36px', fontSize: '10px', textAlign: 'center', padding: '1px 2px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--cyan-neon)', borderRadius: '2px' }} />秒)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.followCamera} onChange={(e) => autoRoute.setFollowCamera(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          🎥 カメラ追従
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>倍速:</span>
                          {([1, 2, 3, 5] as const).map(m => (
                            <button key={m} className={`btn-cyber ${autoRoute.speedMultiplier === m ? 'active' : ''}`} style={{ flex: 1, padding: '2px', fontSize: '10px' }} onClick={() => autoRoute.setSpeedMultiplier(m)}>x{m}</button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                        {autoRoute.status.waitRemaining > 0 ? (
                          <div style={{ flex: 1, padding: '5px', fontSize: '11px', textAlign: 'center', color: 'var(--yellow-neon)', fontWeight: 700 }}>待機中... {autoRoute.status.waitRemaining.toFixed(1)}s</div>
                        ) : !autoRoute.status.active ? (
                          <button className="btn-cyber" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('start')}><Play size={12} /> スタート</button>
                        ) : autoRoute.status.running ? (
                          <button className="btn-cyber" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('pause')}><Pause size={11} /> 一時停止</button>
                        ) : (
                          <button className="btn-cyber success" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('resume')}><Play size={11} /> 再開</button>
                        )}
                        <button className={`btn-cyber ${autoRoute.status.active ? 'danger' : ''}`} style={{ flex: 1, padding: '5px', fontSize: '11px', opacity: autoRoute.status.active ? 1 : 0.4 }} disabled={!autoRoute.status.active} onClick={() => autoRoute.sendCommand('reset')}>
                          <Square size={11} /> 停止
                        </button>
                      </div>

                      {autoRoute.status.active && (
                        <>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4px' }}>Space キーで一時停止 / 再開</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px', padding: '4px 6px', background: 'rgba(0, 240, 255, 0.06)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '3px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>経過</span>
                              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cyan-neon)', fontFamily: 'monospace', lineHeight: 1.1 }}>{formatTime(autoRoute.status.elapsed)}</span>
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--text-muted)', padding: '0 4px' }}>/</div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>合計</span>
                              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1.1 }}>{formatTime(autoRoute.status.totalTime)}</span>
                            </div>
                          </div>
                          <div
                            style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px', cursor: 'pointer', position: 'relative' }}
                            title="クリックでシーク"
                            onClick={(e) => {
                              if (!autoRoute.status.active || autoRoute.status.totalTime <= 0) return;
                              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                              if (rect.width <= 0) return;
                              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                              const target = ratio * autoRoute.status.totalTime;
                              if (!isFinite(target) || isNaN(target)) return;
                              autoRoute.sendCommand('seek', target);
                            }}
                          >
                            <div style={{ height: '100%', width: `${Math.min(100, (autoRoute.status.elapsed / Math.max(autoRoute.status.totalTime, 0.001)) * 100)}%`, background: 'var(--cyan-neon)', transition: 'width 0.1s' }} />
                            {autoRoute.status.checkpoints.map((cp, i) => {
                              if (autoRoute.status.totalTime <= 0) return null;
                              const ratio = cp.elapsed / autoRoute.status.totalTime;
                              return (
                                <div key={`cp-line-${i}`} title={`🏁 ${cp.label} @ ${formatTime(cp.elapsed)}${cp.passed ? ' (通過済)' : ''}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(100, Math.max(0, ratio * 100))}%`, width: '2px', background: cp.passed ? '#39ff14' : '#ff9500', opacity: 0.85, pointerEvents: 'none', boxShadow: '0 0 3px rgba(255,149,0,0.8)' }} />
                              );
                            })}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>停止 {formatTime(autoRoute.status.totalStopTime)}</span>
                            {autoRoute.status.nextMarkerLabel && <span style={{ color: 'var(--yellow-neon)' }}>次: {autoRoute.status.nextMarkerLabel}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="panel-section">
                  <div className="panel-title">プレイデータ</div>
                  <PlayDataPanel
                    routeTitle={routeApi.route.title}
                    onNotify={(msg) => { notification.show(msg); }}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {presetListVisible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPresetListVisible(false)}>
          <div style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-neon)' }}>セーブデータ読み込み</div>
              <button className="btn-cyber" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={() => setPresetListVisible(false)}>✕ 閉じる</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {routeApi.presets.length === 0 && routeApi.saves.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>セーブデータはまだありません</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {routeApi.presets.map(p => (
                    <div key={p.id} style={{ padding: '10px 12px', background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => { routeApi.loadFromLocal(`__preset__${p.id}`); setPresetListVisible(false); }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#ffd700', fontSize: '14px' }}>★</span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffd700' }}>{p.name}</span>
                          <span style={{ fontSize: '9px', padding: '1px 6px', background: 'rgba(255,215,0,0.2)', color: '#ffd700', borderRadius: '4px' }}>プリセット</span>
                        </div>
                        {isLocal && isEditMode && (
                          <button
                            style={{ fontSize: '9px', padding: '2px 6px', background: defaultPresetId === p.id ? 'var(--cyan-neon)' : 'transparent', color: defaultPresetId === p.id ? '#000' : 'var(--text-muted)', border: '1px solid var(--cyan-neon)', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                            onClick={(e) => { e.stopPropagation(); setDefaultPresetId(defaultPresetId === p.id ? null : p.id); }}
                          >
                            {defaultPresetId === p.id ? '★ 基本' : '☆ 基本に設定'}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#b0b0b0', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>獲得値: <span style={{ color: '#ffd700' }}>${p.targetCash ? parseInt(String(p.targetCash).replace(/,/g, '')).toLocaleString() : '-'} / 🪙{p.targetCoins ? parseInt(String(p.targetCoins).replace(/,/g, '')).toLocaleString() : '-'}</span></span>
                        {p.description && <span style={{ color: 'var(--text-muted)' }}>備考:</span>}
                        {p.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{p.description}</span>}
                        {p.author && <span>作者: {p.author}</span>}
                        {p.originalAuthor && p.originalAuthor !== p.author && <span>原作者: {p.originalAuthor}</span>}
                        {p.updatedAt && <span style={{ color: 'var(--text-muted)' }}>最終更新: {new Date(p.updatedAt).toLocaleString()}</span>}
                      </div>
                      {isLocal && isEditMode && (
                        <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                          {presetDeleteConfirmId === p.id ? (
                            <>
                              <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}>削除する</button>
                              <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); setPresetDeleteConfirmId(null); }}>キャンセル</button>
                            </>
                          ) : (
                            <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}>削除</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {routeApi.saves.map(s => (
                    <div key={s.id} style={{ padding: '10px 12px', background: routeApi.route.id === s.id ? 'rgba(79,195,247,0.15)' : 'rgba(79,195,247,0.05)', border: routeApi.route.id === s.id ? '1px solid var(--cyan-neon)' : '1px solid rgba(79,195,247,0.2)', borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => { routeApi.loadFromLocal(s.id); setPresetListVisible(false); }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: routeApi.route.id === s.id ? 'var(--cyan-neon)' : '#b0b0b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{s.title}</div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          {deleteConfirmId === s.id ? (
                            <>
                              <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); handleDeleteFromLocal(e, s.id); }}>削除する</button>
                              <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}>キャンセル</button>
                            </>
                          ) : (
                            <>
                              {isLocal && isEditMode && (
                                <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }} onClick={(e) => { e.stopPropagation(); handleQuickPreset(s); }}>プリセット登録</button>
                              )}
                              <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); handleDeleteFromLocal(e, s.id); }}>削除</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#b0b0b0', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>獲得値: <span style={{ color: 'var(--cyan-neon)' }}>${s.targetCash ? parseInt(String(s.targetCash).replace(/,/g, '')).toLocaleString() : '-'} / 🪙{s.targetCoins ? parseInt(String(s.targetCoins).replace(/,/g, '')).toLocaleString() : '-'}</span></span>
                        {s.description && <span style={{ color: 'var(--text-muted)' }}>備考:</span>}
                        {s.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{s.description}</span>}
                        {(() => {
                          const sa = xorDecrypt(s.author || '', getAuthorKey(s.id, s.createdAt));
                          const so = xorDecrypt(s.originalAuthor || '', getOriginalAuthorKey(s.id, s.createdAt));
                          return (<>
                            {sa && <span>作者: {sa}</span>}
                            {so && so !== sa && <span>原作者: {so}</span>}
                          </>);
                        })()}
                        <span style={{ color: 'var(--text-muted)' }}>最終更新: {new Date(s.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <HelpModal
        show={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        isLocal={isLocal}
        isEditMode={isEditMode}
        helpActiveTab={helpActiveTab}
        setHelpActiveTab={setHelpActiveTab}
        helpTexts={helpTexts}
        setHelpTexts={setHelpTexts}
        isHelpPreviewMode={isHelpPreviewMode}
        setIsHelpPreviewMode={setIsHelpPreviewMode}
        bgFileInputRef={fileIO.bgFileInputRef}
        setLeftSidebarCollapsed={setLeftSidebarCollapsed}
        setRightSidebarCollapsed={setRightSidebarCollapsed}
        currentFloor={currentFloor}
        globalMarkers={globalMarkersStore.globalMarkers}
        route={routeApi.route}
        onHideGlobalMarker={handleHideGlobalMarker}
        onShowGlobalMarker={handleShowGlobalMarker}
        startupFocusMarkerId={globalDefaultsRef.current.startupFocusMarkerId}
        onSetStartupFocus={(markerId) => globalDefaults.setStartupFocusMarkerId(markerId || null)}
        onClearOriginalAuthor={() => {
          routeApi.setRoute(prev => ({ ...prev, originalAuthor: '' }));
          notification.show('原作者名をクリアしました');
        }}
        showDetectionRanges={showDetectionRanges}
        onSetShowDetectionRanges={setShowDetectionRanges}
        stopMarkerThreshold={stopMarkerThreshold}
        setStopMarkerThreshold={setStopMarkerThreshold}
        movementMarkerThreshold={movementMarkerThreshold}
        setMovementMarkerThreshold={setMovementMarkerThreshold}
        warpMarkerThreshold={warpMarkerThreshold}
        setWarpMarkerThreshold={setWarpMarkerThreshold}
        autoLoadLastRoute={autoLoadLastRoute}
        onSetAutoLoadLastRoute={setAutoLoadLastRoute}
      />

      <HistoryModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        markers={isLocal ? [...globalMarkersStore.globalMarkers, ...routeApi.route.markers] : [...routeApi.route.markers]}
        globalMarkerIds={globalMarkersStore.globalMarkers.map(m => m.id)}
        onFocusTrigger={setFocusTrigger}
      />
    </div>
  );
}
