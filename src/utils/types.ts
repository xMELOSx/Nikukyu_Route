export interface LockedWallSegment {
  p1: Point;
  p2: Point;
  isOpen: boolean;
}

export type GlobalLockedWalls = { [key: string]: LockedWallSegment[] };

export function generateId(prefix: string = ''): string {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export type FloorType = 'main';

export type MarkerType = 'goal' | 'cardkey' | 'eh' | 'rare' | 'vault' | 'boss' | 'phone' | 'note' | 'room' | 'warp' | 'stairs' | 'p1' | 'p2' | 'p3' | 'info' | 'battle' | 'gbattle' | 'picking' | 'gpicking' | 'long_picking' | 'glong_picking' | 'iwarp' | 'text' | 'iinfo' | 'inote' | 'itext' | 'start' | 'checkpoint' | 'skill_cd' | 'drawer' | 'tps' | 'itps' | 'shelf';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: Point[];
  color: string;
  width: number;
  type: 'solid' | 'dashed' | 'temporary';
  originalPoints?: Point[];
}

export interface ScrollConfig {
  x: number;
  y: number;
  zoom: number;
  viewWidth?: number;
  viewHeight?: number;
}

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'webm' | 'x-embed' | 'youtube';
  description?: string;
}

export interface HeistMarker {
  id: string;
  type: MarkerType;
  x: number;
  y: number;
  note: string;
  floor: FloorType;
  scrollConfig?: ScrollConfig;
  linkedWarpId?: string;
  teleportAngle?: number;
  teleportExitAngle?: number;
  phoneActive?: boolean;
  phoneLocked?: boolean;
  infoExpanded?: boolean;
  noteExpanded?: boolean;
  infoLabel?: string;
  bossDrops?: string[];
  bossDurationSeconds?: number;
  bossExpanded?: boolean;
  bossDescription?: string;
  battleDurationSeconds?: number;
  battleExpanded?: boolean;
  popupDirection?: 'top' | 'bottom' | 'left' | 'right';
  popupWidth?: number;
  popupHeight?: number;
  popupOffset?: { x: number; y: number };
  pickingDurationSeconds?: number;
  longPickingDurationSeconds?: number;
  pickingPicky?: boolean;
  pickingExpanded?: boolean;
  ehHighRate?: boolean;
  cardkeyHighRate?: boolean;
  warpWaypoints?: Point[];
  textColor?: string;
  textSize?: number;
  textScaleWithMap?: boolean;
  textFixedPosition?: boolean;
  fixedOriginX?: number;
  fixedOriginY?: number;
  trackSide?: 'auto' | 'left' | 'right';
  textDescription?: string;
  textTooltip?: boolean;
  textGlow?: boolean;
  mediaItems?: MediaItem[];
  checkpointTargetTime?: number;
  checkpointSoundOn?: boolean;
  checkpointVoiceOn?: boolean;
  checkpointSpeed?: number;
  checkpointExpanded?: boolean;
  connectionColor?: string;
  skillPresetId?: string;
  skillLabel?: string;
  skillColor?: string;
  skillMode?: SkillCdMode;
  skillCdSeconds?: number;
  skillPerSecondCd?: number;
  drawerRows?: number;
  drawerCols?: number;
  drawerAngle?: number;
  drawerWidth?: number;
  drawerHeight?: number;
  drawerExpanded?: boolean;
  shelfExpanded?: boolean;
  shelfRows?: number;
  shelfCols?: number;
  shelfWidth?: number;
  shelfHeight?: number;
  shelfGridWidth?: number;
  shelfGridHeight?: number;
  shelfModalFollowAngle?: boolean;
  shelfColGapEvery?: number;
  shelfColGapSize?: number;
  shelfRowGapEvery?: number;
  shelfRowGapSize?: number;
  shelfAngle?: number;
  shelfSpawns?: ShelfSpawn[];
}

export interface PartitionWallSegment {
  p1: Point;
  p2: Point;
}

export type GlobalPartitionWalls = { [key: string]: PartitionWallSegment[] };

export type WallSegment = [Point, Point] | [Point, Point, string] | [Point, Point, string, number];

export interface RouteData {
  id: string;
  title: string;
  description: string;
  targetCash: string;
  targetCoins: string;
  targetDuration: string;
  author: string;
  renderCache: string;
  strokes: { [key in FloorType]: DrawingStroke[] };
  markers: HeistMarker[];
  walls?: { [key in FloorType]: WallSegment[] };
  customBg: { [key in FloorType]: string | null };
  maskCanvas?: { [key in FloorType]: string | null };
  bgOffset?: { x: number; y: number };
  bgScale?: { x: number; y: number };
  createdAt: number;
  bossCustomDurations?: { [markerId: string]: number };
  battleCustomDurations?: { [markerId: string]: number };
  pickingCustomDurations?: { [markerId: string]: number };
  longPickingCustomDurations?: { [markerId: string]: number };
  pickyMarkerIds?: { [markerId: string]: boolean };
  mapVersion?: number;
  markerScale?: number;
  hiddenMarkers?: string[];
  hiddenMarkerTypes?: string[];
  saveDataVersion?: string;
  presetSourceId?: string;
}

export interface SaveDataMigration {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: (data: RouteData) => RouteData;
}

export interface MigrationResult {
  data: RouteData;
  applied: SaveDataMigration[];
  finalVersion: string;
  unknown: boolean;
  unknownVersion?: string;
}

export type PresetVisibility = 'public' | 'unlisted' | 'private';

export interface PresetData {
  id: string;
  name: string;
  description: string;
  targetCash: string;
  targetCoins: string;
  author: string;
  renderCache: string;
  updatedAt: number;
  visibility?: PresetVisibility;
  routeData?: RouteData;
}

export type PresetMeta = Omit<PresetData, 'routeData'>;

export type SkillCdMode = 'fixed' | 'per_second';

export interface SkillCdPreset {
  id: string;
  label: string;
  color: string;
  mode: SkillCdMode;
  seconds: number;
  perSecondCd: number;
}

export const TEXTCOLOR_OPTIONS = ['green', 'blue', 'purple', 'yellow', 'red', 'cyan'] as const;
export type TextColorOption = typeof TEXTCOLOR_OPTIONS[number];

export interface RegisteredItem {
  id: string;
  name: string;
  textColor: string;
  fans: number;
  coins: number;
  image?: string;
  description?: string;
}

export interface ShelfSpawn {
  row: number;
  col: number;
  spawnId: string;
}

export interface SpawnPointItem {
  itemId: string;
  discoveredAt: string;
  playerCount: number;
}

export const SPAWN_CATEGORIES = ['机上', '机上(レア)', '引出', '小金庫', '中金庫', '展示台', '宝石置き', '床', '植木鉢', '棚', '絵画', 'ドロップ', 'ファンス'] as const;
export type SpawnCategory = typeof SPAWN_CATEGORIES[number];

export const CATEGORY_TO_POOL: Record<string, string> = {
  '机上': 'desk', '机上(レア)': 'deskRare', '引出': 'drawer', '小金庫': 'smallSafe',
  '中金庫': 'midSafe', '展示台': 'display', '宝石置き': 'jewelStand', '床': 'floor',
  '植木鉢': 'flowerPot', '棚': 'shelf', '絵画': 'painting', 'ドロップ': 'drop', 'ファンス': 'fans'
};

export const POOL_LABELS: Record<string, string> = {
  desk: '机上', deskRare: '机上(レア)', drawer: '引出', smallSafe: '小金庫',
  midSafe: '中金庫', display: '展示台', jewelStand: '宝石置き', floor: '床',
  flowerPot: '植木鉢', shelf: '棚', painting: '絵画', drop: 'ドロップ', fans: 'ファンス'
};

export const APPEARANCE_RATES = ['高', '中', '低'] as const;
export type AppearanceRate = typeof APPEARANCE_RATES[number];

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  floor: FloorType;
  category?: SpawnCategory;
  createdAt: string;
  note?: string;
  appearanceRate?: AppearanceRate;
  items: SpawnPointItem[];
}
