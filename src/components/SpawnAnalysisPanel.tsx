import React, { useState } from 'react';
import {
  type SpawnRecord,
  type SpawnItemType,
  type TextColorDetail,
  SPAWN_ITEM_META,
  SPAWN_ITEM_ORDER,
  TEXTCOLOR_DETAILS,
  TEXTCOLOR_DETAIL_META,
  generateId,
} from '../utils/DataManager';

type SpawnToolMode = 'place' | 'edit' | 'erase' | 'manage';

interface SpawnAnalysisPanelProps {
  spawnRecords: SpawnRecord[];
  activeSpawnItem: SpawnItemType | null;
  onActiveSpawnItemChange: (item: SpawnItemType | null) => void;
  spawnDetail: string;
  onSpawnDetailChange: (detail: string) => void;
  visibleSpawnTypes: Set<SpawnItemType>;
  onVisibleSpawnTypesChange: (types: Set<SpawnItemType>) => void;
  onSpawnDelete: (id: string) => void;
  onSpawnUpdate: (id: string, updates: Partial<SpawnRecord>) => void;
  isEditMode: boolean;
  isLocal: boolean;
  toolMode: SpawnToolMode;
  onToolModeChange: (mode: SpawnToolMode) => void;
}

export const SpawnAnalysisPanel: React.FC<SpawnAnalysisPanelProps> = ({
  spawnRecords,
  activeSpawnItem,
  onActiveSpawnItemChange,
  spawnDetail,
  onSpawnDetailChange,
  visibleSpawnTypes,
  onVisibleSpawnTypesChange,
  onSpawnDelete,
  onSpawnUpdate,
  isEditMode,
  isLocal,
  toolMode,
  onToolModeChange,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<SpawnItemType>('image');
  const [editDetail, setEditDetail] = useState('');
  const [editNote, setEditNote] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const [manageText, setManageText] = useState('');

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

  const recentSpawns = [...spawnRecords].reverse().slice(0, 50);

  const renderPlaceMode = () => (
    <>
      <div className="panel-section">
        <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
          アイテム選択 (マップをクリックして追加)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: activeSpawnItem === 'textcolor' ? '4px' : 0 }}>
          {SPAWN_ITEM_ORDER.map(item => {
            const meta = SPAWN_ITEM_META[item];
            const isActive = activeSpawnItem === item;
            const cnt = counts.find(c => c.item === item)?.count ?? 0;
            return (
              <button
                key={item}
                onClick={() => onActiveSpawnItemChange(isActive ? null : item)}
                style={{
                  fontSize: '9px', padding: '3px 6px',
                  border: `1px solid ${meta.color}${isActive ? 'ff' : '55'}`,
                  background: isActive ? `${meta.color}33` : 'transparent',
                  color: meta.color, borderRadius: '4px', cursor: 'pointer',
                  fontWeight: isActive ? 700 : 400,
                  boxShadow: isActive ? `0 0 8px ${meta.color}66` : 'none',
                  display: 'flex', alignItems: 'center', gap: '2px',
                }}
                title={meta.label}
              >
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
                <span style={{ opacity: 0.6, fontSize: '8px', marginLeft: '2px' }}>({cnt})</span>
              </button>
            );
          })}
        </div>
        {activeSpawnItem === 'textcolor' && (
          <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
            {TEXTCOLOR_DETAILS.map(d => {
              const dm = TEXTCOLOR_DETAIL_META[d];
              const isSel = spawnDetail === d;
              return (
                <button
                  key={d}
                  onClick={() => onSpawnDetailChange(isSel ? '' : d)}
                  style={{
                    fontSize: '8px', padding: '2px 6px',
                    border: `1px solid ${dm.color}${isSel ? 'ff' : '44'}`,
                    background: isSel ? `${dm.color}33` : 'transparent',
                    color: dm.color, borderRadius: '3px', cursor: 'pointer',
                    fontWeight: isSel ? 700 : 400,
                  }}
                >
                  {dm.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', paddingTop: '6px' }}>
        <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
          統計
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>
          合計: <span style={{ color: 'var(--cyan-neon)' }}>{total}</span> 件
        </div>
      </div>
    </>
  );

  const renderEditMode = () => {
    const editTarget = editTargetId ? spawnRecords.find(s => s.id === editTargetId) : null;
    return (
      <div className="panel-section">
        <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
          情報編集
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          マップ上のスポーン点をクリックして選択
        </div>
        {editTarget && (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>X:{editTarget.x} Y:{editTarget.y}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
              {SPAWN_ITEM_ORDER.map(item => {
                const meta = SPAWN_ITEM_META[item];
                const isActive = editItem === item;
                return (
                  <button
                    key={item}
                    onClick={() => setEditItem(item)}
                    style={{
                      fontSize: '8px', padding: '2px 5px',
                      border: `1px solid ${meta.color}${isActive ? 'ff' : '44'}`,
                      background: isActive ? `${meta.color}33` : 'transparent',
                      color: meta.color, borderRadius: '3px', cursor: 'pointer',
                    }}
                  >{meta.emoji} {meta.label}</button>
                );
              })}
            </div>
            {editItem === 'textcolor' && (
              <div style={{ display: 'flex', gap: '2px' }}>
                {TEXTCOLOR_DETAILS.map(d => {
                  const dm = TEXTCOLOR_DETAIL_META[d];
                  const isSel = editDetail === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setEditDetail(isSel ? '' : d)}
                      style={{
                        fontSize: '7px', padding: '1px 4px',
                        border: `1px solid ${dm.color}${isSel ? 'ff' : '33'}`,
                        background: isSel ? `${dm.color}33` : 'transparent',
                        color: dm.color, borderRadius: '2px', cursor: 'pointer',
                      }}
                    >{dm.label}</button>
                  );
                })}
              </div>
            )}
            <input
              className="input-cyber"
              placeholder="メモ"
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              style={{ fontSize: '9px', padding: '2px 4px' }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn-cyber success"
                style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }}
                onClick={() => {
                  onSpawnUpdate(editTarget.id, {
                    item: editItem,
                    detail: editItem === 'textcolor' ? editDetail : undefined,
                    note: editNote || undefined,
                  });
                  setEditTargetId(null);
                  setEditNote('');
                  setEditDetail('');
                }}
              >保存</button>
              <button
                className="btn-cyber"
                style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }}
                onClick={() => setEditTargetId(null)}
              >キャンセル</button>
            </div>
          </div>
        )}
        {!editTarget && editTargetId && (
          <div style={{ fontSize: '9px', color: 'var(--red-neon, #ff0055)' }}>対象が見つかりません</div>
        )}
      </div>
    );
  };

  const renderEraseMode = () => (
    <div className="panel-section">
      <div className="panel-title" style={{ fontSize: '10px', marginBottom: '4px' }}>
        消しゴム
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>
        マップ上のスポーン点をクリックして削除
      </div>
      <div style={{ fontSize: '9px', color: 'var(--red-neon, #ff0055)' }}>
        削除はローカルのみ反映 (公開データは変更されません)
      </div>
    </div>
  );

  const renderManageMode = () => {
    return (
      <>
        <div className="panel-section">
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
                <span>{count}</span>
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
              最近の記録 ({spawnRecords.length})
            </div>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{showRecent ? '▲' : '▼'}</span>
          </div>
          {showRecent && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
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

  const toolTabs: { key: SpawnToolMode; label: string }[] = [
    { key: 'place', label: '設置' },
    { key: 'edit', label: '情報編集' },
    { key: 'erase', label: '消しゴム' },
    { key: 'manage', label: 'リスト整理' },
  ];

  return (
    <>
      <div className="panel-section" style={{ paddingBottom: '4px' }}>
        <div className="panel-title" style={{ fontSize: '11px', marginBottom: '4px' }}>スポーン解析</div>
        <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
          {toolTabs.map(t => (
            <button
              key={t.key}
              className={`tool-btn ${toolMode === t.key ? 'active' : ''}`}
              style={{ height: 26, fontSize: '9px', padding: '2px', minWidth: 0 }}
              onClick={() => onToolModeChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {toolMode === 'place' && renderPlaceMode()}
      {toolMode === 'edit' && renderEditMode()}
      {toolMode === 'erase' && renderEraseMode()}
      {toolMode === 'manage' && renderManageMode()}
    </>
  );
};
