export type FloorType = 'main';

export type MarkerType = 'start' | 'goal' | 'camera' | 'guard' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: Point[];
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'arrow';
}

export interface ScrollConfig {
  x: number;
  y: number;
  zoom: number;
}

export interface HeistMarker {
  id: string;
  type: MarkerType;
  x: number; // 0-800 coordinate
  y: number; // 0-2275 coordinate
  note: string;
  floor: FloorType;
  scrollConfig?: ScrollConfig; // Scroll coordinates configuration
  linkedWarpId?: string; // For warp pairs: ID of the linked warp marker
  phoneActive?: boolean;  // For phone markers: true = 📞 (active), false/undefined = ☎ (inactive)
  phoneLocked?: boolean;  // For phone markers: always active, not affected by reset/toggle
  infoMediaUrl?: string;  // For info markers: URL to image, webm or X post
  infoMediaType?: 'image' | 'webm' | 'x-embed'; // For info markers: type of media
  infoExpanded?: boolean; // For info markers: whether details are expanded in presentation mode
  bossDrops?: string[];   // For boss markers: list of drop items
  bossDurationSeconds?: number; // For boss markers: duration in seconds
  bossExpanded?: boolean; // For boss markers: whether details are expanded in presentation mode
  battleDurationSeconds?: number; // For battle markers: duration in seconds
  battleExpanded?: boolean; // For battle markers: whether details are expanded in presentation mode
  popupDirection?: 'top' | 'bottom' | 'left' | 'right'; // Direction of detail popup
  popupWidth?: number;    // Width of detail popup in pixels
  popupOffset?: { x: number; y: number }; // Offset position from pin center
  pickingDurationSeconds?: number; // For picking markers: duration in seconds
  longPickingDurationSeconds?: number; // For long picking markers: duration in seconds
  pickingPicky?: boolean;  // For picking/long_picking markers: true = Picky (0s)
  pickingExpanded?: boolean; // For picking markers: whether details are expanded in presentation mode
}

export interface RouteData {
  id: string;
  title: string;
  description: string;
  targetCash: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  strokes: { [key in FloorType]: DrawingStroke[] };
  markers: HeistMarker[];
  customBg: { [key in FloorType]: string | null }; // base64 images
  createdAt: number;
  bossCustomDurations?: { [markerId: string]: number }; // Plan-specific override for boss timers
  battleCustomDurations?: { [markerId: string]: number }; // Plan-specific override for battle timers
  pickingCustomDurations?: { [markerId: string]: number }; // Plan-specific override for picking timers
  longPickingCustomDurations?: { [markerId: string]: number }; // Plan-specific override for long picking timers
}

export const DEFAULT_ROUTE = (id: string = 'default'): RouteData => ({
  id,
  title: 'NEW HEIST ROUTE PLAN',
  description: 'Plan description here...',
  targetCash: '100,000',
  difficulty: 'medium',
  strokes: {
    main: []
  },
  markers: [],
  customBg: {
    main: null
  },
  bossCustomDurations: {},
  battleCustomDurations: {},
  pickingCustomDurations: {},
  longPickingCustomDurations: {},
  createdAt: Date.now()
});

// Marker Metadata helper for styling and emoji representation
export const MARKER_META: { [key in MarkerType]: { emoji: string; label: string; color: string } } = {
  start: { emoji: '🐾', label: 'START POINT', color: '#39ff14' },
  goal: { emoji: '🏁', label: 'ESCAPE AREA', color: '#39ff14' },
  camera: { emoji: '📹', label: 'CAMERA', color: '#ffe600' },
  guard: { emoji: '👮', label: 'GUARD', color: '#ff0055' },
  vault: { emoji: '💰', label: 'VAULT LOCK', color: '#ffe600' },
  boss: { emoji: '😈', label: 'BOSS (MAMON)', color: '#ff0055' },
  phone: { emoji: '☎', label: 'ESCAPE PHONE', color: '#ff00ff' },
  note: { emoji: '📌', label: 'MEMO', color: '#64748b' },
  room: { emoji: '🚪', label: 'ROOM / ZONE', color: '#00f0ff' },
  warp: { emoji: '🌀', label: 'WARP POINT', color: '#ff00ff' },
  stairs: { emoji: '🪜', label: 'STAIRS', color: '#ffaa00' },
  battle: { emoji: '⚔', label: 'BATTLE', color: '#ff0055' },
  picking: { emoji: '🔑', label: 'PICKING', color: '#ffe600' },
  long_picking: { emoji: '🔐', label: 'L-PICKING', color: '#ffaa00' },
  p1: { emoji: '1', label: 'PIN 1', color: '#00f0ff' },
  p2: { emoji: '2', label: 'PIN 2', color: '#ffe600' },
  p3: { emoji: '3', label: 'PIN 3', color: '#ff00ff' },
  info: { emoji: 'ⓘ', label: 'INFO PIN', color: '#4fc3f7' },
  gbattle: { emoji: '⚔', label: 'BATTLE (GLOBAL)', color: '#ff0055' },
  gpicking: { emoji: '🔑', label: 'PICKING (GLOBAL)', color: '#ffe600' },
  glong_picking: { emoji: '🔐', label: 'L-PICKING (GLOBAL)', color: '#ffaa00' }
};

// Preset Maps metadata with local paths
export const PRESET_MAPS_META: { [key in FloorType]: { path: string | null; label: string } } = {
  main: { path: '/nikukyu_map.webp', label: 'にくきゅうまっぷ' }
};

export class DataManager {
  // Save route to localStorage
  static saveToLocalStorage(route: RouteData): void {
    const saves = this.getSavesList();
    const index = saves.findIndex(s => s.id === route.id);
    if (index >= 0) {
      saves[index] = { id: route.id, title: route.title, updatedAt: Date.now() };
    } else {
      saves.push({ id: route.id, title: route.title, updatedAt: Date.now() });
    }
    
    localStorage.setItem(`heist_route_${route.id}`, JSON.stringify(route));
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  // Get list of saved routes {id, title, updatedAt}
  static getSavesList(): { id: string; title: string; updatedAt: number }[] {
    const listStr = localStorage.getItem('heist_routes_list');
    return listStr ? JSON.parse(listStr) : [];
  }

  // Load route from localStorage
  static loadFromLocalStorage(id: string): RouteData | null {
    const dataStr = localStorage.getItem(`heist_route_${id}`);
    return dataStr ? JSON.parse(dataStr) : null;
  }

  // Delete route from localStorage
  static deleteFromLocalStorage(id: string): void {
    localStorage.removeItem(`heist_route_${id}`);
    const saves = this.getSavesList().filter(s => s.id !== id);
    localStorage.setItem('heist_routes_list', JSON.stringify(saves));
  }

  // Export route to JSON file
  static exportToJSON(route: RouteData): void {
    const dataStr = JSON.stringify(route, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${route.title.replace(/\s+/g, '_')}_route_plan.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export merged map to PNG
  static exportToPNG(
    floor: FloorType,
    route: RouteData,
    _svgString: string,
    canvasElement: HTMLCanvasElement | null,
    onComplete: (dataUrl: string) => void
  ): void {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 800;
    exportCanvas.height = 2275;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Draw Background Map
    const bgImg = new Image();
    
    bgImg.onload = () => {
      ctx.drawImage(bgImg, 0, 0, 800, 2275);
      
      // Draw Stroke Lines (from the drawing Canvas overlay)
      if (canvasElement) {
        ctx.drawImage(canvasElement, 0, 0, 800, 2275);
      }
      
      // Draw Markers (DOM overlay)
      const floorMarkers = route.markers.filter(m => m.floor === floor);
      floorMarkers.forEach(m => {
        const meta = MARKER_META[m.type];
        const isLargePin = m.type === 'warp' || m.type === 'stairs';
        const radius = isLargePin ? 9 : 8;
        const fontSize = isLargePin ? 10 : 9;
        
        // Marker Outer Circle Glow
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = isLargePin ? 8 : 6;
        ctx.fillStyle = 'rgba(10, 15, 28, 0.85)';
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Reset Shadow for interior drawing
        ctx.shadowBlur = 0;
        
        // Draw emoji icon inside
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px Segoe UI Symbol, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.emoji, m.x, m.y);
        
        // Draw Text Note labels if they exist
        if (m.note.trim()) {
          ctx.font = 'bold 10px Rajdhani, Orbitron, Arial';
          const textWidth = ctx.measureText(m.note).width;
          const labelWidth = Math.max(textWidth + 12, 40);
          
          ctx.fillStyle = 'rgba(5, 7, 10, 0.9)';
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 1;
          
          const rx = m.x - labelWidth / 2;
          const ry = m.y + radius + 4;
          
          // Draw note text box
          ctx.beginPath();
          ctx.roundRect(rx, ry, labelWidth, 18, 4);
          ctx.fill();
          ctx.stroke();
          
          // Draw text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(m.note, m.x, ry + 9);
        }
      });

      // Trigger callback with data URL
      const dataUrl = exportCanvas.toDataURL('image/png');
      onComplete(dataUrl);
    };

    // Set source for background image
    if (route.customBg[floor]) {
      bgImg.src = route.customBg[floor] as string;
    } else {
      const preset = PRESET_MAPS_META[floor];
      if (preset.path) {
        bgImg.src = preset.path;
      } else {
        bgImg.src = '/nikukyu_map.webp';
      }
    }
  }
}
