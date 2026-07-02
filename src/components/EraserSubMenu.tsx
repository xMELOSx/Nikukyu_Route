import React from 'react';
import { t } from '../i18n';

interface EraserSubMenuProps {
  eraseTarget: 'all' | 'marker' | 'route' | 'branch';
  setEraseTarget: (v: 'all' | 'marker' | 'route' | 'branch') => void;
  eraseSize: number;
  setEraseSize: (n: number) => void;
  eraseDefaultBehavior: 'normal' | 'split';
  setEraseDefaultBehavior: (v: 'normal' | 'split') => void;
  isAltPressed: boolean;
}

export const EraserSubMenu: React.FC<EraserSubMenuProps> = ({
  eraseTarget, setEraseTarget,
  eraseSize, setEraseSize,
  eraseDefaultBehavior, setEraseDefaultBehavior,
  isAltPressed
}) => {
  const effectiveEraseBehavior: 'normal' | 'split' = isAltPressed
    ? (eraseDefaultBehavior === 'normal' ? 'split' : 'normal')
    : eraseDefaultBehavior;
  return (
    <div className="panel-section">
      <div className="panel-title">{t('eraser_settings')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>{t('target:')}</div>
        <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {([
            { v: 'all' as const, label: t('all') },
            { v: 'marker' as const, label: t('marker') },
            { v: 'route' as const, label: t('route') },
            { v: 'branch' as const, label: t('branch') }
          ]).map(opt => (
            <button
              key={opt.v}
              className={`tool-btn ${eraseTarget === opt.v ? 'active' : ''}`}
              style={{ height: 28, fontSize: '10px', padding: '2px 2px' }}
              onClick={() => setEraseTarget(opt.v)}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
            <span>{t('marker_size')}</span>
            <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{eraseSize}px</span>
          </div>
          <input
            type="range"
            min="5"
            max="30"
            step="1"
            value={eraseSize}
            onChange={(e) => setEraseSize(parseInt(e.target.value))}
            style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
            <span>{t('min_5px')}</span>
            <span>{t('max_30px')}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('alt_shift_behavior')}</div>
          <span
            style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '3px',
              border: '1px solid', letterSpacing: '0.5px', transition: 'all 0.1s',
              color: isAltPressed ? '#000' : 'var(--text-muted)',
              background: isAltPressed ? 'var(--yellow-neon, #ffe600)' : 'transparent',
              borderColor: isAltPressed ? 'var(--yellow-neon, #ffe600)' : 'rgba(255,255,255,0.2)',
              boxShadow: isAltPressed ? '0 0 8px rgba(255,230,0,0.6)' : 'none'
            }}
          >
            Alt{isAltPressed ? ' ●' : ''}
          </span>
        </div>
        <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {([
            { v: 'normal' as const, label: t('normal') },
            { v: 'split' as const, label: t('split') }
          ]).map(opt => {
            const isActiveNow = effectiveEraseBehavior === opt.v;
            const isDefault = eraseDefaultBehavior === opt.v;
            return (
              <button
                key={opt.v}
                className={`tool-btn ${isActiveNow ? 'active' : ''}`}
                style={{
                  height: 28, fontSize: '11px', padding: '2px 2px', position: 'relative',
                  outline: isDefault && isAltPressed ? '1px dashed var(--yellow-neon, #ffe600)' : 'none',
                  outlineOffset: '2px'
                }}
                onClick={() => setEraseDefaultBehavior(opt.v)}
              >
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
