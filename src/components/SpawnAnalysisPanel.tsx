import React, { useState } from 'react';
import {
  type SpawnRecord,
  type SpawnItemType,
  SPAWN_ITEM_META,
  SPAWN_ITEM_ORDER,
  TEXTCOLOR_DETAIL_META,
} from '../utils/DataManager';

interface SpawnAnalysisPanelProps {
  spawnRecords: SpawnRecord[];
  visibleSpawnTypes: Set<SpawnItemType>;
  onVisibleSpawnTypesChange: (types: Set<SpawnItemType>) => void;
  isLocal: boolean;
  onSpawnDelete: (id: string) => void;
}

export const SpawnAnalysisPanel: React.FC<SpawnAnalysisPanelProps> = ({
  spawnRecords,
  visibleSpawnTypes,
  onVisibleSpawnTypesChange,
  isLocal,
  onSpawnDelete,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  const counts = SPAWN_ITEM_ORDER.map(item => ({
    item,
    meta: SPAWN_ITEM_META[item],
    count: spawnRecords.filter(s => s.item === item).length,
    visible: visibleSpawnTypes.has(item),
  }));
  const total = spawnRecords.length;

  const toggleFilter = (item: SpawnItemType) => {
    const next = new Set(visibleSpawnTypes);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    onVisibleSpawnTypesChange(next);
  };

  const recentSpawns = [...spawnRecords].reverse().slice(0, 100);

  return (
    <>
      <div className="panel-section">
        <div className="panel-title" style={{ fontSize: '11px', marginBottom: '6px' }}>
          スポーン解析
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '6px' }}>
          総計: <span style={{ color: 'var(--cyan-neon)' }}>{total}</span> 件
        </div>
      </div>

      <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', paddingTop: '6px' }}>
        <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
          フィルター
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {counts.map(({ item, meta, count, visible }) => (
            <label
              key={item}
              style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                fontSize: '9px', color: visible ? meta.color : 'var(--text-muted)',
                cursor: 'pointer', opacity: count === 0 ? 0.4 : 1,
                padding: '2px 4px', borderRadius: '3px',
                background: visible ? `${meta.color}15` : 'transparent',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={() => toggleFilter(item)}
                style={{ accentColor: meta.color, width: '10px', height: '10px', cursor: 'pointer' }}
              />
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span style={{ opacity: 0.6 }}>({count})</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }} onClick={() => onVisibleSpawnTypesChange(new Set(SPAWN_ITEM_ORDER))}>すべて表示</button>
          <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }} onClick={() => onVisibleSpawnTypesChange(new Set())}>すべて非表示</button>
        </div>
      </div>

      <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', paddingTop: '6px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          onClick={() => setShowRecent(s => !s)}
        >
          <div className="panel-title" style={{ fontSize: '10px', flex: 1, marginBottom: 0 }}>
            最近の記録
          </div>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{showRecent ? '▲' : '▼'}</span>
        </div>
        {showRecent && (
          <div style={{ maxHeight: '250px', overflowY: 'auto', marginTop: '4px' }}>
            {recentSpawns.length === 0 ? (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>記録がありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {recentSpawns.map(s => {
                  const meta = SPAWN_ITEM_META[s.item];
                  const dt = new Date(s.discoveredAt);
                  const timeStr = isNaN(dt.getTime()) ? s.discoveredAt : dt.toLocaleString();
                  const detailLabel = s.item === 'textcolor' && s.detail && TEXTCOLOR_DETAIL_META[s.detail as keyof typeof TEXTCOLOR_DETAIL_META]
                    ? TEXTCOLOR_DETAIL_META[s.detail as keyof typeof TEXTCOLOR_DETAIL_META].label : '';
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '9px', padding: '2px 4px',
                        borderLeft: `2px solid ${meta.color}`,
                        background: 'rgba(0,0,0,0.15)', borderRadius: '2px',
                      }}
                    >
                      <span style={{ color: meta.color }}>{meta.emoji}</span>
                      <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.label}{detailLabel && `(${detailLabel})`} X:{s.x} Y:{s.y}
                      </span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '8px' }}>{timeStr}</span>
                      {isLocal && (
                        deleteConfirmId === s.id ? (
                          <>
                            <button className="btn-cyber danger" style={{ fontSize: '7px', padding: '1px 3px', clipPath: 'none' }} onClick={() => { onSpawnDelete(s.id); setDeleteConfirmId(null); }}>削除</button>
                            <button className="btn-cyber" style={{ fontSize: '7px', padding: '1px 3px', clipPath: 'none' }} onClick={() => setDeleteConfirmId(null)}>×</button>
                          </>
                        ) : (
                          <button className="btn-cyber danger" style={{ fontSize: '7px', padding: '1px 3px', clipPath: 'none' }} onClick={() => setDeleteConfirmId(s.id)}>✕</button>
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
