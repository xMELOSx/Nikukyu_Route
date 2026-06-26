import React, { useState } from 'react';
import { MARKER_META, type HeistMarker, type RouteData } from '../utils/DataManager';
import { HELP_TABS, saveHelpData } from '../utils/HelpDataManager';

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
  onSetAutoLoadLastRoute
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
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(5, 7, 10, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95%', height: '85vh', maxHeight: '90%', padding: '25px', borderRadius: '8px', border: '1.5px solid var(--cyan-neon)', boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)', background: 'rgba(10, 15, 28, 0.98)', display: 'flex', flexDirection: 'column', gap: '0', pointerEvents: 'auto', color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 240, 255, 0.2)', paddingBottom: '10px', marginBottom: '0' }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ❓ ヘルプ・情報
          </span>
          <button onClick={() => { onClose(); setIsHelpPreviewMode(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(0, 240, 255, 0.15)', flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setHelpActiveTab(tab.id)} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: helpActiveTab === tab.id ? 'bold' : 'normal', color: helpActiveTab === tab.id ? 'var(--cyan-neon)' : 'var(--text-muted)', background: helpActiveTab === tab.id ? 'rgba(0, 240, 255, 0.08)' : 'transparent', border: 'none', borderBottom: helpActiveTab === tab.id ? '2px solid var(--cyan-neon)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
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
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setTimeout(() => bgFileInputRef.current?.click(), 100); }}>
                  🗺️ カスタムBGを変更
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setLeftSidebarCollapsed(false); }}>
                  📌 マーカー表示設定を開く
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); setRightSidebarCollapsed(false); }}>
                  📋 プラン一覧を開く
                </button>
                <button className="btn-cyber" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClose(); setIsHelpPreviewMode(false); localStorage.clear(); window.location.reload(); }}>
                  🗑️ 全データをリセット
                </button>
                {onClearOriginalAuthor && (
                  <button className="btn-cyber danger" style={{ width: '100%', padding: '10px', fontSize: '12px', clipPath: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onClearOriginalAuthor(); onClose(); }}>
                    🔓 原作者名をクリア
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
                  🌐 {globalMarkerEditorOpen ? 'グローバルピン編集を閉じる' : 'グローバルピンを編集'}
                </button>

                {/* Startup focus selector */}
                <div style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>起動時のマップ移動先:</div>
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
                    <option value="">-- 移動しない --</option>
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
                          if (res.ok) { setGlobalMarkerSaveMsg('保存しました'); setTimeout(() => setGlobalMarkerSaveMsg(''), 2000); }
                          else { setGlobalMarkerSaveMsg('保存失敗'); }
                        } catch { setGlobalMarkerSaveMsg('エラー'); }
                      }}>
                        💾 保存
                      </button>
                      {globalMarkerSaveMsg && <span style={{ fontSize: '10px', color: globalMarkerSaveMsg === '保存しました' ? '#0f0' : '#f55' }}>{globalMarkerSaveMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
              {/* 設定 (Settings) — removed from debug tab; now in dedicated 設定 tab */}
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
              {/* Marker visibility toggles */}
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '6px' }}>マーカー表示切替:</div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {globalMarkers.length > 0 && <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>グローバル:</div>}
                  {globalMarkers.map(m => {
                    const meta = MARKER_META[m.type];
                    const isHidden = (route.hiddenMarkers || []).includes(m.id);
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '3px', background: isHidden ? 'rgba(255,255,255,0.02)' : 'rgba(0,240,255,0.04)' }}>
                        <span style={{ fontSize: '12px' }}>{meta.emoji}</span>
                        <span style={{ fontSize: '10px', color: isHidden ? '#666' : meta.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label} {m.note ? `(${m.note.substring(0, 15)})` : ''}</span>
                        <button className="btn-cyber" style={{ padding: '1px 6px', fontSize: '9px', clipPath: 'none', borderColor: isHidden ? '#f55' : '#0f0', color: isHidden ? '#f55' : '#0f0' }} onClick={() => { if (isHidden) onShowGlobalMarker(m.id); else onHideGlobalMarker(m.id); }}>
                          {isHidden ? '非表示' : '表示中'}
                        </button>
                      </div>
                    );
                  })}
                  {route.markers.length > 0 && <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>個別:</div>}
                  {route.markers.map(m => {
                    const meta = MARKER_META[m.type];
                    const isHidden = (route.hiddenMarkers || []).includes(m.id);
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '3px', background: isHidden ? 'rgba(255,255,255,0.02)' : 'rgba(0,240,255,0.04)' }}>
                        <span style={{ fontSize: '12px' }}>{meta.emoji}</span>
                        <span style={{ fontSize: '10px', color: isHidden ? '#666' : meta.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label} {m.note ? `(${m.note.substring(0, 15)})` : ''}</span>
                        <button className="btn-cyber" style={{ padding: '1px 6px', fontSize: '9px', clipPath: 'none', borderColor: isHidden ? '#f55' : '#0f0', color: isHidden ? '#f55' : '#0f0' }} onClick={() => { if (isHidden) onShowGlobalMarker(m.id); else onHideGlobalMarker(m.id); }}>
                          {isHidden ? '非表示' : '表示中'}
                        </button>
                      </div>
                    );
                  })}
                  {globalMarkers.length === 0 && route.markers.length === 0 && <div style={{ fontSize: '10px', color: '#666', padding: '8px', textAlign: 'center' }}>マーカーがありません</div>}
                </div>
              </div>
            </div>
          ) : isSettingsTab ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '4px' }}>
                ⚙️ 設定
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
                    🚀 起動時に最後に使用していたデータを自動で読み込む
                  </label>
                </div>
              )}
            </div>
          ) : isEditMode && isLocal && !isHelpPreviewMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, height: '100%' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>※ グローバル編集モード: HTMLタグ（aタグ等含む）で自由に編集できます。</div>
              <textarea value={currentText} onChange={setCurrentText ? (e) => setCurrentText(e.target.value) : undefined} style={{ width: '100%', flex: 1, minHeight: '300px', background: 'rgba(5, 7, 10, 0.8)', border: '1px solid rgba(0, 240, 255, 0.3)', color: 'var(--text-primary)', padding: '12px', borderRadius: '4px', fontFamily: 'Consolas, Monaco, monospace', fontSize: '13px', resize: 'none' }} placeholder="HTMLタグを使って自由に記述してください" />
            </div>
          ) : (
            <div className="help-content-view" style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', padding: '5px' }} dangerouslySetInnerHTML={{ __html: currentText || '<p style="color:var(--text-muted);font-style:italic;">表示する情報がありません。</p>' }} />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', flexShrink: 0 }}>
          {isEditMode && isLocal ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={isHelpPreviewMode} onChange={(e) => setIsHelpPreviewMode(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
              👁 プレビュー表示 (HTML表示)
            </label>
          ) : <div />}
          <button className="btn-cyber success" onClick={() => { onClose(); setIsHelpPreviewMode(false); }} style={{ padding: '6px 16px', fontSize: '12px', clipPath: 'none' }}>
            {isEditMode ? '保存して閉じる' : '閉じる'}
          </button>
        </div>
      </div>
    </div>
  );
};
