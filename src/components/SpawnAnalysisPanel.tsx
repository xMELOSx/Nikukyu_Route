import React, { useState, useMemo } from 'react';
import { type SpawnPoint, type RegisteredItem, TEXTCOLOR_META } from '../utils/DataManager';

interface SpawnAnalysisPanelProps {
  points: SpawnPoint[];
  items: RegisteredItem[];
  isLocal: boolean;
  onPointDelete: (id: string) => void;
}

export const SpawnAnalysisPanel: React.FC<SpawnAnalysisPanelProps> = ({
  points, items, isLocal, onPointDelete,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  const itemStats = useMemo(() => {
    const stats: { [itemId: string]: { item: RegisteredItem; count: number; pts: { x: number; y: number }[] } } = {};
    for (const item of items) stats[item.id] = { item, count: 0, pts: [] };
    for (const p of points) {
      if (!p.items) continue;
      for (const pi of p.items) {
        if (stats[pi.itemId]) { stats[pi.itemId].count++; stats[pi.itemId].pts.push({ x: p.x, y: p.y }); }
      }
    }
    return Object.values(stats).sort((a, b) => b.count - a.count);
  }, [points, items]);

  const recentPoints = [...points].reverse().slice(0, 100);

  return (
    <>
      <div className="panel-section">
        <div className="panel-title" style={{ fontSize: '13px', marginBottom: '8px' }}>スポーン解析</div>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>
          スポーン点: <span style={{ color: 'var(--cyan-neon)', fontSize: '16px' }}>{points.length}</span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
          アイテム登録: <span style={{ color: 'var(--cyan-neon)', fontSize: '16px' }}>{items.length}</span>
        </div>
      </div>

      {itemStats.length > 0 && (
        <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', paddingTop: '8px' }}>
          <div className="panel-title" style={{ fontSize: '12px', marginBottom: '6px' }}>アイテム別出現数</div>
          {itemStats.map(({ item, count }) => {
            const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
                fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: tc?.color || '#fff', flex: 1, fontWeight: 600, fontSize: '13px' }}>
                  {item.name || '(無名)'}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px' }}>{count}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>点</span>
                {item.fans > 0 && <span style={{ color: '#ffd700', fontWeight: 600, fontSize: '12px' }}>{item.fans.toLocaleString()}F</span>}
                {item.coins > 0 && <span style={{ color: '#ff9500', fontWeight: 600, fontSize: '12px' }}>{item.coins.toLocaleString()}C</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', paddingTop: '8px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          onClick={() => setShowRecent(s => !s)}
        >
          <div className="panel-title" style={{ fontSize: '12px', flex: 1, marginBottom: 0 }}>
            スポーン点一覧
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{showRecent ? '▲' : '▼'} ({points.length})</span>
        </div>
        {showRecent && (
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '6px' }}>
            {recentPoints.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>記録がありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentPoints.map(p => {
                  const dt = new Date(p.createdAt);
                  const timeStr = isNaN(dt.getTime()) ? p.createdAt : dt.toLocaleString();
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '11px', padding: '5px 6px',
                      borderLeft: '3px solid #39ff14',
                      background: 'rgba(0,0,0,0.15)', borderRadius: '4px',
                    }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                        X:{p.x} Y:{p.y}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {(p.items || []).length}アイテム
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{timeStr}</span>
                      {isLocal && (
                        deleteConfirmId === p.id ? (
                          <>
                            <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }}
                              onClick={() => { onPointDelete(p.id); setDeleteConfirmId(null); }}>削除</button>
                            <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }}
                              onClick={() => setDeleteConfirmId(null)}>×</button>
                          </>
                        ) : (
                          <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }}
                            onClick={() => setDeleteConfirmId(p.id)}>✕</button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
