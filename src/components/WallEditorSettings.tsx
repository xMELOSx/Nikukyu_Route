// @ts-nocheck
import React from 'react';
import { t } from '../i18n';

interface WallEditorSettingsProps {
  hideStrokesDuringWalls: boolean; setHideStrokesDuringWalls: (v: boolean) => void;
  hideMarkersDuringWalls: boolean; setHideMarkersDuringWalls: (v: boolean) => void;
  bypassWallsEnabled: boolean; setBypassWallsEnabled: (v: boolean) => void;
  bypassShortestOnly: boolean; setBypassShortestOnly: (v: boolean) => void;
  notification: any;
  globalWalls: any;
  currentFloor: string;
  updateGlobalWalls: (w: any) => void;
  toolMode: string;
}

const WallEditorSettings: React.FC<WallEditorSettingsProps> = (p) => {
  const runAutoDetect = async () => {
    p.notification.show(t('\u58c1\u306e\u81ea\u52d5\u691c\u51fa\u3092\u5b9f\u884c\u4e2d...'));
    try {
      const { detectWallsFromImage } = await import('../utils/WallDetector');
      const path = `${import.meta.env.BASE_URL}nikukyu_map.webp`;
      const detected = await detectWallsFromImage(path);
      if (detected.length > 0) {
        const next = { ...p.globalWalls };
        for (const w of detected) next[w.floor || p.currentFloor] = [...(next[w.floor || p.currentFloor] || []), ...w.segments];
        p.updateGlobalWalls(next);
        p.notification.show(t('\u81ea\u52d5\u691c\u51fa\u5b8c\u4e86: {0}\u672c\u306e\u58c1\u30bb\u30b0\u30e1\u30f3\u30c8\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f', String(detected.reduce((s, w) => s + w.segments.length, 0))));
      } else {
        p.notification.show(t('\u58c1\u304c\u691c\u51fa\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f'));
      }
    } catch (err) {
      p.notification.show(t('\u58c1\u306e\u81ea\u52d5\u691c\u51fa\u306b\u5931\u6557\u3057\u307e\u3057\u305f'));
    }
  };

  return (<>
    <div className="panel-section">
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginBottom: '6px' }}>
        <input type="checkbox" checked={p.hideStrokesDuringWalls} onChange={(e) => p.setHideStrokesDuringWalls(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
        {t('\u58c1\u7de8\u96c6\u4e2d\u306b\u7dda\u3092\u96a0\u3059')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginBottom: '6px' }}>
        <input type="checkbox" checked={p.hideMarkersDuringWalls} onChange={(e) => p.setHideMarkersDuringWalls(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
        {t('\u58c1\u7de8\u96c6\u4e2d\u306b\u30de\u30fc\u30ab\u30fc\u3092\u96a0\u3059')}
      </label>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
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
      {p.toolMode === 'wall' && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 6px' }} />
      )}
      <button className="btn-cyber" style={{ width: '100%', fontSize: '10px', padding: '6px', marginTop: '6px', clipPath: 'none' }} onClick={runAutoDetect}>
        ?? {t('\u58c1\u306e\u81ea\u52d5\u691c\u51fa\u3092\u5b9f\u884c')}
      </button>
    </div>
  </>);
};

export default WallEditorSettings;
