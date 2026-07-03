// @ts-nocheck
import React from 'react';
import { t } from '../i18n';
import { MARKER_META } from '../utils/DataManager';
import type { MarkerType } from '../utils/DataManager';

interface MarkerVisibilityPanelProps {
  markerVisibilityExpanded: boolean;
  setMarkerVisibilityExpanded: (v: boolean) => void;
  routeApi: any;
  handleHideGlobalMarkerType: (type: MarkerType) => void;
  handleShowGlobalMarkerType: (type: MarkerType) => void;
}

const MarkerVisibilityPanel: React.FC<MarkerVisibilityPanelProps> = (props) => {
  const { markerVisibilityExpanded, setMarkerVisibilityExpanded, routeApi, handleHideGlobalMarkerType, handleShowGlobalMarkerType } = props;
  return (<>
    <button type="button" onClick={() => setMarkerVisibilityExpanded(!markerVisibilityExpanded)}
      style={{ width: '100%', padding: '4px 8px', fontSize: '11px', background: 'rgba(255, 0, 255, 0.05)', border: '1px solid rgba(255, 0, 255, 0.15)', borderRadius: '4px', color: 'var(--text-accent, #ff00ff)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '8px', marginBottom: markerVisibilityExpanded ? '8px' : '0' }}>
      <span>{t('\ud83d\udc41\ufe0f MARKER VISIBILITY')}</span>
      <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 'normal' }}>{markerVisibilityExpanded ? t('\u25bc \u6298\u308a\u305f\u305f\u3080') : t('\u25b6 \u5c55\u958b')}</span>
    </button>
    {markerVisibilityExpanded && (
      <div style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '12px', color: '#7ec8e3', fontWeight: 'bold' }}>GLOBAL:</div>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
              onClick={() => { const c = routeApi.route.hiddenMarkerTypes || []; const t = ['eh','rare','cardkey','vault','boss','gbattle','gpicking','glong_picking','phone','warp','stairs','info','note','text']; const n = c.filter(x => !t.includes(x)); if (n.length===c.length) return; routeApi.setRoute(p => ({...p, hiddenMarkerTypes: n})); }}>ALL ON</button>
            <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
              onClick={() => { const c = routeApi.route.hiddenMarkerTypes || []; const t = ['eh','rare','cardkey','vault','boss','gbattle','gpicking','glong_picking','phone','warp','stairs','info','note','text']; const a = t.filter(x => !c.includes(x)); if (a.length===0) return; const n = [...new Set([...c,...a])]; routeApi.setRoute(p => ({...p, hiddenMarkerTypes: n})); }}>ALL OFF</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
          {(['eh','rare','cardkey','vault','boss','gbattle','gpicking','glong_picking','phone','warp','stairs','info','note','text'] as MarkerType[]).map(t2 => {
            const meta = MARKER_META[t2];
            const isHidden = (routeApi.route.hiddenMarkerTypes || []).includes(t2);
            return (<button key={t2} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none', opacity: isHidden ? 0.4 : 1, borderColor: isHidden ? '#555' : meta.color, color: isHidden ? '#555' : meta.color }}
              onClick={() => isHidden ? handleShowGlobalMarkerType(t2) : handleHideGlobalMarkerType(t2)}>{meta.emoji} {meta.label.split(' ')[0]}</button>);
          })}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0 8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '12px', color: '#ff6b9d', fontWeight: 'bold' }}>INDIVIDUAL:</div>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#0f0', color: '#0f0' }}
              onClick={() => { const c = routeApi.route.hiddenMarkerTypes || []; const t = ['start','battle','picking','long_picking','iwarp','iinfo','inote','itext','p1','p2','p3','checkpoint']; const n = c.filter(x => !t.includes(x)); if (n.length===c.length) return; routeApi.setRoute(p => ({...p, hiddenMarkerTypes: n})); }}>ALL ON</button>
            <button className="btn-cyber" style={{ padding: '1px 5px', fontSize: '9px', clipPath: 'none', borderColor: '#f55', color: '#f55' }}
              onClick={() => { const c = routeApi.route.hiddenMarkerTypes || []; const t = ['start','battle','picking','long_picking','iwarp','iinfo','inote','itext','p1','p2','p3','checkpoint']; const a = t.filter(x => !c.includes(x)); if (a.length===0) return; const n = [...new Set([...c,...a])]; routeApi.setRoute(p => ({...p, hiddenMarkerTypes: n})); }}>ALL OFF</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {(['start','checkpoint','battle','picking','long_picking','iwarp','iinfo','inote','itext','p1','p2','p3'] as MarkerType[]).map(t2 => {
            const meta = MARKER_META[t2];
            const isHidden = (routeApi.route.hiddenMarkerTypes || []).includes(t2);
            return (<button key={t2} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none', opacity: isHidden ? 0.4 : 1, borderColor: isHidden ? '#555' : meta.color, color: isHidden ? '#555' : meta.color }}
              onClick={() => isHidden ? handleShowGlobalMarkerType(t2) : handleHideGlobalMarkerType(t2)}>{meta.emoji} {meta.label.split(' ')[0]}</button>);
          })}
        </div>
      </div>
    )}
  </>);
};

export default MarkerVisibilityPanel;
