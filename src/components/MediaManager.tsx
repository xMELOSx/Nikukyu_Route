import React, { useState } from 'react';
import { type HeistMarker, type MediaItem } from '../utils/DataManager';

const detectMediaType = (url: string): MediaItem['type'] => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'x-embed';
  if (url.includes('.webm') || url.includes('video/webm')) return 'webm';
  return 'image';
};

interface MediaManagerProps {
  marker: HeistMarker;
  markers: HeistMarker[];
  onMarkersChange: (markers: HeistMarker[]) => void;
  isLocal: boolean;
  isIndividual: (type: string) => boolean;
}

const MediaManager: React.FC<MediaManagerProps> = ({ marker, markers, onMarkersChange, isLocal, isIndividual }) => {
  const [urlInput, setUrlInput] = useState('');
  const [editInputs, setEditInputs] = useState<Record<string, string>>({});

  const markerId = marker.id;
  const items = marker.mediaItems || [];

  const updateMarkerMedia = (next: MediaItem[]) => {
    onMarkersChange(markers.map(mk => mk.id === markerId ? { ...mk, mediaItems: next } : mk));
  };

  const submitUrl = () => {
    if (!urlInput.trim()) return;
    const newItem: MediaItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      url: urlInput.trim(),
      type: detectMediaType(urlInput.trim()),
      description: ''
    };
    const next = [...items, newItem];
    updateMarkerMedia(next);
    setUrlInput('');
  };

  return (
    <div style={{ marginTop: '6px', borderTop: '1px dashed rgba(79, 195, 247, 0.2)', paddingTop: '6px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {isLocal && (
          <button type="button" className="btn-cyber" style={{ flex: 1, padding: '3px', fontSize: '9px', clipPath: 'none' }} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,video/webm';
            input.multiple = true;
            input.onchange = async () => {
              if (!input.files) return;
              for (const file of Array.from(input.files)) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                  const res = await fetch('/api/upload-media', { method: 'POST', body: formData });
                  const data = await res.json();
                  if (data.url) {
                    const isVideo = file.type === 'video/webm' || file.name.endsWith('.webm');
                    const newItem: MediaItem = { id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, url: data.url, type: isVideo ? 'webm' : 'image', description: '' };
                    updateMarkerMedia([...items, newItem]);
                  }
                } catch (err) { console.error('Upload failed:', err); }
              }
            };
            input.click();
          }}>📎 添付</button>
        )}
        {!isIndividual(marker.type) && (
          <button type="button" className="btn-cyber" style={{ flex: 1, padding: '3px', fontSize: '9px', clipPath: 'none' }} onClick={async () => {
            try {
              const clipboardItems = await navigator.clipboard.read();
              for (const ci of clipboardItems) {
                for (const type of ci.types) {
                  if (type.startsWith('image/')) {
                    const blob = await ci.getType(type);
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    if (!dataUrl) continue;
                    const newItem: MediaItem = { id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, url: dataUrl, type: 'image', description: '' };
                    const curM = markers.find(mk => mk.id === markerId);
                    if (!curM) continue;
                    const curItems = curM.mediaItems || [];
                    const next = [...curItems, newItem];
                    onMarkersChange(markers.map(mk => mk.id === markerId ? { ...mk, mediaItems: next } : mk));
                  }
                }
              }
            } catch (err) {
              console.error('Clipboard paste failed:', err);
            }
          }}>📋 貼り付け</button>
        )}
      </div>
      {items.map((item, idx) => {
        const swap = (a: number, b: number) => {
          const next = [...items];
          [next[a], next[b]] = [next[b], next[a]];
          updateMarkerMedia(next);
        };
        const isImg = item.type === 'image' || item.url.startsWith('data:');
        const thumbStyle: React.CSSProperties = {
          width: '100%',
          height: '80px',
          objectFit: 'cover',
          borderRadius: '3px',
          background: 'rgba(0,0,0,0.3)',
          display: 'block',
          cursor: 'pointer',
        };
        const editVal = editInputs[item.id] ?? item.url;
        return (
          <div key={item.id} style={{ background: 'rgba(79,195,247,0.06)', borderRadius: '4px', padding: '4px', marginBottom: '4px' }}>
            <div style={{ position: 'relative', marginBottom: '4px' }}>
              {isImg ? (
                <img src={item.url} alt="" style={thumbStyle} onClick={() => window.open(item.url, '_blank')} />
              ) : item.type === 'youtube' ? (
                <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', cursor: 'pointer' }} onClick={() => window.open(item.url, '_blank')}>▶</div>
              ) : item.type === 'x-embed' ? (
                <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => window.open(item.url, '_blank')}>𝕏</div>
              ) : (
                <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#7ec8e3', cursor: 'pointer', padding: '4px', wordBreak: 'break-all', lineHeight: 1.2 }} onClick={() => window.open(item.url, '_blank')}>{item.type.toUpperCase()}</div>
              )}
              <span style={{ position: 'absolute', top: '2px', left: '2px', zIndex: 1, fontSize: '7px', color: '#7ec8e3', background: 'rgba(0,0,0,0.6)', padding: '0 3px', borderRadius: '2px', textTransform: 'uppercase' }}>{item.type === 'youtube' ? 'YT' : item.type === 'x-embed' ? 'X' : item.type}</span>
            </div>
            <div style={{ display: 'flex', gap: '2px', marginBottom: '3px' }}>
              <input type="text" className="input-cyber" style={{ flex: 1, fontSize: '8px', padding: '2px 4px' }} placeholder="URL" value={editVal} onChange={(e) => setEditInputs(prev => ({ ...prev, [item.id]: e.target.value }))} />
              <button type="button" className="btn-cyber" style={{ padding: '2px 6px', fontSize: '8px', clipPath: 'none' }} onClick={() => {
                const newUrl = (editInputs[item.id] ?? '').trim();
                if (!newUrl || newUrl === item.url) return;
                const next = [...items];
                next[idx] = { ...next[idx], url: newUrl, type: detectMediaType(newUrl) };
                updateMarkerMedia(next);
              }}>更新</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '7px', color: '#7ec8e3', cursor: 'pointer', opacity: idx === 0 ? 0.3 : 1 }} onClick={() => idx > 0 && swap(idx, idx - 1)}>▲</span>
              <span style={{ fontSize: '7px', color: '#7ec8e3', cursor: 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1 }} onClick={() => idx < items.length - 1 && swap(idx, idx + 1)}>▼</span>
              <span style={{ flex: 1 }} />
              <input type="text" className="input-cyber" style={{ flex: 1, fontSize: '8px', padding: '2px 4px' }} placeholder="説明" value={item.description || ''} onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx], description: e.target.value };
                updateMarkerMedia(next);
              }} />
              <span style={{ cursor: 'pointer', color: 'var(--red-neon)', fontWeight: 'bold', fontSize: '10px', background: 'rgba(0,0,0,0.3)', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }} onClick={() => {
                const removed = items[idx];
                const next = items.filter((_: MediaItem, i: number) => i !== idx);
                updateMarkerMedia(next);
                if (removed && removed.url && removed.url.includes('/uploads/')) {
                  const filename = removed.url.split('/uploads/').pop() || '';
                  if (filename) fetch('/api/upload-media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) }).catch(() => {});
                }
              }}>×</span>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
        <input type="text" className="input-cyber" style={{ flex: 1, fontSize: '9px', padding: '3px 4px' }} placeholder="画像/動画/X/YouTube URL" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }} />
        <button type="button" className="btn-cyber" style={{ padding: '3px 8px', fontSize: '9px', clipPath: 'none' }} onClick={submitUrl}>追加</button>
      </div>
    </div>
  );
};

export default MediaManager;
