import React, { useState, useEffect, useRef } from 'react';
import { MapCanvas } from './components/MapCanvas';
import {
  type FloorType,
  type MarkerType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  DEFAULT_ROUTE,
  MARKER_META,
  DataManager
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
  Star
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
  const globalDefaultsRef = useRef<{ hiddenMarkers: string[]; hiddenMarkerTypes: string[] }>({ hiddenMarkers: [], hiddenMarkerTypes: [] });

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
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // Brush Configurations
  const [strokeColor, setStrokeColor] = useState('#ff0055'); // default red neon for route
  const [strokeWidth, setStrokeWidth] = useState(3); // line default 3px
  const [strokeType, setStrokeType] = useState<'solid' | 'dashed' | 'arrow'>('arrow');
  const [disablePinsDuringDraw, setDisablePinsDuringDraw] = useState<boolean>(true); // default true

  // App UI lists
  const [saves, setSaves] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const [defaultPreset, setDefaultPreset] = useState<RouteData | null>(null);
  const [svgString, setSvgString] = useState<string>('');

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

    // Fetch default preset on start
    fetch(`${import.meta.env.BASE_URL}api/default-preset`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setDefaultPreset(data);
        const savesList = DataManager.getSavesList();
        if (savesList.length === 0) {
          const migrated = migrateRouteCoordinates(data);
          setRouteWithGlobalDefaults({ ...migrated, id: 'default' });
        }
      })
      .catch(() => {
        fetch(`${import.meta.env.BASE_URL}default_preset.json`)
          .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
          })
          .then(data => {
            setDefaultPreset(data);
            const savesList = DataManager.getSavesList();
            if (savesList.length === 0) {
              const migrated = migrateRouteCoordinates(data);
              setRouteWithGlobalDefaults({ ...migrated, id: 'default' });
            }
          })
          .catch(() => {
            console.log('No default preset found on server or static folder.');
          });
      });
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
  const clearCurrentFloor = () => {
    const choice = window.prompt(
      'リセット対象を選択してください:\n1: ラインのみ削除\n2: 個別ピンのみ削除\n3: 両方削除\n\nキャンセルで中止',
      '3'
    );
    if (!choice) return;
    const trimmed = choice.trim();
    if (trimmed !== '1' && trimmed !== '2' && trimmed !== '3') {
      alert('1, 2, 3 のいずれかを入力してください。');
      return;
    }
    pushHistory(route.strokes, route.markers, globalMarkers);
    setRoute(prev => ({
      ...prev,
      strokes: {
        main: (trimmed === '1' || trimmed === '3') ? [] : prev.strokes.main
      },
      markers: (trimmed === '2' || trimmed === '3') ? [] : prev.markers,
      hiddenMarkers: (trimmed === '2' || trimmed === '3') ? [] : prev.hiddenMarkers
    }));
  };

  // Local Storage actions
  const handleSaveToLocal = () => {
    const routeToSave = {
      ...route,
      mapVersion: 2,
      markerScale: markerScale
    };
    DataManager.saveToLocalStorage(routeToSave);
    refreshSavesList();
    alert(`Successfully saved: ${route.title}`);
  };

  const handleSaveAsCopy = () => {
    const newTitle = window.prompt('コピーのプラン名を入力してください:', `${route.title} (COPY)`);
    if (newTitle === null) return;
    const newId = `route_${Date.now()}`;
    const copyRoute = {
      ...route,
      id: newId,
      title: newTitle.trim().toUpperCase() || 'NEW HEIST ROUTE PLAN',
      createdAt: Date.now()
    };
    DataManager.saveToLocalStorage(copyRoute);
    setRoute(copyRoute);
    refreshSavesList();
    alert(`Successfully saved copy: ${copyRoute.title}`);
  };

  const handleSaveDefaultPreset = () => {
    if (!window.confirm('現在のルートプランを「デフォルトプリセット」としてサーバーに保存しますか？\n(次回新規作成時や、他環境での初期データとして利用されます)')) {
      return;
    }
    const routeToSave = {
      ...route,
      mapVersion: 2,
      markerScale: markerScale
    };
    fetch(`${import.meta.env.BASE_URL}api/default-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routeToSave)
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(() => {
        setDefaultPreset(routeToSave);
        alert('デフォルトプリセットを保存しました。');
      })
      .catch(err => {
        console.error(err);
        alert('デフォルトプリセットの保存に失敗しました。');
      });
  };

  const handleLoadFromLocal = (id: string) => {
    if (route.id !== id && pastHistory.length > 0) {
      if (!window.confirm('他のプランを読み込みますか？現在の未保存の編集内容は上書きされます。')) {
        return;
      }
    }
    let data: RouteData | null = null;
    if (id === '__default_preset__') {
      if (!defaultPreset) return;
      data = {
        ...defaultPreset,
        id: `route_${Date.now()}`,
        title: `${defaultPreset.title} (COPY)`
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
      alert(`Loaded plan: ${data.title}`);
    }
  };

  const handleDeleteFromLocal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this route plan?')) {
      DataManager.deleteFromLocalStorage(id);
      refreshSavesList();
      if (route.id === id) {
        setRouteWithGlobalDefaults(DEFAULT_ROUTE(id));
      }
    }
  };

  const createNewPlan = () => {
    if (window.confirm('Create a new route plan? Unsaved changes will be lost.')) {
      setRouteWithGlobalDefaults(DEFAULT_ROUTE(`route_${Date.now()}`));
    }
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
          alert(`Imported successfully: ${importedData.title}`);
        } else {
          alert('Invalid JSON file format.');
        }
      } catch (err) {
        alert('Failed to read the JSON file.');
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
      {/* Top Application Header */}
      <header className="app-header glass-panel">
        <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🐾</span> にくきゅう大強盗（大強奪） マップ
          <button
            className="btn-cyber"
            onClick={() => setShowHelpModal(true)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid var(--cyan-neon)',
              background: 'rgba(0, 240, 255, 0.1)',
              color: 'var(--cyan-neon)',
              cursor: 'pointer',
              marginLeft: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              clipPath: 'none'
            }}
          >
            ❓ ヘルプ
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Undo / Redo Buttons */}
          <button
            className="btn-cyber"
            onClick={undo}
            disabled={pastHistory.length === 0}
            title="Undo (Ctrl+Z)"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              opacity: pastHistory.length === 0 ? 0.4 : 1,
              cursor: pastHistory.length === 0 ? 'not-allowed' : 'pointer',
              clipPath: 'none'
            }}
          >
            <Undo size={14} />
          </button>
          <button
            className="btn-cyber"
            onClick={redo}
            disabled={futureHistory.length === 0}
            title="Redo (Ctrl+Y)"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              opacity: futureHistory.length === 0 ? 0.4 : 1,
              cursor: futureHistory.length === 0 ? 'not-allowed' : 'pointer',
              clipPath: 'none',
              marginRight: '10px'
            }}
          >
            <Redo size={14} />
          </button>

          {/* Edit / View Presentation Toggle */}
          <button
            className={`btn-cyber ${isEditMode ? 'active' : 'success'}`}
            onClick={() => {
              setIsEditMode(!isEditMode);
              if (isEditMode) {
                setToolMode('pan'); // Auto switch to pan tool when switching to presentation
              }
            }}
            style={{ minWidth: '150px' }}
          >
            {isEditMode ? (isLocal ? '⚙ EDIT MODE' : '⚙ INDIVIDUAL EDIT') : '👁 PRESENTATION'}
          </button>

          <button className="btn-cyber success" onClick={handleSaveToLocal} title="Save to local browser storage">
            <Save size={16} /> Save Plan
          </button>
          <button className="btn-cyber" onClick={handleSaveAsCopy} title="Save a copy of the current plan">
            <Copy size={16} /> Save as Copy
          </button>
          {isLocal && isEditMode && (
            <button
              className="btn-cyber"
              onClick={handleSaveDefaultPreset}
              title="Save current plan as server default preset"
              style={{ borderColor: 'var(--yellow-neon, #ffe600)', color: 'var(--yellow-neon, #ffe600)' }}
            >
              <Star size={16} /> Set Default Preset
            </button>
          )}
          <button className="btn-cyber" onClick={handleExportJSON} title="Download plan as JSON">
            <Download size={16} /> Export JSON
          </button>
          <button className="btn-cyber" onClick={() => jsonFileInputRef.current?.click()} title="Upload plan from JSON">
            <Upload size={16} /> Import JSON
          </button>
          <input
            type="file"
            ref={jsonFileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            style={{ display: 'none' }}
            id="json-file-input"
          />
          <button className="btn-cyber success" onClick={handleExportPNG} title="Save map drawing as PNG Image">
            <ImageIcon size={16} /> Save Map Image
          </button>
          <button className="btn-cyber danger" onClick={createNewPlan} title="Create clean sheet">
            New Plan
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main
        className="main-content"
        style={{
          gridTemplateColumns: `${leftSidebarCollapsed ? '0px' : '280px'} 1fr ${rightSidebarCollapsed ? '0px' : '340px'}`
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
                  <button
                    className="tool-btn"
                    onClick={clearCurrentFloor}
                    id="tool-reset-btn"
                  >
                    <RotateCcw size={18} />
                    <span>Reset Map</span>
                  </button>
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
            markers={[
              ...globalMarkers,
              ...route.markers
            ]}
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
          <div className="panel-section">
            <div className="panel-title">ルート計画</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>プラン名</label>
              <input
                type="text"
                className="input-cyber"
                value={route.title}
                onChange={(e) => setRoute({ ...route, title: e.target.value.toUpperCase() })}
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
                      onChange={(e) => setRoute({ ...route, targetCash: e.target.value })}
                      disabled={!isEditMode}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>にくきゅうコイン</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>&#x1f4b0;</span>
                    <input
                      type="text"
                      className="input-cyber"
                      style={{ paddingLeft: '28px', width: '100%' }}
                      value={route.targetCoins}
                      onChange={(e) => setRoute({ ...route, targetCoins: e.target.value })}
                      disabled={!isEditMode}
                    />
                  </div>
                </div>
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
            <div className="panel-title">TACTICS & NOTES</div>
            <div className="placed-notes-list">
              {[...globalMarkers, ...route.markers].length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No markers placed on this map yet.
                </div>
              ) : (
                [...globalMarkers, ...route.markers]
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
              )}
            </div>
          </div>

          <div className="panel-section" style={{ marginTop: 'auto' }}>
            <div className="panel-title">SAVED ROUTE PLANS</div>
            <div className="saves-list">
              {defaultPreset && (
                <div
                  className="save-item default-preset-item"
                  style={{ borderLeft: '3px solid var(--accent-cyan, #00f0ff)' }}
                  onClick={() => handleLoadFromLocal('__default_preset__')}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                    <strong>🎁 デフォルトプリセット</strong>
                  </div>
                </div>
              )}
              {saves.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No saved plans found in browser.
                </div>
              ) : (
                saves.map(s => (
                  <div
                    key={s.id}
                    className={`save-item ${route.id === s.id ? 'glass-panel-glow' : ''}`}
                    onClick={() => handleLoadFromLocal(s.id)}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      <strong>{s.title}</strong>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDeleteFromLocal(e, s.id)}
                      disabled={!isEditMode}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Help & Attribution Modal Overlay */}
      {showHelpModal && (() => {
        const tabs = HELP_TABS.filter(t => t.id !== 'debug' || isLocal);
        const currentTabData = tabs.find(t => t.id === helpActiveTab) || tabs[0];
        const isDebugTab = currentTabData.id === 'debug';
        const currentText = isDebugTab ? '' : (helpTexts[currentTabData.id] || '');
        const setCurrentText = (!isDebugTab && isLocal) ? (val: string) => {
          const next = { ...helpTexts, [currentTabData.id]: val };
          setHelpTexts(next);
          saveHelpData(next);
        } : undefined;

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(5, 7, 10, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backdropFilter: 'blur(8px)'
            }}
          >
            <div
              className="glass-panel"
              style={{
                width: '900px',
                maxWidth: '95%',
                height: '85vh',
                maxHeight: '90%',
                padding: '25px',
                borderRadius: '8px',
                border: '1.5px solid var(--cyan-neon)',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
                background: 'rgba(10, 15, 28, 0.98)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                pointerEvents: 'auto',
                color: 'var(--text-primary)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 240, 255, 0.2)', paddingBottom: '10px', marginBottom: '0' }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ❓ ヘルプ・情報
                </span>
                <button
                  onClick={() => { setShowHelpModal(false); setIsHelpPreviewMode(false); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '18px',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Tab Bar */}
              <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(0, 240, 255, 0.15)', flexShrink: 0 }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setHelpActiveTab(tab.id)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: helpActiveTab === tab.id ? 'bold' : 'normal',
                      color: helpActiveTab === tab.id ? 'var(--cyan-neon)' : 'var(--text-muted)',
                      background: helpActiveTab === tab.id ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
                      border: 'none',
                      borderBottom: helpActiveTab === tab.id ? '2px solid var(--cyan-neon)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: '200px', padding: '12px 0' }}>
                {isDebugTab ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '4px' }}>
                      🔧 デバッグメニュー（グローバル編集モード専用）
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        className="btn-cyber"
                        style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                          setShowHelpModal(false);
                          setIsHelpPreviewMode(false);
                          setTimeout(() => bgFileInputRef.current?.click(), 100);
                        }}
                      >
                        🗺️ カスタムBGを変更
                      </button>

                      <button
                        className="btn-cyber"
                        style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                          setShowHelpModal(false);
                          setIsHelpPreviewMode(false);
                          setLeftSidebarCollapsed(false);
                        }}
                      >
                        📌 マーカー表示設定を開く
                      </button>

                      <button
                        className="btn-cyber"
                        style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                          setShowHelpModal(false);
                          setIsHelpPreviewMode(false);
                          setRightSidebarCollapsed(false);
                        }}
                      >
                        📋 プラン一覧を開く
                      </button>

                      <button
                        className="btn-cyber danger"
                        style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                          if (confirm('全データをリセットしますか？この操作は取り消せません。')) {
                            localStorage.clear();
                            window.location.reload();
                          }
                        }}
                      >
                        🗑️ 全データをリセット
                      </button>
                    </div>

                    <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>デバッグ情報:</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        <div>isLocal: {isLocal ? 'true' : 'false'}</div>
                        <div>isEditMode: {isEditMode ? 'true' : 'false'}</div>
                        <div>floor: {currentFloor}</div>
                        <div>markers: {route.markers.length}</div>
                        <div>globalMarkers: {globalMarkers.length}</div>
                      </div>
                    </div>
                  </div>
                ) : isEditMode && isLocal && !isHelpPreviewMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, height: '100%' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      ※ グローバル編集モード: HTMLタグ（aタグ等含む）で自由に編集できます。
                    </div>
                    <textarea
                      value={currentText}
                      onChange={setCurrentText ? (e) => setCurrentText(e.target.value) : undefined}
                      style={{
                        width: '100%',
                        flex: 1,
                        minHeight: '300px',
                        background: 'rgba(5, 7, 10, 0.8)',
                        border: '1px solid rgba(0, 240, 255, 0.3)',
                        color: 'var(--text-primary)',
                        padding: '12px',
                        borderRadius: '4px',
                        fontFamily: 'Consolas, Monaco, monospace',
                        fontSize: '13px',
                        resize: 'none'
                      }}
                      placeholder="HTMLタグを使って自由に記述してください"
                    />
                  </div>
                ) : (
                  <div
                    className="help-content-view"
                    style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: 'var(--text-primary)',
                      padding: '5px'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: currentText || '<p style="color:var(--text-muted);font-style:italic;">表示する情報がありません。</p>'
                    }}
                  />
                )}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', flexShrink: 0 }}>
                {isEditMode && isLocal ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={isHelpPreviewMode}
                      onChange={(e) => setIsHelpPreviewMode(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    👁 プレビュー表示 (HTML表示)
                  </label>
                ) : (
                  <div />
                )}
                <button
                  className="btn-cyber success"
                  onClick={() => { setShowHelpModal(false); setIsHelpPreviewMode(false); }}
                  style={{ padding: '6px 16px', fontSize: '12px', clipPath: 'none' }}
                >
                  {isEditMode ? '保存して閉じる' : '閉じる'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

