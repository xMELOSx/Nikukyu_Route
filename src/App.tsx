import React, { useState, useEffect, useRef } from 'react';
import { MapCanvas } from './components/MapCanvas';
import { HistoryModal } from './components/HistoryModal';
import { HelpModal } from './components/HelpModal';
import {
  type FloorType,
  type MarkerType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  type PresetData,
  DEFAULT_ROUTE,
  MARKER_META,
  DataManager,
  xorEncrypt,
  xorDecrypt,
  getAuthorKey,
  getOriginalAuthorKey
} from './utils/DataManager';
import { HELP_TABS, type HelpData, fetchHelpData, saveHelpData } from './utils/HelpDataManager';
import {
  Save,
  Download,
  Upload,
  Image as ImageIcon,
  Eraser,
  Paintbrush,
  Move,
  RotateCcw,
  Undo,
  Redo,
  ChevronLeft,
  ChevronRight,
  Copy,
  Star,
  FilePlus
} from 'lucide-react';

interface HistoryState {
  strokes: { [key in FloorType]: DrawingStroke[] };
  individualMarkers: HeistMarker[];
  globalMarkers: HeistMarker[];
}

const migrateRouteCoordinates = (data: RouteData): RouteData => {
  if (data.mapVersion && data.mapVersion >= 2) {
    return data;
  }

  // Multiply all coordinates in markers by 2
  const migratedMarkers = (data.markers || []).map(m => {
    const updated = {
      ...m,
      x: m.x * 2,
      y: m.y * 2,
    };
    if (m.scrollConfig) {
      updated.scrollConfig = {
        ...m.scrollConfig,
        x: m.scrollConfig.x * 2,
        y: m.scrollConfig.y * 2,
      };
    }
    return updated;
  });

  // Multiply all coordinates in strokes by 2
  const migratedStrokes: { [key in FloorType]: DrawingStroke[] } = { main: [] };
  if (data.strokes) {
    Object.keys(data.strokes).forEach(floorKey => {
      const floorStrokes = data.strokes[floorKey as FloorType];
      if (Array.isArray(floorStrokes)) {
        migratedStrokes[floorKey as FloorType] = floorStrokes.map(stroke => ({
          ...stroke,
          points: (stroke.points || []).map(pt => ({
            x: pt.x * 2,
            y: pt.y * 2,
          }))
        }));
      }
    });
  }

  return {
    ...data,
    markers: migratedMarkers,
    strokes: migratedStrokes,
    mapVersion: 2
  };
};

export default function App() {
  const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1';

  // Global State: Current Active Heist Plan
  const [route, setRoute] = useState<RouteData>(DEFAULT_ROUTE());
  const currentFloor: FloorType = 'main';

  // Global default hidden markers/types (loaded from global_defaults.json at startup)
  const globalDefaultsRef = useRef<{ hiddenMarkers: string[]; hiddenMarkerTypes: string[]; startupFocusMarkerId?: string }>({ hiddenMarkers: [], hiddenMarkerTypes: [] });

  // Always force-apply global hidden defaults when setting route
  const setRouteWithGlobalDefaults = (action: RouteData | ((prev: RouteData) => RouteData)) => {
    setRoute(prev => {
      const nextRoute = typeof action === 'function' ? action(prev) : action;
      const gd = globalDefaultsRef.current;
      return {
        ...nextRoute,
        hiddenMarkers: gd.hiddenMarkers || [],
        hiddenMarkerTypes: gd.hiddenMarkerTypes || []
      };
    });
  };
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}global_defaults.json`)
      .then(r => r.ok ? r.json() : null)
      .then(gd => {
        if (!gd) return;
        globalDefaultsRef.current = gd;
        setRoute(prev => ({
          ...prev,
          hiddenMarkers: gd.hiddenMarkers || [],
          hiddenMarkerTypes: gd.hiddenMarkerTypes || []
        }));
      })
      .catch(err => console.error('Failed to load global defaults:', err));
  }, []);

  // Shared Global Markers state (cameras, guards, etc. persisting across plans)
  const [globalMarkers, setGlobalMarkers] = useState<HeistMarker[]>([]);

  // Pin & Label Scaling State (30% to 200%, default 30%)
  const [markerScale, setMarkerScale] = useState<number>(() => {
    const saved = localStorage.getItem('heist_marker_scale');
    return saved !== null ? parseInt(saved) : 30;
  });

  // Presentation / View Mode toggle state
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [helpActiveTab, setHelpActiveTab] = useState<string>('spec');
  const [isHelpPreviewMode, setIsHelpPreviewMode] = useState<boolean>(false);
  const [helpTexts, setHelpTexts] = useState<HelpData>({});
  const [showMarkerLabels, setShowMarkerLabels] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_labels');
    return saved !== null ? saved === 'true' : true;
  });
  const [markerVisExpanded, setMarkerVisExpanded] = useState<boolean>(false);

  // Undo/Redo History States
  const [pastHistory, setPastHistory] = useState<HistoryState[]>([]);
  const [futureHistory, setFutureHistory] = useState<HistoryState[]>([]);
  const dragStartSnapshotRef = useRef<HistoryState | null>(null);

  const pushHistory = (
    currStrokes: { [key in FloorType]: DrawingStroke[] },
    currIndiv: HeistMarker[],
    currGlobal: HeistMarker[]
  ) => {
    const snapshot: HistoryState = {
      strokes: JSON.parse(JSON.stringify(currStrokes)),
      individualMarkers: JSON.parse(JSON.stringify(currIndiv)),
      globalMarkers: JSON.parse(JSON.stringify(currGlobal))
    };
    setPastHistory(prev => [...prev.slice(-49), snapshot]); // Limit to 50
    setFutureHistory([]);
  };

  const undo = () => {
    if (pastHistory.length === 0) return;
    const previous = pastHistory[pastHistory.length - 1];
    const nextPast = pastHistory.slice(0, pastHistory.length - 1);

    const currentSnapshot: HistoryState = {
      strokes: JSON.parse(JSON.stringify(route.strokes)),
      individualMarkers: JSON.parse(JSON.stringify(route.markers)),
      globalMarkers: JSON.parse(JSON.stringify(globalMarkers))
    };

    setPastHistory(nextPast);
    setFutureHistory(prev => [...prev, currentSnapshot]);

    setRoute(prev => ({
      ...prev,
      strokes: previous.strokes,
      markers: previous.individualMarkers
    }));
    setGlobalMarkers(previous.globalMarkers);
    localStorage.setItem('heist_global_markers', JSON.stringify(previous.globalMarkers));
  };

  const redo = () => {
    if (futureHistory.length === 0) return;
    const next = futureHistory[futureHistory.length - 1];
    const nextFuture = futureHistory.slice(0, futureHistory.length - 1);

    const currentSnapshot: HistoryState = {
      strokes: JSON.parse(JSON.stringify(route.strokes)),
      individualMarkers: JSON.parse(JSON.stringify(route.markers)),
      globalMarkers: JSON.parse(JSON.stringify(globalMarkers))
    };

    setFutureHistory(nextFuture);
    setPastHistory(prev => [...prev, currentSnapshot]);

    setRoute(prev => ({
      ...prev,
      strokes: next.strokes,
      markers: next.individualMarkers
    }));
    setGlobalMarkers(next.globalMarkers);
    localStorage.setItem('heist_global_markers', JSON.stringify(next.globalMarkers));
  };

  const handleBossCustomDurationChange = (markerId: string, duration: number | undefined) => {
    setRoute(prev => {
      const nextDurations = { ...(prev.bossCustomDurations || {}) };
      if (duration === undefined) {
        delete nextDurations[markerId];
      } else {
        nextDurations[markerId] = duration;
      }
      return {
        ...prev,
        bossCustomDurations: nextDurations
      };
    });
  };

  const handleBattleCustomDurationChange = (markerId: string, duration: number | undefined) => {
    setRoute(prev => {
      const nextDurations = { ...(prev.battleCustomDurations || {}) };
      if (duration === undefined) {
        delete nextDurations[markerId];
      } else {
        nextDurations[markerId] = duration;
      }
      return {
        ...prev,
        battleCustomDurations: nextDurations
      };
    });
  };

  const handlePickingCustomDurationChange = (markerId: string, duration: number | undefined) => {
    setRoute(prev => {
      const nextDurations = { ...(prev.pickingCustomDurations || {}) };
      if (duration === undefined) {
        delete nextDurations[markerId];
      } else {
        nextDurations[markerId] = duration;
      }
      return {
        ...prev,
        pickingCustomDurations: nextDurations
      };
    });
  };

  const handleLongPickingCustomDurationChange = (markerId: string, duration: number | undefined) => {
    setRoute(prev => {
      const nextDurations = { ...(prev.longPickingCustomDurations || {}) };
      if (duration === undefined) {
        delete nextDurations[markerId];
      } else {
        nextDurations[markerId] = duration;
      }
      return {
        ...prev,
        longPickingCustomDurations: nextDurations
      };
    });
  };

  const handleHideGlobalMarker = (markerId: string) => {
    setRoute(prev => {
      const nextHidden = [...(prev.hiddenMarkers || [])];
      if (!nextHidden.includes(markerId)) {
        nextHidden.push(markerId);
      }
      const nextHiddenTypes = [...(prev.hiddenMarkerTypes || [])];
      globalDefaultsRef.current = { hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes };
      if (isLocal) {
        fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes })
        });
      }
      return { ...prev, hiddenMarkers: nextHidden };
    });
  };

  const handleShowGlobalMarker = (markerId: string) => {
    setRoute(prev => {
      const nextHidden = (prev.hiddenMarkers || []).filter(id => id !== markerId);
      const nextHiddenTypes = [...(prev.hiddenMarkerTypes || [])];
      globalDefaultsRef.current = { hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes };
      if (isLocal) {
        fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes })
        });
      }
      return { ...prev, hiddenMarkers: nextHidden };
    });
  };

  const handleHideGlobalMarkerType = (markerType: MarkerType) => {
    setRoute(prev => {
      const nextHiddenTypes = [...(prev.hiddenMarkerTypes || []), markerType];
      const nextHidden = [...(prev.hiddenMarkers || [])];
      globalDefaultsRef.current = { hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes };
      if (isLocal) {
        fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes })
        });
      }
      return { ...prev, hiddenMarkerTypes: nextHiddenTypes };
    });
  };

  const handleShowGlobalMarkerType = (markerType: MarkerType) => {
    setRoute(prev => {
      const nextHiddenTypes = (prev.hiddenMarkerTypes || []).filter(t => t !== markerType);
      const nextHidden = [...(prev.hiddenMarkers || [])];
      globalDefaultsRef.current = { hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes };
      if (isLocal) {
        fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenMarkers: nextHidden, hiddenMarkerTypes: nextHiddenTypes })
        });
      }
      return { ...prev, hiddenMarkerTypes: nextHiddenTypes };
    });
  };

  // Tool Configurations
  const [toolMode, setToolMode] = useState<'select' | 'draw' | 'erase' | 'pan' | 'add-marker'>('pan');
  const [activeMarkerType, setActiveMarkerType] = useState<MarkerType | null>('cardkey');

  // Sidebar Collapse Configurations
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const isMobile = window.innerWidth < 768;

  // Brush Configurations
  const [strokeColor, setStrokeColor] = useState('#ff0055'); // default red neon for route
  const [strokeWidth, setStrokeWidth] = useState(3); // line default 3px
  const [strokeType, setStrokeType] = useState<'solid' | 'dashed' | 'arrow'>('arrow');
  const [disablePinsDuringDraw, setDisablePinsDuringDraw] = useState<boolean>(true); // default true

  // App UI lists
  const [saves, setSaves] = useState<{ id: string; title: string; targetCash: string; targetCoins: string; description: string; author: string; originalAuthor: string; updatedAt: number }[]>([]);
  const [presets, setPresets] = useState<PresetData[]>([]);
  const [rightTab, setRightTab] = useState<'route' | 'play'>('route');
  const [svgString, setSvgString] = useState<string>('');
  const [presetEditorName, setPresetEditorName] = useState('');
  const [presetEditorDesc, setPresetEditorDesc] = useState('');
  const [presetEditorAuthor, setPresetEditorAuthor] = useState('');
  const [presetEditorOrigAuthor, setPresetEditorOrigAuthor] = useState('');
  const [presetListVisible, setPresetListVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);

  // Smooth scroll room focus state
  const [focusTrigger, setFocusTrigger] = useState<{ id: string; timestamp: number } | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  // Load Saved list and Global Markers on start
  useEffect(() => {
    localStorage.setItem('heist_global_markers_migrated_v2', 'true');
    refreshSavesList();
    fetchHelpData().then(data => setHelpTexts(data));

    // Fetch presets on start
    fetch(`${import.meta.env.BASE_URL}api/presets`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPresets(list);
        if (list.length === 0) {
          // Migrate from old default_preset.json
          fetch(`${import.meta.env.BASE_URL}api/default-preset`)
            .then(res => res.ok ? res.json() : null)
            .then(oldPreset => {
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
                const next = [migratedPreset];
                setPresets(next);
                fetch(`${import.meta.env.BASE_URL}api/presets`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(next)
                }).catch(() => { });
              }
            })
            .catch(() => { });
          const savesList = DataManager.getSavesList();
          if (savesList.length === 0) {
            fetch(`${import.meta.env.BASE_URL}default_preset.json`)
              .then(res => res.ok ? res.json() : null)
              .then(data => {
                if (data) {
                  const migrated = migrateRouteCoordinates(data);
                  setRouteWithGlobalDefaults({ ...migrated, id: 'default' });
                }
              })
              .catch(() => { });
          }
        }
      })
      .catch(() => { });
    fetch(`${import.meta.env.BASE_URL}api/global-markers`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const filtered = data.filter(m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any)).map(m => {
            if (m.warpWaypoints) {
              return { ...m, warpWaypoints: m.warpWaypoints.filter((wp: any) => wp !== null && wp !== undefined) };
            }
            return m;
          });
          setGlobalMarkers(filtered);
          localStorage.setItem('heist_global_markers', JSON.stringify(filtered));
          localStorage.setItem('heist_global_markers_migrated_v2', 'true');
        } else {
          loadGlobalMarkersFromLocalStorage();
        }
      })
      .catch(err => {
        console.error('Failed to fetch from /api/global-markers, trying static fallback:', err);
        fetch(`${import.meta.env.BASE_URL}global_markers.json`)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
          })
          .then(data => {
            if (Array.isArray(data) && data.length > 0) {
              const filtered = data.filter(m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any)).map(m => {
                if (m.warpWaypoints) {
                  return { ...m, warpWaypoints: m.warpWaypoints.filter((wp: any) => wp !== null && wp !== undefined) };
                }
                return m;
              });
              setGlobalMarkers(filtered);
              localStorage.setItem('heist_global_markers', JSON.stringify(filtered));
              localStorage.setItem('heist_global_markers_migrated_v2', 'true');
            } else {
              loadGlobalMarkersFromLocalStorage();
            }
          })
          .catch(fallbackErr => {
            console.error('Failed to fetch static global markers, falling back to local storage:', fallbackErr);
            loadGlobalMarkersFromLocalStorage();
          });
      });

    function loadGlobalMarkersFromLocalStorage() {
      const savedGlobal = localStorage.getItem('heist_global_markers');
      if (savedGlobal) {
        try {
          let parsed: HeistMarker[] = JSON.parse(savedGlobal);
          parsed = parsed.filter(m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any)).map(m => {
            if (m.warpWaypoints) {
              return { ...m, warpWaypoints: m.warpWaypoints.filter((wp: any) => wp !== null && wp !== undefined) };
            }
            return m;
          });

          const isMigrated = localStorage.getItem('heist_global_markers_migrated_v2') === 'true';
          if (!isMigrated) {
            parsed = parsed.map(m => {
              const updated = {
                ...m,
                x: m.x * 2,
                y: m.y * 2,
              };
              if (m.scrollConfig) {
                updated.scrollConfig = {
                  ...m.scrollConfig,
                  x: m.scrollConfig.x * 2,
                  y: m.scrollConfig.y * 2,
                };
              }
              return updated;
            });
            localStorage.setItem('heist_global_markers', JSON.stringify(parsed));
            localStorage.setItem('heist_global_markers_migrated_v2', 'true');
          }

          const migrated = parsed.map(m => {
            if (m.type === 'boss') {
              const updated = { ...m };
              if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
              if (updated.bossDrops === undefined) updated.bossDrops = [];
              return updated;
            }
            if (m.type === 'battle' || m.type === 'gbattle') {
              const updated = { ...m };
              if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
              return updated;
            }
            if (m.type === 'picking' || m.type === 'gpicking') {
              const updated = { ...m };
              if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
              return updated;
            }
            if (m.type === 'long_picking' || m.type === 'glong_picking') {
              const updated = { ...m };
              if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
              return updated;
            }
            return m;
          });
          setGlobalMarkers(migrated);

          if (isLocal) {
            fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(migrated)
            }).catch(e => console.error(e));
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Startup focus: auto-pan to a configured marker on app load
  const startupFocusedRef = useRef(false);
  useEffect(() => {
    if (startupFocusedRef.current || globalMarkers.length === 0) return;
    const targetId = globalDefaultsRef.current.startupFocusMarkerId;
    if (!targetId) return;
    // check if marker exists
    const exists = globalMarkers.some(m => m.id === targetId) || route.markers.some(m => m.id === targetId);
    if (!exists) return;
    startupFocusedRef.current = true;
    // slight delay to let canvas render
    setTimeout(() => setFocusTrigger({ id: targetId, timestamp: Date.now() }), 300);
  }, [globalMarkers]);

  // Keyboard shortcut listener for EDIT/VIEW toggling and Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHelpModal) { setShowHelpModal(false); return; }
      }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'v' || e.key === 'V') {
        setIsEditMode(prev => {
          const next = !prev;
          if (next === false) {
            setToolMode('pan');
          }
          return next;
        });
      }
      if (e.key === '[' || e.key === '［') {
        e.preventDefault();
        setLeftSidebarCollapsed(prev => !prev);
      }
      if (e.key === ']' || e.key === '］') {
        e.preventDefault();
        setRightSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pastHistory, futureHistory, route, globalMarkers, showHelpModal]);

  const refreshSavesList = () => {
    setSaves(DataManager.getSavesList().sort((a, b) => b.updatedAt - a.updatedAt));
  };

  // State Sync wrappers
  const updateStrokes = (newStrokes: DrawingStroke[]) => {
    pushHistory(route.strokes, route.markers, globalMarkers);
    setRoute(prev => ({
      ...prev,
      strokes: {
        ...prev.strokes,
        [currentFloor]: newStrokes
      }
    }));
  };

  const updateMarkers = (newMarkers: HeistMarker[], shouldPushHistory = false) => {
    if (shouldPushHistory) {
      pushHistory(route.strokes, route.markers, globalMarkers);
    }
    const isIndivType = (type: string) => ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext'].includes(type);
    const newGlobal = newMarkers.filter(m => !isIndivType(m.type));
    const newIndividual = newMarkers.filter(m => isIndivType(m.type));

    setGlobalMarkers(newGlobal);
    localStorage.setItem('heist_global_markers', JSON.stringify(newGlobal));

    if (isLocal) {
      fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGlobal)
      }).catch(err => console.error('Failed to sync global markers:', err));
    }

    setRoute(prev => ({
      ...prev,
      markers: newIndividual
    }));
  };

  const handleMarkersDragStart = () => {
    dragStartSnapshotRef.current = {
      strokes: JSON.parse(JSON.stringify(route.strokes)),
      individualMarkers: JSON.parse(JSON.stringify(route.markers)),
      globalMarkers: JSON.parse(JSON.stringify(globalMarkers))
    };
  };

  const handleMarkersDragEnd = () => {
    if (dragStartSnapshotRef.current) {
      setPastHistory(prev => [...prev.slice(-49), dragStartSnapshotRef.current!]);
      setFutureHistory([]);
      dragStartSnapshotRef.current = null;
    }
  };

  // Clear current floor Canvas & Markers (selective)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [presetDeleteConfirmId, setPresetDeleteConfirmId] = useState<string | null>(null);
  const [historyDeleteConfirmId, setHistoryDeleteConfirmId] = useState<string | null>(null);
  const [newPlanConfirm, setNewPlanConfirm] = useState(false);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<'lines' | 'pins' | 'both' | null>(null);

  // Local Storage actions
  const handleSaveToLocal = () => {
    const routeToSave = {
      ...route,
      mapVersion: 2,
      markerScale: markerScale
    };
    if (!routeToSave.originalAuthor && routeToSave.author) {
      routeToSave.originalAuthor = xorEncrypt(xorDecrypt(routeToSave.author, getAuthorKey(routeToSave.id, routeToSave.createdAt)), getOriginalAuthorKey(routeToSave.id, routeToSave.createdAt));
    }
    DataManager.saveToLocalStorage(routeToSave);
    refreshSavesList();
    setSaveNotification(`保存完了: ${route.title}`);
    setTimeout(() => setSaveNotification(null), 2000);
  };

  const handleSaveAsCopy = () => {
    const newId = `route_${Date.now()}`;
    const newCreatedAt = Date.now();
    const copyRoute = {
      ...route,
      id: newId,
      title: `${route.title} (COPY)`,
      createdAt: newCreatedAt
    };
    if (copyRoute.author) {
      const plainAuthor = xorDecrypt(copyRoute.author, getAuthorKey(route.id, route.createdAt));
      copyRoute.author = xorEncrypt(plainAuthor, getAuthorKey(newId, newCreatedAt));
      if (!copyRoute.originalAuthor) {
        copyRoute.originalAuthor = xorEncrypt(plainAuthor, getOriginalAuthorKey(newId, newCreatedAt));
      }
    }
    DataManager.saveToLocalStorage(copyRoute);
    setRoute(copyRoute);
    refreshSavesList();
    setSaveNotification(`コピー保存: ${copyRoute.title}`);
    setTimeout(() => setSaveNotification(null), 2000);
  };

  const savePresetsToServer = (next: PresetData[]) => {
    setPresets(next);
    fetch(`${import.meta.env.BASE_URL}api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    }).catch(() => { });
  };

  const handleSaveAsPreset = () => {
    const routeToSave = {
      ...route,
      mapVersion: 2,
      markerScale: markerScale
    };
    const newPreset: PresetData = {
      id: `preset_${Date.now()}`,
      name: presetEditorName.trim() || route.title,
      description: presetEditorDesc,
      targetCash: route.targetCash,
      targetCoins: route.targetCoins,
      author: xorDecrypt(route.author, getAuthorKey(route.id, route.createdAt)),
      originalAuthor: xorDecrypt(route.originalAuthor, getOriginalAuthorKey(route.id, route.createdAt)),
      updatedAt: Date.now(),
      routeData: routeToSave
    };
    const next = [...presets, newPreset];
    savePresetsToServer(next);
    setPresetEditorName('');
    setPresetEditorDesc('');
    setPresetEditorAuthor('');
    setPresetEditorOrigAuthor('');
    setSaveNotification(`プリセット追加: ${newPreset.name}`);
    setTimeout(() => setSaveNotification(null), 2000);
  };

  const handleDeletePreset = (presetId: string) => {
    if (presetDeleteConfirmId === presetId) {
      const next = presets.filter(p => p.id !== presetId);
      savePresetsToServer(next);
      setPresetDeleteConfirmId(null);
      setSaveNotification('プリセットを削除しました');
      setTimeout(() => setSaveNotification(null), 2000);
    } else {
      setPresetDeleteConfirmId(presetId);
      setTimeout(() => setPresetDeleteConfirmId(null), 3000);
    }
  };

  const handleLoadFromLocal = (id: string) => {
    if (route.id !== id && pastHistory.length > 0) {
      handleSaveToLocal();
    }
    let data: RouteData | null = null;
    if (id.startsWith('__preset__')) {
      const presetId = id.replace('__preset__', '');
      const preset = presets.find(p => p.id === presetId);
      if (!preset) return;
      data = {
        ...preset.routeData,
        id: `route_${Date.now()}`,
        title: `${preset.routeData.title} (COPY)`
      };
    } else {
      data = DataManager.loadFromLocalStorage(id);
    }
    if (data) {
      // 2x Coordinate Scale Migration
      const migratedData = migrateRouteCoordinates(data);
      if (migratedData.mapVersion !== data.mapVersion) {
        DataManager.saveToLocalStorage(migratedData);
        data = migratedData;
      }
      const routeData = data;
      // Compatibility migrations
      if (routeData.strokes && !routeData.strokes.main) {
        const merged: DrawingStroke[] = [];
        Object.keys(routeData.strokes).forEach(key => {
          const keyStrokes = (routeData.strokes as any)[key];
          if (Array.isArray(keyStrokes)) merged.push(...keyStrokes);
        });
        routeData.strokes = { main: merged };
      }
      if (routeData.markers) {
        data.markers = data.markers.filter(m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any));
        const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext'].includes(type);
        const planIndiv = data.markers.filter(m => isIndiv(m.type)).map(m => {
          const updated = { ...m, floor: 'main' as FloorType };
          if (updated.type === 'boss') {
            if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
            if (updated.bossDrops === undefined) updated.bossDrops = [];
          }
          if (updated.type === 'battle' || updated.type === 'gbattle') {
            if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
          }
          if (updated.type === 'picking' || updated.type === 'gpicking') {
            if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
            if (updated.pickingPicky === undefined) updated.pickingPicky = false;
          }
          if (updated.type === 'long_picking' || updated.type === 'glong_picking') {
            if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
            if (updated.pickingPicky === undefined) updated.pickingPicky = false;
          }
          return updated;
        });
        const planGlobal = data.markers.filter(m => !isIndiv(m.type)).map(m => {
          const updated = { ...m, floor: 'main' as FloorType };
          if (updated.type === 'boss') {
            if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
            if (updated.bossDrops === undefined) updated.bossDrops = [];
          }
          if (updated.type === 'battle' || updated.type === 'gbattle') {
            if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
          }
          if (updated.type === 'picking' || updated.type === 'gpicking') {
            if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
            if (updated.pickingPicky === undefined) updated.pickingPicky = false;
          }
          if (updated.type === 'long_picking' || updated.type === 'glong_picking') {
            if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
            if (updated.pickingPicky === undefined) updated.pickingPicky = false;
          }
          return updated;
        });

        // Merge and update global markers from loaded plan
        if (planGlobal.length > 0) {
          setGlobalMarkers(prev => {
            const merged = [...prev];
            planGlobal.forEach(pm => {
              const idx = merged.findIndex(m => m.id === pm.id);
              if (idx >= 0) {
                merged[idx] = { ...merged[idx], ...pm };
              } else {
                merged.push(pm);
              }
            });
            localStorage.setItem('heist_global_markers', JSON.stringify(merged));

            if (isLocal) {
              fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(merged)
              }).catch(err => console.error(err));
            }

            return merged;
          });
        }
        data.markers = planIndiv;
      }
      if (!data.customBg || !data.customBg.main) {
        data.customBg = { main: null };
      }
      if (!data.bossCustomDurations) {
        data.bossCustomDurations = {};
      }
      if (!data.battleCustomDurations) {
        data.battleCustomDurations = {};
      }
      if (!data.pickingCustomDurations) {
        data.pickingCustomDurations = {};
      }
      if (!data.longPickingCustomDurations) {
        data.longPickingCustomDurations = {};
      }
      if (!data.hiddenMarkers) {
        data.hiddenMarkers = [];
      }
      if (!data.hiddenMarkerTypes) {
        data.hiddenMarkerTypes = [];
      }
      if (data.author === undefined) {
        data.author = '';
      }
      if (data.originalAuthor === undefined) {
        data.originalAuthor = '';
      }
      // Merge global defaults for individual plans
      if (data.id !== 'default') {
        const gd = globalDefaultsRef.current;
        data.hiddenMarkers = [...new Set([...(data.hiddenMarkers || []), ...(gd.hiddenMarkers || [])])];
        data.hiddenMarkerTypes = [...new Set([...(data.hiddenMarkerTypes || []), ...(gd.hiddenMarkerTypes || [])])];
      }
      setRouteWithGlobalDefaults(data);
      if (data.markerScale !== undefined) {
        setMarkerScale(data.markerScale);
        localStorage.setItem('heist_marker_scale', String(data.markerScale));
      }
      setSaveNotification(`読み込み完了: ${data.title}`);
      setTimeout(() => setSaveNotification(null), 2000);
    }
  };

  const handleDeleteFromLocal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      DataManager.deleteFromLocalStorage(id);
      refreshSavesList();
      if (route.id === id) {
        setRouteWithGlobalDefaults(DEFAULT_ROUTE(`route_${Date.now()}`));
      }
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
    const currentAuthor = route.author;
    const newId = `route_${Date.now()}`;
    const newCreatedAt = Date.now();
    const newRoute = DEFAULT_ROUTE(newId);
    if (currentAuthor) {
      const plainAuthor = xorDecrypt(currentAuthor, getAuthorKey(route.id, route.createdAt));
      newRoute.author = xorEncrypt(plainAuthor, getAuthorKey(newId, newCreatedAt));
      newRoute.originalAuthor = xorEncrypt(plainAuthor, getOriginalAuthorKey(newId, newCreatedAt));
    }
    setRouteWithGlobalDefaults(newRoute);
  };

  // JSON Import / Export
  const handleExportJSON = () => {
    const routeToExport = {
      ...route,
      mapVersion: 2,
      markerScale: markerScale
    };
    DataManager.exportToJSON(routeToExport);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawData = JSON.parse(event.target?.result as string) as RouteData;
        if (rawData.strokes && rawData.markers) {
          // 4x Coordinate Scale Migration
          const importedData = migrateRouteCoordinates(rawData);

          // Normalize structure in case of older structure
          if (!importedData.strokes.main) {
            const merged: DrawingStroke[] = [];
            Object.keys(importedData.strokes).forEach(key => {
              const keyStrokes = (importedData.strokes as any)[key];
              if (Array.isArray(keyStrokes)) merged.push(...keyStrokes);
            });
            importedData.strokes = { main: merged };
          }

          importedData.markers = importedData.markers.filter(m => m.type !== ('start' as any) && m.type !== ('camera' as any) && m.type !== ('guard' as any));
          const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext'].includes(type);
          const planIndiv = importedData.markers.filter(m => isIndiv(m.type)).map(m => {
            const updated = { ...m, floor: 'main' as FloorType };
            if (updated.type === 'boss') {
              if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
              if (updated.bossDrops === undefined) updated.bossDrops = [];
            }
            if (updated.type === 'battle' || updated.type === 'gbattle') {
              if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
            }
            if (updated.type === 'picking' || updated.type === 'gpicking') {
              if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
            }
            if (updated.type === 'long_picking' || updated.type === 'glong_picking') {
              if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
            }
            return updated;
          });
          const planGlobal = importedData.markers.filter(m => !isIndiv(m.type)).map(m => {
            const updated = { ...m, floor: 'main' as FloorType };
            if (updated.type === 'boss') {
              if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
              if (updated.bossDrops === undefined) updated.bossDrops = [];
            }
            if (updated.type === 'battle' || updated.type === 'gbattle') {
              if (updated.battleDurationSeconds === undefined) updated.battleDurationSeconds = 20;
            }
            if (updated.type === 'picking' || updated.type === 'gpicking') {
              if (updated.pickingDurationSeconds === undefined) updated.pickingDurationSeconds = 5;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
            }
            if (updated.type === 'long_picking' || updated.type === 'glong_picking') {
              if (updated.longPickingDurationSeconds === undefined) updated.longPickingDurationSeconds = 7;
              if (updated.pickingPicky === undefined) updated.pickingPicky = false;
            }
            return updated;
          });

          if (planGlobal.length > 0) {
            setGlobalMarkers(prev => {
              const merged = [...prev];
              planGlobal.forEach(pm => {
                const idx = merged.findIndex(m => m.id === pm.id);
                if (idx >= 0) {
                  merged[idx] = { ...merged[idx], ...pm };
                } else {
                  merged.push(pm);
                }
              });
              localStorage.setItem('heist_global_markers', JSON.stringify(merged));

              if (isLocal) {
                fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(merged)
                }).catch(err => console.error(err));
              }

              return merged;
            });
          }

          importedData.markers = planIndiv;

          if (!importedData.customBg) {
            importedData.customBg = { main: null };
          } else if (!importedData.customBg.main) {
            importedData.customBg = { main: null };
          }
          if (!importedData.bossCustomDurations) {
            importedData.bossCustomDurations = {};
          }
          if (!importedData.battleCustomDurations) {
            importedData.battleCustomDurations = {};
          }
          if (!importedData.pickingCustomDurations) {
            importedData.pickingCustomDurations = {};
          }
          if (!importedData.longPickingCustomDurations) {
            importedData.longPickingCustomDurations = {};
          }
          if (!importedData.hiddenMarkers) {
            importedData.hiddenMarkers = [];
          }
          if (!importedData.hiddenMarkerTypes) {
            importedData.hiddenMarkerTypes = [];
          }
          if (importedData.author === undefined) {
            importedData.author = '';
          }
          if (importedData.originalAuthor === undefined) {
            importedData.originalAuthor = '';
          }
          // Merge global defaults for imported individual plans BEFORE setting route
          if (importedData.id !== 'default') {
            const gd = globalDefaultsRef.current;
            importedData.hiddenMarkers = [...new Set([...importedData.hiddenMarkers, ...(gd.hiddenMarkers || [])])];
            importedData.hiddenMarkerTypes = [...new Set([...importedData.hiddenMarkerTypes, ...(gd.hiddenMarkerTypes || [])])];
          }
          setRouteWithGlobalDefaults(importedData);
          if (importedData.markerScale !== undefined) {
            setMarkerScale(importedData.markerScale);
            localStorage.setItem('heist_marker_scale', String(importedData.markerScale));
          }
          setSaveNotification(`インポート完了: ${importedData.title}`);
          setTimeout(() => setSaveNotification(null), 2000);
        } else {
          setSaveNotification('JSONファイルの形式が無効です');
          setTimeout(() => setSaveNotification(null), 2000);
        }
      } catch (err) {
        setSaveNotification('JSONファイルの読み込みに失敗しました');
        setTimeout(() => setSaveNotification(null), 2000);
      }
    };
    reader.readAsText(file);
  };

  // Custom Background Image upload
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setRoute(prev => ({
        ...prev,
        customBg: {
          main: dataUrl
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeCustomBg = () => {
    setRoute(prev => ({
      ...prev,
      customBg: {
        main: null
      }
    }));
  };

  // PNG Export
  const handleExportPNG = () => {
    const routeForExport = {
      ...route,
      markers: [...globalMarkers, ...route.markers],
      markerScale: markerScale
    };
    DataManager.exportToPNG(
      currentFloor,
      routeForExport,
      svgString,
      canvasRef.current,
      (dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${route.title.replace(/\s+/g, '_')}_full_map.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    );
  };

  // PNG Import (from pixel-encoded data bar)
  const handlePngImport = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png')) return;
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolveImg, rejectImg) => {
        img.onload = () => resolveImg();
        img.onerror = () => rejectImg(new Error('load failed'));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const data = await DataManager.decodePngData(img);
      if (!data) {
        setSaveNotification('PNGからデータを読み取れませんでした（データバー未検出）');
        setTimeout(() => setSaveNotification(null), 3000);
        return;
      }
      // Re-encrypt author names with new keys since id/createdAt change
      const newId = `route_${Date.now()}`;
      const newCreatedAt = Date.now();
      const plainAuthor = xorDecrypt(data.author || '', getAuthorKey(data.id, data.createdAt));
      const plainOriginalAuthor = xorDecrypt(data.originalAuthor || '', getOriginalAuthorKey(data.id, data.createdAt));
      // Filter out global-type markers (they're loaded from global_markers.json)
      const isGlobalType = (t: string) =>
        ['eh','rare','cardkey','vault','boss','phone','warp','stairs','info','note','text','room','gbattle','gpicking','glong_picking'].includes(t);
      const individualMarkers = (data.markers || []).filter(m => !isGlobalType(m.type));
      const importedRoute: RouteData = {
        ...data,
        id: newId,
        createdAt: newCreatedAt,
        markers: individualMarkers,
        author: xorEncrypt(plainAuthor, getAuthorKey(newId, newCreatedAt)),
        originalAuthor: xorEncrypt(plainOriginalAuthor, getOriginalAuthorKey(newId, newCreatedAt))
      };
      DataManager.saveToLocalStorage(importedRoute);
      setRouteWithGlobalDefaults(importedRoute);
      refreshSavesList();
      setSaveNotification(`PNGインポート完了: ${importedRoute.title}`);
      setTimeout(() => setSaveNotification(null), 2000);
    } catch (err) {
      setSaveNotification('PNG読み込みに失敗しました');
      setTimeout(() => setSaveNotification(null), 3000);
    }
  };

  // DnD handlers for map and sidebar — window level to avoid MapCanvas interception
  const pngFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (file.name.endsWith('.json')) {
        handleImportJSON({ target: { files: [file] } } as any);
      } else if (file.name.endsWith('.png')) {
        await handlePngImport(file);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Brush Preset Helper
  const setBrushPreset = (color: string, width: number, type: 'solid' | 'dashed' | 'arrow') => {
    setToolMode('draw');
    setStrokeColor(color);
    setStrokeWidth(width);
    setStrokeType(type);
  };

  // Count elements
  const currentStrokesCount = route.strokes[currentFloor]?.length || 0;
  const currentMarkersCount = globalMarkers.length + route.markers.length;

  return (
    <div className="app-container">
      {/* Header removed */}

      {saveNotification && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0, 200, 100, 0.9)', color: '#fff', padding: '8px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, zIndex: 9999, boxShadow: '0 0 12px rgba(0, 200, 100, 0.5)' }}>
          {saveNotification}
        </div>
      )}

      {/* Main Layout */}
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
          if (file.name.endsWith('.json')) handleImportJSON({ target: { files: [file] } } as any);
          else if (file.name.endsWith('.png')) await handlePngImport(file);
        }}
      >
        {/* Left Control Panel: Rooms Quick Pan & Drawing/Markers */}
        <section
          className="sidebar glass-panel"
          style={{ display: leftSidebarCollapsed ? 'none' : 'flex' }}
        >
          {/* Segmented Mode Selector Toggle */}
          <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'rgba(5, 7, 10, 0.6)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button
                className={`btn-cyber ${isEditMode ? 'active' : ''}`}
                style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                onClick={() => {
                  setIsEditMode(true);
                }}
              >
                {isLocal ? '⚙ EDIT' : '⚙ INDIV EDIT'}
              </button>
              <button
                className={`btn-cyber ${!isEditMode ? 'active success' : ''}`}
                style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                onClick={() => {
                  setIsEditMode(false);
                  setToolMode('pan'); // Auto switch to pan tool when entering presentation mode
                }}
              >
                👁 PRESENT
              </button>
            </div>

          </div>

          {/* Help Button */}
          <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
            <button
              className="btn-cyber"
              onClick={() => setShowHelpModal(true)}
              style={{ width: '100%', padding: '6px', fontSize: '12px', clipPath: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              ❓ ヘルプ
            </button>
          </div>

          {/* Pin and Label Sizing Adjuster + Marker Visibility */}
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

                {/* Marker Type Visibility Toggles */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                  <div className="panel-title" style={{ marginBottom: '6px' }}>MARKER VISIBILITY</div>

                  {/* Global marker type toggles */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#7ec8e3', fontWeight: 'bold' }}>GLOBAL:</div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <button
                        className="btn-cyber"
                        style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                        onClick={() => {
                          (['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).forEach(t => {
                            if ((route.hiddenMarkerTypes || []).includes(t)) handleShowGlobalMarkerType(t);
                          });
                        }}
                      >ALL ON</button>
                      <button
                        className="btn-cyber"
                        style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                        onClick={() => {
                          (['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).forEach(t => {
                            if (!(route.hiddenMarkerTypes || []).includes(t)) handleHideGlobalMarkerType(t);
                          });
                        }}
                      >ALL OFF</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
                      const meta = MARKER_META[t];
                      const isTypeHidden = (route.hiddenMarkerTypes || []).includes(t);
                      return (
                        <button
                          key={t}
                          className="btn-cyber"
                          style={{
                            padding: '2px 6px',
                            fontSize: '10px',
                            clipPath: 'none',
                            opacity: isTypeHidden ? 0.4 : 1,
                            borderColor: isTypeHidden ? '#555' : meta.color,
                            color: isTypeHidden ? '#555' : meta.color
                          }}
                          onClick={() => {
                            if (isTypeHidden) {
                              handleShowGlobalMarkerType(t);
                            } else {
                              handleHideGlobalMarkerType(t);
                            }
                          }}
                        >
                          {meta.emoji} {meta.label.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Separator */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0 8px' }} />

                  {/* Individual marker type toggles */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#ff6b9d', fontWeight: 'bold' }}>INDIVIDUAL:</div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <button
                        className="btn-cyber"
                        style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                        onClick={() => {
                          (['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3'] as MarkerType[]).forEach(t => {
                            if ((route.hiddenMarkerTypes || []).includes(t)) handleShowGlobalMarkerType(t);
                          });
                        }}
                      >ALL ON</button>
                      <button
                        className="btn-cyber"
                        style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                        onClick={() => {
                          (['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3'] as MarkerType[]).forEach(t => {
                            if (!(route.hiddenMarkerTypes || []).includes(t)) handleHideGlobalMarkerType(t);
                          });
                        }}
                      >ALL OFF</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3'] as MarkerType[]).map(t => {
                      const meta = MARKER_META[t];
                      const isTypeHidden = (route.hiddenMarkerTypes || []).includes(t);
                      return (
                        <button
                          key={t}
                          className="btn-cyber"
                          style={{
                            padding: '2px 6px',
                            fontSize: '10px',
                            clipPath: 'none',
                            opacity: isTypeHidden ? 0.4 : 1,
                            borderColor: isTypeHidden ? '#555' : meta.color,
                            color: isTypeHidden ? '#555' : meta.color
                          }}
                          onClick={() => {
                            if (isTypeHidden) {
                              handleShowGlobalMarkerType(t);
                            } else {
                              handleHideGlobalMarkerType(t);
                            }
                          }}
                        >
                          {meta.emoji} {meta.label.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Rooms and Zones List */}
          <div className="panel-section">
            <div className="panel-title">階層移動</div>

            <div className="saves-list" style={{ maxHeight: '175px' }}>
              {globalMarkers.filter(m => m.type === 'room').length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No room markers placed. Select 🚪 in markers below and click map to place.
                </div>
              ) : (
                globalMarkers
                  .filter(m => m.type === 'room')
                  .map(m => {
                    const meta = MARKER_META[m.type];
                    return (
                      <div
                        key={m.id}
                        className="save-item"
                        onClick={() => setFocusTrigger({ id: m.id, timestamp: Date.now() })}
                      >
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


          {/* Tool Mode (Edit Mode only) */}
          {isEditMode && (
            <div className="panel-section">
              <div className="panel-title">モード選択</div>
              <div className="tool-grid">
                {isEditMode && (
                  <>
                    <button
                      className={`tool-btn ${toolMode === 'draw' ? 'active' : ''}`}
                      onClick={() => setToolMode('draw')}
                      id="tool-draw-btn"
                    >
                      <Paintbrush size={18} />
                      <span>Draw Line</span>
                    </button>
                    <button
                      className={`tool-btn ${toolMode === 'erase' ? 'active' : ''}`}
                      onClick={() => setToolMode('erase')}
                      id="tool-erase-btn"
                    >
                      <Eraser size={18} />
                      <span>Eraser</span>
                    </button>
                  </>
                )}
                <button
                  className={`tool-btn ${toolMode === 'pan' ? 'active' : ''}`}
                  onClick={() => setToolMode('pan')}
                  id="tool-pan-btn"
                >
                  <Move size={18} />
                  <span>Pan Map</span>
                </button>
                {isEditMode && (
                  <>
                    {!resetTarget ? (
                      <button
                        className="tool-btn"
                        onClick={() => setResetTarget('both')}
                        id="tool-reset-btn"
                      >
                        <RotateCcw size={18} />
                        <span>Reset Map</span>
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', background: 'rgba(255,100,100,0.1)', borderRadius: '6px', border: '1px solid rgba(255,100,100,0.3)' }}>
                        <div style={{ fontSize: '10px', color: '#ff6b6b', textAlign: 'center', marginBottom: '2px' }}>削除対象を選択:</div>
                        <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                          pushHistory(route.strokes, route.markers, globalMarkers);
                          setRoute(prev => ({ ...prev, strokes: { main: [] } }));
                          setResetTarget(null);
                        }}>📝 ラインのみ</button>
                        <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                          pushHistory(route.strokes, route.markers, globalMarkers);
                          setRoute(prev => ({ ...prev, markers: [], hiddenMarkers: [] }));
                          setResetTarget(null);
                        }}>📍 ピンのみ</button>
                        <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                          pushHistory(route.strokes, route.markers, globalMarkers);
                          setRoute(prev => ({ ...prev, strokes: { main: [] }, markers: [], hiddenMarkers: [] }));
                          setResetTarget(null);
                        }}>🗑️ 両方削除</button>
                        <button className="btn-cyber" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => setResetTarget(null)}>キャンセル</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {toolMode === 'draw' && (
            <div className="panel-section">
              <div className="panel-title">3. BRUSH CONFIG</div>

              {/* Presets */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <button
                  className="btn-cyber"
                  style={{ padding: '3px 6px', fontSize: '10px' }}
                  onClick={() => setBrushPreset('#ffe600', 3, 'dashed')}
                >
                  Patrol Path
                </button>
                <button
                  className="btn-cyber danger"
                  style={{ padding: '3px 6px', fontSize: '10px' }}
                  onClick={() => setBrushPreset('#ff0055', 3, 'arrow')}
                >
                  Heist Route
                </button>
                <button
                  className="btn-cyber success"
                  style={{ padding: '3px 6px', fontSize: '10px' }}
                  onClick={() => setBrushPreset('#39ff14', 3, 'solid')}
                >
                  Safety Run
                </button>
              </div>

              {/* Color dots */}
              <div className="color-picker">
                {['#ff0055', '#ffe600', '#39ff14', '#00f0ff', '#ff00ff', '#ffffff'].map(c => (
                  <div
                    key={c}
                    className={`color-dot ${strokeColor === c ? 'active' : ''}`}
                    style={{ backgroundColor: c, color: c }}
                    onClick={() => setStrokeColor(c)}
                  />
                ))}
              </div>

              {/* Line Type */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {(['solid', 'dashed', 'arrow'] as const).map(t => (
                  <button
                    key={t}
                    className={`btn-cyber ${strokeType === t ? 'active' : ''}`}
                    style={{ flex: 1, padding: '4px 2px', fontSize: '11px' }}
                    onClick={() => setStrokeType(t)}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Width Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Brush Width: {strokeWidth}px</span>
                <input
                  type="range"
                  min="2"
                  max="12"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
              </div>

              {/* Disable Pins interference checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '8px', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={disablePinsDuringDraw}
                  onChange={(e) => setDisablePinsDuringDraw(e.target.checked)}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                />
                ライン描画時のピン干渉防止 (遮断)
              </label>
            </div>
          )}

          {/* Global Markers: Only editable in Edit Mode and from Localhost */}
          {isEditMode && isLocal && (
            <div className="panel-section">
              <div className="panel-title">マーカー(グローバル)</div>

              <div className="marker-list">
                {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'room', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
                  const meta = MARKER_META[t];
                  return (
                    <button
                      key={t}
                      className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                      onClick={() => {
                        setToolMode('add-marker');
                        setActiveMarkerType(t);
                      }}
                      style={{ '--theme-color': meta.color } as React.CSSProperties}
                    >
                      <span className="marker-icon-preview">{meta.emoji}</span>
                      <span>{t === 'cardkey' ? 'CARD KEY' : meta.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Individual Markers: Editable only in Edit mode */}
          {isEditMode && (
            <div className="panel-section">
              <div className="panel-title">マーカー</div>

              <div className="marker-list">
                {(['battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3'] as MarkerType[]).map(t => {
                  const meta = MARKER_META[t];
                  return (
                    <button
                      key={t}
                      className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                      onClick={() => {
                        setToolMode('add-marker');
                        setActiveMarkerType(t);
                      }}
                      style={{ '--theme-color': meta.color } as React.CSSProperties}
                    >
                      <span className="marker-icon-preview">{meta.emoji}</span>
                      <span>{t === 'iwarp' ? 'I-WARP' : meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ReroRero電話ボックス Controls - visible in both modes */}
          {(() => {
            const allPhones = globalMarkers.filter(m => m.type === 'phone');
            const activeCount = allPhones.filter(m => m.phoneActive).length;
            if (allPhones.length === 0) return null;
            return (
              <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 0, 255, 0.1)', paddingTop: '6px' }}>
                <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📞 ReroRero電話ボックス</span>
                  <span style={{ fontSize: '10px', color: 'var(--magenta-neon, #ff00ff)', fontWeight: 'bold' }}>{activeCount}/{allPhones.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn-cyber"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const updated = globalMarkers.map(m =>
                        m.type === 'phone' && !m.phoneLocked
                          ? { ...m, phoneActive: false }
                          : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    ☎ Reset All
                  </button>
                  <button
                    className="btn-cyber success"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const unlocked = globalMarkers
                        .map((m, i) => ({ m, i }))
                        .filter(({ m }) => m.type === 'phone' && !m.phoneLocked);
                      const shuffled = [...unlocked].sort(() => Math.random() - 0.5);
                      const toActivate = new Set(shuffled.slice(0, 5).map(({ i }) => i));
                      const updated = globalMarkers.map((m, i) => {
                        if (m.type === 'phone' && !m.phoneLocked) {
                          return { ...m, phoneActive: toActivate.has(i) };
                        }
                        return m;
                      });
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    📞 Random 5
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Info Pin Bulk Controls - visible in both modes */}
          {(() => {
            const allInfos = globalMarkers.filter(m => m.type === 'info');
            if (allInfos.length === 0) return null;
            return (
              <div className="panel-section" style={{ borderTop: '1px solid rgba(79, 195, 247, 0.15)', paddingTop: '6px' }}>
                <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>ℹ️ INFO</span>
                  <span style={{ fontSize: '10px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold' }}>{allInfos.filter(m => m.infoExpanded).length}/{allInfos.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn-cyber success"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const updated = globalMarkers.map(m =>
                        m.type === 'info' ? { ...m, infoExpanded: true } : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    すべて開く
                  </button>
                  <button
                    className="btn-cyber danger"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const updated = globalMarkers.map(m =>
                        m.type === 'info' ? { ...m, infoExpanded: false } : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    全て閉じる
                  </button>
                </div>
              </div>
            );
          })()}


          <div style={{ marginTop: 'auto', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
            <div>🐾 Map Stats:</div>
            <div>• Drawing lines: {currentStrokesCount}</div>
            <div>• Markers & notes: {currentMarkersCount}</div>
          </div>
        </section>

        {/* Center Canvas Workspace */}
        <section className="canvas-area">
          <MapCanvas
            floor={currentFloor}
            strokes={route.strokes[currentFloor]}
            markers={(() => {
              const combined = [...globalMarkers, ...route.markers];
              const seen = new Set<string>();
              return combined.filter(m => seen.has(m.id) ? false : (seen.add(m.id), true));
            })()}
            hiddenMarkers={route.hiddenMarkers || []}
            hiddenMarkerTypes={route.hiddenMarkerTypes || []}
            globalMarkerIds={globalMarkers.map(m => m.id)}
            markerScale={markerScale}
            customBg={route.customBg[currentFloor]}
            toolMode={toolMode}
            activeMarkerType={activeMarkerType}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            strokeType={strokeType}
            onStrokesChange={updateStrokes}
            onMarkersChange={updateMarkers}
            onSvgStringReady={setSvgString}
            canvasRef={canvasRef}
            focusTrigger={focusTrigger}
            onClearFocusTrigger={() => setFocusTrigger(null)}
            isEditMode={isEditMode}
            showMarkerLabels={showMarkerLabels}
            bossCustomDurations={route.bossCustomDurations}
            onBossCustomDurationChange={handleBossCustomDurationChange}
            battleCustomDurations={route.battleCustomDurations}
            onBattleCustomDurationChange={handleBattleCustomDurationChange}
            pickingCustomDurations={route.pickingCustomDurations}
            onPickingCustomDurationChange={handlePickingCustomDurationChange}
            longPickingCustomDurations={route.longPickingCustomDurations}
            onLongPickingCustomDurationChange={handleLongPickingCustomDurationChange}
            disablePinsDuringDraw={disablePinsDuringDraw}
            onMarkersDragStart={handleMarkersDragStart}
            onMarkersDragEnd={handleMarkersDragEnd}
            onHideGlobalMarker={handleHideGlobalMarker}
            onShowGlobalMarker={handleShowGlobalMarker}
            leftSidebarCollapsed={leftSidebarCollapsed}
            rightSidebarCollapsed={rightSidebarCollapsed}
          />

          {/* Left Sidebar Collapse Handle */}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            style={{
              position: 'absolute',
              left: '0',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 100,
              background: 'rgba(10, 15, 28, 0.9)',
              border: '1px solid var(--border-color)',
              borderLeft: 'none',
              color: 'var(--cyan-neon)',
              padding: '12px 4px',
              borderRadius: '0 8px 8px 0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '2px 0 10px rgba(0, 240, 255, 0.2)',
            }}
            title={leftSidebarCollapsed ? "Show Left Panel (Shortcut: [)" : "Hide Left Panel (Shortcut: [)"}
          >
            {leftSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Right Sidebar Collapse Handle */}
          <button
            onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
            style={{
              position: 'absolute',
              right: '0',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 100,
              background: 'rgba(10, 15, 28, 0.9)',
              border: '1px solid var(--border-color)',
              borderRight: 'none',
              color: 'var(--cyan-neon)',
              padding: '12px 4px',
              borderRadius: '8px 0 0 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '-2px 0 10px rgba(0, 240, 255, 0.2)',
            }}
            title={rightSidebarCollapsed ? "Show Right Panel (Shortcut: ])" : "Hide Right Panel (Shortcut: ])"}
          >
            {rightSidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </section>

        {/* Right Sidebar: Plan Profiles & Local Storage Saves */}
        <section
          className="sidebar-right glass-panel"
          style={{ display: rightSidebarCollapsed ? 'none' : 'flex' }}
        >
          {/* Tab Bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
            <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'route' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'route' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'route' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('route')}>ルート計画</button>
            <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'play' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'play' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'play' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('play')}>プレイデータ</button>
          </div>

          {/* Route Tab Content */}
          {rightTab === 'route' && (<>
            <div className="panel-section">
              {/* Save/Load/New buttons */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleSaveToLocal}>
                  <Save size={12} /> セーブ
                </button>
                <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => setPresetListVisible(true)}>
                  <Upload size={12} /> 読込
                </button>
                <button className="btn-cyber danger" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={createNewPlan}>
                  <FilePlus size={12} /> {newPlanConfirm ? '実行?' : '新規'}
                </button>
              </div>

              {/* Export/Import buttons */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportJSON}>
                  <Download size={12} /> JSON保存
                </button>
                <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportPNG}>
                  <ImageIcon size={12} /> 画像保存
                </button>
                <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => jsonFileInputRef.current?.click()}>
                  <Upload size={12} /> インポート
                </button>
                <input
                  type="file"
                  ref={jsonFileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.name.endsWith('.png')) handlePngImport(f);
                    else handleImportJSON({ target: { files: [f] } } as any);
                    e.target.value = '';
                  }}
                  accept=".json,.png"
                  style={{ display: 'none' }}
                />
              </div>

              <div
                className={isEditMode ? 'route-plan-fields' : 'route-plan-fields display-mode'}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>プラン名</label>
                <input
                  type="text"
                  className="input-cyber"
                  value={route.title}
                  onChange={(e) => setRoute({ ...route, title: e.target.value.toUpperCase() })}
                  onFocus={(e) => { (e.target as HTMLInputElement).dataset.origTitle = route.title; }}
                  onBlur={(e) => {
                    const origTitle = e.target.dataset.origTitle || '';
                    const newTitle = e.target.value.trim().toUpperCase();
                    if (!newTitle || newTitle === origTitle) return;
                    const newId = `route_${Date.now()}`;
                    const newRoute = { ...route, id: newId, title: newTitle, createdAt: Date.now() };
                    DataManager.saveToLocalStorage(newRoute);
                    setRoute(newRoute);
                    refreshSavesList();
                  }}
                  disabled={!isEditMode}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>想定獲得ファンス</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>$</span>
                      <input
                        type="text"
                        className="input-cyber"
                        style={{ paddingLeft: '24px', width: '100%' }}
                        value={route.targetCash}
                        onChange={(e) => setRoute({ ...route, targetCash: e.target.value.replace(/,/g, '') })}
                        onBlur={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          const num = parseInt(raw);
                          if (raw === '' || isNaN(num)) return;
                          setRoute(prev => ({ ...prev, targetCash: num.toLocaleString() }));
                        }}
                        onFocus={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          if (raw) setRoute(prev => ({ ...prev, targetCash: raw }));
                        }}
                        disabled={!isEditMode}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>にくきゅうコイン</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>🪙</span>
                      <input
                        type="text"
                        className="input-cyber"
                        style={{ paddingLeft: '30px', width: '100%' }}
                        value={route.targetCoins}
                        onChange={(e) => setRoute({ ...route, targetCoins: e.target.value.replace(/,/g, '') })}
                        onBlur={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          const num = parseInt(raw);
                          if (raw === '' || isNaN(num)) return;
                          setRoute(prev => ({ ...prev, targetCoins: num.toLocaleString() }));
                        }}
                        onFocus={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          if (raw) setRoute(prev => ({ ...prev, targetCoins: raw }));
                        }}
                        disabled={!isEditMode}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>
                    目標所要時間 {(() => { const s = parseInt(route.targetDuration || '0'); return !isNaN(s) ? `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : '--:--'; })()}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <input
                      type="range"
                      style={{ flex: 1, accentColor: 'var(--cyan-neon)', height: '24px' }}
                      min="0" max="720" step="1"
                      value={route.targetDuration || '0'}
                      onChange={(e) => setRoute({ ...route, targetDuration: e.target.value })}
                      onWheel={(e) => {
                        if (!isEditMode) return;
                        e.preventDefault();
                        const cur = parseInt(route.targetDuration || '0');
                        const next = Math.min(720, Math.max(0, cur + (e.deltaY < 0 ? 1 : -1)));
                        setRoute({ ...route, targetDuration: String(next) });
                      }}
                      disabled={!isEditMode}
                    />
                    <input
                      type="text"
                      className="input-cyber"
                      style={{ width: '56px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', padding: '3px 2px', color: isEditMode ? 'var(--cyan-neon)' : '#b8d4d6' }}
                      defaultValue={(() => {
                        const sec = parseInt(route.targetDuration || '0');
                        return isNaN(sec) ? '0' : String(sec);
                      })()}
                      onFocus={(e) => {
                        const sec = parseInt(route.targetDuration || '0');
                        (e.target as HTMLInputElement).value = isNaN(sec) ? '' : String(sec);
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        const num = parseInt(v) || 0;
                        const total = v.length >= 4 ? Math.floor(num / 100) * 60 + (num % 100) : num;
                        setRoute({ ...route, targetDuration: String(Math.min(720, Math.max(0, total))) });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      disabled={!isEditMode}
                      placeholder="秒数か4桁"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>作者名</label>
                    <input
                      type="text"
                      className="input-cyber"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={xorDecrypt(route.author, getAuthorKey(route.id, route.createdAt))}
                      onChange={(e) => setRoute({ ...route, author: xorEncrypt(e.target.value, getAuthorKey(route.id, route.createdAt)) })}
                      disabled={!isEditMode}
                      placeholder="名前"
                    />
                  </div>
                  {isLocal && (
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>原作者名</label>
                      <input
                        type="text"
                        className="input-cyber"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        value={xorDecrypt(route.originalAuthor, getOriginalAuthorKey(route.id, route.createdAt))}
                        onChange={(e) => setRoute({ ...route, originalAuthor: xorEncrypt(e.target.value, getOriginalAuthorKey(route.id, route.createdAt)) })}
                        disabled={!isEditMode || (route.originalAuthor !== undefined && route.originalAuthor !== '')}
                        placeholder="元の作者"
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {isLocal && (
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>CUSTOM BG</label>
                      <button
                        className="btn-cyber"
                        style={{ width: '100%', marginTop: '4px', padding: '6px' }}
                        onClick={() => bgFileInputRef.current?.click()}
                        disabled={!isEditMode}
                      >
                        <ImageIcon size={12} /> Upload Map
                      </button>
                      <input
                        type="file"
                        ref={bgFileInputRef}
                        onChange={handleBgUpload}
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="bg-file-input"
                      />
                    </div>
                  )}

                  {route.customBg[currentFloor] && isEditMode && (
                    <button
                      className="btn-cyber danger"
                      style={{ padding: '4px', fontSize: '10px', marginTop: '4px' }}
                      onClick={removeCustomBg}
                    >
                      Reset to Default Background
                    </button>
                  )}
                </div>

                <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700, marginTop: '4px' }}>備考</label>
                <textarea
                  className="textarea-cyber"
                  placeholder="Write overall heist instructions..."
                  value={route.description}
                  onChange={(e) => setRoute({ ...route, description: e.target.value })}
                  disabled={!isEditMode}
                />
              </div>
            </div>

            <div className="panel-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="panel-title" style={{ flex: 1 }}>マーカー編集履歴 (50件)</div>
                <button
                  className="btn-cyber"
                  onClick={() => setShowHistoryModal(true)}
                  style={{ padding: '2px 6px', fontSize: '9px', clipPath: 'none' }}
                >
                  全履歴
                </button>
                <button
                  className="btn-cyber"
                  onClick={undo}
                  disabled={pastHistory.length === 0}
                  title="Undo (Ctrl+Z)"
                  style={{ padding: '2px 6px', fontSize: '10px', opacity: pastHistory.length === 0 ? 0.4 : 1, cursor: pastHistory.length === 0 ? 'not-allowed' : 'pointer', clipPath: 'none' }}
                >
                  <Undo size={12} />
                </button>
                <button
                  className="btn-cyber"
                  onClick={redo}
                  disabled={futureHistory.length === 0}
                  title="Redo (Ctrl+Y)"
                  style={{ padding: '2px 6px', fontSize: '10px', opacity: futureHistory.length === 0 ? 0.4 : 1, cursor: futureHistory.length === 0 ? 'not-allowed' : 'pointer', clipPath: 'none' }}
                >
                  <Redo size={12} />
                </button>
              </div>
              <div className="placed-notes-list">
                {(() => {
                  const historyMarkers = isLocal
                    ? [...globalMarkers, ...route.markers]
                    : [...route.markers];
                  return historyMarkers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                      マーカーがありません
                    </div>
                  ) : (
                    historyMarkers.reverse().slice(0, 50)
                    .map(m => {
                      const meta = MARKER_META[m.type];
                      return (
                        <div
                          key={m.id}
                          className="placed-note-item"
                          style={{ borderLeft: `3px solid ${meta.color}`, cursor: m.scrollConfig ? 'pointer' : 'default' }}
                          onClick={() => m.scrollConfig && setFocusTrigger({ id: m.id, timestamp: Date.now() })}
                        >
                          <div className="placed-note-item-header">
                            <span className="placed-note-type" style={{ color: meta.color }}>
                              {meta.emoji} {meta.label}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              X:{m.x} Y:{m.y}
                            </span>
                            {isEditMode && (historyDeleteConfirmId === m.id ? (
                              <>
                                <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setRoute(prev => ({ ...prev, markers: prev.markers.filter(x => x.id !== m.id) })); setGlobalMarkers(prev => prev.filter(x => x.id !== m.id)); setHistoryDeleteConfirmId(null); setSaveNotification('マーカーを削除しました'); setTimeout(() => setSaveNotification(null), 2000); }}>削除する</button>
                                <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(null); }}>×</button>
                              </>
                            ) : (
                              <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(m.id); setTimeout(() => setHistoryDeleteConfirmId(null), 3000); }}>削除</button>
                            ))}
                          </div>
                          <div className="placed-note-text">
                            {m.note.trim() ? m.note : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No text note details</span>}
                          </div>
                          {m.scrollConfig && (
                            <div style={{ fontSize: '9px', color: 'var(--cyan-neon)', marginTop: '2px', textAlign: 'right' }}>
                              Click to Pan ➔
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                })()}
              </div>
            </div>
          </>)}

          {/* Play Data Tab Content */}
          {rightTab === 'play' && (
            <div className="panel-section">
              <div className="panel-title">プレイデータ</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px', textAlign: 'center' }}>
                クリア記録やプレイメモをここに記入予定
              </div>
            </div>
          )}


        </section>
      </main>

      {/* Save Data Loading Overlay */}
      {presetListVisible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPresetListVisible(false)}>
          <div style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-neon)' }}>セーブデータ読み込み</div>
              <button className="btn-cyber" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={() => setPresetListVisible(false)}>✕ 閉じる</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {presets.length === 0 && saves.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  セーブデータはまだありません
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Presets */}
                  {presets.map(p => (
                    <div key={p.id} style={{ padding: '10px 12px', background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => { handleLoadFromLocal(`__preset__${p.id}`); setPresetListVisible(false); }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultPresetId(defaultPresetId === p.id ? null : p.id);
                            }}
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
                    </div>
                  ))}

                  {/* Saved Plans */}
                  {saves.map(s => (
                    <div key={s.id} style={{ padding: '10px 12px', background: route.id === s.id ? 'rgba(79,195,247,0.15)' : 'rgba(79,195,247,0.05)', border: route.id === s.id ? '1px solid var(--cyan-neon)' : '1px solid rgba(79,195,247,0.2)', borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => { handleLoadFromLocal(s.id); setPresetListVisible(false); }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: route.id === s.id ? 'var(--cyan-neon)' : '#b0b0b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{s.title}</div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          {deleteConfirmId === s.id ? (
                            <>
                              <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); handleDeleteFromLocal(e, s.id); }}>削除する</button>
                              <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}>キャンセル</button>
                            </>
                          ) : (
                            <>
                              {isLocal && isEditMode && (
                                <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }} onClick={(e) => {
                                  e.stopPropagation();
                                  const save = DataManager.loadFromLocalStorage(s.id);
                                  if (!save) return;
                                  const routeToSave = { ...save, mapVersion: 2, markerScale: markerScale };
                                  const newPreset: PresetData = {
                                    id: `preset_${Date.now()}`,
                                    name: save.title,
                                    description: save.description || '',
                                    targetCash: save.targetCash || '',
                                    targetCoins: save.targetCoins || '',
                                    author: xorDecrypt(save.author || '', getAuthorKey(save.id, save.createdAt)),
                                    originalAuthor: xorDecrypt(save.originalAuthor || '', getOriginalAuthorKey(save.id, save.createdAt)),
                                    updatedAt: Date.now(),
                                    routeData: routeToSave
                                  };
                                  savePresetsToServer([...presets, newPreset]);
                                  setSaveNotification(`プリセット追加: ${newPreset.name}`);
                                  setTimeout(() => setSaveNotification(null), 2000);
                                }}>プリセット登録</button>
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

      {/* Help & Attribution Modal Overlay */}
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
        bgFileInputRef={bgFileInputRef}
        setLeftSidebarCollapsed={setLeftSidebarCollapsed}
        setRightSidebarCollapsed={setRightSidebarCollapsed}
        currentFloor={currentFloor}
        globalMarkers={globalMarkers}
        route={route}
        onHideGlobalMarker={handleHideGlobalMarker}
        onShowGlobalMarker={handleShowGlobalMarker}
        startupFocusMarkerId={globalDefaultsRef.current.startupFocusMarkerId}
        onSetStartupFocus={(markerId) => {
          globalDefaultsRef.current = { ...globalDefaultsRef.current, startupFocusMarkerId: markerId || undefined };
        }}
        onClearOriginalAuthor={() => {
          setRoute(prev => ({ ...prev, originalAuthor: '' }));
          setSaveNotification('原作者名をクリアしました');
          setTimeout(() => setSaveNotification(null), 2000);
        }}
      />

      {/* Full History Modal */}
      <HistoryModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        markers={isLocal ? [...globalMarkers, ...route.markers] : [...route.markers]}
        globalMarkerIds={globalMarkers.map(m => m.id)}
        onFocusTrigger={setFocusTrigger}
      />

    </div>
  );
}

