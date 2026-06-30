import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { MapCanvas } from './components/MapCanvas';
import { HistoryModal } from './components/HistoryModal';
import { HelpModal } from './components/HelpModal';
import { PlayDataPanel } from './components/PlayDataPanel';
import { OcrDebugModal } from './components/OcrDebugModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
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
  PRESET_VISIBILITY_META,
  normalizePresetVisibility,
  normalizePresets,
  getPresetVisibility,
  MARKER_META,
  DataManager,
  normalizeStrokes,
  smoothStrokePoints,
  smoothStrokePointsKeepEnds,
  AUTHOR_DEFAULT_PLAIN,
  generateId,
  runSaveDataMigrations
} from './utils/DataManager';
import { type HelpData, fetchHelpData } from './utils/HelpDataManager';
import { useNotifications } from './hooks/useNotifications';
import { useGlobalDefaults, type GlobalDefaults } from './hooks/useGlobalDefaults';
import { useGlobalMarkers } from './hooks/useGlobalMarkers';
import { useRoute, type SaveInfo } from './hooks/useRoute';
import { useHistory } from './hooks/useHistory';
import { useFileIO } from './hooks/useFileIO';

import { SaveListRowAuthor } from './hooks/SaveListRowAuthor';
import { useAutoRoute } from './hooks/useAutoRoute';
import { PLAY_DATA_KEY, loadFloorNavCollapsed, saveFloorNavCollapsed } from './utils/PlayDataManager';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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
  FilePlus,
  Play,
  Pause,
  Square,
  EyeOff,
  Ruler,
  Star,
  Wand2
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

/**
 * セーブデータを読み込み可能な最新形式に揃える。
 * 1. レガシー座標マイグレーション (v1 → v2 座標系)
 * 2. SAVE_DATA_MIGRATIONS に登録された from→to 変換
 * 3. 結果 (適用されたマイグレーション、不明バージョン) を返す
 */
const migrateLoadedRoute = (data: RouteData): { data: RouteData; result: ReturnType<typeof runSaveDataMigrations>; legacyMigrated: boolean } => {
  const legacyMigrated = !data.mapVersion || data.mapVersion < 2;
  const afterLegacy = migrateRouteCoordinates(data);
  const result = runSaveDataMigrations(afterLegacy);
  return { data: result.data, result, legacyMigrated };
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// クイックプリセット登録ボタン (公開レベルを 3 ボタンから選べる)
// - デフォルトは 'public' (緑)
// - 限定公開 (黄) / 非公開 (赤) もワンクリックで選択可
// 親の再レンダ負荷を抑えるため独立コンポーネント化。
interface QuickPresetButtonProps {
  isLocal: boolean;
  onAdd: (visibility: PresetVisibility) => void;
}

/**
 * localStorage の使用量と上限を表示するバッジ。
 *  - 全体合計を 8MB 目安と比較 (主要ブラウザの実態に近い値)
 *  - セーブデータ / プリセット / その他の内訳も表示
 *  - 0.5 秒ごとに再計算して削除直後の変化も可視化
 */
const STORAGE_BUDGET_BYTES = 8 * 1024 * 1024; // 8 MB (主要ブラウザの localStorage 容量に近い)
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
function keyByteSize(k: string, v: string): number {
  // localStorage は UTF-16 で保存されるため 2 バイト/文字
  return (k.length + v.length) * 2;
}
const StorageUsageBadge: React.FC = () => {
  const [used, setUsed] = useState<number>(0);
  const [savesBytes, setSavesBytes] = useState<number>(0);
  const [presetsBytes, setPresetsBytes] = useState<number>(0);
  const [otherBytes, setOtherBytes] = useState<number>(0);
  useEffect(() => {
    const compute = () => {
      let savesTotal = 0;
      let presetsTotal = 0;
      let otherTotal = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === null) continue;
        const v = localStorage.getItem(k) || '';
        const sz = keyByteSize(k, v);
        if (k === 'heist_presets' || k.startsWith('__preset__')) {
          presetsTotal += sz;
        } else if (k.startsWith('heist_route_') || k === 'heist_routes_list' || k === 'heist_last_used_route_id') {
          savesTotal += sz;
        } else {
          otherTotal += sz;
        }
      }
      setSavesBytes(savesTotal);
      setPresetsBytes(presetsTotal);
      setOtherBytes(otherTotal);
      setUsed(savesTotal + presetsTotal + otherTotal);
    };
    compute();
    // 削除直後の変化を即座に反映するため短めのポーリング
    const id = window.setInterval(compute, 500);
    return () => window.clearInterval(id);
  }, []);
  const pct = Math.min(100, (used / STORAGE_BUDGET_BYTES) * 100);
  const color = pct >= 90 ? 'var(--red-neon, #ff0055)' : pct >= 70 ? 'var(--yellow-neon, #ffe600)' : 'var(--cyan-neon)';
  return (
    <div
      title={`localStorage 使用量 / 8MB 目安 (UTF-16 換算)\nセーブ: ${formatBytes(savesBytes)} / プリセット: ${formatBytes(presetsBytes)} / その他: ${formatBytes(otherBytes)}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '3px 10px', background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}55`, borderRadius: '4px', fontSize: '10px', color: 'var(--text-muted)' }}
    >
      <span>容量</span>
      <span style={{ color, fontWeight: 700, fontFamily: 'monospace' }}>{formatBytes(used)}</span>
      <span>/ 8 MB</span>
      <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
      </div>
      <span style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '8px' }}>セーブ {formatBytes(savesBytes)} / プリセット {formatBytes(presetsBytes)}</span>
    </div>
  );
};

const QuickPresetButton: React.FC<QuickPresetButtonProps> = ({ isLocal, onAdd }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
        <button
          className="btn-cyber"
          style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }}
          onClick={() => onAdd('public')}
          title="公開プリセットとして登録"
        >
          プリセット登録
        </button>
        <button
          className="btn-cyber"
          style={{ fontSize: '9px', padding: '2px 4px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }}
          onClick={() => setOpen(o => !o)}
          title="公開レベルを選んで登録"
        >
          ▼
        </button>
      </div>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '2px',
            background: 'var(--panel-bg, #0a0e18)',
            border: '1px solid rgba(79,195,247,0.3)',
            borderRadius: '6px',
            padding: '4px',
            display: 'flex', flexDirection: 'column', gap: '2px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            minWidth: '140px'
          }}
        >
          {(['public', 'unlisted', 'private'] as PresetVisibility[]).map(v => {
            const meta = PRESET_VISIBILITY_META[v];
            const disabled = v === 'private' && !isLocal;
            return (
              <button
                key={v}
                disabled={disabled}
                title={disabled ? 'ローカルモードでのみ登録可' : meta.description}
                onClick={() => { onAdd(v); setOpen(false); }}
                style={{
                  fontSize: '10px', padding: '4px 8px', clipPath: 'none',
                  background: 'transparent',
                  color: disabled ? '#555' : meta.color,
                  border: `1px solid ${disabled ? '#555' : meta.color}55`,
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: disabled ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span>{meta.emoji}</span>
                <span style={{ fontWeight: 700 }}>{meta.label}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {v === 'public' ? '🌐 URL' : v === 'unlisted' ? '🔗 URL' : '🔒 ローカル'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// 消しゴムサブメニュー — 親(App)のレンダリング最適化に左右されないよう
// 独立コンポーネントとして切り出し。Alt 状態は props で受け取る。
interface EraserSubMenuProps {
  eraseTarget: 'all' | 'marker' | 'route' | 'branch';
  setEraseTarget: (v: 'all' | 'marker' | 'route' | 'branch') => void;
  eraseSize: number;
  setEraseSize: (n: number) => void;
  eraseDefaultBehavior: 'normal' | 'split';
  setEraseDefaultBehavior: (v: 'normal' | 'split') => void;
  isAltPressed: boolean;
}
const EraserSubMenu: React.FC<EraserSubMenuProps> = ({
  eraseTarget, setEraseTarget,
  eraseSize, setEraseSize,
  eraseDefaultBehavior, setEraseDefaultBehavior,
  isAltPressed
}) => {
  // Alt を押している間だけ反対挙動を表示(放したら既定に戻る)
  const effectiveEraseBehavior: 'normal' | 'split' = isAltPressed
    ? (eraseDefaultBehavior === 'normal' ? 'split' : 'normal')
    : eraseDefaultBehavior;
  return (
    <div className="panel-section">
      <div className="panel-title">{t('消しゴム設定')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>{t('対象:')}</div>
        <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {([
            { v: 'all', label: t('全部') },
            { v: 'marker', label: t('マーカー') },
            { v: 'route', label: t('進行') },
            { v: 'branch', label: t('分岐') }
          ] as const).map(opt => (
            <button
              key={opt.v}
              className={`tool-btn ${eraseTarget === opt.v ? 'active' : ''}`}
              style={{ height: 28, fontSize: '10px', padding: '2px 2px' }}
              onClick={() => setEraseTarget(opt.v)}
              title={
                opt.v === 'all' ? t('マーカー・進行・分岐すべて') :
                  opt.v === 'marker' ? t('マーカーのみ削除') :
                    opt.v === 'route' ? t('進行ルート(実線)のみ') :
                      t('分岐ルート(破線)のみ')
              }
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
            <span>{t('🔵 マーカーサイズ:')}</span>
            <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{eraseSize}px</span>
          </div>
          <input
            type="range"
            min="5"
            max="30"
            step="1"
            value={eraseSize}
            onChange={(e) => setEraseSize(parseInt(e.target.value))}
            style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
            <span>{t('最小 (5px)')}</span>
            <span>{t('最大 (30px)')}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('線分削除モード：Altで反対挙動にシフト')}</div>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '3px',
              border: '1px solid',
              letterSpacing: '0.5px',
              transition: 'all 0.1s',
              color: isAltPressed ? '#000' : 'var(--text-muted)',
              background: isAltPressed ? 'var(--yellow-neon, #ffe600)' : 'transparent',
              borderColor: isAltPressed ? 'var(--yellow-neon, #ffe600)' : 'rgba(255,255,255,0.2)',
              boxShadow: isAltPressed ? '0 0 8px rgba(255,230,0,0.6)' : 'none'
            }}
          >
            Alt{isAltPressed ? ' ●' : ''}
          </span>
        </div>
        <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {([
            { v: 'normal' as const, label: '通常' },
            { v: 'split' as const, label: '部分' }
          ]).map(opt => {
            const isActiveNow = effectiveEraseBehavior === opt.v;
            const isDefault = eraseDefaultBehavior === opt.v;
            return (
              <button
                key={opt.v}
                className={`tool-btn ${isActiveNow ? 'active' : ''}`}
                style={{
                  height: 28,
                  fontSize: '11px',
                  padding: '2px 2px',
                  position: 'relative',
                  outline: isDefault && isAltPressed
                    ? '1px dashed var(--yellow-neon, #ffe600)'
                    : 'none',
                  outlineOffset: '2px'
                }}
                onClick={() => setEraseDefaultBehavior(opt.v)}
                title={opt.v === 'normal' ? '既定=通常削除。Altを押している間だけ部分削除' : '既定=部分削除。Altを押している間だけ通常削除'}
              >
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
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

  // オートセーブの ON/OFF (デフォルト ON, localStorage に永続化)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('heist_auto_save');
    return stored === null ? true : stored === 'true';
  });
  useEffect(() => {
    localStorage.setItem('heist_auto_save', String(autoSaveEnabled));
  }, [autoSaveEnabled]);

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
  const [markerVisExpanded, setMarkerVisExpanded] = useState<boolean>(false);
  const [floorNavCollapsed, setFloorNavCollapsed] = useState<boolean>(() => loadFloorNavCollapsed());
  useEffect(() => {
    saveFloorNavCollapsed(floorNavCollapsed);
  }, [floorNavCollapsed]);

  const [toolMode, setToolMode] = useState<'select' | 'draw' | 'erase' | 'move' | 'measure' | 'add-marker' | 'toggle-vis' | 'edit-stroke'>('move');
  const [eraseTarget, setEraseTarget] = useState<'all' | 'marker' | 'route' | 'branch'>('all');
  const [eraseDefaultBehavior, setEraseDefaultBehavior] = useState<'normal' | 'split'>('normal');
  const [eraseSize, setEraseSize] = useState<number>(16);
  // 線分編集ツール (色変更 / 平滑化 / 線種 / 太さ): 選択中ストロークのインデックス
  // 単一選択 (mode に応じて「最後に選択された 1 本」を覚える) と
  // 複数選択 (Alt+クリックで累積) の両方をサポート。
  const [editStrokeIdxs, setEditStrokeIdxs] = useState<Set<number>>(() => new Set());
  // 平滑化の繰り返し回数
  const [editSmoothIterations, setEditSmoothIterations] = useState<number>(3);
  // 線分編集中にマーカー (ピン) へのクリックを無効化して、背後の線を当たりやすくする
  // ルート線描画時の disablePinsDuringDraw と同じ仕組み。デフォルト ON。
  const [editDisablePinsDuringEdit, setEditDisablePinsDuringEdit] = useState<boolean>(true);
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
  const [activeMarkerType, setActiveMarkerType] = useState<MarkerType | null>('cardkey');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [strokeColor, setStrokeColor] = useState('#ff0055');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokeType, setStrokeType] = useState<'solid' | 'dashed'>('solid');

  const warpColor = '#ff00ff';
  const stairsColor = '#ffaa00';
  const [drawMode, setDrawMode] = useState<'free' | 'smooth' | 'straight'>('smooth');
  const [disablePinsDuringDraw, setDisablePinsDuringDraw] = useState<boolean>(true);
  const [textPinPassThrough, setTextPinPassThrough] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_text_pin_pass_through');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('heist_text_pin_pass_through', String(textPinPassThrough));
  }, [textPinPassThrough]);

  const [svgString, setSvgString] = useState<string>('');
  const [rightTab, setRightTab] = useState<'route' | 'play'>('route');
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
    } catch {}
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
    } catch {}
    return [];
  });
  // 表示フィルタ: 'all' | 'favorites' | 'presets' | 'saves'
  const [saveLoadFilter, setSaveLoadFilter] = useState<'all' | 'favorites' | 'presets' | 'saves'>('all');

  useEffect(() => {
    try { localStorage.setItem('heist_save_load_favorites_v1', JSON.stringify(favoriteIds)); } catch {}
  }, [favoriteIds]);

  useEffect(() => {
    try { localStorage.setItem('heist_save_load_hidden_presets_v1', JSON.stringify(hiddenPresetIds)); } catch {}
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
    autoSaveEnabled
  });

  // 編集中は input 制御用のローカル state を持つ。初期値はプレーンテキストの作者名。
  // route.id / route.author が変わったら再同期する。
  const [authorEdit, setAuthorEdit] = useState<string>(AUTHOR_DEFAULT_PLAIN);
  useEffect(() => {
    const authorPlain = routeApi.route.author || '';
    setAuthorEdit(!authorPlain || authorPlain === AUTHOR_DEFAULT_PLAIN ? AUTHOR_DEFAULT_PLAIN : authorPlain);
  }, [routeApi.route.id, routeApi.route.author]);

  const globalDefaults = useGlobalDefaults(globalDefaultsRef, (gd) => {
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
  const defaultsLoaded = globalDefaults.loaded;

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
      setActiveMarkerType(null);
    }
  });

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
    onBeforeLoad: stopAutoRouteIfActive
  });

  useKeyboardShortcuts({
    onUndo: historyApi.undo,
    onRedo: historyApi.redo,
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
          const data = DataManager.loadFromLocalStorage(lastId);
          if (data) {
            const { data: migrated, result, legacyMigrated } = migrateLoadedRoute(data);
            if (legacyMigrated || result.applied.length > 0) {
              DataManager.saveToLocalStorage(migrated);
            }
            if (result.unknown) {
              notification.show(
                t('⚠️ 未登録バージョンのセーブデータです (v{0})。破損の可能性があります。', result.unknownVersion ?? ''),
                5000
              );
            } else if (result.applied.length > 0) {
              notification.show(
                t('セーブデータを {0} 件マイグレーションしました (→ v{1})', String(result.applied.length), result.finalVersion ?? ''),
                3000
              );
            }
            routeApi.setRouteWithGlobalDefaults(migrated);
            if (migrated.markerScale !== undefined) {
              setMarkerScale(migrated.markerScale);
              localStorage.setItem('heist_marker_scale', String(migrated.markerScale));
            }
            notification.show(`${t('前回データを読み込みました: ')}${migrated.title}`);
          }
        } catch (e) {
          console.error('Auto-load failed: corrupted route data, clearing last-used ID', e);
          try { localStorage.removeItem('heist_last_used_route_id'); } catch { }
          notification.show(t('前回データの読み込みに失敗しました（デフォルトを使用）'), 3000);
        }
      }
    }

    // Fetch presets: try dev server API first, then static file, then legacy fallback
    fetch(`${import.meta.env.BASE_URL}api/presets`)
      .then(res => res.ok ? res.json() : [])
      .then((data: PresetData[]) => {
        const normalized = normalizePresets(data);
        if (normalized.length > 0) {
          routeApi.setPresets(normalized);
          return;
        }
        // Fallback: try loading from static presets.json (shipped with dist build)
        fetch(`${import.meta.env.BASE_URL}presets.json`)
          .then(res => res.ok ? res.json() : [])
          .then((staticPresets: PresetData[]) => {
            const normalizedStatic = normalizePresets(staticPresets);
            if (normalizedStatic.length > 0) {
              routeApi.setPresets(normalizedStatic);
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

    if (presetId && routeApi.presets.length > 0) {
      // 公開レベル (visibility) によるゲート:
      //  - private はローカルモードのみ許可。本番ビルド (dist 配信) では拒否。
      //  - unlisted はURLを知っていれば常に許可 (一覧に出ないだけ)。
      //  - public は無条件。
      const access = routeApi.checkPresetUrlAccess(presetId);
      if (!access.allowed) {
        if (access.reason === 'not_found') {
          notification.show(`${t('プリセットが見つかりません: ')}${presetId}`, 3000);
        } else if (access.reason === 'private_prod') {
          notification.show(t('このプリセットは非公開です。ローカルモード (npm run dev) でのみ開けます。'), 4000);
        } else {
          notification.show(t('このプリセットを開くことができません'), 3000);
        }
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const preset = routeApi.presets.find(p => p.id === presetId);
      if (!preset) {
        notification.show(`${t('プリセットが見つかりません: ')}${presetId}`, 3000);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      urlParamsHandledRef.current = true;
      setUrlLoadConfirm({ type: 'preset', id: presetId, name: preset.name });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [routeApi.presets, routeApi.checkPresetUrlAccess]);

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
    if (!defaultsLoaded) return;
    if (globalMarkersStore.globalMarkers.length === 0) return;
    const targetId = globalDefaultsRef.current.startupFocusMarkerId;
    if (!targetId) return;
    const exists =
      globalMarkersStore.globalMarkers.some(m => m.id === targetId) ||
      routeApi.route.markers.some(m => m.id === targetId);
    if (!exists) return;
    startupFocusedRef.current = true;
    setTimeout(() => setFocusTrigger({ id: targetId, timestamp: Date.now() }), 300);
  }, [globalMarkersStore.globalMarkers, routeApi.route.markers, defaultsLoaded]);

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
  // Default: 画像とデータのみ (PNG tEXt メタデータのみ。データバー非描画)
  // Alt+クリック: データーバー入り (上記に加えて画像下部にピクセル符号化データバーを描画)
  const handleExportPNG = (e?: React.MouseEvent) => {
    fileIO.exportPNG({ floor: currentFloor, canvas: canvasRef.current, svgString, skipDataBar: !e?.altKey });
  };

  const handleExportJSON = () => {
    fileIO.exportJSON();
  };

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
      visibility: normalizePresetVisibility(visibility),
      routeData: toSave
    };
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
                  ✏️ 編集モード
                </button>
                <button
                  className={`btn-cyber ${!isEditMode ? 'active success' : ''}`}
                  style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                  onClick={() => { setIsEditMode(false); setToolMode('move'); }}
                >
                  👁 表示モード
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
                  ❓ ヘルプ・設定
                </button>
              </div>
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
                <span>{t('🏷️ マーカー表示設定')}</span>
                <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{markerVisExpanded ? t('▼ 折りたたむ') : t('▶ 展開')}</span>
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

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginTop: '8px' }}>
                    <input
                      type="checkbox"
                      checked={textPinPassThrough}
                      onChange={(e) => setTextPinPassThrough(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    🖱️ 表示モードでテキストピンのクリックを透過
                  </label>

                  <div style={{ marginTop: '8px' }}>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <div className="panel-title" style={{ marginBottom: '6px' }}>MARKER VISIBILITY</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#7ec8e3', fontWeight: 'bold' }}>GLOBAL:</div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
                          onClick={() => {
                            // 一括トグル: クロージャ毎の route 参照で hidden 判定すると
                            // ループ末尾の状態 (旧値基準) しか反映されないため、
                            // 旧値から最終状態を一度だけ計算して単一の setRoute にまとめる
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
                </>
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
                <div className="panel-title">{t('モード選択')}</div>
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
                <div className="panel-title">{t('線分編集')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  <span>{t('選択中の線:')}</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{editStrokeIdxs.size}{t('本')}</span>
                </div>
                <button
                  className="btn-cyber"
                  style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '6px' }}
                  disabled={editStrokeIdxs.size === 0}
                  onClick={() => setEditStrokeIdxs(new Set())}
                >
                  {t('選択を解除')}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '6px', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={editDisablePinsDuringEdit}
                    onChange={(e) => setEditDisablePinsDuringEdit(e.target.checked)}
                    style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                  />
                  {t('マーカーを遮断')}
                </label>

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

            {toolMode === 'draw' && (
              <div className="panel-section">
                <div className="panel-title">{t('ルート線設定')}</div>
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
                      {m === 'free' ? 'フリー' : m === 'smooth' ? 'スムーズ' : '直線'}
                    </button>
                  ))}
                </div>
                <button className="btn-cyber" style={{ width: '100%', marginTop: '6px', padding: '5px', fontSize: '10px' }} onClick={() => {
                  if (routeApi.route.strokes[currentFloor] && routeApi.route.strokes[currentFloor].length > 0) {
                    const lastIdx = routeApi.route.strokes[currentFloor].length - 1;
                    const last = routeApi.route.strokes[currentFloor][lastIdx];
                    const smoothed = smoothStrokePoints(last.points, 3, 1500);
                    // originalPoints も「補正後」の基準値として平滑化結果に追従させる
                    // (元の originalPoints があればそれも平滑化、なければ points を使う)
                    const baseForOriginal = last.originalPoints && last.originalPoints.length >= 2
                      ? last.originalPoints
                      : last.points;
                    const smoothedOriginal = baseForOriginal.length === smoothed.length
                      ? smoothed
                      : smoothStrokePoints(baseForOriginal, 3, 1500);
                    updateStrokes([...routeApi.route.strokes[currentFloor].slice(0, lastIdx), { ...last, points: smoothed, originalPoints: smoothedOriginal }]);
                  }
                }}>
                  ✨ 最後の線を平滑化
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>線の太さ: {strokeWidth}px</span>
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
                <div className="panel-title">{t('マーカー(グローバル)')}</div>
                <div className="marker-list">
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
              </div>
            )}

            {isEditMode && (
              <div className="panel-section">
                <div className="panel-title">{t('マーカー')}</div>
                <div className="marker-list">
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

        {/* Map area */}
        <section style={{ position: 'relative', minWidth: 0, minHeight: 0, gridColumn: 2 }}>
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
            hideRouteLines={hideRouteLines}
            routeLines1px={routeLines1px}
            hideBranchLines={hideBranchLines}
            branchLines1px={branchLines1px}
            disablePinsDuringDraw={disablePinsDuringDraw}
            textPinPassThrough={textPinPassThrough}
            eraseTarget={eraseTarget}
            eraseDefaultBehavior={eraseDefaultBehavior}
            eraseSize={eraseSize}
            editStrokeIdxs={editStrokeIdxs}
            onEditStrokeIdxsChange={setEditStrokeIdxs}
            editDisablePinsDuringEdit={editDisablePinsDuringEdit}
            onMarkersDragStart={historyApi.startDragSnapshot}
            onMarkersDragEnd={historyApi.commitDragSnapshot}
            stopMarkerThreshold={stopMarkerThreshold}
            movementMarkerThreshold={movementMarkerThreshold}
            warpMarkerThreshold={warpMarkerThreshold}
            skillCdThreshold={skillCdThreshold}
            showDetectionRanges={showDetectionRanges}
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
          />
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
                    <Upload size={12} /> {t('読込')}
                  </button>
                  <button className="btn-cyber danger" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={createNewPlan}>
                    <FilePlus size={12} /> {newPlanConfirm ? t('実行?') : t('新規')}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportJSON}>
                    <Download size={12} /> {t('JSON保存')}
                  </button>
                  <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleExportPNG} title={t('ALT+クリックでデーターバー入り')}>
                    <ImageIcon size={12} /> {t('画像保存')}
                  </button>
                  <button className="btn-cyber" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => fileIO.jsonFileInputRef.current?.click()}>
                    <Upload size={12} /> {t('インポート')}
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
                            setAuthorEdit(v);
                            routeApi.setRoute({ ...routeApi.route, author: v });
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
                          // renderCache はメモリ上は平文。空文字 → No name、空でなく
                          // AUTHOR_DEFAULT_PLAIN と一致 → No name、それ以外 → 平文表示。
                          // 改ざんの疑い (復号失敗) はメモリに反映されない (loadFromLocal で
                          // AUTHOR_TAMPERED は空文字扱い) ので、ここでは Anomaly 表示は
                          // 出さない。 必要なら将来 getSavesList 側で生暗号文のままだと
                          // 検出できるが、本仕様ではメモリに復号済みを置く前提。
                          const cache = routeApi.route.renderCache || '';
                          const isEmpty = !cache || cache === AUTHOR_DEFAULT_PLAIN;
                          if (isEmpty) {
                            return <div className="display-field" style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-muted)' }}>No name</span></div>;
                          }
                          return <div className="display-field">{cache}</div>;
                        })()}
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
                            {routeApi.route.customBg[currentFloor] ? t('カスタムBG: 設定済み') : <span className="empty">{t('デフォルトBG使用中')}</span>}
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

            {rightTab === 'play' && (
              <>
                <LangSync />
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
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <input type="checkbox" checked={autoRoute.waitEnabled} onChange={(e) => autoRoute.setWaitEnabled(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)' }} />
                          <span>{t('開始前に待機 (')}</span>
                          <input type="number" min="0" max="60" value={autoRoute.waitSeconds} onChange={(e) => autoRoute.setWaitSeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} disabled={!autoRoute.waitEnabled} style={{ width: '36px', fontSize: '10px', textAlign: 'center', padding: '1px 2px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--cyan-neon)', borderRadius: '2px' }} />
                          <span>{t('秒)')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>{t('🐾 スタート停止 (')}</span>
                          <input type="number" min="0" max="60" value={autoRoute.startStopSeconds} onChange={(e) => autoRoute.setStartStopSeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} style={{ width: '36px', fontSize: '10px', textAlign: 'center', padding: '1px 2px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--cyan-neon)', borderRadius: '2px' }} />
                          <span>{t('秒)')}</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>{t('移動速度:')}</span>
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
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.fuseMode} onChange={(e) => autoRoute.setFuseMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('💣 導火線モード')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.inactiveMarkersMode} onChange={(e) => autoRoute.setInactiveMarkersMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('🔘 通過マーカー半透明化')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={autoRoute.followCamera} onChange={(e) => autoRoute.setFollowCamera(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
                          <span>{t('🎥 カメラ追従')}</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>{t('倍速:')}</span>
                          {([1, 2, 3, 5, 10] as const).map(m => (
                            <button key={m} translate="no" className={`btn-cyber ${autoRoute.speedMultiplier === m ? 'active' : ''}`} style={{ flex: 1, padding: '2px', fontSize: '10px' }} onClick={() => autoRoute.setSpeedMultiplier(m)}>x{m}</button>
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
                        <Download size={9} /> 保存
                      </button>
                      <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px' }} onClick={() => playDataImportRef.current?.click()} title="JSONからプレイデータを読み込み">
                        <Upload size={9} /> 読込
                      </button>
                    </div>
                  </div>
                  <input ref={playDataImportRef} type="file" accept=".json" onChange={handleImportPlayData} style={{ display: 'none' }} />
                  <PlayDataPanel
                    routeTitle={routeApi.route.title}
                    onNotify={(msg) => { notification.show(msg); }}
                    refreshKey={playDataRefreshKey}
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
                <StorageUsageBadge />
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
                <button className="btn-cyber" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={() => { setPresetListVisible(false); setSaveLoadSearchQuery(''); setSaveLoadFilter('all'); }}>{t('✕ 閉じる')}</button>
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
                const visiblePresets = routeApi.filterVisiblePresets({ showUnlisted: true, showPrivate: true });
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
                              {p.renderCache && <span style={{ color: 'var(--text-muted)' }}>{t('原作者: 設定済')}</span>}
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
                              <SaveListRowAuthor
                                authorEnc={s.author || ''}
                                renderCacheEnc={s.renderCache || ''}
                                routeId={s.id}
                                createdAt={s.createdAt}
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

      {urlLoadConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setUrlLoadConfirm(null)}>
          <div style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '420px', padding: '20px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)', marginBottom: '12px' }}>
              {urlLoadConfirm.type === 'preset' ? t('プリセット') : t('セーブデータ')}{t('を読み込みますか？')}
            </div>
            <div style={{ fontSize: '13px', color: '#b0b0b0', marginBottom: '16px' }}>
              「<span style={{ color: urlLoadConfirm.type === 'preset' ? '#ffd700' : 'var(--cyan-neon)', fontWeight: 700 }}>{urlLoadConfirm.name}</span>」{t('を読み込みます。')}<br />
              {t('現在の編集内容は破棄されます。')}
              {urlLoadConfirm.type === 'preset' && (() => {
                const p = routeApi.presets.find(x => x.id === urlLoadConfirm.id);
                if (!p) return null;
                const v = getPresetVisibility(p);
                if (v === 'public') return null;
                const vMeta = PRESET_VISIBILITY_META[v];
                return (
                  <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: `${vMeta.color}22`, border: `1px solid ${vMeta.color}66`, borderRadius: '4px' }}>
                    <span>{vMeta.emoji}</span>
                    <span style={{ color: vMeta.color, fontWeight: 700, fontSize: '11px' }}>{vMeta.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}> — {vMeta.description}</span>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button className="btn-cyber success" style={{ padding: '6px 20px', fontSize: '12px' }} onClick={() => {
                stopAutoRouteIfActive();
                if (urlLoadConfirm.type === 'preset') {
                  routeApi.loadFromLocal(`__preset__${urlLoadConfirm.id}`);
                } else {
                  const data = DataManager.loadFromLocalStorage(urlLoadConfirm.id);
                  if (data) {
                    const { data: migrated, result, legacyMigrated } = migrateLoadedRoute(data);
                    if (legacyMigrated || result.applied.length > 0) {
                      DataManager.saveToLocalStorage(migrated);
                    }
                    if (result.unknown) {
                      notification.show(
                        `⚠️ 未登録バージョンのセーブデータです (v${result.unknownVersion})。そのまま読み込みます。`,
                        5000
                      );
                    } else if (result.applied.length > 0) {
                      notification.show(
                        `セーブデータを ${result.applied.length} 件マイグレーションしました (→ v${result.finalVersion})`,
                        3000
                      );
                    }
                    routeApi.setRouteWithGlobalDefaults(migrated);
                    if (migrated.markerScale !== undefined) {
                      setMarkerScale(migrated.markerScale);
                      localStorage.setItem('heist_marker_scale', String(migrated.markerScale));
                    }
                  }
                }
                notification.show(`${t('読み込み完了: ')}${urlLoadConfirm.name}`);
                setUrlLoadConfirm(null);
              }}>{t('読み込む')}</button>
              <button className="btn-cyber" style={{ padding: '6px 20px', fontSize: '12px' }} onClick={() => setUrlLoadConfirm(null)}>{t('キャンセル')}</button>
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
          routeApi.setRoute(prev => ({ ...prev, renderCache: '' }));
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
        onShowOcrDebug={() => setShowOcrDebugModal(true)}
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
    </div>
  );
}
