import React, { useState, useEffect, useRef } from 'react';
import { PRESET_VISIBILITY_META } from '../utils/DataManager';
import type { PresetVisibility } from '../utils/DataManager';

interface QuickPresetButtonProps {
  isLocal: boolean;
  onAdd: (visibility: PresetVisibility) => void;
}

export const QuickPresetButton: React.FC<QuickPresetButtonProps> = ({ isLocal, onAdd }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
        <button
          className="btn-cyber"
          style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }}
          onClick={() => onAdd('public')}
          title="公開プリセットとして登録"
        >
          プリセット登録
        </button>
        <button
          className="btn-cyber"
          style={{ fontSize: '9px', padding: '2px 4px', clipPath: 'none', borderColor: '#ffd700', color: '#ffd700' }}
          onClick={() => setOpen(o => !o)}
          title="公開レベルを選んで登録"
        >
          ▼
        </button>
      </div>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '2px',
            background: 'var(--panel-bg, #0a0e18)',
            border: '1px solid rgba(79,195,247,0.3)',
            borderRadius: '6px', padding: '4px',
            display: 'flex', flexDirection: 'column', gap: '2px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            minWidth: '140px'
          }}
        >
          {(['public', 'unlisted', 'private'] as PresetVisibility[]).map(v => {
            const meta = PRESET_VISIBILITY_META[v];
            const disabled = v === 'private' && !isLocal;
            return (
              <button
                key={v}
                disabled={disabled}
                title={disabled ? 'ローカルモードでのみ登録可' : meta.description}
                onClick={() => { onAdd(v); setOpen(false); }}
                style={{
                  fontSize: '10px', padding: '4px 8px', clipPath: 'none',
                  background: 'transparent',
                  color: disabled ? '#555' : meta.color,
                  border: `1px solid ${disabled ? '#555' : meta.color}55`,
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: disabled ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span>{meta.emoji}</span>
                <span style={{ fontWeight: 700 }}>{meta.label}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {v === 'public' ? '🌐 URL' : v === 'unlisted' ? '🔗 URL' : '🔒 ローカル'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
