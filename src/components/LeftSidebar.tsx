// @ts-nocheck
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { t } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { EraserSubMenu } from './EraserSubMenu';
import { MeasureSubMenu } from './MeasureSubMenu';
import { MapCanvas } from './MapCanvas';
import {
  Undo, Redo, Move, Ruler, Paintbrush, Eraser, EyeOff, Star, Wand2, Fence, RotateCcw, ChevronLeft, ChevronRight, Image, Scissors, Link2
} from 'lucide-react';
import {
  MARKER_META, TEXTCOLOR_OPTIONS, TEXTCOLOR_META, SPAWN_CATEGORIES, PRESET_MAPS_META,
  CATEGORY_TO_POOL, POOL_LABELS,
  smoothStrokePointsKeepEnds,
} from '../utils/DataManager';
import type {
  FloorType, MarkerType, DrawingStroke, HeistMarker, RouteData,
  SpawnPoint, RegisteredItem,
} from '../utils/DataManager';
import type { GlobalMarkersStore, GlobalWalls } from '../utils/GlobalDataService';
import type { SpawnStore } from '../utils/GlobalDataService';
import type { UseHistoryApi } from '../hooks/useHistory';

export interface LeftSidebarProps {
  routeApi: any;
  globalMarkersStore: GlobalMarkersStore;
  historyApi: UseHistoryApi;
  spawnApi: SpawnStore;
  globalWalls: GlobalWalls;
  notification: { show: (msg: string, ms?: number) => void };
  canvasRef: any;
  isEditMode: boolean; setIsEditMode: (v: boolean) => void;
  toolMode: string; setToolMode: React.Dispatch<React.SetStateAction<any>>;
  isLocal: boolean; currentFloor: FloorType; showSpawnFeature: boolean; showSpawnEditFeature: boolean;
  showSettingsExpanded: boolean; setShowSettingsExpanded: (v: boolean) => void;
  markerVisibilityExpanded: boolean; setMarkerVisibilityExpanded: (v: boolean) => void;
  floorNavCollapsed: boolean; setFloorNavCollapsed: (v: any) => void;
  showMarkerLabels: boolean; setShowMarkerLabels: (v: boolean) => void;
  markerScale: number; setMarkerScale: (v: number) => void;
  textPinPassThrough: boolean; setTextPinPassThrough: (v: boolean) => void;
  drawerPinPassThrough: boolean; setDrawerPinPassThrough: (v: boolean) => void;
  showPhoneCompass: boolean; setShowPhoneCompass: (v: boolean) => void;
  showPhoneBoxHud: boolean; setShowPhoneBoxHud: (v: boolean) => void;
  phoneBoxHudSize: number; setPhoneBoxHudSize: (v: number) => void;
  showBottomRightHud: boolean; setShowBottomRightHud: (v: boolean) => void;
  zoomHudSize: number; setZoomHudSize: (v: number) => void;
  editStrokeIdxs: Set<number>; setEditStrokeIdxs: (v: Set<number>) => void;
  editSmoothIterations: number; setEditSmoothIterations: (v: number) => void;
  blockMarkerClicksDuringTools: boolean; setBlockMarkerClicksDuringTools: (v: boolean) => void;
  isAltPressed: boolean;
  measureSelectedStrokeIdxs: Set<number>; setMeasureSelectedStrokeIdxs: (v: Set<number>) => void;
  eraseTarget: string; setEraseTarget: React.Dispatch<React.SetStateAction<any>>;
  eraseSize: number; setEraseSize: (v: number) => void;
  eraseDefaultBehavior: string; setEraseDefaultBehavior: React.Dispatch<React.SetStateAction<any>>;
  hideStrokesDuringWalls: boolean; setHideStrokesDuringWalls: (v: boolean) => void;
  hideMarkersDuringWalls: boolean; setHideMarkersDuringWalls: (v: boolean) => void;
  bypassWallsEnabled: boolean; setBypassWallsEnabled: (v: boolean) => void;
  bypassShortestOnly: boolean; setBypassShortestOnly: (v: boolean) => void;
  strokeColor: string; setStrokeColor: React.Dispatch<React.SetStateAction<any>>;
  strokeWidth: number; setStrokeWidth: (v: number) => void;
  strokeType: string; setStrokeType: React.Dispatch<React.SetStateAction<any>>;
  drawMode: string; setDrawMode: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPosTrigger: (v: number) => void;
  setFocusTrigger: (v: any) => void;
  resetTarget: string | null; setResetTarget: (v: any) => void;
  spawnToolMode: string; setSpawnToolMode: React.Dispatch<React.SetStateAction<any>>;
  spawnAutoEdit: boolean; setSpawnAutoEdit: (v: boolean) => void;
  spawnPointSize: number; setSpawnPointSize: (v: number) => void;
  spawnGridSnap: number; setSpawnGridSnap: (v: number) => void;
  spawnMoveX: number; setSpawnMoveX: (v: number) => void;
  spawnMoveY: number; setSpawnMoveY: (v: number) => void;
  spawnMovingPointId: string | null; setSpawnMovingPointId: (v: string | null) => void;
  spawnViewPointId: string | null; setSpawnViewPointId: (v: string | null) => void;
  viewerFilterPlayers: number | null; setViewerFilterPlayers: (v: number | null) => void;
  spawnHideOther: boolean; setSpawnHideOther: (v: boolean) => void;
  spawnHideBg: boolean; setSpawnHideBg: (v: boolean) => void;
  spawnFocusTrigger: any; setSpawnFocusTrigger: (v: any) => void;
  editPointId: string | null; setEditPointId: (v: string | null) => void;
  showEditModal: boolean; setShowEditModal: (v: boolean) => void;
  editAddItemId: string; setEditAddItemId: React.Dispatch<React.SetStateAction<any>>;
  editAddPlayerCount: number; setEditAddPlayerCount: (v: number) => void;
  itemFormName: string; setItemFormName: React.Dispatch<React.SetStateAction<any>>;
  itemFormTextColor: string; setItemFormTextColor: React.Dispatch<React.SetStateAction<any>>;
  itemFormFans: number; setItemFormFans: (v: number) => void;
  itemFormCoins: number; setItemFormCoins: (v: number) => void;
  itemFormEditId: string | null; setItemFormEditId: (v: string | null) => void;
  itemFormDescription: string; setItemFormDescription: React.Dispatch<React.SetStateAction<any>>;
  showItemModal: boolean; setShowItemModal: (v: boolean) => void;
  bulkInput: string; setBulkInput: React.Dispatch<React.SetStateAction<any>>;
  bulkColor: string; setBulkColor: React.Dispatch<React.SetStateAction<any>>;
  itemFormImage: string; setItemFormImage: React.Dispatch<React.SetStateAction<any>>;
  globalMarkerListExpanded: boolean; setGlobalMarkerListExpanded: (v: boolean) => void;
  localMarkerListExpanded: boolean; setLocalMarkerListExpanded: (v: boolean) => void;
  hideRouteLines: boolean; setHideRouteLines: (v: boolean) => void;
  routeLines1px: boolean; setRouteLines1px: (v: boolean) => void;
  hideBranchLines: boolean; setHideBranchLines: (v: boolean) => void;
  branchLines1px: boolean; setBranchLines1px: (v: boolean) => void;
  showHelpModal: boolean; setShowHelpModal: (v: boolean) => void;
  showOcrDebugModal: boolean; rightTab: string;
  handleHideGlobalMarker: (id: string) => void;
  handleShowGlobalMarker: (id: string) => void;
  handleHideGlobalMarkerType: (type: MarkerType) => void;
  handleShowGlobalMarkerType: (type: MarkerType) => void;
  handleToggleMarkerVisibility: (id: string) => void;
  updateStrokes: (strokes: DrawingStroke[]) => void;
  updateGlobalWalls: (walls: any) => void;
  postGlobalDefaults: (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => void;
  openSubWindow: () => void;
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
  warpColor: string; stairsColor: string;
  memoizedStrokes: DrawingStroke[];
  leftSidebarCollapsed: boolean; isMobile: boolean;
  onOpenTextureUsageModal?: () => void;
  partitionWalls?: any;
  setPartitionWalls?: (v: any) => void;
  wallShapeSubMode?: string;
  setWallShapeSubMode?: (v: string) => void;
  shapeDrawMode?: 'rect' | 'path' | 'fill';
  setShapeDrawMode?: (v: string) => void;
  indentDir?: string;
  setIndentDir?: (v: string) => void;
  vertexMode?: string;
  setVertexMode?: (v: string) => void;
  onClearMask?: () => void;
  maskSubMode?: 'paint' | 'erase';
  setMaskSubMode?: (v: string) => void;
  [key: string]: any;
}

const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const {
    routeApi, globalMarkersStore, historyApi, spawnApi, globalWalls, notification,
    canvasRef, isEditMode, setIsEditMode, toolMode, setToolMode,
    isLocal, currentFloor, showSpawnFeature, showSpawnEditFeature,
    showSettingsExpanded, setShowSettingsExpanded,
    markerVisibilityExpanded, setMarkerVisibilityExpanded,
    floorNavCollapsed, setFloorNavCollapsed,
    showMarkerLabels, setShowMarkerLabels,
    markerScale, setMarkerScale,
    textPinPassThrough, setTextPinPassThrough,
    drawerPinPassThrough, setDrawerPinPassThrough,
    showPhoneCompass, setShowPhoneCompass,
    showPhoneBoxHud, setShowPhoneBoxHud,
    phoneBoxHudSize, setPhoneBoxHudSize,
    showBottomRightHud, setShowBottomRightHud,
    zoomHudSize, setZoomHudSize,
    editStrokeIdxs, setEditStrokeIdxs,
    editSmoothIterations, setEditSmoothIterations,
    blockMarkerClicksDuringTools, setBlockMarkerClicksDuringTools,
    isAltPressed,
    measureSelectedStrokeIdxs, setMeasureSelectedStrokeIdxs,
    eraseTarget, setEraseTarget,
    eraseSize, setEraseSize,
    eraseDefaultBehavior, setEraseDefaultBehavior,
    hideStrokesDuringWalls, setHideStrokesDuringWalls,
    hideMarkersDuringWalls, setHideMarkersDuringWalls,
    bypassWallsEnabled, setBypassWallsEnabled,
    bypassShortestOnly, setBypassShortestOnly,
    strokeColor, setStrokeColor,
    strokeWidth, setStrokeWidth,
    strokeType, setStrokeType,
    drawMode, setDrawMode,
    setCurrentPosTrigger, setFocusTrigger,
    resetTarget, setResetTarget,
    spawnToolMode, setSpawnToolMode,
    spawnAutoEdit, setSpawnAutoEdit,
    spawnPointSize, setSpawnPointSize,
    spawnGridSnap, setSpawnGridSnap,
    spawnPlaceCategory, setSpawnPlaceCategory,
    spawnMoveX, setSpawnMoveX, spawnMoveY, setSpawnMoveY,
    spawnMovingPointId, setSpawnMovingPointId,
    spawnViewPointId, setSpawnViewPointId,
    viewerFilterPlayers, setViewerFilterPlayers,
    spawnHideOther, setSpawnHideOther,
    spawnHideBg, setSpawnHideBg,
    spawnFocusTrigger, setSpawnFocusTrigger,
    editPointId, setEditPointId, showEditModal, setShowEditModal,
    editAddItemId, setEditAddItemId, editAddPlayerCount, setEditAddPlayerCount,
    itemFormName, setItemFormName, itemFormTextColor, setItemFormTextColor,
    itemFormFans, setItemFormFans, itemFormCoins, setItemFormCoins,
    itemFormEditId, setItemFormEditId, itemFormDescription, setItemFormDescription,
    showItemModal, setShowItemModal,
    bulkInput, setBulkInput, bulkColor, setBulkColor,
    itemFormImage, setItemFormImage,
    globalMarkerListExpanded, setGlobalMarkerListExpanded,
    localMarkerListExpanded, setLocalMarkerListExpanded,
    hideRouteLines, setHideRouteLines, routeLines1px, setRouteLines1px,
    hideBranchLines, setHideBranchLines, branchLines1px, setBranchLines1px,
    showHelpModal, setShowHelpModal, showOcrDebugModal, rightTab,
    handleHideGlobalMarker, handleShowGlobalMarker,
    handleHideGlobalMarkerType, handleShowGlobalMarkerType,
    handleToggleMarkerVisibility,
    updateStrokes, updateGlobalWalls, postGlobalDefaults, openSubWindow,
    pushSpawnHistory, undoPoints, redoPoints,
    handleSpawnPointAdd, handleSpawnPointEdit, handleSpawnPointView,
    handleSpawnMoveComplete, handlePointAddItem, handlePointRemoveItem,
    handleItemSave, handleBulkImport, handleItemImageUpload,
    warpColor, stairsColor, memoizedStrokes,
    leftSidebarCollapsed, isMobile,
    activeMarkerType, setActiveMarkerType,
    spawnUndoRef, spawnRedoRef,
    wallSubMode, setWallSubMode,
    wallAutoSnap, setWallAutoSnap,
    lockedWalls, setLockedWalls,
    wallLockedSubMode, setWallLockedSubMode,
    selectedTexture, setSelectedTexture, texturesList, selectedRepeat, setSelectedRepeat,
    fpsResolutionScale, setFpsResolutionScale, aspectFitCut, setAspectFitCut,
    onOpenTextureUsageModal,
    partitionWalls, setPartitionWalls,
    wallShapeSubMode, setWallShapeSubMode,
    shapeDrawMode, setShapeDrawMode,
    indentDir, setIndentDir,
    vertexMode, setVertexMode,
    maskSubMode, setMaskSubMode,
  } = props;
  const itemImageInputRef = useRef<HTMLInputElement>(null);
  const [previewAspect, setPreviewAspect] = useState<number>(1.0);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Item image crop state
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [cropRect, setCropRect] = useState<{x:number;y:number;w:number;h:number}>(() => {
    try { const s = localStorage.getItem('heist_item_crop_rect'); if(s) return JSON.parse(s); } catch {}
    return {x:10,y:10,w:200,h:60};
  });
  const [cropImgSize, setCropImgSize] = useState({w:0,h:0});
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropDragRef = useRef<{isDragging:boolean;type:string;startX:number;startY:number;initialX:number;initialY:number;initialW:number;initialH:number}|null>(null);
  const cropPreviewRef = useRef<HTMLCanvasElement>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string>('');
  const [confirmedCropMeta, setConfirmedCropMeta] = useState<{url:string;w:number;h:number}|null>(null);
  const [cropHoverEdge, setCropHoverEdge] = useState<string | null>(null);
  const itemFormScrollRef = useRef<HTMLDivElement>(null);
  const [itemListTab, setItemListTab] = useState('all');
  const [spawnItemTab, setSpawnItemTab] = useState('all');
  // 編集タブ 絞り込み状態（選択状況で自動判別）
  const [editFilterCategories, setEditFilterCategories] = useState<Set<string>>(new Set());
  const [editFilterItemIds, setEditFilterItemIds] = useState<Set<string>>(new Set());
  const [svMode, setSvMode] = useState<'records' | 'pool'>(() => (localStorage.getItem('heist_sv_mode') as 'records' | 'pool') || 'records');
  useEffect(() => { localStorage.setItem('heist_sv_mode', svMode); }, [svMode]);
  const [addToPoolId, setAddToPoolId] = useState<string>(Object.keys(POOL_LABELS)[0] || '');
  useEffect(() => {
    if (spawnViewPointId) {
      const pt = spawnApi.points.find(p => p.id === spawnViewPointId);
      if (pt?.category) {
        const pid = CATEGORY_TO_POOL[pt.category];
        if (pid) setAddToPoolId(pid);
      }
    }
  }, [spawnViewPointId]);

  // 編集タブの絞り込みをキャンバスに同期
  useEffect(() => {
    const cats = [...editFilterCategories];
    const items = [...editFilterItemIds];
    props.onHighlightCategoriesChange?.(cats);
    props.onHighlightItemIdsChange?.(items);
  }, [editFilterCategories, editFilterItemIds]);

  // Live crop preview (only while dragging / adjusting)
  useEffect(() => {
    if (!cropSource || !showCrop || !cropImgRef.current || !cropPreviewRef.current) return;
    const canvas = cropPreviewRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = Math.max(1, cropRect.w);
    canvas.height = Math.max(1, cropRect.h);
    ctx.drawImage(cropImgRef.current, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
    setCropPreviewUrl(canvas.toDataURL());
  }, [cropRect, cropSource, showCrop]);

  useEffect(() => {
    if (!showItemModal) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setConfirmedCropMeta(null);
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setCropSource(ev.target.result as string);
                setShowCrop(true);
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => { window.removeEventListener('paste', handlePaste); setShowCrop(false); setCropSource(null); setCropPreviewUrl(''); setConfirmedCropMeta(null); };
  }, [showItemModal]);

  // Load last rarity from localStorage when modal opens for new item
  useEffect(() => {
    if (!showItemModal || itemFormEditId) return;
    try { const v = localStorage.getItem('heist_item_last_rarity'); if (v && TEXTCOLOR_OPTIONS.includes(v)) setItemFormTextColor(v); } catch {}
  }, [showItemModal]);

  const handleFileForCrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmedCropMeta(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setCropSource(ev.target.result as string);
        setShowCrop(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmCrop = () => {
    if (!cropSource || !cropImgRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = cropRect.w;
    canvas.height = cropRect.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(cropImgRef.current, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
    const dataUrl = canvas.toDataURL();
    setItemFormImage(dataUrl);
    setConfirmedCropMeta({url:dataUrl,w:cropRect.w,h:cropRect.h});
    localStorage.setItem('heist_item_crop_rect', JSON.stringify({x:cropRect.x,y:cropRect.y,w:cropRect.w,h:cropRect.h}));
    setShowCrop(false);
    setCropSource(null);
  };

  const cancelCrop = () => { setShowCrop(false); setCropSource(null); setCropPreviewUrl(''); setConfirmedCropMeta(null); };

  // Edge detection in screen-space pixels (independent of image resolution)
  const getEdgeScreen = (sx: number, sy: number, r: typeof cropRect, scaleX: number, scaleY: number): string | null => {
    const g = 10; // grab distance in screen pixels
    const rsx = r.x / scaleX, rsy = r.y / scaleY, rsw = r.w / scaleX, rsh = r.h / scaleY;
    const onLeft = Math.abs(sx - rsx) <= g;
    const onRight = Math.abs(sx - (rsx + rsw)) <= g;
    const onTop = Math.abs(sy - rsy) <= g;
    const onBottom = Math.abs(sy - (rsy + rsh)) <= g;
    if (onTop && onLeft) return 'nw'; if (onTop && onRight) return 'ne';
    if (onBottom && onLeft) return 'sw'; if (onBottom && onRight) return 'se';
    if (onTop) return 'n'; if (onBottom) return 's'; if (onLeft) return 'w'; if (onRight) return 'e';
    return null;
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropImgRef.current || !cropSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = cropImgSize.w / rect.width;
    const scaleY = cropImgSize.h / rect.height;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const mx = sx * scaleX, my = sy * scaleY;
    let type = getEdgeScreen(sx, sy, cropRect, scaleX, scaleY);
    if (!type && mx >= cropRect.x && mx <= cropRect.x + cropRect.w && my >= cropRect.y && my <= cropRect.y + cropRect.h) type = 'move';
    if (type) {
      cropDragRef.current = {isDragging:true,type,startX:mx,startY:my,initialX:cropRect.x,initialY:cropRect.y,initialW:cropRect.w,initialH:cropRect.h};
    }
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = cropImgSize.w / rect.width;
    const scaleY = cropImgSize.h / rect.height;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const mx = Math.max(0, Math.min(cropImgSize.w, sx * scaleX));
    const my = Math.max(0, Math.min(cropImgSize.h, sy * scaleY));
    if (!cropDragRef.current) { setCropHoverEdge(getEdgeScreen(sx, sy, cropRect, scaleX, scaleY)); return; }
    const dx = mx - cropDragRef.current.startX;
    const dy = my - cropDragRef.current.startY;
    let nx = cropDragRef.current.initialX, ny = cropDragRef.current.initialY, nw = cropDragRef.current.initialW, nh = cropDragRef.current.initialH;
    const minSize = 12;
    if (cropDragRef.current.type === 'move') {
      nx = Math.max(0, Math.min(cropImgSize.w - cropDragRef.current.initialW, cropDragRef.current.initialX + dx));
      ny = Math.max(0, Math.min(cropImgSize.h - cropDragRef.current.initialH, cropDragRef.current.initialY + dy));
    } else {
      if (cropDragRef.current.type.includes('w')) { nx = Math.min(cropDragRef.current.initialX + cropDragRef.current.initialW - minSize, cropDragRef.current.initialX + dx); nw = cropDragRef.current.initialW + (cropDragRef.current.initialX - nx); }
      if (cropDragRef.current.type.includes('e')) { nw = Math.max(minSize, cropDragRef.current.initialW + dx); }
      if (cropDragRef.current.type.includes('n')) { ny = Math.min(cropDragRef.current.initialY + cropDragRef.current.initialH - minSize, cropDragRef.current.initialY + dy); nh = cropDragRef.current.initialH + (cropDragRef.current.initialY - ny); }
      if (cropDragRef.current.type.includes('s')) { nh = Math.max(minSize, cropDragRef.current.initialH + dy); }
    }
    setCropRect({x:Math.round(nx),y:Math.round(ny),w:Math.round(nw),h:Math.round(nh)});
  };

  const handleCropMouseUp = () => { cropDragRef.current = null; };

  const cursorForEdge = (e: string | null): string => {
    if (!e) return 'grab';
    if (e === 'n' || e === 's') return 'ns-resize';
    if (e === 'e' || e === 'w') return 'ew-resize';
    if (e === 'nw' || e === 'se') return 'nwse-resize';
    if (e === 'ne' || e === 'sw') return 'nesw-resize';
    return 'grab';
  };

  return (
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', gap: '6px', marginBottom: '4px' }}>
                    <span>{t('🎮 3Dビュー画質:')}</span>
                    <select
                      value={fpsResolutionScale}
                      onChange={(e) => setFpsResolutionScale(parseFloat(e.target.value))}
                      style={{
                        background: '#161925',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="1.0">{t('低 (240p)')}</option>
                      <option value="1.5">{t('中 (360p)')}</option>
                      <option value="2.0">{t('高 (480p)')}</option>
                      <option value="3.0">{t('超高 (720p)')}</option>
                      <option value="4.5">{t('極限 (1080p)')}</option>
                    </select>
                  </div>
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
                      onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; const v = Math.max(30, Math.min(200, markerScale + dir * step)); setMarkerScale(v); localStorage.setItem('heist_marker_scale', String(v)); }}
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
                        onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; setPhoneBoxHudSize(Math.max(60, Math.min(140, phoneBoxHudSize + dir * step))); }}
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
                        onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; setZoomHudSize(Math.max(60, Math.min(140, zoomHudSize + dir * step))); }}
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
                          const targetTypes = ['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text', 'drawer', 'tps', 'shelf'];
                          const next = current.filter(t => !targetTypes.includes(t as string));
                          if (next.length === current.length) return;
                          const nextHidden = routeApi.route.hiddenMarkers || [];
                          postGlobalDefaults(nextHidden, next);
                          routeApi.setRoute(prev => ({ ...prev, hiddenMarkerTypes: next }));
                        }}>ALL ON</button>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
                        onClick={() => {
                          const current = routeApi.route.hiddenMarkerTypes || [];
                          const targetTypes = ['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text', 'drawer', 'tps', 'shelf'];
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
                    {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'warp', 'stairs', 'info', 'note', 'text', 'drawer', 'tps', 'shelf'] as MarkerType[]).map(t => {
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
                  {showSpawnEditFeature && (
                    <button className={`tool-btn ${toolMode === 'add-spawn' ? 'active' : ''}`} onClick={() => setToolMode(toolMode === 'add-spawn' ? 'move' : 'add-spawn')} id="tool-add-spawn-btn" style={{ borderColor: 'rgba(57, 255, 20, 0.4)' }}>
                      <Star size={18} style={{ color: '#39ff14' }} /><span style={{ color: '#39ff14' }}>{t('スポーン')}</span>
                    </button>
                  )}
                  {isLocal && (
                    <>
                      <button className={`tool-btn ${toolMode === 'wall' ? 'active' : ''}`} onClick={() => setToolMode(toolMode === 'wall' ? 'move' : 'wall')} id="tool-wall-btn" style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}>
                        <Fence size={18} style={{ color: '#ff0055' }} /><span>{t('壁')}</span>
                      </button>
                      <button
                        className="tool-btn"
                        style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}
                        onClick={() => {
                          historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers);
                          
                          const cleanedStrokes = {
                            main: routeApi.route.strokes.main.map(stroke => {
                              const cleanedPoints = stroke.points.filter(p => p.x >= 0 && p.x <= 1600 && p.y >= 0 && p.y <= 4550);
                              return { ...stroke, points: cleanedPoints };
                            }).filter(stroke => stroke.points.length >= 2)
                          };
                          
                          const cleanedMarkers = routeApi.route.markers.filter(m => m.x >= 0 && m.x <= 1600 && m.y >= 0 && m.y <= 4550);
                          
                          routeApi.setRoute(prev => ({
                            ...prev,
                            strokes: cleanedStrokes,
                            markers: cleanedMarkers
                          }));

                          const cleanedGlobalWalls = { ...globalWalls };
                          for (const fl of Object.keys(cleanedGlobalWalls)) {
                            cleanedGlobalWalls[fl] = cleanedGlobalWalls[fl].filter(seg => {
                              const a = seg[0];
                              const b = seg[1];
                              return a.x >= 0 && a.x <= 1600 && a.y >= 0 && a.y <= 4550 &&
                                     b.x >= 0 && b.x <= 1600 && b.y >= 0 && b.y <= 4550;
                            });
                          }
                          updateGlobalWalls(cleanedGlobalWalls);

                          notification.show(t('マップ範囲外のゴミ点を一括削除しました'));
                        }}
                        title={t('マップ範囲外(0〜1600, 0〜4550)に配置されてしまった線・壁・ピンを一括削除します')}
                      >
                        <Eraser size={18} style={{ color: '#ff0055' }} /><span>{t('ゴミ点削除')}</span>
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
                  onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 1; const dir = e.deltaY > 0 ? -1 : 1; const v = Math.max(2, Math.min(12, strokeWidth + dir * step)); setStrokeWidth(v); if (editStrokeIdxs.size === 0) return; const cur = routeApi.route.strokes[currentFloor]; if (!cur) return; historyApi.pushHistory(routeApi.route.strokes, routeApi.route.markers, globalMarkersStore.globalMarkers); const next = cur.map((s, i) => editStrokeIdxs.has(i) ? { ...s, width: v } : s); updateStrokes(next); }}
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
                  onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 1; const dir = e.deltaY > 0 ? -1 : 1; setEditSmoothIterations(Math.max(1, Math.min(6, editSmoothIterations + dir * step))); }}
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

            {toolMode === 'wall' && (
              <div className="panel-section">
                <div className="panel-title">{t('壁エディタ設定')}</div>
                {/* Row 1: 描画/形状/切断/削除 */}
                <div style={{ display: 'flex', gap: '3px', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <button
                    className={`tool-btn ${wallSubMode === 'draw' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('draw')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.3)' }}
                  >
                    <span style={{ fontSize: '10px' }}>{t('描画')}</span>
                  </button>
                  <button
                    className={`tool-btn ${wallSubMode === 'shape' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('shape')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(0, 200, 255, 0.3)' }}
                  >
                    <span style={{ fontSize: '10px', color: '#00ccff' }}>{t('形状')}</span>
                  </button>
                  <button
                    className={`tool-btn ${wallSubMode === 'slice' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('slice')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.3)' }}
                  >
                    <Scissors size={14} style={{ color: '#ff0055' }} /><span style={{ fontSize: '10px' }}>{t('切断')}</span>
                  </button>
                  <button
                    className={`tool-btn ${wallSubMode === 'erase' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('erase')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.3)' }}
                  >
                    <Eraser size={14} style={{ color: '#ff0055' }} /><span style={{ fontSize: '10px' }}>{t('削除')}</span>
                  </button>
                </div>
                {/* Row 2: 頂点/移動/テクスチャ */}
                <div style={{ display: 'flex', gap: '3px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <button
                    className={`tool-btn ${wallSubMode === 'vertex' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('vertex')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(0, 200, 255, 0.3)' }}
                    title={t('壁の頂点同士をつなぐ')}
                  >
                    <Link2 size={14} style={{ color: '#00ccff' }} /><span style={{ fontSize: '10px' }}>{t('頂点')}</span>
                  </button>
                  <button
                    className={`tool-btn ${wallSubMode === 'move' || wallSubMode === 'vertex-move' ? 'active' : ''}`}
                    onClick={() => setWallSubMode(wallSubMode === 'vertex-move' ? 'move' : (wallSubMode === 'move' ? 'vertex-move' : 'move'))}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(0, 200, 255, 0.3)' }}
                    title={t('壁/頂点をドラッグして移動')}
                  >
                    <Move size={14} style={{ color: '#00ccff' }} /><span style={{ fontSize: '10px' }}>{t('移動')}</span>
                  </button>
                  <button
                    className={`tool-btn ${wallSubMode === 'texture' ? 'active' : ''}`}
                    onClick={() => setWallSubMode('texture')}
                    style={{ flex: 1, minWidth: '44px', fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.3)' }}
                  >
                    <Image size={14} style={{ color: '#ff0055' }} /><span style={{ fontSize: '10px' }}>{t('テクスチャ')}</span>
                  </button>
                </div>
                {/* テクスチャ一覧選択 (テクスチャモード時のみ) */}
                {wallSubMode === 'texture' && (
                  <>
                    <div style={{ marginBottom: '6px', display: 'flex', gap: '4px' }}>
                      <select
                        value={selectedTexture}
                        onChange={(e) => setSelectedTexture(e.target.value)}
                        style={{
                          flex: 1,
                          background: '#161925',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      >
                        <option value="">{t('❌ テクスチャ解除')}</option>
                        {texturesList.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        onClick={onOpenTextureUsageModal}
                        className="btn-cyber"
                        style={{ padding: '0 8px', fontSize: '10px', height: '24px', clipPath: 'none', display: 'flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}
                        title={t('テクスチャ画像の使用状況を表示')}
                      >
                        📊 {t('状況')}
                      </button>
                    </div>
                    {selectedTexture !== '' && (
                      <>
                        <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#888', whiteSpace: 'nowrap' }}>{t('リピート数')}:</span>
                          <select
                            value={selectedRepeat}
                            onChange={(e) => setSelectedRepeat(parseInt(e.target.value))}
                            style={{
                              flex: 1,
                              background: '#161925',
                              color: '#fff',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '4px',
                              padding: '3px 6px',
                              fontSize: '11px',
                              outline: 'none'
                            }}
                          >
                            {[1, 2, 3, 4, 5].map(n => (
                              <option key={n} value={n}>{n}倍</option>
                            ))}
                          </select>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', marginBottom: '6px' }}>
                          <input type="checkbox" checked={aspectFitCut} onChange={(e) => setAspectFitCut(e.target.checked)} />
                          <span style={{ fontSize: '10px', color: '#fff' }}>{t('比率維持の壁を召喚')}</span>
                        </label>
                        <div style={{ marginTop: '6px', padding: '6px', background: '#0a0d16', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>{t('アスペクト比プレビュー')}:</div>
                          <img
                            src={`${import.meta.env.BASE_URL}texture/${selectedTexture}`}
                            style={{ maxWidth: '100%', maxHeight: '60px', objectFit: 'contain', display: 'block', margin: '0 auto 4px', borderRadius: '2px' }}
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              setPreviewAspect(img.naturalWidth / img.naturalHeight);
                              setPreviewSize({ w: img.naturalWidth, h: img.naturalHeight });
                            }}
                          />
                          <div style={{ fontSize: '9px', color: 'var(--cyan-neon)', textAlign: 'center', fontWeight: 'bold' }}>
                            {previewSize.w} x {previewSize.h} (比率: {previewAspect.toFixed(2)})
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
                {/* 壁タイプ toggle: 通常壁/鍵付き扉/仕切り壁 (描くモード時のみ) */}
                {wallSubMode === 'draw' && (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    <button
                      className={`tool-btn ${wallLockedSubMode === 'normal' ? 'active' : ''}`}
                      onClick={() => setWallLockedSubMode('normal')}
                      style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 0, 85, 0.3)' }}
                    >
                      <span style={{ fontSize: '10px' }}>{t('通常壁')}</span>
                    </button>
                    <button
                      className={`tool-btn ${wallLockedSubMode === 'locked' ? 'active' : ''}`}
                      onClick={() => setWallLockedSubMode('locked')}
                      style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 200, 0, 0.4)' }}
                    >
                      <span style={{ fontSize: '10px', color: '#ffcc00' }}>{t('鍵付き扉')}</span>
                    </button>
                    <button
                      className={`tool-btn ${wallLockedSubMode === 'partition' ? 'active' : ''}`}
                      onClick={() => setWallLockedSubMode('partition')}
                      style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(180, 60, 255, 0.4)' }}
                      title={t('鍵扉の高さより上を塞ぐ仕切り壁')}
                    >
                      <span style={{ fontSize: '10px', color: '#b43cff' }}>{t('仕切り壁')}</span>
                    </button>
                  </div>
                )}
                {/* 形状ツール サブモードセレクタ (形状モード時のみ) */}
                {wallSubMode === 'shape' && (
                  <>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      <button
                        className={`tool-btn ${wallShapeSubMode === 'indent' ? 'active' : ''}`}
                        onClick={() => setWallShapeSubMode('indent')}
                        style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(255, 200, 0, 0.4)' }}
                        title={t('壁を図形で切断しくぼみを作る')}
                      >
                        <span style={{ fontSize: '10px', color: '#ffcc00' }}>{t('くぼみ')}</span>
                      </button>
                      <button
                        className={`tool-btn ${wallShapeSubMode === 'generate' ? 'active' : ''}`}
                        onClick={() => setWallShapeSubMode('generate')}
                        style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(57, 255, 20, 0.4)' }}
                        title={t('図形の形に壁を生成')}
                      >
                        <span style={{ fontSize: '10px', color: '#39ff14' }}>{t('壁生成')}</span>
                      </button>
                      <button
                        className={`tool-btn ${wallShapeSubMode === 'mask' ? 'active' : ''}`}
                        onClick={() => setWallShapeSubMode('mask')}
                        style={{ flex: 1, fontSize: '10px', padding: '4px', borderColor: 'rgba(0, 0, 0, 0.4)' }}
                        title={t('図形でミニマップをマスク')}
                      >
                        <span style={{ fontSize: '10px', color: '#000' }}>{t('マスク')}</span>
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                      <button
                        className={`tool-btn ${shapeDrawMode === 'rect' ? 'active' : ''}`}
                        onClick={() => setShapeDrawMode('rect')}
                        style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(0, 200, 255, 0.3)' }}
                      >
                        <span style={{ fontSize: '10px' }}>{t('長方形')}</span>
                      </button>
                      <button
                        className={`tool-btn ${shapeDrawMode === 'path' ? 'active' : ''}`}
                        onClick={() => setShapeDrawMode('path')}
                        style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(0, 200, 255, 0.3)' }}
                      >
                        <span style={{ fontSize: '10px' }}>{t('パス')}</span>
                      </button>
                      {wallShapeSubMode === 'mask' && (
                        <button
                          className={`tool-btn ${shapeDrawMode === 'fill' ? 'active' : ''}`}
                          onClick={() => setShapeDrawMode('fill')}
                          style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(0, 100, 255, 0.4)' }}
                        >
                          <span style={{ fontSize: '10px', color: '#0066ff' }}>{t('塗りつぶし')}</span>
                        </button>
                      )}
                    </div>
                    {wallShapeSubMode === 'indent' && (
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                        <button
                          className={`tool-btn ${indentDir === 'short' ? 'active' : ''}`}
                          onClick={() => setIndentDir?.('short')}
                          style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 200, 0, 0.3)' }}
                        >
                          <span style={{ fontSize: '10px' }}>{t('近道')}</span>
                        </button>
                        <button
                          className={`tool-btn ${indentDir === 'long' ? 'active' : ''}`}
                          onClick={() => setIndentDir?.('long')}
                          style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 200, 0, 0.3)' }}
                        >
                          <span style={{ fontSize: '10px' }}>{t('遠回り')}</span>
                        </button>
                      </div>
                    )}
                    {wallShapeSubMode === 'mask' && (
                      <>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                          <button
                            className={`tool-btn ${maskSubMode === 'paint' ? 'active' : ''}`}
                            onClick={() => setMaskSubMode?.('paint')}
                            style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(0, 0, 0, 0.4)' }}
                          >
                            <span style={{ fontSize: '10px', color: '#000' }}>{t('塗り')}</span>
                          </button>
                          <button
                            className={`tool-btn ${maskSubMode === 'erase' ? 'active' : ''}`}
                            onClick={() => setMaskSubMode?.('erase')}
                            style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 50, 50, 0.4)' }}
                          >
                            <span style={{ fontSize: '10px', color: '#ff3333' }}>{t('削除')}</span>
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                          <button
                            className="tool-btn"
                            onClick={() => props.onClearMask?.()}
                            style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 50, 50, 0.4)' }}
                          >
                            <span style={{ fontSize: '10px', color: '#ff3333' }}>{t('マスク全消し')}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                {wallSubMode === 'vertex' && (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    <button
                      className={`tool-btn ${vertexMode === 'connect' ? 'active' : ''}`}
                      onClick={() => setVertexMode?.('connect')}
                      style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 200, 0, 0.3)' }}
                    >
                      <span style={{ fontSize: '10px' }}>{t('接続')}</span>
                    </button>
                    <button
                      className={`tool-btn ${vertexMode === 'snap' ? 'active' : ''}`}
                      onClick={() => setVertexMode?.('snap')}
                      style={{ flex: 1, fontSize: '10px', padding: '3px', borderColor: 'rgba(255, 200, 0, 0.3)' }}
                    >
                      <span style={{ fontSize: '10px' }}>{t('吸着')}</span>
                    </button>
                  </div>
                )}
                {/* 仕切り壁の本数表示 (描く+仕切りモード時) */}
                {wallSubMode === 'draw' && wallLockedSubMode === 'partition' && partitionWalls && partitionWalls[currentFloor] && partitionWalls[currentFloor].length > 0 && (
                  <div style={{ marginBottom: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    {t('仕切り壁: {0}本', String(partitionWalls[currentFloor].length))}
                  </div>
                )}
                {/* チェックボックス類 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', padding: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                  {wallSubMode === 'draw' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={wallAutoSnap}
                        onChange={(e) => setWallAutoSnap(e.target.checked)}
                        style={{ accentColor: '#ffcc00', cursor: 'pointer' }}
                      />
                      {t('頂点自動統合')}
                    </label>
                  )}
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
                {/* 自動検出・クリア (下部) */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '6px' }}>
                  {t('マップの背景画像をもとに、黒い線を壁として自動検出できます。')}
                </div>
                <button
                  className="btn-cyber success"
                  style={{ width: '100%', marginBottom: '6px', padding: '6px' }}
                  onClick={async () => {
                    const path = routeApi.route.customBg[currentFloor] ?? PRESET_MAPS_META[currentFloor]?.path;
                    if (!path) {
                      notification.show(t('背景画像が見つかりません'));
                      return;
                    }
                    notification.show(t('壁の自動検出を実行中...'));
                    const { detectWallsFromImage } = await import('../utils/WallDetector');
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

            {toolMode === 'add-spawn' && showSpawnEditFeature && (
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
                        style={{ height: 28, fontSize: '11px', padding: '2px', minWidth: 0 }}
                        onClick={() => { setSpawnToolMode(t.key); setToolMode('add-spawn'); }}
                      >{t.label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button className="btn-cyber" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none', flex: 1 }}
                      disabled={spawnUndoRef.current.length === 0}
                      onClick={undoPoints}>↩ 元に戻す</button>
                    <button className="btn-cyber" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none', flex: 1 }}
                      disabled={spawnRedoRef.current.length === 0}
                      onClick={redoPoints}>↪ やり直し</button>
                  </div>
                </div>

                {/* ---- 設置 ---- */}
                {spawnToolMode === 'place' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '12px', marginBottom: '4px' }}>
                      マップをクリックして点を追加
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      点を打った後、「編集」タブでアイテムを追加してください。
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginTop: '4px' }}>
                      <input type="checkbox" checked={spawnAutoEdit}
                        onChange={e => setSpawnAutoEdit(e.target.checked)}
                        style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                      設置後すぐにアイテム編集
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>種別</span>
                      <select value={spawnPlaceCategory} onChange={e => setSpawnPlaceCategory(e.target.value)}
                        style={{ flex: 1, fontSize: '12px', padding: '4px 8px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }}>
                        <option value="">-</option>
                        {SPAWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>
                      スポーン点: <span style={{ color: 'var(--cyan-neon)' }}>{spawnApi.points.length}</span>
                    </div>
                  </div>
                )}

                {/* ---- 編集 ---- */}
                {spawnToolMode === 'edit' && (
                  <>
                    <div className="panel-section">
                      <div className="panel-title" style={{ fontSize: '12px', marginBottom: '4px' }}>編集</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        マップ上のスポーン点をクリックして編集
                      </div>
                      {editPointId && (
                        <div style={{ fontSize: '11px', color: 'var(--cyan-neon)' }}>
                          編集中: X:{spawnApi.points.find(p => p.id === editPointId)?.x ?? '?'} Y:{spawnApi.points.find(p => p.id === editPointId)?.y ?? '?'}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        スポーン点: <span style={{ color: 'var(--cyan-neon)' }}>{spawnApi.points.length}</span>
                        {' | '}未設定: <span style={{ color: '#ff6b6b' }}>{spawnApi.points.filter(p => !p.category).length}</span>
                      </div>
                    </div>

                    <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>絞り込み</span>
                        {(editFilterCategories.size > 0 || editFilterItemIds.size > 0) && (
                          <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 5px', clipPath: 'none' }}
                            onClick={() => { setEditFilterCategories(new Set()); setEditFilterItemIds(new Set()); }}>
                            解除
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '6px' }}>
                        {[...SPAWN_CATEGORIES, '__unset__'].map(cat => {
                          const isSel = editFilterCategories.has(cat);
                          const isUnset = cat === '__unset__';
                          const label = isUnset ? '未設定' : cat;
                          return (
                            <button key={cat} onClick={() => {
                              const next = new Set(editFilterCategories);
                              if (next.has(cat)) next.delete(cat); else next.add(cat);
                              setEditFilterCategories(next);
                            }}
                              style={{
                                fontSize: '9px', padding: '2px 5px',
                                border: `1px solid ${isSel ? '#39ff14' : 'rgba(255,255,255,0.2)'}`,
                                background: isSel ? 'rgba(57,255,20,0.15)' : 'transparent',
                                color: isSel ? '#39ff14' : 'var(--text-muted)', borderRadius: '4px',
                                cursor: 'pointer', fontWeight: isSel ? 700 : 400
                              }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                        {spawnApi.items.length === 0 ? (
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>アイテム未登録</div>
                        ) : spawnApi.items.map((item: any) => {
                          const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                          const isSel = editFilterItemIds.has(item.id);
                          return (
                            <button key={item.id} onClick={() => {
                              const next = new Set(editFilterItemIds);
                              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                              setEditFilterItemIds(next);
                            }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', padding: '2px 5px',
                                border: `1px solid ${tc?.color || '#888'}${isSel ? 'ff' : '33'}`,
                                background: isSel ? `${tc?.color}33` : 'rgba(0,0,0,0.2)',
                                color: tc?.color || '#fff', borderRadius: '4px',
                                cursor: 'pointer', fontWeight: isSel ? 700 : 400
                              }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block' }} />
                              <span>{item.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* ---- 消しゴム ---- */}
                {spawnToolMode === 'erase' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '12px', marginBottom: '4px' }}>消しゴム</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      マップ上のスポーン点をクリックして削除
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--red-neon)' }}>削除はローカルのみ反映</div>
                    <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px', clipPath: 'none', marginTop: '6px' }}
                      onClick={() => { const empty = spawnApi.points.filter(p => !p.items || p.items.length === 0); if (empty.length === 0) return; pushSpawnHistory(); empty.forEach(p => spawnApi.removePoint(p.id)); }}>
                      未設定の点を一括除去 ({spawnApi.points.filter(p => !p.items || p.items.length === 0).length})
                    </button>
                  </div>
                )}

                {/* ---- アイテム管理 ---- */}
                {spawnToolMode === 'manage' && (
                  <div className="panel-section">
                    <div className="panel-title" style={{ fontSize: '12px', marginBottom: '4px' }}>
                      アイテム管理
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      登録アイテム数: {spawnApi.items.length}
                    </div>
                    <button className="btn-cyber success" style={{ width: '100%', fontSize: '11px', padding: '6px', clipPath: 'none' }}
                      onClick={() => setShowItemModal(true)}>
                      アイテム登録/編集を開く
                    </button>
                    <button className="btn-cyber" style={{ width: '100%', fontSize: '11px', padding: '6px', clipPath: 'none', marginTop: '6px', borderColor: '#ffd700', color: '#ffd700' }}
                      onClick={() => { props.onOpenPoolSettings?.(); }}>
                      🏊 プール設定
                    </button>
                  </div>
                )}

                {/* 共通設定 (全モード) */}
                <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={spawnHideOther}
                      onChange={e => setSpawnHideOther(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                    マーカーと線を隠す
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginTop: '4px' }}>
                    <input type="checkbox" checked={spawnHideBg}
                      onChange={e => setSpawnHideBg(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                    背景を隠す
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px', borderTop: '1px solid rgba(79,195,247,0.1)', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
                      <span>点のサイズ</span>
                      <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{spawnPointSize}px</span>
                    </div>
                    <input type="range" min="1" max="8" step="1" value={spawnPointSize}
                      onChange={e => setSpawnPointSize(parseInt(e.target.value))}
                      onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 1; const dir = e.deltaY > 0 ? -1 : 1; setSpawnPointSize(Math.max(1, Math.min(8, spawnPointSize + dir * step))); }}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', borderTop: '1px solid rgba(79,195,247,0.1)', paddingTop: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>グリッド</span>
                    <select value={spawnGridSnap} onChange={e => setSpawnGridSnap(parseInt(e.target.value))}
                      style={{ flex: 1, fontSize: '11px', padding: '3px 6px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }}>
                      <option value={0}>なし</option>
                      <option value={5}>5px</option>
                      <option value={10}>10px</option>
                      <option value={25}>25px</option>
                      <option value={50}>50px</option>
                    </select>
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
                  <div ref={itemFormScrollRef} style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
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
                             <button key={c} onClick={() => { setItemFormTextColor(c); try { localStorage.setItem('heist_item_last_rarity', c); } catch {} }}
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
                        <input ref={itemImageInputRef} type="file" accept="image/*" onChange={handleFileForCrop} style={{ display: 'none' }} />
                      </div>
                      {!showCrop && itemFormImage && !confirmedCropMeta && (
                        <div style={{marginTop:'4px',border:'1px solid rgba(79,195,247,0.2)',borderRadius:'4px',padding:'6px',display:'flex',alignItems:'center',gap:'10px',background:'rgba(0,0,0,0.2)'}}>
                          <img src={itemFormImage} style={{width:'60px',height:'60px',objectFit:'contain',borderRadius:'4px',border:'1px solid rgba(79,195,247,0.3)',background:'#000'}} />
                          <span style={{fontSize:'11px',color:'var(--text-muted)'}}>画像設定済み</span>
                        </div>
                      )}
                      {showCrop && cropSource && (
                        <div style={{border:'1px solid rgba(79,195,247,0.3)',borderRadius:'6px',background:'#000',overflow:'hidden',userSelect:'none',marginTop:'4px'}}>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'8px',gap:'8px'}}>
                            <div onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={()=>{handleCropMouseUp();setCropHoverEdge(null);}} style={{position:'relative',cursor:cursorForEdge(cropHoverEdge),display:'inline-block',maxWidth:'100%'}}>
                              <img ref={cropImgRef} src={cropSource} onLoad={(e)=>{const img=e.currentTarget;const nw=img.naturalWidth,nh=img.naturalHeight;setCropImgSize({w:nw,h:nh});setCropRect(p=>{const fromLs=p.x!==10||p.y!==10||p.w!==200||p.h!==60;if(fromLs)return{x:Math.min(p.x,nw-20),y:Math.min(p.y,nh-20),w:Math.min(p.w,nw),h:Math.min(p.h,nh)};else{const iw=Math.round(Math.min(nw,1920)*0.7),ih=Math.round(Math.min(nw,1920)/nw*nh*0.7);return{x:Math.round((nw-iw)/2),y:Math.round((nh-ih)/2),w:Math.max(20,iw),h:Math.max(20,ih)}};});}} style={{display:'block',maxWidth:'100%',maxHeight:'55vh',objectFit:'contain',pointerEvents:'none'}} />
                              {cropImgSize.w>0&&cropImgRef.current&&(()=>{
                                const img=cropImgRef.current!;
                                const rw=img.clientWidth/cropImgSize.w,rh=img.clientHeight/cropImgSize.h;
                                const l=cropRect.x*rw,t=cropRect.y*rh,w=cropRect.w*rw,h=cropRect.h*rh;
                                return(<><div style={{position:'absolute',left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`,border:'3px solid #39ff14',boxShadow:'0 0 12px #39ff14,inset 0 0 6px #39ff14',background:'rgba(57,255,20,0.05)',pointerEvents:'none'}} />
                                  <div style={{position:'absolute',left:`${l-8}px`,top:`${t-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                                  <div style={{position:'absolute',left:`${l+w-8}px`,top:`${t-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                                  <div style={{position:'absolute',left:`${l-8}px`,top:`${t+h-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                                  <div style={{position:'absolute',left:`${l+w-8}px`,top:`${t+h-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                                  <div style={{position:'absolute',left:`${l+w/2-5}px`,top:`${t-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                                  <div style={{position:'absolute',left:`${l+w/2-5}px`,top:`${t+h-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                                  <div style={{position:'absolute',left:`${l-5}px`,top:`${t+h/2-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                                  <div style={{position:'absolute',left:`${l+w-5}px`,top:`${t+h/2-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                                </>);
                              })()}
                            </div>
                            <div style={{display:'flex',gap:'12px',alignItems:'center',width:'100%'}}>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',flexShrink:0}}>
                                <div style={{fontSize:'11px',color:'var(--cyan-neon)',fontWeight:600}}>切り取り結果 ({cropRect.w}×{cropRect.h})</div>
                                <div style={{border:'2px solid rgba(57,255,20,0.5)',borderRadius:'4px',background:'#0a0e18',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',width:'180px',height:'120px'}}>
                                  {cropPreviewUrl ? <img src={cropPreviewUrl} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',imageRendering:'pixelated'}} /> : <span style={{fontSize:'10px',color:'var(--text-muted)'}}>-</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:'6px',padding:'8px',borderTop:'1px solid rgba(79,195,247,0.2)'}}>
                            <button className="btn-cyber" style={{flex:1,fontSize:'10px',padding:'6px',clipPath:'none'}} onClick={cancelCrop}>キャンセル</button>
                            <button className="btn-cyber success" style={{flex:1,fontSize:'10px',padding:'6px',clipPath:'none'}} onClick={confirmCrop}>この部分を使用</button>
                          </div>
                        </div>
                      )}
                      {!showCrop && confirmedCropMeta && (
                        <div style={{marginTop:'4px',border:'1px solid rgba(79,195,247,0.2)',borderRadius:'4px',padding:'6px',display:'flex',alignItems:'center',gap:'10px',background:'rgba(0,0,0,0.2)'}}>
                          <img src={confirmedCropMeta.url} style={{width:'80px',height:'80px',objectFit:'contain',borderRadius:'4px',border:'1px solid rgba(79,195,247,0.3)',background:'#000',imageRendering:'pixelated'}} />
                          <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{confirmedCropMeta.w}×{confirmedCropMeta.h} px に切り取り済み</span>
                          <button className="btn-cyber danger" style={{fontSize:'9px',padding:'2px 6px',clipPath:'none',flexShrink:0}} onClick={()=>{setConfirmedCropMeta(null);setItemFormImage('');}}>✕</button>
                        </div>
                      )}
                      {!showCrop && !itemFormImage && (<div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'-4px',marginBottom:'4px'}}>画像をペースト(Ctrl+V)またはファイルから読み込むと、切り取り編集ができます</div>)}
                      <textarea className="textarea-cyber" placeholder="説明 (任意)"
                        value={itemFormDescription} onChange={e => setItemFormDescription(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 10px', minHeight: '50px', resize: 'vertical' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-cyber success" style={{ flex: 1, fontSize: '12px', padding: '8px', clipPath: 'none' }}
                          onClick={() => { setConfirmedCropMeta(null); setCropPreviewUrl(''); handleItemSave(); const lr = (() => { try { const v = localStorage.getItem('heist_item_last_rarity'); return v && TEXTCOLOR_OPTIONS.includes(v) ? v : 'blue'; } catch { return 'blue'; } })(); setItemFormTextColor(lr); }} disabled={!itemFormName.trim()}>
                          {itemFormEditId ? '更新' : '登録'}
                        </button>
                        {itemFormEditId && (
                          <button className="btn-cyber" style={{ fontSize: '12px', padding: '8px', clipPath: 'none' }}
                             onClick={() => { const lr = (() => { try { const v = localStorage.getItem('heist_item_last_rarity'); return v && TEXTCOLOR_OPTIONS.includes(v) ? v : 'blue'; } catch { return 'blue'; } })(); setItemFormEditId(null); setItemFormName(''); setItemFormDescription(''); setItemFormTextColor(lr); setItemFormFans(0); setItemFormCoins(0); }}>
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

                    {/* 登録済み一覧 (レアリティ別タブ) */}
                    <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
                      {spawnApi.items.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>アイテムがありません。上記フォームから登録してください。</div>
                      ) : (() => {
                        const groups: Record<string, any[]> = {};
                        TEXTCOLOR_OPTIONS.forEach(c => { groups[c] = []; });
                        spawnApi.items.forEach(item => { const k = item.textColor || 'blue'; if (groups[k]) groups[k].push(item); else groups['blue'].push(item); });
                        const tabs = [{ k: 'all', l: `すべて(${spawnApi.items.length})`, c: '#888' }, ...TEXTCOLOR_OPTIONS.map(c => ({ k: c, l: `${TEXTCOLOR_META[c].label}(${groups[c].length})`, c: TEXTCOLOR_META[c].color }))];
                        const filtered = itemListTab === 'all' ? spawnApi.items : (groups[itemListTab] || []);
                        return (<>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>登録済みアイテム ({spawnApi.items.length})</div>
                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            {tabs.map(t => (
                              <button key={t.k} onClick={() => setItemListTab(t.k)}
                                style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${itemListTab === t.k ? t.c : 'rgba(255,255,255,0.15)'}`, background: itemListTab === t.k ? `${t.c}22` : 'transparent', color: itemListTab === t.k ? t.c : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', fontWeight: itemListTab === t.k ? 700 : 400 }}>
                                {t.l}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
                            {filtered.map(item => {
                              const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                              const ptCount = spawnApi.points.filter(p => p.items && p.items.some(pi => pi.itemId === item.id)).length;
                              return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ color: tc?.color || '#fff', fontWeight: 600, fontSize: '12px' }}>{item.name}</span>
                                      {item.image && <div style={{width:'28px',height:'28px',borderRadius:'4px',overflow:'hidden',flexShrink:0,border:'1px solid rgba(79,195,247,0.3)',background:'#000'}}><img src={item.image} style={{width:'100%',height:'100%',objectFit:'contain'}} /></div>}
                                      <span style={{ color: '#ffd700', fontSize: '11px', fontWeight: 600 }}>{item.fans.toLocaleString()}F</span>
                                      <span style={{ color: '#ff9500', fontSize: '11px', fontWeight: 600 }}>{item.coins.toLocaleString()}C</span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{ptCount}点</span>
                                    </div>
                                    {item.description && <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                                  </div>
                                  <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 4px', clipPath: 'none', flexShrink: 0, opacity: spawnApi.items.indexOf(item) === 0 ? 0.3 : 1 }}
                                    onClick={() => spawnApi.moveItem(item.id, -1)} disabled={spawnApi.items.indexOf(item) === 0}>▲</button>
                                  <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 4px', clipPath: 'none', flexShrink: 0, opacity: spawnApi.items.indexOf(item) === spawnApi.items.length - 1 ? 0.3 : 1 }}
                                    onClick={() => spawnApi.moveItem(item.id, 1)} disabled={spawnApi.items.indexOf(item) === spawnApi.items.length - 1}>▼</button>
                                  <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none', flexShrink: 0 }}
                                    onClick={() => { setConfirmedCropMeta(null); setCropPreviewUrl(''); setItemFormEditId(item.id); setItemFormName(item.name); setItemFormDescription(item.description || ''); setItemFormImage(item.image || ''); setItemFormTextColor(item.textColor); setItemFormFans(item.fans); setItemFormCoins(item.coins); itemFormScrollRef.current?.scrollTo(0,0); }}>
                                    編集
                                  </button>
                                  <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => spawnApi.removeItem(item.id)}>✕</button>
                                </div>
                              );
                            })}
                          </div>
                        </>);
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* スポーン点編集モーダル */}
            {(() => {
              useEffect(() => {
                if (!showEditModal || !editPointId) return;
                const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowEditModal(false); setEditPointId(null); } };
                document.addEventListener('keydown', handler);
                return () => document.removeEventListener('keydown', handler);
              }, [showEditModal, editPointId, setShowEditModal, setEditPointId]);
              return null;
            })()}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>出現率</span>
                        {(['高','中','低'] as const).map(ar => (
                          <button key={ar} onClick={() => spawnApi.updatePoint(pt.id, { appearanceRate: ar })}
                            style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${(pt.appearanceRate||'高')===ar?'#39ff14':'rgba(255,255,255,0.2)'}`, background: (pt.appearanceRate||'高')===ar?'rgba(57,255,20,0.15)':'transparent', color: (pt.appearanceRate||'高')===ar?'#39ff14':'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', fontWeight: (pt.appearanceRate||'高')===ar?700:400 }}>{ar}</button>
                        ))}
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

                      {/* アイテム追加 (レアリティ別タブ) */}
                      <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>アイテム追加</div>
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          TEXTCOLOR_OPTIONS.forEach(c => { groups[c] = []; });
                          spawnApi.items.forEach(item => { const k = item.textColor || 'blue'; if (groups[k]) groups[k].push(item); else groups['blue'].push(item); });
                          const tabs = [{ k: 'all', l: `すべて(${spawnApi.items.length})`, c: '#888' }, ...TEXTCOLOR_OPTIONS.map(c => ({ k: c, l: `${TEXTCOLOR_META[c].label}(${groups[c].length})`, c: TEXTCOLOR_META[c].color }))];
                          const filtered = spawnItemTab === 'all' ? [...spawnApi.items].sort((a, b) => a.name.localeCompare(b.name)) : (groups[spawnItemTab] || []).sort((a, b) => a.name.localeCompare(b.name));
                          return (<>
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              {tabs.map(t => (
                                <button key={t.k} onClick={() => setSpawnItemTab(t.k)}
                                  style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${spawnItemTab === t.k ? t.c : 'rgba(255,255,255,0.15)'}`, background: spawnItemTab === t.k ? `${t.c}22` : 'transparent', color: spawnItemTab === t.k ? t.c : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', fontWeight: spawnItemTab === t.k ? 700 : 400 }}>
                                  {t.l}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                              {filtered.map(item => {
                                const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                                const isSel = editAddItemId === item.id;
                                const count = spawnApi.points.filter(p => p.items && p.items.some(pi => pi.itemId === item.id)).length;
                                return (
                                  <button key={item.id} onClick={() => setEditAddItemId(isSel ? '' : item.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', border: `2px solid ${tc?.color || '#888'}${isSel ? 'ff' : '44'}`, background: isSel ? `${tc?.color}33` : 'rgba(0,0,0,0.3)', color: tc?.color || '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: isSel ? 700 : 400 }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block' }} />
                                    <span>{item.name}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '2px' }}>({count})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>);
                        })()}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>人数</span>
                          {[1,2,3,4].map(n => (
                            <button key={n} onClick={() => setEditAddPlayerCount(n)}
                              style={{ width: '32px', height: '32px', fontSize: '14px', fontWeight: 700, border: `2px solid ${editAddPlayerCount===n?'#39ff14':'rgba(255,255,255,0.2)'}`, background: editAddPlayerCount===n?'rgba(57,255,20,0.15)':'rgba(0,0,0,0.3)', color: editAddPlayerCount===n?'#39ff14':'var(--text-muted)', borderRadius: '6px', cursor: 'pointer' }}>{n}</button>
                          ))}
                          <button className="btn-cyber success" style={{ flex: 1, fontSize: '12px', padding: '8px 12px', clipPath: 'none' }}
                            disabled={!editAddItemId}
                            onClick={() => handlePointAddItem(pt.id, editAddItemId, editAddPlayerCount)}>追加</button>
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
              const poolId = pt.category ? CATEGORY_TO_POOL[pt.category] : null;
              return (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setSpawnViewPointId(null)}>
                  <div style={{ background: 'var(--panel-bg, #0a0e18)', width: '440px', maxHeight: '70vh', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)' }}>{pt.category || ''}{pt.category ? '　' : ''}出現率：<span style={{ color: (pt.appearanceRate||'高') === '低' ? '#ff4444' : (pt.appearanceRate||'高') === '中' ? '#ffd700' : '#39ff14' }}>{(pt.appearanceRate||'高')}</span></span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none', background: svMode === 'records' ? 'rgba(0,240,255,0.15)' : 'transparent', borderColor: svMode === 'records' ? '#00ffff' : 'rgba(0,240,255,0.2)' }}
                          onClick={() => setSvMode('records')}>取得記録</button>
                        <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none', background: svMode === 'pool' ? 'rgba(255,215,0,0.15)' : 'transparent', borderColor: svMode === 'pool' ? '#ffd700' : 'rgba(255,215,0,0.2)' }}
                          onClick={() => setSvMode('pool')}>プール</button>
                        <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }} onClick={() => setSpawnViewPointId(null)}>✕</button>
                      </div>
                    </div>
                    {svMode === 'records' ? (
                      <>
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
                      {filteredItems.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>該当アイテムなし</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {filteredItems.map((pi, idx) => {
                            const item = spawnApi.items.find(i => i.id === pi.itemId);
                            const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ color: tc?.color || '#fff', fontWeight: 600, flex: 1 }}>{item?.name || '(不明)'}</span>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{pi.playerCount}P</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{new Date(pi.discoveredAt).toLocaleDateString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {filteredItems.length > 0 && (
                      <div style={{ padding: '6px 16px', borderTop: '1px solid rgba(79,195,247,0.1)', display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <select value={addToPoolId} onChange={e => setAddToPoolId(e.target.value)}
                          style={{ flex: 1, fontSize: '11px', padding: '4px 6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(79,195,247,0.2)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                          {Object.entries(POOL_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <button className="btn-cyber" style={{ padding: '4px 10px', fontSize: '10px', clipPath: 'none', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            const uniqueIds = [...new Set(filteredItems.map((pi: any) => pi.itemId))];
                            const raw = JSON.parse(localStorage.getItem('heist_sim_pools_v1') || '{}');
                            const pools: Record<string, string[]> = raw.pools || {};
                            const current = pools[addToPoolId] || [];
                            pools[addToPoolId] = [...new Set([...current, ...uniqueIds])];
                            localStorage.setItem('heist_sim_pools_v1', JSON.stringify({ ...raw, pools }));
                          }}>
                          表示をプールに追加
                        </button>
                      </div>
                    )}
                    </>
                    ) : (() => {
                      const poolRaw = (() => { try { return JSON.parse(localStorage.getItem('heist_sim_pools_v1') || '{}'); } catch { return {}; } })();
                      const poolInfo = poolId && poolRaw.pools ? poolRaw.pools[poolId] : null;
                      const poolItems = Array.isArray(poolInfo) ? poolInfo : (poolInfo?.itemIds ?? []);
                      return (
                      <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                        {poolItems.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 600, marginBottom: '2px' }}>このプールの登録アイテム ({poolItems.length})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                              {poolItems.map((iid: string) => {
                                const item = spawnApi.items.find((i: any) => i.id === iid);
                                const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                                return (
                                  <span key={iid} style={{ fontSize: '9px', padding: '1px 5px', background: tc ? `${tc.color}18` : 'rgba(255,255,255,0.05)', borderRadius: '3px', color: tc?.color || '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                    {item?.name || iid}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>このプールに登録アイテムなし</div>
                        )}
                      </div>
                      );
                    })()}
                    <div style={{ padding: '4px 16px 12px', borderTop: svMode === 'pool' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <button className="btn-cyber" style={{ width: '100%', fontSize: '11px', padding: '6px', clipPath: 'none' }}
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
                    {(['eh', 'rare', 'cardkey', 'vault', 'boss', 'gbattle', 'gpicking', 'glong_picking', 'phone', 'room', 'warp', 'stairs', 'info', 'note', 'text', 'drawer', 'tps', 'shelf'] as MarkerType[]).map(t => {
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
                    {(['start', 'checkpoint', 'battle', 'picking', 'long_picking', 'iwarp', 'iinfo', 'inote', 'itext', 'skill_cd', 'p1', 'p2', 'p3', 'itps'] as MarkerType[]).map(mt => {
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
