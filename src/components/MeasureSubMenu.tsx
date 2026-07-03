import React from 'react';
import { t } from '../i18n';

interface MeasureSubMenuProps {
  blockMarkerClicksDuringTools: boolean;
  setBlockMarkerClicksDuringTools: (v: boolean) => void;
  selectedCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
}

export const MeasureSubMenu: React.FC<MeasureSubMenuProps> = ({
  blockMarkerClicksDuringTools, setBlockMarkerClicksDuringTools,
  selectedCount, onClear, onSelectAll, onDeleteSelected
}) => {
  return (
    <div className="panel-section">
      <div className="panel-title">{t('距離計測モード設定')}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
        <span>{t('選択した線')}</span>
        <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{selectedCount}{t('本 選択中')}</span>
      </div>
      <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} onClick={onSelectAll}>{t('全て選択')}</button>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selectedCount === 0} onClick={onClear}>{t('選択解除')}</button>
        <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selectedCount === 0} onClick={onDeleteSelected}>{t('選択削除')}</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={blockMarkerClicksDuringTools}
          onChange={(e) => setBlockMarkerClicksDuringTools(e.target.checked)}
          style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
        />
        {t('マーカーを遮断')}
      </label>
    </div>
  );
};
