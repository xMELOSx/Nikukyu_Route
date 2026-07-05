// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { MARKER_META, TEXTCOLOR_OPTIONS, TEXTCOLOR_META, SPAWN_CATEGORIES, CATEGORY_TO_POOL, POOL_LABELS } from '../utils/DataManager';
import type { RegisteredItem } from '../utils/DataManager';

const SpawnSidebar: React.FC<any> = (p) => {
  // Crop state for item image
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [cropRect, setCropRect] = useState<{x:number;y:number;w:number;h:number}>(() => {
    try { const s = localStorage.getItem('heist_item_crop_rect'); if(s) return JSON.parse(s); } catch {}
    return {x:10,y:10,w:200,h:60};
  });
  const [cropImgSize, setCropImgSize] = useState({w:0,h:0});
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropDragRef = useRef<{isDragging:boolean;type:string;startX:number;startY:number;initialX:number;initialY:number;initialW:number;initialH:number}|null>(null);
  const [svMode, setSvMode] = useState<'records' | 'pool'>(() => (localStorage.getItem('heist_sv_mode') as 'records' | 'pool') || 'records');
  useEffect(() => { localStorage.setItem('heist_sv_mode', svMode); }, [svMode]);
  const [addToPoolId, setAddToPoolId] = useState<string>(Object.keys(POOL_LABELS)[0] || '');

  // Clipboard paste for item image
  useEffect(() => {
    if (!p.showItemModal) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setCropSource(ev.target.result as string);
                setShowCrop(true);
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      setShowCrop(false);
      setCropSource(null);
    };
  }, [p.showItemModal]);

  const handleFileForCrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setCropSource(ev.target.result as string);
        setShowCrop(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmCrop = () => {
    if (!cropSource || !cropImgRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = cropRect.w;
    canvas.height = cropRect.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(cropImgRef.current, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
    p.setItemFormImage(canvas.toDataURL());
    localStorage.setItem('heist_item_crop_rect', JSON.stringify({x:cropRect.x,y:cropRect.y,w:cropRect.w,h:cropRect.h}));
    setShowCrop(false);
    setCropSource(null);
  };

  const cancelCrop = () => {
    setShowCrop(false);
    setCropSource(null);
  };

  const [cropHoverEdge, setCropHoverEdge] = useState<string | null>(null);

  const getEdge = (mx: number, my: number, r: typeof cropRect): string | null => {
    const edgeGrab = 16;
    const onLeft = Math.abs(mx - r.x) <= edgeGrab;
    const onRight = Math.abs(mx - (r.x + r.w)) <= edgeGrab;
    const onTop = Math.abs(my - r.y) <= edgeGrab;
    const onBottom = Math.abs(my - (r.y + r.h)) <= edgeGrab;
    if (onTop && onLeft) return 'nw';
    if (onTop && onRight) return 'ne';
    if (onBottom && onLeft) return 'sw';
    if (onBottom && onRight) return 'se';
    if (onTop) return 'n';
    if (onBottom) return 's';
    if (onLeft) return 'w';
    if (onRight) return 'e';
    return null;
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropImgRef.current || !cropSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = cropImgSize.w / rect.width;
    const scaleY = cropImgSize.h / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    let type: string | null = getEdge(mouseX, mouseY, cropRect);
    if (!type && mouseX >= cropRect.x && mouseX <= cropRect.x + cropRect.w && mouseY >= cropRect.y && mouseY <= cropRect.y + cropRect.h) type = 'move';
    if (type) {
      cropDragRef.current = {isDragging:true,type,startX:mouseX,startY:mouseY,initialX:cropRect.x,initialY:cropRect.y,initialW:cropRect.w,initialH:cropRect.h};
    }
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = cropImgSize.w / rect.width;
    const scaleY = cropImgSize.h / rect.height;
    const mouseX = Math.max(0, Math.min(cropImgSize.w, (e.clientX - rect.left) * scaleX));
    const mouseY = Math.max(0, Math.min(cropImgSize.h, (e.clientY - rect.top) * scaleY));
    if (!cropDragRef.current) {
      setCropHoverEdge(getEdge(mouseX, mouseY, cropRect));
      return;
    }
    const dx = mouseX - cropDragRef.current.startX;
    const dy = mouseY - cropDragRef.current.startY;
    let nx = cropDragRef.current.initialX;
    let ny = cropDragRef.current.initialY;
    let nw = cropDragRef.current.initialW;
    let nh = cropDragRef.current.initialH;
    const minSize = 12;
    if (cropDragRef.current.type === 'move') {
      nx = Math.max(0, Math.min(cropImgSize.w - cropDragRef.current.initialW, cropDragRef.current.initialX + dx));
      ny = Math.max(0, Math.min(cropImgSize.h - cropDragRef.current.initialH, cropDragRef.current.initialY + dy));
    } else {
      if (cropDragRef.current.type.includes('w')) {
        nx = Math.min(cropDragRef.current.initialX + cropDragRef.current.initialW - minSize, cropDragRef.current.initialX + dx);
        nw = cropDragRef.current.initialW + (cropDragRef.current.initialX - nx);
      }
      if (cropDragRef.current.type.includes('e')) {
        nw = Math.max(minSize, cropDragRef.current.initialW + dx);
      }
      if (cropDragRef.current.type.includes('n')) {
        ny = Math.min(cropDragRef.current.initialY + cropDragRef.current.initialH - minSize, cropDragRef.current.initialY + dy);
        nh = cropDragRef.current.initialH + (cropDragRef.current.initialY - ny);
      }
      if (cropDragRef.current.type.includes('s')) {
        nh = Math.max(minSize, cropDragRef.current.initialH + dy);
      }
    }
    setCropRect({x:Math.round(nx),y:Math.round(ny),w:Math.round(nw),h:Math.round(nh)});
  };

  const handleCropMouseUp = () => { cropDragRef.current = null; };

  const cursorForEdge = (e: string | null): string => {
    if (!e) return 'grab';
    if (e === 'n' || e === 's') return 'ns-resize';
    if (e === 'e' || e === 'w') return 'ew-resize';
    if (e === 'nw' || e === 'se') return 'nwse-resize';
    if (e === 'ne' || e === 'sw') return 'nesw-resize';
    return 'grab';
  };

  return (<>
    {/* Spawn tool panel */}
    {p.toolMode === 'add-spawn' && p.showSpawnEditFeature && (
      <>
        <div className="panel-section">
          <div className="panel-title">{t('\u30b9\u30dd\u30fc\u30f3')}</div>
          <div className="tool-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
            {([{key:'place',label:'\u8a2d\u7f6e'},{key:'erase',label:'\u6d88\u3057\u30b4\u30e0'},{key:'edit',label:'\u7de8\u96c6'},{key:'manage',label:'\u7ba1\u7406'}]).map(t2 => (
              <button key={t2.key} className={`tool-btn ${p.spawnToolMode===t2.key?'active':''}`} style={{height:26,fontSize:'9px',padding:'2px',minWidth:0}}
                onClick={() => { p.setSpawnToolMode(t2.key); p.setToolMode('add-spawn'); }}>{t2.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <button className="btn-cyber" style={{fontSize:'8px',padding:'2px 6px',clipPath:'none',flex:1}} disabled={p.spawnUndoRef?.current?.length===0} onClick={p.undoPoints}>{t('\u3010 \u5143\u306b\u623b\u3059')}</button>
            <button className="btn-cyber" style={{fontSize:'8px',padding:'2px 6px',clipPath:'none',flex:1}} disabled={p.spawnRedoRef?.current?.length===0} onClick={p.redoPoints}>{t('\u3011 \u3084\u308a\u76f4\u3057')}</button>
          </div>
        </div>

        {/* Place sub-panel */}
        {p.spawnToolMode === 'place' && (
          <div className="panel-section">
            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{t('マップをクリックして点を追加')}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('点を打った後、「編集」タブでアイテムを追加してください。')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{t('種別')}</span>
              <select value={p.spawnPlaceCategory || ''} onChange={e => p.setSpawnPlaceCategory(e.target.value)}
                style={{ flex: 1, fontSize: '12px', padding: '4px 8px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }}>
                <option value="">-</option>
                {SPAWN_CATEGORIES.map((c:string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>{t('スポーン点: ')}<span style={{ color: 'var(--cyan-neon)' }}>{p.spawnApi.points.length}</span></div>
          </div>
        )}

        {/* Edit sub-panel */}
        {p.spawnToolMode === 'edit' && (
          <div className="panel-section">
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('\u30de\u30c3\u30d7\u4e0a\u306e\u30b9\u30dd\u30fc\u30f3\u70b9\u3092\u30af\u30ea\u30c3\u30af\u3057\u3066\u7de8\u96c6')}</div>
            {p.editPointId && (
              <div style={{ fontSize: '9px', color: 'var(--cyan-neon)' }}>
                {t('\u7de8\u96c6\u4e2d: ')}X:{p.spawnApi.points.find((x: any) => x.id === p.editPointId)?.x ?? '?'} Y:{p.spawnApi.points.find((x: any) => x.id === p.editPointId)?.y ?? '?'}
              </div>
            )}
          </div>
        )}

        {/* Erase sub-panel */}
        {p.spawnToolMode === 'erase' && (
          <div className="panel-section">
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('\u30de\u30c3\u30d7\u4e0a\u306e\u30b9\u30dd\u30fc\u30f3\u70b9\u3092\u30af\u30ea\u30c3\u30af\u3057\u3066\u524a\u9664')}</div>
            <div style={{ fontSize: '9px', color: 'var(--red-neon)' }}>{t('\u524a\u9664\u306f\u30ed\u30fc\u30ab\u30eb\u306e\u307f\u53cd\u6620')}</div>
            <button className="btn-cyber danger" style={{ width: '100%', fontSize: '9px', padding: '4px', clipPath: 'none', marginTop: '6px' }}
              onClick={() => { const empty = p.spawnApi.points.filter((pt: any) => !pt.items || pt.items.length === 0); if (empty.length === 0) return; p.pushSpawnHistory(); empty.forEach((pt: any) => p.spawnApi.removePoint(pt.id)); }}>
              {t('\u672a\u8a2d\u5b9a\u306e\u70b9\u3092\u4e00\u62ec\u53bb\u9664')} ({p.spawnApi.points.filter((pt: any) => !pt.items || pt.items.length === 0).length})
            </button>
          </div>
        )}

        {/* Manage sub-panel */}
        {p.spawnToolMode === 'manage' && (
          <div className="panel-section">
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('\u767b\u9332\u30a2\u30a4\u30c6\u30e0\u6570: ')}{p.spawnApi.items.length}</div>
            <button className="btn-cyber success" style={{ width: '100%', fontSize: '10px', padding: '6px', clipPath: 'none' }}
              onClick={() => p.setShowItemModal(true)}>{t('\u30a2\u30a4\u30c6\u30e0\u767b\u9332/\u7de8\u96c6\u3092\u958b\u304f')}</button>
          </div>
        )}

        {/* Common settings */}
        <div className="panel-section" style={{ borderTop: '1px solid rgba(79,195,247,0.12)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={p.spawnHideOther} onChange={e => p.setSpawnHideOther(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
            {t('\u30de\u30fc\u30ab\u30fc\u3068\u7dda\u3092\u96a0\u3059')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', marginTop: '4px' }}>
            <input type="checkbox" checked={p.spawnHideBg} onChange={e => p.setSpawnHideBg(e.target.checked)} style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }} />
            {t('\u80cc\u666f\u3092\u96a0\u3059')}
          </label>
        </div>

        {/* Point list */}
        <div className="panel-section">
          <div style={{ fontSize: '10px', marginBottom: '4px' }}>{t('\u70b9\u3092\u63a2\u3059')} ({p.spawnApi.points.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '150px', overflowY: 'auto' }}>
            {p.spawnApi.points.length === 0 ? (
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{t('\u70b9\u304c\u3042\u308a\u307e\u305b\u3093')}</div>
            ) : (
              [...p.spawnApi.points].reverse().map((pt: any) => (
                <button key={pt.id} onClick={() => p.setSpawnFocusTrigger({ x: pt.x, y: pt.y, ts: Date.now() })}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', padding: '3px 6px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(79,195,247,0.15)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#39ff14', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>X:{pt.x} Y:{pt.y}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>{(pt.items || []).length}{t('\u70b9')}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </>
    )}

    {/* Item management modal */}
    {p.showItemModal && (
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',zIndex:5000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>p.setShowItemModal(false)}>
        <div style={{background:'var(--panel-bg,#0a0e18)',width:'520px',maxHeight:'85vh',border:'1px solid rgba(79,195,247,0.3)',borderRadius:'12px',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid rgba(79,195,247,0.2)'}}>
            <span style={{fontSize:'15px',fontWeight:700,color:'var(--cyan-neon)'}}>{t('\u30a2\u30a4\u30c6\u30e0\u7ba1\u7406')}</span>
            <button className="btn-cyber" style={{padding:'3px 10px',fontSize:'11px',clipPath:'none'}} onClick={()=>p.setShowItemModal(false)}>✕ {t('\u9589\u3058\u308b')}</button>
          </div>
          <div style={{padding:'12px 16px',overflowY:'auto',flex:1}}>
            <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'16px'}}>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--cyan-neon)'}}>{p.itemFormEditId?t('\u30a2\u30a4\u30c6\u30e0\u7de8\u96c6'):t('\u65b0\u898f\u30a2\u30a4\u30c6\u30e0\u767b\u9332')}</div>
              <input className="input-cyber" placeholder={t('\u30a2\u30a4\u30c6\u30e0\u540d')} value={p.itemFormName} onChange={e=>p.setItemFormName(e.target.value)} style={{fontSize:'14px',padding:'8px 12px'}} />
              <div style={{display:'flex',gap:'6px'}}>{TEXTCOLOR_OPTIONS.map((c:string)=>{const tc=TEXTCOLOR_META[c];const sel=p.itemFormTextColor===c;return(<button key={c} onClick={()=>p.setItemFormTextColor(c)} style={{flex:1,fontSize:'11px',padding:'6px 8px',border:`2px solid ${tc.color}${sel?'ff':'44'}`,background:sel?`${tc.color}33`:'transparent',color:tc.color,borderRadius:'6px',cursor:'pointer',fontWeight:sel?700:400}}>{tc.label}</button>);})}</div>
              <label style={{fontSize:'13px',color:'#ffd700',display:'flex',alignItems:'center',gap:'8px',fontWeight:700}}>{t('\u30d5\u30a1\u30f3\u30b9')}<input type="number" min="0" step="100" value={p.itemFormFans} onChange={e=>p.setItemFormFans(Math.max(0,parseInt(e.target.value)||0))} style={{width:'120px',fontSize:'15px',fontWeight:700,padding:'6px 10px',background:'#0a0e18',color:'#ffd700',border:'1px solid rgba(255,215,0,0.4)',borderRadius:'4px'}} /></label>
              <label style={{fontSize:'13px',color:'#ff9500',display:'flex',alignItems:'center',gap:'8px',fontWeight:700}}>{t('\u30b3\u30a4\u30f3')}<input type="number" min="0" step="10" value={p.itemFormCoins} onChange={e=>p.setItemFormCoins(Math.max(0,parseInt(e.target.value)||0))} style={{width:'120px',fontSize:'15px',fontWeight:700,padding:'6px 10px',background:'#0a0e18',color:'#ff9500',border:'1px solid rgba(255,149,0,0.4)',borderRadius:'4px'}} /></label>
              <div style={{display:'flex',gap:'6px'}}>
                <input className="input-cyber" placeholder={t('\u753b\u50cfURL')} value={p.itemFormImage} onChange={e=>p.setItemFormImage(e.target.value)} style={{flex:1,fontSize:'12px',padding:'6px 10px'}} />
                <button className="btn-cyber" style={{fontSize:'11px',padding:'4px 10px',clipPath:'none',flexShrink:0}} onClick={()=>p.itemImageInputRef.current?.click()}>{t('\u53c2\u7167')}</button>
                {p.itemFormImage&&<button className="btn-cyber danger" style={{fontSize:'11px',padding:'4px 10px',clipPath:'none',flexShrink:0}} onClick={()=>p.setItemFormImage('')}>✕</button>}
                <input ref={p.itemImageInputRef} type="file" accept="image/*" onChange={handleFileForCrop} style={{display:'none'}} />
              </div>
              {showCrop && cropSource && (
                <div style={{position:'relative',border:'1px solid rgba(79,195,247,0.3)',borderRadius:'6px',background:'#000',overflow:'hidden',userSelect:'none'}}>
                  <div onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={() => { handleCropMouseUp(); setCropHoverEdge(null); }} style={{position:'relative',cursor:cursorForEdge(cropHoverEdge),display:'inline-block',width:'100%'}}>
                    <img ref={cropImgRef} src={cropSource} onLoad={(e)=>{const img=e.currentTarget;setCropImgSize({w:img.naturalWidth,h:img.naturalHeight});const maxW=img.naturalWidth;const maxH=img.naturalHeight;setCropRect(prev=>({x:Math.min(prev.x,maxW-12),y:Math.min(prev.y,maxH-12),w:Math.min(prev.w,maxW),h:Math.min(prev.h,maxH)}));}} style={{display:'block',maxWidth:'100%',maxHeight:'40vh',objectFit:'contain',pointerEvents:'none'}} />
                    {cropImgSize.w>0&&cropImgRef.current&&(()=>{
                      const img=cropImgRef.current!;
                      const rw=img.clientWidth/cropImgSize.w;
                      const rh=img.clientHeight/cropImgSize.h;
                      const l=cropRect.x*rw, t=cropRect.y*rh, w=cropRect.w*rw, h=cropRect.h*rh;
                      return(<>
                        <div style={{position:'absolute',left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`,border:'3px solid #39ff14',boxShadow:'0 0 12px #39ff14, inset 0 0 6px #39ff14',background:'rgba(57,255,20,0.05)',pointerEvents:'none'}} />
                        <div style={{position:'absolute',left:`${l-8}px`,top:`${t-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                        <div style={{position:'absolute',left:`${l+w-8}px`,top:`${t-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                        <div style={{position:'absolute',left:`${l-8}px`,top:`${t+h-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                        <div style={{position:'absolute',left:`${l+w-8}px`,top:`${t+h-8}px`,width:'16px',height:'16px',background:'#39ff14',borderRadius:'50%',border:'2px solid #000',pointerEvents:'none',opacity:0.9}} />
                        <div style={{position:'absolute',left:`${l+w/2-5}px`,top:`${t-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                        <div style={{position:'absolute',left:`${l+w/2-5}px`,top:`${t+h-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                        <div style={{position:'absolute',left:`${l-5}px`,top:`${t+h/2-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                        <div style={{position:'absolute',left:`${l+w-5}px`,top:`${t+h/2-5}px`,width:'10px',height:'10px',background:'#39ff14',borderRadius:'2px',border:'1px solid #000',pointerEvents:'none',opacity:0.6}} />
                      </>);
                    })()}
                  </div>
                  <div style={{display:'flex',gap:'6px',padding:'8px',borderTop:'1px solid rgba(79,195,247,0.2)'}}>
                    <div style={{flex:1,fontSize:'11px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'8px'}}>
                      <span>X:{cropRect.x} Y:{cropRect.y}</span>
                      <span>{cropRect.w}x{cropRect.h}</span>
                      <span style={{color:'rgba(57,255,20,0.7)',fontSize:'10px'}}>{t('\u7e01\u3092\u30c9\u30e9\u30c3\u30b0\u3067\u30ea\u30b5\u30a4\u30ba\u30fb\u4e2d\u3092\u30c9\u30e9\u30c3\u30b0\u3067\u79fb\u52d5')}</span>
                    </div>
                    <button className="btn-cyber" style={{fontSize:'10px',padding:'4px 10px',clipPath:'none'}} onClick={cancelCrop}>{t('\u30ad\u30e3\u30f3\u30bb\u30eb')}</button>
                    <button className="btn-cyber success" style={{fontSize:'10px',padding:'4px 10px',clipPath:'none'}} onClick={confirmCrop}>{t('\u3053\u306e\u90e8\u5206\u3092\u4f7f\u7528')}</button>
                  </div>
                </div>
              )}
              {!showCrop && (<div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'-4px',marginBottom:'4px'}}>{t('\u753b\u50cf\u3092\u30da\u30fc\u30b9\u30c8\u307e\u305f\u306f\u30d5\u30a1\u30a4\u30eb\u304b\u3089\u8aad\u307f\u8fbc\u3080\u3068\u3001\u5207\u308a\u53d6\u308a\u7de8\u96c6\u304c\u3067\u304d\u307e\u3059')}</div>)}
              <textarea className="textarea-cyber" placeholder={t('\u8aac\u660e (\u4efb\u610f)')} value={p.itemFormDescription} onChange={e=>p.setItemFormDescription(e.target.value)} style={{fontSize:'12px',padding:'6px 10px',minHeight:'50px',resize:'vertical'}} />
              <button className="btn-cyber success" style={{fontSize:'12px',padding:'8px',clipPath:'none'}} onClick={p.handleItemSave} disabled={!p.itemFormName.trim()}>{p.itemFormEditId?t('\u66f4\u65b0'):t('\u767b\u9332')}</button>
              {p.itemFormEditId&&<button className="btn-cyber" style={{fontSize:'12px',padding:'8px',clipPath:'none'}} onClick={()=>{p.setItemFormEditId(null);p.setItemFormName('');p.setItemFormDescription('');p.setItemFormTextColor('blue');p.setItemFormFans(0);p.setItemFormCoins(0);}}>{t('\u30ad\u30e3\u30f3\u30bb\u30eb')}</button>}
            </div>
            {/* Bulk import */}
            <details style={{ marginBottom: '16px' }}>
              <summary style={{ fontSize: '12px', color: 'var(--cyan-neon)', cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                {t('\u4e00\u62ec\u30a4\u30f3\u30dd\u30fc\u30c8')}
              </summary>
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {t('\u540d\u524d\u3000\u30d5\u30a1\u30f3\u30b9\u3000\u30b3\u30a4\u30f3\u3000\u8aac\u660e (\u30bf\u30d6\u533a\u5207\u308a\u30011\u884c1\u30a2\u30a4\u30c6\u30e0)')}
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  {TEXTCOLOR_OPTIONS.map((c:string) => {
                    const tc = TEXTCOLOR_META[c];
                    const isSel = p.bulkColor === c;
                    return (
                      <button key={c} onClick={() => p.setBulkColor(c)}
                        style={{ flex: 1, fontSize: '9px', padding: '4px 6px', border: `1px solid ${tc.color}${isSel ? 'ff' : '33'}`, background: isSel ? `${tc.color}33` : 'transparent', color: tc.color, borderRadius: '4px', cursor: 'pointer', fontWeight: isSel ? 700 : 400 }}
                      >{tc.label}</button>
                    );
                  })}
                </div>
                <textarea className="textarea-cyber"
                  value={p.bulkInput} onChange={e => p.setBulkInput(e.target.value)}
                  placeholder={t('\u30b5\u30f3\u30d7\u30eb:\n\u30a2\u30a4\u30c6\u30e0\u540d1\t750\t3\t\u8aac\u660e\u65871\n\u30a2\u30a4\u30c6\u30e0\u540d2\t640\t3\t\u8aac\u660e\u65872')}
                  style={{ fontSize: '11px', padding: '6px 10px', minHeight: '100px', resize: 'vertical', width: '100%' }} />
                <button className="btn-cyber success" style={{ width: '100%', fontSize: '12px', padding: '8px', clipPath: 'none', marginTop: '6px' }}
                  onClick={p.handleBulkImport} disabled={!p.bulkInput.trim()}>
                  {t('\u30a4\u30f3\u30dd\u30fc\u30c8')}
                </button>
              </div>
            </details>
            {/* Registered items list */}
            <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {t('\u767b\u9332\u6e08\u307f\u30a2\u30a4\u30c6\u30e0')} ({p.spawnApi.items.length})
              </div>
              {p.spawnApi.items.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('\u30a2\u30a4\u30c6\u30e0\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u4e0a\u8a18\u30d5\u30a9\u30fc\u30e0\u304b\u3089\u767b\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {p.spawnApi.items.map((item: any) => {
                    const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                    const ptCount = p.spawnApi.points.filter((pt: any) => pt.items && pt.items.some((pi: any) => pi.itemId === item.id)).length;
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: tc?.color || '#fff', fontWeight: 600, fontSize: '13px' }}>{item.name}</span>
                            {item.image && (<a href={item.image} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--cyan-neon)', textDecoration: 'none', flexShrink: 0 }} title={item.image}>🖼</a>)}
                            <span style={{ color: '#ffd700', fontSize: '12px', fontWeight: 600 }}>{item.fans.toLocaleString()}F</span>
                            <span style={{ color: '#ff9500', fontSize: '12px', fontWeight: 600 }}>{item.coins.toLocaleString()}C</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{ptCount}{t('\u70b9')}</span>
                          </div>
                          {item.description && (<div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>)}
                        </div>
                        <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 4px', clipPath: 'none', flexShrink: 0, opacity: p.spawnApi.items.indexOf(item) === 0 ? 0.3 : 1 }}
                          onClick={() => p.spawnApi.moveItem(item.id, -1)} disabled={p.spawnApi.items.indexOf(item) === 0}>▲</button>
                        <button className="btn-cyber" style={{ fontSize: '8px', padding: '2px 4px', clipPath: 'none', flexShrink: 0, opacity: p.spawnApi.items.indexOf(item) === p.spawnApi.items.length - 1 ? 0.3 : 1 }}
                          onClick={() => p.spawnApi.moveItem(item.id, 1)} disabled={p.spawnApi.items.indexOf(item) === p.spawnApi.items.length - 1}>▼</button>
                        <button className="btn-cyber" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none', flexShrink: 0 }}
                          onClick={() => { p.setItemFormEditId(item.id); p.setItemFormName(item.name); p.setItemFormDescription(item.description || ''); p.setItemFormImage(item.image || ''); p.setItemFormTextColor(item.textColor); p.setItemFormFans(item.fans); p.setItemFormCoins(item.coins); }}>
                          {t('\u7de8\u96c6')}
                        </button>
                        <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '3px 8px', clipPath: 'none' }}
                          onClick={() => p.spawnApi.removeItem(item.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Spawn point edit modal */}
    {p.showEditModal && p.editPointId && (()=>{
      const pt=p.spawnApi.points.find((x:any)=>x.id===p.editPointId);if(!pt)return null;
      return(<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',zIndex:5001,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{p.setShowEditModal(false);p.setEditPointId(null)}}>
        <div style={{background:'var(--panel-bg,#0a0e18)',width:'520px',maxHeight:'85vh',border:'1px solid rgba(79,195,247,0.3)',borderRadius:'12px',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid rgba(79,195,247,0.2)'}}>
            <span style={{fontSize:'15px',fontWeight:700,color:'var(--cyan-neon)'}}>{t('\u30b9\u30dd\u30fc\u30f3\u70b9\u7de8\u96c6')}</span>
            <button className="btn-cyber" style={{padding:'3px 10px',fontSize:'11px',clipPath:'none'}} onClick={()=>{p.setShowEditModal(false);p.setEditPointId(null)}}>✕ {t('\u9589\u3058\u308b')}</button>
          </div>
          <div style={{padding:'8px 16px',borderBottom:'1px solid rgba(79,195,247,0.1)',display:'flex',flexDirection:'column',gap:'6px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'11px',color:'var(--text-muted)',fontWeight:600}}>{t('\u5ea7\u6a19')}</span>
              <label style={{fontSize:'11px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'4px'}}>X<input type="number" value={p.spawnMoveX} onChange={e=>p.setSpawnMoveX(parseInt(e.target.value)||0)} style={{width:'70px',fontSize:'12px',padding:'4px 6px',background:'#0a0e18',color:'#fff',border:'1px solid rgba(79,195,247,0.3)',borderRadius:'3px'}} /></label>
              <label style={{fontSize:'11px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'4px'}}>Y<input type="number" value={p.spawnMoveY} onChange={e=>p.setSpawnMoveY(parseInt(e.target.value)||0)} style={{width:'70px',fontSize:'12px',padding:'4px 6px',background:'#0a0e18',color:'#fff',border:'1px solid rgba(79,195,247,0.3)',borderRadius:'3px'}} /></label>
              <button className="btn-cyber success" style={{fontSize:'10px',padding:'4px 10px',clipPath:'none'}} onClick={()=>{p.pushSpawnHistory();p.spawnApi.updatePoint(pt.id,{x:p.spawnMoveX,y:p.spawnMoveY})}}>{t('\u79fb\u52d5')}</button>
              <button className="btn-cyber" style={{fontSize:'10px',padding:'4px 10px',clipPath:'none'}} onClick={()=>{p.setSpawnMovingPointId(pt.id);p.setShowEditModal(false);p.setEditPointId(null)}}>{t('\u914d\u7f6e\u3057\u76f4\u3059')}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('\u7a2e\u5225')}</span>
              <select value={pt.category ?? ''} onChange={e => p.spawnApi.updatePoint(pt.id, { category: e.target.value as any || undefined })}
                style={{ fontSize: '12px', padding: '4px 8px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '3px' }}>
                <option value="">-</option>
                {SPAWN_CATEGORIES.map((c:string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {t('\u30a2\u30a4\u30c6\u30e0\u4e00\u89a7')} ({(pt.items || []).length})
            </div>
            {(!pt.items || pt.items.length === 0) ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                {t('\u30a2\u30a4\u30c6\u30e0\u304c\u672a\u767b\u9332\u3067\u3059\u3002\u4e0b\u306e\u30d5\u30a9\u30fc\u30e0\u304b\u3089\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {pt.items.map((pi: any, idx: number) => {
                  const item = p.spawnApi.items.find((i:any) => i.id === pi.itemId);
                  const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: tc?.color || '#fff', flex: 1, fontWeight: 600 }}>{item?.name || t('(\u4e0d\u660e)')}</span>
                      <span style={{ color: '#ffd700', fontWeight: 600 }}>{item?.fans.toLocaleString() || '0'}F</span>
                      <span style={{ color: '#ff9500', fontWeight: 600 }}>{item?.coins.toLocaleString() || '0'}C</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>{pi.playerCount}P</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{new Date(pi.discoveredAt).toLocaleDateString()}</span>
                      <button className="btn-cyber danger" style={{ fontSize: '10px', padding: '2px 6px', clipPath: 'none', flexShrink: 0 }}
                        onClick={() => p.handlePointRemoveItem(pt.id, idx)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ borderTop: '1px solid rgba(79,195,247,0.15)', paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('\u30a2\u30a4\u30c6\u30e0\u8ffd\u52a0')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                  {[...p.spawnApi.items]
                    .map((i: any) => ({ item: i, count: p.spawnApi.points.filter((pt2:any) => pt2.items && pt2.items.some((pi2:any) => pi2.itemId === i.id)).length }))
                    .sort((a:any, b:any) => b.count - a.count)
                    .map(({ item }: any) => {
                      const tc = TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META];
                      const isSel = p.editAddItemId === item.id;
                      return (
                        <button key={item.id} onClick={() => p.setEditAddItemId(isSel ? '' : item.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 8px', border: `2px solid ${tc?.color || '#888'}${isSel ? 'ff' : '44'}`, background: isSel ? `${tc?.color}33` : 'rgba(0,0,0,0.3)', color: tc?.color || '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: isSel ? 700 : 400 }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block' }} />
                          <span>{item.name}</span>
                        </button>
                      );
                    })}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    {t('\u30d7\u30ec\u30a4\u30e4\u30fc\u4eba\u6570')}
                    <input type="number" min="1" max="4" value={p.editAddPlayerCount}
                      onChange={e => p.setEditAddPlayerCount(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                      style={{ width: '60px', fontSize: '14px', fontWeight: 700, padding: '6px 10px', background: '#0a0e18', color: '#fff', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '4px', textAlign: 'center' }} />
                  </label>
                  <button className="btn-cyber success" style={{ flex: 1, fontSize: '13px', padding: '8px 16px', clipPath: 'none' }}
                    disabled={!p.editAddItemId}
                    onClick={() => p.handlePointAddItem(pt.id, p.editAddItemId, p.editAddPlayerCount)}>{t('\u8ffd\u52a0')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>);
    })()}

    {/* Spawn point viewer modal */}
    {p.spawnViewPointId && (() => {
      const pt = p.spawnApi.points.find((x:any) => x.id === p.spawnViewPointId);
      if (!pt) return null;
      const filteredItems = !pt.items ? [] : p.viewerFilterPlayers === null
        ? pt.items : pt.items.filter((pi:any) => pi.playerCount === p.viewerFilterPlayers);
      const grouped: { [id: string]: { item: any; count: number } } = {};
      for (const pi of filteredItems) {
        if (!grouped[pi.itemId]) grouped[pi.itemId] = { item: p.spawnApi.items.find((i:any) => i.id === pi.itemId), count: 0 };
        grouped[pi.itemId].count++;
      }
      const sorted = Object.values(grouped).sort((a:any, b:any) => b.count - a.count);
      const poolId = pt.category ? CATEGORY_TO_POOL[pt.category] : null;
      return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => p.setSpawnViewPointId(null)}>
          <div style={{ background: 'var(--panel-bg, #0a0e18)', width: '400px', maxHeight: '70vh', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-neon)' }}>{t('\u70b9\u60c5\u5831')} X:{pt.x} Y:{pt.y}{pt.category ? ` (${pt.category})` : ''}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none', background: svMode === 'records' ? 'rgba(0,240,255,0.15)' : 'transparent', borderColor: svMode === 'records' ? '#00ffff' : 'rgba(0,240,255,0.2)' }}
                  onClick={() => setSvMode('records')}>{t('\u53d6\u5f97\u8a18\u9332')}</button>
                <button className="btn-cyber" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none', background: svMode === 'pool' ? 'rgba(255,215,0,0.15)' : 'transparent', borderColor: svMode === 'pool' ? '#ffd700' : 'rgba(255,215,0,0.2)' }}
                  onClick={() => setSvMode('pool')}>{t('\u30d7\u30fc\u30eb')}</button>
                <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }} onClick={() => p.setSpawnViewPointId(null)}>✕</button>
              </div>
            </div>
            {svMode === 'records' ? (
            <>
            <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', borderBottom: '1px solid rgba(79,195,247,0.1)' }}>
              {[{ v: null, label: t('\u5168\u30c7\u30fc\u30bf') }, { v: 1, label: '1\u4eba' }, { v: 2, label: '2\u4eba' }, { v: 3, label: '3\u4eba' }, { v: 4, label: '4\u4eba' }].map(({ v, label }) => (
                <button key={String(v)} onClick={() => p.setViewerFilterPlayers(v)}
                  style={{ flex: 1, fontSize: '11px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${v === p.viewerFilterPlayers ? '#39ff14' : 'rgba(255,255,255,0.15)'}`, background: v === p.viewerFilterPlayers ? 'rgba(57,255,20,0.15)' : 'transparent', color: v === p.viewerFilterPlayers ? '#39ff14' : 'var(--text-muted)', fontWeight: v === p.viewerFilterPlayers ? 700 : 400 }}
                >{label}</button>
              ))}
            </div>
            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
              {sorted.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('\u8a72\u5f53\u30a2\u30a4\u30c6\u30e0\u306a\u3057')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sorted.map(({ item, count }: any) => {
                    const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                    return (
                      <div key={item?.id || Math.random()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tc?.color || '#888', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: tc?.color || '#fff', fontWeight: 700, fontSize: '14px', flex: 1 }}>{item?.name || t('(\u4e0d\u660e)')}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px' }}>{count}{t('\u56de')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {sorted.length > 0 && (
              <div style={{ padding: '6px 16px', borderTop: '1px solid rgba(79,195,247,0.1)', display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                <select value={addToPoolId} onChange={e => setAddToPoolId(e.target.value)}
                  style={{ flex: 1, fontSize: '11px', padding: '4px 6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(79,195,247,0.2)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                  {Object.entries(POOL_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <button className="btn-cyber" style={{ padding: '4px 10px', fontSize: '10px', clipPath: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    const uniqueIds = [...new Set(sorted.map((s: any) => s.item?.id).filter(Boolean))];
                    const raw = JSON.parse(localStorage.getItem('heist_sim_pools_v1') || '{}');
                    const pools: Record<string, string[]> = raw.pools || {};
                    const current = pools[addToPoolId] || [];
                    pools[addToPoolId] = [...new Set([...current, ...uniqueIds])];
                    localStorage.setItem('heist_sim_pools_v1', JSON.stringify({ ...raw, pools }));
                  }}>
                  {t('表示をプールに追加')}
                </button>
              </div>
            )}
            </>
            ) : (() => {
              const poolRaw = (() => { try { return JSON.parse(localStorage.getItem('heist_sim_pools_v1') || '{}'); } catch { return {}; } })();
              const poolInfo = poolId && poolRaw.pools ? poolRaw.pools[poolId] : null;
              const poolItems = poolInfo?.itemIds ?? [];
              return (
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {poolItems.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 600, marginBottom: '2px' }}>{t('\u3053\u306e\u30d7\u30fc\u30eb\u306e\u767b\u9332\u30a2\u30a4\u30c6\u30e0')} ({poolItems.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                      {poolItems.map((iid: string) => {
                        const item = p.spawnApi.items.find((i: any) => i.id === iid);
                        const tc = item ? TEXTCOLOR_META[item.textColor as keyof typeof TEXTCOLOR_META] : null;
                        return (
                          <span key={iid} style={{ fontSize: '9px', padding: '1px 5px', background: tc ? `${tc.color}18` : 'rgba(255,255,255,0.05)', borderRadius: '3px', color: tc?.color || '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                            {item?.name || iid}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('\u3053\u306e\u30d7\u30fc\u30eb\u306b\u767b\u9332\u30a2\u30a4\u30c6\u30e0\u306a\u3057')}</div>
                )}
              </div>
              );
            })()}
            <div style={{ padding: '4px 16px 12px', borderTop: svMode === 'pool' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <button className="btn-cyber" style={{ width: '100%', fontSize: '11px', padding: '6px', clipPath: 'none' }}
                onClick={() => { p.setSpawnFocusTrigger({ x: pt.x, y: pt.y, ts: Date.now() }); p.setSpawnViewPointId(null); }}>
                {t('\u70b9\u3078\u79fb\u52d5')}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
  </>);
};

export default SpawnSidebar;
