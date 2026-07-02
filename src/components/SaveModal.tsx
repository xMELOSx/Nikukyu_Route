import React, { useState, useEffect, useCallback } from 'react';
import { Download, FileJson, Image as ImageIcon, X, Copy, Check, ZoomIn } from 'lucide-react';
import { t } from '../i18n';
import { type FloorType, type RouteData, type HeistMarker, DataManager, aesGcmEncrypt, getRenderCacheKey, AUTHOR_UNKNOWN_MARKER, compressStrokes } from '../utils/DataManager';
import MediaLightbox from './MediaLightbox';

export interface SaveModalExportParams {
  mode: 'json' | 'png';
  dataBar: boolean;
  lineThickness: number;
  showTimestamp: boolean;
}

interface SaveModalProps {
  show: boolean;
  onClose: () => void;
  onExport: (params: SaveModalExportParams) => void;
  route: RouteData;
  currentFloor: FloorType;
  canvas: HTMLCanvasElement | null;
  svgString: string;
  globalMarkers?: HeistMarker[];
}

export const SaveModal: React.FC<SaveModalProps> = ({
  show, onClose, onExport, route, currentFloor, canvas, svgString, globalMarkers
}) => {
  const [mode, setMode] = useState<'json' | 'png'>('png');
  const [dataBar, setDataBar] = useState(false);
  const [lineThickness, setLineThickness] = useState(3);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [copied, setCopied] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' } | null>(null);

  const dataBarInfo = useCallback(() => {
    // 実際のエクスポートと同じデータ構造にする (グローバルマーカー込み)
    const mergedRoute: RouteData = {
      ...route,
      markers: [...(globalMarkers || []), ...route.markers],
    };
    const clean = DataManager.sanitizeRouteForExport(mergedRoute);
    const compressed: any = { ...clean, _v: 2 };
    for (const floorKey of Object.keys(clean.strokes) as FloorType[]) {
      compressed.strokes = { ...compressed.strokes, [floorKey]: compressStrokes(clean.strokes[floorKey]) };
    }
    const jsonStr = JSON.stringify(compressed);
    const bytes = new TextEncoder().encode(jsonStr).length;
    const HEADER_SIZE = 8 + 4 + 4; // marker + magic + length
    const HEADER_END = 8;
    const totalBytes = HEADER_SIZE + bytes + HEADER_END;
    const MAP_H = 1080 - 180 - 10;
    const MAP_W = Math.round(MAP_H * 1600 / 2275);
    const EXTW = MAP_W * 2 + 30;
    const rows = Math.max(2, Math.ceil(totalBytes / EXTW));
    const origH = 2275;
    const totalPercent = ((origH + rows) / origH) * 100;
    return { bytes, rows, EXTW, totalPercent };
  }, [route, globalMarkers])();

  // Generate preview
  useEffect(() => {
    if (!show || mode !== 'png') return;
    let cancelled = false;
    const gen = async () => {
      setPreviewLoading(true);
      try {
        const mergedForExport: RouteData = {
          ...route,
          markers: [...(globalMarkers || []), ...route.markers],
        };
        await DataManager.exportToPNG(
          currentFloor,
          mergedForExport,
          svgString,
          canvas,
          (dataUrl) => { if (!cancelled) setPreviewUrl(dataUrl); },
          !dataBar,
          lineThickness,
          showTimestamp
        );
      } catch { /* ignore */ }
      if (!cancelled) setPreviewLoading(false);
    };
    gen();
    return () => { cancelled = true; };
  }, [show, mode, dataBar, lineThickness, showTimestamp, route, currentFloor, canvas, svgString]);

  // Generate JSON text with encrypted renderCache
  useEffect(() => {
    if (!show || mode !== 'json') return;
    let cancelled = false;
    (async () => {
      const clean = DataManager.sanitizeRouteForExport(route);
      const plain = clean.renderCache || '';
      let encodedCache: string;
      if (plain) {
        try {
          encodedCache = await aesGcmEncrypt(plain, getRenderCacheKey(clean.id));
        } catch {
          encodedCache = plain;
        }
      } else {
        encodedCache = AUTHOR_UNKNOWN_MARKER;
      }
      const toExport = { ...clean, renderCache: encodedCache };
      if (!cancelled) setJsonText(JSON.stringify(toExport, null, 2));
    })();
    return () => { cancelled = true; };
  }, [show, mode, route]);

  useEffect(() => {
    if (show) { setPreviewUrl(null); setCopied(false); }
  }, [show]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = jsonText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [jsonText]);

  const handleSaveToFile = useCallback(() => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${route.title.replace(/\s+/g, '_')}_route_plan.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [jsonText, route.title]);

  if (!show) return null;

  const handleExport = () => {
    onExport({ mode, dataBar, lineThickness, showTimestamp });
    onClose();
  };

  return (
    <>
      <div
        tabIndex={-1} autoFocus
        style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(5, 7, 10, 0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, outline: 'none',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="glass-panel"
          style={{
            width: '560px', maxWidth: '95%', maxHeight: '90vh',
            padding: '24px', borderRadius: '8px',
            border: '1.5px solid var(--cyan-neon)',
            boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
            background: 'rgba(10, 15, 28, 0.98)',
            display: 'flex', flexDirection: 'column', gap: '16px',
            pointerEvents: 'auto', color: 'var(--text-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={18} /> {t('ファイルに保存')}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(0, 240, 255, 0.15)' }}>
            <button onClick={() => setMode('png')} style={{
              flex: 1, padding: '10px', fontSize: '13px', fontWeight: mode === 'png' ? 'bold' : 'normal',
              color: mode === 'png' ? 'var(--cyan-neon)' : 'var(--text-muted)',
              background: mode === 'png' ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
              border: 'none', borderBottom: mode === 'png' ? '2px solid var(--cyan-neon)' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <ImageIcon size={14} /> {t('画像保存')}
            </button>
            <button onClick={() => setMode('json')} style={{
              flex: 1, padding: '10px', fontSize: '13px', fontWeight: mode === 'json' ? 'bold' : 'normal',
              color: mode === 'json' ? 'var(--cyan-neon)' : 'var(--text-muted)',
              background: mode === 'json' ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
              border: 'none', borderBottom: mode === 'json' ? '2px solid var(--cyan-neon)' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <FileJson size={14} /> {t('JSON保存')}
            </button>
          </div>

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: mode === 'png' ? '300px' : undefined }}>
            {mode === 'png' ? (
              <>
                {/* Preview */}
                <div style={{
                  width: '100%', height: '260px',
                  border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '6px',
                  background: '#05070a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}>
                  {previewLoading ? (
                    <span style={{ color: 'var(--cyan-neon)', fontSize: '12px' }}>{t('プレビュー生成中...')}</span>
                  ) : previewUrl ? (
                    <>
                      <img src={previewUrl} alt="preview"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => setLightboxMedia({ url: previewUrl, type: 'image' })}
                      />
                      <button
                        onClick={() => setLightboxMedia({ url: previewUrl, type: 'image' })}
                        style={{
                          position: 'absolute', bottom: '6px', right: '6px',
                          background: 'rgba(0,0,0,0.6)', border: 'none', color: 'var(--cyan-neon)',
                          padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                          fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                      >
                        <ZoomIn size={12} /> {t('拡大')}
                      </button>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{t('プレビューなし')}</span>
                  )}
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={dataBar} onChange={(e) => setDataBar(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)' }} />
                    {t('データバー')}
                    {dataBar && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '4px' }}>
                        {dataBarInfo.EXTW}x{dataBarInfo.rows} ({t('元画像の{0}%', dataBarInfo.totalPercent.toFixed(1))})
                      </span>
                    )}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={showTimestamp} onChange={(e) => setShowTimestamp(e.target.checked)}
                      style={{ accentColor: 'var(--cyan-neon)' }} />
                    {t('出力日時を表示')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {t('線の太さ')}: {lineThickness}px
                    </label>
                    <input type="range" min={1} max={8} step={0.5} value={lineThickness}
                      onChange={(e) => setLineThickness(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--cyan-neon)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                      <span>1px</span><span>8px</span>
                    </div>
                  </div>
                </div>

                <button className="btn-cyber success" onClick={handleExport}
                  style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Download size={16} /> {t('画像を保存')}
                </button>
              </>
            ) : (
              <>
                <div style={{
                  width: '100%', maxHeight: '350px',
                  border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '6px',
                  background: '#0a0f1c', overflow: 'auto',
                }}>
                  <pre style={{
                    margin: 0, padding: '12px', fontSize: '11px', lineHeight: '1.4',
                    color: 'var(--text-primary)', fontFamily: 'Consolas, Monaco, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {jsonText}
                  </pre>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-cyber" onClick={handleCopy}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? t('コピー済み') : t('クリップボードにコピー')}
                  </button>
                  <button className="btn-cyber success" onClick={handleSaveToFile}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Download size={14} /> {t('ファイルに保存')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />
    </>
  );
};
