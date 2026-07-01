import React, { memo, useState } from 'react';
import { MARKER_META, APP_VERSION, type HeistMarker, type RouteData, type SkillCdPreset } from '../utils/DataManager';
import { HELP_TABS, saveHelpData } from '../utils/HelpDataManager';
import { t } from '../i18n';
import { DictionaryEditor } from './DictionaryEditor';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useStorageQuota } from '../hooks/useStorageQuota';

// Isolated component that only re-renders when the HTML string actually changes.
// Prevents parent re-renders (e.g. auto-route engine ticks) from re-evaluating
// dangerouslySetInnerHTML and losing the user's text selection.
interface HelpContentViewProps {
  html: string;
}
const HelpContentView = memo(({ html }: HelpContentViewProps) => (
  <div
    className="help-content-view"
    style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', padding: '5px' }}
    dangerouslySetInnerHTML={{ __html: html }}
  />
));
HelpContentView.displayName = 'HelpContentView';

interface HelpModalProps {
  show: boolean;
  onClose: () => void;
  isLocal: boolean;
  isEditMode: boolean;
  helpActiveTab: string;
  setHelpActiveTab: (tab: string) => void;
  helpTexts: Record<string, string>;
  setHelpTexts: (texts: Record<string, string>) => void;
  isHelpPreviewMode: boolean;
  setIsHelpPreviewMode: (preview: boolean) => void;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  setLeftSidebarCollapsed: (v: boolean) => void;
  setRightSidebarCollapsed: (v: boolean) => void;
  currentFloor: string;
  globalMarkers: HeistMarker[];
  route: RouteData;
  onHideGlobalMarker: (id: string) => void;
  onShowGlobalMarker: (id: string) => void;
  startupFocusMarkerId?: string;
  onSetStartupFocus: (markerId: string | null) => void;
  onClearOriginalAuthor?: () => void;
  autoLoadLastRoute?: boolean;
  onSetAutoLoadLastRoute?: (enabled: boolean) => void;
  autoSaveEnabled?: boolean;
  onSetAutoSaveEnabled?: (enabled: boolean) => void;
  showDetectionRanges?: boolean;
  onSetShowDetectionRanges?: (enabled: boolean) => void;
  stopMarkerThreshold?: number;
  setStopMarkerThreshold?: (n: number) => void;
  movementMarkerThreshold?: number;
  setMovementMarkerThreshold?: (n: number) => void;
  warpMarkerThreshold?: number;
  setWarpMarkerThreshold?: (n: number) => void;
  skillCdThreshold?: number;
  setSkillCdThreshold?: (n: number) => void;
  onShowOcrDebug?: () => void;
  // スキルCDプリセット管理 (設定タブから操作)
  skillCdPresets?: SkillCdPreset[];
  onAddSkillCdPreset?: (input: { label: string; color: string; mode: 'fixed' | 'per_second'; seconds: number; perSecondCd: number }) => void;
  onUpdateSkillCdPreset?: (id: string, patch: Partial<Omit<SkillCdPreset, 'id'>>) => void;
  onRemoveSkillCdPreset?: (id: string) => void;
  storageLimitBytes?: number;
  onSetStorageLimit?: (bytes: number) => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  show, onClose, isLocal, isEditMode,
  helpActiveTab, setHelpActiveTab, helpTexts, setHelpTexts,
  isHelpPreviewMode, setIsHelpPreviewMode,
  bgFileInputRef, setLeftSidebarCollapsed, setRightSidebarCollapsed,
  currentFloor,
  globalMarkers, route,
  onHideGlobalMarker, onShowGlobalMarker,
  startupFocusMarkerId, onSetStartupFocus,
  onClearOriginalAuthor,
  autoLoadLastRoute,
  onSetAutoLoadLastRoute,
  autoSaveEnabled,
  onSetAutoSaveEnabled,
  showDetectionRanges,
  onSetShowDetectionRanges,
  stopMarkerThreshold,
  setStopMarkerThreshold,
  movementMarkerThreshold,
  setMovementMarkerThreshold,
  warpMarkerThreshold,
  setWarpMarkerThreshold,
  skillCdThreshold,
  setSkillCdThreshold,
  onShowOcrDebug,
  skillCdPresets = [],
  onAddSkillCdPreset,
  onUpdateSkillCdPreset,
  onRemoveSkillCdPreset,
  storageLimitBytes,
  onSetStorageLimit
}) => {
  const [globalMarkerEditorOpen, setGlobalMarkerEditorOpen] = useState(false);
  const [globalMarkerJson, setGlobalMarkerJson] = useState('');
  const [globalMarkerSaveMsg, setGlobalMarkerSaveMsg] = useState('');

  if (!show) return null;

  const tabs = HELP_TABS.filter(t => t.id !== 'debug' || isLocal);
  const currentTabData = tabs.find(t => t.id === helpActiveTab) || tabs[0];
  const isDebugTab = currentTabData.id === 'debug';
  const isSettingsTab = currentTabData.id === 'settings';
  const currentText = (isDebugTab || isSettingsTab) ? '' : (helpTexts[currentTabData.id] || '');
  const setCurrentText = (!isDebugTab && !isSettingsTab && isLocal) ? (val: string) => {
    const next = { ...helpTexts, [currentTabData.id]: val };
    setHelpTexts(next);
    saveHelpData(next);
  } : undefined;

  return (
    <div tabIndex={-1} autoFocus style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(5, 7, 10, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, outline: 'none' }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95%', height: '85vh', maxHeight: '90%', padding: '25px', borderRadius: '8px', border: '1.5px solid var(--cyan-neon)', boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)', background: 'rgba(10, 15, 28, 0.98)', display: 'flex', flexDirection: 'column', gap: '0', pointerEvents: 'auto', color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 240, 255, 0.2)', paddingBottom: '10px', marginBottom: '0' }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t('ヘルプ・情報')}
          </span>
          <button onClick={() => { onClose(); setIsHelpPreviewMode(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(0, 240, 255, 0.15)', flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setHelpActiveTab(tab.id)} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: helpActiveTab === tab.id ? 'bold' : 'normal', color: helpActiveTab === tab.id ? 'var(--cyan-neon)' : 'var(--text-muted)', background: helpActiveTab === tab.id ? 'rgba(0, 240, 255, 0.08)' : 'transparent', border: 'none', borderBottom: helpActiveTab === tab.id ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
              {t(tab.label)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: '200px', padding: '12px 0' }}>
          {isDebugTab ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '4px' }}>
                {t('デバッグメニュー（グローバル編集モード専用）')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px', background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.15)', borderRadius: '4px' }}>
                <span>{t('🏷️ アプリバージョン')}</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>v{APP_VERSION}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {t('セーブ: ')}<span style={{ fontFamily: 'monospace', color: route.saveDataVersion ? 'var(--yellow-neon, #ffe600)' : 'var(--text-muted)' }}>{route.saveDataVersion ? `v${route.saveDataVersion}` : t('未記録')}</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setTimeout(() => bgFileInputRef.current?.click(), 100); }}>
                  🗺️ {t('カスタムBGを変更')}
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setLeftSidebarCollapsed(false); }}>
                  📌 {t('マーカー表示設定を開く')}
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setRightSidebarCollapsed(false); }}>
                  📋 {t('プラン一覧を開く')}
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); localStorage.clear(); window.location.reload(); }}>
                  🗑️ {t('全データをリセット')}
                </button>
                {onClearOriginalAuthor && (
                  <button className="btn-cyber danger" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClearOriginalAuthor(); onClose(); }}>
                    🔓 {t('原作者名をクリア')}
                  </button>
                )}
                {onShowOcrDebug && (
                  <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderColor: 'var(--magenta-neon, #ff00ff)', color: 'var(--magenta-neon, #ff00ff)' }} onClick={() => { onShowOcrDebug(); onClose(); }}>
                    ⚙️ {t('OCR調整テストベンチを開く')}
                  </button>
                )}

                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={async () => {
                  if (!globalMarkerEditorOpen) {
                    try {
                      const res = await fetch('/api/global-markers');
                      const data = await res.json();
                      setGlobalMarkerJson(JSON.stringify(data, null, 2));
                    } catch { setGlobalMarkerJson('[]'); }
                    setGlobalMarkerEditorOpen(true);
                  } else {
                    setGlobalMarkerEditorOpen(false);
                    setGlobalMarkerSaveMsg('');
                  }
                }}>
                  🌐 {globalMarkerEditorOpen ? t('グローバルピン編集を閉じる') : t('グローバルピンを編集')}
                </button>

                <div style={{ borderTop: '1px solid rgba(255,215,0,0.3)', paddingTop: '12px', marginTop: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffd700', marginBottom: '8px' }}>
                    🌐 {t('言語切替')}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <LanguageSwitcher />
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffd700', marginBottom: '8px' }}>
                    📖 {t('翻訳辞書エディタ')}
                  </div>
                  <DictionaryEditor />
                </div>

                {/* Startup focus selector */}
                <div style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('起動時のマップ移動先:')}</div>
                  <select
                    value={startupFocusMarkerId || ''}
                    onChange={async (e) => {
                      const value = e.target.value;
                      const markerId = value || null;
                      onSetStartupFocus(markerId);
                      try {
                        const res = await fetch('/api/global-defaults');
                        const gd = await res.json();
                        gd.startupFocusMarkerId = markerId || undefined;
                        await fetch('/api/global-defaults', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gd) });
                      } catch { /* ignore */ }
                    }}
                    style={{ width: '100%', padding: '4px', fontSize: '10px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.2)', color: 'var(--text-primary)', borderRadius: '4px' }}
                  >
                    <option value="">{t('-- 移動しない --')}</option>
                    {globalMarkers.filter(m => m.floor === currentFloor).map(m => {
                      const meta = MARKER_META[m.type];
                      return <option key={m.id} value={m.id}>{meta.emoji} {meta.label} {m.note ? `(${m.note.substring(0, 20)})` : ''} - X:{m.x} Y:{m.y}</option>;
                    })}
                  </select>
                </div>

                {globalMarkerEditorOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea
                      value={globalMarkerJson}
                      onChange={(e) => setGlobalMarkerJson(e.target.value)}
                      style={{ width: '100%', minHeight: '200px', background: 'rgba(5,7,10,0.8)', border: '1px solid rgba(0,240,255,0.3)', color: 'var(--text-primary)', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '10px', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="btn-cyber success" style={{ fontSize: '10px', padding: '4px 12px', clipPath: 'none' }} onClick={async () => {
                        try {
                          const res = await fetch('/api/global-markers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: globalMarkerJson });
                          if (res.ok) { setGlobalMarkerSaveMsg(t('保存しました')); setTimeout(() => setGlobalMarkerSaveMsg(''), 2000); }
                          else { setGlobalMarkerSaveMsg(t('保存失敗')); }
                        } catch { setGlobalMarkerSaveMsg(t('エラー')); }
                      }}>
                        💾 {t('保存')}
                      </button>
                      {globalMarkerSaveMsg && <span style={{ fontSize: '10px', color: globalMarkerSaveMsg === t('保存しました') ? '#0f0' : '#f55' }}>{globalMarkerSaveMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
              {/* 設定 (Settings) — removed from debug tab; now in dedicated 設定 tab */}
              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255, 149, 0, 0.04)', border: '1px solid rgba(255, 149, 0, 0.2)', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#ff9500', marginBottom: '6px' }}>{t('🛠 自動ルート デバッグ')}</div>
                {onSetShowDetectionRanges && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={!!showDetectionRanges}
                      onChange={(e) => onSetShowDetectionRanges(e.target.checked)}
                      style={{ accentColor: '#ff9500', cursor: 'pointer' }}
                    />
                    🎯 {t('判定範囲を強調表示')}
                  </label>
                )}

                {/* Threshold sliders */}
                {setStopMarkerThreshold && setMovementMarkerThreshold && setWarpMarkerThreshold && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{t('判定閾値 (px)')}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#ff4444', minWidth: '70px' }}>{t('🔴 停止')}</span>
                      <input type="range" min="5" max="30" step="1" value={stopMarkerThreshold ?? 12}
                        onChange={(e) => setStopMarkerThreshold(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#ff4444' }} />
                      <span style={{ fontSize: '11px', color: '#ff4444', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{stopMarkerThreshold}px</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#39ff14', minWidth: '70px' }}>{t('🟢 階段')}</span>
                      <input type="range" min="5" max="30" step="1" value={movementMarkerThreshold ?? 20}
                        onChange={(e) => setMovementMarkerThreshold(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#39ff14' }} />
                      <span style={{ fontSize: '11px', color: '#39ff14', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{movementMarkerThreshold}px</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#ff9500', minWidth: '70px' }}>{t('🟠 ワープ')}</span>
                      <input type="range" min="5" max="30" step="1" value={warpMarkerThreshold ?? 12}
                        onChange={(e) => setWarpMarkerThreshold(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#ff9500' }} />
                      <span style={{ fontSize: '11px', color: '#ff9500', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{warpMarkerThreshold}px</span>
                    </div>

                    {setSkillCdThreshold && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#39ff14', minWidth: '70px' }}>{t('⏱ スキルCD')}</span>
                        <input type="range" min="5" max="20" step="1" value={skillCdThreshold ?? 10}
                          onChange={(e) => setSkillCdThreshold(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: '#39ff14' }} />
                        <span style={{ fontSize: '11px', color: '#39ff14', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{skillCdThreshold}px</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                  {t('スライダーで各マーカーの判定距離を変更できます。')}<br />
                  {t('スキルCDは 5〜20px の範囲で他とは別に調整できます (デフォルト10px)。')}<br />
                  {t('値は即座に自動ルート・判定範囲の円に反映されます。')}
                </div>
              </div>
              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('デバッグ情報:')}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  <div>isLocal: {isLocal ? 'true' : 'false'}</div>
                  <div>isEditMode: {isEditMode ? 'true' : 'false'}</div>
                  <div>floor: {currentFloor}</div>
                  <div>markers: {route.markers.length}</div>
                  <div>globalMarkers: {globalMarkers.length}</div>
                </div>
              </div>
              {/* Marker visibility toggles */}
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '6px' }}>{t('マーカー表示切替:')}</div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {globalMarkers.length > 0 && <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>{t('グローバル:')}</div>}
                  {globalMarkers
                    // チェックポイントピンをスタートピンの後ろ (リスト下段) に表示
                    .slice()
                    .sort((a, b) => {
                      const rank = (t: string) => (t === 'start' ? 0 : t === 'checkpoint' ? 2 : 1);
                      return rank(a.type) - rank(b.type);
                    })
                    .map(m => {
                    const meta = MARKER_META[m.type];
                    const isHidden = (route.hiddenMarkers || []).includes(m.id);
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '3px', background: isHidden ? 'rgba(255,255,255,0.02)' : 'rgba(0,240,255,0.04)' }}>
                        <span style={{ fontSize: '12px' }}>{meta.emoji}</span>
                        <span style={{ fontSize: '11px', color: isHidden ? '#666' : meta.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label} {m.note ? `(${m.note.substring(0, 15)})` : ''}</span>
                        <button className="btn-cyber" style={{ padding: '1px 6px', fontSize: '10px', clipPath: 'none', borderColor: isHidden ? '#f55' : '#0f0', color: isHidden ? '#f55' : '#0f0' }} onClick={() => { if (isHidden) onShowGlobalMarker(m.id); else onHideGlobalMarker(m.id); }}>
                          {isHidden ? t('非表示') : t('表示中')}
                        </button>
                      </div>
                    );
                  })}
                  {route.markers.length > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>{t('個別:')}</div>}
                  {route.markers
                    // チェックポイントピンをスタートピンの後ろ (リスト下段) に表示
                    .slice()
                    .sort((a, b) => {
                      const rank = (t: string) => (t === 'start' ? 0 : t === 'checkpoint' ? 2 : 1);
                      return rank(a.type) - rank(b.type);
                    })
                    .map(m => {
                    const meta = MARKER_META[m.type];
                    const isHidden = (route.hiddenMarkers || []).includes(m.id);
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '3px', background: isHidden ? 'rgba(255,255,255,0.02)' : 'rgba(0,240,255,0.04)' }}>
                        <span style={{ fontSize: '12px' }}>{meta.emoji}</span>
                        <span style={{ fontSize: '11px', color: isHidden ? '#666' : meta.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label} {m.note ? `(${m.note.substring(0, 15)})` : ''}</span>
                        <button className="btn-cyber" style={{ padding: '1px 6px', fontSize: '10px', clipPath: 'none', borderColor: isHidden ? '#f55' : '#0f0', color: isHidden ? '#f55' : '#0f0' }} onClick={() => { if (isHidden) onShowGlobalMarker(m.id); else onHideGlobalMarker(m.id); }}>
                          {isHidden ? t('非表示') : t('表示中')}
                        </button>
                      </div>
                    );
                  })}
                  {globalMarkers.length === 0 && route.markers.length === 0 && <div style={{ fontSize: '11px', color: '#666', padding: '8px', textAlign: 'center' }}>{t('マーカーがありません')}</div>}
                </div>
              </div>
            </div>
          ) : isSettingsTab ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '4px' }}>
                {t('⚙️ 設定')}
              </div>
              {onSetAutoLoadLastRoute && (
                <div style={{ padding: '10px 14px', background: 'rgba(0, 240, 255, 0.04)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoLoadLastRoute ?? true}
                      onChange={(e) => onSetAutoLoadLastRoute(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    🚀 {t('起動時に最後に使用していたデータを自動で読み込む')}
                  </label>
                </div>
              )}

              {onSetAutoSaveEnabled && (
                <div style={{ padding: '10px 14px', background: 'rgba(0, 240, 255, 0.04)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoSaveEnabled ?? true}
                      onChange={(e) => onSetAutoSaveEnabled(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                    💾 {t('編集内容を自動で保存する (1.5秒のデバウンス)')}
                  </label>
                  {autoSaveEnabled === false && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', paddingLeft: '24px' }}>
                      {t('オートセーブは無効です。手動で保存してください。')}
                    </div>
                  )}
                </div>
              )}

              {/* ストレージ容量計測 */}
              {onSetStorageLimit && (
                <StorageLimitSection
                  limitBytes={storageLimitBytes ?? 10 * 1024 * 1024}
                  onSetStorageLimit={onSetStorageLimit}
                />
              )}

              {/* スキルCDプリセット管理 */}
              <div style={{ padding: '10px 14px', background: 'rgba(57, 255, 20, 0.04)', border: '1px solid rgba(57, 255, 20, 0.25)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#39ff14' }}>{t('⏱️ スキルCDプリセット')}</span>
                  {!isLocal && (
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>{t('閲覧のみ')}</span>
                  )}
                </div>
                {isLocal && onAddSkillCdPreset && (
                  <SkillCdPresetAddForm onAdd={onAddSkillCdPreset} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto', marginTop: '8px' }}>
                  {skillCdPresets.length === 0 ? (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px', textAlign: 'center' }}>
                      {t('なし')}
                    </div>
                  ) : (
                    skillCdPresets.map(p => (
                      <SkillCdPresetRow
                        key={p.id}
                        preset={p}
                        editable={isLocal}
                        onUpdate={onUpdateSkillCdPreset}
                        onRemove={onRemoveSkillCdPreset}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* 言語切替 (全ユーザーが利用可能) */}
              <div style={{ padding: '10px 14px', background: 'rgba(255, 215, 0, 0.04)', border: '1px solid rgba(255, 215, 0, 0.25)', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ffd700', marginBottom: '8px' }}>
                  🌐 {t('言語切替')}
                </div>
                <LanguageSwitcher />
              </div>

              {/* 翻訳辞書エディタ (全ユーザーが個人データとして localStorage に追加可能) */}
              <div style={{ padding: '10px 14px', background: 'rgba(255, 215, 0, 0.04)', border: '1px solid rgba(255, 215, 0, 0.25)', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ffd700', marginBottom: '8px' }}>
                  📖 {t('翻訳辞書エディタ')}
                </div>
                <DictionaryEditor />
              </div>
            </div>
          ) : isEditMode && isLocal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, height: '100%' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('※ グローバル編集モード: HTMLタグ（aタグ等含む）で自由に編集できます。')}</div>
              {/* Stacked container: keep BOTH the textarea and the preview in the DOM at all
                  times so the browser preserves the textarea's native Undo/Redo history
                  when toggling preview. `display:none` would unmount the textarea from
                  layout and some browsers (notably Firefox) clear the undo stack in that
                  case. Using `visibility:hidden` + `pointer-events:none` keeps the
                  element rendered (and its undo history intact) while hiding it from
                  the user. */}
              <div style={{ position: 'relative', flex: 1, minHeight: '300px' }}>
                <textarea
                  value={currentText}
                  onChange={setCurrentText ? (e) => setCurrentText(e.target.value) : undefined}
                  placeholder={t('HTMLタグを使って自由に記述してください')}
                  tabIndex={isHelpPreviewMode ? -1 : 0}
                  aria-hidden={isHelpPreviewMode}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(5, 7, 10, 0.8)',
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    color: 'var(--text-primary)',
                    padding: '12px',
                    borderRadius: '4px',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '13px',
                    resize: 'none',
                    visibility: isHelpPreviewMode ? 'hidden' : 'visible',
                    pointerEvents: isHelpPreviewMode ? 'none' : 'auto',
                  }}
                />
                <div
                  aria-hidden={!isHelpPreviewMode}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    overflow: 'auto',
                    border: '1px solid rgba(0, 240, 255, 0.15)',
                    borderRadius: '4px',
                    padding: '5px',
                    background: 'rgba(10, 15, 28, 0.6)',
                    visibility: isHelpPreviewMode ? 'visible' : 'hidden',
                    pointerEvents: isHelpPreviewMode ? 'auto' : 'none',
                  }}
                >
                  <HelpContentView html={currentText || `<p style="color:var(--text-muted);font-style:italic;">${t('表示する情報がありません。')}</p>`} />
                </div>
              </div>
            </div>
          ) : (
            <HelpContentView html={currentText || `<p style="color:var(--text-muted);font-style:italic;">${t('表示する情報がありません。')}</p>`} />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', flexShrink: 0 }}>
          {isEditMode && isLocal ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={isHelpPreviewMode} onChange={(e) => setIsHelpPreviewMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
              👁 {t('プレビュー表示 (HTML表示)')}
            </label>
          ) : <div />}
        </div>
      </div>
    </div>
  );
};

// ---- ストレージ容量設定セクション ----
function formatStorageBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

interface StorageLimitSectionProps {
  /** 旧 prop (互換性のため残す)。新実装では使用しない */
  limitBytes?: number;
  /** 旧 prop (互換性のため残す) */
  onSetStorageLimit?: (bytes: number) => void;
}

/**
 * ストレージ管理セクション。
 * ブラウザの navigator.storage API を使って:
 *  - 現在の使用量 / ブラウザ割当量 (quota) を表示
 *  - 永続化を要求 (一度承認されるとブラウザが自動削除しなくなる)
 *  - 「容量を計測」ボタンで実測 (= 書き込みして限界を見る)
 * 目標上限は 50MB (= バッジの警告色判定基準と同じ)。
 */
const TARGET_LIMIT_MB = 50;
const StorageLimitSection: React.FC<StorageLimitSectionProps> = () => {
  const { usage, quota, persisted, supported, requestPersist, refresh } = useStorageQuota(2000);
  const [measuring, setMeasuring] = useState(false);
  const [measuredMax, setMeasuredMax] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const computeCurrent = () => usage;

  const runMeasure = async () => {
    if (measuring) return;
    setMeasuring(true);
    setMeasuredMax(null);
    setProgress(0);
    const before = supported ? usage : computeCurrent();
    const testKey = '___heist_storage_test___';
    const chunk = 'X'.repeat(1024 * 64); // 64 KB ずつ
    let accumulated = '';
    // 進捗更新用のしきい値 (1MB 単位)
    let lastTick = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        accumulated += chunk;
        localStorage.setItem(testKey, accumulated);
        const written = accumulated.length * 2;
        const sinceTick = written - lastTick;
        if (sinceTick >= 1024 * 1024) { // 1MB ごとに更新
          setProgress(before + written);
          lastTick = written;
          // UI 更新のためにマイクロタスクを譲る
          await new Promise<void>(r => setTimeout(r, 0));
        }
      }
    } catch {
      try { localStorage.removeItem(testKey); } catch { /* ignore */ }
      const finalWritten = accumulated.length * 2;
      const max = before + finalWritten;
      setMeasuredMax(max);
      setProgress(max);
    } finally {
      try { localStorage.removeItem(testKey); } catch { /* ignore */ }
      setMeasuring(false);
      refresh();
    }
  };

  const onRequestPersist = async () => {
    const ok = await requestPersist();
    if (ok) {
      // 成功通知は呼び出し元で出す
    } else {
      // 失敗
    }
  };

  return (
    <div style={{ padding: '10px 14px', background: 'rgba(255, 230, 0, 0.04)', border: '1px solid rgba(255, 230, 0, 0.25)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--yellow-neon, #ffe600)' }}>{t('ローカルストレージ容量')}</span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('localStorage の使用量と上限を管理します。「計測」を押すと現在の使用量から上限まで書き込みを試して、このブラウザでの最大容量を推定します (数秒〜数十秒かかる場合があります)。')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className="btn-cyber"
          style={{ padding: '5px 12px', fontSize: '11px', clipPath: 'none' }}
          onClick={runMeasure}
          disabled={measuring || !supported}
        >
          {measuring ? t('計測中…') : t('容量を計測')}
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {t('現在の使用量:')} <span style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontFamily: 'monospace' }}>{formatStorageBytes(usage)}</span>
        </span>
        {supported && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t('ブラウザ割当:')} <span style={{ color: 'var(--green-neon, #39ff14)', fontWeight: 700, fontFamily: 'monospace' }}>{formatStorageBytes(quota)}</span>
          </span>
        )}
        {measuredMax !== null && (
          <span style={{ fontSize: '11px', color: 'var(--green-neon, #39ff14)' }}>
            {t('実測最大:')} <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatStorageBytes(measuredMax)}</span>
          </span>
        )}
      </div>

      {measuring && (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {t('書込中:')} <span style={{ color: 'var(--yellow-neon)', fontFamily: 'monospace' }}>{formatStorageBytes(progress)}</span> …
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {t('目標上限:')} <span style={{ color: 'var(--yellow-neon, #ffe600)', fontWeight: 700, fontFamily: 'monospace' }}>{TARGET_LIMIT_MB} MB</span>
          {t(' (= バッジの警告色判定基準。実容量上限は quota で決まります)')}
        </span>
      </div>

      {supported && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className="btn-cyber"
            style={{ padding: '4px 10px', fontSize: '11px', clipPath: 'none' }}
            onClick={onRequestPersist}
            disabled={persisted}
            title={t('永続化ストレージを要求。承認されると、ストレージ逼迫時にブラウザが自動削除しなくなります')}
          >
            {persisted ? t('✓ 永続化承認済み') : t('永続化を要求')}
          </button>
          <button
            className="btn-cyber"
            style={{ padding: '4px 10px', fontSize: '11px', clipPath: 'none' }}
            onClick={refresh}
          >
            {t('再計測')}
          </button>
          {!supported && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {t('※ このブラウザは navigator.storage に対応していません (localStorage のみで動作)')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ---- スキルCDプリセット管理用サブコンポーネント ----

interface SkillCdPresetAddFormProps {
  onAdd: (input: { label: string; color: string; mode: 'fixed' | 'per_second'; seconds: number; perSecondCd: number }) => void;
}
const SkillCdPresetAddForm: React.FC<SkillCdPresetAddFormProps> = ({ onAdd }) => {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#39ff14');
  const [mode, setMode] = useState<'fixed' | 'per_second'>('fixed');
  const [seconds, setSeconds] = useState(50);    // fixed: CD秒数 / per_second: 使用秒数
  const [perSecondCd, setPerSecondCd] = useState(2); // per_second: 1秒あたりCD秒数 (基本値=2)

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ label: trimmed, color, mode, seconds, perSecondCd });
    setLabel('');
    setColor('#39ff14');
    setMode('fixed');
    setSeconds(50);
    setPerSecondCd(2);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          type="text"
          value={label}
          placeholder={t('スキル名')}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          style={{ flex: 1, fontSize: '12px', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px' }}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title={t('色')}
          style={{ width: '32px', height: '26px', padding: 0, border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px', cursor: 'pointer' }}
        />
        <button
          className="btn-cyber"
          style={{ fontSize: '11px', padding: '4px 10px', clipPath: 'none' }}
          onClick={submit}
          disabled={!label.trim()}
        >
          {t('追加')}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('モード:')}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'fixed'} onChange={() => setMode('fixed')} style={{ accentColor: '#39ff14' }} />
          {t('固定 (CD秒数)')}
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'per_second'} onChange={() => setMode('per_second')} style={{ accentColor: '#39ff14' }} />
          {t('変動 (使用秒×係数)')}
        </label>
      </div>
      {mode === 'per_second' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('使用秒数')}</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={seconds}
            onChange={(e) => setSeconds(Math.max(0, parseInt(e.target.value) || 0))}
            style={{ width: '60px', fontSize: '12px', fontWeight: 'bold', padding: '3px 4px', background: 'rgba(5, 7, 10, 0.85)', color: color, border: `1px solid ${color}80`, borderRadius: '3px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒 ×')}</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={perSecondCd}
            onChange={(e) => setPerSecondCd(Math.max(0, parseInt(e.target.value) || 0))}
            style={{ width: '50px', fontSize: '12px', fontWeight: 'bold', padding: '3px 4px', background: 'rgba(5, 7, 10, 0.85)', color: color, border: `1px solid ${color}80`, borderRadius: '3px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒CD/秒 =')}</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: color, minWidth: '40px', textAlign: 'right' }}>{seconds * perSecondCd}{t('秒')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('CD秒数')}</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={seconds}
            onChange={(e) => setSeconds(Math.max(0, parseInt(e.target.value) || 0))}
            style={{ width: '80px', fontSize: '13px', fontWeight: 'bold', padding: '4px 6px', background: 'rgba(5, 7, 10, 0.85)', color: color, border: `1px solid ${color}80`, borderRadius: '3px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒')}</span>
        </div>
      )}
    </div>
  );
};

interface SkillCdPresetRowProps {
  preset: SkillCdPreset;
  editable?: boolean;
  onUpdate?: (id: string, patch: Partial<Omit<SkillCdPreset, 'id'>>) => void;
  onRemove?: (id: string) => void;
}
const SkillCdPresetRow: React.FC<SkillCdPresetRowProps> = ({ preset, editable = true, onUpdate, onRemove }) => {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const isPer = preset.mode === 'per_second';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 6px', background: 'rgba(255, 255, 255, 0.03)', border: `1px solid ${preset.color}55`, borderRadius: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-block', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(10, 15, 28, 0.85)', color: preset.color, border: `1.5px solid ${preset.color}`, textAlign: 'center', lineHeight: '16px', fontSize: '11px', fontWeight: 700, boxShadow: `0 0 6px ${preset.color}66` }}>
          {(preset.label || 'S').charAt(0)}
        </span>
        <span style={{ fontSize: '12px', color: preset.color, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.label}</span>
        {isPer ? (
          <>
            <span style={{ fontSize: '13px', color: preset.color, fontWeight: 700, fontFamily: 'monospace' }}>{preset.seconds}{t('秒')}×{preset.perSecondCd}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>= {(preset.seconds || 0) * (preset.perSecondCd || 0)}{t('秒')}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('CD')}</span>
            <span style={{ fontSize: '13px', color: preset.color, fontWeight: 700, fontFamily: 'monospace', minWidth: '40px', textAlign: 'right' }}>{preset.seconds}{t('秒')}</span>
          </>
        )}
        {editable && onUpdate && (
          <button className="btn-cyber" style={{ fontSize: '9px', padding: '1px 5px', clipPath: 'none' }} onClick={() => setEditing(v => !v)}>
            {editing ? '×' : '✎'}
          </button>
        )}
        {editable && onRemove && !confirmingRemove && (
          <button className="btn-cyber" style={{ fontSize: '9px', padding: '1px 5px', clipPath: 'none' }} onClick={() => setConfirmingRemove(true)}>{t('削除')}</button>
        )}
        {editable && onRemove && confirmingRemove && (
          <>
            <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '1px 5px', clipPath: 'none' }} onClick={() => { onRemove(preset.id); setConfirmingRemove(false); }}>{t('実行')}</button>
            <button className="btn-cyber" style={{ fontSize: '9px', padding: '1px 5px', clipPath: 'none' }} onClick={() => setConfirmingRemove(false)}>×</button>
          </>
        )}
      </div>
      {editing && onUpdate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              type="text"
              defaultValue={preset.label}
              onBlur={(e) => onUpdate(preset.id, { label: e.target.value })}
              style={{ flex: 1, fontSize: '11px', padding: '3px 6px', background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px' }}
            />
            <input
              type="color"
              defaultValue={preset.color}
              onChange={(e) => onUpdate(preset.id, { color: e.target.value })}
              style={{ width: '28px', height: '24px', padding: 0, border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '3px', cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('モード:')}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={!isPer} onChange={() => onUpdate(preset.id, { mode: 'fixed' })} style={{ accentColor: '#39ff14' }} />
              {t('固定 (CD秒数)')}
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={isPer} onChange={() => onUpdate(preset.id, { mode: 'per_second' })} style={{ accentColor: '#39ff14' }} />
              {t('変動 (使用秒×係数)')}
            </label>
          </div>
          {isPer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('使用秒数')}</span>
              <input
                type="number"
                min={0}
                max={9999}
                defaultValue={preset.seconds}
                onBlur={(e) => onUpdate(preset.id, { seconds: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ width: '55px', fontSize: '11px', fontWeight: 'bold', padding: '3px 4px', background: 'rgba(5, 7, 10, 0.85)', color: preset.color, border: `1px solid ${preset.color}80`, borderRadius: '3px', textAlign: 'center' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒 ×')}</span>
              <input
                type="number"
                min={0}
                max={9999}
                defaultValue={preset.perSecondCd}
                onBlur={(e) => onUpdate(preset.id, { perSecondCd: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ width: '45px', fontSize: '11px', fontWeight: 'bold', padding: '3px 4px', background: 'rgba(5, 7, 10, 0.85)', color: preset.color, border: `1px solid ${preset.color}80`, borderRadius: '3px', textAlign: 'center' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒CD/秒')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('CD秒数')}</span>
              <input
                type="number"
                min={0}
                max={9999}
                defaultValue={preset.seconds}
                onBlur={(e) => onUpdate(preset.id, { seconds: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ width: '70px', fontSize: '12px', fontWeight: 'bold', padding: '3px 4px', background: 'rgba(5, 7, 10, 0.85)', color: preset.color, border: `1px solid ${preset.color}80`, borderRadius: '3px', textAlign: 'center' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('秒')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
