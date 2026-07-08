import type { MarkerType, PresetVisibility, TextColorOption, RouteData, SaveDataMigration, FloorType } from './types'

export const AUTHOR_TAMPERED = '__author_tampered__';
export const AUTHOR_DEFAULT_PLAIN = 'No name';
export const AUTHOR_UNKNOWN_MARKER = 'v2:0:';
export const AUTHOR_KEY = 'Fans';
export const RENDER_CACHE_KEY = 'Colins';

export const APP_VERSION = '0.9.2';

declare const __BUILD_TIME__: string;
export const APP_BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'development';
export const APP_DISPLAY_VERSION = `${APP_VERSION}_${APP_BUILD_TIME}`;

export const SAVE_DATA_VERSION_HISTORY: string[] = [
  '0.9.1',
  '0.9.2'
];

export const SAVE_DATA_MIGRATIONS: SaveDataMigration[] = [
  {
    fromVersion: '0.9.1',
    toVersion: '0.9.2',
    description: 'セーブデータバージョンを0.9.2に引き上げ',
    migrate: (d) => d
  }
];

export const DEFAULT_ROUTE = (id: string = 'default'): RouteData => ({
  id,
  title: 'NEW HEIST ROUTE PLAN',
  description: 'Plan description here...',
  targetCash: '100,000',
  targetCoins: '500',
  targetDuration: '720',
  author: '',
  renderCache: AUTHOR_DEFAULT_PLAIN,
  strokes: { main: [] },
  markers: [],
  customBg: { main: null },
  bgOffset: { x: 0, y: 0 },
  bgScale: { x: 1, y: 1 },
  walls: { main: [] },
  bossCustomDurations: {},
  battleCustomDurations: {},
  pickingCustomDurations: {},
  longPickingCustomDurations: {},
  pickyMarkerIds: {},
  hiddenMarkers: [],
  hiddenMarkerTypes: [],
  createdAt: Date.now(),
  mapVersion: 2,
  saveDataVersion: APP_VERSION
});

export const PRESET_VISIBILITY_META: { [key in PresetVisibility]: { label: string; emoji: string; color: string; description: string } } = {
  public:   { label: '公開',       emoji: '🌐', color: '#39ff14', description: '一覧に表示され、URL共有でも開ける' },
  unlisted: { label: '限定公開',   emoji: '🔗', color: '#ffe600', description: '一覧には出ない。URL (?preset=ID) を知っていれば開ける' },
  private:  { label: '非公開',     emoji: '🔒', color: '#ff0055', description: 'ローカルモード (npm run dev) でのみ開ける。本番ビルドでは不可' }
};

export const PRESET_BODY_KEY_PREFIX = 'heist_preset_body_';

export const TEXTCOLOR_META: { [key in TextColorOption]: { label: string; color: string } } = {
  green: { label: '緑', color: '#39ff14' },
  blue: { label: '青', color: '#00bfff' },
  purple: { label: '紫', color: '#b388ff' },
  yellow: { label: '黄', color: '#ffd700' },
  red: { label: 'カードキー', color: '#ff4444' },
  cyan: { label: 'EH', color: '#00ffff' },
};

export const MARKER_META: { [key in MarkerType]: { emoji: string; label: string; color: string } } = {
  goal: { emoji: '🏁', label: 'ESCAPE AREA', color: '#39ff14' },
  cardkey: { emoji: '💳', label: 'CARD KEY', color: '#39ff14' },
  eh: { emoji: '💎', label: 'EH', color: '#00f0ff' },
  rare: { emoji: '💴', label: 'RARE', color: '#ffd700' },
  vault: { emoji: '💰', label: 'MDP', color: '#ffe600' },
  boss: { emoji: '😈', label: 'BOSS', color: '#ff0055' },
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
  text: { emoji: 'T', label: 'TEXT', color: '#ffffff' },
  iinfo: { emoji: 'ⓘ', label: 'I-INFO', color: '#4fc3f7' },
  inote: { emoji: '📝', label: 'I-MEMO', color: '#39ff14' },
  itext: { emoji: 'T', label: 'I-TEXT', color: '#ffffff' },
  start: { emoji: '🐾', label: 'START', color: '#39ff14' },
  checkpoint: { emoji: '🏁', label: 'CHECKPOINT', color: '#ff9500' },
  skill_cd: { emoji: 'S', label: 'SKILL CD', color: '#39ff14' },
  drawer: { emoji: '🗄', label: 'DRAWER', color: '#cd853f' },
  tps: { emoji: '🖼', label: 'TPS PROJECTION', color: '#ff8800' },
  itps: { emoji: '🖼', label: 'I-TPS PROJECTION', color: '#ff8800' },
  shelf: { emoji: '📦', label: 'SHELF', color: '#cd853f' }
};

export const PRESET_MAPS_META: { [key in FloorType]: { path: string | null; label: string } } = {
  main: { path: `${import.meta.env.BASE_URL}nikukyu_map.webp`, label: 'にくきゅう大強盗マップ' }
};
