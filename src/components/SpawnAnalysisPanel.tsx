import React, { useState, useMemo } from 'react';
import { type SpawnPoint, type RegisteredItem, TEXTCOLOR_META, SPAWN_CATEGORIES } from '../utils/DataManager';

const TEXTCOLORS = ['green', 'blue', 'purple', 'yellow', 'red', 'cyan'] as const;
const COLOR_HEX: Record<string, string> = { green: '#39ff14', blue: '#00bfff', purple: '#b388ff', yellow: '#ffd700', red: '#ff4444', cyan: '#00ffff' };
const COLOR_LABELS: Record<string, string> = { green: '緑', blue: '青', purple: '紫', yellow: '金', red: 'キー', cyan: 'EH' };

const RATE_COLORS: Record<string, string> = { high: '#39ff14', mid: '#ffd700', low: '#ff4444' };
const QUALITY_GROUPS: { key: string; label: string; rates: string[] }[] = [
  { key: 'high', label: '高', rates: ['高'] },
  { key: 'mid', label: '中', rates: ['中'] },
  { key: 'low', label: '低', rates: ['低'] },
];

interface SpawnAnalysisPanelProps {
  points: SpawnPoint[];
  items: RegisteredItem[];
  isManage: boolean;
  onPointDelete: (id: string) => void;
  onPointFocus?: (x: number, y: number) => void;
  spawnVisible?: boolean;
  onSpawnVisibleChange?: (v: boolean) => void;
  hideOther?: boolean;
  onHideOtherChange?: (v: boolean) => void;
  hideBg?: boolean;
  onHideBgChange?: (v: boolean) => void;
  highlightItemIds?: string[];
  onHighlightItemIdsChange?: (ids: string[]) => void;
  highlightCategories?: string[];
  onHighlightCategoriesChange?: (cats: string[]) => void;
}

export const SpawnAnalysisPanel: React.FC<SpawnAnalysisPanelProps> = ({
  points, items, isManage, onPointDelete, onPointFocus,
  hideOther, onHideOtherChange, hideBg, onHideBgChange,
  highlightItemIds, onHighlightItemIdsChange,
  highlightCategories, onHighlightCategoriesChange,
  spawnVisible, onSpawnVisibleChange,
}) => {
  // 全モード共通のフック
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(Array.isArray(highlightItemIds) ? highlightItemIds : [])
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(Array.isArray(highlightCategories) ? highlightCategories : [])
  );
  const [detailPointId, setDetailPointId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [activeItemColor, setActiveItemColor] = useState<string | null>(null);
  const [selectedQualityGroups, setSelectedQualityGroups] = useState<Set<string>>(() => new Set(QUALITY_GROUPS.map(g => g.key)));

  const sortedItems = useMemo(() =>
    [...items]
      .map(i => ({ item: i, count: points.filter(p => p.items && p.items.some(pi => pi.itemId === i.id)).length }))
      .sort((a, b) => b.count - a.count),
  [items, points]);

  const filteredItems = useMemo(() => {
    return sortedItems.filter(({ item }) => {
      if (activeItemColor && item.textColor !== activeItemColor) return false;
      const itemRates = new Set(points.filter(p => p.items && p.items.some(pi => pi.itemId === item.id)).map(p => p.appearanceRate || '高'));
      const selectedRates = new Set(QUALITY_GROUPS.filter(g => selectedQualityGroups.has(g.key)).flatMap(g => g.rates));
      return [...itemRates].some(r => selectedRates.has(r));
    });
  }, [sortedItems, activeItemColor, selectedQualityGroups, points]);

  const filteredPoints = useMemo(() => {
    if (selectedItemIds.size === 0 && selectedCategories.size === 0) return [];
    return points.filter(p => {
      const matchItem = selectedItemIds.size === 0 || (p.items && p.items.some(pi => selectedItemIds.has(pi.itemId)));
      const matchCat = selectedCategories.size === 0 || (selectedCategories.has('__unset__') && !p.category) || (p.category && selectedCategories.has(p.category));
      return matchItem && matchCat;
    });
  }, [points, selectedItemIds, selectedCategories]);

  const itemStats = useMemo(() => {
    const stats: { [itemId: string]: { item: RegisteredItem; count: number } } = {};
    for (const item of items) stats[item.id] = { item, count: 0 };
    for (const p of points) {
      if (!p.items) continue;
      for (const pi of p.items) {
        if (stats[pi.itemId]) stats[pi.itemId].count++;
      }
    }
    return Object.values(stats).sort((a, b) => b.count - a.count);
  }, [points, items]);

  const recentPoints = useMemo(() => [...points].reverse().slice(0, 100), [points]);
  const detailPoint = detailPointId ? points.find(p => p.id === detailPointId) ?? null : null;

  if (isManage) {
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
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: tc?.color || '#fff', flex: 1, fontWeight: 600, fontSize: '13px' }}>{item.name || '(無名)'}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setShowRecent(s => !s)}>
            <div className="panel-title" style={{ fontSize: '12px', flex: 1, marginBottom: 0 }}>スポーン点一覧</div>
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
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 6px', borderLeft: '3px solid #39ff14', background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>X:{p.x} Y:{p.y}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{(p.items || []).length}アイテム</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{timeStr}</span>
                        {deleteConfirmId === p.id ? (
                          <>
                            <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => { onPointDelete(p.id); setDeleteConfirmId(null); }}>削除</button>
                            <button className="btn-cyber" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => setDeleteConfirmId(null)}>×</button>
                          </>
                        ) : (
                          <button className="btn-cyber danger" style={{ fontSize: '9px', padding: '2px 6px', clipPath: 'none' }} onClick={() => setDeleteConfirmId(p.id)}>✕</button>
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
  }

  // ===== 閲覧モード =====
  return (
    <>
      <div className="panel-section" style={{ paddingBottom: '4px' }}>
        {onSpawnVisibleChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginBottom: '4px' }}>
            <input type="checkbox" checked={!!spawnVisible} onChange={e => onSpawnVisibleChange(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
            スポーンポイント表示
          </label>
        )}
        {onHideOtherChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginBottom: '4px' }}>
            <input type="checkbox" checked={!!hideOther} onChange={e => onHideOtherChange(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
            マーカーと線を隠す
          </label>
        )}
        {onHideBgChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={!!hideBg} onChange={e => onHideBgChange(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
            背景を隠す
          </label>
        )}
      </div>

      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div className="panel-title" style={{ fontSize: '11px', marginBottom: 0 }}>種別で絞り込み</div>
          {selectedCategories.size > 0 && (
            <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }}
              onClick={() => { setSelectedCategories(new Set()); onHighlightCategoriesChange?.([]); }}>
              選択解除 ({selectedCategories.size})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '8px' }}>
          {[...SPAWN_CATEGORIES].map(cat => {
            const isSel = selectedCategories.has(cat);
            return (
              <button key={cat} onClick={() => {
                const next = new Set(selectedCategories);
                if (next.has(cat)) next.delete(cat); else next.add(cat);
                setSelectedCategories(next);
                onHighlightCategoriesChange?.([...next]);
              }}
                style={{
                  fontSize: '10px', padding: '3px 6px',
                  border: `2px solid ${isSel ? '#39ff14' : 'rgba(255,255,255,0.15)'}`,
                  background: isSel ? 'rgba(57,255,20,0.15)' : 'transparent',
                  color: isSel ? '#39ff14' : 'var(--text-muted)', borderRadius: '5px', cursor: 'pointer',
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div className="panel-title" style={{ fontSize: '11px', marginBottom: 0 }}>アイテムで絞り込み</div>
          {selectedItemIds.size > 0 && (
            <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 6px', clipPath: 'none' }}
              onClick={() => { setSelectedItemIds(new Set()); onHighlightItemIdsChange?.([]); }}>
              選択解除 ({selectedItemIds.size})
            </button>
          )}
        </div>
        <div className="panel-title" style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          該当: {filteredPoints.length} 点
        </div>

        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <button onClick={() => setActiveItemColor(null)}
            style={{
              fontSize: '9px', padding: '2px 6px',
              border: `1px solid ${activeItemColor === null ? '#39ff14' : 'rgba(255,255,255,0.15)'}`,
              background: activeItemColor === null ? 'rgba(57,255,20,0.15)' : 'transparent',
              color: activeItemColor === null ? '#39ff14' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer',
              fontWeight: activeItemColor === null ? 600 : 400,
            }}
          >全部</button>
          {([...TEXTCOLORS] as const).map(col => {
            const active = activeItemColor === col;
            return (
              <button key={col} onClick={() => setActiveItemColor(active ? null : col)}
                style={{
                  fontSize: '9px', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '2px',
                  border: `1px solid ${active ? COLOR_HEX[col] : 'rgba(255,255,255,0.15)'}`,
                  background: active ? `${COLOR_HEX[col]}22` : 'transparent',
                  color: active ? COLOR_HEX[col] : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: COLOR_HEX[col], display: 'inline-block' }} />
                {COLOR_LABELS[col]}
              </button>
            );
          })}
        </div>

        {/* Quality (appearance rate) filter */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '2px' }}>ポイント出現率</span>
          {QUALITY_GROUPS.map(g => {
            const active = selectedQualityGroups.has(g.key);
            const col = RATE_COLORS[g.key] || '#888';
            return (
              <button key={g.key} onClick={() => {
                const next = new Set(selectedQualityGroups);
                if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                setSelectedQualityGroups(next);
              }}
                style={{
                  fontSize: '9px', padding: '2px 6px',
                  border: `1px solid ${active ? col : 'rgba(255,255,255,0.12)'}`,
                  background: active ? `${col}22` : 'transparent',
                  color: active ? col : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                }}
              >{g.label}</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxHeight: '70vh', overflowY: 'auto' }}>
          {filteredItems.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px' }}>条件に合うアイテムなし</div>
          ) : filteredItems.map(({ item, count }) => {
            const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
            const isSel = selectedItemIds.has(item.id);
            return (
              <button key={item.id} onClick={() => {
                const next = new Set(selectedItemIds);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                setSelectedItemIds(next);
                onHighlightItemIdsChange?.([...next]);
              }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', padding: '3px 6px',
                  border: `2px solid ${tc?.color || '#888'}${isSel ? 'ff' : '33'}`,
                  background: isSel ? `${tc?.color}33` : 'rgba(0,0,0,0.2)',
                  color: tc?.color || '#fff', borderRadius: '5px', cursor: 'pointer',
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block' }} />
                <span>{item.name}</span>
                <span style={{ opacity: 0.7, fontSize: '9px', marginLeft: '1px' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {detailPoint && (
        <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)', background: 'rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span className="panel-title" style={{ fontSize: '11px', marginBottom: 0 }}>{detailPoint.category || ''}{detailPoint.category ? '　' : ''}出現率：<span style={{ color: (detailPoint.appearanceRate||'高') === '低' ? '#ff4444' : (detailPoint.appearanceRate||'高') === '中' ? '#ffd700' : '#39ff14' }}>{(detailPoint.appearanceRate||'高')}</span></span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {onPointFocus && (
                <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 5px', clipPath: 'none' }}
                  onClick={() => { onPointFocus(detailPoint.x, detailPoint.y); setDetailPointId(null); }}>点へ移動</button>
              )}
              <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 5px', clipPath: 'none' }}
                onClick={() => setDetailPointId(null)}>✕</button>
            </div>
          </div>
          {detailPoint.items.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>アイテム未登録</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {detailPoint.items.map((pi, idx) => {
                const item = items.find(i => i.id === pi.itemId);
                const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '3px 6px', background: 'rgba(0,0,0,0.15)', borderRadius: '3px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: tc?.color || '#fff', fontWeight: 600, flex: 1 }}>{item?.name || '(不明)'}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{pi.playerCount}P</span>
                    {item && <span style={{ color: '#ffd700', fontSize: '9px' }}>{item.fans}F</span>}
                    {item && <span style={{ color: '#ff9500', fontSize: '9px' }}>{item.coins}C</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};
