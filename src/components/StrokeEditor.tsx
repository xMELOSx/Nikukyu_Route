// @ts-nocheck
import React from 'react';
import { t } from '../i18n';
import type { DrawingStroke } from '../utils/DataManager';

interface StrokeEditorProps {
  editStrokeIdxs: Set<number>; setEditStrokeIdxs: (v: Set<number>) => void;
  editSmoothIterations: number; setEditSmoothIterations: (v: number) => void;
  blockMarkerClicksDuringTools: boolean; setBlockMarkerClicksDuringTools: (v: boolean) => void;
  strokeColor: string; setStrokeColor: (v: string) => void;
  strokeType: string; setStrokeType: (v: string) => void;
  strokeWidth: number; setStrokeWidth: (v: number) => void;
  routeApi: any;
  historyApi: any;
  notification: any;
  currentFloor: string;
  updateStrokes: (s: DrawingStroke[]) => void;
  smoothStrokePointsKeepEnds: any;
}

const StrokeEditor: React.FC<StrokeEditorProps> = (p) => {
  const cur = p.routeApi.route.strokes[p.currentFloor];
  const selSize = p.editStrokeIdxs.size;
  const setAll = () => { if (!cur) return; const s = new Set<number>(); for (let i = 0; i < cur.length; i++) s.add(i); p.setEditStrokeIdxs(s); };
  const delSel = () => { if (!cur || selSize === 0) return; p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, {}); const n = cur.filter((_, i) => !p.editStrokeIdxs.has(i)); p.updateStrokes(n); p.setEditStrokeIdxs(new Set()); p.notification.show(t('{0}\u672c\u306e\u7dda\u3092\u524a\u9664\u3057\u307e\u3057\u305f', String(selSize))); };
  return (<>
    <div className="panel-section">
      <div className="panel-title">{t('\u7dda\u5206\u7de8\u96c6')}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
        <span>{t('\u9078\u629e\u4e2d\u306e\u7dda:')}</span><span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{selSize}{t('\u672c')}</span>
      </div>
      <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} onClick={setAll}>{t('\u3059\u3079\u3066\u9078\u629e')}</button>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selSize===0} onClick={() => p.setEditStrokeIdxs(new Set())}>{t('\u9078\u629e\u3092\u89e3\u9664')}</button>
        <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selSize===0} onClick={delSel}>{t('\u9078\u629e\u3092\u524a\u9664')}</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '6px', userSelect: 'none' }}>
        <input type="checkbox" checked={p.blockMarkerClicksDuringTools} onChange={(e) => p.setBlockMarkerClicksDuringTools(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
        {t('\u30de\u30fc\u30ab\u30fc\u3092\u906e\u65ad')}
      </label>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0 6px' }} />
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{t('\u8272 (\u30af\u30ea\u30c3\u30af\u3067\u9078\u629e\u7dda\u306b\u9069\u7528):')}</div>
      <div className="color-picker">
        {['#ff0055','#ffe600','#39ff14','#00f0ff','#ff00ff','#ffffff'].map(c => (
          <div key={c} className={`color-dot ${p.strokeColor===c?'active':''}`} style={{backgroundColor:c,color:c}}
            onClick={() => { p.setStrokeColor(c); if (selSize===0 || !cur) return; p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, {}); p.updateStrokes(cur.map((s,i) => p.editStrokeIdxs.has(i) ? {...s, color: c} : s)); }}
            title={c} />
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{t('\u7dda\u7a2e:')}</div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {(['solid','dashed']).map(t2 => (
          <button key={t2} className={`btn-cyber ${p.strokeType===t2?'active':''}`} style={{flex:1,padding:'4px 2px',fontSize:'10px'}}
            onClick={() => { p.setStrokeType(t2); if (selSize===0 || !cur) return; p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, {}); p.updateStrokes(cur.map((s,i) => p.editStrokeIdxs.has(i) ? {...s, type: t2} : s)); }}>
            {t(t2==='solid'?'\u5b9f\u7dda':'\u7834\u7dda')}</button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
        <span>{t('\u7dda\u306e\u592a\u3055:')}</span><span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{p.strokeWidth}px</span>
      </div>
      <input type="range" min="1" max="10" step="1" value={p.strokeWidth} onChange={(e) => { const v=parseInt(e.target.value); p.setStrokeWidth(v); if (selSize===0 || !cur) return; p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, {}); p.updateStrokes(cur.map((s,i) => p.editStrokeIdxs.has(i) ? {...s, width: v} : s)); }} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }} />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
        <span>{t('\u6ed1\u3089\u304b\u3055:')}</span><span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{p.editSmoothIterations}</span>
      </div>
      <input type="range" min="0" max="5" step="1" value={p.editSmoothIterations} onChange={(e) => { const v=parseInt(e.target.value); p.setEditSmoothIterations(v); if (selSize===0 || !cur) return; p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, {}); p.updateStrokes(cur.map((s,i) => p.editStrokeIdxs.has(i) ? {...s, points: v>0 ? p.smoothStrokePointsKeepEnds(s.points, v, 0.5) : s.points, originalPoints: v>0 ? s.points : undefined} : s)); }} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }} />
    </div>
  </>);
};

export default StrokeEditor;
