import React, { useMemo, useState } from 'react';
import { X, Check, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import type { GlobalWalls } from '../utils/GlobalDataService';

interface TextureUsageModalProps {
  show: boolean;
  onClose: () => void;
  texturesList: string[];
  globalWalls: GlobalWalls;
  selectedTexture: string;
  onSelectTexture: (texName: string) => void;
  onReloadTextures?: () => void;
  isLocal?: boolean;
}

const FLOOR_LABELS: Record<string, string> = {
  main: '1F',
  second: '2F',
  third: '3F',
  fourth: '4F'
};

export const TextureUsageModal: React.FC<TextureUsageModalProps> = ({
  show,
  onClose,
  texturesList,
  globalWalls,
  selectedTexture,
  onSelectTexture,
  onReloadTextures,
  isLocal = false
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'unused'>('all');
  const [resolutions, setResolutions] = useState<Record<string, { w: number; h: number }>>({});
  const [resizing, setResizing] = useState<Record<string, boolean>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const usageData = useMemo(() => {
    const stats: Record<string, { count: number; floors: Set<string> }> = {};

    texturesList.forEach(tex => {
      stats[tex] = { count: 0, floors: new Set() };
    });

    Object.entries(globalWalls).forEach(([floor, segments]) => {
      if (!Array.isArray(segments)) return;
      segments.forEach(seg => {
        const texName = seg[2];
        if (texName && typeof texName === 'string') {
          if (!stats[texName]) {
            stats[texName] = { count: 0, floors: new Set() };
          }
          stats[texName].count += 1;
          stats[texName].floors.add(floor);
        }
      });
    });

    const mapped = Object.entries(stats).map(([name, data]) => ({
      name,
      count: data.count,
      floors: Array.from(data.floors).map(f => FLOOR_LABELS[f] || f)
    }));

    // 使用回数の降順、同じなら名前順
    const sorted = mapped.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    // タブ絞り込み
    if (activeTab === 'unused') {
      return sorted.filter(item => item.count === 0);
    }
    return sorted;
  }, [texturesList, globalWalls, activeTab]);

  // クライアント側で画像をFHDにリサイズしてサーバーに上書き保存する
  const handleResizeToFHD = async (fileName: string) => {
    if (resizing[fileName]) return;
    setResizing(prev => ({ ...prev, [fileName]: true }));

    try {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}texture/${fileName}?t=${Date.now()}`;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const maxDim = 1920;
      let targetW = img.naturalWidth;
      let targetH = img.naturalHeight;

      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/png');

      const res = await fetch(`${import.meta.env.BASE_URL}api/resize-texture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, dataUrl })
      });

      if (!res.ok) throw new Error('Failed to save resized texture on server');

      // 解像度キャッシュを更新して再ロードトリガーを引く
      setResolutions(prev => ({ ...prev, [fileName]: { w: targetW, h: targetH } }));
      setRefreshTrigger(prev => prev + 1);
      alert(t('画像をFHD解像度にリサイズしてサーバー上に上書き保存しました。'));
    } catch (e) {
      console.error(e);
      alert(t('リサイズ処理に失敗しました。'));
    } finally {
      setResizing(prev => ({ ...prev, [fileName]: false }));
    }
  };

  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const handleDelete = async (fileName: string) => {
    if (deleting[fileName]) return;
    if (!confirm(`${fileName} を削除しますか？`)) return;
    setDeleting(prev => ({ ...prev, [fileName]: true }));
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/delete-texture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName })
      });
      if (!res.ok) throw new Error('Delete failed');
      onReloadTextures?.();
    } catch (e) {
      console.error(e);
      alert(t('削除に失敗しました。'));
    } finally {
      setDeleting(prev => ({ ...prev, [fileName]: false }));
    }
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" style={{
        width: 'min(95vw, 820px)', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: '8px', border: '1px solid var(--border-color)',
        background: 'rgba(10, 15, 28, 0.96)', overflow: 'hidden',
        boxShadow: '0 0 25px rgba(0, 240, 255, 0.25)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid rgba(79, 195, 247, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--cyan-neon)' }}>
              🖼️ {t('テクスチャ画像ブラウザ')}
            </span>
            <button
              onClick={() => {
                setResolutions({});
                setRefreshTrigger(prev => prev + 1);
                onReloadTextures?.();
              }}
              title={t('テクスチャ一覧を再読み込み')}
              style={{
                background: 'rgba(79, 195, 247, 0.1)',
                border: '1px solid rgba(79, 195, 247, 0.3)',
                color: 'var(--cyan-neon)',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={14} />
              {t('再読み込み')}
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab & Info Section */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(5, 7, 12, 0.4)', gap: '12px', flexWrap: 'wrap'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('all')}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: '1px solid',
                cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s',
                background: activeTab === 'all' ? 'var(--cyan-neon)' : 'transparent',
                color: activeTab === 'all' ? '#000' : 'var(--cyan-neon)',
                borderColor: 'var(--cyan-neon)'
              }}
            >
              {t('すべて')} ({texturesList.length})
            </button>
            <button
              onClick={() => setActiveTab('unused')}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: '1px solid',
                cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s',
                background: activeTab === 'unused' ? 'rgba(255, 0, 85, 0.15)' : 'transparent',
                color: activeTab === 'unused' ? '#ff0055' : 'var(--text-muted)',
                borderColor: activeTab === 'unused' ? '#ff0055' : 'rgba(255,255,255,0.1)'
              }}
            >
              {t('未使用のみ')}
            </button>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            💡 {t('1920pxを超える大きな画像はFHDに縮小してメモリを節約できます')}
          </div>
        </div>

        {/* Grid List Content */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {usageData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
              {t('表示する画像がありません。')}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
              gap: '12px'
            }}>
              {usageData.map((item) => {
                const isSelected = selectedTexture === item.name;
                const isUnused = item.count === 0;
                const res = resolutions[item.name] || { w: 0, h: 0 };
                const isTooLarge = res.w > 1920 || res.h > 1920;

                return (
                  <div
                    key={item.name}
                    style={{
                      background: isSelected ? 'rgba(0, 240, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? '1px solid var(--cyan-neon)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      position: 'relative',
                      boxShadow: isSelected ? '0 0 10px rgba(0, 240, 255, 0.1)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Thumbnail wrapper */}
                    <div style={{
                      width: '100%', height: '95px', background: '#05070a',
                      borderRadius: '4px', overflow: 'hidden', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                      <img
                        src={`${import.meta.env.BASE_URL}texture/${item.name}?t=${refreshTrigger}`}
                        alt={item.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (!resolutions[item.name]) {
                            setResolutions(prev => ({
                              ...prev,
                              [item.name]: { w: img.naturalWidth, h: img.naturalHeight }
                            }));
                          }
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="95"><rect width="100" height="95" fill="%23111"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23444" font-size="10">No Image</text></svg>';
                        }}
                      />
                    </div>

                    {/* Image details */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div
                        style={{
                          fontSize: '11px', fontWeight: 'bold', color: '#fff',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </div>

                      {/* Resolution display */}
                      {res.w > 0 && (
                        <div style={{
                          fontSize: '9px',
                          color: isTooLarge ? '#ff0055' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: '2px', fontWeight: isTooLarge ? 'bold' : 'normal'
                        }}>
                          {isTooLarge && <ShieldAlert size={10} />}
                          {res.w}x{res.h}
                          {isTooLarge && ` (${t('巨大')})`}
                        </div>
                      )}

                      {/* Placed count (回数) */}
                      <div style={{ marginTop: '2px' }}>
                        {isUnused ? (
                          <span style={{
                            padding: '1px 4px', borderRadius: '3px', fontSize: '9px',
                            background: 'rgba(255, 0, 85, 0.15)', color: '#ff0055',
                            border: '1px solid rgba(255, 0, 85, 0.3)', fontWeight: 'bold'
                          }}>
                            {t('未使用')}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '10px', color: '#00ff88', fontWeight: 'bold'
                          }}>
                            {t('使用数')}: {item.count} {t('回')}
                          </span>
                        )}
                      </div>

                      {/* Placed Floors */}
                      {item.floors.length > 0 && (
                        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {item.floors.map(f => (
                            <span key={f} style={{
                              padding: '0px 3px', background: 'rgba(79, 195, 247, 0.1)',
                              borderRadius: '2px', fontSize: '8px', color: 'var(--cyan-neon)'
                            }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Resize Button if too large */}
                    {isTooLarge && (
                      <button
                        onClick={() => handleResizeToFHD(item.name)}
                        disabled={resizing[item.name]}
                        style={{
                          width: '100%', fontSize: '10px', padding: '3px', borderRadius: '4px',
                          background: 'rgba(255, 0, 85, 0.2)', border: '1px solid #ff0055',
                          color: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', fontWeight: 'bold'
                        }}
                      >
                        <Sparkles size={10} />
                        {resizing[item.name] ? t('縮小中...') : t('FHDに縮小')}
                      </button>
                    )}

                    {/* Action Select Button */}
                    <button
                      onClick={() => {
                        onSelectTexture(item.name);
                        onClose();
                      }}
                      style={{
                        width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px',
                        cursor: 'pointer', border: '1px solid', transition: 'all 0.2s',
                        background: isSelected ? 'var(--cyan-neon)' : 'transparent',
                        color: isSelected ? '#000' : 'var(--cyan-neon)',
                        borderColor: 'var(--cyan-neon)',
                        fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                      }}
                    >
                      {isSelected ? <Check size={11} /> : null}
                      {isSelected ? t('選択中') : t('テクスチャ選択')}
                    </button>

                    {/* Delete Button */}
                    {isLocal && (
                      <button
                        onClick={() => handleDelete(item.name)}
                        disabled={deleting[item.name]}
                        title={t('このテクスチャファイルを削除')}
                        style={{
                          width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px',
                          cursor: 'pointer', border: '1px solid', transition: 'all 0.2s',
                          background: 'rgba(255, 0, 85, 0.1)', color: '#ff4466',
                          borderColor: 'rgba(255, 0, 85, 0.3)', fontWeight: 'bold'
                        }}
                      >
                        {deleting[item.name] ? t('削除中...') : t('削除')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', background: 'rgba(5, 7, 12, 0.6)',
          display: 'flex', justifyContent: 'flex-end',
          borderTop: '1px solid rgba(79, 195, 247, 0.1)'
        }}>
          <button
            className="btn-cyber"
            onClick={onClose}
            style={{ padding: '4px 16px', fontSize: '11px' }}
          >
            {t('閉じる')}
          </button>
        </div>
      </div>
    </div>
  );
};
