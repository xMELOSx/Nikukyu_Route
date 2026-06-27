import React, { useState, useEffect, useRef } from 'react';
import { Play, Trash2, Sliders, Image as ImageIcon, Clipboard, Plus, Settings, Copy } from 'lucide-react';

interface OcrDebugModalProps {
  show: boolean;
  onClose: () => void;
}

export interface OcrRegion {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  thresholdEnabled: boolean;
  thresholdVal: number;
  invertEnabled: boolean;
  grayscaleEnabled: boolean;
  psm: string; // Tesseract Page Segmentation Mode
  whitelist: string; // Character whitelist (empty for none)
  result?: string;
}

interface OcrPreset {
  id: string;
  name: string;
  regions: OcrRegion[];
}



export function OcrDebugModal({ show, onClose }: OcrDebugModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Multiple OCR regions list
  const [regions, setRegions] = useState<OcrRegion[]>([
    {
      id: 'region_default_1',
      name: '獲得ファンス',
      x: 50,
      y: 50,
      w: 150,
      h: 40,
      scale: 2,
      thresholdEnabled: true,
      thresholdVal: 128,
      invertEnabled: false,
      grayscaleEnabled: true,
      psm: '7', // Single line
      whitelist: '0123456789$,.',
      result: ''
    }
  ]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>('region_default_1');

  // Status & Progress
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);

  // Presets of entire region configurations
  const [presets, setPresets] = useState<OcrPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [newPresetName, setNewPresetName] = useState<string>('');

  // 6-item target list builder state
  const [targetBuilderItems, setTargetBuilderItems] = useState<{ goalName: string; requiredQty: string; reward: string }[]>(() => {
    const saved = localStorage.getItem('heist_ocr_target_builder_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return Array.from({ length: 6 }, () => ({ goalName: '', requiredQty: '', reward: '' }));
  });

  // Auto-save target builder items
  useEffect(() => {
    localStorage.setItem('heist_ocr_target_builder_items', JSON.stringify(targetBuilderItems));
  }, [targetBuilderItems]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ 
    isDragging: boolean; 
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'new'; 
    startX: number; 
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    lockAxis: 'x' | 'y' | null;
  } | null>(null);

  // References to canvases for preview drawing
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({});

  // Active region getter/setter helper
  const activeRegion = regions.find(r => r.id === selectedRegionId) || regions[0] || null;

  const updateActiveRegion = (fields: Partial<OcrRegion>) => {
    if (!selectedRegionId) return;
    setRegions(prev => prev.map(r => r.id === selectedRegionId ? { ...r, ...fields } : r));
  };

  const applyFiltersToAllRegions = () => {
    if (!activeRegion) return;
    setRegions(prev => prev.map(r => ({
      ...r,
      scale: activeRegion.scale,
      thresholdEnabled: activeRegion.thresholdEnabled,
      thresholdVal: activeRegion.thresholdVal,
      invertEnabled: activeRegion.invertEnabled,
      grayscaleEnabled: activeRegion.grayscaleEnabled
    })));
  };

  const parseOcrGoal = (rawText: string) => {
    // Strip spaces and ®/©
    const clean = rawText.replace(/\s+/g, '').replace(/[®©]/g, '');
    let goalName = clean;
    if (clean.includes('を')) {
      goalName = clean.split('を')[0];
    }
    const numMatch = clean.match(/[\d,]+/);
    const requiredQty = numMatch ? numMatch[0] : '-';
    return { goalName, requiredQty };
  };

  const importOcrToSlots = (mode: 'ss1' | 'ss2') => {
    const sortedByY = [...regions].sort((a, b) => a.y - b.y);
    const rows: { textRegion: OcrRegion; rewardRegion: OcrRegion }[] = [];
    for (let i = 0; i < sortedByY.length; i += 2) {
      if (i + 1 < sortedByY.length) {
        const regA = sortedByY[i];
        const regB = sortedByY[i + 1];
        const [left, right] = regA.x < regB.x ? [regA, regB] : [regB, regA];
        rows.push({ textRegion: left, rewardRegion: right });
      }
    }

    setTargetBuilderItems(prev => {
      const next = [...prev];
      rows.forEach((row, idx) => {
        // Mode 'ss1': OCR rows 0-3 go to slots 0-3 (Items 1-4)
        // Mode 'ss2': OCR rows 0-3 go to slots 2-5 (Items 3-6)
        const targetIdx = mode === 'ss1' ? idx : idx + 2;
        if (targetIdx < 6) {
          const { goalName, requiredQty } = parseOcrGoal(row.textRegion.result || '');
          const reward = (row.rewardRegion.result || '').replace(/\s+/g, '').replace(/[®©]/g, '');
          next[targetIdx] = { goalName, requiredQty, reward };
        }
      });
      return next;
    });
  };

  // Load presets & default configuration on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem('heist_ocr_multi_presets');
    let parsed: OcrPreset[] = [];
    if (savedPresets) {
      try {
        parsed = JSON.parse(savedPresets);
      } catch (e) {
        console.error('Failed to parse multi OCR presets', e);
      }
    }
    
    // Filter out any system-injected garbage default presets to restore user's clean database
    const cleaned = parsed.filter(p => p.id !== 'ocr_preset_dadada_default' && p.id !== 'ocr_preset_dada_default');
    if (parsed.length !== cleaned.length) {
      localStorage.setItem('heist_ocr_multi_presets', JSON.stringify(cleaned));
    }
    setPresets(cleaned);

    const savedRegions = localStorage.getItem('heist_ocr_regions');
    if (savedRegions) {
      try {
        const parsedRegions = JSON.parse(savedRegions);
        if (parsedRegions.length > 0) {
          setRegions(parsedRegions);
          setSelectedRegionId(parsedRegions[0].id);
        }
      } catch (e) {
        console.error('Failed to parse saved OCR regions', e);
      }
    }
  }, []);

  // Auto-save regions on modification
  useEffect(() => {
    if (regions.length > 0) {
      localStorage.setItem('heist_ocr_regions', JSON.stringify(regions));
    }
  }, [regions]);

  // Handle clipboard paste
  useEffect(() => {
    if (!show) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setImageSrc(event.target.result as string);
                // Clear past results
                setRegions(prev => prev.map(r => ({ ...r, result: '' })));
                setOcrStatus('');
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
    };
  }, [show]);

  // Handle image load
  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    
    // Bounds check crop coordinates for all regions
    setRegions(prev => prev.map(r => {
      const x = Math.min(r.x, img.naturalWidth - 10);
      const y = Math.min(r.y, img.naturalHeight - 10);
      const w = Math.min(r.w, img.naturalWidth - x);
      const h = Math.min(r.h, img.naturalHeight - y);
      return { ...r, x, y, w, h };
    }));
  };

  // Perform Image Preprocessing on Preview Canvas for each region
  const drawRegionPreview = (r: OcrRegion) => {
    const canvas = canvasRefs.current[r.id];
    if (!canvas || !imageSrc || !imageRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    
    // Set preview canvas dimensions based on scaled crop size
    const w = Math.max(1, r.w);
    const h = Math.max(1, r.h);
    canvas.width = w * r.scale;
    canvas.height = h * r.scale;

    // Draw cropped region with scaling
    ctx.imageSmoothingEnabled = false; // Keep pixel edges sharp for OCR
    ctx.drawImage(
      img,
      r.x, r.y, w, h,
      0, 0, canvas.width, canvas.height
    );

    // Apply pixel filters
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        let red = data[i];
        let green = data[i + 1];
        let blue = data[i + 2];

        // Convert to grayscale
        if (r.grayscaleEnabled) {
          const v = 0.299 * red + 0.587 * green + 0.114 * blue;
          red = green = blue = v;
        }

        // Apply thresholding
        if (r.thresholdEnabled) {
          const v = (red + green + blue) / 3;
          const val = v >= r.thresholdVal ? 255 : 0;
          red = green = blue = val;
        }

        // Invert colors
        if (r.invertEnabled) {
          red = 255 - red;
          green = 255 - green;
          blue = 255 - blue;
        }

        data[i] = red;
        data[i + 1] = green;
        data[i + 2] = blue;
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.error('Filter processing failed', e);
    }
  };

  // Redraw previews when parameters or source image changes
  useEffect(() => {
    if (!imageSrc) return;
    regions.forEach(r => {
      drawRegionPreview(r);
    });
  }, [imageSrc, regions, imgSize]);

  // Load Tesseract.js and run OCR on all regions (Batch run)
  const runBatchOcr = async () => {
    if (!imageSrc) return;

    setOcrStatus('Tesseract.jsを読み込み中...');
    setOcrProgress(0.05);

    try {
      // Load Tesseract dynamically from CDN
      const Tesseract = await new Promise<any>((resolve, reject) => {
        if ((window as any).Tesseract) {
          resolve((window as any).Tesseract);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
        script.onload = () => resolve((window as any).Tesseract);
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });

      setOcrStatus('OCRエンジン初期化中...');
      setOcrProgress(0.1);

      // We'll initialize the worker
      const worker = await Tesseract.createWorker('eng+jpn', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            // Overall batch progress is computed based on active index
          }
        }
      });

      // Run OCR sequentially for each region
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const canvas = canvasRefs.current[region.id];
        if (!canvas) continue;

        setOcrStatus(`「${region.name}」認識中 (${i + 1}/${regions.length})...`);
        const stepProgressBase = 0.1 + (i / regions.length) * 0.85;
        setOcrProgress(stepProgressBase);

        // Adjust parameters on worker (always set both to avoid bleeding state from previous regions)
        await worker.setParameters({
          tessedit_char_whitelist: region.whitelist || '',
          tessedit_pageseg_mode: region.psm || '3'
        });

        const dataUrl = canvas.toDataURL('image/png');
        const { data: { text } } = await worker.recognize(dataUrl);

        // Trim result
        const cleanText = text ? text.trim() : '';
        setRegions(prev => prev.map(r => r.id === region.id ? { ...r, result: cleanText } : r));
      }

      setOcrStatus('一括認識完了');
      setOcrProgress(1);
      await worker.terminate();
    } catch (e) {
      console.error('OCR Batch recognition error', e);
      setOcrStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
      setOcrProgress(0);
    }
  };

  // Add a new OCR ROI region
  const addNewRegion = () => {
    const newId = `region_${Date.now()}`;
    const newR: OcrRegion = {
      id: newId,
      name: `認識エリア #${regions.length + 1}`,
      x: Math.max(10, Math.round(imgSize.w / 2 - 50) || 50),
      y: Math.max(10, Math.round(imgSize.h / 2 - 25) || 50),
      w: 120,
      h: 40,
      scale: 2,
      thresholdEnabled: true,
      thresholdVal: 128,
      invertEnabled: false,
      grayscaleEnabled: true,
      psm: '7',
      whitelist: '',
      result: ''
    };

    setRegions(prev => [...prev, newR]);
    setSelectedRegionId(newId);
  };

  // Remove a region
  const deleteRegion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (regions.length <= 1) return; // Keep at least one
    const updated = regions.filter(r => r.id !== id);
    setRegions(updated);
    if (selectedRegionId === id) {
      setSelectedRegionId(updated[0].id);
    }
  };

  // Duplicate a region with same dimensions and settings
  const duplicateRegion = (r: OcrRegion, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `region_${Date.now()}`;
    const newR: OcrRegion = {
      ...r,
      id: newId,
      name: `${r.name} (コピー)`,
      x: Math.min(imgSize.w - r.w, r.x + 15),
      y: Math.min(imgSize.h - r.h, r.y + 15),
      result: ''
    };
    setRegions(prev => [...prev, newR]);
    setSelectedRegionId(newId);
  };

  // Presets Management
  const savePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: OcrPreset = {
      id: `ocr_preset_${Date.now()}`,
      name: newPresetName.trim(),
      regions: regions.map(r => ({ ...r, result: '' })) // Clear results before save
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('heist_ocr_multi_presets', JSON.stringify(updated));
    setActivePresetId(newPreset.id);
    setNewPresetName('');
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('heist_ocr_multi_presets', JSON.stringify(updated));
    if (activePresetId === id) {
      setActivePresetId('');
    }
  };

  const applyPreset = (preset: OcrPreset) => {
    setActivePresetId(preset.id);
    if (preset.regions && preset.regions.length > 0) {
      setRegions(preset.regions);
      setSelectedRegionId(preset.regions[0].id);
    }
  };

  // Drag handles for ROI
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !activeRegion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Check if clicked close to crop corners of active region
    const grabDist = 8; // Smaller Grab tolerance for corner resize precision
    const isNear = (px: number, py: number) => {
      return Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2) < grabDist;
    };

    let dragType: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'new' | null = null;
    let clickedRegion: OcrRegion | undefined = undefined;
    
    // Check corners of selected region
    if (isNear(activeRegion.x, activeRegion.y)) dragType = 'nw';
    else if (isNear(activeRegion.x + activeRegion.w, activeRegion.y)) dragType = 'ne';
    else if (isNear(activeRegion.x + activeRegion.w, activeRegion.y + activeRegion.h)) dragType = 'se';
    else if (isNear(activeRegion.x, activeRegion.y + activeRegion.h)) dragType = 'sw';
    // Check body of selected region
    else if (mouseX >= activeRegion.x && mouseX <= activeRegion.x + activeRegion.w && mouseY >= activeRegion.y && mouseY <= activeRegion.y + activeRegion.h) {
      dragType = 'move';
    } else {
      // Clicked on a different region to select and move it?
      clickedRegion = regions.find(r => 
        mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h
      );
      if (clickedRegion) {
        setSelectedRegionId(clickedRegion.id);
        dragType = 'move';
      }
    }

    if (dragType) {
      // Find the currently selected region (it might have just changed if clickedRegion was found)
      const currentActive = regions.find(r => r.id === (clickedRegion ? clickedRegion.id : selectedRegionId)) || activeRegion;
      dragRef.current = {
        isDragging: true,
        type: dragType,
        startX: mouseX,
        startY: mouseY,
        initialX: currentActive.x,
        initialY: currentActive.y,
        initialW: currentActive.w,
        initialH: currentActive.h,
        lockAxis: null
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current || !dragRef.current.isDragging || !imageRef.current || !activeRegion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;

    const mouseX = Math.max(0, Math.min(imgSize.w, (e.clientX - rect.left) * scaleX));
    const mouseY = Math.max(0, Math.min(imgSize.h, (e.clientY - rect.top) * scaleY));

    const totalDx = mouseX - dragRef.current.startX;
    const totalDy = mouseY - dragRef.current.startY;

    let nextX = dragRef.current.initialX;
    let nextY = dragRef.current.initialY;
    let nextW = dragRef.current.initialW;
    let nextH = dragRef.current.initialH;

    if (dragRef.current.type === 'move') {
      let targetX = dragRef.current.initialX + totalDx;
      let targetY = dragRef.current.initialY + totalDy;

      if (e.shiftKey) {
        const dx = Math.abs(totalDx);
        const dy = Math.abs(totalDy);
        if (!dragRef.current.lockAxis) {
          if (dx > 5 || dy > 5) {
            dragRef.current.lockAxis = dx > dy ? 'x' : 'y';
          }
        }
        if (dragRef.current.lockAxis === 'x') {
          targetY = dragRef.current.initialY;
        } else if (dragRef.current.lockAxis === 'y') {
          targetX = dragRef.current.initialX;
        }
      } else {
        dragRef.current.lockAxis = null;
      }

      nextX = Math.max(0, Math.min(imgSize.w - dragRef.current.initialW, targetX));
      nextY = Math.max(0, Math.min(imgSize.h - dragRef.current.initialH, targetY));
    } else {
      // Corner resize relative to start coordinates
      if (dragRef.current.type === 'nw') {
        nextX = Math.min(dragRef.current.initialX + dragRef.current.initialW - 10, dragRef.current.initialX + totalDx);
        nextY = Math.min(dragRef.current.initialY + dragRef.current.initialH - 10, dragRef.current.initialY + totalDy);
        nextW = dragRef.current.initialW + (dragRef.current.initialX - nextX);
        nextH = dragRef.current.initialH + (dragRef.current.initialY - nextY);
      } else if (dragRef.current.type === 'ne') {
        nextY = Math.min(dragRef.current.initialY + dragRef.current.initialH - 10, dragRef.current.initialY + totalDy);
        nextW = Math.max(10, dragRef.current.initialW + totalDx);
        nextH = dragRef.current.initialH + (dragRef.current.initialY - nextY);
      } else if (dragRef.current.type === 'se') {
        nextW = Math.max(10, dragRef.current.initialW + totalDx);
        nextH = Math.max(10, dragRef.current.initialH + totalDy);
      } else if (dragRef.current.type === 'sw') {
        nextX = Math.min(dragRef.current.initialX + dragRef.current.initialW - 10, dragRef.current.initialX + totalDx);
        nextW = dragRef.current.initialW + (dragRef.current.initialX - nextX);
        nextH = Math.max(10, dragRef.current.initialH + totalDy);
      }
    }

    updateActiveRegion({
      x: Math.round(nextX),
      y: Math.round(nextY),
      w: Math.round(nextW),
      h: Math.round(nextH)
    });
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  if (!show) return null;

  // Preset Colors for different ROI frames
  const colors = ['#39ff14', '#00f0ff', '#ff00ff', '#ffe600', '#ff0055', '#ffffff'];

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 16, 0.95)',
      backdropFilter: 'blur(12px)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--cyan-neon, #00f0ff)',
      borderRadius: '8px',
      overflow: 'hidden',
      fontFamily: 'sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
        background: 'rgba(0, 240, 255, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} style={{ color: 'var(--cyan-neon, #00f0ff)' }} />
          <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--cyan-neon, #00f0ff)', letterSpacing: '1px' }}>
            マルチ領域OCR 調整＆一括テストベンチ
          </span>
        </div>
        <button className="btn-cyber danger" style={{ padding: '3px 12px', fontSize: '11px', clipPath: 'none' }} onClick={onClose}>
          ✕ テストベンチを閉じる
        </button>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', flex: 1, minHeight: 0 }}>
        
        {/* Controls Column */}
        <div style={{
          borderRight: '1px solid rgba(0, 240, 255, 0.15)',
          padding: '12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: 'rgba(10, 15, 28, 0.6)'
        }}>
          
          {/* Clipboard Source instructions */}
          <div className="panel-section" style={{ padding: '8px', border: '1px dashed rgba(0,240,255,0.4)', borderRadius: '6px', background: 'rgba(0,240,255,0.02)', textAlign: 'center' }}>
            <Clipboard size={18} style={{ color: 'var(--cyan-neon)', margin: '0 auto 4px', display: 'block' }} />
            <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>クリップボード画像貼り付け</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              画面をフォーカスし <strong>Ctrl+V</strong> で画像を貼り付け
            </div>
            <button className="btn-cyber" style={{ fontSize: '10px', padding: '3px 8px', marginTop: '6px', width: '100%' }} onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={10} style={{ marginRight: '4px' }} /> ファイルから選択
            </button>
            <input type="file" ref={fileInputRef} onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  if (event.target?.result) {
                    setImageSrc(event.target.result as string);
                    setRegions(prev => prev.map(r => ({ ...r, result: '' })));
                    setOcrStatus('');
                  }
                };
                reader.readAsDataURL(file);
              }
            }} accept="image/*" style={{ display: 'none' }} />
          </div>

          {/* Presets List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', justifyContent: 'space-between' }}>
              <span>配置レイアウトプリセット</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>全エリア一括保存</span>
            </div>
            {presets.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '80px', overflowY: 'auto', marginBottom: '6px' }}>
                {presets.map(p => (
                  <div key={p.id} 
                    onClick={() => applyPreset(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: `1px solid ${activePresetId === p.id ? 'var(--cyan-neon)' : 'rgba(255,255,255,0.1)'}`,
                      background: activePresetId === p.id ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.03)',
                      color: activePresetId === p.id ? 'var(--cyan-neon)' : 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    <span>{p.name}</span>
                    <Trash2 size={10} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={(e) => deletePreset(p.id, e)} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="text" className="input-cyber" style={{ fontSize: '10px', padding: '4px', flex: 1 }} placeholder="レイアウト名..." value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
              <button className="btn-cyber success" style={{ padding: '3px 8px', fontSize: '10px', clipPath: 'none' }} onClick={savePreset} disabled={!newPresetName.trim()}>
                保存
              </button>
            </div>
          </div>

          {/* OCR Regions Management */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)' }}>OCR対象領域リスト ({regions.length})</span>
              <button className="btn-cyber success" style={{ padding: '2px 6px', fontSize: '10px', clipPath: 'none' }} onClick={addNewRegion} disabled={!imageSrc}>
                <Plus size={10} style={{ marginRight: '2px' }} /> エリア追加
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
              {regions.map((r, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = r.id === selectedRegionId;
                return (
                  <div key={r.id}
                    onClick={() => setSelectedRegionId(r.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto auto',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${isSelected ? 'var(--cyan-neon)' : 'rgba(255,255,255,0.05)'}`,
                      borderLeft: `4px solid ${color}`,
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: isSelected ? 'var(--cyan-neon)' : '#fff' }}>
                      {isSelected ? '▶' : ''}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      {isSelected ? (
                        <input
                          type="text"
                          value={r.name}
                          onChange={(e) => updateActiveRegion({ name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid rgba(0, 240, 255, 0.4)',
                            color: 'var(--cyan-neon)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            padding: '0 0 2px 0',
                            outline: 'none',
                            width: '100%'
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      )}
                      {r.result && (
                        <span style={{ fontSize: '10px', color: '#39ff14', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          結果: {r.result}
                        </span>
                      )}
                    </div>
                    <button 
                      style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', cursor: 'pointer', padding: '2px 4px' }}
                      onClick={(e) => duplicateRegion(r, e)}
                      title="このエリアと同じ大きさで複製 (コピー)"
                    >
                      <Copy size={12} />
                    </button>
                    {regions.length > 1 && (
                      <button 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}
                        onClick={(e) => deleteRegion(r.id, e)}
                        title="このエリアを削除"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Region Parameter Editor */}
          {activeRegion && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '6px',
              border: '1px solid rgba(0, 240, 255, 0.15)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sliders size={12} />
                <span>「{activeRegion.name}」パラメータ設定</span>
              </div>

              {/* Coordinates Editor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <div>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)' }}>X座標 (px)</label>
                  <input type="number" className="input-cyber" style={{ padding: '2px 4px', fontSize: '10px', width: '100%' }} value={activeRegion.x} onChange={(e) => updateActiveRegion({ x: Math.max(0, parseInt(e.target.value) || 0) })} />
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Y座標 (px)</label>
                  <input type="number" className="input-cyber" style={{ padding: '2px 4px', fontSize: '10px', width: '100%' }} value={activeRegion.y} onChange={(e) => updateActiveRegion({ y: Math.max(0, parseInt(e.target.value) || 0) })} />
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)' }}>幅 (px)</label>
                  <input type="number" className="input-cyber" style={{ padding: '2px 4px', fontSize: '10px', width: '100%' }} value={activeRegion.w} onChange={(e) => updateActiveRegion({ w: Math.max(5, parseInt(e.target.value) || 5) })} />
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)' }}>高さ (px)</label>
                  <input type="number" className="input-cyber" style={{ padding: '2px 4px', fontSize: '10px', width: '100%' }} value={activeRegion.h} onChange={(e) => updateActiveRegion({ h: Math.max(5, parseInt(e.target.value) || 5) })} />
                </div>
              </div>

              {/* Precision settings (Page Seg Mode and Whitelist) */}
              <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.1)', paddingTop: '6px', marginTop: '2px' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--cyan-neon)', marginBottom: '4px' }}>認識精度チューニング</div>
                
                {/* Whitelist */}
                <div style={{ marginBottom: '4px' }}>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>文字ホワイトリスト (対象文字を絞る)</label>
                  <input 
                    type="text" 
                    className="input-cyber" 
                    style={{ padding: '2px 4px', fontSize: '10px', width: '100%' }} 
                    placeholder="例: 0123456789: (時間用)" 
                    value={activeRegion.whitelist} 
                    onChange={(e) => updateActiveRegion({ whitelist: e.target.value })} 
                  />
                  <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                    <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 3px' }} onClick={() => updateActiveRegion({ whitelist: '0123456789' })}>数字のみ</button>
                    <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 3px' }} onClick={() => updateActiveRegion({ whitelist: '0123456789:.' })}>数字+記号</button>
                    <button className="btn-cyber" style={{ fontSize: '8px', padding: '1px 3px' }} onClick={() => updateActiveRegion({ whitelist: '' })}>制限なし</button>
                  </div>
                </div>

                {/* PSM Mode Selection */}
                <div>
                  <label style={{ fontSize: '9px', color: 'var(--text-muted)' }}>ページ解析モード (PSM)</label>
                  <select 
                    style={{
                      background: '#0a0e18',
                      border: '1px solid rgba(0, 240, 255, 0.3)',
                      color: 'var(--cyan-neon)',
                      fontSize: '10px',
                      padding: '2px',
                      borderRadius: '4px',
                      width: '100%',
                      outline: 'none'
                    }}
                    value={activeRegion.psm}
                    onChange={(e) => updateActiveRegion({ psm: e.target.value })}
                  >
                    <option value="3">Auto (デフォルト)</option>
                    <option value="7">Single line (1行の文字列として扱う - 推奨)</option>
                    <option value="8">Single word (1単語として扱う)</option>
                    <option value="10">Single character (単一の文字として扱う)</option>
                  </select>
                </div>
              </div>

              {/* Preprocessing Toggles */}
              <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.1)', paddingTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                  <span>倍率スケーリング:</span>
                  <span style={{ color: 'var(--cyan-neon)', fontWeight: 'bold' }}>{activeRegion.scale}x</span>
                </div>
                <input type="range" min="1" max="4" step="1" value={activeRegion.scale} onChange={(e) => updateActiveRegion({ scale: parseInt(e.target.value) })} style={{ accentColor: 'var(--cyan-neon)', width: '100%', cursor: 'pointer' }} />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={activeRegion.grayscaleEnabled} onChange={(e) => updateActiveRegion({ grayscaleEnabled: e.target.checked })} style={{ accentColor: 'var(--cyan-neon)' }} />
                    <span>グレースケール変換</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={activeRegion.thresholdEnabled} onChange={(e) => updateActiveRegion({ thresholdEnabled: e.target.checked })} style={{ accentColor: 'var(--cyan-neon)' }} />
                    <span>二値化 (白黒ハッキリ化)</span>
                  </label>
                  {activeRegion.thresholdEnabled && (
                    <div style={{ paddingLeft: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)' }}>
                        <span>しきい値: {activeRegion.thresholdVal}</span>
                      </div>
                      <input type="range" min="10" max="240" step="5" value={activeRegion.thresholdVal} onChange={(e) => updateActiveRegion({ thresholdVal: parseInt(e.target.value) })} style={{ accentColor: 'var(--cyan-neon)', width: '100%', cursor: 'pointer' }} />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={activeRegion.invertEnabled} onChange={(e) => updateActiveRegion({ invertEnabled: e.target.checked })} style={{ accentColor: 'var(--cyan-neon)' }} />
                    <span>白黒反転</span>
                  </label>
                  <button 
                    type="button" 
                    className="btn-cyber" 
                    onClick={applyFiltersToAllRegions} 
                    style={{ width: '100%', fontSize: '9px', padding: '3px 4px', marginTop: '6px', borderColor: 'var(--yellow-neon, #ffe600)', color: 'var(--yellow-neon, #ffe600)', clipPath: 'none' }}
                    title="このエリアの倍率・白黒・二値化フィルター等の設定を他のすべてのエリアに適用します"
                  >
                    ⚡ この前処理設定を全エリアに適用
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Run Action Panel */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button className="btn-cyber success" style={{ width: '100%', padding: '8px', fontSize: '13px', fontWeight: 'bold' }} onClick={runBatchOcr} disabled={!imageSrc || !!ocrStatus.includes('読み込み中') || !!ocrStatus.includes('認識中')}>
              <Play size={13} style={{ marginRight: '4px' }} /> 全エリア一括 OCR実行
            </button>

            {/* Progress Bar */}
            {ocrStatus && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '5px', borderRadius: '4px', border: '1px solid rgba(0,240,255,0.1)' }}>
                <div style={{ fontSize: '10px', color: 'var(--cyan-neon)', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{ocrStatus}</span>
                  <span>{Math.round(ocrProgress * 100)}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${ocrProgress * 100}%`, background: 'var(--cyan-neon)', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
            
            {/* Formatted Output Area */}
            {regions.length >= 2 && (
              <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '8px', marginTop: '4px' }}>
                <label style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  📋 4行集計フォーマット結果
                </label>
                <textarea
                  className="textarea-cyber"
                  readOnly
                  value={(() => {
                    // Sort regions by Y coordinate
                    const sortedByY = [...regions].sort((a, b) => a.y - b.y);
                    const rows: { textRegion: OcrRegion; rewardRegion: OcrRegion }[] = [];
                    for (let i = 0; i < sortedByY.length; i += 2) {
                      if (i + 1 < sortedByY.length) {
                        const regA = sortedByY[i];
                        const regB = sortedByY[i + 1];
                        const [left, right] = regA.x < regB.x ? [regA, regB] : [regB, regA];
                        rows.push({ textRegion: left, rewardRegion: right });
                      }
                    }

                    return rows.map((row, idx) => {
                      const rawText = (row.textRegion.result || '').replace(/\s+/g, '');
                      let goalName = rawText;
                      if (rawText.includes('を')) {
                        goalName = rawText.split('を')[0];
                      }
                      
                      // Extract number from rawText as required qty
                      const numMatch = rawText.match(/[\d,]+/);
                      const requiredQty = numMatch ? numMatch[0] : '-';

                      const rewardText = (row.rewardRegion.result || '').replace(/\s+/g, '');

                      return `${goalName || `目標 #${idx + 1}`}　${requiredQty}　${rewardText || '-'}`;
                    }).join('\n');
                  })()}
                  style={{
                    fontSize: '10px',
                    height: '80px',
                    fontFamily: 'monospace',
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(0,0,0,0.4)',
                    borderColor: 'rgba(0,240,255,0.2)',
                    color: '#39ff14',
                    resize: 'none',
                    outline: 'none',
                    padding: '4px'
                  }}
                />
                <button
                  type="button"
                  className="btn-cyber success"
                  style={{ width: '100%', fontSize: '10px', padding: '3px', marginTop: '4px', clipPath: 'none' }}
                  onClick={() => {
                    const sortedByY = [...regions].sort((a, b) => a.y - b.y);
                    const rows: { textRegion: OcrRegion; rewardRegion: OcrRegion }[] = [];
                    for (let i = 0; i < sortedByY.length; i += 2) {
                      if (i + 1 < sortedByY.length) {
                        const regA = sortedByY[i];
                        const regB = sortedByY[i + 1];
                        const [left, right] = regA.x < regB.x ? [regA, regB] : [regB, regA];
                        rows.push({ textRegion: left, rewardRegion: right });
                      }
                    }
                    const text = rows.map((row, idx) => {
                      const rawText = (row.textRegion.result || '').replace(/\s+/g, '');
                      let goalName = rawText;
                      if (rawText.includes('を')) {
                        goalName = rawText.split('を')[0];
                      }
                      const numMatch = rawText.match(/[\d,]+/);
                      const requiredQty = numMatch ? numMatch[0] : '-';
                      const rewardText = (row.rewardRegion.result || '').replace(/\s+/g, '');
                      return `${goalName || `目標 #${idx + 1}`}　${requiredQty}　${rewardText || '-'}`;
                    }).join('\n');

                    navigator.clipboard.writeText(text);
                  }}
                >
                  結果をクリップボードにコピー
                </button>
              </div>
            )}

            {/* 6-Item Target Builder */}
            <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.25)', paddingTop: '10px', marginTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--cyan-neon)', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>📋 6項目目標追加ベンチ</span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>2枚のSSから6つの項目を合成</span>
              </div>
              
              {/* Slots Importers */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                <button 
                  type="button" 
                  className="btn-cyber" 
                  onClick={() => importOcrToSlots('ss1')} 
                  style={{ flex: 1, fontSize: '9px', padding: '3px', clipPath: 'none', borderColor: 'var(--cyan-neon)' }}
                  title="現在のOCR結果をスロット1〜4へ流し込みます"
                >
                  📥 OCR ➔ 1-4 (SS1枚目)
                </button>
                <button 
                  type="button" 
                  className="btn-cyber" 
                  onClick={() => importOcrToSlots('ss2')} 
                  style={{ flex: 1, fontSize: '9px', padding: '3px', clipPath: 'none', borderColor: 'var(--cyan-neon)' }}
                  title="現在のOCR結果をスロット3〜6へ流し込みます (重複3,4を自動上書き)"
                >
                  📥 OCR ➔ 3-6 (SS2枚目)
                </button>
              </div>

              {/* 6 Slots Editors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                {targetBuilderItems.map((item, idx) => (
                  <div key={`slot_${idx}`} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', width: '12px' }}>{idx + 1}</span>
                    <input 
                      type="text" 
                      className="input-cyber" 
                      placeholder="目標名" 
                      style={{ flex: 2, fontSize: '10px', padding: '2px 4px', minWidth: 0 }} 
                      value={item.goalName} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setTargetBuilderItems(prev => prev.map((itm, i) => i === idx ? { ...itm, goalName: val } : itm));
                      }}
                    />
                    <input 
                      type="text" 
                      className="input-cyber" 
                      placeholder="必要数" 
                      style={{ flex: 1, fontSize: '10px', padding: '2px 4px', minWidth: 0 }} 
                      value={item.requiredQty} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setTargetBuilderItems(prev => prev.map((itm, i) => i === idx ? { ...itm, requiredQty: val } : itm));
                      }}
                    />
                    <input 
                      type="text" 
                      className="input-cyber" 
                      placeholder="報酬" 
                      style={{ flex: 1, fontSize: '10px', padding: '2px 4px', minWidth: 0 }} 
                      value={item.reward} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setTargetBuilderItems(prev => prev.map((itm, i) => i === idx ? { ...itm, reward: val } : itm));
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Combined Output */}
              <div>
                <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>合成テキスト出力結果 (全角スペース区切り)</label>
                <textarea
                  className="textarea-cyber"
                  readOnly
                  value={targetBuilderItems.map(itm => {
                    const cleanName = (itm.goalName || '').replace(/[®©]/g, '');
                    const cleanQty = (itm.requiredQty || '').replace(/[®©]/g, '');
                    const cleanReward = (itm.reward || '').replace(/[®©]/g, '');
                    return `${cleanName || '-'}　${cleanQty || '-'}　${cleanReward || '-'}`;
                  }).join('\n')}
                  style={{
                    fontSize: '10px',
                    height: '80px',
                    fontFamily: 'monospace',
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(0,0,0,0.4)',
                    borderColor: 'rgba(0,240,255,0.2)',
                    color: '#39ff14',
                    resize: 'none',
                    outline: 'none',
                    padding: '4px'
                  }}
                />
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn-cyber success"
                    style={{ flex: 2, fontSize: '10px', padding: '4px', clipPath: 'none' }}
                    onClick={() => {
                      const text = targetBuilderItems.map(itm => {
                        const cleanName = (itm.goalName || '').replace(/[®©]/g, '');
                        const cleanQty = (itm.requiredQty || '').replace(/[®©]/g, '');
                        const cleanReward = (itm.reward || '').replace(/[®©]/g, '');
                        return `${cleanName || '-'}　${cleanQty || '-'}　${cleanReward || '-'}`;
                      }).join('\n');
                      navigator.clipboard.writeText(text);
                    }}
                  >
                    6行結果をコピー
                  </button>
                  <button
                    type="button"
                    className="btn-cyber danger"
                    style={{ flex: 1, fontSize: '10px', padding: '4px', clipPath: 'none' }}
                    onClick={() => {
                      setTargetBuilderItems(Array.from({ length: 6 }, () => ({ goalName: '', requiredQty: '', reward: '' })));
                    }}
                  >
                    クリア
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Column (Image & Multi ROI view) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '12px',
          minHeight: 0,
          background: '#04060b'
        }}>
          
          {/* Top Info Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>画像解像度: {imageSrc ? `${imgSize.w} x ${imgSize.h} px` : '画像なし'}</span>
            {imageSrc && <span>※ エリアをドラッグして位置調整、四隅をドラッグして範囲変更ができます</span>}
          </div>

          {/* Image & ROI Editor Canvas */}
          <div style={{
            flex: 1,
            position: 'relative',
            border: '1px solid rgba(0, 240, 255, 0.1)',
            borderRadius: '6px',
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            userSelect: 'none'
          }}>
            {imageSrc ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                overflow: 'hidden'
              }}>
                <div 
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{
                    position: 'relative',
                    cursor: 'crosshair',
                    display: 'inline-block'
                  }}
                >
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    onLoad={handleImageLoaded}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '65vh',
                      objectFit: 'contain',
                      pointerEvents: 'none'
                    }}
                    alt="OCR Target Source"
                  />

                {/* Render all ROI Overlays */}
                {imgSize.w > 0 && imageRef.current && (
                  regions.map((r, idx) => {
                    const imgEl = imageRef.current!;
                    const containerWidth = imgEl.clientWidth;
                    const containerHeight = imgEl.clientHeight;
                    
                    const ratioX = containerWidth / imgSize.w;
                    const ratioY = containerHeight / imgSize.h;

                    const boxLeft = r.x * ratioX;
                    const boxTop = r.y * ratioY;
                    const boxWidth = r.w * ratioX;
                    const boxHeight = r.h * ratioY;

                    const isSelected = r.id === selectedRegionId;
                    const color = colors[idx % colors.length];

                    return (
                      <div key={r.id} style={{
                        position: 'absolute',
                        left: `${boxLeft}px`,
                        top: `${boxTop}px`,
                        width: `${boxWidth}px`,
                        height: `${boxHeight}px`,
                        border: `2px ${isSelected ? 'solid' : 'dashed'} ${color}`,
                        boxShadow: isSelected ? `0 0 10px ${color}, inset 0 0 4px ${color}` : 'none',
                        background: isSelected ? 'rgba(255,255,255,0.03)' : 'rgba(0, 0, 0, 0.2)',
                        pointerEvents: 'none',
                        transition: 'border-color 0.15s, box-shadow 0.15s'
                      }}>
                        {/* Crop label */}
                        <div style={{
                          position: 'absolute',
                          top: '-18px',
                          left: '-2px',
                          background: color,
                          color: '#000',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          padding: '1px 4px',
                          borderRadius: '2px 2px 0 0',
                          whiteSpace: 'nowrap',
                          zIndex: isSelected ? 10 : 1
                        }}>
                          {r.name} [{r.w}x{r.h}]
                        </div>

                        {/* Corner markers on selected region only */}
                        {isSelected && (
                          <>
                            <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', background: color, borderRadius: '50%' }} />
                            <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: color, borderRadius: '50%' }} />
                            <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', background: color, borderRadius: '50%' }} />
                            <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', background: color, borderRadius: '50%' }} />
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Clipboard size={32} style={{ color: 'rgba(0,240,255,0.2)' }} />
                <span>クリップボードから画像をペーストするか、ファイルを読み込んでください</span>
                <span style={{ fontSize: '10px', opacity: 0.6 }}>Chrome / Edge 等でスクリーンショットを撮って Ctrl+V するのが便利です</span>
              </div>
            )}
          </div>

          {/* Bottom Preprocessing Preview Panel for all regions */}
          {imageSrc && (
            <div style={{
              height: '150px',
              marginTop: '10px',
              borderTop: '1px solid rgba(0, 240, 255, 0.15)',
              paddingTop: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: 'bold' }}>
                前処理済み画像プレビュー (選択エリアの現在の前処理状態を表示)
              </div>
              <div 
                className="ocr-previews-container"
                style={{
                  flex: 1,
                  display: 'flex',
                  gap: '12px',
                  overflowX: 'auto',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '6px',
                  borderRadius: '6px'
                }}
              >
                <style>{`
                  .ocr-previews-container::-webkit-scrollbar {
                    height: 8px !important;
                    display: block !important;
                  }
                  .ocr-previews-container::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.3) !important;
                    border-radius: 4px;
                  }
                  .ocr-previews-container::-webkit-scrollbar-thumb {
                    background: var(--cyan-neon, #00f0ff) !important;
                    border-radius: 4px;
                  }
                `}</style>
                {regions.map((r, idx) => {
                  const color = colors[idx % colors.length];
                  const isSelected = r.id === selectedRegionId;
                  return (
                    <div key={r.id} 
                      onClick={() => setSelectedRegionId(r.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        border: `1px solid ${isSelected ? color : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '4px',
                        background: 'rgba(0,0,0,0.8)',
                        padding: '4px',
                        minWidth: '160px',
                        maxWidth: '240px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: color, marginBottom: '2px', fontWeight: 'bold' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span>{r.scale}x</span>
                      </div>
                      
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        background: '#000',
                        borderRadius: '2px'
                      }}>
                        <canvas 
                          ref={(el) => { canvasRefs.current[r.id] = el; }}
                          style={{
                            maxHeight: '100%',
                            maxWidth: '100%',
                            imageRendering: 'pixelated',
                            objectFit: 'contain'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
