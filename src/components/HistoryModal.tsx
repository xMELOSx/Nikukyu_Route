import React from 'react';
import { type HeistMarker, MARKER_META } from '../utils/DataManager';

interface HistoryModalProps {
  show: boolean;
  onClose: () => void;
  markers: HeistMarker[];
  globalMarkerIds: string[];
  onFocusTrigger: (trigger: { id: string; timestamp: number }) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ show, onClose, markers, globalMarkerIds, onFocusTrigger }) => {
  if (!show) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-neon)' }}>マーカー編集履歴（全件）</div>
          <button className="btn-cyber" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={onClose}>✕ 閉じる</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <div className="placed-notes-list" style={{ maxHeight: 'none' }}>
            {markers.length === 0 ? (
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>履歴はありません</div>
            ) : (
              [...markers].reverse().map(m => {
                const meta = MARKER_META[m.type];
                const isGlobal = globalMarkerIds.includes(m.id);
                return (
                  <div
                    key={`hist-${m.id}`}
                    className="placed-note-item"
                    style={{ borderLeft: `3px solid ${meta.color}`, cursor: m.scrollConfig ? 'pointer' : 'default' }}
                    onClick={() => { m.scrollConfig && onFocusTrigger({ id: m.id, timestamp: Date.now() }); onClose(); }}
                  >
                    <div className="placed-note-item-header">
                      <span className="placed-note-type" style={{ color: meta.color }}>
                        {meta.emoji} {isGlobal ? 'G:' : ''}{meta.label}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        X:{m.x} Y:{m.y}
                      </span>
                    </div>
                    <div className="placed-note-text">
                      {m.note.trim() ? m.note : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>詳細なし</span>}
                    </div>
                    {m.scrollConfig && (
                      <div style={{ fontSize: '9px', color: 'var(--cyan-neon)', marginTop: '2px', textAlign: 'right' }}>
                        Click to Pan ➔
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
