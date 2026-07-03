import React from 'react';
import { t } from '../i18n';
import type { PresetData } from '../utils/DataManager';
import { getPresetVisibility, PRESET_VISIBILITY_META } from '../utils/DataManager';

export interface UrlLoadTarget {
  id: string;
  name: string;
  type: 'preset' | 'save';
}

interface UrlLoadConfirmModalProps {
  target: UrlLoadTarget | null;
  presets: PresetData[];
  onConfirm: (target: UrlLoadTarget) => void;
  onClose: () => void;
}

export const UrlLoadConfirmModal: React.FC<UrlLoadConfirmModalProps> = ({ target, presets, onConfirm, onClose }) => {
  if (!target) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '420px', padding: '20px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)', marginBottom: '12px' }}>
          {target.type === 'preset' ? t('プリセット') : t('セーブデータ')}{t('を読み込みますか？')}
        </div>
        <div style={{ fontSize: '13px', color: '#b0b0b0', marginBottom: '16px' }}>
          「<span style={{ color: target.type === 'preset' ? '#ffd700' : 'var(--cyan-neon)', fontWeight: 700 }}>{target.name}</span>」{t('を読み込みます。')}<br />
          {t('現在の編集内容は破棄されます。')}
          {target.type === 'preset' && (() => {
            const p = presets.find(x => x.id === target.id);
            if (!p) return null;
            const v = getPresetVisibility(p);
            if (v === 'public') return null;
            const vMeta = PRESET_VISIBILITY_META[v];
            return (
              <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: `${vMeta.color}22`, border: `1px solid ${vMeta.color}66`, borderRadius: '4px' }}>
                <span>{vMeta.emoji}</span>
                <span style={{ color: vMeta.color, fontWeight: 700, fontSize: '11px' }}>{vMeta.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}> — {vMeta.description}</span>
              </div>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="btn-cyber success" style={{ padding: '6px 20px', fontSize: '12px' }} onClick={() => onConfirm(target)}>{t('読み込む')}</button>
          <button className="btn-cyber" style={{ padding: '6px 20px', fontSize: '12px' }} onClick={onClose}>{t('キャンセル')}</button>
        </div>
      </div>
    </div>
  );
};
