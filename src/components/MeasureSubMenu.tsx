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
      <div className="panel-title">{t('measure_settings')}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '6px' }}>
        {t('measure_hint')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
        <span>{t('selected_lines')}</span>
        <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{selectedCount}{t('lines_unit')}</span>
      </div>
      <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} onClick={onSelectAll}>{t('select_all')}</button>
        <button className="btn-cyber" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selectedCount === 0} onClick={onClear}>{t('clear_selection')}</button>
        <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '4px 2px' }} disabled={selectedCount === 0} onClick={onDeleteSelected}>{t('delete_selected')}</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={blockMarkerClicksDuringTools}
          onChange={(e) => setBlockMarkerClicksDuringTools(e.target.checked)}
          style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
        />
        {t('block_marker_clicks')}
      </label>
    </div>
  );
};
