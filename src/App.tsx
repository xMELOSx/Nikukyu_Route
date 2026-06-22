import React, { useState, useEffect, useRef } from 'react';
import { MapCanvas } from './components/MapCanvas';
import { 
  type FloorType, 
  type MarkerType, 
  type DrawingStroke, 
  type HeistMarker, 
  type RouteData, 
  DEFAULT_ROUTE, 
  MARKER_META, 
  DataManager 
} from './utils/DataManager';
import { 
  Save, 
  Download, 
  Upload, 
  Image as ImageIcon, 
  Eraser, 
  Paintbrush, 
  Move,
  RotateCcw
} from 'lucide-react';

export default function App() {
  // Global State: Current Active Heist Plan
  const [route, setRoute] = useState<RouteData>(DEFAULT_ROUTE());
  const currentFloor: FloorType = 'main';

  // Shared Global Markers state (cameras, guards, etc. persisting across plans)
  const [globalMarkers, setGlobalMarkers] = useState<HeistMarker[]>([]);

  // Presentation / View Mode toggle state
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [showMarkerLabels, setShowMarkerLabels] = useState<boolean>(() => {
    const saved = localStorage.getItem('heist_show_labels');
    return saved !== null ? saved === 'true' : true;
  });

  const handleBossCustomDurationChange = (markerId: string, duration: number | undefined) => {
    setRoute(prev => {
      const nextDurations = { ...(prev.bossCustomDurations || {}) };
      if (duration === undefined) {
        delete nextDurations[markerId];
      } else {
        nextDurations[markerId] = duration;
      }
      return {
        ...prev,
        bossCustomDurations: nextDurations
      };
    });
  };

  // Tool Configurations
  const [toolMode, setToolMode] = useState<'select' | 'draw' | 'erase' | 'pan' | 'add-marker'>('draw');
  const [activeMarkerType, setActiveMarkerType] = useState<MarkerType | null>('start');
  
  // Brush Configurations
  const [strokeColor, setStrokeColor] = useState('#ff0055'); // default red neon for route
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokeType, setStrokeType] = useState<'solid' | 'dashed' | 'arrow'>('arrow');

  // App UI lists
  const [saves, setSaves] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const [svgString, setSvgString] = useState<string>('');

  // Smooth scroll room focus state
  const [focusTrigger, setFocusTrigger] = useState<{ id: string; timestamp: number } | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  // Load Saved list and Global Markers on start
  useEffect(() => {
    refreshSavesList();
    const savedGlobal = localStorage.getItem('heist_global_markers');
    if (savedGlobal) {
      try {
        const parsed: HeistMarker[] = JSON.parse(savedGlobal);
        const migrated = parsed.map(m => {
          if (m.type === 'boss') {
            const updated = { ...m };
            if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
            if (updated.bossDrops === undefined) updated.bossDrops = [];
            return updated;
          }
          return m;
        });
        setGlobalMarkers(migrated);
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Keyboard shortcut listener for EDIT/VIEW toggling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'v' || e.key === 'V') {
        setIsEditMode(prev => {
          const next = !prev;
          if (next === false) {
            setToolMode('pan');
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const refreshSavesList = () => {
    setSaves(DataManager.getSavesList().sort((a, b) => b.updatedAt - a.updatedAt));
  };

  // State Sync wrappers
  const updateStrokes = (newStrokes: DrawingStroke[]) => {
    setRoute(prev => ({
      ...prev,
      strokes: {
        ...prev.strokes,
        [currentFloor]: newStrokes
      }
    }));
  };

  const updateMarkers = (newMarkers: HeistMarker[]) => {
    const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'p4'].includes(type);
    const newGlobal = newMarkers.filter(m => !isIndiv(m.type));
    const newIndividual = newMarkers.filter(m => isIndiv(m.type));

    setGlobalMarkers(newGlobal);
    localStorage.setItem('heist_global_markers', JSON.stringify(newGlobal));

    setRoute(prev => ({
      ...prev,
      markers: newIndividual
    }));
  };

  // Clear current floor Canvas & Markers
  const clearCurrentFloor = () => {
    if (window.confirm(`Clear all drawings and markers?`)) {
      setRoute(prev => ({
        ...prev,
        strokes: {
          main: []
        },
        markers: []
      }));
    }
  };

  // Local Storage actions
  const handleSaveToLocal = () => {
    DataManager.saveToLocalStorage(route);
    refreshSavesList();
    alert(`Successfully saved: ${route.title}`);
  };

  const handleLoadFromLocal = (id: string) => {
    const data = DataManager.loadFromLocalStorage(id);
    if (data) {
      // Compatibility migrations
      if (data.strokes && !data.strokes.main) {
        const merged: DrawingStroke[] = [];
        Object.keys(data.strokes).forEach(key => {
          const keyStrokes = (data.strokes as any)[key];
          if (Array.isArray(keyStrokes)) merged.push(...keyStrokes);
        });
        data.strokes = { main: merged };
      }
      if (data.markers) {
        const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'p4'].includes(type);
        const planIndiv = data.markers.filter(m => isIndiv(m.type)).map(m => {
          const updated = { ...m, floor: 'main' as FloorType };
          if (updated.type === 'boss') {
            if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
            if (updated.bossDrops === undefined) updated.bossDrops = [];
          }
          return updated;
        });
        const planGlobal = data.markers.filter(m => !isIndiv(m.type)).map(m => {
          const updated = { ...m, floor: 'main' as FloorType };
          if (updated.type === 'boss') {
            if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
            if (updated.bossDrops === undefined) updated.bossDrops = [];
          }
          return updated;
        });

        // Merge global markers from loaded plan without duplicating existing ones
        if (planGlobal.length > 0) {
          setGlobalMarkers(prev => {
            const merged = [...prev];
            planGlobal.forEach(pm => {
              if (!merged.some(m => m.id === pm.id)) {
                merged.push(pm);
              }
            });
            localStorage.setItem('heist_global_markers', JSON.stringify(merged));
            return merged;
          });
        }
        data.markers = planIndiv;
      }
      if (!data.customBg || !data.customBg.main) {
        data.customBg = { main: null };
      }
      if (!data.bossCustomDurations) {
        data.bossCustomDurations = {};
      }
      setRoute(data);
      alert(`Loaded plan: ${data.title}`);
    }
  };

  const handleDeleteFromLocal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this route plan?')) {
      DataManager.deleteFromLocalStorage(id);
      refreshSavesList();
      if (route.id === id) {
        setRoute(DEFAULT_ROUTE(id));
      }
    }
  };

  const createNewPlan = () => {
    if (window.confirm('Create a new route plan? Unsaved changes will be lost.')) {
      setRoute(DEFAULT_ROUTE(`route_${Date.now()}`));
    }
  };

  // JSON Import / Export
  const handleExportJSON = () => {
    DataManager.exportToJSON(route);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string) as RouteData;
        if (importedData.strokes && importedData.markers) {
          // Normalize structure in case of older structure
          if (!importedData.strokes.main) {
            const merged: DrawingStroke[] = [];
            Object.keys(importedData.strokes).forEach(key => {
              const keyStrokes = (importedData.strokes as any)[key];
              if (Array.isArray(keyStrokes)) merged.push(...keyStrokes);
            });
            importedData.strokes = { main: merged };
          }
          
          const isIndiv = (type: string) => ['p1', 'p2', 'p3', 'p4'].includes(type);
          const planIndiv = importedData.markers.filter(m => isIndiv(m.type)).map(m => {
            const updated = { ...m, floor: 'main' as FloorType };
            if (updated.type === 'boss') {
              if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
              if (updated.bossDrops === undefined) updated.bossDrops = [];
            }
            return updated;
          });
          const planGlobal = importedData.markers.filter(m => !isIndiv(m.type)).map(m => {
            const updated = { ...m, floor: 'main' as FloorType };
            if (updated.type === 'boss') {
              if (updated.bossDurationSeconds === undefined) updated.bossDurationSeconds = 60;
              if (updated.bossDrops === undefined) updated.bossDrops = [];
            }
            return updated;
          });

          if (planGlobal.length > 0) {
            setGlobalMarkers(prev => {
              const merged = [...prev];
              planGlobal.forEach(pm => {
                if (!merged.some(m => m.id === pm.id)) {
                  merged.push(pm);
                }
              });
              localStorage.setItem('heist_global_markers', JSON.stringify(merged));
              return merged;
            });
          }

          importedData.markers = planIndiv;

          if (!importedData.customBg) {
            importedData.customBg = { main: null };
          } else if (!importedData.customBg.main) {
            importedData.customBg = { main: null };
          }
          if (!importedData.bossCustomDurations) {
            importedData.bossCustomDurations = {};
          }
          setRoute(importedData);
          alert(`Imported successfully: ${importedData.title}`);
        } else {
          alert('Invalid JSON file format.');
        }
      } catch (err) {
        alert('Failed to read the JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Custom Background Image upload
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setRoute(prev => ({
        ...prev,
        customBg: {
          main: dataUrl
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeCustomBg = () => {
    setRoute(prev => ({
      ...prev,
      customBg: {
        main: null
      }
    }));
  };

  // PNG Export
  const handleExportPNG = () => {
    const routeForExport = {
      ...route,
      markers: [...globalMarkers, ...route.markers]
    };
    DataManager.exportToPNG(
      currentFloor,
      routeForExport,
      svgString,
      canvasRef.current,
      (dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${route.title.replace(/\s+/g, '_')}_full_map.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    );
  };

  // Brush Preset Helper
  const setBrushPreset = (color: string, width: number, type: 'solid' | 'dashed' | 'arrow') => {
    setToolMode('draw');
    setStrokeColor(color);
    setStrokeWidth(width);
    setStrokeType(type);
  };

  // Count elements
  const currentStrokesCount = route.strokes[currentFloor]?.length || 0;
  const currentMarkersCount = globalMarkers.length + route.markers.length;

  return (
    <div className="app-container">
      {/* Top Application Header */}
      <header className="app-header glass-panel">
        <div className="app-title">
          <span>🐾</span> NIKUKYU HEIST ROUTE PLANNER
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Label Visibility Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', marginRight: '5px' }}>
            <input 
              type="checkbox"
              checked={showMarkerLabels}
              onChange={(e) => {
                setShowMarkerLabels(e.target.checked);
                localStorage.setItem('heist_show_labels', String(e.target.checked));
              }}
              style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
            />
            🏷️ ラベル表示
          </label>

          {/* Edit / View Presentation Toggle */}
          <button 
            className={`btn-cyber ${isEditMode ? 'active' : 'success'}`} 
            onClick={() => {
              setIsEditMode(!isEditMode);
              if (isEditMode) {
                setToolMode('pan'); // Auto switch to pan tool when switching to presentation
              }
            }}
            style={{ minWidth: '150px' }}
          >
            {isEditMode ? '⚙ EDIT MODE' : '👁 PRESENTATION'}
          </button>

          <button className="btn-cyber success" onClick={handleSaveToLocal} title="Save to local browser storage">
            <Save size={16} /> Save Plan
          </button>
          <button className="btn-cyber" onClick={handleExportJSON} title="Download plan as JSON">
            <Download size={16} /> Export JSON
          </button>
          <button className="btn-cyber" onClick={() => jsonFileInputRef.current?.click()} title="Upload plan from JSON">
            <Upload size={16} /> Import JSON
          </button>
          <input 
            type="file" 
            ref={jsonFileInputRef} 
            onChange={handleImportJSON} 
            accept=".json" 
            style={{ display: 'none' }} 
            id="json-file-input"
          />
          <button className="btn-cyber success" onClick={handleExportPNG} title="Save map drawing as PNG Image">
            <ImageIcon size={16} /> Save Map Image
          </button>
          <button className="btn-cyber danger" onClick={createNewPlan} title="Create clean sheet">
            New Plan
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="main-content">
        {/* Left Control Panel: Rooms Quick Pan & Drawing/Markers */}
        <section className="sidebar glass-panel">
          {/* Segmented Mode Selector Toggle */}
          <div className="panel-section" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'rgba(5, 7, 10, 0.6)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button
                className={`btn-cyber ${isEditMode ? 'active' : ''}`}
                style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                onClick={() => {
                  setIsEditMode(true);
                }}
              >
                ⚙ EDIT
              </button>
              <button
                className={`btn-cyber ${!isEditMode ? 'active success' : ''}`}
                style={{ padding: '6px 0', fontSize: '12px', clipPath: 'none' }}
                onClick={() => {
                  setIsEditMode(false);
                  setToolMode('pan'); // Auto switch to pan tool when entering presentation mode
                }}
              >
                👁 PRESENT
              </button>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
              Hotkey: Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>V</kbd> or <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>P</kbd> to toggle instantly.
            </div>
          </div>

          {/* Rooms and Zones List */}
          <div className="panel-section">
            <div className="panel-title">1. ROOMS & ZONES (QUICK PAN)</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Click to focus room. Set scroll targets on map.
            </div>
            
            <div className="saves-list" style={{ maxHeight: '175px' }}>
              {globalMarkers.filter(m => m.type === 'room').length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No room markers placed. Select 🚪 in markers below and click map to place.
                </div>
              ) : (
                globalMarkers
                  .filter(m => m.type === 'room')
                  .map(m => {
                    const meta = MARKER_META[m.type];
                    return (
                      <div
                        key={m.id}
                        className="save-item"
                        onClick={() => setFocusTrigger({ id: m.id, timestamp: Date.now() })}
                      >
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                          <strong>{meta.emoji} {m.note.trim() ? m.note : `${meta.label} #${m.id.substring(m.id.length - 4)}`}</strong>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--cyan-neon)' }}>Go ➔</span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Conditional panels based on Mode selection */}
          {!isEditMode ? (
            <div className="panel-section glass-panel-glow" style={{ padding: '15px', borderRadius: '4px', borderLeft: '3px solid var(--green-neon)', background: 'rgba(57, 255, 20, 0.03)' }}>
              <div style={{ fontWeight: 700, color: 'var(--green-neon)', fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
                👁 PRESENTATION MODE
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                Blueprint drawings and markers are locked. Select registered rooms in the list above to pan and showcase route specifics.
              </div>
            </div>
          ) : (
            <>
              <div className="panel-section">
                <div className="panel-title">2. TOOL MODE</div>
                <div className="tool-grid">
                  <button 
                    className={`tool-btn ${toolMode === 'draw' ? 'active' : ''}`}
                    onClick={() => setToolMode('draw')}
                    id="tool-draw-btn"
                  >
                    <Paintbrush size={18} />
                    <span>Draw Line</span>
                  </button>
                  <button 
                    className={`tool-btn ${toolMode === 'erase' ? 'active' : ''}`}
                    onClick={() => setToolMode('erase')}
                    id="tool-erase-btn"
                  >
                    <Eraser size={18} />
                    <span>Eraser</span>
                  </button>
                  <button 
                    className={`tool-btn ${toolMode === 'pan' ? 'active' : ''}`}
                    onClick={() => setToolMode('pan')}
                    id="tool-pan-btn"
                  >
                    <Move size={18} />
                    <span>Pan Map</span>
                  </button>
                  <button 
                    className="tool-btn"
                    onClick={clearCurrentFloor}
                    id="tool-reset-btn"
                  >
                    <RotateCcw size={18} />
                    <span>Reset Map</span>
                  </button>
                </div>
              </div>

              {toolMode === 'draw' && (
                <div className="panel-section">
                  <div className="panel-title">3. BRUSH CONFIG</div>
                  
                  {/* Presets */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <button 
                      className="btn-cyber" 
                      style={{ padding: '3px 6px', fontSize: '10px' }} 
                      onClick={() => setBrushPreset('#ffe600', 3, 'dashed')}
                    >
                      Patrol Path
                    </button>
                    <button 
                      className="btn-cyber danger" 
                      style={{ padding: '3px 6px', fontSize: '10px' }} 
                      onClick={() => setBrushPreset('#ff0055', 4, 'arrow')}
                    >
                      Heist Route
                    </button>
                    <button 
                      className="btn-cyber success" 
                      style={{ padding: '3px 6px', fontSize: '10px' }} 
                      onClick={() => setBrushPreset('#39ff14', 3, 'solid')}
                    >
                      Safety Run
                    </button>
                  </div>

                  {/* Color dots */}
                  <div className="color-picker">
                    {['#ff0055', '#ffe600', '#39ff14', '#00f0ff', '#ff00ff', '#ffffff'].map(c => (
                      <div
                        key={c}
                        className={`color-dot ${strokeColor === c ? 'active' : ''}`}
                        style={{ backgroundColor: c, color: c }}
                        onClick={() => setStrokeColor(c)}
                      />
                    ))}
                  </div>

                  {/* Line Type */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {(['solid', 'dashed', 'arrow'] as const).map(t => (
                      <button
                        key={t}
                        className={`btn-cyber ${strokeType === t ? 'active' : ''}`}
                        style={{ flex: 1, padding: '4px 2px', fontSize: '11px' }}
                        onClick={() => setStrokeType(t)}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {/* Width Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Brush Width: {strokeWidth}px</span>
                    <input 
                      type="range" 
                      min="2" 
                      max="12" 
                      value={strokeWidth} 
                      onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                      style={{ accentColor: 'var(--cyan-neon)', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              )}

              <div className="panel-section">
                <div className="panel-title">4. MAP MARKERS (GLOBAL)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Shared across all plans.
                </div>
                
                <div className="marker-list">
                  {(['start', 'goal', 'camera', 'guard', 'vault', 'boss', 'phone', 'note', 'room', 'warp', 'stairs', 'info'] as MarkerType[]).map(t => {
                    const meta = MARKER_META[t];
                    return (
                      <button
                        key={t}
                        className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                        onClick={() => {
                          setToolMode('add-marker');
                          setActiveMarkerType(t);
                        }}
                        style={{ '--theme-color': meta.color } as React.CSSProperties}
                      >
                        <span className="marker-icon-preview">{meta.emoji}</span>
                        <span>{meta.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="panel-section">
                <div className="panel-title">5. MAP MARKERS (INDIVIDUAL)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Saved only in this plan.
                </div>
                
                <div className="marker-list">
                  {(['p1', 'p2', 'p3', 'p4'] as MarkerType[]).map(t => {
                    const meta = MARKER_META[t];
                    return (
                      <button
                        key={t}
                        className={`marker-item ${toolMode === 'add-marker' && activeMarkerType === t ? 'active' : ''}`}
                        onClick={() => {
                          setToolMode('add-marker');
                          setActiveMarkerType(t);
                        }}
                        style={{ '--theme-color': meta.color } as React.CSSProperties}
                      >
                        <span className="marker-icon-preview">{meta.emoji}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Escape Phone Controls - visible in both modes */}
          {(() => {
            const allPhones = globalMarkers.filter(m => m.type === 'phone');
            const activeCount = allPhones.filter(m => m.phoneActive).length;
            const lockedCount = allPhones.filter(m => m.phoneLocked).length;
            if (allPhones.length === 0) return null;
            return (
              <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 0, 255, 0.1)', paddingTop: '10px' }}>
                <div className="panel-title">📞 ESCAPE PHONES</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {activeCount}/{allPhones.length} active{lockedCount > 0 ? ` (${lockedCount} locked)` : ''}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn-cyber"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      // Reset: set all non-locked phones to inactive
                      const updated = globalMarkers.map(m =>
                        m.type === 'phone' && !m.phoneLocked
                          ? { ...m, phoneActive: false }
                          : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    ☎ Reset All
                  </button>
                  <button
                    className="btn-cyber success"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      // Random 5: activate 5 random non-locked phones
                      const unlocked = globalMarkers
                        .map((m, i) => ({ m, i }))
                        .filter(({ m }) => m.type === 'phone' && !m.phoneLocked);
                      // Shuffle and pick up to 5
                      const shuffled = [...unlocked].sort(() => Math.random() - 0.5);
                      const toActivate = new Set(shuffled.slice(0, 5).map(({ i }) => i));
                      const updated = globalMarkers.map((m, i) => {
                        if (m.type === 'phone' && !m.phoneLocked) {
                          return { ...m, phoneActive: toActivate.has(i) };
                        }
                        return m;
                      });
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    📞 Random 5
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Info Pin Bulk Controls - visible in both modes */}
          {(() => {
            const allInfos = globalMarkers.filter(m => m.type === 'info');
            if (allInfos.length === 0) return null;
            return (
              <div className="panel-section" style={{ borderTop: '1px solid rgba(79, 195, 247, 0.15)', paddingTop: '10px' }}>
                <div className="panel-title">ℹ️ INFO PINS</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {allInfos.filter(m => m.infoExpanded).length}/{allInfos.length} open
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn-cyber success"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const updated = globalMarkers.map(m =>
                        m.type === 'info' ? { ...m, infoExpanded: true } : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    すべて開く
                  </button>
                  <button
                    className="btn-cyber danger"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const updated = globalMarkers.map(m =>
                        m.type === 'info' ? { ...m, infoExpanded: false } : m
                      );
                      setGlobalMarkers(updated);
                      localStorage.setItem('heist_global_markers', JSON.stringify(updated));
                    }}
                  >
                    全て閉じる
                  </button>
                </div>
              </div>
            );
          })()}


          <div style={{ marginTop: 'auto', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
            <div>🐾 Map Stats:</div>
            <div>• Drawing lines: {currentStrokesCount}</div>
            <div>• Markers & notes: {currentMarkersCount}</div>
          </div>
        </section>

        {/* Center Canvas Workspace */}
        <section className="canvas-area">
          <MapCanvas
            floor={currentFloor}
            strokes={route.strokes[currentFloor]}
            markers={[...globalMarkers, ...route.markers]}
            customBg={route.customBg[currentFloor]}
            toolMode={toolMode}
            activeMarkerType={activeMarkerType}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            strokeType={strokeType}
            onStrokesChange={updateStrokes}
            onMarkersChange={updateMarkers}
            onSvgStringReady={setSvgString}
            canvasRef={canvasRef}
            focusTrigger={focusTrigger}
            onClearFocusTrigger={() => setFocusTrigger(null)}
            isEditMode={isEditMode}
            showMarkerLabels={showMarkerLabels}
            bossCustomDurations={route.bossCustomDurations}
            onBossCustomDurationChange={handleBossCustomDurationChange}
          />
        </section>

        {/* Right Sidebar: Plan Profiles & Local Storage Saves */}
        <section className="sidebar-right glass-panel">
          <div className="panel-section">
            <div className="panel-title">ROUTE PROFILE</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>PLAN NAME</label>
              <input
                type="text"
                className="input-cyber"
                value={route.title}
                onChange={(e) => setRoute({ ...route, title: e.target.value.toUpperCase() })}
                disabled={!isEditMode}
              />
              
              <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700, marginTop: '4px' }}>ESTIMATED CASH REWARD</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', color: 'var(--yellow-neon)', fontWeight: 700 }}>$</span>
                <input
                  type="text"
                  className="input-cyber"
                  style={{ paddingLeft: '24px', width: '100%' }}
                  value={route.targetCash}
                  onChange={(e) => setRoute({ ...route, targetCash: e.target.value })}
                  disabled={!isEditMode}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>DIFFICULTY</label>
                  <select
                    className="input-cyber"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={route.difficulty}
                    onChange={(e) => setRoute({ ...route, difficulty: e.target.value as any })}
                    disabled={!isEditMode}
                  >
                    <option value="easy">Easy (EASY)</option>
                    <option value="medium">Medium (NORMAL)</option>
                    <option value="hard">Hard (HARD)</option>
                    <option value="expert">Expert (EXPERT)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>CUSTOM BG</label>
                  <button 
                    className="btn-cyber" 
                    style={{ width: '100%', marginTop: '4px', padding: '6px' }}
                    onClick={() => bgFileInputRef.current?.click()}
                    disabled={!isEditMode}
                  >
                    <ImageIcon size={12} /> Upload Map
                  </button>
                  <input 
                    type="file" 
                    ref={bgFileInputRef} 
                    onChange={handleBgUpload} 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    id="bg-file-input"
                  />
                </div>
              </div>

              {route.customBg[currentFloor] && isEditMode && (
                <button 
                  className="btn-cyber danger" 
                  style={{ padding: '4px', fontSize: '10px', marginTop: '4px' }}
                  onClick={removeCustomBg}
                >
                  Reset to Default Background
                </button>
              )}

              <label style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700, marginTop: '4px' }}>PLANNING NOTES</label>
              <textarea
                className="textarea-cyber"
                placeholder="Write overall heist instructions..."
                value={route.description}
                onChange={(e) => setRoute({ ...route, description: e.target.value })}
                disabled={!isEditMode}
              />
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-title">TACTICS & NOTES</div>
            <div className="placed-notes-list">
              {[...globalMarkers, ...route.markers].length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No markers placed on this map yet.
                </div>
              ) : (
                [...globalMarkers, ...route.markers]
                  .map(m => {
                    const meta = MARKER_META[m.type];
                    return (
                      <div 
                        key={m.id} 
                        className="placed-note-item" 
                        style={{ borderLeft: `3px solid ${meta.color}`, cursor: m.scrollConfig ? 'pointer' : 'default' }}
                        onClick={() => m.scrollConfig && setFocusTrigger({ id: m.id, timestamp: Date.now() })}
                      >
                        <div className="placed-note-item-header">
                          <span className="placed-note-type" style={{ color: meta.color }}>
                            {meta.emoji} {meta.label}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            X:{m.x} Y:{m.y}
                          </span>
                        </div>
                        <div className="placed-note-text">
                          {m.note.trim() ? m.note : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No text note details</span>}
                        </div>
                        {m.scrollConfig && (
                          <div style={{ fontSize: '9px', color: 'var(--cyan-neon)', marginTop: '2px', textAlign: 'right' }}>
                            Click to Pan ➔
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className="panel-section" style={{ marginTop: 'auto' }}>
            <div className="panel-title">SAVED ROUTE PLANS</div>
            <div className="saves-list">
              {saves.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                  No saved plans found in browser.
                </div>
              ) : (
                saves.map(s => (
                  <div 
                    key={s.id} 
                    className={`save-item ${route.id === s.id ? 'glass-panel-glow' : ''}`}
                    onClick={() => handleLoadFromLocal(s.id)}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      <strong>{s.title}</strong>
                    </div>
                    <button 
                      className="delete-btn"
                      onClick={(e) => handleDeleteFromLocal(e, s.id)}
                      disabled={!isEditMode}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

