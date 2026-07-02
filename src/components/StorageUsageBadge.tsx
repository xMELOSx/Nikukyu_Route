import React, { useState, useEffect } from 'react';
import { useStorageQuota } from '../hooks/useStorageQuota';
import { formatBytes } from '../utils/format';

const STORAGE_TARGET_LIMIT_BYTES = 50 * 1024 * 1024;

export const StorageUsageBadge: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { usage, quota, persisted, supported, requestPersist, refresh } = useStorageQuota(2000);
  const [fallbackUsed, setFallbackUsed] = useState<number>(0);
  useEffect(() => {
    if (supported && usage > 0) return;
    const compute = () => {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === null) continue;
        const v = localStorage.getItem(k) || '';
        total += (k.length + v.length) * 2;
      }
      setFallbackUsed(total);
    };
    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [supported, usage]);
  const used = (supported && usage > 0) ? usage : fallbackUsed;
  const targetPct = Math.min(100, (used / STORAGE_TARGET_LIMIT_BYTES) * 100);
  const color = targetPct >= 90 ? 'var(--red-neon, #ff0055)' : targetPct >= 70 ? 'var(--yellow-neon, #ffe600)' : 'var(--cyan-neon)';
  const titleLines: string[] = [];
  titleLines.push(`使用量: ${formatBytes(used)}`);
  if (supported) {
    titleLines.push(`ブラウザ割当: ${formatBytes(quota)}`);
    titleLines.push(`目標上限: 50 MB (= 警告色判定基準)`);
    titleLines.push(persisted ? '永続化: 承認済み (ブラウザに自動削除されません)' : '永続化: 未承認 (ストレージ逼迫時に消える可能性)');
  } else {
    titleLines.push(`目標上限: 50 MB`);
    titleLines.push(`navigator.storage 非対応ブラウザ (localStorage のみ)`);
  }
  titleLines.push('クリックで設定タブを開く');
  return (
    <div
      title={titleLines.join('\n')}
      onClick={onOpenSettings}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}55`, borderRadius: '4px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}
    >
      <span>容量</span>
      <span style={{ color, fontWeight: 700, fontFamily: 'monospace' }}>{formatBytes(used)}</span>
      <span>/ 50 MB</span>
      <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${targetPct}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
      </div>
      {supported && !persisted && (
        <span
          onClick={async (e) => { e.stopPropagation(); await requestPersist(); }}
          title="クリックで永続化を要求 (= ブラウザが自動削除しなくなる)"
          style={{ color: 'var(--yellow-neon, #ffe600)', cursor: 'pointer', fontSize: '10px' }}
        >⚠</span>
      )}
      <span
        onClick={(e) => { e.stopPropagation(); refresh(); }}
        title="再計測"
        style={{ cursor: 'pointer', opacity: 0.6 }}
      >↻</span>
    </div>
  );
};
