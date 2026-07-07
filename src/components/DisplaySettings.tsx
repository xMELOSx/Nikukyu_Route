// @ts-nocheck
import React from 'react';
import { t } from '../i18n';

interface DisplaySettingsProps {
  showSettingsExpanded: boolean;
  setShowSettingsExpanded: (v: boolean) => void;
  showMarkerLabels: boolean;
  setShowMarkerLabels: (v: boolean) => void;
  markerScale: number;
  setMarkerScale: (v: number) => void;
  textPinPassThrough: boolean;
  setTextPinPassThrough: (v: boolean) => void;
  showPhoneCompass: boolean;
  setShowPhoneCompass: (v: boolean) => void;
  showPhoneBoxHud: boolean;
  setShowPhoneBoxHud: (v: boolean) => void;
  phoneBoxHudSize: number;
  setPhoneBoxHudSize: (v: number) => void;
  showBottomRightHud: boolean;
  setShowBottomRightHud: (v: boolean) => void;
  zoomHudSize: number;
  setZoomHudSize: (v: number) => void;
  openSubWindow: () => void;
}

const DisplaySettings: React.FC<DisplaySettingsProps> = (props) => {
  const { showSettingsExpanded, setShowSettingsExpanded, showMarkerLabels, setShowMarkerLabels, markerScale, setMarkerScale, textPinPassThrough, setTextPinPassThrough, showPhoneCompass, setShowPhoneCompass, showPhoneBoxHud, setShowPhoneBoxHud, phoneBoxHudSize, setPhoneBoxHudSize, showBottomRightHud, setShowBottomRightHud, zoomHudSize, setZoomHudSize, openSubWindow } = props;
  return (<>
    <button type="button" onClick={() => setShowSettingsExpanded(!showSettingsExpanded)}
      style={{ width: '100%', padding: '4px 8px', fontSize: '11px', background: 'rgba(0, 255, 255, 0.05)', border: '1px solid rgba(0, 255, 255, 0.15)', borderRadius: '4px', color: 'var(--cyan-neon)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: showSettingsExpanded ? '8px' : '0' }}>
      <span>{t('\u2699\ufe0f \u8868\u793a\u8a2d\u5b9a')}</span>
      <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{showSettingsExpanded ? t('\u25bc \u6298\u308a\u305f\u305f\u3080') : t('\u25b6 \u5c55\u958b')}</span>
    </button>
    {showSettingsExpanded && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showMarkerLabels} onChange={(e) => { setShowMarkerLabels(e.target.checked); localStorage.setItem('heist_show_labels', String(e.target.checked)); }} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
          <span>{t('\ud83c\udff7\ufe0f \u30e9\u30d9\u30eb\u8868\u793a')}</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
            <span>{t('\ud83d\udccc \u30d4\u30f3\u30fb\u30e9\u30d9\u30eb\u500d\u7387:')}</span>
            <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{markerScale}%</span>
          </div>
          <input type="range" min="30" max="200" step="5" value={markerScale} onChange={(e) => { const v = parseInt(e.target.value); setMarkerScale(v); localStorage.setItem('heist_marker_scale', String(v)); }} onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; const v = Math.max(30, Math.min(200, markerScale + dir * step)); setMarkerScale(v); localStorage.setItem('heist_marker_scale', String(v)); }} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={textPinPassThrough} onChange={(e) => setTextPinPassThrough(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
          {t('\ud83d\uddb1\ufe0f \u8868\u793a\u30e2\u30fc\u30c9\u3067\u30c6\u30ad\u30b9\u30c8\u30d4\u30f3\u306e\u30af\u30ea\u30c3\u30af\u3092\u900f\u904e')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showPhoneCompass} onChange={(e) => setShowPhoneCompass(e.target.checked)} style={{ accentColor: '#ff00ff', cursor: 'pointer' }} />
          {t('\ud83e\udded \u6700\u5bc2\u308a\u8d77\u52d5\u4e2d ReroRero\u96fb\u8a71\u30dc\u30c3\u30af\u30b9\u306e\u65b9\u5411\u30b3\u30f3\u30d1\u30b9 (\u5e38\u6642\u8d77\u52d5\u306f\u9664\u5916)')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showPhoneBoxHud} onChange={(e) => setShowPhoneBoxHud(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
          {t('\ud83d\udcde \u96fb\u8a71\u30dc\u30c3\u30af\u30b9HUD\u306e\u8868\u793a')}
        </label>
        {showPhoneBoxHud && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}><span>{t('HUD\u30b5\u30a4\u30ba:')}</span><span style={{ color: '#ff00ff', fontWeight: 'bold' }}>{phoneBoxHudSize}%</span></div>
            <input type="range" min="60" max="140" step="5" value={phoneBoxHudSize} onChange={(e) => setPhoneBoxHudSize(parseInt(e.target.value))} onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; setPhoneBoxHudSize(Math.max(60, Math.min(140, phoneBoxHudSize + dir * step))); }} style={{ accentColor: '#ff00ff', cursor: 'pointer', width: '100%' }} />
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showBottomRightHud} onChange={(e) => setShowBottomRightHud(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
          {t('\ud83d\udd0d \u53f3\u4e0bHUD (\u30ba\u30fc\u30e0\u30b3\u30f3\u30c8\u30ed\u30fc\u30eb) \u306e\u8868\u793a')}
        </label>
        {showBottomRightHud && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}><span>{t('HUD\u30b5\u30a4\u30ba:')}</span><span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{zoomHudSize}%</span></div>
            <input type="range" min="60" max="140" step="5" value={zoomHudSize} onChange={(e) => setZoomHudSize(parseInt(e.target.value))} onWheel={(e) => { e.preventDefault(); e.stopPropagation(); const step = parseInt(e.currentTarget.step) || 5; const dir = e.deltaY > 0 ? -1 : 1; setZoomHudSize(Math.max(60, Math.min(140, zoomHudSize + dir * step))); }} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }} />
          </div>
        )}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '4px' }}>
          <button className="btn-cyber" style={{ width: '100%', padding: '5px 8px', fontSize: '11px', clipPath: 'none' }} onClick={openSubWindow}>{t('\ud83d\uddd4 \u5225\u30a6\u30a3\u30f3\u30c9\u30a6\u3067\u958b\u304f (\u30d5\u30eb\u30de\u30c3\u30d7)')}</button>
        </div>
      </div>
    )}
  </>);
};

export default DisplaySettings;
