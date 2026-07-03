// @ts-nocheck
import React from 'react';
import { t } from '../i18n';

interface DrawSettingsProps {
  bypassWallsEnabled: boolean; setBypassWallsEnabled: (v: boolean) => void;
  bypassShortestOnly: boolean; setBypassShortestOnly: (v: boolean) => void;
  blockMarkerClicksDuringTools: boolean; setBlockMarkerClicksDuringTools: (v: boolean) => void;
  strokeColor: string; setStrokeColor: (v: string) => void;
  strokeType: string; setStrokeType: (v: string) => void;
  strokeWidth: number; setStrokeWidth: (v: number) => void;
  drawMode: string; setDrawMode: (v: string) => void;
}

const DrawSettings: React.FC<DrawSettingsProps> = (p) => (<>
  <div className="panel-section">
    <div className="panel-title">{t('\u7dda\u306e\u8a2d\u5b9a')}</div>
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginBottom: '4px' }}>
      <input type="checkbox" checked={p.bypassWallsEnabled} onChange={(e) => p.setBypassWallsEnabled(e.target.checked)} style={{ accentColor: '#39ff14', cursor: 'pointer' }} />
      {t('\u58c1\u30d0\u30a4\u30d1\u30b9\u3092\u6709\u52b9\u306b\u3059\u308b')}
    </label>
    {p.bypassWallsEnabled && (
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', paddingLeft: '20px', marginBottom: '4px' }}>
        <input type="checkbox" checked={p.bypassShortestOnly} onChange={(e) => p.setBypassShortestOnly(e.target.checked)} style={{ accentColor: '#39ff14', cursor: 'pointer' }} />
        {t('\u6700\u77ed\u30d0\u30a4\u30d1\u30b9\u306e\u307f')}
      </label>
    )}
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '6px', userSelect: 'none' }}>
      <input type="checkbox" checked={p.blockMarkerClicksDuringTools} onChange={(e) => p.setBlockMarkerClicksDuringTools(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
      {t('\u30de\u30fc\u30ab\u30fc\u3092\u906e\u65ad')}
    </label>
    <div className="color-picker">
      {['#ff0055','#ffe600','#39ff14','#00f0ff','#ff00ff','#ffffff'].map(c => (
        <div key={c} className={`color-dot ${p.strokeColor===c?'active':''}`} style={{backgroundColor:c,color:c}} onClick={() => p.setStrokeColor(c)} title={c} />
      ))}
    </div>
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      {(['solid','dashed','temporary']).map(st => (
        <button key={st} className={`btn-cyber ${p.strokeType===st?'active':''}`} style={{flex:1,padding:'4px 2px',fontSize:'10px'}} onClick={() => p.setStrokeType(st)}>
          {st==='solid' ? t('\u5b9f\u7dda\uff08\u30eb\u30fc\u30c8\uff09') : st==='dashed' ? t('\u7834\u7dda\u30eb\u30fc\u30c8') : t('\u4e00\u6642\u7dda')}
        </button>
      ))}
    </div>
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      {(['free','smooth','straight']).map(m => (
        <button key={m} className={`btn-cyber ${p.drawMode===m?'active':''}`} style={{flex:1,padding:'4px 2px',fontSize:'10px'}} onClick={() => p.setDrawMode(m)}>
          {m==='free' ? t('\u30d5\u30ea\u30fc') : m==='smooth' ? t('\u30b9\u30e0\u30fc\u30b9') : t('\u76f4\u7dda')}
        </button>
      ))}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('\u7dda\u306e\u592a\u3055: ')}{p.strokeWidth}px</span>
      <input type="range" min="2" max="12" value={p.strokeWidth} onChange={(e) => p.setStrokeWidth(parseInt(e.target.value))} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
    </div>
  </div>
</>);

export default DrawSettings;
