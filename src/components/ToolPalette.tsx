// @ts-nocheck
import React from 'react';
import { t } from '../i18n';
import { Undo, Redo, Move, Ruler, Paintbrush, Eraser, EyeOff, Star, Wand2, Fence, RotateCcw } from 'lucide-react';
import type { MarkerType } from '../utils/DataManager';

interface ToolPaletteProps {
  isEditMode: boolean;
  toolMode: string; setToolMode: (v: string) => void;
  historyApi: any;
  showSpawnFeature: boolean;
  showSpawnEditFeature: boolean;
  isLocal: boolean;
  resetTarget: string | null; setResetTarget: (v: any) => void;
  routeApi: any;
  globalMarkersStore: any;
}
// ... component body
const ToolPalette: React.FC<ToolPaletteProps> = (p) => (<>
  <div className="panel-section">
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
      <div className="panel-title" style={{ flex: 1, marginBottom: 0 }}>{t('\u30e2\u30fc\u30c9\u9078\u629e')}</div>
      <button className="btn-cyber" onClick={p.historyApi.undo} disabled={!p.historyApi.canUndo} title="Undo (Ctrl+Z)" style={{ padding: '2px 6px', fontSize: '10px', opacity: p.historyApi.canUndo ? 1 : 0.4, cursor: p.historyApi.canUndo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Undo size={12} /></button>
      <button className="btn-cyber" onClick={p.historyApi.redo} disabled={!p.historyApi.canRedo} title="Redo (Ctrl+Y)" style={{ padding: '2px 6px', fontSize: '10px', opacity: p.historyApi.canRedo ? 1 : 0.4, cursor: p.historyApi.canRedo ? 'pointer' : 'not-allowed', clipPath: 'none' }}><Redo size={12} /></button>
    </div>
    <div className="tool-grid">
      <button className={`tool-btn ${p.toolMode === 'move' ? 'active' : ''}`} onClick={() => p.setToolMode('move')}><Move size={18} /><span>{t('\u79fb\u52d5')}</span></button>
      <button className={`tool-btn ${p.toolMode === 'measure' ? 'active' : ''}`} onClick={() => p.setToolMode('measure')}><Ruler size={18} /><span>{t('\u8ddd\u96e2\u8a08\u6e2c')}</span></button>
      <button className={`tool-btn ${p.toolMode === 'draw' ? 'active' : ''}`} onClick={() => p.setToolMode('draw')}><Paintbrush size={18} /><span>{t('\u30eb\u30fc\u30c8\u7dda')}</span></button>
      <button className={`tool-btn ${p.toolMode === 'edit-stroke' ? 'active' : ''}`} onClick={() => p.setToolMode('edit-stroke')}><Wand2 size={18} /><span>{t('\u7dda\u5206\u7de8\u96c6')}</span></button>
      <button className={`tool-btn ${p.toolMode === 'erase' ? 'active' : ''}`} onClick={() => p.setToolMode('erase')}><Eraser size={18} /><span>{t('\u6d88\u3057\u30b4\u30e0')}</span></button>
      <button className={`tool-btn ${p.toolMode === 'toggle-vis' ? 'active' : ''}`} onClick={() => p.setToolMode('toggle-vis')}><EyeOff size={18} /><span>{t('\u8868\u793a\u5207\u66ff')}</span></button>
      {p.showSpawnEditFeature && (
        <button className={`tool-btn ${p.toolMode === 'add-spawn' ? 'active' : ''}`} onClick={() => p.setToolMode(p.toolMode === 'add-spawn' ? 'move' : 'add-spawn')} style={{ borderColor: 'rgba(57, 255, 20, 0.4)' }}>
          <Star size={18} style={{ color: '#39ff14' }} /><span style={{ color: '#39ff14' }}>{t('\u30b9\u30dd\u30fc\u30f3')}</span>
        </button>
      )}
      {p.isLocal && (<>
        <button className={`tool-btn ${p.toolMode === 'draw-wall' ? 'active' : ''}`} onClick={() => p.setToolMode('draw-wall')} style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}>
          <Fence size={18} style={{ color: '#ff0055' }} /><span>{t('\u58c1\uff08\u76f4\u7dda\uff09')}</span>
        </button>
        <button className={`tool-btn ${p.toolMode === 'erase-wall' ? 'active' : ''}`} onClick={() => p.setToolMode('erase-wall')} style={{ borderColor: 'rgba(255, 0, 85, 0.4)' }}>
          <Eraser size={18} style={{ color: '#ff0055' }} /><span>{t('\u58c1\uff08\u6d88\u3057\u30b4\u30e0\uff09')}</span>
        </button>
      </>)}
      {!p.resetTarget ? (
        <button className="tool-btn" onClick={() => p.setResetTarget('both')}><RotateCcw size={18} /><span>{t('\u30ea\u30bb\u30c3\u30c8')}</span></button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', background: 'rgba(255,100,100,0.1)', borderRadius: '6px', border: '1px solid rgba(255,100,100,0.3)' }}>
          <div style={{ fontSize: '10px', color: '#ff6b6b', textAlign: 'center', marginBottom: '2px' }}>{t('\u524a\u9664\u5bfe\u8c61\u3092\u9078\u629e:')}</div>
          <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => { p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, p.globalMarkersStore.globalMarkers); p.routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] } })); p.setResetTarget(null); }}>{t('\ud83d\udccd \u30e9\u30a4\u30f3\u306e\u307f')}</button>
          <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => { p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, p.globalMarkersStore.globalMarkers); p.routeApi.setRoute(prev => ({ ...prev, markers: [], hiddenMarkers: [] })); p.setResetTarget(null); }}>{t('\ud83d\udccd \u30d4\u30f3\u306e\u307f')}</button>
          <button className="btn-cyber danger" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => { p.historyApi.pushHistory(p.routeApi.route.strokes, p.routeApi.route.markers, p.globalMarkersStore.globalMarkers); p.routeApi.setRoute(prev => ({ ...prev, strokes: { main: [] }, markers: [], hiddenMarkers: [] })); p.setResetTarget(null); }}>{t('\ud83d\uddd1\ufe0f \u4e21\u65b9\u524a\u9664')}</button>
          <button className="btn-cyber" style={{ width: '100%', fontSize: '10px', padding: '4px' }} onClick={() => p.setResetTarget(null)}>{t('\u30ad\u30e3\u30f3\u30bb\u30eb')}</button>
        </div>
      )}
    </div>
  </div>
</>);

export default ToolPalette;
