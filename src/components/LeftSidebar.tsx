import React from 'react';
import { t } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { EraserSubMenu } from './EraserSubMenu';
import { MeasureSubMenu } from './MeasureSubMenu';
import {
  Undo,
  Redo,
  Move,
  Ruler,
  Paintbrush,
  Eraser,
  EyeOff,
  Star,
  Wand2,
  Fence,
  RotateCcw,
} from 'lucide-react';
import {
  MARKER_META,
  TEXTCOLOR_OPTIONS,
  TEXTCOLOR_META,
  SPAWN_CATEGORIES,
  smoothStrokePointsKeepEnds,
  PRESET_MAPS_META,
  generateId,
} from '../utils/DataManager';
import type {
  MarkerType,
  FloorType,
  HeistMarker,
  RouteData,
  SpawnPoint,
  RegisteredItem,
  SkillCdPreset,
  SkillCdMode,
} from '../utils/types';
import type { UseRouteApi } from '../hooks/useRoute';
import type { UseGlobalMarkersApi } from '../hooks/useGlobalMarkers';
import type { UseHistoryApi } from '../hooks/useHistory';
import type { UseGlobalSpawnsApi } from '../hooks/useGlobalSpawns';
import type { GlobalWalls } from '../hooks/useGlobalWalls';
import type { GlobalDefaults } from '../hooks/useGlobalDefaults';


// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------
export interface LeftSidebarProps {
  // --- Grouped hook APIs ---
  routeApi: UseRouteApi;
  globalMarkersStore: UseGlobalMarkersApi;
  historyApi: UseHistoryApi;
  autoRoute: {
    status: { active: boolean; running: boolean; elapsed: number; totalTime: number; totalDistance: number; totalStopTime: number; speed: number; error: string | null; nextMarkerLabel: string; currentStopLabel: string; stopRemaining: number; waitRemaining: number; checkpoints: { elapsed: number; label: string; passed: boolean; ignored: boolean; unset: boolean; conflicted: boolean; targetTime: number }[]; skillCdInfo: { label: string; color: string; remaining: number; total: number } | null };
    setStatus: React.Dispatch<React.SetStateAction<{ active: boolean; running: boolean; elapsed: number; totalTime: number; totalDistance: number; totalStopTime: number; speed: number; error: string | null; nextMarkerLabel: string; currentStopLabel: string; stopRemaining: number; waitRemaining: number; checkpoints: { elapsed: number; label: string; passed: boolean; ignored: boolean; unset: boolean; conflicted: boolean; targetTime: number }[]; skillCdInfo: { label: string; color: string; remaining: number; total: number } | null }>>;
    command: { action: string; ts: number; seekTo?: number } | null;
    sendCommand: (action: string, seekTo?: number) => void;
    waitEnabled: boolean;
    setWaitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    waitSeconds: number;
    setWaitSeconds: React.Dispatch<React.SetStateAction<number>>;
    startStopSeconds: number;
    setStartStopSeconds: React.Dispatch<React.SetStateAction<number>>;
    speedMode: string;
    setSpeedMode: React.Dispatch<React.SetStateAction<string>>;
    manualSpeed: number;
    setManualSpeed: React.Dispatch<React.SetStateAction<number>>;
    speedMultiplier: 1 | 2 | 3 | 5 | 10;
    setSpeedMultiplier: React.Dispatch<React.SetStateAction<1 | 2 | 3 | 5 | 10>>;
    followCamera: boolean;
    setFollowCamera: React.Dispatch<React.SetStateAction<boolean>>;
    fuseMode: boolean;
    setFuseMode: React.Dispatch<React.SetStateAction<boolean>>;
    inactiveMarkersMode: boolean;
    setInactiveMarkersMode: React.Dispatch<React.SetStateAction<boolean>>;
    collapsed: boolean;
    toggleCollapsed: () => void;
  };
  spawnApi: UseGlobalSpawnsApi;
  globalWalls: GlobalWalls;
  globalDefaults: {
    setStartupFocusMarkerId: (id: string | null) => void;
    setHidden: (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => void;
    setStorageLimit: (bytes: number) => void;
    storageLimitBytes: number;
    loaded: boolean;
    isLocal: boolean;
    skillCdPresets: SkillCdPreset[];
    addSkillCdPreset: (input: { label: string; color: string; mode: SkillCdMode; seconds: number; perSecondCd: number }) => SkillCdPreset;
    updateSkillCdPreset: (id: string, patch: Partial<Omit<SkillCdPreset, "id">>) => void;
    removeSkillCdPreset: (id: string) => void;
  };
  notification: {
    message: string | null;
    show: (msg: string, ms?: number) => void;
    clear: () => void;
    durationMs: number;
  };

  // --- Refs ---
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  itemImageInputRef: React.RefObject<HTMLInputElement | null>;
  routeRef: React.MutableRefObject<RouteData>;
  spawnUndoRef: React.MutableRefObject<SpawnPoint[][]>;
  spawnRedoRef: React.MutableRefObject<SpawnPoint[][]>;
  globalDefaultsRef: React.MutableRefObject<GlobalDefaults>;
  spawnFilterCacheRef: React.MutableRefObject<string[] | null>;

  // --- Individual state values + setters ---
  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  toolMode: string;
  setToolMode: React.Dispatch<React.SetStateAction<string>>;
  isLocal: boolean;
  currentFloor: FloorType;
  showSpawnFeature: boolean;

  // Display/tool state
  showSettingsExpanded: boolean;
  setShowSettingsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  markerVisibilityExpanded: boolean;
  setMarkerVisibilityExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  floorNavCollapsed: boolean;
  setFloorNavCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  showMarkerLabels: boolean;
  setShowMarkerLabels: React.Dispatch<React.SetStateAction<boolean>>;
  markerScale: number;
  setMarkerScale: React.Dispatch<React.SetStateAction<number>>;
  textPinPassThrough: boolean;
  setTextPinPassThrough: React.Dispatch<React.SetStateAction<boolean>>;
  showPhoneCompass: boolean;
  setShowPhoneCompass: React.Dispatch<React.SetStateAction<boolean>>;
  showPhoneBoxHud: boolean;
  setShowPhoneBoxHud: React.Dispatch<React.SetStateAction<boolean>>;
  phoneBoxHudSize: number;
  setPhoneBoxHudSize: React.Dispatch<React.SetStateAction<number>>;
  showBottomRightHud: boolean;
  setShowBottomRightHud: React.Dispatch<React.SetStateAction<boolean>>;
  zoomHudSize: number;
  setZoomHudSize: React.Dispatch<React.SetStateAction<number>>;

  // Edit/tool state
  editStrokeIdxs: Set<number>;
  setEditStrokeIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  editSmoothIterations: number;
  setEditSmoothIterations: React.Dispatch<React.SetStateAction<number>>;
  blockMarkerClicksDuringTools: boolean;
  setBlockMarkerClicksDuringTools: React.Dispatch<React.SetStateAction<boolean>>;
  isAltPressed: boolean;
  measureSelectedStrokeIdxs: Set<number>;
  setMeasureSelectedStrokeIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  eraseTarget: string;
  setEraseTarget: React.Dispatch<React.SetStateAction<string>>;
  eraseSize: number;
  setEraseSize: React.Dispatch<React.SetStateAction<number>>;
  eraseDefaultBehavior: string;
  setEraseDefaultBehavior: React.Dispatch<React.SetStateAction<string>>;
  hideStrokesDuringWalls: boolean;
  setHideStrokesDuringWalls: React.Dispatch<React.SetStateAction<boolean>>;
  hideMarkersDuringWalls: boolean;
  setHideMarkersDuringWalls: React.Dispatch<React.SetStateAction<boolean>>;
  bypassWallsEnabled: boolean;
  setBypassWallsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  bypassShortestOnly: boolean;
  setBypassShortestOnly: React.Dispatch<React.SetStateAction<boolean>>;
  strokeColor: string;
  setStrokeColor: React.Dispatch<React.SetStateAction<string>>;
  strokeWidth: number;
  setStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  strokeType: string;
  setStrokeType: React.Dispatch<React.SetStateAction<string>>;
  drawMode: string;
  setDrawMode: React.Dispatch<React.SetStateAction<string>>;

  // Floor navigation
  setCurrentPosTrigger: React.Dispatch<React.SetStateAction<number>>;
  setFocusTrigger: React.Dispatch<React.SetStateAction<{ id: string; timestamp: number } | null>>;
  resetTarget: string | null;
  setResetTarget: React.Dispatch<React.SetStateAction<string | null>>;

  // Spawn-specific state
  spawnToolMode: string;
  setSpawnToolMode: React.Dispatch<React.SetStateAction<string>>;
  spawnMoveX: number;
  setSpawnMoveX: React.Dispatch<React.SetStateAction<number>>;
  spawnMoveY: number;
  setSpawnMoveY: React.Dispatch<React.SetStateAction<number>>;
  spawnMovingPointId: string | null;
  setSpawnMovingPointId: React.Dispatch<React.SetStateAction<string | null>>;
  spawnViewPointId: string | null;
  setSpawnViewPointId: React.Dispatch<React.SetStateAction<string | null>>;
  viewerFilterPlayers: number | null;
  setViewerFilterPlayers: React.Dispatch<React.SetStateAction<number | null>>;
  spawnHideOther: boolean;
  setSpawnHideOther: React.Dispatch<React.SetStateAction<boolean>>;
  spawnHideBg: boolean;
  setSpawnHideBg: React.Dispatch<React.SetStateAction<boolean>>;
  spawnFocusTrigger: { x: number; y: number; ts: number } | null;
  setSpawnFocusTrigger: React.Dispatch<React.SetStateAction<{ x: number; y: number; ts: number } | null>>;
  editPointId: string | null;
  setEditPointId: React.Dispatch<React.SetStateAction<string | null>>;
  showEditModal: boolean;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  editAddItemId: string;
  setEditAddItemId: React.Dispatch<React.SetStateAction<string>>;
  editAddPlayerCount: number;
  setEditAddPlayerCount: React.Dispatch<React.SetStateAction<number>>;
  itemFormName: string;
  setItemFormName: React.Dispatch<React.SetStateAction<string>>;
  itemFormTextColor: string;
  setItemFormTextColor: React.Dispatch<React.SetStateAction<string>>;
  itemFormFans: number;
  setItemFormFans: React.Dispatch<React.SetStateAction<number>>;
  itemFormCoins: number;
  setItemFormCoins: React.Dispatch<React.SetStateAction<number>>;
  itemFormEditId: string | null;
  setItemFormEditId: React.Dispatch<React.SetStateAction<string | null>>;
  itemFormDescription: string;
  setItemFormDescription: React.Dispatch<React.SetStateAction<string>>;
  showItemModal: boolean;
  setShowItemModal: React.Dispatch<React.SetStateAction<boolean>>;
  bulkInput: string;
  setBulkInput: React.Dispatch<React.SetStateAction<string>>;
  bulkColor: string;
  setBulkColor: React.Dispatch<React.SetStateAction<string>>;
  itemFormImage: string;
  setItemFormImage: React.Dispatch<React.SetStateAction<string>>;

  // Marker list state
  globalMarkerListExpanded: boolean;
  setGlobalMarkerListExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  localMarkerListExpanded: boolean;
  setLocalMarkerListExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  activeMarkerType: MarkerType | null;
  setActiveMarkerType: React.Dispatch<React.SetStateAction<MarkerType | null>>;

  // Route line display toggles
  hideRouteLines: boolean;
  setHideRouteLines: React.Dispatch<React.SetStateAction<boolean>>;
  routeLines1px: boolean;
  setRouteLines1px: React.Dispatch<React.SetStateAction<boolean>>;
  hideBranchLines: boolean;
  setHideBranchLines: React.Dispatch<React.SetStateAction<boolean>>;
  branchLines1px: boolean;
  setBranchLines1px: React.Dispatch<React.SetStateAction<boolean>>;

  // Modal state
  showHelpModal: boolean;
  setShowHelpModal: React.Dispatch<React.SetStateAction<boolean>>;
  showOcrDebugModal: boolean;
  rightTab: string;

  // --- Callbacks ---
  updateStrokes: (newStrokes: DrawingStroke[]) => Promise<void> | void;
  updateGlobalWalls: (next: Record<string, any>) => void;
  postGlobalDefaults: (hiddenMarkers: string[], hiddenMarkerTypes: string[], stopTh?: number, moveTh?: number, warpTh?: number, skillTh?: number) => void;
  openSubWindow: () => void;
  handleHideGlobalMarker: (markerId: string) => void;
  handleShowGlobalMarker: (markerId: string) => void;
  handleHideGlobalMarkerType: (markerType: MarkerType) => void;
  handleShowGlobalMarkerType: (markerType: MarkerType) => void;
  handleToggleMarkerVisibility: (markerId: string) => void;
  pushSpawnHistory: () => void;
  undoPoints: () => void;
  redoPoints: () => void;
  handleSpawnPointAdd: (x: number, y: number) => void;
  handleSpawnPointEdit: (id: string) => void;
  handleSpawnPointView: (id: string) => void;
  handleSpawnMoveComplete: (id: string, x: number, y: number) => void;
  handlePointAddItem: (pointId: string, itemId: string, playerCount: number) => void;
  handlePointRemoveItem: (pointId: string, itemIdx: number) => void;
  handleItemSave: () => void;
  handleBulkImport: () => void;
  handleItemImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // --- Constants ---
  warpColor: string;
  stairsColor: string;
  memoizedStrokes: DrawingStroke[];

  // Sidebar collapse (for styling)
  leftSidebarCollapsed: boolean;
  isMobile: boolean;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------
const LeftSidebar: React.FC<LeftSidebarProps> = ({
  routeApi,
  globalMarkersStore,
  historyApi,
  autoRoute,
  spawnApi,
  globalWalls,
  globalDefaults,
  notification,
  canvasRef,
  itemImageInputRef,
  routeRef,
  spawnUndoRef,
  spawnRedoRef,
  globalDefaultsRef,
  spawnFilterCacheRef,
  isEditMode,
  setIsEditMode,
  toolMode,
  setToolMode,
  isLocal,
  currentFloor,
  showSpawnFeature,
  showSettingsExpanded,
  setShowSettingsExpanded,
  markerVisibilityExpanded,
  setMarkerVisibilityExpanded,
  floorNavCollapsed,
  setFloorNavCollapsed,
  showMarkerLabels,
  setShowMarkerLabels,
  markerScale,
  setMarkerScale,
  textPinPassThrough,
  setTextPinPassThrough,
  showPhoneCompass,
  setShowPhoneCompass,
  showPhoneBoxHud,
  setShowPhoneBoxHud,
  phoneBoxHudSize,
  setPhoneBoxHudSize,
  showBottomRightHud,
  setShowBottomRightHud,
  zoomHudSize,
  setZoomHudSize,
  editStrokeIdxs,
  setEditStrokeIdxs,
  editSmoothIterations,
  setEditSmoothIterations,
  blockMarkerClicksDuringTools,
  setBlockMarkerClicksDuringTools,
  isAltPressed,
  measureSelectedStrokeIdxs,
  setMeasureSelectedStrokeIdxs,
  eraseTarget,
  setEraseTarget,
  eraseSize,
  setEraseSize,
  eraseDefaultBehavior,
  setEraseDefaultBehavior,
  hideStrokesDuringWalls,
  setHideStrokesDuringWalls,
  hideMarkersDuringWalls,
  setHideMarkersDuringWalls,
  bypassWallsEnabled,
  setBypassWallsEnabled,
  bypassShortestOnly,
  setBypassShortestOnly,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  strokeType,
  setStrokeType,
  drawMode,
  setDrawMode,
  setCurrentPosTrigger,
  setFocusTrigger,
  resetTarget,
  setResetTarget,
  spawnToolMode,
  setSpawnToolMode,
  spawnMoveX,
  setSpawnMoveX,
  spawnMoveY,
  setSpawnMoveY,
  spawnMovingPointId,
  setSpawnMovingPointId,
  spawnViewPointId,
  setSpawnViewPointId,
  viewerFilterPlayers,
  setViewerFilterPlayers,
  spawnHideOther,
  setSpawnHideOther,
  spawnHideBg,
  setSpawnHideBg,
  spawnFocusTrigger,
  setSpawnFocusTrigger,
  editPointId,
  setEditPointId,
  showEditModal,
  setShowEditModal,
  editAddItemId,
  setEditAddItemId,
  editAddPlayerCount,
  setEditAddPlayerCount,
  itemFormName,
  setItemFormName,
  itemFormTextColor,
  setItemFormTextColor,
  itemFormFans,
  setItemFormFans,
  itemFormCoins,
  setItemFormCoins,
  itemFormEditId,
  setItemFormEditId,
  itemFormDescription,
  setItemFormDescription,
  showItemModal,
  setShowItemModal,
  bulkInput,
  setBulkInput,
  bulkColor,
  setBulkColor,
  itemFormImage,
  setItemFormImage,
  globalMarkerListExpanded,
  setGlobalMarkerListExpanded,
  localMarkerListExpanded,
  setLocalMarkerListExpanded,
  activeMarkerType,
  setActiveMarkerType,
  hideRouteLines,
  setHideRouteLines,
  routeLines1px,
  setRouteLines1px,
  hideBranchLines,
  setHideBranchLines,
  branchLines1px,
  setBranchLines1px,
  showHelpModal,
  setShowHelpModal,
  showOcrDebugModal,
  rightTab,
  updateStrokes,
  updateGlobalWalls,
  postGlobalDefaults,
  openSubWindow,
  handleHideGlobalMarker,
  handleShowGlobalMarker,
  handleHideGlobalMarkerType,
  handleShowGlobalMarkerType,
  handleToggleMarkerVisibility,
  pushSpawnHistory,
  undoPoints,
  redoPoints,
  handleSpawnPointAdd,
  handleSpawnPointEdit,
  handleSpawnPointView,
  handleSpawnMoveComplete,
  handlePointAddItem,
  handlePointRemoveItem,
  handleItemSave,
  handleBulkImport,
  handleItemImageUpload,
  warpColor,
  stairsColor,
  memoizedStrokes,
  leftSidebarCollapsed,
  isMobile,
}) => {
  return (
        {/* Left Sidebar */}
        <section
          className="sidebar glass-panel"
          data-collapsed={leftSidebarCollapsed}
          style={isMobile ? {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 'min(85vw, 320px)',
            zIndex: 200,
            transform: leftSidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)',
            transition: 'transform 0.25s ease',
            display: 'flex',
            borderRight: '1px solid var(--border-color)',
          } : { display: leftSidebarCollapsed ? 'none' : 'flex' }}
        >
          <div className="sidebar-fixed">
            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'rgba(5, 7, 10, 0.6)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <button
                  className={`btn-cyber ${isEditMode ? 'active' : ''}`}
                  style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                  onClick={() => { setIsEditMode(true); }}
                >
                  ✏️ {t('編集モード')}
                </button>
                <button
                  className={`btn-cyber ${!isEditMode ? 'active success' : ''}`}
                  style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                  onClick={() => { setIsEditMode(false); setToolMode('move'); }}
                >
                  👁 {t('表示モード')}
                </button>
              </div>
            </div>
          </div>

          <div className="sidebar-scroll">
            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ flex: 1 }}>
                  <LanguageSwitcher />
                </div>
                <button
                  className="btn-cyber"
                  onClick={() => setShowHelpModal(true)}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', clipPath: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                >
                  ❓ {t('ヘルプ・設定')}
                </button>
              </div>
            </div>

            <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setShowSettingsExpanded(!showSettingsExpanded)}
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
                  fontWeight: 'bold',
                  marginBottom: showSettingsExpanded ? '8px' : '0'
                }}
              >
                <span>{t('⚙️ 表示設定')}</span>
                <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{showSettingsExpanded ? t('▼ 折りたたむ') : t('▶ 展開')}</span>
              </button>

              {showSettingsExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={showMarkerLabels}
                      onChange={(e) => {
                        setShowMarkerLabels(e.target.checked);
                        localStorage.setItem('heist_show_labels', String(e.target.checked));
                      }}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    <span>{t('🏷️ ラベル表示')}</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <span>{t('📌 ピン・ラベル倍率:')}</span>
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
                      <span>{t('最小 (30%)')}</span>
                      <span>{t('最大 (200%)')}</span>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={textPinPassThrough}
                      onChange={(e) => setTextPinPassThrough(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('🖱️ 表示モードでテキストピンのクリックを透過')}
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={showPhoneCompass}
                      onChange={(e) => setShowPhoneCompass(e.target.checked)}
                      style={{ accentColor: '#ff00ff', cursor: 'pointer' }}
                    />
                    {t('🧭 最寄り起動中 ReroRero電話ボックスの方向コンパス (常時起動は除外)')}
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={showPhoneBoxHud}
                      onChange={(e) => setShowPhoneBoxHud(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('📞 電話ボックスHUDの表示')}
                  </label>
                  {showPhoneBoxHud && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
                        <span>{t('HUDサイズ:')}</span>
                        <span style={{ color: '#ff00ff', fontWeight: 'bold' }}>{phoneBoxHudSize}%</span>
                      </div>
                      <input
                        type="range" min="60" max="140" step="5"
                        value={phoneBoxHudSize}
                        onChange={(e) => setPhoneBoxHudSize(parseInt(e.target.value))}
                        style={{ accentColor: '#ff00ff', cursor: 'pointer', width: '100%' }}
                      />
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={showBottomRightHud}
                      onChange={(e) => setShowBottomRightHud(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('🔍 右下HUD (ズームコントロール) の表示')}
                  </label>
                  {showBottomRightHud && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
                        <span>{t('HUDサイズ:')}</span>
                        <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{zoomHudSize}%</span>
                      </div>
                      <input
                        type="range" min="60" max="140" step="5"
                        value={zoomHudSize}
                        onChange={(e) => setZoomHudSize(parseInt(e.target.value))}
                        style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                      />
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '4px' }}>
                    <button className="btn-cyber" style={{ width: '100%', padding: '5px 8px', fontSize: '11px', clipPath: 'none' }} onClick={openSubWindow}>
                      🗔 {t('別ウィンドウで開く (フルマップ)')}
                    </button>
                  </div>
                </div>
              )}

              {/* MARKER VISIBILITYアコーディオン */}
              <button
                type="button"
                onClick={() => setMarkerVisibilityExpanded(!markerVisibilityExpanded)}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  fontSize: '11px',
                  background: 'rgba(255, 0, 255, 0.05)',
                  border: '1px solid rgba(255, 0, 255, 0.15)',
                  borderRadius: '4px',
                  color: 'var(--text-accent, #ff00ff)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                  marginTop: '8px',
                  marginBottom: markerVisibilityExpanded ? '8px' : '0'
                }}
              >
                <span>{t('👁️ MARKER VISIBILITY')}</span>
                <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{markerVisibilityExpanded ? t('▼ 折りたたむ') : t('▶ 展開')}</span>
              </button>

              {markerVisibilityExpanded && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#7ec8e3', fontWeight: 'bold' }}>GLOBAL:</div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                        onClick={() => {
                          const current = routeApi.route.hiddenMarkerTypes || [];
                          const targetTypes = ['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'];
                          const next = current.filter(t => !targetTypes.includes(t as string));
                          if (next.length === current.length) return;
                          const nextHidden = routeApi.route.hiddenMarkers || [];
                          postGlobalDefaults(nextHidden, next);
                          routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: next }));
                        }}>ALL ON</button>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                        onClick={() => {
                          const current = routeApi.route.hiddenMarkerTypes || [];
                          const targetTypes = ['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'];
                          const additions = targetTypes.filter(t => !current.includes(t));
                          if (additions.length === 0) return;
                          const next = Array.from(new Set([...current, ...additions]));
                          const nextHidden = routeApi.route.hiddenMarkers || [];
                          postGlobalDefaults(nextHidden, next);
                          routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: next }));
                        }}>ALL OFF</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
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
                          const current = routeApi.route.hiddenMarkerTypes || [];
                          const targetTypes = ['start', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'];
                          const next = current.filter(t => !targetTypes.includes(t as string));
                          if (next.length === current.length) return;
                          const nextHidden = routeApi.route.hiddenMarkers || [];
                          postGlobalDefaults(nextHidden, next);
                          routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: next }));
                        }}>ALL ON</button>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                        onClick={() => {
                          const current = routeApi.route.hiddenMarkerTypes || [];
                          const targetTypes = ['start', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3', 'checkpoint'];
                          const additions = targetTypes.filter(t => !current.includes(t));
                          if (additions.length === 0) return;
                          const next = Array.from(new Set([...current, ...additions]));
                          const nextHidden = routeApi.route.hiddenMarkers || [];
                          postGlobalDefaults(nextHidden, next);
                          routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: next }));
                        }}>ALL OFF</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(['start', 'checkpoint', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'p1', 'p2', 'p3'] as MarkerType[]).map(t => {
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
              )}
            </div>

            <div className="panel-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="panel-title" style={{ marginBottom: 0 }}>{t('階層移動')}</div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none' }} onClick={() => setCurrentPosTrigger(Date.now())} title={t('現在の自動ルート位置にカメラを移動')}>
                    {t('📍 現在位置に移動')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloorNavCollapsed(prev => !prev)}
                    title={floorNavCollapsed ? t('展開') : t('折りたたむ')}
                    style={{
                      padding: '3px 6px',
                      fontSize: '11px',
                      background: 'rgba(0, 255, 255, 0.05)',
                      border: '1px solid rgba(0, 255, 255, 0.15)',
                      borderRadius: '4px',
                      color: 'var(--cyan-neon)',
                      cursor: 'pointer',
                      lineHeight: 1
                    }}
                  >
                    {floorNavCollapsed ? '▶' : '▼'}
                  </button>
                </div>
              </div>
              {!floorNavCollapsed && (
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
              )}
            </div>



            {isEditMode && (
              <div className="panel-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <div className="panel-title" style={{ flex: 1, marginBottom: 0 }}>{t('モード選択')}</div>
                  <button className="btn-cyber" onClick={historyApi.undo} disabled={!historyApi.canUndo} title="Undo (Ctrl+Z)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canUndo ? 1 : 0.4, cursor: historyApi.canUndo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Undo size={12} /></button>
                  <button className="btn-cyber" onClick={historyApi.redo} disabled={!historyApi.canRedo} title="Redo (Ctrl+Y)" style={{ padding: '2px 6px', fontSize: '10px', opacity: historyApi.canRedo ? 1 : 0.4, cursor: historyApi.canRedo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Redo size={12} /></button>
                </div>
                <div className="tool-grid">
                  <button className={`tool-btn ${toolMode === 'move' ? 'active' : ''}`} onClick={() => setToolMode('move')} id="tool-move-btn">
                    <Move size={18} /><span>{t('移動')}</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'measure' ? 'active' : ''}`} onClick={() => setToolMode('measure')} id="tool-measure-btn">
                    <Ruler size={18} /><span>{t('距離計測')}</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'draw' ? 'active' : ''}`} onClick={() => setToolMode('draw')} id="tool-draw-btn">
                    <Paintbrush size={18} /><span>{t('ルート線')}</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'edit-stroke' ? 'active' : ''}`} onClick={() => setToolMode('edit-stroke')} id="tool-edit-stroke-btn">
                    <Wand2 size={18} /><span>{t('線分編集')}</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'erase' ? 'active' : ''}`} onClick={() => setToolMode('erase')} id="tool-erase-btn">
                    <Eraser size={18} /><span>{t('消しゴム')}</span>
                  </button>
                  <button className={`tool-btn ${toolMode === 'toggle-vis' ? 'active' : ''}`} onClick={() => setToolMode('toggle-vis')} id="tool-toggle-vis-btn">
                    <EyeOff size={18} /><span>{t('表示切替')}</span>
                  </button>
                  {showSpawnFeature && (
                    <button className={`tool-btn ${toolMode === 'add-spawn' ? 'active' : ''}`} onClick={() => setToolMode(toolMode === 'add-spawn' ? 'move' : 'add-spawn')} id="tool-add-spawn-btn" style={{ borderColor: 'rgba(57, 255, 20, 0.4)' }}>
                      <Star size={18} style={{ color: '#39ff14' }} /><span style={{ color: '#39ff14' }}>{t('スポーン')}</span>
                    </button>
                  )}
                  {isLocal && (
                    <>
                      <button className={`tool-btn ${toolMode === 'draw-wall' ? 'active' : ''}`} onClick={() => setToolMode('draw-wall')} id="tool-draw-wall-btn" style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}>
                        <Fence size={18} style={{ color: '#ff0055' }} /><span>{t('壁（直線）')}</span>
                      </button>
                      <button className={`tool-btn ${toolMode === 'erase-wall' ? 'active' : ''}`} onClick={() => setToolMode('erase-wall')} id="tool-erase-wall-btn" style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}>
                        <Eraser size={18} style={{ color: '#ff0055' }} /><span>{t('壁（消しゴム）')}</span>
                      </button>
                    </>
                  )}
                  {!resetTarget ? (
                    <button className="tool-btn" onClick={() => setResetTarget('both')} id="tool-reset-btn">
                      <RotateCcw size={18} /><span>{t('リセット')}</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', background: 'rgba(255,100,100,0.1)', borderRadius: '6px', border: '1px solid rgba(255,100,100,0.3)' }}>
                      <div style={{ fontSize: '10px', color: '#ff6b6b', textAlign: 'center', marginBottom: '2px' }}>{t('削除対象を選択:')}</div>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] } }));
                        setResetTarget(null);
                      }}>{t('📝 ラインのみ')}</button>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, markers: [], hiddenMarkers: [] }));
                        setResetTarget(null);
                      }}>{t('📍 ピンのみ')}</button>
                      <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => {
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] }, markers: [], hiddenMarkers: [] }));
                        setResetTarget(null);
                      }}>{t('🗑️ 両方削除')}</button>
                      <button className="btn-cyber" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => setResetTarget(null)}>{t('キャンセル')}</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {toolMode === 'edit-stroke' && (
              <div className="panel-section">
                <div className="panel-title">{t('線分編集設定')}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '6px', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={blockMarkerClicksDuringTools}
                    onChange={(e) => setBlockMarkerClicksDuringTools(e.target.checked)}
                    style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                  />
                  {t('マーカーを遮断')}
                </label>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  <span>{t('選択中の線:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{editStrokeIdxs.size}{t('本')}</span>
                </div>
                <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} onClick={() => {
                    const cur = routeApi.route.strokes[currentFloor];
                    if (!cur) return;
                    const all = new Set<number>();
                    for (let i = 0; i < cur.length; i++) all.add(i);
                    setEditStrokeIdxs(all);
                  }}>{t('すべて選択')}</button>
                  <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={editStrokeIdxs.size === 0} onClick={() => setEditStrokeIdxs(new Set())}>{t('選択を解除')}</button>
                  <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={editStrokeIdxs.size === 0} onClick={() => {
                    const cur = routeApi.route.strokes[currentFloor];
                    if (!cur) return;
                    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                    const next = cur.filter((_, i) => !editStrokeIdxs.has(i));
                    updateStrokes(next);
                    setEditStrokeIdxs(new Set());
                    notification.show(t('{0}本の線を削除しました', String(editStrokeIdxs.size)));
                  }}>{t('選択を削除')}</button>
                </div>



                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0 6px' }} />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{t('色 (クリックで選択線に適用):')}</div>
                <div className="color-picker">
                  {['#ff0055', '#ffe600', '#39ff14', '#00f0ff', '#ff00ff', '#ffffff'].map(c => (
                    <div
                      key={c}
                      className={`color-dot ${strokeColor === c ? 'active' : ''}`}
                      style={{ backgroundColor: c, color: c }}
                      onClick={() => {
                        setStrokeColor(c);
                        if (editStrokeIdxs.size === 0) return;
                        const cur = routeApi.route.strokes[currentFloor];
                        if (!cur) return;
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        const next = cur.map((s, i) => editStrokeIdxs.has(i) ? { ...s, color: c } : s);
                        updateStrokes(next);
                      }}
                      title={c}
                    />
                  ))}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{t('線種:')}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['solid', 'dashed'] as const).map(t2 => (
                    <button
                      key={t2}
                      className={`btn-cyber ${strokeType === t2 ? 'active' : ''}`}
                      style={{ flex: 1, padding: '4px 2px', fontSize: '10px' }}
                      onClick={() => {
                        setStrokeType(t2);
                        if (editStrokeIdxs.size === 0) return;
                        const cur = routeApi.route.strokes[currentFloor];
                        if (!cur) return;
                        historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                        const next = cur.map((s, i) => editStrokeIdxs.has(i) ? { ...s, type: t2 } : s);
                        updateStrokes(next);
                      }}
                    >
                      {t2 === 'solid' ? t('進行ルート') : t('分岐ルート')}
                    </button>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  <span>{t('線の太さ:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="12"
                  value={strokeWidth}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setStrokeWidth(v);
                    if (editStrokeIdxs.size === 0) return;
                    const cur = routeApi.route.strokes[currentFloor];
                    if (!cur) return;
                    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                    const next = cur.map((s, i) => editStrokeIdxs.has(i) ? { ...s, width: v } : s);
                    updateStrokes(next);
                  }}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                />

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{t('✨ 平滑化')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  <span>{t('繰り返し回数:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{editSmoothIterations}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={editSmoothIterations}
                  onChange={(e) => setEditSmoothIterations(parseInt(e.target.value))}
                  style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
                />
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                  {t('先頭と末尾は必ず保持。線が途切れて再接続不能にならない安全版で平滑化します。')}
                </div>
                <button
                  className="btn-cyber"
                  style={{ width: '100%', fontSize: '10px', padding: '5px', marginTop: '6px' }}
                  disabled={editStrokeIdxs.size === 0}
                  onClick={() => {
                    const cur = routeApi.route.strokes[currentFloor];
                    if (!cur) return;
                    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                    const next = cur.map((s, i) => {
                      if (!editStrokeIdxs.has(i)) return s;
                      if (!s.points || s.points.length < 3) return s;
                      const newPoints = smoothStrokePointsKeepEnds(s.points, editSmoothIterations, 0.5);
                      const baseForOriginal = s.originalPoints && s.originalPoints.length >= 2
                        ? s.originalPoints
                        : s.points;
                      const newOriginal = smoothStrokePointsKeepEnds(baseForOriginal, editSmoothIterations, 0.5);
                      return { ...s, points: newPoints, originalPoints: newOriginal };
                    });
                    updateStrokes(next);
                    notification.show(t('{0}本の線を平滑化しました', String(editStrokeIdxs.size)));
                  }}
                >
                  ✨ {t('選択線を平滑化')}
                </button>
                <button
                  className="btn-cyber"
                  style={{ width: '100%', fontSize: '10px', padding: '5px', marginTop: '6px' }}
                  onClick={() => {
                    const cur = routeApi.route.strokes[currentFloor];
                    if (!cur || cur.length === 0) return;
                    historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                    const next = cur.map((s) => {
                      if (!s.points || s.points.length < 3) return s;
                      const newPoints = smoothStrokePointsKeepEnds(s.points, editSmoothIterations, 0.5);
                      const baseForOriginal = s.originalPoints && s.originalPoints.length >= 2
                        ? s.originalPoints
                        : s.points;
                      const newOriginal = smoothStrokePointsKeepEnds(baseForOriginal, editSmoothIterations, 0.5);
                      return { ...s, points: newPoints, originalPoints: newOriginal };
                    });
                    updateStrokes(next);
                    notification.show(t('全 {0} 本の線を平滑化しました', String(next.length)));
                  }}
                >
                  ✨ {t('すべての線を平滑化')}
                </button>
              </div>
            )}

            {toolMode === 'erase' && (
              <EraserSubMenu
                eraseTarget={eraseTarget}
                setEraseTarget={setEraseTarget}
                eraseSize={eraseSize}
                setEraseSize={setEraseSize}
                eraseDefaultBehavior={eraseDefaultBehavior}
                setEraseDefaultBehavior={setEraseDefaultBehavior}
                isAltPressed={isAltPressed}
              />
            )}

            {toolMode === 'measure' && (
              <MeasureSubMenu
                blockMarkerClicksDuringTools={blockMarkerClicksDuringTools}
                setBlockMarkerClicksDuringTools={setBlockMarkerClicksDuringTools}
                selectedCount={measureSelectedStrokeIdxs.size}
                onClear={() => setMeasureSelectedStrokeIdxs(new Set())}
                onSelectAll={() => {
                  const cur = routeApi.route.strokes[currentFloor];
                  if (!cur) return;
                  const all = new Set<number>();
                  for (let i = 0; i < cur.length; i++) all.add(i);
                  setMeasureSelectedStrokeIdxs(all);
                }}
                onDeleteSelected={() => {
                  const cur = routeApi.route.strokes[currentFloor];
                  if (!cur) return;
                  historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                  const next = cur.filter((_, i) => !measureSelectedStrokeIdxs.has(i));
                  updateStrokes(next);
                  setMeasureSelectedStrokeIdxs(new Set());
                  notification.show(t('{0}本の線を削除しました', String(measureSelectedStrokeIdxs.size)));
                }}
              />
            )}

            {(toolMode === 'draw-wall' || toolMode === 'erase-wall') && (
              <div className="panel-section">
                <div className="panel-title">{t('壁エディタ設定')}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '8px' }}>
                  {t('マップの背景画像をもとに、黒い線を壁として自動検出できます。')}
                </div>
                <button
                  className="btn-cyber success"
                  style={{ width: '100%', marginBottom: '8px', padding: '6px' }}
                  onClick={async () => {
                    const path = routeApi.route.customBg[currentFloor] ?? PRESET_MAPS_META[currentFloor]?.path;
                    if (!path) {
                      notification.show(t('背景画像が見つかりません'));
                      return;
                    }
                    notification.show(t('壁の自動検出を実行中...'));
                    const { detectWallsFromImage } = await import('./utils/WallDetector');
                    const detected = await detectWallsFromImage(path as string);
                    if (detected.length > 0) {
                      const prevWalls = JSON.parse(JSON.stringify(globalWalls));
                      const nextWalls = {
                        ...globalWalls,
                        [currentFloor]: detected
                      };
                      historyApi.pushHistory(
                        routeRef.current.strokes,
                        routeRef.current.markers,
                        globalMarkersStore.globalMarkers,
                        prevWalls
                      );
                      updateGlobalWalls(nextWalls);
                      notification.show(t('{0} 本の壁を自動検出しました', String(detected.length)));
                    } else {
                      notification.show(t('壁が検出されませんでした（または読み込み失敗）'));
                    }
                  }}
                >
                  🔍 {t('壁の自動検出を実行')}
                </button>
                <button
                  className="btn-cyber danger"
                  style={{ width: '100%', padding: '6px' }}
                  onClick={() => {
                    const prevWalls = JSON.parse(JSON.stringify(globalWalls));
                    const nextWalls = {
                      ...globalWalls,
                      [currentFloor]: []
                    };
                    historyApi.pushHistory(
                      routeRef.current.strokes,
                      routeRef.current.markers,
                      globalMarkersStore.globalMarkers,
                      prevWalls
                    );
                    updateGlobalWalls(nextWalls);
                    notification.show(t('壁データをクリアしました'));
                  }}
                >
                  🗑️ {t('壁データをクリア')}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={hideStrokesDuringWalls}
                      onChange={(e) => setHideStrokesDuringWalls(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('ルート線を非表示')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={hideMarkersDuringWalls}
                      onChange={(e) => setHideMarkersDuringWalls(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('マーカーを非表示')}
                  </label>
                </div>
              </div>
            )}

            {toolMode === 'draw' && (
              <div className="panel-section">
                <div className="panel-title">{t('ルート線設定')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={bypassWallsEnabled}
                      onChange={(e) => setBypassWallsEnabled(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    {t('壁を自動で迂回する')}
                  </label>
                  {bypassWallsEnabled && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={bypassShortestOnly}
                        onChange={(e) => setBypassShortestOnly(e.target.checked)}
                        style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                      />
                      {t('終始直結')}
                    </label>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '6px', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={blockMarkerClicksDuringTools}
                    onChange={(e) => setBlockMarkerClicksDuringTools(e.target.checked)}
                    style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                  />
                  {t('マーカーを遮断')}
                </label>
                <div className="color-picker">
                  {['#ff0055', '#ffe600', '#39ff14', '#00f0ff', '#ff00ff', '#ffffff'].map(c => (
                    <div key={c} className={`color-dot ${strokeColor === c ? 'active' : ''}`} style={{ backgroundColor: c, color: c }} onClick={() => setStrokeColor(c)} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {(['solid', 'dashed', 'temporary'] as const).map(st => (
                    <button key={st} className={`btn-cyber ${strokeType === st ? 'active' : ''}`} style={{ flex: 1, padding: '4px 2px', fontSize: '10px' }} onClick={() => setStrokeType(st)}>
                      {st === 'solid' ? t('進行ルート') : st === 'dashed' ? t('分岐ルート') : t('一時線')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {(['free', 'smooth', 'straight'] as const).map(m => (
                    <button key={m} className={`btn-cyber ${drawMode === m ? 'active' : ''}`} style={{ flex: 1, padding: '4px 2px', fontSize: '10px' }} onClick={() => setDrawMode(m)} title={m === 'free' ? t('通常描画 (全ポイント記録)') : m === 'smooth' ? t('間引き描画 (滑らかな線)') : t('直線ツール (始点→終点のみ)')}>
                      {m === 'free' ? t('フリー') : m === 'smooth' ? t('スムーズ') : t('直線')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('線の太さ: ')}{strokeWidth}px</span>
                  <input type="range" min="2" max="12" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                </div>
              </div>
            )}

            {toolMode === 'add-spawn' && showSpawnFeature && (
              <>
                <div className="panel-section">
                  <div className="panel-title" style={{ fontSize: '10px' }}>スポーン</div>
                  <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
                    {([
                      { key: 'place' as const, label: '設置' },
                      { key: 'erase' as const, label: '消しゴム' },
                      { key: 'edit' as const, label: '編集' },
                      { key: 'manage' as const, label: '管理' },
                    ]).map(t => (
                      <button key={t.key}
                        className={`tool-btn ${spawnToolMode === t.key ? 'active' : ''}`}
                        style={{ height: 26, fontSize: '9px', padding: '2px', minWidth: 0 }}
                        onClick={() => { setSpawnToolMode(t.key); setToolMode('add-spawn'); }}
                      >{t.label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none', flex: 1 }}
                      disabled={spawnUndoRef.current.length === 0}
                      onClick={undoPoints}>↩ 元に戻す</button>
                    <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none', flex: 1 }}
                      disabled={spawnRedoRef.current.length === 0}
                      onClick={redoPoints}>↪ やり直し</button>
                  </div>
                </div>

                {/* ---- 設置 ---- */}
                {spawnToolMode === 'place' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
                      マップをクリックして点を追加
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      点を打った後、「編集」タブでアイテムを追加してください。
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginTop: '6px' }}>
                      スポーン点: <span style={{ color: 'var(--cyan-neon)' }}>{spawnApi.points.length}</span>
                    </div>
                  </div>
                )}

                {/* ---- 編集 ---- */}
                {spawnToolMode === 'edit' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>編集</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      マップ上のスポーン点をクリックして編集
                    </div>
                    {editPointId && (
                      <div style={{ fontSize: '9px', color: 'var(--cyan-neon)' }}>
                        編集中: X:{spawnApi.points.find(p => p.id === editPointId)?.x ?? '?'} Y:{spawnApi.points.find(p => p.id === editPointId)?.y ?? '?'}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- 消しゴム ---- */}
                {spawnToolMode === 'erase' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>消しゴム</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      マップ上のスポーン点をクリックして削除
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--red-neon)' }}>削除はローカルのみ反映</div>
                    <button className="btn-cyber danger" style={{ width: '100%', fontSize: '9px', padding: '4px', clipPath: 'none', marginTop: '6px' }}
                      onClick={() => { const empty = spawnApi.points.filter(p => !p.items || p.items.length === 0); if (empty.length === 0) return; pushSpawnHistory(); empty.forEach(p => spawnApi.removePoint(p.id)); }}>
                      未設定の点を一括除去 ({spawnApi.points.filter(p => !p.items || p.items.length === 0).length})
                    </button>
                  </div>
                )}

                {/* ---- アイテム管理 ---- */}
                {spawnToolMode === 'manage' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
                      アイテム管理
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      登録アイテム数: {spawnApi.items.length}
                    </div>
                    <button className="btn-cyber success" style={{ width: '100%', fontSize: '10px', padding: '6px', clipPath: 'none' }}
                      onClick={() => setShowItemModal(true)}>
                      アイテム登録/編集を開く
                    </button>
                  </div>
                )}

                {/* 共通設定 (全モード) */}
                <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={spawnHideOther}
                      onChange={e => setSpawnHideOther(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                    マーカーと線を隠す
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginTop: '4px' }}>
                    <input type="checkbox" checked={spawnHideBg}
                      onChange={e => setSpawnHideBg(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                    背景を隠す
                  </label>
                </div>
                <div className="panel-section">
                  <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
                    点を探す ({spawnApi.points.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '150px', overflowY: 'auto' }}>
                    {spawnApi.points.length === 0 ? (
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>点がありません</div>
                    ) : (
                      [...spawnApi.points].reverse().map(p => (
                        <button key={p.id} onClick={() => setSpawnFocusTrigger({ x: p.x, y: p.y, ts: Date.now() })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '9px', padding: '3px 6px',
                            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(79,195,247,0.15)',
                            borderRadius: '3px', cursor: 'pointer', color: 'var(--text-primary)',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#39ff14', display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>X:{p.x} Y:{p.y}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>{(p.items || []).length}点</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* アイテム管理モーダル */}
            {showItemModal && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.75)', zIndex: 5000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} onClick={() => setShowItemModal(false)}>
                <div style={{
                  background: 'var(--panel-bg, #0a0e18)', width: '520px', maxHeight: '85vh',
                  border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)' }}>アイテム管理</span>
                    <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }} onClick={() => setShowItemModal(false)}>✕ 閉じる</button>
                  </div>
                  <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                    {/* 個別登録フォーム */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--cyan-neon)' }}>{itemFormEditId ? 'アイテム編集' : '新規アイテム登録'}</div>
                      <input className="input-cyber" placeholder="アイテム名"
                        value={itemFormName} onChange={e => setItemFormName(e.target.value)}
                        style={{ fontSize: '14px', padding: '8px 12px' }} />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {TEXTCOLOR_OPTIONS.map(c => {
                          const tc = TEXTCOLOR_META[c];
                          const isSel = itemFormTextColor === c;
                          return (
                            <button key={c} onClick={() => setItemFormTextColor(c)}
                              style={{
                                flex: 1, fontSize: '11px', padding: '6px 8px',
                                border: `2px solid ${tc.color}${isSel ? 'ff' : '44'}`,
                                background: isSel ? `${tc.color}33` : 'transparent',
                                color: tc.color, borderRadius: '6px', cursor: 'pointer',
                                fontWeight: isSel ? 700 : 400,
                              }}
                            >{tc.label}</button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <label style={{ flex: 1, fontSize: '13px', color: '#ffd700', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                          ファンス
                          <input type="number" min="0" step="100" value={itemFormFans}
                            onChange={e => setItemFormFans(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: '120px', fontSize: '15px', fontWeight: 700, padding: '6px 10px', background: '#0a0e18', color: '#ffd700', border: '1px solid rgba(255,215,0,0.4)', borderRadius: '4px' }} />
                        </label>
                        <label style={{ flex: 1, fontSize: '13px', color: '#ff9500', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                          コイン
                          <input type="number" min="0" step="10" value={itemFormCoins}
                            onChange={e => setItemFormCoins(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: '120px', fontSize: '15px', fontWeight: 700, padding: '6px 10px', background: '#0a0e18', color: '#ff9500', border: '1px solid rgba(255,149,0,0.4)', borderRadius: '4px' }} />
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input className="input-cyber" placeholder="画像URL"
                          value={itemFormImage} onChange={e => setItemFormImage(e.target.value)}
                          style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }} />
                        <button className="btn-cyber" style={{ fontSize: '11px', padding: '4px 10px', clipPath: 'none', flexShrink: 0 }}
                          onClick={() => itemImageInputRef.current?.click()}>参照</button>
                        {itemFormImage && (
                          <button className="btn-cyber danger" style={{ fontSize: '11px', padding: '4px 10px', clipPath: 'none', flexShrink: 0 }}
                            onClick={() => setItemFormImage('')}>✕</button>
                        )}
                        <input ref={itemImageInputRef} type="file" accept="image/*" onChange={handleItemImageUpload} style={{ display: 'none' }} />
                      </div>
                      <textarea className="textarea-cyber" placeholder="説明 (任意)"
                        value={itemFormDescription} onChange={e => setItemFormDescription(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 10px', minHeight: '50px', resize: 'vertical' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-cyber success" style={{ flex: 1, fontSize: '12px', padding: '8px', clipPath: 'none' }}
                          onClick={handleItemSave} disabled={!itemFormName.trim()}>
                          {itemFormEditId ? '更新' : '登録'}
                        </button>
                        {itemFormEditId && (
                          <button className="btn-cyber" style={{ fontSize: '12px', padding: '8px', clipPath: 'none' }}
                            onClick={() => { setItemFormEditId(null); setItemFormName(''); setItemFormDescription(''); setItemFormTextColor('blue'); setItemFormFans(0); setItemFormCoins(0); }}>
                            キャンセル
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 一括インポート */}
                    <details style={{ marginBottom: '16px' }}>
                      <summary style={{ fontSize: '12px', color: 'var(--cyan-neon)', cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                        一括インポート
                      </summary>
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          名前⇔ファンス⇔コイン⇔説明 (タブ区切り、1行1アイテム)
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                          {TEXTCOLOR_OPTIONS.map(c => {
                            const tc = TEXTCOLOR_META[c];
                            const isSel = bulkColor === c;
                            return (
                              <button key={c} onClick={() => setBulkColor(c)}
                                style={{
                                  flex: 1, fontSize: '9px', padding: '4px 6px',
                                  border: `1px solid ${tc.color}${isSel ? 'ff' : '33'}`,
                                  background: isSel ? `${tc.color}33` : 'transparent',
                                  color: tc.color, borderRadius: '4px', cursor: 'pointer',
                                  fontWeight: isSel ? 700 : 400,
                                }}
                              >{tc.label}</button>
                            );
                          })}
                        </div>
                        <textarea className="textarea-cyber"
                          value={bulkInput} onChange={e => setBulkInput(e.target.value)}
                          placeholder={'サンプル:\nアイテム名1\t750\t3\t説明文1\nアイテム名2\t640\t3\t説明文2'}
                          style={{ fontSize: '11px', padding: '6px 10px', minHeight: '100px', resize: 'vertical', width: '100%' }} />
                        <button className="btn-cyber success" style={{ width: '100%', fontSize: '12px', padding: '8px', clipPath: 'none', marginTop: '6px' }}
                          onClick={handleBulkImport} disabled={!bulkInput.trim()}>
                          インポート
                        </button>
                      </div>
                    </details>

                    {/* 登録済み一覧 */}
                    <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        登録済みアイテム ({spawnApi.items.length})
                      </div>
                      {spawnApi.items.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>アイテムがありません。上記フォームから登録してください。</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {spawnApi.items.map(item => {
                            const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                            const ptCount = spawnApi.points.filter(p => p.items && p.items.some(pi => pi.itemId === item.id)).length;
                            return (
                              <div key={item.id} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '12px', padding: '8px 10px',
                                background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                              }}>
                                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: tc?.color || '#fff', fontWeight: 600, fontSize: '13px' }}>
                                      {item.name}
                                    </span>
                                    {item.image && (
                                      <a href={item.image} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '10px', color: 'var(--cyan-neon)', textDecoration: 'none', flexShrink: 0 }}
                                        title={item.image}>🖼</a>
                                    )}
                                    <span style={{ color: '#ffd700', fontSize: '12px', fontWeight: 600 }}>{item.fans.toLocaleString()}F</span>
                                    <span style={{ color: '#ff9500', fontSize: '12px', fontWeight: 600 }}>{item.coins.toLocaleString()}C</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{ptCount}点</span>
                                  </div>
                                  {item.description && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                                <button className="btn-cyber" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none', flexShrink: 0 }}
                                  onClick={() => { setItemFormEditId(item.id); setItemFormName(item.name); setItemFormDescription(item.description || ''); setItemFormImage(item.image || ''); setItemFormTextColor(item.textColor); setItemFormFans(item.fans); setItemFormCoins(item.coins); }}>
                                  編集
                                </button>
                                <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none' }}
                                  onClick={() => spawnApi.removeItem(item.id)}>
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* スポーン点編集モーダル */}
            {showEditModal && editPointId && (() => {
              const pt = spawnApi.points.find(p => p.id === editPointId);
              if (!pt) return null;
              return (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.75)', zIndex: 5001,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => { setShowEditModal(false); setEditPointId(null); }}>
                  <div style={{
                    background: 'var(--panel-bg, #0a0e18)', width: '520px', maxHeight: '85vh',
                    border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)' }}>
                        スポーン点編集
                      </span>
                      <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }}
                        onClick={() => { setShowEditModal(false); setEditPointId(null); }}>✕ 閉じる</button>
                    </div>
                    {/* 座標移動 + 種別 */}
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(79,195,247,0.1)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>座標</span>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          X
                          <input type="number" value={spawnMoveX}
                            onChange={e => setSpawnMoveX(parseInt(e.target.value) || 0)}
                            style={{ width: '70px', fontSize: '12px', padding: '4px 6px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }} />
                        </label>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Y
                          <input type="number" value={spawnMoveY}
                            onChange={e => setSpawnMoveY(parseInt(e.target.value) || 0)}
                            style={{ width: '70px', fontSize: '12px', padding: '4px 6px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }} />
                        </label>
                        <button className="btn-cyber success" style={{ fontSize: '10px', padding: '4px 10px', clipPath: 'none' }}
                          onClick={() => { pushSpawnHistory(); spawnApi.updatePoint(pt.id, { x: spawnMoveX, y: spawnMoveY }); }}>
                          移動
                        </button>
                        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 10px', clipPath: 'none' }}
                          onClick={() => { setSpawnMovingPointId(pt.id); setShowEditModal(false); setEditPointId(null); }}>
                          配置し直す
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>種別</span>
                        <select value={pt.category ?? ''} onChange={e => spawnApi.updatePoint(pt.id, { category: e.target.value as any || undefined })}
                          style={{ fontSize: '12px', padding: '4px 8px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }}>
                          <option value="">-</option>
                          {SPAWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                      {/* 登録アイテム一覧 */}
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        アイテム一覧 ({(pt.items || []).length})
                      </div>
                      {(!pt.items || pt.items.length === 0) ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                          アイテムが未登録です。下のフォームから追加してください。
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                          {pt.items.map((pi, idx) => {
                            const item = spawnApi.items.find(i => i.id === pi.itemId);
                            const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                            return (
                              <div key={idx} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '12px', padding: '8px 10px',
                                background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                              }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ color: tc?.color || '#fff', flex: 1, fontWeight: 600 }}>{item?.name || '(不明)'}</span>
                                <span style={{ color: '#ffd700', fontWeight: 600 }}>{item?.fans.toLocaleString() || '0'}F</span>
                                <span style={{ color: '#ff9500', fontWeight: 600 }}>{item?.coins.toLocaleString() || '0'}C</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>{pi.playerCount}P</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{new Date(pi.discoveredAt).toLocaleDateString()}</span>
                                <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '2px 6px', clipPath: 'none', flexShrink: 0 }}
                                  onClick={() => handlePointRemoveItem(pt.id, idx)}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* アイテム追加 */}
                      <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>アイテム追加</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {/* 出現頻度順にソートしたアイテムタブ */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                            {[...spawnApi.items]
                              .map(i => ({ item: i, count: spawnApi.points.filter(p => p.items && p.items.some(pi => pi.itemId === i.id)).length }))
                              .sort((a, b) => b.count - a.count)
                              .map(({ item }) => {
                                const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                                const isSel = editAddItemId === item.id;
                                return (
                                  <button key={item.id} onClick={() => setEditAddItemId(isSel ? '' : item.id)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                      fontSize: '11px', padding: '5px 8px',
                                      border: `2px solid ${tc?.color || '#888'}${isSel ? 'ff' : '44'}`,
                                      background: isSel ? `${tc?.color}33` : 'rgba(0,0,0,0.3)',
                                      color: tc?.color || '#fff', borderRadius: '6px', cursor: 'pointer',
                                      fontWeight: isSel ? 700 : 400,
                                    }}
                                  >
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block' }} />
                                    <span>{item.name}</span>
                                  </button>
                                );
                              })}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                              プレイヤー人数
                              <input type="number" min="1" max="4" value={editAddPlayerCount}
                                onChange={e => setEditAddPlayerCount(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                                style={{ width: '60px', fontSize: '14px', fontWeight: 700, padding: '6px 10px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '4px', textAlign: 'center' }} />
                            </label>
                            <button className="btn-cyber success" style={{ flex: 1, fontSize: '13px', padding: '8px 16px', clipPath: 'none' }}
                              disabled={!editAddItemId}
                              onClick={() => handlePointAddItem(pt.id, editAddItemId, editAddPlayerCount)}>追加</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* スポーン点ビューワーモーダル */}
            {spawnViewPointId && (() => {
              const pt = spawnApi.points.find(p => p.id === spawnViewPointId);
              if (!pt) { return null; }
              const filteredItems = !pt.items ? [] : viewerFilterPlayers === null
                ? pt.items : pt.items.filter(pi => pi.playerCount === viewerFilterPlayers);
              const grouped: { [id: string]: { item: RegisteredItem | undefined; count: number } } = {};
              for (const pi of filteredItems) {
                if (!grouped[pi.itemId]) grouped[pi.itemId] = { item: spawnApi.items.find(i => i.id === pi.itemId), count: 0 };
                grouped[pi.itemId].count++;
              }
              const sorted = Object.values(grouped).sort((a, b) => b.count - a.count);
              return (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setSpawnViewPointId(null)}>
                  <div style={{ background: 'var(--panel-bg, #0a0e18)', width: '400px', maxHeight: '70vh', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)' }}>点情報 X:{pt.x} Y:{pt.y}{pt.category ? ` (${pt.category})` : ''}</span>
                      <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }} onClick={() => setSpawnViewPointId(null)}>✕ 閉じる</button>
                    </div>
                    {/* 人数絞り込み */}
                    <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', borderBottom: '1px solid rgba(79,195,247,0.1)' }}>
                      {[{ v: null, label: '全データ' }, { v: 1, label: '1人' }, { v: 2, label: '2人' }, { v: 3, label: '3人' }, { v: 4, label: '4人' }].map(({ v, label }) => (
                        <button key={String(v)} onClick={() => setViewerFilterPlayers(v)}
                          style={{
                            flex: 1, fontSize: '11px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                            border: `1px solid ${v === viewerFilterPlayers ? '#39ff14' : 'rgba(255,255,255,0.15)'}`,
                            background: v === viewerFilterPlayers ? 'rgba(57,255,20,0.15)' : 'transparent',
                            color: v === viewerFilterPlayers ? '#39ff14' : 'var(--text-muted)',
                            fontWeight: v === viewerFilterPlayers ? 700 : 400,
                          }}
                        >{label}</button>
                      ))}
                    </div>
                    <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                      {sorted.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>該当アイテムなし</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {sorted.map(({ item, count }) => {
                            const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                            return (
                              <div key={item?.id || Math.random()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ color: tc?.color || '#fff', fontWeight: 700, fontSize: '14px', flex: 1 }}>{item?.name || '(不明)'}</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px' }}>{count}回</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button className="btn-cyber" style={{ width: '100%', fontSize: '11px', padding: '6px', clipPath: 'none', marginTop: '10px' }}
                        onClick={() => { setSpawnFocusTrigger({ x: pt.x, y: pt.y, ts: Date.now() }); setSpawnViewPointId(null); }}>
                        点へ移動
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {isEditMode && isLocal && (
              <div className="panel-section">
                <button
                  type="button"
                  onClick={() => setGlobalMarkerListExpanded(!globalMarkerListExpanded)}
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
                  <span>{t('📍 マーカー(グローバル)')}</span>
                  <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{globalMarkerListExpanded ? t('▼ 折りたたむ') : t('▶ 展開')}</span>
                </button>
                {globalMarkerListExpanded && (
                  <div className="marker-list" style={{ marginTop: '6px' }}>
                    {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'room', 'warp', 'stairs', 'info', 'note', 'text'] as MarkerType[]).map(t => {
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
                )}
              </div>
            )}

            {isEditMode && (
              <div className="panel-section">
                <button
                  type="button"
                  onClick={() => setLocalMarkerListExpanded(!localMarkerListExpanded)}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'rgba(255, 0, 255, 0.05)',
                    border: '1px solid rgba(255, 0, 255, 0.15)',
                    borderRadius: '4px',
                    color: 'var(--text-accent, #ff00ff)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: 'bold'
                  }}
                >
                  <span>{t('📍 マーカー')}</span>
                  <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{localMarkerListExpanded ? t('▼ 折りたたむ') : t('▶ 展開')}</span>
                </button>
                {localMarkerListExpanded && (
                  <div className="marker-list" style={{ marginTop: '6px' }}>
                    {(['start', 'checkpoint', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'skill_cd', 'p1', 'p2', 'p3'] as MarkerType[]).map(mt => {
                      const meta = MARKER_META[mt];
                      const isActive = toolMode === 'add-marker' && activeMarkerType === mt;
                      return (
                        <button key={mt} className={`marker-item ${isActive ? 'active' : ''}`}
                          onClick={() => { setToolMode('add-marker'); setActiveMarkerType(mt); }}
                          style={{ '--theme-color': meta.color } as React.CSSProperties}
                          title={mt === 'skill_cd' ? t('スキルクールタイム (P1の前に配置。通過時にCD秒ぶん停止して、自動案内の累計停止行の下に残時間を表示)') : undefined}>
                          <span className="marker-icon-preview">{meta.emoji}</span>
                          <span>{mt === 'start' ? 'START' : mt === 'iwarp' ? 'I-WARP' : mt === 'skill_cd' ? 'SKILL CD' : meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 0, 255, 0.1)', paddingTop: '6px' }}>
              <div className="panel-title">{t('📈 ルート線操作')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  className={`btn-toggle-route ${hideRouteLines ? 'active' : ''}`}
                  style={{ padding: '6px 4px', fontSize: '10px', width: '100%', clipPath: 'none' }}
                  onClick={() => setHideRouteLines(!hideRouteLines)}
                >
                  {t('ルート非表示')}
                </button>
                <button
                  className={`btn-toggle-route ${routeLines1px ? 'active' : ''}`}
                  style={{ padding: '6px 4px', fontSize: '10px', width: '100%', clipPath: 'none' }}
                  onClick={() => setRouteLines1px(!routeLines1px)}
                >
                  {t('ルート 1px化')}
                </button>
                <button
                  className={`btn-toggle-route ${hideBranchLines ? 'active' : ''}`}
                  style={{ padding: '6px 4px', fontSize: '10px', width: '100%', clipPath: 'none' }}
                  onClick={() => setHideBranchLines(!hideBranchLines)}
                >
                  {t('分岐非表示')}
                </button>
                <button
                  className={`btn-toggle-route ${branchLines1px ? 'active' : ''}`}
                  style={{ padding: '6px 4px', fontSize: '10px', width: '100%', clipPath: 'none' }}
                  onClick={() => setBranchLines1px(!branchLines1px)}
                >
                  {t('分岐 1px化')}
                </button>
              </div>
            </div>

            {(() => {
              const allPhones = globalMarkersStore.globalMarkers.filter(m => m.type === 'phone');
              const activeCount = allPhones.filter(m => m.phoneActive).length;
              if (allPhones.length === 0) return null;
              return (
                <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 0, 255, 0.1)', paddingTop: '6px' }}>
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('📞 ReroRero電話ボックス')}</span>
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
              const allGlobalInfos = globalMarkersStore.globalMarkers.filter(m => m.type === 'info');
              const allIndivInfos = (routeApi.route.markers || []).filter(m => m.type === 'iinfo');
              const totalCount = allGlobalInfos.length + allIndivInfos.length;
              if (totalCount === 0) return null;
              const expandedCount = allGlobalInfos.filter(m => m.infoExpanded).length + allIndivInfos.filter(m => m.infoExpanded).length;
              return (
                <div className="panel-section" style={{ borderTop: '1px solid rgba(79, 195, 247, 0.15)', paddingTop: '6px' }}>
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ℹ️ INFO</span>
                    <span style={{ fontSize: '10px', color: 'var(--cyan-neon, #00f0ff)', fontWeight: 'bold' }}>{expandedCount}/{totalCount}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-cyber success" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const updatedGlobal = globalMarkersStore.globalMarkers.map(m => m.type === 'info' ? { ...m, infoExpanded: true } : m);
                      globalMarkersStore.replace(updatedGlobal);
                      routeApi.setRoute(prev => ({
                        ...prev,
                        markers: (prev.markers || []).map(m => m.type === 'iinfo' ? { ...m, infoExpanded: true } : m)
                      }));
                    }}>{t('すべて開く')}</button>
                    <button className="btn-cyber danger" style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} onClick={() => {
                      const updatedGlobal = globalMarkersStore.globalMarkers.map(m => m.type === 'info' ? { ...m, infoExpanded: false } : m);
                      globalMarkersStore.replace(updatedGlobal);
                      routeApi.setRoute(prev => ({
                        ...prev,
                        markers: (prev.markers || []).map(m => m.type === 'iinfo' ? { ...m, infoExpanded: false } : m)
                      }));
                    }}>{t('すべて閉じる')}</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      );
};

export default LeftSidebar;

