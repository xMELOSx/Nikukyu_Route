import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { MapCanvas } from './components/MapCanvas';
import { HistoryModal } from './components/HistoryModal';
import { SpawnAnalysisPanel } from './components/SpawnAnalysisPanel';
import { HelpModal } from './components/HelpModal';
import { PlayDataPanel } from './components/PlayDataPanel';
import { OcrDebugModal } from './components/OcrDebugModal';
import { SaveModal, type SaveModalExportParams } from './components/SaveModal';
import { t, useLangState } from './i18n';

function LangSync(): null {
  // 言語切替時に App 全体を再レンダリングさせるための空レンダーコンポーネント
  useLangState();
  return null;
}

import {
  type FloorType,
  type MarkerType,
  type DrawingStroke,
  type HeistMarker,
  type RouteData,
  type PresetData,
  type PresetVisibility,
  type SpawnPoint,
  type LockedWallSegment,
  type GlobalLockedWalls,
  PRESET_VISIBILITY_META,
  MARKER_META,
  normalizeStrokes,
  normalizePresetVisibility,
  normalizePresets,
  getPresetVisibility,
  DataManager,
  AUTHOR_DEFAULT_PLAIN,
  generateId,
  savePresetBody,
  migrateLoadedRoute
} from './utils/DataManager';
import { type HelpData, fetchHelpData } from './utils/HelpDataManager';
import { useNotifications } from './hooks/useNotifications';
import { useGlobalDefaults, type GlobalDefaults } from './hooks/useGlobalDefaults';
import { useGlobalMarkers } from './hooks/useGlobalMarkers';
import { useGlobalWalls } from './hooks/useGlobalWalls';
import { useGlobalSpawns } from './hooks/useGlobalSpawns';
import { useRoute, type SaveInfo } from './hooks/useRoute';
import { useHistory } from './hooks/useHistory';
import { useFileIO } from './hooks/useFileIO';
import './utils/crashErrorHandler';
import { SaveListRowAuthor } from './hooks/SaveListRowAuthor';
import { useAutoRoute } from './hooks/useAutoRoute';
import { PLAY_DATA_KEY, loadFloorNavCollapsed, saveFloorNavCollapsed } from './utils/PlayDataManager';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  Save,
  Download,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Undo,
  Redo,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Play,
  Pause,
  Square,
  Star,
  Move
} from 'lucide-react';
import { formatTime } from './utils/format';
import { StorageUsageBadge } from './components/StorageUsageBadge';
import { QuickPresetButton } from './components/QuickPresetButton';
import { CrashInfoModal } from './components/CrashInfoModal';
import { UrlLoadConfirmModal } from './components/UrlLoadConfirmModal';
import LeftSidebar from './components/LeftSidebar';





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

  // オートセーブの ON/OFF (デフォルト ON, localStorage に永続化)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('heist_auto_save');
    return stored === null ? true : stored === 'true';
  });
  useEffect(() => {
    localStorage.setItem('heist_auto_save', String(autoSaveEnabled));
  }, [autoSaveEnabled]);

  // オートセーブ間隔 (ms)。デフォルト 5分 (300000ms)。最小 1500ms (= デバウンス即時)
  const [autoSaveInterval, setAutoSaveInterval] = useState<number>(() => {
    const stored = localStorage.getItem('heist_auto_save_interval');
    if (stored !== null) {
      const v = parseInt(stored);
      if (!isNaN(v) && v >= 1500) return v;
    }
    return 300000; // デフォルト 5分
  });
  useEffect(() => {
    localStorage.setItem('heist_auto_save_interval', String(autoSaveInterval));
  }, [autoSaveInterval]);

  const [lastCrashInfo, setLastCrashInfo] = useState<{ message: string; stack: string; url: string; time: string } | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem('heist_last_crash_error');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLastCrashInfo(parsed);
        const copyText = `=== Last Crash Error ===\nURL: ${parsed.url}\nTime: ${parsed.time}\nMessage: ${parsed.message}\nStack: ${parsed.stack || 'no stack'}\n`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyText).catch(() => { });
        }
      } catch (e) { }
      localStorage.removeItem('heist_last_crash_error');
    }
  }, []);


  const [isEditMode, setIsEditMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_is_edit_mode');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_is_edit_mode', String(isEditMode));
  }, [isEditMode]);

  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [helpActiveTab, setHelpActiveTab] = useState<string>('spec');
  const [isHelpPreviewMode, setIsHelpPreviewMode] = useState<boolean>(false);

  const [showDetectionRanges, setShowDetectionRanges] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_detection_ranges');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_show_detection_ranges', String(showDetectionRanges));
  }, [showDetectionRanges]);
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
  // スキルCDマーカー専用の判定閾値 (他のマーカーとは独立、デフォルト10px)
  const [skillCdThreshold, setSkillCdThresholdState] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_threshold_skill_cd') || '');
    return !isNaN(v) && v >= 5 && v <= 30 ? v : 10;
  });
  const setStopMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setStopMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_stop', String(clamped));
    postGlobalDefaults(routeApi.route.hiddenMarkers || [], routeApi.route.hiddenMarkerTypes || [], clamped, undefined, undefined, skillCdThreshold);
  };
  const setMovementMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setMovementMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_movement', String(clamped));
    postGlobalDefaults(routeApi.route.hiddenMarkers || [], routeApi.route.hiddenMarkerTypes || [], undefined, clamped, undefined, skillCdThreshold);
  };
  const setWarpMarkerThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setWarpMarkerThresholdState(clamped);
    localStorage.setItem('heist_threshold_warp', String(clamped));
    postGlobalDefaults(routeApi.route.hiddenMarkers || [], routeApi.route.hiddenMarkerTypes || [], undefined, undefined, clamped, skillCdThreshold);
  };
  const setSkillCdThreshold = (n: number) => {
    const clamped = Math.max(5, Math.min(30, n));
    setSkillCdThresholdState(clamped);
    localStorage.setItem('heist_threshold_skill_cd', String(clamped));
    postGlobalDefaults(routeApi.route.hiddenMarkers || [], routeApi.route.hiddenMarkerTypes || [], stopMarkerThreshold, movementMarkerThreshold, warpMarkerThreshold, clamped);
  };
  const [helpTexts, setHelpTexts] = useState<HelpData>({});
  const [showMarkerLabels, setShowMarkerLabels] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_labels');
    return saved !== null ? saved === 'true' : true;
  });
  const [floorNavCollapsed, setFloorNavCollapsed] = useState<boolean>(() => loadFloorNavCollapsed());
  useEffect(() => {
    saveFloorNavCollapsed(floorNavCollapsed);
  }, [floorNavCollapsed]);

  const [toolMode, setToolMode] = useState<'select' | 'draw' | 'erase' | 'move' | 'measure' | 'add-marker' | 'toggle-vis' | 'edit-stroke' | 'wall' | 'add-spawn'>(() => {
    const saved = localStorage.getItem('heist_tool_mode');
    if (saved === 'draw-wall' || saved === 'erase-wall') return 'wall';
    return (saved as any) || 'move';
  });
  const prevToolModeRef = useRef(toolMode);
  useEffect(() => {
    localStorage.setItem('heist_tool_mode', toolMode === 'wall' ? 'wall' : toolMode);
    const prev = prevToolModeRef.current;
    if (prev === 'draw' && toolMode !== 'draw') {
      routeApi.setRoute(prev => {
        let changed = false;
        const nextStrokes = { ...prev.strokes } as RouteData['strokes'];
        for (const floor of Object.keys(nextStrokes)) {
          const arr = nextStrokes[floor as FloorType];
          if (arr && arr.some(s => s.type === 'temporary')) {
            nextStrokes[floor as FloorType] = arr.filter(s => s.type !== 'temporary');
            changed = true;
          }
        }
        return changed ? { ...prev, strokes: nextStrokes } : prev;
      });
      // 履歴からも一時線を一括クリーンアップ
      historyApi.clearTemporaryStrokes();
    }
    prevToolModeRef.current = toolMode;
  }, [toolMode]);

  const [wallSubMode, setWallSubMode] = useState<'draw' | 'erase' | 'texture' | 'slice'>(() => {
    const saved = localStorage.getItem('heist_wall_sub_mode');
    return (saved as any) || 'draw';
  });
  useEffect(() => {
    localStorage.setItem('heist_wall_sub_mode', wallSubMode);
  }, [wallSubMode]);

  const [selectedTexture, setSelectedTexture] = useState<string>('');
  const [selectedRepeat, setSelectedRepeat] = useState<number>(1);
  const [texturesList, setTexturesList] = useState<string[]>([]);

  useEffect(() => {
    const url = isLocal
      ? `${import.meta.env.BASE_URL}api/textures`
      : `${import.meta.env.BASE_URL}textures.json`;
    fetch(url)
      .then(res => { if (res.ok) return res.json(); })
      .then(data => {
        if (Array.isArray(data)) {
          setTexturesList(data);
          if (data.length > 0) {
            setSelectedTexture(data[0]);
          }
        }
      })
      .catch(() => {});
  }, [isLocal]);

  const [wallAutoSnap, setWallAutoSnap] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_wall_auto_snap');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_wall_auto_snap', String(wallAutoSnap));
  }, [wallAutoSnap]);

  const [hideStrokesDuringWalls, setHideStrokesDuringWalls] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_hide_strokes_during_walls');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_hide_strokes_during_walls', String(hideStrokesDuringWalls));
  }, [hideStrokesDuringWalls]);

  const [hideMarkersDuringWalls, setHideMarkersDuringWalls] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_hide_markers_during_walls');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_hide_markers_during_walls', String(hideMarkersDuringWalls));
  }, [hideMarkersDuringWalls]);

  const [lockedWalls, setLockedWalls] = useState<GlobalLockedWalls>(() => {
    try {
      const saved = localStorage.getItem('heist_global_locked_walls');
      if (saved) {
        const parsed = JSON.parse(saved);
        const out: GlobalLockedWalls = {};
        for (const floor of ['main', 'second', 'third', 'fourth']) {
          out[floor] = [];
          if (Array.isArray(parsed[floor])) {
            for (const seg of parsed[floor]) {
              if (seg && seg.p1 && seg.p2 && typeof seg.p1.x === 'number' && typeof seg.p1.y === 'number' && typeof seg.p2.x === 'number' && typeof seg.p2.y === 'number') {
                out[floor].push({ p1: seg.p1, p2: seg.p2, isOpen: false }); // 起動時はすべて閉じる
              }
            }
          }
        }
        return out;
      }
    } catch {}
    return { main: [], second: [], third: [], fourth: [] };
  });
  const [lockedWallsLoaded, setLockedWallsLoaded] = useState(!isLocal);
  const persistLockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!lockedWallsLoaded) return; // サーバーからの読み込み完了前は絶対に上書き保存しない！！！

    localStorage.setItem('heist_global_locked_walls', JSON.stringify(lockedWalls));
    if (!isLocal) return;

    if (persistLockedTimerRef.current) clearTimeout(persistLockedTimerRef.current);
    persistLockedTimerRef.current = setTimeout(() => {
      fetch(`${import.meta.env.BASE_URL}api/global-locked-walls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lockedWalls)
      }).catch(err => console.error('Failed to persist global locked walls:', err));
    }, 150);

    return () => {
      if (persistLockedTimerRef.current) clearTimeout(persistLockedTimerRef.current);
    };
  }, [lockedWalls, isLocal, lockedWallsLoaded]);

  useEffect(() => {
    let cancelled = false;

    const loadGates = async () => {
      // 1. 開発用APIエンドポイントの試行 (isLocal の場合のみ)
      if (isLocal) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}api/global-locked-walls`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              if (cancelled) return;
              applyLockedWallsData(data);
              return;
            }
          }
        } catch {}
      }

      // 2. 静的ファイルのフォールバック試行 (isLocal === false または API呼び出しが失敗した際)
      try {
        const fileRes = await fetch(`${import.meta.env.BASE_URL}global_locked_walls.json`);
        if (fileRes.ok) {
          const data = await fileRes.json();
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            if (cancelled) return;
            applyLockedWallsData(data);
          }
        }
      } catch (err) {
        console.error('Failed to load global locked walls from static file:', err);
      }
    };

    const applyLockedWallsData = (data: any) => {
      const out: GlobalLockedWalls = {};
      for (const floor of ['main', 'second', 'third', 'fourth']) {
        out[floor] = [];
        if (Array.isArray(data[floor])) {
          for (const seg of data[floor]) {
            if (seg && seg.p1 && seg.p2 && typeof seg.p1.x === 'number' && typeof seg.p1.y === 'number' && typeof seg.p2.x === 'number' && typeof seg.p2.y === 'number') {
              out[floor].push({ p1: seg.p1, p2: seg.p2, isOpen: false }); // 起動時はすべて閉じる
            }
          }
        }
      }
      setLockedWalls(out);
    };

    loadGates().finally(() => {
      if (!cancelled) setLockedWallsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isLocal]);

  const [wallLockedSubMode, setWallLockedSubMode] = useState<'normal' | 'locked'>(() => {
    const saved = localStorage.getItem('heist_wall_locked_sub_mode');
    return (saved as any) || 'normal';
  });
  useEffect(() => {
    localStorage.setItem('heist_wall_locked_sub_mode', wallLockedSubMode);
  }, [wallLockedSubMode]);

  const [bypassWallsEnabled, setBypassWallsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_bypass_walls_enabled');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_bypass_walls_enabled', String(bypassWallsEnabled));
  }, [bypassWallsEnabled]);
  const [bypassShortestOnly, setBypassShortestOnly] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_bypass_shortest_only');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_bypass_shortest_only', String(bypassShortestOnly));
  }, [bypassShortestOnly]);

  const [eraseTarget, setEraseTarget] = useState<'all' | 'marker' | 'route' | 'branch'>(() => {
    const saved = localStorage.getItem('heist_erase_target');
    return (saved as any) || 'all';
  });
  useEffect(() => {
    localStorage.setItem('heist_erase_target', eraseTarget);
  }, [eraseTarget]);

  const [eraseDefaultBehavior, setEraseDefaultBehavior] = useState<'normal' | 'split'>(() => {
    const saved = localStorage.getItem('heist_erase_default_behavior');
    return (saved as any) || 'normal';
  });
  useEffect(() => {
    localStorage.setItem('heist_erase_default_behavior', eraseDefaultBehavior);
  }, [eraseDefaultBehavior]);

  const [eraseSize, setEraseSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_erase_size') || '');
    return !isNaN(v) ? v : 16;
  });
  useEffect(() => {
    localStorage.setItem('heist_erase_size', String(eraseSize));
  }, [eraseSize]);

  // 線分編集ツール (色変更 / 平滑化 / 線種 / 太さ): 選択中ストロークのインデックス
  // 単一選択 (mode に応じて「最後に選択された 1 本」を覚える) と
  // 複数選択 (Alt+クリックで累積) の両方をサポート。
  const [editStrokeIdxs, setEditStrokeIdxs] = useState<Set<number>>(() => new Set());
  // 距離計測ツールで選択中のストローク集合 (measure 用、edit-stroke とは別管理)
  const [measureSelectedStrokeIdxs, setMeasureSelectedStrokeIdxs] = useState<Set<number>>(() => new Set());
  // 平滑化の繰り返し回数
  const [editSmoothIterations, setEditSmoothIterations] = useState<number>(3);
  // ルート線 / 線分編集 / 距離計測の各ツール使用中、
  // マーカー (ピン) へのクリックを遮断して背後の線を選択しやすくする共通トグル。
  // デフォルト ON。
  const [blockMarkerClicksDuringTools, setBlockMarkerClicksDuringTools] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_block_marker_clicks_during_tools');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_block_marker_clicks_during_tools', String(blockMarkerClicksDuringTools));
  }, [blockMarkerClicksDuringTools]);
  // Alt 押下状態(消しゴムモードのメニューを視覚的にシフトさせる)
  // ref + state の二重管理。
  // キーハンドラは document (capture) に張り、要素側の stopPropagation に
  // 左右されないようにする。さらに flushSync で同期的に反映させ、
  // mousemove / mouseup / wheel / pointer* / visibilitychange / blur の
  // どれか一つが拾えれば ref 経由で state を強制再同期する。
  const altPressedRef = useRef<boolean>(false);
  const [isAltPressed, setIsAltPressed] = useState<boolean>(false);
  useEffect(() => {
    const applyPressed = (next: boolean) => {
      if (altPressedRef.current === next) return;
      altPressedRef.current = next;
      // React 19 の自動バッチ / concurrent rendering で keyup 単独だと
      // 再レンダが後ろに回ることがあるため flushSync で即時反映する。
      flushSync(() => {
        setIsAltPressed(next);
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) applyPressed(true);

      // Undo shortcut (Ctrl+Z) — メイン履歴 → スポーン履歴 (ref 経由で常に最新)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          return;
        }
        if (historyApiRef.current?.canUndo) {
          e.preventDefault();
          historyApiRef.current.undo();
        } else if (spawnUndoRef.current.length > 0) {
          e.preventDefault();
          undoPoints();
        }
      }

      // Redo shortcut (Ctrl+Y or Ctrl+Shift+Z) — メイン履歴 → スポーン履歴 (ref 経由で常に最新)
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          return;
        }
        if (historyApiRef.current?.canRedo) {
          e.preventDefault();
          historyApiRef.current.redo();
        } else if (spawnRedoRef.current.length > 0) {
          e.preventDefault();
          redoPoints();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) applyPressed(false);
    };
    const handleBlur = () => applyPressed(false);
    const handleVisibilityChange = () => {
      if (document.hidden) applyPressed(false);
    };
    // 任意のポインタ/マウス/ホイール操作で実状態と ref を突き合わせ、
    // 食い違いがあれば即座に同期する(keyup 取りこぼしの最終防衛線)。
    const handleInteraction = (e: MouseEvent) => {
      if (e.altKey !== altPressedRef.current) {
        applyPressed(e.altKey);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('mouseup', handleInteraction);
    window.addEventListener('wheel', handleInteraction, { passive: true });
    window.addEventListener('pointerdown', handleInteraction);
    window.addEventListener('pointermove', handleInteraction);
    window.addEventListener('pointerup', handleInteraction);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('mouseup', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('pointermove', handleInteraction);
      window.removeEventListener('pointerup', handleInteraction);
    };
  }, []);
  const [activeMarkerType, setActiveMarkerType] = useState<MarkerType | null>(() => {
    const saved = localStorage.getItem('heist_active_marker_type');
    return saved !== null ? (saved as any) : 'cardkey';
  });
  useEffect(() => {
    if (activeMarkerType) {
      localStorage.setItem('heist_active_marker_type', activeMarkerType);
    }
  }, [activeMarkerType]);

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [strokeColor, setStrokeColor] = useState(() => {
    return localStorage.getItem('heist_stroke_color') || '#ff0055';
  });
  useEffect(() => {
    localStorage.setItem('heist_stroke_color', strokeColor);
  }, [strokeColor]);

  const [strokeWidth, setStrokeWidth] = useState(() => {
    const v = parseInt(localStorage.getItem('heist_stroke_width') || '');
    return !isNaN(v) ? v : 3;
  });
  useEffect(() => {
    localStorage.setItem('heist_stroke_width', String(strokeWidth));
  }, [strokeWidth]);

  const [strokeType, setStrokeType] = useState<'solid' | 'dashed' | 'temporary'>(() => {
    const saved = localStorage.getItem('heist_stroke_type');
    return (saved as any) || 'solid';
  });
  useEffect(() => {
    localStorage.setItem('heist_stroke_type', strokeType);
  }, [strokeType]);

  const warpColor = '#ff00ff';
  const stairsColor = '#ffaa00';
  const [drawMode, setDrawMode] = useState<'free' | 'smooth' | 'straight'>(() => {
    const saved = localStorage.getItem('heist_draw_mode');
    return (saved as any) || 'smooth';
  });
  useEffect(() => {
    localStorage.setItem('heist_draw_mode', drawMode);
  }, [drawMode]);
  const [textPinPassThrough, setTextPinPassThrough] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_text_pin_pass_through');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_text_pin_pass_through', String(textPinPassThrough));
  }, [textPinPassThrough]);

  const [drawerPinPassThrough, setDrawerPinPassThrough] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_drawer_pin_pass_through');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_drawer_pin_pass_through', String(drawerPinPassThrough));
  }, [drawerPinPassThrough]);

  // 最寄り起動中 ReroRero電話ボックス の方向コンパス (default: オフ)
  const [showPhoneCompass, setShowPhoneCompass] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_phone_compass');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_show_phone_compass', String(showPhoneCompass));
  }, [showPhoneCompass]);

  // 電話ボックスHUD (default: オン)
  const [showPhoneBoxHud, setShowPhoneBoxHud] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_phone_box_hud');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_show_phone_box_hud', String(showPhoneBoxHud));
  }, [showPhoneBoxHud]);
  const [phoneBoxHudOpen, setPhoneBoxHudOpen] = useState<boolean>(false);
  const [phoneBoxHudSize, setPhoneBoxHudSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_phone_box_hud_size') || '');
    return !isNaN(v) && v >= 60 && v <= 140 ? v : 100;
  });
  useEffect(() => {
    localStorage.setItem('heist_phone_box_hud_size', String(phoneBoxHudSize));
  }, [phoneBoxHudSize]);

  // 右下HUD (default: オン)
  const [showBottomRightHud, setShowBottomRightHud] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_bottom_right_hud');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_show_bottom_right_hud', String(showBottomRightHud));
  }, [showBottomRightHud]);
  const [zoomHudSize, setZoomHudSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_zoom_hud_size') || '');
    return !isNaN(v) && v >= 60 && v <= 140 ? v : 100;
  });
  useEffect(() => {
    localStorage.setItem('heist_zoom_hud_size', String(zoomHudSize));
  }, [zoomHudSize]);

  // マーカー一覧折りたたみ状態 (default: 展開)
  const [globalMarkerListExpanded, setGlobalMarkerListExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_global_marker_list_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_global_marker_list_expanded', String(globalMarkerListExpanded));
  }, [globalMarkerListExpanded]);

  const [localMarkerListExpanded, setLocalMarkerListExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_local_marker_list_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_local_marker_list_expanded', String(localMarkerListExpanded));
  }, [localMarkerListExpanded]);

  // 表示設定の折りたたみ状態 (default: 展開)
  const [showSettingsExpanded, setShowSettingsExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_settings_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_show_settings_expanded', String(showSettingsExpanded));
  }, [showSettingsExpanded]);

  // MARKER VISIBILITYの折りたたみ状態 (default: 展開)
  const [markerVisibilityExpanded, setMarkerVisibilityExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_marker_visibility_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_marker_visibility_expanded', String(markerVisibilityExpanded));
  }, [markerVisibilityExpanded]);

  const [svgString, setSvgString] = useState<string>('');
  const [rightTab, setRightTab] = useState<'route' | 'play' | 'spawn'>('route');
  const [markerScale, setMarkerScale] = useState<number>(() => {
    const saved = localStorage.getItem('heist_marker_scale');
    return saved !== null ? parseInt(saved) : 30;
  });
  const [presetListVisible, setPresetListVisible] = useState(false);
  const [saveLoadSearchQuery, setSaveLoadSearchQuery] = useState('');
  // お気に入り (セーブ/プリセット両方): ID リストを localStorage に保存
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('heist_save_load_favorites_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      }
    } catch { }
    return [];
  });
  // プリセットを隠すフィルタ: 非表示プリセット ID リストを localStorage に保存
  const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('heist_save_load_hidden_presets_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      }
    } catch { }
    return [];
  });
  // 表示フィルタ: 'all' | 'favorites' | 'presets' | 'saves'
  const [saveLoadFilter, setSaveLoadFilter] = useState<'all' | 'favorites' | 'presets' | 'saves'>('all');

  useEffect(() => {
    try { localStorage.setItem('heist_save_load_favorites_v1', JSON.stringify(favoriteIds)); } catch { }
  }, [favoriteIds]);

  useEffect(() => {
    try { localStorage.setItem('heist_save_load_hidden_presets_v1', JSON.stringify(hiddenPresetIds)); } catch { }
  }, [hiddenPresetIds]);
  const [urlLoadConfirm, setUrlLoadConfirm] = useState<{ type: 'preset' | 'save'; id: string; name: string } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [presetDeleteConfirmId, setPresetDeleteConfirmId] = useState<string | null>(null);
  const [historyDeleteConfirmId, setHistoryDeleteConfirmId] = useState<string | null>(null);
  const [newPlanConfirm, setNewPlanConfirm] = useState(false);
  const [resetTarget, setResetTarget] = useState<'lines' | 'pins' | 'both' | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<{ id: string; timestamp: number } | null>(null);
  const [currentPosTrigger, setCurrentPosTrigger] = useState<number>(0);
  const [autoStartMarker, setAutoStartMarker] = useState<HeistMarker | null>(null);
  const [showOcrDebugModal, setShowOcrDebugModal] = useState<boolean>(false);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);

  const [hideRouteLines, setHideRouteLines] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_hide_route_lines');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_hide_route_lines', String(hideRouteLines));
  }, [hideRouteLines]);

  const [routeLines1px, setRouteLines1px] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_route_lines_1px');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_route_lines_1px', String(routeLines1px));
  }, [routeLines1px]);

  const [hideBranchLines, setHideBranchLines] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_hide_branch_lines');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_hide_branch_lines', String(hideBranchLines));
  }, [hideBranchLines]);

  const [branchLines1px, setBranchLines1px] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_branch_lines_1px');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => {
    localStorage.setItem('heist_branch_lines_1px', String(branchLines1px));
  }, [branchLines1px]);


  // Preset editor state was previously used by an inline "Save as preset" form
  // that was removed during the hook extraction. Kept removed; the saveAsPreset
  // hook action is still available but the JSX form is no longer rendered.
  // (Future work: add a preset-editor modal that uses these state vars.)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetDurationSliderRef = useRef<HTMLInputElement | null>(null);
  const targetDurationTextRef = useRef<HTMLInputElement | null>(null);
  const playDataImportRef = useRef<HTMLInputElement>(null);
  const [playDataRefreshKey, setPlayDataRefreshKey] = useState(0);

  // --- Hooks (in dependency order) ---
  const notification = useNotifications(2000);

  // Global-defaults ref is created here so both useRoute (for applying
  // defaults on setRouteWithGlobalDefaults) and useGlobalDefaults (for
  // loading + setters) share the same instance.
  const globalDefaultsRef = useRef<GlobalDefaults>({ hiddenMarkers: [], hiddenMarkerTypes: [] });

  const globalMarkersStore = useGlobalMarkers({ isLocal });

  // Global Spawn Records
  const spawnApi = useGlobalSpawns();
  const setSpawnPoints = spawnApi.setPoints;

  // スポーンツールのサブモード
  const [spawnToolMode, setSpawnToolMode] = useState<'place' | 'edit' | 'erase' | 'manage'>('place');
  const [spawnPlaceCategory, setSpawnPlaceCategory] = useState<string>('');
  const [spawnMoveX, setSpawnMoveX] = useState(0);
  const [spawnMoveY, setSpawnMoveY] = useState(0);
  // 設置後に自動で編集モーダルを開く
  const [spawnAutoEdit, setSpawnAutoEdit] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_spawn_auto_edit');
    return saved !== null ? saved === 'true' : false;
  });
  useEffect(() => { localStorage.setItem('heist_spawn_auto_edit', String(spawnAutoEdit)); }, [spawnAutoEdit]);
  // スポーン点の表示サイズ
  const [spawnPointSize, setSpawnPointSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_spawn_point_size') || '');
    return !isNaN(v) && v >= 1 && v <= 8 ? v : 3;
  });
  useEffect(() => { localStorage.setItem('heist_spawn_point_size', String(spawnPointSize)); }, [spawnPointSize]);
  // グリッドスナップ
  const [spawnGridSnap, setSpawnGridSnap] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('heist_spawn_grid_snap') || '');
    return [0,5,10,25,50].includes(v) ? v : 0;
  });
  useEffect(() => { localStorage.setItem('heist_spawn_grid_snap', String(spawnGridSnap)); }, [spawnGridSnap]);
  const [spawnMovingPointId, setSpawnMovingPointId] = useState<string | null>(null);
  const [spawnViewPointId, setSpawnViewPointId] = useState<string | null>(null);
  const [viewerFilterPlayers, setViewerFilterPlayers] = useState<number | null>(null);
  const [spawnHighlightItemIds, setSpawnHighlightItemIds] = useState<string[] | null>(null);
  const [spawnHighlightCategories, setSpawnHighlightCategories] = useState<string[] | null>(null);
  const spawnFilterCacheRef = useRef<string[] | null>(null);
  // 絞り込み状態をキャッシュ (タブ切替で維持)
  useEffect(() => {
    if (rightTab === 'spawn') spawnFilterCacheRef.current = spawnHighlightItemIds;
  }, [spawnHighlightItemIds, rightTab]);
  const [spawnTabMode, setSpawnTabMode] = useState<'view' | 'manage'>('view');
  // サーバー設定値 (本番のスポーン表示有無)
  const [spawnServerEnabled, setSpawnServerEnabled] = useState<boolean>(() => !!globalDefaultsRef.current.spawnFeatureEnabled);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  useEffect(() => {
    if (defaultsLoaded) {
      setSpawnServerEnabled(!!globalDefaultsRef.current.spawnFeatureEnabled);
    }
  }, [defaultsLoaded]);
  // 表示制御: ローカルは常時表示、本番はサーバー設定に従う
  const showSpawnFeature = isLocal || spawnServerEnabled;
  // スポーン編集ツールはローカル専用
  const showSpawnEditFeature = isLocal;
  // デバッグメニュートグル → サーバーの global_defaults.json を書き換え
  const handleSpawnFeatureToggle = useCallback((enabled: boolean) => {
    setSpawnServerEnabled(enabled);
    globalDefaultsRef.current = { ...globalDefaultsRef.current, spawnFeatureEnabled: enabled };
    fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...globalDefaultsRef.current, spawnFeatureEnabled: enabled })
    }).catch(() => { });
  }, []);
  const [spawnVisible, setSpawnVisible] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_spawn_visible');
    return saved === null ? true : saved === 'true';
  });
  useEffect(() => { localStorage.setItem('heist_spawn_visible', String(spawnVisible)); }, [spawnVisible]);
  const [spawnHideOther, setSpawnHideOther] = useState(false);
  const [spawnHideBg, setSpawnHideBg] = useState(false);
  const [spawnFocusTrigger, setSpawnFocusTrigger] = useState<{ x: number; y: number; ts: number } | null>(null);
  // 設置モードで選択中のアイテムID
  // 情報編集の対象ポイントID
  const [editPointId, setEditPointId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  // 情報編集で追加するアイテムID
  const [editAddItemId, setEditAddItemId] = useState<string>('');
  const [editAddPlayerCount, setEditAddPlayerCount] = useState(1);
  // アイテム管理フォーム
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormTextColor, setItemFormTextColor] = useState('green');
  const [itemFormFans, setItemFormFans] = useState(0);
  const [itemFormCoins, setItemFormCoins] = useState(0);
  const [itemFormEditId, setItemFormEditId] = useState<string | null>(null);
  const [itemFormDescription, setItemFormDescription] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkColor, setBulkColor] = useState('blue');
  const [itemFormImage, setItemFormImage] = useState('');
  const itemImageInputRef = useRef<HTMLInputElement>(null);
  const handleItemImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setItemFormImage(reader.result as string);
    reader.readAsDataURL(file);
  }, []);
  // スポーン点履歴 (undo/redo) — 専用スタック
  const spawnUndoRef = useRef<SpawnPoint[][]>([]);
  const spawnRedoRef = useRef<SpawnPoint[][]>([]);
  const pushSpawnHistory = useCallback(() => {
    setSpawnPoints(prev => {
      spawnUndoRef.current.push([...prev]);
      if (spawnUndoRef.current.length > 30) spawnUndoRef.current.shift();
      spawnRedoRef.current = [];
      return prev;
    });
  }, []);
  const undoPoints = useCallback(() => {
    const prev = spawnUndoRef.current.pop();
    if (!prev) return;
    setSpawnPoints(curr => {
      spawnRedoRef.current.push([...curr]);
      return prev;
    });
  }, []);
  const redoPoints = useCallback(() => {
    const next = spawnRedoRef.current.pop();
    if (!next) return;
    setSpawnPoints(curr => {
      spawnUndoRef.current.push([...curr]);
      return next;
    });
  }, []);
  const handleSpawnMoveComplete = useCallback((id: string, x: number, y: number) => {
    pushSpawnHistory();
    spawnApi.updatePoint(id, { x, y });
    setSpawnMovingPointId(null);
  }, [spawnApi, pushSpawnHistory]);

  // スポーン点追加: マップクリック時 (空の点)
  const handleSpawnPointAdd = useCallback((x: number, y: number) => {
    pushSpawnHistory();
    const snap = spawnGridSnap > 0 ? spawnGridSnap : 0;
    const sx = snap > 0 ? Math.round(x / snap) * snap : x;
    const sy = snap > 0 ? Math.round(y / snap) * snap : y;
    const point: SpawnPoint = {
      id: generateId('sp'),
      x: sx, y: sy,
      floor: currentFloor,
      category: (spawnPlaceCategory || undefined) as any,
      createdAt: new Date().toISOString(),
      items: [],
    };
    spawnApi.addPoint(point);
    if (spawnAutoEdit) {
      setEditPointId(point.id);
      setSpawnMoveX(sx); setSpawnMoveY(sy);
      setShowEditModal(true);
    }
  }, [currentFloor, spawnApi, pushSpawnHistory, spawnPlaceCategory, spawnAutoEdit, spawnGridSnap]);

  // スポーン点編集: マップの点をクリック時 → モーダル表示
  const handleSpawnPointEdit = useCallback((id: string) => {
    setEditPointId(id);
    const pt = spawnApi.points.find(p => p.id === id);
    if (pt) { setSpawnMoveX(pt.x); setSpawnMoveY(pt.y); }
    setShowEditModal(true);
  }, [spawnApi.points]);

  // スポーン点ビューワークリック → 情報モーダル表示
  const handleSpawnPointView = useCallback((id: string) => {
    setSpawnViewPointId(id);
  }, []);

  // スポーン点にアイテムを追加
  const handlePointAddItem = useCallback((pointId: string, itemId: string, playerCount: number) => {
    if (!itemId) return;
    pushSpawnHistory();
    spawnApi.updatePoint(pointId, {
      items: [...(spawnApi.points.find(p => p.id === pointId)?.items || []), { itemId, discoveredAt: new Date().toISOString(), playerCount }],
    });
    setEditAddItemId('');
    setEditAddPlayerCount(1);
  }, [spawnApi, pushSpawnHistory]);

  // スポーン点からアイテムを削除
  const handlePointRemoveItem = useCallback((pointId: string, itemIdx: number) => {
    const point = spawnApi.points.find(p => p.id === pointId);
    if (!point) return;
    pushSpawnHistory();
    const next = point.items.filter((_, i) => i !== itemIdx);
    spawnApi.updatePoint(pointId, { items: next });
  }, [spawnApi, pushSpawnHistory]);

  // アイテム登録/更新
  const handleItemSave = useCallback(() => {
    if (!itemFormName.trim()) return;
    const data = { name: itemFormName.trim(), textColor: itemFormTextColor, fans: itemFormFans, coins: itemFormCoins, description: itemFormDescription || undefined, image: itemFormImage || undefined };
    if (itemFormEditId) {
      spawnApi.updateItem(itemFormEditId, data);
    } else {
      spawnApi.addItem({ id: generateId('ritem'), ...data });
    }
    setItemFormName('');
    setItemFormDescription('');
    setItemFormImage('');
    setItemFormTextColor('blue');
    setItemFormFans(0);
    setItemFormCoins(0);
    setItemFormEditId(null);
  }, [itemFormName, itemFormDescription, itemFormImage, itemFormTextColor, itemFormFans, itemFormCoins, itemFormEditId, spawnApi]);

  // 一括インポート (同名上書き + 3列 format 対応)
  const handleBulkImport = useCallback(() => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.trim().split('\n');
    let imported = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\t');
      if (parts.length < 2) continue;
      const name = parts[0].trim();
      if (!name) continue;
      const fans = parseInt(parts[1].replace(/,/g, '')) || 0;
      let coins = 0;
      let desc: string | undefined;
      // 3列目以降を解釈: 数字ならコイン、文字なら説明とみなす
      if (parts.length >= 3) {
        const third = parts[2].trim();
        const thirdNum = parseInt(third.replace(/,/g, ''));
        if (!isNaN(thirdNum) && String(thirdNum) === third.replace(/,/g, '')) {
          coins = thirdNum;
          desc = parts.slice(3).join('\t').trim() || undefined;
        } else {
          desc = parts.slice(2).join('\t').trim() || undefined;
        }
      }
      // 同名チェック → 上書き
      const existing = spawnApi.items.find(i => i.name === name);
      if (existing) {
        spawnApi.updateItem(existing.id, { name, textColor: bulkColor, fans, coins, description: desc });
      } else {
        spawnApi.addItem({ id: generateId('ritem'), name, textColor: bulkColor, fans, coins, description: desc });
      }
      imported++;
    }
    if (imported > 0) setBulkInput('');
  }, [bulkInput, bulkColor, spawnApi]);

  // Global Walls — shared across all plans AND all users. The hook loads from
  // the `/api/global-walls` endpoint (with the static `global_walls.json` as
  // a build-time fallback for static hosts) and persists edits back to the
  // same file. `localStorage` is used as a tiny client-side cache so the
  // first paint can show walls before the network round-trip resolves, but
  // the server is the source of truth.
  const globalWallsStore = useGlobalWalls({ isLocal });
  const globalWalls = globalWallsStore.walls;
  const globalWallsRef = useRef(globalWalls);
  globalWallsRef.current = globalWalls;
  const updateGlobalWalls = (next: Record<string, any>) => {
    globalWallsStore.replace(next as any);
  };

  const handleLockedWallsChange = useCallback((newLocked: LockedWallSegment[]) => {
    setLockedWalls(prev => ({ ...prev, [currentFloor]: newLocked }));
  }, [currentFloor]);

  const historyApiRef = useRef<any>(null);

  const routeApi = useRoute({
    isLocal,
    globalDefaultsRef,
    globalMarkersStore,
    showNotification: notification.show,
    initialMarkerScale: markerScale,
    onMarkerScaleChange: (s) => {
      setMarkerScale(s);
      localStorage.setItem('heist_marker_scale', String(s));
    },
    autoSaveEnabled,
    autoSaveInterval,
    onLoadSuccess: () => {
      historyApiRef.current?.clearHistory();
    }
  });

  const routeRef = useRef(routeApi.route);
  routeRef.current = routeApi.route;

  // === サブウィンドウ (ブラウザツールバーなしの別ウィンドウ) ===
  const openSubWindow = () => {
    const w = window.open(
      window.location.href,
      '_blank',
      'menubar=no,toolbar=no,location=no,status=no,width=1280,height=800'
    );
    if (!w) {
      notification.show('⚠️ ポップアップブロックを解除してください');
    }
  };


  // Migration: if globalWalls is empty but route has walls, migrate them
  useEffect(() => {
    const gw = globalWallsRef.current;
    const hasGlobalWalls = Object.values(gw).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    if (!hasGlobalWalls) {
      const routeWalls = routeApi.route.walls;
      if (routeWalls) {
        const hasRouteWalls = Object.values(routeWalls).some((arr: any) => Array.isArray(arr) && arr.length > 0);
        if (hasRouteWalls) {
          console.log('[Walls Migration] Migrating walls from route to global:', routeWalls);
          updateGlobalWalls(routeWalls as any);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ロードモーダルを開いた時にプリセットをメモリにロード、
  // 閉じた時にメモリから破棄する (= プリセットの routeData が巨大なので
  // 必要な時だけ展開することでメモリを節約する)
  useEffect(() => {
    if (presetListVisible) {
      routeApi.ensurePresetsLoaded();
    } else if (routeApi.presetsLoaded) {
      routeApi.releasePresets();
    }
  }, [presetListVisible, routeApi]);

  // 編集中は input 制御用のローカル state を持つ。初期値は route.author の平文 (=空文字も許容)。
  // 編集中の route.author の変化 (= 他 useEffect からの更新) では上書きしない (= 入力中の値を保護)。
  // route.id が変わった (= 別ルートに切り替わった) ときだけ再同期。
  // 注: AUTHOR_DEFAULT_PLAIN ('No name') を初期値や未入力時の代用に使ってはならない。
  // 空文字と 'No name' は別物。 ユーザーが空文字で送信 (= blur) した時に route.author を
  // 'No name' に正規化するのは別ロジックで行う。
  const [authorEdit, setAuthorEdit] = useState<string>(routeApi.route.author || '');
  useEffect(() => {
    // route.id 変化時のみ再同期 (= 別ルートに切り替わった)。 route.author の変化では触らない。
    setAuthorEdit(routeApi.route.author || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeApi.route.id]);

  const globalDefaults = useGlobalDefaults(globalDefaultsRef, (gd) => {
    setDefaultsLoaded(true);
    routeApi.setRouteWithGlobalDefaults(prev => ({
      ...prev,
      hiddenMarkers: [...new Set([...(prev.hiddenMarkers || []), ...(gd.hiddenMarkers || [])])],
      hiddenMarkerTypes: [...new Set([...(prev.hiddenMarkerTypes || []), ...(gd.hiddenMarkerTypes || [])])]
    }));
    if (gd.stopMarkerThreshold !== undefined) {
      setStopMarkerThresholdState(gd.stopMarkerThreshold);
    }
    if (gd.movementMarkerThreshold !== undefined) {
      setMovementMarkerThresholdState(gd.movementMarkerThreshold);
    }
    if (gd.warpMarkerThreshold !== undefined) {
      setWarpMarkerThresholdState(gd.warpMarkerThreshold);
    }
    if (gd.skillCdThreshold !== undefined) {
      setSkillCdThresholdState(gd.skillCdThreshold);
    }
  }, { isLocal });
  const globalsLoaded = globalDefaults.loaded;

  const memoizedStrokes = useMemo(
    () => normalizeStrokes(routeApi.route.strokes[currentFloor]),
    [routeApi.route.strokes, currentFloor]
  );

  const historyApi = useHistory({
    getRoute: () => routeApi.route,
    getGlobalMarkers: () => globalMarkersStore.globalMarkers,
    getWalls: () => globalWallsRef.current as any,
    getLockedWalls: () => lockedWalls,
    replaceRoute: routeApi._replaceRoute,
    replaceGlobalMarkers: globalMarkersStore.replace,
    replaceWalls: updateGlobalWalls as any,
    replaceLockedWalls: (next) => setLockedWalls(next),
    persistGlobalMarkers: (markers) => {
      if (Array.isArray(markers) && markers.length > 0) {
        localStorage.setItem('heist_global_markers', JSON.stringify(markers));
        if (isLocal) {
          fetch(`${import.meta.env.BASE_URL}api/global-markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(markers)
          }).catch(() => { });
        }
      }
    },
    onRestore: () => {
      setActiveMarkerType(null);
    }
  });
  historyApiRef.current = historyApi;

  const autoRoute = useAutoRoute();

  // Auto-route 起動中に「新規作成 / セーブ読込 / インポート」が走ると、
  // 古いルートを参照し続けたまま再生を続けようとして不整合になる。
  // ルートを書き換える前に必ずリセットを送り、再生状態を停止させる。
  const autoRouteRef = useRef(autoRoute);
  autoRouteRef.current = autoRoute;
  const stopAutoRouteIfActive = useCallback(() => {
    if (autoRouteRef.current.status.active) {
      autoRouteRef.current.sendCommand('reset');
    }
  }, []);

  const fileIO = useFileIO({
    routeApi,
    globalMarkersStore,
    markerScale,
    showNotification: notification.show,
    onBeforeLoad: stopAutoRouteIfActive,
    onLoadSuccess: () => {
      historyApi.clearHistory();
    }
  });

  useKeyboardShortcuts({
    onDeleteSelected: () => {
      const cur = routeApi.route.strokes[currentFloor];
      if (!cur) return;
      const sel = toolMode === 'edit-stroke' ? editStrokeIdxs : measureSelectedStrokeIdxs;
      if (sel.size === 0) return;
      historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
      const next = cur.filter((_, i) => !sel.has(i));
      updateStrokes(next);
      if (toolMode === 'edit-stroke') setEditStrokeIdxs(new Set());
      else setMeasureSelectedStrokeIdxs(new Set());
      notification.show(t('{0}本の線を削除しました', String(sel.size)));
    },
    onToggleEditMode: () => setIsEditMode(prev => {
      const next = !prev;
      if (next === false) setToolMode('move');
      return next;
    }),
    onToggleLeftSidebar: () => setLeftSidebarCollapsed(prev => !prev),
    onToggleRightSidebar: () => setRightSidebarCollapsed(prev => !prev),
    hasOpenModal: showHelpModal,
    onCloseModal: () => setShowHelpModal(false)
  });

  // --- Cross-cutting handlers (coordinate multiple stores) ---

  const updateStrokes = useCallback(async (newStrokes: DrawingStroke[]) => {
    const strokesData = routeRef.current.strokes as any;
    const prevStrokes = strokesData[currentFloor] || [];

    if (newStrokes.length > prevStrokes.length) {
      const addedStroke = newStrokes[newStrokes.length - 1];

      const pts = addedStroke.points;

      // OFF (default) = walls ignored: the line is accepted as-is. The
      // wall layer is purely a visual reference; the user is in full
      // control of where the line goes. When bypassWallsEnabled is ON, we
      // always run the A* detour finder to calculate the mathematically shortest path.
      if (!bypassWallsEnabled) {
        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
        routeApi.setRoute(prev => ({
          ...prev,
          strokes: { ...prev.strokes, [currentFloor]: newStrokes }
        }));
        return;
      }

      // Check if the drawn line actually intersects any walls on the current floor first.
      // If it doesn't cross any walls, we keep the user's drawn stroke exactly as-is.
      const allWalls = globalWallsRef.current as any;
      const floorWalls = allWalls[currentFloor] || [];
      let intersectsAnyWall = false;

      const { isIntersecting } = await import('./utils/PathFinder');
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        for (const w of floorWalls) {
          if (isIntersecting(p1, p2, w[0], w[1], 4.0)) {
            intersectsAnyWall = true;
            break;
          }
        }
        if (intersectsAnyWall) break;
      }

      if (!intersectsAnyWall) {
        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
        routeApi.setRoute(prev => ({
          ...prev,
          strokes: { ...prev.strokes, [currentFloor]: newStrokes }
        }));
        return;
      }
      const startNode = { x: pts[0].x, y: pts[0].y, floor: currentFloor };
      const endNode = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, floor: currentFloor };

      // Filter out hidden markers (ID-based and Type-based) so they are ignored by the pathfinder,
      // EXCEPT for 'goal' markers and any hidden portal markers that are targets of links from visible portals.
      const hiddenIds = new Set(routeRef.current.hiddenMarkers || []);
      const hiddenTypes = new Set(routeRef.current.hiddenMarkerTypes || []);



      const rawMarkers = [...globalMarkersStore.globalMarkers, ...routeRef.current.markers];
      // Collect IDs of destinations of portals that are NOT hidden
      const activeDestinations = new Set<string>();
      rawMarkers.forEach(m => {
        const isHidden = hiddenIds.has(m.id) || hiddenTypes.has(m.type);
        if (!isHidden && (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId) {
          activeDestinations.add(m.linkedWarpId);
        }
      });

      const allMarkers = rawMarkers.filter(m => {
        if (m.type === 'goal') return true; // Always allow exit (goal) markers
        if (activeDestinations.has(m.id)) return true; // Keep destination portal even if hidden
        if (hiddenIds.has(m.id)) return false;
        if (hiddenTypes.has(m.type)) return false;
        return true;
      });

      // Show loading notification first
      notification.show(t('壁を迂回するルートを計算中...'));

      // Yield thread using setTimeout to ensure the loading notification is rendered on screen
      setTimeout(async () => {
        const { findBypassingPath } = await import('./utils/PathFinder');
        const pathfindStartTime = performance.now();

        historyApi.pushHistory(routeRef.current.strokes, routeRef.current.markers, globalMarkersStore.globalMarkers);

        let finalPath: { x: number; y: number; floor: string; isPortal?: boolean; portalName?: string; markerId?: string }[] = [];
        let finalTeleportIndices: number[] = [];
        let pathfindSuccess = true;
        let statsToReturn: any = { details: [] };

        if (bypassShortestOnly) {
          // 1. Shortest Search mode (original behavior)
          const { path, teleportIndices, portalStats } = findBypassingPath(startNode, endNode, allWalls, allMarkers, hiddenIds, hiddenTypes);
          statsToReturn = portalStats;
          if (path && path.length >= 2) {
            finalPath = path;
            finalTeleportIndices = teleportIndices;
          } else {
            pathfindSuccess = false;
          }
        } else {
          // 2. Maintain Path mode (Guide-following Global Search):
          // Instead of isolating segments, we perform a single global Dijkstra detour search from start to end,
          // passing the entire user stroke (pts) as guidePoints. The pathfinder will tightly cling to this line
          // wherever possible but detour through warps or doors when blocked, solving all room-crossing issues cleanly.
          const { path, teleportIndices, portalStats } = findBypassingPath(startNode, endNode, allWalls, allMarkers, hiddenIds, hiddenTypes, pts);
          statsToReturn = portalStats;
          if (path && path.length >= 2) {
            finalPath = path;
            finalTeleportIndices = teleportIndices;
          } else {
            pathfindSuccess = false;
          }
        }

        const pathfindElapsed = Math.round(performance.now() - pathfindStartTime);

        if (pathfindSuccess && finalPath.length >= 2) {
          // Use teleportIndices to split path into segments.
          const teleportSet = new Set(finalTeleportIndices);
          const segments: { floor: string; points: { x: number; y: number }[] }[] = [];
          let seg: { x: number; y: number }[] = [];
          let segFloor = finalPath[0].floor;

          for (let i = 0; i < finalPath.length; i++) {
            seg.push({ x: finalPath[i].x, y: finalPath[i].y });

            if (teleportSet.has(i)) {
              // teleport. End segment here.
              if (seg.length >= 2) {
                segments.push({ floor: segFloor, points: seg });
              }
              seg = []; // next iteration will start fresh segment
              if (i + 1 < finalPath.length) segFloor = finalPath[i + 1].floor;
            }
          }
          if (seg.length >= 2) {
            segments.push({ floor: segFloor, points: seg });
          }

          console.log('[Bypass] segments:', segments.length, 'teleports:', finalTeleportIndices.length);

          routeApi.setRoute(prev => {
            const nextStrokes = { ...prev.strokes } as Record<string, DrawingStroke[]>;

            segments.forEach((s, si) => {
              const fl = s.floor;
              const base = si === 0 && fl === currentFloor
                ? newStrokes.slice(0, -1)
                : (nextStrokes[fl] || []);

              nextStrokes[fl] = [
                ...(si === 0 ? base : (nextStrokes[fl] || [])),
                {
                  ...addedStroke,
                  points: s.points,
                  originalPoints: s.points
                }
              ];
            });
            return { ...prev, strokes: nextStrokes as any };
          });

          notification.show(t('壁を迂回するルートを自動生成しました ({0}ms)', String(pathfindElapsed)) + t(' / 最大 500ms'));
        } else {
          const isolated = statsToReturn.details.filter((p: any) => p.edges === 0).map((p: any) => p.name);
          let errorMsg = t('壁を越えて迂回する経路が見つかりません ({0}ms)。操作をキャンセルしました。', String(pathfindElapsed));
          if (isolated.length > 0) {
            errorMsg += t(' 🚫接続口がブロックされています: ') + isolated.slice(0, 3).join(', ');
          }
          notification.show(errorMsg);

          // Force redraw of canvas by changing strokes reference so MapCanvas's
          // strokes useEffect (which clears and redraws the canvas) fires.
          routeApi.setRoute(prev => ({ ...prev, strokes: { ...prev.strokes } }));
        }
      }, 50);
      return;
    }

    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
    routeApi.setRoute(prev => ({
      ...prev,
      strokes: { ...prev.strokes, [currentFloor]: newStrokes }
    }));
  }, [bypassWallsEnabled, bypassShortestOnly]);

  const updateMarkers = (newMarkers: HeistMarker[], shouldPushHistory = false, options: { isDelete?: boolean } = {}) => {
    if (shouldPushHistory) {
      historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
    }
    const isIndivType = (type: string) =>
      ['start', 'p1', 'p2', 'p3', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'checkpoint', 'skill_cd'].includes(type);
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

    // ピン追加モード中に新しく追加された場合、誤設置防止のために移動モードに戻す
    const currentTotalCount = routeApi.route.markers.length + globalMarkersStore.globalMarkers.length;
    if (toolMode === 'add-marker' && newMarkers.length > currentTotalCount) {
      setToolMode('move');
    }

    // ルートは display state (indiv マーカー + hidden リスト) のみ保持。
    routeApi.setRoute(prev => ({ ...prev, markers: newIndividual }));
  };

  function postGlobalDefaults(
    hiddenMarkers: string[],
    hiddenMarkerTypes: string[],
    stopTh?: number,
    moveTh?: number,
    warpTh?: number,
    skillTh?: number
  ) {
    const sTh = stopTh !== undefined ? stopTh : stopMarkerThreshold;
    const mTh = moveTh !== undefined ? moveTh : movementMarkerThreshold;
    const wTh = warpTh !== undefined ? warpTh : warpMarkerThreshold;
    const skTh = skillTh !== undefined ? skillTh : skillCdThreshold;

    globalDefaultsRef.current = {
      ...globalDefaultsRef.current,
      hiddenMarkers,
      hiddenMarkerTypes,
      stopMarkerThreshold: sTh,
      movementMarkerThreshold: mTh,
      warpMarkerThreshold: wTh,
      skillCdThreshold: skTh
    };

    if (isLocal) {
      fetch(`${import.meta.env.BASE_URL}api/global-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiddenMarkers,
          hiddenMarkerTypes,
          startupFocusMarkerId: globalDefaultsRef.current.startupFocusMarkerId,
          stopMarkerThreshold: sTh,
          movementMarkerThreshold: mTh,
          warpMarkerThreshold: wTh,
          skillCdThreshold: skTh
        })
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
  const handleToggleMarkerVisibility = (markerId: string) => {
    const current = routeApi.route.hiddenMarkers || [];
    const nextHidden = current.includes(markerId)
      ? current.filter(id => id !== markerId)
      : [...current, markerId];
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

  const MAX_MARKERS_WARN = 300;
  const prevMarkerCountRef = useRef(0);
  useEffect(() => {
    const total = routeApi.route.markers.length + globalMarkersStore.globalMarkers.length;
    if (total > MAX_MARKERS_WARN && prevMarkerCountRef.current <= MAX_MARKERS_WARN) {
      notification.show(t('⚠ ピン数が{0}個あります。負荷が高くなる可能性があります', total), 4000);
    }
    prevMarkerCountRef.current = total;
  }, [routeApi.route.markers.length, globalMarkersStore.globalMarkers.length]);

  // Load presets, help data, and auto-load last route on startup.
  useEffect(() => {
    localStorage.setItem('heist_global_markers_migrated_v2', 'true');
    routeApi.refreshSavesList();
    fetchHelpData().then(data => setHelpTexts(data));

    if (autoLoadLastRoute) {
      const lastId = localStorage.getItem('heist_last_used_route_id');
      if (lastId) {
        try {
          // loadFromLocal 経由でロード (カスタムBG の IndexedDB 自動復元も行う)
          // 注意: loadFromLocal は内部で通知を出すため、 ここでは追加通知しない
          routeApi.loadFromLocal(lastId);
        } catch (e) {
          console.error('Auto-load failed: corrupted route data, clearing last-used ID', e);
          try { localStorage.removeItem('heist_last_used_route_id'); } catch { }
          notification.show(t('前回データの読み込みに失敗しました（デフォルトを使用）'), 3000);
        }
      }
    }

    // Fetch presets: try dev server API first, then static file, then legacy fallback
    // サーバから取得したプリセットの実体は重複を避けるため localStorage に
    // 保存しない (= setPresets(_, { fromServer: true }) でメタのみ保持)。
    // さらに、サーバ取得が成功した時点で「サーバ由来 (=重複)」の body キーを
    // 削除する。サーバにない (=ユーザがローカルで作成) の body は残す。
    const purgeServerPresetBodies = (serverPresets: PresetData[]) => {
      const serverIds = new Set(serverPresets.map(p => p.id));
      let removed = 0;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('heist_preset_body_')) {
          const id = k.replace('heist_preset_body_', '');
          if (serverIds.has(id)) {
            try { localStorage.removeItem(k); removed++; } catch { /* ignore */ }
          }
        }
      }
      return removed;
    };
    fetch(`${import.meta.env.BASE_URL}api/presets`)
      .then(res => res.ok ? res.json() : [])
      .then((data: PresetData[]) => {
        const normalized = normalizePresets(data);
        if (normalized.length > 0) {
          routeApi.setPresets(normalized, { fromServer: true });
          const removed = purgeServerPresetBodies(normalized);
          if (removed > 0) {
            notification.show(`プリセット本体の重複データを ${removed} 件削除しました`);
          }
          return;
        }
        // Fallback: try loading from static presets.json (shipped with dist build)
        fetch(`${import.meta.env.BASE_URL}presets.json`)
          .then(res => res.ok ? res.json() : [])
          .then((staticPresets: PresetData[]) => {
            const normalizedStatic = normalizePresets(staticPresets);
            if (normalizedStatic.length > 0) {
              routeApi.setPresets(normalizedStatic, { fromServer: true });
              const removed = purgeServerPresetBodies(normalizedStatic);
              if (removed > 0) {
                notification.show(`プリセット本体の重複データを ${removed} 件削除しました`);
              }
              return;
            }
            // Legacy fallback: try old default_preset.json (single route)
            fetch(`${import.meta.env.BASE_URL}api/default-preset`)
              .then(res => res.ok ? res.json() : null)
              .then((oldPreset: RouteData | null) => {
                if (oldPreset) {
                  routeApi.saveAsPreset({
                    name: oldPreset.title || 'Default Preset',
                    description: '',
                    author: '',
                    renderCache: '',
                    visibility: 'public'
                  });
                }
              })
              .catch(() => { });
          })
          .catch(() => { });
        const savesList = DataManager.getSavesList();
        if (savesList.length === 0) {
          fetch(`${import.meta.env.BASE_URL}default_preset.json`)
            .then(res => res.ok ? res.json() : null)
            .then((d: RouteData | null) => {
              if (d) {
                const { data: migrated, result, legacyMigrated } = migrateLoadedRoute(d);
                if (result.unknown) {
                  notification.show(
                    t('⚠️ 未登録バージョンのデフォルトプリセットです (v{0})', result.unknownVersion ?? ''),
                    5000
                  );
                } else if (legacyMigrated || result.applied.length > 0) {
                  notification.show(
                    t('デフォルトプリセットをマイグレーションしました (→ v{0})', result.finalVersion || migrated.saveDataVersion || '?'),
                    3000
                  );
                }
                routeApi.setRouteWithGlobalDefaults({ ...migrated, id: 'default' });
              }
            })
            .catch(() => { });
        }
      })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL parameter auto-open: ?preset=ID or ?save=ID
  const urlParamsHandledRef = useRef(false);
  useEffect(() => {
    if (urlParamsHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const presetId = params.get('preset');
    const saveId = params.get('save');

    if (saveId) {
      const data = DataManager.loadFromLocalStorage(saveId);
      if (!data) {
        notification.show(`${t('セーブデータが見つかりません: ')}${saveId}`, 3000);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      urlParamsHandledRef.current = true;
      setUrlLoadConfirm({ type: 'save', id: saveId, name: data.title });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (!presetId) return;

    // プリセットがメモリにない場合、先にensurePresetsLoadedでロードする
    let presets = routeApi.ensurePresetsLoaded();
    if (presets.length === 0) {
      // localStorageにもなければサーバから取得
      fetch(`${import.meta.env.BASE_URL}presets.json`)
        .then(r => r.ok ? r.json() : [])
        .then((fromServer: PresetData[]) => {
          const normalized = normalizePresets(fromServer);
          if (normalized.length > 0) {
            routeApi.setPresets(normalized, { fromServer: true });
            presets = normalized;
            showConfirmForPreset(presetId, normalized);
          }
        })
        .catch(() => { });
      return;
    }
    showConfirmForPreset(presetId, presets);

    function showConfirmForPreset(id: string, list: PresetData[]) {
      const access = routeApi.checkPresetUrlAccess(id);
      if (!access.allowed) {
        if (access.reason === 'not_found') {
          notification.show(`${t('プリセットが見つかりません: ')}${id}`, 3000);
        } else if (access.reason === 'private_prod') {
          notification.show(t('このプリセットは非公開です。ローカルモード (npm run dev) でのみ開けます。'), 4000);
        } else {
          notification.show(t('このプリセットを開くことができません'), 3000);
        }
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const preset = list.find(p => p.id === id);
      if (!preset) {
        notification.show(`${t('プリセットが見つかりません: ')}${id}`, 3000);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      urlParamsHandledRef.current = true;
      setUrlLoadConfirm({ type: 'preset', id, name: preset.name });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Startup focus: auto-pan to a configured marker on app load.
  // Note: `globalDefaultsRef.current.startupFocusMarkerId` is a ref, so the
  // effect must also depend on `defaultsLoaded` — otherwise, when
  // `global_markers.json` resolves BEFORE `global_defaults.json` (common in
  // production with slower/cached responses), the effect runs once with
  // markers present but the target ID still undefined, returns early, and
  // never re-runs after the defaults arrive (the ref change doesn't trigger
  // a re-render, and `route.markers` reference is unchanged by the
  // onLoad → setRouteWithGlobalDefaults path).
  const startupFocusedRef = useRef(false);
  useEffect(() => {
    if (startupFocusedRef.current) return;
    if (!globalsLoaded) return;
    if (globalMarkersStore.globalMarkers.length === 0) return;
    const targetId = globalDefaultsRef.current.startupFocusMarkerId;
    if (!targetId) return;
    const exists =
      globalMarkersStore.globalMarkers.some(m => m.id === targetId) ||
      routeApi.route.markers.some(m => m.id === targetId);
    if (!exists) return;
    startupFocusedRef.current = true;
    setTimeout(() => setFocusTrigger({ id: targetId, timestamp: Date.now() }), 300);
  }, [globalMarkersStore.globalMarkers, routeApi.route.markers, globalsLoaded]);

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


  const handleSaveModalExport = useCallback((params: SaveModalExportParams) => {
    if (params.mode === 'png') {
      fileIO.exportPNG({ floor: currentFloor, canvas: canvasRef.current, svgString, skipDataBar: !params.dataBar, lineThickness: params.lineThickness });
    }
  }, [currentFloor, svgString, fileIO]);

  const handleExportPlayData = () => {
    const raw = localStorage.getItem(PLAY_DATA_KEY);
    if (!raw) { notification.show(t('エクスポートするプレイデータがありません')); return; }
    try {
      const parsed = JSON.parse(raw);
      const { records, ...exportData } = parsed;
      const date = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nikukyuu_playdata_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notification.show(t('プレイデータをエクスポートしました'));
    } catch {
      notification.show(t('エクスポートに失敗しました'));
    }
  };

  const handleImportPlayData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (playDataImportRef.current) playDataImportRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (!imported || typeof imported !== 'object') { notification.show(t('無効なファイル形式です')); return; }
        const existing = localStorage.getItem(PLAY_DATA_KEY);
        const current = existing ? JSON.parse(existing) : {};
        const merged = { ...current, ...imported };
        localStorage.setItem(PLAY_DATA_KEY, JSON.stringify(merged));
        setPlayDataRefreshKey(k => k + 1);
        notification.show(t('プレイデータをインポートしました'));
      } catch {
        notification.show(t('ファイルの読み込みに失敗しました'));
      }
    };
    reader.readAsText(file);
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

  const handleDeleteFromLocal = (id: string) => {
    if (deleteConfirmId === id) {
      routeApi.deleteFromLocal({ stopPropagation: () => { } } as React.MouseEvent, id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleHiddenPreset = (id: string) => {
    setHiddenPresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const createNewPlan = () => {
    if (!newPlanConfirm) {
      setNewPlanConfirm(true);
      setTimeout(() => setNewPlanConfirm(false), 3000);
      return;
    }
    setNewPlanConfirm(false);
    stopAutoRouteIfActive();
    routeApi.createNewPlan();
  };

  // Quick-add current save as a preset
  // visibility: 公開レベル ('public' | 'unlisted' | 'private')。未指定なら public。
  const handleQuickPreset = async (s: SaveInfo, visibility: PresetVisibility = 'public') => {
    const save = DataManager.loadFromLocalStorage(s.id);
    if (!save) return;
    const toSave: RouteData = { ...save, mapVersion: 2, markerScale };
    const newPreset: PresetData = {
      id: generateId('preset'),
      name: save.title,
      description: save.description || '',
      targetCash: save.targetCash || '',
      targetCoins: save.targetCoins || '',
      author: save.author || '',
      renderCache: save.renderCache || '',
      updatedAt: Date.now(),
      visibility: normalizePresetVisibility(visibility)
      // 実体 (routeData) は別キーに保存するためここには含めない
    };
    // 実体を別キーに保存 (容量削減)
    try { savePresetBody(newPreset.id, toSave); } catch (e) {
      console.error('savePresetBody (quick) failed', e);
      notification.show('プリセット本体の保存に失敗しました');
      return;
    }
    fetch(`${import.meta.env.BASE_URL}api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([...routeApi.presets, newPreset])
    }).catch(() => { });
    routeApi.setPresets([...routeApi.presets, newPreset]);
    notification.show(`${t('プリセット追加: ')}${newPreset.name}`);
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
          gridTemplateColumns: isMobile
            ? '0 1fr 0'
            : `${leftSidebarCollapsed ? '0px' : '280px'} 1fr ${rightSidebarCollapsed ? '0px' : '340px'}`
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
        <LeftSidebar
          routeApi={routeApi}
          globalMarkersStore={globalMarkersStore}
          historyApi={historyApi}
          spawnApi={spawnApi}
          globalWalls={globalWalls}
          notification={notification}
          canvasRef={canvasRef}
          isEditMode={isEditMode}
          setIsEditMode={setIsEditMode}
          toolMode={toolMode}
          setToolMode={setToolMode}
          isLocal={isLocal}
          currentFloor={currentFloor}
          showSpawnFeature={showSpawnFeature}
          showSpawnEditFeature={showSpawnEditFeature}
          showSettingsExpanded={showSettingsExpanded}
          setShowSettingsExpanded={setShowSettingsExpanded}
          markerVisibilityExpanded={markerVisibilityExpanded}
          setMarkerVisibilityExpanded={setMarkerVisibilityExpanded}
          floorNavCollapsed={floorNavCollapsed}
          setFloorNavCollapsed={setFloorNavCollapsed}
          showMarkerLabels={showMarkerLabels}
          setShowMarkerLabels={setShowMarkerLabels}
          markerScale={markerScale}
          setMarkerScale={setMarkerScale}
          textPinPassThrough={textPinPassThrough}
          setTextPinPassThrough={setTextPinPassThrough}
          drawerPinPassThrough={drawerPinPassThrough}
          setDrawerPinPassThrough={setDrawerPinPassThrough}
          showPhoneCompass={showPhoneCompass}
          setShowPhoneCompass={setShowPhoneCompass}
          showPhoneBoxHud={showPhoneBoxHud}
          setShowPhoneBoxHud={setShowPhoneBoxHud}
          phoneBoxHudSize={phoneBoxHudSize}
          setPhoneBoxHudSize={setPhoneBoxHudSize}
          showBottomRightHud={showBottomRightHud}
          setShowBottomRightHud={setShowBottomRightHud}
          zoomHudSize={zoomHudSize}
          setZoomHudSize={setZoomHudSize}
          editStrokeIdxs={editStrokeIdxs}
          setEditStrokeIdxs={setEditStrokeIdxs}
          editSmoothIterations={editSmoothIterations}
          setEditSmoothIterations={setEditSmoothIterations}
          blockMarkerClicksDuringTools={blockMarkerClicksDuringTools}
          setBlockMarkerClicksDuringTools={setBlockMarkerClicksDuringTools}
          isAltPressed={isAltPressed}
          activeMarkerType={activeMarkerType}
          setActiveMarkerType={setActiveMarkerType}
          measureSelectedStrokeIdxs={measureSelectedStrokeIdxs}
          setMeasureSelectedStrokeIdxs={setMeasureSelectedStrokeIdxs}
          eraseTarget={eraseTarget}
          setEraseTarget={setEraseTarget}
          eraseSize={eraseSize}
          setEraseSize={setEraseSize}
          eraseDefaultBehavior={eraseDefaultBehavior}
          setEraseDefaultBehavior={setEraseDefaultBehavior}
          hideStrokesDuringWalls={hideStrokesDuringWalls}
          setHideStrokesDuringWalls={setHideStrokesDuringWalls}
          hideMarkersDuringWalls={hideMarkersDuringWalls}
          setHideMarkersDuringWalls={setHideMarkersDuringWalls}
          bypassWallsEnabled={bypassWallsEnabled}
          setBypassWallsEnabled={setBypassWallsEnabled}
          bypassShortestOnly={bypassShortestOnly}
          setBypassShortestOnly={setBypassShortestOnly}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          strokeType={strokeType}
          setStrokeType={setStrokeType}
          drawMode={drawMode}
          setDrawMode={setDrawMode}
          setCurrentPosTrigger={setCurrentPosTrigger}
          setFocusTrigger={setFocusTrigger}
          resetTarget={resetTarget}
          setResetTarget={setResetTarget}
          spawnToolMode={spawnToolMode}
          setSpawnToolMode={setSpawnToolMode}
          spawnPlaceCategory={spawnPlaceCategory}
          setSpawnPlaceCategory={setSpawnPlaceCategory}
          spawnAutoEdit={spawnAutoEdit}
          setSpawnAutoEdit={setSpawnAutoEdit}
          spawnPointSize={spawnPointSize}
          setSpawnPointSize={setSpawnPointSize}
          spawnGridSnap={spawnGridSnap}
          setSpawnGridSnap={setSpawnGridSnap}
          spawnMoveX={spawnMoveX}
          setSpawnMoveX={setSpawnMoveX}
          spawnMoveY={spawnMoveY}
          setSpawnMoveY={setSpawnMoveY}
          spawnMovingPointId={spawnMovingPointId}
          setSpawnMovingPointId={setSpawnMovingPointId}
          spawnViewPointId={spawnViewPointId}
          setSpawnViewPointId={setSpawnViewPointId}
          viewerFilterPlayers={viewerFilterPlayers}
          setViewerFilterPlayers={setViewerFilterPlayers}
          spawnHideOther={spawnHideOther}
          setSpawnHideOther={setSpawnHideOther}
          spawnHideBg={spawnHideBg}
          setSpawnHideBg={setSpawnHideBg}
          spawnFocusTrigger={spawnFocusTrigger}
          setSpawnFocusTrigger={setSpawnFocusTrigger}
          editPointId={editPointId}
          setEditPointId={setEditPointId}
          showEditModal={showEditModal}
          setShowEditModal={setShowEditModal}
          editAddItemId={editAddItemId}
          setEditAddItemId={setEditAddItemId}
          editAddPlayerCount={editAddPlayerCount}
          setEditAddPlayerCount={setEditAddPlayerCount}
          itemFormName={itemFormName}
          setItemFormName={setItemFormName}
          itemFormTextColor={itemFormTextColor}
          setItemFormTextColor={setItemFormTextColor}
          itemFormFans={itemFormFans}
          setItemFormFans={setItemFormFans}
          itemFormCoins={itemFormCoins}
          setItemFormCoins={setItemFormCoins}
          itemFormEditId={itemFormEditId}
          setItemFormEditId={setItemFormEditId}
          itemFormDescription={itemFormDescription}
          setItemFormDescription={setItemFormDescription}
          showItemModal={showItemModal}
          setShowItemModal={setShowItemModal}
          bulkInput={bulkInput}
          setBulkInput={setBulkInput}
          bulkColor={bulkColor}
          setBulkColor={setBulkColor}
          itemFormImage={itemFormImage}
          setItemFormImage={setItemFormImage}
          globalMarkerListExpanded={globalMarkerListExpanded}
          setGlobalMarkerListExpanded={setGlobalMarkerListExpanded}
          localMarkerListExpanded={localMarkerListExpanded}
          setLocalMarkerListExpanded={setLocalMarkerListExpanded}
          hideRouteLines={hideRouteLines}
          setHideRouteLines={setHideRouteLines}
          routeLines1px={routeLines1px}
          setRouteLines1px={setRouteLines1px}
          hideBranchLines={hideBranchLines}
          setHideBranchLines={setHideBranchLines}
          branchLines1px={branchLines1px}
          setBranchLines1px={setBranchLines1px}
          showHelpModal={showHelpModal}
          setShowHelpModal={setShowHelpModal}
          showOcrDebugModal={showOcrDebugModal}
          rightTab={rightTab}
          handleHideGlobalMarker={handleHideGlobalMarker}
          handleShowGlobalMarker={handleShowGlobalMarker}
          handleHideGlobalMarkerType={handleHideGlobalMarkerType}
          handleShowGlobalMarkerType={handleShowGlobalMarkerType}
          handleToggleMarkerVisibility={handleToggleMarkerVisibility}
          updateStrokes={updateStrokes}
          updateGlobalWalls={updateGlobalWalls}
          postGlobalDefaults={postGlobalDefaults}
          openSubWindow={openSubWindow}
          pushSpawnHistory={pushSpawnHistory}
          undoPoints={undoPoints}
          redoPoints={redoPoints}
          handleSpawnPointAdd={handleSpawnPointAdd}
          handleSpawnPointEdit={handleSpawnPointEdit}
          handleSpawnPointView={handleSpawnPointView}
          handleSpawnMoveComplete={handleSpawnMoveComplete}
          handlePointAddItem={handlePointAddItem}
          handlePointRemoveItem={handlePointRemoveItem}
          handleItemSave={handleItemSave}
          handleBulkImport={handleBulkImport}
          handleItemImageUpload={handleItemImageUpload}
          warpColor={warpColor}
          stairsColor={stairsColor}
          memoizedStrokes={memoizedStrokes}
          leftSidebarCollapsed={leftSidebarCollapsed}
          isMobile={isMobile}
          itemImageInputRef={itemImageInputRef}
          spawnUndoRef={spawnUndoRef}
          spawnRedoRef={spawnRedoRef}
          onHighlightCategoriesChange={(cats: string[]) => setSpawnHighlightCategories(cats.length > 0 ? cats : null)}
          onHighlightItemIdsChange={(ids: string[]) => setSpawnHighlightItemIds(ids.length > 0 ? ids : null)}
          onOpenPoolSettings={() => setRightTab('play')}
          wallSubMode={wallSubMode}
          setWallSubMode={setWallSubMode}
          wallAutoSnap={wallAutoSnap}
          setWallAutoSnap={setWallAutoSnap}
          lockedWalls={lockedWalls}
          setLockedWalls={setLockedWalls}
          wallLockedSubMode={wallLockedSubMode}
          setWallLockedSubMode={setWallLockedSubMode}
          selectedTexture={selectedTexture}
          setSelectedTexture={setSelectedTexture}
          selectedRepeat={selectedRepeat}
          setSelectedRepeat={setSelectedRepeat}
          texturesList={texturesList}
        />
        {/* Map area */}
        <section style={{ position: 'relative', minWidth: 0, minHeight: 0, gridColumn: 2 }}>
          {useMemo(() => (
            <MapCanvas
              floor={currentFloor}
              strokes={memoizedStrokes}
              markers={((rightTab === 'spawn' || toolMode === 'add-spawn') && spawnHideOther) ? [] : [...globalMarkersStore.globalMarkers, ...routeApi.route.markers]}
              customBg={routeApi.route.customBg[currentFloor] ?? null}
              bgOffset={routeApi.route.bgOffset ?? { x: 0, y: 0 }}
              bgScale={routeApi.route.bgScale ?? { x: 1, y: 1 }}
              toolMode={toolMode}
              selectedTexture={selectedTexture}
              selectedRepeat={selectedRepeat}
              activeMarkerType={activeMarkerType}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              strokeType={strokeType}
              drawMode={drawMode}
              onStrokesChange={updateStrokes}
              onMarkersChange={updateMarkers}
              hideStrokesDuringWalls={hideStrokesDuringWalls}
              hideMarkersDuringWalls={hideMarkersDuringWalls}
              walls={globalWalls[currentFloor] || []}
              onWallsChange={(newWalls) => {
                const prevWalls = JSON.parse(JSON.stringify(globalWalls));
                const nextWalls = {
                  ...globalWalls,
                  [currentFloor]: newWalls
                };
                historyApi.pushHistory(
                  routeRef.current.strokes,
                  routeRef.current.markers,
                  globalMarkersStore.globalMarkers,
                  prevWalls
                );
                updateGlobalWalls(nextWalls);
              }}
              onSvgStringReady={setSvgString}
              canvasRef={canvasRef}
              focusTrigger={focusTrigger}
              onClearFocusTrigger={() => setFocusTrigger(null)}
              currentPosTrigger={currentPosTrigger}
              isEditMode={isEditMode}
              showMarkerLabels={showMarkerLabels}
              markerScale={markerScale}
              leftSidebarCollapsed={leftSidebarCollapsed}
              rightSidebarCollapsed={rightSidebarCollapsed}
              bossCustomDurations={routeApi.route.bossCustomDurations}
              onBossCustomDurationChange={(id, dur) => routeApi.setBossCustomDuration(id, dur)}
              battleCustomDurations={routeApi.route.battleCustomDurations}
              onBattleCustomDurationChange={(id, dur) => routeApi.setBattleCustomDuration(id, dur)}
              pickingCustomDurations={routeApi.route.pickingCustomDurations}
              onPickingCustomDurationChange={(id, dur) => routeApi.setPickingCustomDuration(id, dur)}
              longPickingCustomDurations={routeApi.route.longPickingCustomDurations}
              onLongPickingCustomDurationChange={(id, dur) => routeApi.setLongPickingCustomDuration(id, dur)}
              pickyMarkerIds={routeApi.route.pickyMarkerIds}
              onPickyMarkerChange={(id, val) => routeApi.setPickyMarker(id, val)}
              hideRouteLines={((rightTab === 'spawn' || toolMode === 'add-spawn') && spawnHideOther) ? true : hideRouteLines}
              routeLines1px={routeLines1px}
              hideBranchLines={((rightTab === 'spawn' || toolMode === 'add-spawn') && spawnHideOther) ? true : hideBranchLines}
              branchLines1px={branchLines1px}
              textPinPassThrough={textPinPassThrough}
              drawerPinPassThrough={drawerPinPassThrough}
              showPhoneCompass={showPhoneCompass}
              showPhoneBoxHud={showPhoneBoxHud}
              phoneBoxHudOpen={phoneBoxHudOpen}
              onPhoneBoxHudOpenChange={setPhoneBoxHudOpen}
              phoneBoxHudSize={phoneBoxHudSize}
              showBottomRightHud={showBottomRightHud}
              zoomHudSize={zoomHudSize}
              eraseTarget={eraseTarget}
              eraseDefaultBehavior={eraseDefaultBehavior}
              eraseSize={eraseSize}
              editStrokeIdxs={editStrokeIdxs}
              onEditStrokeIdxsChange={setEditStrokeIdxs}
              measureSelectedStrokeIdxs={measureSelectedStrokeIdxs}
              onMeasureSelectedStrokeIdxsChange={setMeasureSelectedStrokeIdxs}
              blockMarkerClicksDuringTools={blockMarkerClicksDuringTools}
              onMarkersDragStart={historyApi.startDragSnapshot}
              onMarkersDragEnd={historyApi.commitDragSnapshot}
              stopMarkerThreshold={stopMarkerThreshold}
              movementMarkerThreshold={movementMarkerThreshold}
              warpMarkerThreshold={warpMarkerThreshold}
              skillCdThreshold={skillCdThreshold}
              showDetectionRanges={showDetectionRanges}
              startupFocusMarkerId={globalDefaultsRef.current.startupFocusMarkerId}
              hiddenMarkers={routeApi.route.hiddenMarkers || []}
              hiddenMarkerTypes={routeApi.route.hiddenMarkerTypes || []}
              onHideGlobalMarker={handleHideGlobalMarker}
              onShowGlobalMarker={handleShowGlobalMarker}
              onToggleMarkerVisibility={handleToggleMarkerVisibility}
              onAutoRouteStatusChange={autoRoute.setStatus}
              autoRouteCommand={autoRoute.command}
              autoRouteSettings={{
                waitEnabled: autoRoute.waitEnabled,
                waitSeconds: autoRoute.waitSeconds,
                startStopSeconds: autoRoute.startStopSeconds,
                speedMode: autoRoute.speedMode,
                manualSpeed: autoRoute.manualSpeed,
                speedMultiplier: autoRoute.speedMultiplier,
                followCamera: autoRoute.followCamera
              }}
              followCamera={autoRoute.followCamera}
              targetDurationSeconds={parseInt(routeApi.route.targetDuration || '0') || undefined}
              autoStartMarker={autoStartMarker}
              onAutoStartMarkerChange={setAutoStartMarker}
              warpColor={warpColor}
              stairsColor={stairsColor}
              fuseMode={autoRoute.fuseMode}
              inactiveMarkersMode={autoRoute.inactiveMarkersMode}
              skillCdPresets={globalDefaults.skillCdPresets}
              onOpenSkillCdSettings={() => { setShowHelpModal(true); setHelpActiveTab('settings'); }}
              onAutoRouteStart={() => {
                const updated = globalMarkersStore.globalMarkers.map(m =>
                  m.type === 'phone' && !m.phoneLocked ? { ...m, phoneActive: false } : m
                );
                globalMarkersStore.replace(updated);
              }}
              spawnPoints={spawnApi.points}
              spawnItems={spawnApi.items}
              onSpawnPointAdd={handleSpawnPointAdd}
              onSpawnPointDelete={(id) => { pushSpawnHistory(); spawnApi.removePoint(id); }}
              onSpawnPointEdit={handleSpawnPointEdit}
              onSpawnPointView={handleSpawnPointView}
              spawnToolMode={spawnToolMode}
              spawnPointSize={spawnPointSize}
              spawnGridSnap={spawnGridSnap}
              spawnFocusTrigger={spawnFocusTrigger}
              spawnHighlightItemIds={spawnHighlightItemIds}
              spawnHighlightCategories={spawnHighlightCategories}
              spawnMovingPointId={spawnMovingPointId}
              onSpawnMoveComplete={handleSpawnMoveComplete}
              spawnVisible={spawnVisible}
              hideMapBg={((rightTab === 'spawn' || toolMode === 'add-spawn') && spawnHideBg) ? true : false}
              wallSubMode={wallSubMode}
              wallAutoSnap={wallAutoSnap}
              lockedWalls={lockedWalls[currentFloor] || []}
              onLockedWallsChange={handleLockedWallsChange}
              wallLockedSubMode={wallLockedSubMode}
            />
          ), [
            currentFloor,
            memoizedStrokes,
            globalMarkersStore.globalMarkers,
            routeApi.route.markers,
            routeApi.route.customBg,
            routeApi.route.bgOffset,
            routeApi.route.bgScale,
            toolMode,
            activeMarkerType,
            strokeColor,
            strokeWidth,
            strokeType,
            drawMode,
            updateStrokes,
            globalWalls,
            focusTrigger,
            currentPosTrigger,
            isEditMode,
            showMarkerLabels,
            markerScale,
            leftSidebarCollapsed,
            rightSidebarCollapsed,
            routeApi.route.bossCustomDurations,
            routeApi.route.battleCustomDurations,
            routeApi.route.pickingCustomDurations,
            routeApi.route.longPickingCustomDurations,
            routeApi.route.pickyMarkerIds,
            hideRouteLines,
            routeLines1px,
            hideBranchLines,
            branchLines1px,
            textPinPassThrough,
            showPhoneCompass,
            showPhoneBoxHud,
            phoneBoxHudOpen,
            phoneBoxHudSize,
            showBottomRightHud,
            zoomHudSize,
            eraseTarget,
            eraseDefaultBehavior,
            eraseSize,
            editStrokeIdxs,
            measureSelectedStrokeIdxs,
            blockMarkerClicksDuringTools,
            stopMarkerThreshold,
            movementMarkerThreshold,
            warpMarkerThreshold,
            skillCdThreshold,
            showDetectionRanges,
            routeApi.route.hiddenMarkers,
            routeApi.route.hiddenMarkerTypes,
            autoRoute.command,
            autoRoute.waitEnabled,
            autoRoute.waitSeconds,
            autoRoute.startStopSeconds,
            autoRoute.speedMode,
            autoRoute.manualSpeed,
            autoRoute.speedMultiplier,
            autoRoute.followCamera,
            routeApi.route.targetDuration,
            autoStartMarker,
            warpColor,
            stairsColor,
            autoRoute.fuseMode,
            autoRoute.inactiveMarkersMode,
            globalDefaults.skillCdPresets,
            globalDefaultsRef.current.startupFocusMarkerId,
            spawnApi.points,
            spawnApi.items,
            spawnHideOther,
            spawnHideBg,
            spawnVisible,
            spawnFocusTrigger,
            spawnHighlightItemIds,
            spawnHighlightCategories,
            spawnMovingPointId,
            spawnMoveX,
            spawnMoveY,
            handleSpawnPointAdd,
            handleSpawnPointEdit,
            handleSpawnPointView,
            handleSpawnMoveComplete,
            spawnToolMode,
            editPointId,
            editAddItemId,
            itemFormName,
            itemFormTextColor,
            itemFormFans,
            itemFormCoins,
            itemFormEditId,
            itemFormDescription,
            itemFormImage,
            bulkInput,
            bulkColor,
            showItemModal,
            showEditModal,
            rightTab,
            lockedWalls,
            selectedTexture
          ])}
          {/* Sidebar collapse buttons — zIndex 300 keeps them above the
              mobile overlay panes (zIndex 200) so users can always reach
              a close button, even when a pane is open. */}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 300, background: 'rgba(10, 15, 28, 0.9)', border: '1px solid var(--border-color)',
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
              zIndex: 300, background: 'rgba(10, 15, 28, 0.9)', border: '1px solid var(--border-color)',
              borderRight: 'none', color: 'var(--cyan-neon)', padding: '12px 4px', borderRadius: '8px 0 0 8px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '-2px 0 10px rgba(0, 240, 255, 0.2)'
            }}
            title={rightSidebarCollapsed ? "Show Right Panel (Shortcut: ])" : "Hide Right Panel (Shortcut: ])"}
          >
            {rightSidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
          {showOcrDebugModal && (
            <OcrDebugModal
              show={showOcrDebugModal}
              onClose={() => setShowOcrDebugModal(false)}
            />
          )}
        </section>

        {/* Right Sidebar */}
        <section
          className="sidebar-right glass-panel"
          data-collapsed={rightSidebarCollapsed}
          style={isMobile ? {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: 'min(85vw, 320px)',
            zIndex: 200,
            transform: rightSidebarCollapsed ? 'translateX(100%)' : 'translateX(0)',
            transition: 'transform 0.25s ease',
            display: 'flex',
            borderLeft: '1px solid var(--border-color)',
          } : { display: rightSidebarCollapsed ? 'none' : 'flex' }}
        >
          <div className="sidebar-fixed">
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'route' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'route' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'route' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('route')}>{t('ルート計画')}</button>
              <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'play' ? 'rgba(79,195,247,0.15)' : 'transparent', color: rightTab === 'play' ? 'var(--cyan-neon)' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'play' ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setRightTab('play')}>{t('プレイデータ')}</button>
              {showSpawnFeature && (
                <button style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 700, background: rightTab === 'spawn' ? 'rgba(57,255,20,0.15)' : 'transparent', color: rightTab === 'spawn' ? '#39ff14' : 'var(--text-muted)', border: 'none', borderBottom: rightTab === 'spawn' ? '2px solid #39ff14' : '2px solid transparent', cursor: 'pointer' }} onClick={() => { setSpawnHighlightItemIds(spawnFilterCacheRef.current); setRightTab('spawn'); }}>{t('スポーン')}</button>
              )}
            </div>
          </div>

          <div className="sidebar-scroll">
            {rightTab === 'route' && (<>
              <div className="panel-section">
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={routeApi.saveToLocal}>
                    <Save size={12} /> {t('セーブ')}
                  </button>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => setPresetListVisible(true)}>
                    <Upload size={12} /> {t('ロード')}
                  </button>
                  <button className="btn-cyber danger" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={createNewPlan}>
                    <FilePlus size={12} /> {newPlanConfirm ? t('実行?') : t('新規')}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => setShowSaveModal(true)}>
                    <Download size={12} /> {t('ファイルに保存')}
                  </button>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => fileIO.jsonFileInputRef.current?.click()}>
                    <Upload size={12} /> {t('ファイルから開く')}
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
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>{t('プラン名')}</label>
                  {isEditMode ? (
                    <input type="text" className="input-cyber" value={routeApi.route.title}
                      onChange={(e) => routeApi.setRoute({ ...routeApi.route, title: e.target.value })}
                      onFocus={(e) => { (e.target as HTMLInputElement).dataset.origTitle = routeApi.route.title; }}
                      onBlur={(e) => {
                        const orig = e.target.dataset.origTitle || '';
                        const next = e.target.value.trim();
                        if (!next || next === orig) return;
                        const newRoute: RouteData = { ...routeApi.route, id: generateId('route'), title: next, createdAt: Date.now() };
                        DataManager.saveToLocalStorage(newRoute);
                        routeApi.setRoute(newRoute);
                        routeApi.refreshSavesList();
                      }}
                    />
                  ) : (
                    <div className="display-field">{routeApi.route.title || <span className="empty">{t('(未設定)')}</span>}</div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>{t('想定獲得ファンス')}</label>
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
                        <div className="display-field"><span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginRight: '4px' }}>$</span>{routeApi.route.targetCash || <span className="empty">{t('(未設定)')}</span>}</div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>{t('にくきゅうコイン')}</label>
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
                        <div className="display-field"><span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginRight: '4px' }}>🪙</span>{routeApi.route.targetCoins || <span className="empty">{t('(未設定)')}</span>}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>
                      {t('目標所要時間')}{isEditMode && (
                        <span style={{ color: 'var(--yellow-neon, #ffe600)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginLeft: '4px' }}>
                          {(() => { const s = parseInt(routeApi.route.targetDuration || '0'); return !isNaN(s) ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : '--:--'; })()}
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
                        {(() => { const s = parseInt(routeApi.route.targetDuration || '0'); return !isNaN(s) ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : '--:--'; })()}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>{t('作者名')}</label>
                      {isEditMode ? (
                        <input type="text" className="input-cyber" style={{ width: '100%', boxSizing: 'border-box' }}
                          value={authorEdit}
                          onChange={(e) => {
                            const v = e.target.value;
                            // 重要: renderCache (=原作者) は author (=編集者) 編集で変化しない。
                            // author 編集は author のみ更新する (= 原作者は独立した保護対象)。
                            setAuthorEdit(v);
                            routeApi.setRoute({ ...routeApi.route, author: v });
                          }}
                          onBlur={() => {
                            // 編集完了時: 空文字なら 'No name' に正規化
                            if (!authorEdit) {
                              routeApi.setRoute({ ...routeApi.route, author: AUTHOR_DEFAULT_PLAIN });
                              setAuthorEdit(AUTHOR_DEFAULT_PLAIN);
                            }
                          }}
                          placeholder={AUTHOR_DEFAULT_PLAIN}
                        />
                      ) : (
                        <div className="display-field" style={!routeApi.route.author || routeApi.route.author === AUTHOR_DEFAULT_PLAIN ? { color: 'var(--text-muted)' } : undefined}>
                          {!routeApi.route.author || routeApi.route.author === AUTHOR_DEFAULT_PLAIN
                            ? <span style={{ color: 'var(--text-muted)' }}>No name</span>
                            : routeApi.route.author}
                        </div>
                      )}
                    </div>
                    {isLocal && (
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>{t('原作者名')}</label>
                        {(() => {
                          // renderCache はメモリ上は平文。表示ルール:
                          //   1. 空文字 ('') → 異常値 (Anomaly)。 復号失敗や欠損でここに到達
                          //   2. 'No name' (AUTHOR_DEFAULT_PLAIN) → 「意図的に No name に設定」= 正常
                          //   3. それ以外の文字列 → 正しい原作者名 (復号成功)
                          // 注: ロード/復号時に AUTHOR_UNKNOWN_MARKER ('v2:0:') は空文字に
                          // 正規化済み (= No name として表示)。 ここで扱うのはあくまで
                          // メモリ上の値。 メモリ上は「空文字 = Anomaly」「No name 文字列 = No name 表示」
                          // 「その他の文字列 = 原作者名表示」の3状態。
                          const cache = routeApi.route.renderCache;
                          if (typeof cache !== 'string' || !cache) {
                            // 空文字 → 異常値 (Anomaly)
                            return <div className="display-field" style={{ color: 'var(--red-neon, #f44)' }}><span style={{ color: 'var(--red-neon, #f44)' }}>Anomaly</span></div>;
                          }
                          if (cache === AUTHOR_DEFAULT_PLAIN) {
                            // メモリ上で 'No name' として保持されている (= 意図的な設定)
                            return <div className="display-field" style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-muted)' }}>No name</span></div>;
                          }
                          return <div className="display-field">{cache}</div>;
                        })()}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
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
                          {routeApi.route.customBg[currentFloor] ? t('カスタムBG: 設定済み') : <span className="empty">{t('デフォルトBG使用中')}</span>}
                        </div>
                      )}
                    </div>
                    {routeApi.route.customBg[currentFloor] && isEditMode && (
                      <>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                          <Move size={12} style={{ color: 'var(--cyan-neon)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '10px', color: '#888' }}>X</label>
                            <input type="range" min={-500} max={500} value={routeApi.route.bgOffset?.x ?? 0}
                              onChange={e => routeApi.setRoute(prev => ({ ...prev, bgOffset: { ...(prev.bgOffset || { x: 0, y: 0 }), x: Number(e.target.value) } }))}
                              style={{ width: '100%', height: '4px', accentColor: 'var(--cyan-neon)' }} />
                            <span style={{ fontSize: '9px', color: '#aaa' }}>{routeApi.route.bgOffset?.x ?? 0}px</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '10px', color: '#888' }}>Y</label>
                            <input type="range" min={-500} max={500} value={routeApi.route.bgOffset?.y ?? 0}
                              onChange={e => routeApi.setRoute(prev => ({ ...prev, bgOffset: { ...(prev.bgOffset || { x: 0, y: 0 }), y: Number(e.target.value) } }))}
                              style={{ width: '100%', height: '4px', accentColor: 'var(--cyan-neon)' }} />
                            <span style={{ fontSize: '9px', color: '#aaa' }}>{routeApi.route.bgOffset?.y ?? 0}px</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#888', width: '14px' }}>W</span>
                          <input type="range" min={0.1} max={3} step={0.01} value={routeApi.route.bgScale?.x ?? 1}
                            onChange={e => routeApi.setRoute(prev => ({ ...prev, bgScale: { ...(prev.bgScale || { x: 1, y: 1 }), x: Number(e.target.value) } }))}
                            style={{ flex: 1, height: '4px', accentColor: 'var(--cyan-neon)' }} />
                          <span style={{ fontSize: '9px', color: '#aaa', minWidth: '30px', textAlign: 'right' }}>{((routeApi.route.bgScale?.x ?? 1) * 100).toFixed(0) + '%'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#888', width: '14px' }}>H</span>
                          <input type="range" min={0.1} max={3} step={0.01} value={routeApi.route.bgScale?.y ?? 1}
                            onChange={e => routeApi.setRoute(prev => ({ ...prev, bgScale: { ...(prev.bgScale || { x: 1, y: 1 }), y: Number(e.target.value) } }))}
                            style={{ flex: 1, height: '4px', accentColor: 'var(--cyan-neon)' }} />
                          <span style={{ fontSize: '9px', color: '#aaa', minWidth: '30px', textAlign: 'right' }}>{((routeApi.route.bgScale?.y ?? 1) * 100).toFixed(0) + '%'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                          <button className="btn-cyber danger" style={{ padding: '4px', fontSize: '10px', flex: 1 }} onClick={() => {
                            const id = routeApi.route.id;
                            routeApi.setRoute(prev => ({ ...prev, customBg: { main: null }, bgOffset: { x: 0, y: 0 }, bgScale: { x: 1, y: 1 } }));
                            DataManager.deleteCustomBg(id);
                            DataManager.setSaveMetaBg(id, false);
                            routeApi.refreshSavesList();
                          }}>
                            Reset BG
                          </button>
                          <button className="btn-cyber" style={{ padding: '4px', fontSize: '10px', flex: 1 }} onClick={() => {
                            routeApi.setRoute(prev => ({ ...prev, bgOffset: { x: 0, y: 0 }, bgScale: { x: 1, y: 1 } }));
                          }}>
                            Reset Offset/Scale
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700, marginTop: '4px' }}>{t('備考')}</label>
                  {isEditMode ? (
                    <textarea className="textarea-cyber" placeholder="Write overall heist instructions..." value={routeApi.route.description} onChange={(e) => routeApi.setRoute({ ...routeApi.route, description: e.target.value })} />
                  ) : (
                    <div className="display-field display-field-multi">{routeApi.route.description || <span className="empty">{t('(未設定)')}</span>}</div>
                  )}
                </div>
              </div>

              <div className="panel-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="panel-title" style={{ flex: 1 }}>{t('マーカー編集履歴 (50件)')}</div>
                  <button className="btn-cyber" onClick={() => setShowHistoryModal(true)} style={{ padding: '2px 6px', fontSize: '9px', clipPath: 'none' }}>{t('全履歴')}</button>
                  <button className="btn-cyber" onClick={historyApi.undo} disabled={!historyApi.canUndo} title="Undo (Ctrl+Z)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canUndo ? 1 : 0.4, cursor: historyApi.canUndo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Undo size={12} /></button>
                  <button className="btn-cyber" onClick={historyApi.redo} disabled={!historyApi.canRedo} title="Redo (Ctrl+Y)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canRedo ? 1 : 0.4, cursor: historyApi.canRedo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Redo size={12} /></button>
                </div>
                <div className="placed-notes-list">
                  {(() => {
                    const historyMarkers = isLocal
                      ? [...globalMarkersStore.globalMarkers, ...routeApi.route.markers]
                      : [...routeApi.route.markers];
                    if (historyMarkers.length === 0) {
                      return <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>{t('マーカーがありません')}</div>;
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
                                <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); routeApi.setRoute(prev => ({ ...prev, markers: prev.markers.filter(x => x.id !== m.id) })); globalMarkersStore.setGlobalMarkers(prev => prev.filter(x => x.id !== m.id)); setHistoryDeleteConfirmId(null); notification.show(t('マーカーを削除しました')); }}>{t('削除する')}</button>
                                <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(null); }}>×</button>
                              </>
                            ) : (
                              <button className="btn-cyber danger" style={{ fontSize: '8px', padding: '1px 4px', clipPath: 'none', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setHistoryDeleteConfirmId(m.id); setTimeout(() => setHistoryDeleteConfirmId(null), 3000); }}>{t('削除')}</button>
                            ))}
                          </div>
                          <div className="placed-note-text">{m.note.trim() ? m.note : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>{t('No text note details')}</span>}</div>
                          <div style={{ fontSize: '9px', color: m.scrollConfig ? 'var(--cyan-neon)' : 'var(--text-muted)', marginTop: '2px', textAlign: 'right' }}>{m.scrollConfig ? '🎯 Click to Pan ➔' : 'Click to Pan ➔'}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </>)}

            <LangSync />
            {rightTab === 'spawn' && (
              <>
                {isLocal && (
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(79,195,247,0.2)', marginBottom: '4px' }}>
                    <button style={{ flex: 1, padding: '4px', fontSize: '10px', fontWeight: 700, background: spawnTabMode === 'view' ? 'rgba(57,255,20,0.15)' : 'transparent', color: spawnTabMode === 'view' ? '#39ff14' : 'var(--text-muted)', border: 'none', borderBottom: spawnTabMode === 'view' ? '2px solid #39ff14' : '2px solid transparent', cursor: 'pointer' }}
                      onClick={() => setSpawnTabMode('view')}>閲覧</button>
                    <button style={{ flex: 1, padding: '4px', fontSize: '10px', fontWeight: 700, background: spawnTabMode === 'manage' ? 'rgba(255,215,0,0.15)' : 'transparent', color: spawnTabMode === 'manage' ? '#ffd700' : 'var(--text-muted)', border: 'none', borderBottom: spawnTabMode === 'manage' ? '2px solid #ffd700' : '2px solid transparent', cursor: 'pointer' }}
                      onClick={() => setSpawnTabMode('manage')}>管理</button>
                  </div>
                )}
                <SpawnAnalysisPanel
                  points={spawnApi.points}
                  items={spawnApi.items}
                  isManage={spawnTabMode === 'manage'}
                  onPointDelete={(id) => spawnApi.removePoint(id)}
                  onPointFocus={(x, y) => setSpawnFocusTrigger({ x, y, ts: Date.now() })}
                  spawnVisible={spawnVisible}
                  onSpawnVisibleChange={setSpawnVisible}
                  hideOther={spawnHideOther}
                  onHideOtherChange={setSpawnHideOther}
                  hideBg={spawnHideBg}
                  onHideBgChange={setSpawnHideBg}
                  highlightItemIds={spawnHighlightItemIds ?? []}
                  onHighlightItemIdsChange={(ids) => setSpawnHighlightItemIds(ids.length > 0 ? ids : null)}
                  highlightCategories={spawnHighlightCategories ?? []}
                  onHighlightCategoriesChange={(cats) => setSpawnHighlightCategories(cats.length > 0 ? cats : null)}
                />
              </>
            )}
            {rightTab === 'play' && (
              <>
                <div className="panel-section">
                  <button type="button" onClick={autoRoute.toggleCollapsed} style={{ width: '100%', padding: '4px 8px', fontSize: '11px', background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '4px', color: 'var(--cyan-neon)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: autoRoute.collapsed ? 0 : '8px' }} title={t('自動ルート案内を使わない場合は畳んで非表示にできます')}>
                    <span>{t('🐾 自動ルート案内')}</span>
                    <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{autoRoute.collapsed ? t('▶ 展開') : t('▼ 折りたたみ')}</span>
                  </button>

                  {!autoRoute.collapsed && (
                    <div style={{ background: 'rgba(10, 15, 28, 0.6)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '6px', padding: '8px' }}>
                      {autoRoute.status.error && (
                        <div style={{ fontSize: '10px', color: 'var(--magenta-neon, #ff00ff)', padding: '4px', background: 'rgba(255,0,85,0.1)', borderRadius: '3px', marginBottom: '4px' }}>⚠ <span>{t(autoRoute.status.error)}</span></div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px', padding: '4px', background: 'rgba(0,0,0,0.25)', borderRadius: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <input type="checkbox" checked={autoRoute.waitEnabled} onChange={(e) => autoRoute.setWaitEnabled(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)' }} />
                          <span>{t('開始前に待機 (')}</span>
                          <input type="number" min="0" max="60" value={autoRoute.waitSeconds} onChange={(e) => autoRoute.setWaitSeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} disabled={!autoRoute.waitEnabled} style={{ width: '36px', fontSize: '11px', textAlign: 'center', padding: '1px 2px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--cyan-neon)', borderRadius: '2px' }} />
                          <span>{t('秒)')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{t('🐾 スタート停止 (')}</span>
                          <input type="number" min="0" max="60" value={autoRoute.startStopSeconds} onChange={(e) => autoRoute.setStartStopSeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} style={{ width: '36px', fontSize: '11px', textAlign: 'center', padding: '1px 2px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--cyan-neon)', borderRadius: '2px' }} />
                          <span>{t('秒)')}</span>
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{t('移動速度:')}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            {(['time', 'speed'] as const).map(mode => (
                              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: autoRoute.status.active ? 'not-allowed' : 'pointer', opacity: autoRoute.status.active ? 0.5 : 1 }}>
                                <input
                                  type="radio"
                                  name="autoRouteSpeedMode"
                                  checked={autoRoute.speedMode === mode}
                                  onChange={() => autoRoute.setSpeedMode(mode)}
                                  disabled={autoRoute.status.active}
                                  style={{ accentColor: 'var(--cyan-neon)', cursor: autoRoute.status.active ? 'not-allowed' : 'pointer' }}
                                />
                                <span>{mode === 'time' ? t('所要時間ベース') : t('速度ベース')}</span>
                              </label>
                            ))}
                            {autoRoute.speedMode === 'speed' && (
                              <input
                                type="number"
                                min="1"
                                max="10000"
                                step="1"
                                value={autoRoute.manualSpeed}
                                onChange={(e) => autoRoute.setManualSpeed(Math.max(1, Math.min(10000, parseInt(e.target.value) || 0)))}
                                disabled={autoRoute.status.active}
                                style={{ width: '56px', fontSize: '12px', fontWeight: 700, textAlign: 'center', padding: '2px 4px', background: 'rgba(5,7,10,0.95)', border: '1px solid rgba(0,240,255,0.5)', color: 'var(--yellow-neon, #ffe600)', borderRadius: '3px', fontFamily: 'monospace', opacity: autoRoute.status.active ? 0.5 : 1, cursor: autoRoute.status.active ? 'not-allowed' : 'text' }}
                              />
                            )}
                            {autoRoute.speedMode === 'speed' && <span style={{ color: 'var(--text-muted)' }}>{t('px/秒')}</span>}
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.fuseMode} onChange={(e) => autoRoute.setFuseMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('💣 導火線モード')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.inactiveMarkersMode} onChange={(e) => autoRoute.setInactiveMarkersMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('🔘 通過マーカー半透明化')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.followCamera} onChange={(e) => autoRoute.setFollowCamera(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('🎥 カメラ追従')}</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{t('倍速:')}</span>
                          {([1, 2, 3, 5, 10] as const).map(m => (
                            <button key={m} translate="no" className={`btn-cyber ${autoRoute.speedMultiplier === m ? 'active' : ''}`} style={{ flex: 1, padding: '2px', fontSize: '11px' }} onClick={() => autoRoute.setSpeedMultiplier(m)}>x{m}</button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                        {(() => {
                          const finished = autoRoute.status.active && !autoRoute.status.running && autoRoute.status.totalTime > 0 && autoRoute.status.elapsed >= autoRoute.status.totalTime;
                          if (autoRoute.status.waitRemaining > 0) {
                            return <div style={{ flex: 1, padding: '5px', fontSize: '11px', textAlign: 'center', color: 'var(--yellow-neon)', fontWeight: 700 }}><span>{t('待機中... ')}</span><span translate="no">{autoRoute.status.waitRemaining.toFixed(1)}s</span></div>;
                          } else if (!autoRoute.status.active) {
                            return <button className="btn-cyber" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('start')}><span translate="no"><Play size={12} /></span> <span>{t('スタート')}</span></button>;
                          } else if (finished) {
                            return <button className="btn-cyber" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('start')}><span translate="no"><RotateCcw size={11} /></span> <span>{t('リスタート')}</span></button>;
                          } else if (autoRoute.status.running) {
                            return <button className="btn-cyber" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('pause')}><span translate="no"><Pause size={11} /></span> <span>{t('一時停止')}</span></button>;
                          } else {
                            return <button className="btn-cyber success" style={{ flex: 1, padding: '5px', fontSize: '11px' }} onClick={() => autoRoute.sendCommand('resume')}><span translate="no"><Play size={11} /></span> <span>{t('再開')}</span></button>;
                          }
                        })()}
                        <button className={`btn-cyber ${autoRoute.status.active ? 'danger' : ''}`} style={{ flex: 1, padding: '5px', fontSize: '11px', opacity: autoRoute.status.active ? 1 : 0.4 }} disabled={!autoRoute.status.active} onClick={() => autoRoute.sendCommand('reset')}>
                          <span translate="no"><Square size={11} /></span> <span>{t('停止')}</span>
                        </button>
                      </div>

                      {autoRoute.status.active && (
                        <>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4px' }}>{t('Space キーで一時停止 / 再開 (終端でリスタート)')}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px', padding: '4px 6px', background: 'rgba(0, 240, 255, 0.06)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '3px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{t('経過')}</span>
                              <span translate="no" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cyan-neon)', fontFamily: 'monospace', lineHeight: 1.1 }}>{formatTime(autoRoute.status.elapsed)}</span>
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--text-muted)', padding: '0 4px' }}>/</div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{t('合計')}</span>
                              <span translate="no" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1.1 }}>{formatTime(autoRoute.status.totalTime)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <button
                              type="button"
                              className="btn-cyber"
                              translate="no"
                              style={{ padding: '2px 4px', fontSize: '9px', minWidth: '32px' }}
                              onClick={() => {
                                const target = Math.max(0, autoRoute.status.elapsed - 30);
                                autoRoute.sendCommand('seek', target);
                              }}
                              title={t('30秒戻る')}
                            >
                              ◀30s
                            </button>
                            <div
                              style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
                              title={t('クリックでシーク')}
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
                              <div translate="no" style={{ height: '100%', width: `${Math.min(100, (autoRoute.status.elapsed / Math.max(autoRoute.status.totalTime, 0.001)) * 100)}%`, background: 'var(--cyan-neon)', borderRadius: '2px', transition: 'width 0.1s' }} />
                              {autoRoute.status.checkpoints.map((cp, i) => {
                                if (autoRoute.status.totalTime <= 0) return null;
                                const ratio = cp.elapsed / autoRoute.status.totalTime;
                                const left = Math.min(100, Math.max(0, ratio * 100));
                                const ignored = !!cp.ignored;
                                const unset = !!cp.unset;
                                const conflicted = !!cp.conflicted;
                                const passed = !!cp.passed;
                                let color: string;
                                if (ignored || conflicted) color = '#ff4444';
                                else if (unset) color = '#ffd000';
                                else color = passed ? '#39ff14' : '#ff9500';
                                const tip = ignored
                                  ? t('⚠🏁 {0} @ 異常値 (目標時間 {1} — マイナス値は無視)\nマーカーを編集して 0 以上の値を設定してください', cp.label, formatTime(cp.targetTime))
                                  : conflicted
                                    ? t('⚠🏁 {0} @ {1}\n順序矛盾: 前のチェックポイントより小さい目標時間です。{1} が他のチェックポイントより前に来ています。', cp.label, formatTime(cp.targetTime))
                                    : unset
                                      ? t('⚠🏁 {0} @ 未設定 (目標時間 0秒)\nマーカーを編集して目標時間を設定してください', cp.label)
                                      : t('🏁 {0} @ {1}{2}', cp.label, formatTime(cp.elapsed), passed ? t(' (通過済)') : '');
                                const isAlert = ignored || conflicted;
                                return (
                                  <div key={`cp-line-${i}`} title={tip} translate="no" style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, transform: 'translateX(-50%)', width: isAlert ? '5px' : '4px', background: color, opacity: 0.95, pointerEvents: 'none', boxShadow: isAlert ? '0 0 5px rgba(255,68,68,0.95), 0 0 10px rgba(255,68,68,0.6)' : (unset ? '0 0 4px rgba(255,208,0,0.7)' : `0 0 4px ${color}cc`), borderRadius: '1px', animation: isAlert ? 'checkpoint-ignored-pulse 1.2s ease-in-out infinite' : 'none', zIndex: isAlert ? 2 : 1 }}>
                                    <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `5px solid ${color}`, filter: `drop-shadow(0 0 2px ${color})` }} />
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className="btn-cyber"
                              translate="no"
                              style={{ padding: '2px 4px', fontSize: '9px', minWidth: '32px' }}
                              onClick={() => {
                                const target = Math.min(autoRoute.status.totalTime, autoRoute.status.elapsed + 30);
                                autoRoute.sendCommand('seek', target);
                              }}
                              title={t('30秒進む')}
                            >
                              30s▶
                            </button>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span><span>{t('累計停止 ')}</span><span translate="no">{formatTime(autoRoute.status.totalStopTime)}</span></span>
                            {autoRoute.status.currentStopLabel
                              ? <span style={{ color: 'var(--yellow-neon)' }}><span>{t('停止中: ')}</span><span translate="no">{autoRoute.status.currentStopLabel}</span><span>{t(' (残り ')}</span><span translate="no">{formatTime(autoRoute.status.stopRemaining)}</span><span>{t(')')}</span></span>
                              : autoRoute.status.nextMarkerLabel && <span style={{ color: 'var(--yellow-neon)' }}><span>{t('次: ')}</span><span translate="no">{autoRoute.status.nextMarkerLabel}</span></span>
                            }
                          </div>
                          {autoRoute.status.skillCdInfo && (
                            <div style={{ fontSize: '10px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', marginTop: '2px', background: `${autoRoute.status.skillCdInfo.color}1a`, border: `1px solid ${autoRoute.status.skillCdInfo.color}66`, borderRadius: '3px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: 'rgba(10,15,28,0.85)', color: autoRoute.status.skillCdInfo.color, border: `1.5px solid ${autoRoute.status.skillCdInfo.color}`, textAlign: 'center', lineHeight: '12px', fontSize: '10px', fontWeight: 700, boxShadow: `0 0 6px ${autoRoute.status.skillCdInfo.color}80` }}>
                                  {(autoRoute.status.skillCdInfo.label || 'S').charAt(0)}
                                </span>
                                <span style={{ color: autoRoute.status.skillCdInfo.color, fontWeight: 700 }}><span>{t('CD: ')}</span><span translate="no">{autoRoute.status.skillCdInfo.label}</span></span>
                              </span>
                              <span translate="no" style={{ fontFamily: 'monospace', fontWeight: 700, color: autoRoute.status.skillCdInfo.color }}>
                                {autoRoute.status.skillCdInfo.remaining.toFixed(1)}s / {autoRoute.status.skillCdInfo.total}s
                              </span>
                            </div>
                          )}
                          {(() => {
                            const ignoredCp = autoRoute.status.checkpoints.filter(cp => cp.ignored);
                            const unsetCp = autoRoute.status.checkpoints.filter(cp => cp.unset);
                            const conflictedCp = autoRoute.status.checkpoints.filter(cp => cp.conflicted);
                            if (ignoredCp.length === 0 && unsetCp.length === 0 && conflictedCp.length === 0) return null;
                            return (
                              <div style={{ fontSize: '10px', color: '#ff6666', fontWeight: 'bold', padding: '3px 6px', marginTop: '2px', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.45)', borderRadius: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {ignoredCp.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ff4444', boxShadow: '0 0 4px #ff4444', animation: 'checkpoint-ignored-pulse 1.2s ease-in-out infinite' }} />
                                    <span><span>{t('⚠ チェックポイント ')}</span><span translate="no">{ignoredCp.length}</span><span>{t(' 件が異常値 (マイナス) (赤マーカー) — 0 以上に修正してください')}</span></span>
                                  </div>
                                )}
                                {unsetCp.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ffd000' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ffd000', boxShadow: '0 0 4px #ffd000' }} />
                                    <span><span>{t('⚠ チェックポイント ')}</span><span translate="no">{unsetCp.length}</span><span>{t(' 件が目標未設定 (黄色マーカー) — 編集して目標時間を設定してください')}</span></span>
                                  </div>
                                )}
                                {conflictedCp.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', paddingLeft: '12px' }}>
                                    <span><span>{t('⚠ 順序矛盾 ')}</span><span translate="no">{conflictedCp.length}</span><span>{t(' 件: ')}</span></span>
                                    <span style={{ color: '#ffaaaa', fontWeight: 'normal' }}>
                                      <span translate="no">{conflictedCp.map(cp => `${cp.label} (${formatTime(cp.targetTime)})`).join(', ')}</span> {t(' — 目標時間が前のチェックポイントより小さい')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="panel-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <div className="panel-title" style={{ marginBottom: 0 }}>{t('プレイデータ')}</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px' }} onClick={handleExportPlayData} title="履歴CSV以外の全データをJSONで保存">
                        <Download size={9} /> {t('保存')}
                      </button>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px' }} onClick={() => playDataImportRef.current?.click()} title="JSONからプレイデータを読み込み">
                        <Upload size={9} /> {t('読込')}
                      </button>
                    </div>
                  </div>
                  <input ref={playDataImportRef} type="file" accept=".json" onChange={handleImportPlayData} style={{ display: 'none' }} />
                  <PlayDataPanel
                    routeTitle={routeApi.route.title}
                    onNotify={(msg) => { notification.show(msg); }}
                    refreshKey={playDataRefreshKey}
                    isLocal={isLocal}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-neon)' }}>{t('ロード')}</div>
                <StorageUsageBadge
                  onOpenSettings={() => { setPresetListVisible(false); setShowHelpModal(true); setHelpActiveTab('settings'); }}
                />
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-cyber"
                  placeholder="検索..."
                  value={saveLoadSearchQuery}
                  onChange={(e) => setSaveLoadSearchQuery(e.target.value)}
                  style={{ width: '160px', padding: '4px 8px', fontSize: '11px' }}
                />
                {saveLoadSearchQuery && (
                  <button className="btn-cyber" style={{ padding: '4px 6px', fontSize: '10px' }} onClick={() => setSaveLoadSearchQuery('')}>
                    ✕
                  </button>
                )}
                <button className="btn-cyber" style={{ padding: '4px 10px', fontSize: '14px' }} onClick={() => { setPresetListVisible(false); setSaveLoadSearchQuery(''); setSaveLoadFilter('all'); }}>✕</button>
              </div>
            </div>
            {/* フィルタツールバー */}
            <div style={{ display: 'flex', gap: '4px', padding: '6px 10px', borderBottom: '1px solid rgba(79,195,247,0.15)', background: 'rgba(0,0,0,0.2)', alignItems: 'center', flexWrap: 'wrap' }}>
              {([
                { key: 'all', label: t('すべて') },
                { key: 'favorites', label: `★ ${t('お気に入り')}` },
                { key: 'presets', label: t('プリセット') },
                { key: 'saves', label: t('セーブ') }
              ] as { key: typeof saveLoadFilter; label: string }[]).map(opt => {
                const active = saveLoadFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSaveLoadFilter(opt.key)}
                    style={{
                      fontSize: '10px',
                      padding: '3px 10px',
                      clipPath: 'none',
                      background: active ? 'var(--cyan-neon)' : 'transparent',
                      color: active ? '#000' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'var(--cyan-neon)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: active ? 700 : 400
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {hiddenPresetIds.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {t('プリセット非表示: クリックで切替')}: {hiddenPresetIds.length}
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {(() => {
                // ロードモーダルの一覧:
                //  - 限定公開 (unlisted) は本番モードでは出さない (URL (?preset=ID)
                //    経由で開く前提)。ローカルモード (npm run dev) では一覧に出して良い
                //    (= 開発者/作者本人が動作確認できるようにする)。
                //  - 非公開 (private) はローカルモードのときだけ出す。
                const visiblePresets = routeApi.filterVisiblePresets({ showUnlisted: isLocal, showPrivate: true });
                if (visiblePresets.length === 0 && routeApi.saves.length === 0) {
                  return <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>{t('セーブデータはまだありません')}</div>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(() => {
                      const q = saveLoadSearchQuery.toLowerCase().trim();
                      const matchPreset = (p: PresetData) => {
                        if (!q) return true;
                        return p.id.toLowerCase().includes(q)
                          || p.name.toLowerCase().includes(q)
                          || (p.description || '').toLowerCase().includes(q)
                          || (p.author || '').toLowerCase().includes(q)
                          || (p.renderCache || '').toLowerCase().includes(q);
                      };
                      const matchSave = (s: SaveInfo) => {
                        if (!q) return true;
                        const isV2 = (enc: string) =>
                          enc.startsWith('v2:') || enc.startsWith('legacy:');
                        const plainAuthor = s.author || '';
                        return s.title.toLowerCase().includes(q)
                          || (s.description || '').toLowerCase().includes(q)
                          || plainAuthor.toLowerCase().includes(q)
                          || (q.toLowerCase().includes('no name') && isV2(s.renderCache || ''))
                          || (q.toLowerCase().includes('anomaly') && !s.renderCache);
                      };
                      // 非表示プリセットを除外 (favorites フィルタ時は表示する)
                      const allVisiblePresets = visiblePresets.filter(p => !hiddenPresetIds.includes(p.id));
                      const hiddenPresetsList = visiblePresets.filter(p => hiddenPresetIds.includes(p.id));
                      const favPresets = allVisiblePresets.filter(p => favoriteIds.includes(p.id) && matchPreset(p));
                      const favSaves = routeApi.saves.filter(s => favoriteIds.includes(s.id) && matchSave(s));

                      let listPresets: PresetData[];
                      let listSaves: SaveInfo[];
                      if (saveLoadFilter === 'favorites') {
                        listPresets = favPresets;
                        listSaves = favSaves;
                      } else if (saveLoadFilter === 'presets') {
                        listPresets = allVisiblePresets.filter(matchPreset);
                        listSaves = [];
                      } else if (saveLoadFilter === 'saves') {
                        listPresets = [];
                        listSaves = routeApi.saves.filter(matchSave);
                      } else {
                        listPresets = allVisiblePresets.filter(matchPreset);
                        listSaves = routeApi.saves.filter(matchSave);
                      }

                      const noResults = q && listPresets.length === 0 && listSaves.length === 0
                        && (saveLoadFilter !== 'all' || (favPresets.length === 0 && favSaves.length === 0));
                      if (noResults) {
                        return <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                          「{saveLoadSearchQuery}」に一致するデータが見つかりません
                        </div>;
                      }

                      // プリセット行 (お気に入り上部分離 & 行ボタン対応)
                      const renderPresetRow = (p: PresetData) => {
                        const v = getPresetVisibility(p);
                        const vMeta = PRESET_VISIBILITY_META[v];
                        const isFav = favoriteIds.includes(p.id);
                        return (
                          <div key={p.id} style={{ padding: '10px 12px', background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '8px', cursor: 'pointer' }}
                            onClick={() => { stopAutoRouteIfActive(); routeApi.loadFromLocal(`__preset__${p.id}`); setPresetListVisible(false); }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                                  title={isFav ? t('お気に入り解除') : t('お気に入り登録')}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: isFav ? '#ffd700' : 'var(--text-muted)', flexShrink: 0 }}
                                >
                                  <Star size={14} fill={isFav ? '#ffd700' : 'none'} />
                                </button>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffd700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                <span style={{ fontSize: '9px', padding: '1px 6px', background: 'rgba(255,215,0,0.2)', color: '#ffd700', borderRadius: '4px', flexShrink: 0 }}>{t('プリセット')}</span>
                                {v !== 'public' && (
                                  <span
                                    title={vMeta.description}
                                    style={{ fontSize: '9px', padding: '1px 6px', background: `${vMeta.color}22`, color: vMeta.color, border: `1px solid ${vMeta.color}55`, borderRadius: '4px', flexShrink: 0, fontWeight: 700 }}
                                  >
                                    {vMeta.emoji} {vMeta.label}
                                  </span>
                                )}
                              </div>
                              {isLocal && isEditMode && (
                                <button
                                  style={{ fontSize: '9px', padding: '2px 6px', background: defaultPresetId === p.id ? 'var(--cyan-neon)' : 'transparent', color: defaultPresetId === p.id ? '#000' : 'var(--text-muted)', border: '1px solid var(--cyan-neon)', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
                                  onClick={(e) => { e.stopPropagation(); setDefaultPresetId(defaultPresetId === p.id ? null : p.id); }}
                                >
                                  {defaultPresetId === p.id ? '★ 基本' : '☆ 基本に設定'}
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#b0b0b0', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span>{t('獲得値: ')}<span style={{ color: '#ffd700' }}>${p.targetCash ? parseInt(String(p.targetCash).replace(/,/g, '')).toLocaleString() : '-'} / 🪙{p.targetCoins ? parseInt(String(p.targetCoins).replace(/,/g, '')).toLocaleString() : '-'}</span></span>
                              {p.description && <span style={{ color: 'var(--text-muted)' }}>{t('備考:')}</span>}
                              {p.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{p.description}</span>}
                              {p.author && <span>{t('作者: ')}{p.author}</span>}
                              {isLocal && p.renderCache && <span style={{ color: 'var(--text-muted)' }}>{t('原作者: 設定済')}</span>}
                              {p.updatedAt && <span style={{ color: 'var(--text-muted)' }}>{t('最終更新: ')}{new Date(p.updatedAt).toLocaleString()}</span>}
                            </div>
                            <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end', gap: '4px', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                className="btn-cyber"
                                style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none', borderColor: hiddenPresetIds.includes(p.id) ? 'var(--cyan-neon)' : 'var(--text-muted)', color: hiddenPresetIds.includes(p.id) ? 'var(--cyan-neon)' : 'var(--text-muted)' }}
                                onClick={() => { toggleHiddenPreset(p.id); notification.show(hiddenPresetIds.includes(p.id) ? `${p.name}: 表示に戻しました` : `${p.name}: 非表示にしました`); }}
                                title={t('このプリセットを隠す')}
                              >
                                {hiddenPresetIds.includes(p.id) ? '👁 非表示中' : '非表示'}
                              </button>
                              {isLocal && (
                                <button
                                  className="btn-cyber"
                                  style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }}
                                  onClick={() => {
                                    const url = `https://xmelosx.github.io/Nikukyu_Route/?preset=${p.id}`;
                                    navigator.clipboard.writeText(url);
                                    notification.show('本URLをコピーしました (GitHub Pages)');
                                  }}
                                  title="GitHub Pagesベースの本URLをコピーします (限定公開URL確認用)"
                                >
                                  本URLコピー
                                </button>
                              )}
                              <button
                                className="btn-cyber"
                                style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }}
                                onClick={() => { navigator.clipboard.writeText(p.id); notification.show('プリセットIDをコピーしました'); }}
                                title="プリセットIDをクリップボードにコピー"
                              >
                                IDコピー
                              </button>
                              {v !== 'private' || isLocal ? (
                                <button
                                  className="btn-cyber"
                                  style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }}
                                  onClick={() => { const url = `${window.location.origin}${window.location.pathname}?preset=${p.id}`; navigator.clipboard.writeText(url); notification.show('共有URLをコピーしました'); }}
                                  title={v === 'unlisted' ? '限定公開のURL (?preset=ID) を知っている人だけが開けます' : v === 'private' ? 'ローカルモードでのみ有効なURL' : 'このプリセットを開くURLをコピー'}
                                >
                                  URLコピー
                                </button>
                              ) : null}
                              {isLocal && isEditMode && (
                                <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{t('公開:')}</span>
                                  {(['public', 'unlisted', 'private'] as PresetVisibility[]).map(opt => {
                                    const optMeta = PRESET_VISIBILITY_META[opt];
                                    const isActive = v === opt;
                                    const disabled = opt === 'private' && !isLocal;
                                    return (
                                      <button
                                        key={opt}
                                        disabled={disabled}
                                        title={disabled ? 'ローカルモードでのみ選択可' : optMeta.description}
                                        onClick={() => {
                                          if (disabled) return;
                                          routeApi.setPresetVisibility(p.id, opt);
                                          notification.show(`公開レベル変更: ${p.name} → ${optMeta.label}`);
                                        }}
                                        style={{
                                          fontSize: '9px', padding: '2px 6px', clipPath: 'none',
                                          background: isActive ? optMeta.color : 'transparent',
                                          color: isActive ? '#000' : (disabled ? '#555' : optMeta.color),
                                          border: `1px solid ${disabled ? '#555' : optMeta.color}`,
                                          borderRadius: '4px',
                                          cursor: disabled ? 'not-allowed' : 'pointer',
                                          fontWeight: 700,
                                          opacity: disabled ? 0.4 : 1
                                        }}
                                      >
                                        {optMeta.emoji} {optMeta.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {isLocal && isEditMode && (
                                <button
                                  className="btn-cyber"
                                  style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none', borderColor: '#39ff14', color: '#39ff14' }}
                                  onClick={() => { routeApi.overwritePreset(p.id); }}
                                  title="現在の編集データでこのプリセットを上書き"
                                >
                                  上書き
                                </button>
                              )}
                              {isLocal && (
                                presetDeleteConfirmId === p.id ? (
                                  <>
                                    <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }} onClick={() => handleDeletePreset(p.id)}>{t('削除する')}</button>
                                    <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 8px', clipPath: 'none' }} onClick={() => setPresetDeleteConfirmId(null)}>{t('キャンセル')}</button>
                                  </>
                                ) : (
                                  <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 8px' }} onClick={() => handleDeletePreset(p.id)}>{t('削除')}</button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      };

                      const renderSaveRow = (s: SaveInfo) => {
                        const isFav = favoriteIds.includes(s.id);
                        return (
                          <div key={s.id} style={{ padding: '10px 12px', background: routeApi.route.id === s.id ? 'rgba(79,195,247,0.15)' : 'rgba(79,195,247,0.05)', border: routeApi.route.id === s.id ? '1px solid var(--cyan-neon)' : '1px solid rgba(79,195,247,0.2)', borderRadius: '8px', cursor: 'pointer' }}
                            onClick={() => { stopAutoRouteIfActive(); routeApi.loadFromLocal(s.id); setPresetListVisible(false); }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                                  title={isFav ? t('お気に入り解除') : t('お気に入り登録')}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: isFav ? '#ffd700' : 'var(--text-muted)', flexShrink: 0 }}
                                >
                                  <Star size={14} fill={isFav ? '#ffd700' : 'none'} />
                                </button>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: routeApi.route.id === s.id ? 'var(--cyan-neon)' : '#b0b0b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{s.title}</div>
                              </div>
                              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                {deleteConfirmId === s.id ? (
                                  <>
                                    <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => handleDeleteFromLocal(s.id)}>{t('削除する')}</button>
                                    <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => setDeleteConfirmId(null)}>{t('キャンセル')}</button>
                                  </>
                                ) : (
                                  isLocal && isEditMode ? (
                                    <QuickPresetButton
                                      isLocal={isLocal}
                                      onAdd={(vis) => handleQuickPreset(s, vis)}
                                    />
                                  ) : null
                                )}
                                {!deleteConfirmId && (
                                  <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => handleDeleteFromLocal(s.id)}>{t('削除')}</button>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#b0b0b0', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span>{t('獲得値: ')}<span style={{ color: 'var(--cyan-neon)' }}>${s.targetCash ? parseInt(String(s.targetCash).replace(/,/g, '')).toLocaleString() : '-'} / 🪙{s.targetCoins ? parseInt(String(s.targetCoins).replace(/,/g, '')).toLocaleString() : '-'}</span></span>
                              {s.description && <span style={{ color: 'var(--text-muted)' }}>{t('備考:')}</span>}
                              {s.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{s.description}</span>}
                              {s.hasCustomBg && (
                                <span style={{ fontSize: '9px', padding: '1px 6px', background: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid #39ff1455', borderRadius: '4px', flexShrink: 0, fontWeight: 700 }}>
                                  🖼 {t('カスタムBG: あり')}
                                </span>
                              )}
                              <SaveListRowAuthor
                                authorEnc={s.author || ''}
                                renderCacheEnc={s.renderCache || ''}
                                routeId={s.id}
                                createdAt={s.createdAt}
                                presetSourceId={(s as any).presetSourceId || null}
                              />
                              <span style={{ color: 'var(--text-muted)' }}>最終更新: {new Date(s.updatedAt).toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      };

                      return (<>
                        {/* === お気に入りセクション (上部固定) === */}
                        {(favPresets.length > 0 || favSaves.length > 0) && (
                          <div style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.4)', borderRadius: '8px', padding: '8px', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', padding: '0 4px' }}>
                              <Star size={12} fill="#ffd700" color="#ffd700" />
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffd700' }}>{t('お気に入り')}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({favPresets.length + favSaves.length})</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {favPresets.map(p => renderPresetRow(p))}
                              {favSaves.map(s => renderSaveRow(s))}
                            </div>
                          </div>
                        )}

                        {/* === 通常のリスト (お気に入り以外) === */}
                        {saveLoadFilter !== 'favorites' && (<>
                          {listPresets.filter(p => !favoriteIds.includes(p.id)).map(p => renderPresetRow(p))}
                          {listSaves.filter(s => !favoriteIds.includes(s.id)).map(s => renderSaveRow(s))}
                        </>)}

                        {/* === 非表示プリセット (フッター) === */}
                        {saveLoadFilter !== 'favorites' && saveLoadFilter !== 'saves' && hiddenPresetsList.length > 0 && (
                          <details style={{ marginTop: '6px' }}>
                            <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 6px', userSelect: 'none' }}>
                              {t('隠したプリセット (クリックで復帰)')} ({hiddenPresetsList.length})
                            </summary>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', padding: '4px' }}>
                              {hiddenPresetsList.map(p => {
                                const isFav = favoriteIds.includes(p.id);
                                return (
                                  <div key={p.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      onClick={() => { toggleHiddenPreset(p.id); notification.show(`${p.name}: 表示に戻しました`); }}
                                      style={{ background: 'transparent', border: '1px solid var(--cyan-neon)', color: 'var(--cyan-neon)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                                      title={t('隠したプリセットを表示')}
                                    >
                                      {t('隠したプリセットを表示')}
                                    </button>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                    <button
                                      onClick={() => toggleFavorite(p.id)}
                                      title={isFav ? t('お気に入り解除') : t('お気に入り登録')}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: isFav ? '#ffd700' : 'var(--text-muted)' }}
                                    >
                                      <Star size={12} fill={isFav ? '#ffd700' : 'none'} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </>);
                    })()}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <UrlLoadConfirmModal
        target={urlLoadConfirm}
        presets={routeApi.presets}
        onClose={() => setUrlLoadConfirm(null)}
        onConfirm={(target) => {
          stopAutoRouteIfActive();
          if (target.type === 'preset') {
            routeApi.loadFromLocal(`__preset__${target.id}`);
          } else {
            const data = DataManager.loadFromLocalStorage(target.id);
            if (data) {
              const { data: migrated, result, legacyMigrated } = migrateLoadedRoute(data);
              if (legacyMigrated || result.applied.length > 0) {
                DataManager.saveToLocalStorage(migrated);
              }
              if (result.unknown) {
                notification.show(`⚠️ 未登録バージョンのセーブデータです (v${result.unknownVersion})。そのまま読み込みます。`, 5000);
              } else if (result.applied.length > 0) {
                notification.show(`セーブデータを ${result.applied.length} 件マイグレーションしました (→ v${result.finalVersion})`, 3000);
              }
              routeApi.setRouteWithGlobalDefaults(migrated);
              historyApi.clearHistory();
              if (migrated.markerScale !== undefined) {
                setMarkerScale(migrated.markerScale);
                localStorage.setItem('heist_marker_scale', String(migrated.markerScale));
              }
            }
          }
          notification.show(`${t('読み込み完了: ')}${target.name}`);
          setUrlLoadConfirm(null);
        }}
      />

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
          // 原作者名を「意図的に No name として設定」する。 メモリ上は AUTHOR_DEFAULT_PLAIN
          // 文字列 (= 'No name') として保持。 保存時に 'No name' の暗号文 (= AUTHOR_UNKNOWN_MARKER
          // 'v2:0:') に変換されて localStorage に書かれる。 ロード時は復号して 'No name' に戻る。
          // (= 「No name」は設定値 AUTHOR_DEFAULT_PLAIN で表現、 空文字 = Anomaly とは別)
          routeApi.setRoute(prev => ({ ...prev, renderCache: AUTHOR_DEFAULT_PLAIN }));
          notification.show('原作者名を No name にリセットしました');
        }}
        showDetectionRanges={showDetectionRanges}
        onSetShowDetectionRanges={setShowDetectionRanges}
        stopMarkerThreshold={stopMarkerThreshold}
        setStopMarkerThreshold={setStopMarkerThreshold}
        movementMarkerThreshold={movementMarkerThreshold}
        setMovementMarkerThreshold={setMovementMarkerThreshold}
        warpMarkerThreshold={warpMarkerThreshold}
        setWarpMarkerThreshold={setWarpMarkerThreshold}
        skillCdThreshold={skillCdThreshold}
        setSkillCdThreshold={setSkillCdThreshold}
        autoLoadLastRoute={autoLoadLastRoute}
        onSetAutoLoadLastRoute={setAutoLoadLastRoute}
        autoSaveEnabled={autoSaveEnabled}
        onSetAutoSaveEnabled={setAutoSaveEnabled}
        autoSaveInterval={autoSaveInterval}
        onSetAutoSaveInterval={setAutoSaveInterval}
        onShowOcrDebug={() => setShowOcrDebugModal(true)}
        spawnFeatureEnabled={spawnServerEnabled}
        onSpawnFeatureEnabledChange={handleSpawnFeatureToggle}
        skillCdPresets={globalDefaults.skillCdPresets}
        onAddSkillCdPreset={globalDefaults.addSkillCdPreset}
        onUpdateSkillCdPreset={globalDefaults.updateSkillCdPreset}
        onRemoveSkillCdPreset={globalDefaults.removeSkillCdPreset}
      />

      <HistoryModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        markers={isLocal ? [...globalMarkersStore.globalMarkers, ...routeApi.route.markers] : [...routeApi.route.markers]}
        globalMarkerIds={globalMarkersStore.globalMarkers.map(m => m.id)}
        onFocusTrigger={setFocusTrigger}
      />

      <SaveModal
        show={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onExport={handleSaveModalExport}
        route={routeApi.route}
        currentFloor={currentFloor}
        canvas={canvasRef.current}
        svgString={svgString}
        globalMarkers={isLocal ? globalMarkersStore.globalMarkers : []}
      />

      <CrashInfoModal
        info={lastCrashInfo}
        onClose={() => setLastCrashInfo(null)}
        onCopy={(msg) => notification.show(msg)}
      />
    </div>
  );
}
