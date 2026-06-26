export interface PlayDataRecord {
  id: string;
  timestamp: number;
  fans: number;
  coins: number;
  location: string;
  requiem15: boolean;
  requiem20: boolean;
  excluded: boolean;
}

export interface PlayDataState {
  // Current period counters (entered by user each run)
  currentFans: number;
  currentCoins: number;
  requiem15: boolean;
  requiem20: boolean;
  recordedLocation: string;

  // Period tracking — recordedFans/recordedCoins reset every other Monday
  recordedFans: number;
  recordedCoins: number;
  periodStart: number; // timestamp (ms) when the current period began

  // History of escape button presses
  records: PlayDataRecord[];

  // UI state — auto-route panel collapsed
  autoRouteCollapsed: boolean;
}

export const PLAY_DATA_KEY = 'heist_play_data_v1';
export const AUTO_ROUTE_COLLAPSED_KEY = 'heist_auto_route_collapsed';

export const BIWEEKLY_FANS_CAP = 1_000_000;
export const BIWEEKLY_COINS_CAP = 100_000;
export const FANS_PER_NIKUKYUU_POINT = 2400;
export const PERIOD_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
export const RESET_HOUR = 5; // 5 AM local time on the reset Monday

export const PLAY_DATA_DEFAULTS: PlayDataState = {
  currentFans: 0,
  currentCoins: 0,
  requiem15: false,
  requiem20: false,
  recordedLocation: '',
  recordedFans: 0,
  recordedCoins: 0,
  periodStart: 0,
  records: [],
  autoRouteCollapsed: false
};

export function loadPlayData(): PlayDataState {
  try {
    const raw = localStorage.getItem(PLAY_DATA_KEY);
    if (!raw) return { ...PLAY_DATA_DEFAULTS, records: [] };
    const parsed = JSON.parse(raw) as Partial<PlayDataState>;
    return {
      ...PLAY_DATA_DEFAULTS,
      ...parsed,
      records: Array.isArray(parsed.records) ? parsed.records : []
    };
  } catch {
    return { ...PLAY_DATA_DEFAULTS, records: [] };
  }
}

export function savePlayData(state: PlayDataState): void {
  try {
    localStorage.setItem(PLAY_DATA_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save play data:', err);
  }
}

export function loadAutoRouteCollapsed(): boolean {
  const raw = localStorage.getItem(AUTO_ROUTE_COLLAPSED_KEY);
  return raw === 'true';
}

export function saveAutoRouteCollapsed(collapsed: boolean): void {
  localStorage.setItem(AUTO_ROUTE_COLLAPSED_KEY, String(collapsed));
}

/**
 * Return the next reset Date for the period. The reset is 14 days from
 * periodStart, snapped to 5:00 AM. If no period is started, returns null.
 */
export function getNextResetDate(periodStart: number): Date | null {
  if (!periodStart) return null;
  const next = new Date(periodStart + PERIOD_LENGTH_MS);
  next.setHours(RESET_HOUR, 0, 0, 0);
  return next;
}

/**
 * Return the day-of-week index (0 = Sun) for the given reset Date. Used
 * to label the next reset as a Monday.
 */
function isMonday(d: Date): boolean {
  return d.getDay() === 1;
}

export function formatNextReset(periodStart: number): string {
  const next = getNextResetDate(periodStart);
  if (!next) return '未設定';
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayLabel = isMonday(next) ? '月' : '月';
  return `${next.getFullYear()}/${pad(next.getMonth() + 1)}/${pad(next.getDate())} (${dayLabel}) ${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

/**
 * Returns remaining days/hours until the next reset.
 */
export function getTimeUntilReset(periodStart: number, now: number = Date.now()): { days: number; hours: number; total: number } | null {
  const next = getNextResetDate(periodStart);
  if (!next) return null;
  const total = next.getTime() - now;
  if (total <= 0) return { days: 0, hours: 0, total: 0 };
  const days = Math.floor(total / (24 * 60 * 60 * 1000));
  const hours = Math.floor((total % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { days, hours, total };
}

/**
 * If the current time has passed the next scheduled reset, return a new state
 * with the period counters reset and a fresh periodStart. Otherwise the input
 * state is returned unchanged.
 */
export function checkAutoReset(state: PlayDataState, now: number = Date.now()): PlayDataState {
  if (!state.periodStart) {
    // No period yet — start one now so the next reset is always 14 days away.
    return { ...state, periodStart: now };
  }
  const next = getNextResetDate(state.periodStart);
  if (!next) return state;
  if (now >= next.getTime()) {
    return {
      ...state,
      recordedFans: 0,
      recordedCoins: 0,
      periodStart: now
    };
  }
  return state;
}

/**
 * Calculate にくきゅうポイント from current fans. 1 point per 2400 fans.
 * NOT affected by requiem bonus — based on the original acquisition count.
 */
export function calculateNikukyuuPoints(fans: number): number {
  if (fans <= 0) return 0;
  return Math.floor(fans / FANS_PER_NIKUKYUU_POINT);
}

/**
 * Apply the +15% / +20% Requiem bonus to a base value.
 * If both are enabled, +35% total.
 */
export function applyRequiemBonus(value: number, requiem15: boolean, requiem20: boolean): number {
  let mult = 1;
  if (requiem15) mult += 0.15;
  if (requiem20) mult += 0.20;
  return Math.floor(value * mult);
}

export function getRemainingCap(state: PlayDataState): { fans: number; coins: number } {
  return {
    fans: Math.max(0, BIWEEKLY_FANS_CAP - state.recordedFans),
    coins: Math.max(0, BIWEEKLY_COINS_CAP - state.recordedCoins)
  };
}

/**
 * Compute the average across non-excluded records.
 */
export function getAverage(records: PlayDataRecord[]): { fans: number; coins: number; count: number; nikukyuu: number } {
  const active = records.filter(r => !r.excluded);
  if (active.length === 0) return { fans: 0, coins: 0, count: 0, nikukyuu: 0 };
  const totalFans = active.reduce((sum, r) => sum + r.fans, 0);
  const totalCoins = active.reduce((sum, r) => sum + r.coins, 0);
  return {
    fans: Math.round(totalFans / active.length),
    coins: Math.round(totalCoins / active.length),
    count: active.length,
    nikukyuu: Math.round((totalFans / active.length) / FANS_PER_NIKUKYUU_POINT)
  };
}

/**
 * Build a CSV string from records. Excluded rows are included but marked,
 * so the user can re-include them later. The full data is always exported.
 */
export function buildCSV(records: PlayDataRecord[]): string {
  const header = ['日時', '記録地', 'ファンス', 'コイン', 'にくきゅうポイント', 'レクイエム15%', 'レクイエム20%', '除外'];
  const rows = records.map(r => {
    const date = new Date(r.timestamp).toLocaleString('ja-JP');
    const location = r.location || '';
    const fans = r.fans.toString();
    const coins = r.coins.toString();
    const nikukyuu = calculateNikukyuuPoints(r.fans).toString();
    const r15 = r.requiem15 ? 'ON' : 'OFF';
    const r20 = r.requiem20 ? 'ON' : 'OFF';
    const ex = r.excluded ? 'YES' : 'NO';
    return [date, location, fans, coins, nikukyuu, r15, r20, ex];
  });

  // Add summary row
  const avg = getAverage(records);
  const summary = [
    `平均 (${avg.count}件, 除外除く)`,
    '',
    avg.fans.toString(),
    avg.coins.toString(),
    avg.nikukyuu.toString(),
    '',
    '',
    ''
  ];

  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

  return [header, ...rows, summary]
    .map(row => row.map(escape).join(','))
    .join('\n');
}

export function downloadCSV(records: PlayDataRecord[], filename: string = 'heist_escape_records.csv'): void {
  const csv = buildCSV(records);
  // BOM so Excel detects UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateRecordId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
