export type FloorType = 'main';

export type MarkerType = 'goal' | 'cardkey' | 'eh' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking' | 'iwarp' | 'text';

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
  infoLabel?: string;     // For info markers: short label displayed under the pin
  bossDrops?: string[];   // For boss markers: list of drop items
  bossDurationSeconds?: number; // For boss markers: duration in seconds
  bossExpanded?: boolean; // For boss markers: whether details are expanded in presentation mode
  battleDurationSeconds?: number; // For battle markers: duration in seconds
  battleExpanded?: boolean; // For battle markers: whether details are expanded in presentation mode
  popupDirection?: 'top' | 'bottom' | 'left' | 'right'; // Direction of detail popup
  popupWidth?: number;    // Width of detail popup in pixels
  popupHeight?: number;   // Height of detail popup in pixels (0 or undefined = auto)
  popupOffset?: { x: number; y: number }; // Offset position from pin center
  pickingDurationSeconds?: number; // For picking markers: duration in seconds
  longPickingDurationSeconds?: number; // For long picking markers: duration in seconds
  pickingPicky?: boolean;  // For picking/long_picking markers: true = Picky (0s)
  pickingExpanded?: boolean; // For picking markers: whether details are expanded in presentation mode
  ehHighRate?: boolean;   // For EH markers: true = high appearance rate highlighted glow
  cardkeyHighRate?: boolean; // For Card Key markers: true = high appearance rate highlighted glow
  warpWaypoints?: Point[]; // For warp/stairs markers: custom path waypoints
  textColor?: string;     // For text markers: color of the text
  textSize?: number;      // For text markers: font size in px
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
  mapVersion?: number; // Version of map coordinate scale (e.g. 2 = 3200x9100)
  markerScale?: number; // Optional scale of markers (e.g. 30 = 100%)
  hiddenMarkers?: string[]; // Global markers hidden in this specific plan
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
  hiddenMarkers: [],
  createdAt: Date.now(),
  mapVersion: 2
});

// Marker Metadata helper for styling and emoji representation
export const MARKER_META: { [key in MarkerType]: { emoji: string; label: string; color: string } } = {
  goal: { emoji: '🏁', label: 'ESCAPE AREA', color: '#39ff14' },
  cardkey: { emoji: '💳', label: 'CARD KEY', color: '#39ff14' },
  eh: { emoji: '💎', label: 'EH', color: '#00f0ff' },
  vault: { emoji: '💰', label: 'MDP', color: '#ffe600' },
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
  glong_picking: { emoji: '🔐', label: 'L-PICKING (GLOBAL)', color: '#ffaa00' },
  iwarp: { emoji: '🌀', label: 'I-WARP', color: '#ff00ff' },
  text: { emoji: 'T', label: 'TEXT', color: '#ffffff' }
};

// Preset Maps metadata with local paths
export const PRESET_MAPS_META: { [key in FloorType]: { path: string | null; label: string } } = {
  main: { path: `${import.meta.env.BASE_URL}nikukyu_map.webp`, label: 'にくきゅうまっぷ' }
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
    exportCanvas.width = 1600;
    exportCanvas.height = 4550;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Draw Background Map
    const bgImg = new Image();
    
    bgImg.onload = () => {
      ctx.drawImage(bgImg, 0, 0, 1600, 4550);
      
      // Draw Stroke Lines (from the drawing Canvas overlay)
      if (canvasElement) {
        ctx.drawImage(canvasElement, 0, 0, 1600, 4550);
      }
      
      // Draw Markers (DOM overlay)
      const floorMarkers = route.markers.filter(m => m.floor === floor);
      const scaleMultiplier = (route.markerScale || 30) / 30;

      // Draw Warp & Stairs connection lines to PNG canvas
      floorMarkers.forEach(m => {
        if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId) {
          const partner = floorMarkers.find(mk => mk.id === m.linkedWarpId);
          if (!partner) return;

          const isMutuallyLinked = partner.linkedWarpId === m.id;
          if (isMutuallyLinked && m.id > partner.id) {
            // Skip return trip to avoid overlapping duplicate paths
            return;
          }

          const isWarp = m.type === 'warp' || m.type === 'iwarp';
          const color = isWarp ? '#ff00ff' : '#ffaa00';
          const lineWidth = (isWarp ? 2 : 1) * scaleMultiplier;
          
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.setLineDash(isWarp ? [6 * scaleMultiplier, 4 * scaleMultiplier] : [3 * scaleMultiplier, 3 * scaleMultiplier]);
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          const effectiveWaypoints = m.warpWaypoints && m.warpWaypoints.length > 0
            ? m.warpWaypoints
            : (isMutuallyLinked && partner.warpWaypoints && partner.warpWaypoints.length > 0
                ? [...partner.warpWaypoints].reverse()
                : []);

          if (effectiveWaypoints.length > 0) {
            effectiveWaypoints.forEach(wp => {
              ctx.lineTo(wp.x, wp.y);
            });
          }
          ctx.lineTo(partner.x, partner.y);
          ctx.stroke();

          // Draw an arrowhead at the target pin
          const lastPt = effectiveWaypoints.length > 0
            ? effectiveWaypoints[effectiveWaypoints.length - 1]
            : { x: m.x, y: m.y };
          const angle = Math.atan2(partner.y - lastPt.y, partner.x - lastPt.x);
          const headLength = Math.max(lineWidth * 5, 10);
          
          ctx.fillStyle = color;
          ctx.setLineDash([]);
          ctx.beginPath();
          const arrowOffsetX = partner.x - (isWarp ? 12 : 10) * scaleMultiplier * Math.cos(angle);
          const arrowOffsetY = partner.y - (isWarp ? 12 : 10) * scaleMultiplier * Math.sin(angle);
          
          ctx.moveTo(arrowOffsetX, arrowOffsetY);
          ctx.lineTo(
            arrowOffsetX - headLength * Math.cos(angle - Math.PI / 6),
            arrowOffsetY - headLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            arrowOffsetX - headLength * Math.cos(angle + Math.PI / 6),
            arrowOffsetY - headLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();

          // Draw an arrowhead at the start pin if mutually linked
          if (isMutuallyLinked) {
            const firstPt = effectiveWaypoints.length > 0
              ? effectiveWaypoints[0]
              : { x: partner.x, y: partner.y };
            const startAngle = Math.atan2(m.y - firstPt.y, m.x - firstPt.x);
            ctx.beginPath();
            const startArrowOffsetX = m.x - (isWarp ? 12 : 10) * scaleMultiplier * Math.cos(startAngle);
            const startArrowOffsetY = m.y - (isWarp ? 12 : 10) * scaleMultiplier * Math.sin(startAngle);
            
            ctx.moveTo(startArrowOffsetX, startArrowOffsetY);
            ctx.lineTo(
              startArrowOffsetX - headLength * Math.cos(startAngle - Math.PI / 6),
              startArrowOffsetY - headLength * Math.sin(startAngle - Math.PI / 6)
            );
            ctx.lineTo(
              startArrowOffsetX - headLength * Math.cos(startAngle + Math.PI / 6),
              startArrowOffsetY - headLength * Math.sin(startAngle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      });
      ctx.setLineDash([]); // Reset line dash

      floorMarkers.forEach(m => {
        const meta = MARKER_META[m.type];
        const isText = m.type === 'text';
        const isLargePin = m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs';

        if (isText) {
          ctx.fillStyle = m.textColor || '#ffffff';
          ctx.font = `bold ${Math.round((m.textSize || 14) * scaleMultiplier)}px Rajdhani, Orbitron, Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(m.note || 'Text', m.x, m.y);
          ctx.shadowBlur = 0;
          return;
        }

        const radius = (isLargePin ? 9 : 8) * scaleMultiplier;
        const fontSize = (isLargePin ? 10 : 9) * scaleMultiplier;
        
        // Marker Outer Circle Glow
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = (isLargePin ? 8 : 6) * scaleMultiplier;
        ctx.fillStyle = 'rgba(10, 15, 28, 0.85)';
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.5 * scaleMultiplier;
        
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw double ring for high appearance rate EH pin
        if (m.type === 'eh' && m.ehHighRate) {
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5 * scaleMultiplier;
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 5 * scaleMultiplier;
          ctx.beginPath();
          ctx.arc(m.x, m.y, radius + 4 * scaleMultiplier, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw double ring for high appearance rate Card Key pin
        if (m.type === 'cardkey' && m.cardkeyHighRate) {
          ctx.strokeStyle = '#39ff14';
          ctx.lineWidth = 1.5 * scaleMultiplier;
          ctx.shadowColor = '#39ff14';
          ctx.shadowBlur = 5 * scaleMultiplier;
          ctx.beginPath();
          ctx.arc(m.x, m.y, radius + 4 * scaleMultiplier, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Reset Shadow for interior drawing
        ctx.shadowBlur = 0;
        
        // Draw emoji icon inside
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px Segoe UI Symbol, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.emoji, m.x, m.y);
        
        // Draw Text Note labels if they exist
        const infoLbl = m.type === 'info' ? (m.infoLabel?.trim() || '') : '';
        const infoDesc = m.type === 'info' ? m.note.trim() : '';
        const displayLabel = m.type === 'info' ? (infoLbl || infoDesc) : m.note.trim();
        if (displayLabel) {
          const hasTwoLines = m.type === 'info' && infoLbl && infoDesc && infoDesc !== infoLbl;
          const lineHeight = 18 * scaleMultiplier;
          const totalHeight = hasTwoLines ? lineHeight * 2 : lineHeight;

          // Measure label (top line) width
          ctx.font = `bold ${Math.round(10 * scaleMultiplier)}px Rajdhani, Orbitron, Arial`;
          const labelW = ctx.measureText(infoLbl || infoDesc).width;

          // Measure desc (bottom line) width if two lines
          let descW = 0;
          if (hasTwoLines) {
            ctx.font = `${Math.round(9 * scaleMultiplier)}px Rajdhani, Orbitron, Arial`;
            descW = ctx.measureText(infoDesc).width;
          }

          const boxWidth = Math.max(labelW, descW) + 12 * scaleMultiplier;
          const labelRadius = 4 * scaleMultiplier;

          ctx.fillStyle = 'rgba(5, 7, 10, 0.9)';
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 1;

          const rx = m.x - boxWidth / 2;
          const ry = m.y + radius + 4 * scaleMultiplier;

          // Draw text box
          ctx.beginPath();
          ctx.roundRect(rx, ry, boxWidth, totalHeight, labelRadius);
          ctx.fill();
          ctx.stroke();

          // Draw label (top line)
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(10 * scaleMultiplier)}px Rajdhani, Orbitron, Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(infoLbl || infoDesc, m.x, ry + 9 * scaleMultiplier);

          // Draw description (bottom line)
          if (hasTwoLines) {
            ctx.font = `${Math.round(9 * scaleMultiplier)}px Rajdhani, Orbitron, Arial`;
            ctx.fillText(infoDesc, m.x, ry + lineHeight + 9 * scaleMultiplier);
          }
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
        bgImg.src = `${import.meta.env.BASE_URL}nikukyu_map.webp`;
      }
    }
  }
}
