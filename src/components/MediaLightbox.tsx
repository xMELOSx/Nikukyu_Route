import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MediaLightboxProps {
  media: { url: string; type: 'image' | 'webm' | 'youtube' } | null;
  onClose: () => void;
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({ media, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(false);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [media?.url]);

  if (!media) return null;

  return createPortal(
    <div
      onClick={() => { onClose(); setZoom(1); setPan({ x: 0, y: 0 }); }}
      onWheel={(e) => {
        if (media.type !== 'image') return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.1 : 1/1.1;
        setZoom(z => Math.max(0.5, Math.min(8, z * delta)));
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        cursor: zoom > 1 ? 'grab' : 'zoom-out',
        padding: '40px',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {media.type === 'image' && (
        <img
          src={media.url}
          alt="Zoomed"
          draggable={false}
          style={{
            maxWidth: zoom > 1 ? 'none' : '100%',
            maxHeight: zoom > 1 ? 'none' : '100%',
            width: zoom > 1 ? `${zoom * 80}%` : 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: '6px',
            boxShadow: '0 0 30px rgba(0, 240, 255, 0.3)',
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: zoom === 1 ? 'transform 0.2s' : 'none',
            cursor: zoom > 1 ? 'grab' : 'zoom-in'
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (dragRef.current) {
              dragRef.current = false;
              return;
            }
            if (zoom === 1) {
              setZoom(2.5);
            } else {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }
          }}
          onMouseDown={(e) => {
            if (zoom <= 1) return;
            e.preventDefault();
            e.stopPropagation();
            dragRef.current = false;
            const startX = e.clientX - pan.x;
            const startY = e.clientY - pan.y;
            const originX = e.clientX;
            const originY = e.clientY;
            const onMove = (ev: MouseEvent) => {
              if (Math.abs(ev.clientX - originX) > 3 || Math.abs(ev.clientY - originY) > 3) {
                dragRef.current = true;
              }
              setPan({ x: ev.clientX - startX, y: ev.clientY - startY });
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        />
      )}
      {media.type === 'webm' && (
        <video
          src={media.url}
          controls
          autoPlay
          loop
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '6px', boxShadow: '0 0 30px rgba(0, 240, 255, 0.3)' }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {media.type === 'image' && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '8px',
            background: 'rgba(0,0,0,0.7)',
            padding: '8px 12px',
            borderRadius: '20px',
            alignItems: 'center'
          }}
        >
          <button onClick={() => setZoom(z => Math.max(0.5, z / 1.3))} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>&minus;</button>
          <span style={{ color: '#fff', fontSize: '13px', minWidth: '60px', textAlign: 'center', fontFamily: 'monospace' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.3))} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>+</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px' }}>リセット</button>
          <button onClick={() => { onClose(); setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ background: 'rgba(255,80,80,0.25)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px' }}>閉じる</button>
        </div>
      )}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        color: '#fff',
        fontSize: '14px',
        background: 'rgba(0,0,0,0.6)',
        padding: '6px 12px',
        borderRadius: '4px',
        userSelect: 'none'
      }}>
        ✕ 閉じる (ESC)
      </div>
    </div>,
    document.body
  );
};

export default MediaLightbox;
