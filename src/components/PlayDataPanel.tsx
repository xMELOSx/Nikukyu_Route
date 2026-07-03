import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  type PlayDataState,
  type PlayDataRecord,
  type WeeklyGoal,
  loadPlayData,
  savePlayData,
  checkAutoReset,
  calculateNikukyuuPoints,
  applyRequiemBonus,
  getRemainingCap,
  getAverage,
  getTimeUntilReset,
  formatNextReset,
  downloadCSV,
  generateRecordId,
  generateGoalId,
  BIWEEKLY_FANS_CAP,
  BIWEEKLY_COINS_CAP
} from '../utils/PlayDataManager';
import { Download, Trash2, AlertTriangle, TrendingUp, Clock, BarChart3, Check, List, Target, Plus, X, Type, Music, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Calculator, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import type { RegisteredItem } from '../utils/types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface PlayDataPanelProps {
  onNotify?: (msg: string) => void;
  routeTitle?: string;
  refreshKey?: number;
}

type CumulativeField = 'recordedFans' | 'recordedCoins' | 'recordedNikukyuu';

const RECORDS_INLINE_LIMIT = 5;

/**
 * NumberInput — an inline-editable number with ± buttons and large steppers.
 * Easier to use than the default `type="number"` spinners for large values.
 */
function NumberInput({
  value,
  onChange,
  min = 0,
  step = 1,
  width = 80,
  accent = 'var(--cyan-neon)',
  align = 'right'
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  width?: number;
  accent?: string;
  align?: 'right' | 'center' | 'left';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const save = () => {
    const n = Math.max(min, parseInt(draft) || 0);
    onChange(n);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(Math.max(min, value - step))}
          style={{ width: 22, height: 24, padding: 0, fontSize: 14, fontWeight: 700, background: 'rgba(0,0,0,0.5)', border: `1px solid ${accent}66`, color: accent, borderRadius: 3, cursor: 'pointer', lineHeight: 1 }}
          title={`−${step}`}
        >−</button>
        <input
          type="number"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          style={{
            width,
            height: 24,
            padding: '0 4px',
            fontSize: 13,
            fontWeight: 700,
            textAlign: align,
            background: 'rgba(5,7,10,0.95)',
            border: `1px solid ${accent}`,
            color: accent,
            borderRadius: 3,
            fontFamily: 'monospace'
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(value + step)}
          style={{ width: 22, height: 24, padding: 0, fontSize: 14, fontWeight: 700, background: 'rgba(0,0,0,0.5)', border: `1px solid ${accent}66`, color: accent, borderRadius: 3, cursor: 'pointer', lineHeight: 1 }}
          title={`+${step}`}
        >+</button>
      </span>
    );
  }

  return (
    <span
      onClick={start}
      title={t('クリックで編集')}
      style={{
        color: accent,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'monospace',
        borderBottom: `1px dashed ${accent}55`,
        padding: '0 2px',
        display: 'inline-block',
        minWidth: 24,
        textAlign: align
      }}
    >
      {value.toLocaleString()}
    </span>
  );
}

/** Extract all integers (with optional thousand separators) from a string. */
function extractNumbers(text: string): number[] {
  const nums: number[] = [];
  const numRe = /(\d{1,3}(?:,\d{3})*|\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(text)) !== null) {
    nums.push(parseInt(m[1].replace(/,/g, '')));
  }
  return nums;
}

/**
 * Parse text input (one goal per line) into goal entries. Handles:
 *   "銀行書類・その四を22個集める"            → name="銀行書類・その四", target=22
 *   "金塊を240個集める  800"                   → name="金塊", target=240, reward=800
 *   "累計1,950,000の収益を獲得"                → name="累計1,950,000の収益", target=1,950,000
 *   "1,950,000の収益を獲得"                    → name="1,950,000の収益", target=1,950,000
 *   "ナクペイダ模型を20体集める"              → name="ナクペイダ模型", target=20
 *
 * Strategy:
 *   1. Split on "を" → name / after.
 *   2. If `after` contains a number → that is the target; last extra number is reward.
 *   3. Else, if the `name` itself contains a number → use it as the target
 *      (handles "累計1,950,000の収益を獲得" where the count is in the name).
 */
function parseGoalsFromInput(text: string): { name: string; target: number; reward: number }[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const out: { name: string; target: number; reward: number }[] = [];
  for (const line of lines) {
    const woIdx = line.indexOf('を');
    if (woIdx < 1) continue;

    const nameRaw = line.slice(0, woIdx).trim();
    const after = line.slice(woIdx + 1);

    let target = 0;
    let reward = 0;
    const afterNums = extractNumbers(after);
    if (afterNums.length > 0) {
      // Clamp to >= 0 — negative amounts are not possible
      target = Math.max(0, afterNums[0]);
      reward = afterNums.length > 1 ? Math.max(0, afterNums[afterNums.length - 1]) : 0;
    } else {
      // No number after 「を」 — look in the name (e.g. "累計1,950,000の収益を獲得")
      const nameNums = extractNumbers(nameRaw);
      if (nameNums.length > 0) {
        target = Math.max(0, nameNums[0]);
        reward = Math.max(0, extractNumbers(after)[0] || 0);
      }
    }

    // Clean leading noise from the name (bullet markers, list numbers, etc.) and strip ®
    const cleanName = nameRaw.replace(/^[\d\s\.\-\)\]【】•・●○①②③④⑤⑥⑦⑧⑨]+/, '').replace(/[®]/g, '').trim();
    if (cleanName.length < 1 || target <= 0) continue;

    out.push({ name: cleanName, target, reward });
  }

  // De-duplicate by name key to handle overlapping screenshots
  const seen = new Set<string>();
  const deduplicated: { name: string; target: number; reward: number }[] = [];
  for (const item of out) {
    const key = item.name.replace(/\s+/g, '').replace(/[®]/g, '').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
    }
  }
  return deduplicated;
}

export function PlayDataPanel({ onNotify, routeTitle = '', refreshKey }: PlayDataPanelProps) {
  const [state, setState] = useState<PlayDataState>(() => checkAutoReset(loadPlayData()));
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string>('');
  const [showAllRecords, setShowAllRecords] = useState<boolean>(false);
  const [showAddGoal, setShowAddGoal] = useState<boolean>(false);
  const [newGoal, setNewGoal] = useState<{ name: string; target: string; reward: string }>({ name: '', target: '', reward: '' });
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingGoalCurrent, setEditingGoalCurrent] = useState<string>('');
  // Text-input goal parser
  const [showTextGoalModal, setShowTextGoalModal] = useState<boolean>(false);
  const [textGoalInput, setTextGoalInput] = useState<string>('');
  const [textGoalParsed, setTextGoalParsed] = useState<{ name: string; target: string; reward: string }[]>([]);
  // Two-step confirmation for 全削除
  const [confirmClearGoals, setConfirmClearGoals] = useState(false);

  // --- Item acquisition simulator state ---
  interface SimItemGroup {
    key: string;
    fans: number;
    coins: number;
    names: string[];
    itemIds: string[];
    color: string;
  }
  interface SimTrialResult {
    success: boolean;
    totalItems: number;
    totalFans: number;
    totalCoins: number;
    counts: Record<string, number>;
    cardKeys: number;
    pickedCardKey: boolean;
  }
  interface SimFlatItem {
    id: string;
    name: string;
    fans: number;
    coins: number;
    color: string;
    groupKey: string;
  }
  interface SimResultSummary {
    trials: number;
    successes: number;
    avgTotalItems: number;
    avgFans: number;
    avgCoins: number;
    avgCardKeys: number;
    cardKeyPickRate: number;
    itemStats: Record<string, { picked: number; avgCount: number }>;
    sampleTrial: Record<string, number> | null;
  }
  interface SimHistoryEntry {
    id: string;
    timestamp: number;
    targetFans: number;
    targetCoins: number;
    summary: SimResultSummary;
  }
  const SIM_HISTORY_KEY = 'heist_sim_history_v1';
  const SIM_PROB_KEY = 'heist_sim_prob_v1';
  const SIM_PROB_OVERRIDE_KEY = 'heist_sim_prob_override_v1';
  const SIM_LIMITS_KEY = 'heist_sim_limits_v1';
  const SIM_CORRECTION_KEY = 'heist_sim_correction_v1';

  const COLOR_LABELS: Record<string, string> = { cyan: 'EH', yellow: '金', red: 'カードキー', purple: '紫', blue: '青', green: '緑' };
  const COLOR_DEFAULT_PROBS: Record<string, number> = { cyan: 0.001, yellow: 0.01, red: 0.01, purple: 0.05, blue: 0.3, green: 0.629 };

  const [showSimulator, setShowSimulator] = useState(false);
  const [simItems, setSimItems] = useState<SimFlatItem[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [simSimulating, setSimSimulating] = useState(false);
  const [simTargetFans, setSimTargetFans] = useState(0);
  const [simTargetCoins, setSimTargetCoins] = useState(0);
  const [simExcluded, setSimExcluded] = useState<Set<string>>(new Set());
  const [simLimits, setSimLimits] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(SIM_LIMITS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // migration: if too many limit-0 entries (old bug), discard all
      const zeroEntries = Object.values(parsed).filter(v => v === 0).length;
      if (zeroEntries > 10) return {};
      return parsed;
    } catch { return {}; }
  });
  const [simResult, setSimResult] = useState<SimResultSummary | null>(null);
  const [simHistory, setSimHistory] = useState<SimHistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(SIM_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // discard old-format entries (had `result` directly, no `summary`)
      return parsed.filter((e: any) => e && e.summary && typeof e.summary.successes === 'number');
    } catch { return []; }
  });
  const [simActiveTab, setSimActiveTab] = useState<'input' | 'prob' | 'result' | 'history'>('input');
  const [simProbs, setSimProbs] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(SIM_PROB_KEY);
      return raw ? JSON.parse(raw) : { ...COLOR_DEFAULT_PROBS };
    } catch { return { ...COLOR_DEFAULT_PROBS }; }
  });
  const [simProbOverrides, setSimProbOverrides] = useState<Record<string, number | null>>(() => {
    try {
      const raw = localStorage.getItem(SIM_PROB_OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [simTrialCount, setSimTrialCount] = useState(2000);
  const [simColorFilter, setSimColorFilter] = useState<Record<string, boolean>>(() => ({
    cyan: true, yellow: true, red: true, purple: true, blue: true, green: true
  }));
  const [simPlayerCount, setSimPlayerCount] = useState(() => {
    try { const raw = localStorage.getItem(SIM_CORRECTION_KEY); if (raw) { const p = JSON.parse(raw); return p.count ?? 1; } } catch {}
    return 1;
  });
  const [simMultipliers, setSimMultipliers] = useState<Record<number, number>>(() => {
    try { const raw = localStorage.getItem(SIM_CORRECTION_KEY); if (raw) { const p = JSON.parse(raw); return p.multipliers ?? { 2: 2, 3: 3, 4: 4 }; } } catch {}
    return { 2: 2, 3: 3, 4: 4 };
  });

  useEffect(() => { try { localStorage.setItem(SIM_PROB_KEY, JSON.stringify(simProbs)); } catch {} }, [simProbs]);
  useEffect(() => { try { localStorage.setItem(SIM_PROB_OVERRIDE_KEY, JSON.stringify(simProbOverrides)); } catch {} }, [simProbOverrides]);
  useEffect(() => { try { localStorage.setItem(SIM_LIMITS_KEY, JSON.stringify(simLimits)); } catch {} }, [simLimits]);
  useEffect(() => { try { localStorage.setItem(SIM_CORRECTION_KEY, JSON.stringify({ count: simPlayerCount, multipliers: simMultipliers })); } catch {} }, [simPlayerCount, simMultipliers]);

  const loadSimItems = useCallback(async () => {
    setSimLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/global-spawns`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const items: RegisteredItem[] = Array.isArray(data.items) ? data.items : [];
      const groupMap = new Map<string, SimItemGroup>();
      const flatList: SimFlatItem[] = [];
      for (const it of items) {
        const key = `${it.fans},${it.coins}`;
        flatList.push({ id: it.id, name: it.name, fans: it.fans, coins: it.coins, color: it.textColor, groupKey: key });
        if (groupMap.has(key)) {
          groupMap.get(key)!.names.push(it.name);
          groupMap.get(key)!.itemIds.push(it.id);
        } else {
          groupMap.set(key, { key, fans: it.fans, coins: it.coins, names: [it.name], itemIds: [it.id], color: it.textColor });
        }
      }
      const groups = Array.from(groupMap.values());
      groups.sort((a, b) => (b.fans * 1000 + b.coins) - (a.fans * 1000 + a.coins));
      setSimItems(flatList);
      setSimLimits(prev => {
        const next = { ...prev };
        for (const g of groups) {
          if (g.color === 'cyan' && !(g.key in prev)) {
            for (const id of g.itemIds) next[id] = 1;
          }
          for (let i = 0; i < g.names.length; i++) {
            if (g.names[i].includes('深紅のルビー') && !(g.itemIds[i] in prev)) next[g.itemIds[i]] = 0;
            if (g.names[i].includes('混沌の核') && !(g.itemIds[i] in prev)) next[g.itemIds[i]] = 0;
          }
        }
        return next;
      });
    } catch {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}global_spawns.json`);
        if (!res.ok) throw new Error('fallback failed');
        const data = await res.json();
        const items: RegisteredItem[] = Array.isArray(data.items) ? data.items : [];
        const groupMap = new Map<string, SimItemGroup>();
        const flatList: SimFlatItem[] = [];
        for (const it of items) {
          const key = `${it.fans},${it.coins}`;
          flatList.push({ id: it.id, name: it.name, fans: it.fans, coins: it.coins, color: it.textColor, groupKey: key });
          if (groupMap.has(key)) {
            groupMap.get(key)!.names.push(it.name);
            groupMap.get(key)!.itemIds.push(it.id);
          } else {
            groupMap.set(key, { key, fans: it.fans, coins: it.coins, names: [it.name], itemIds: [it.id], color: it.textColor });
          }
        }
        const groups = Array.from(groupMap.values());
        groups.sort((a, b) => (b.fans * 1000 + b.coins) - (a.fans * 1000 + a.coins));
        setSimItems(flatList);
        setSimLimits(prev => {
          const next = { ...prev };
          for (const g of groups) {
            for (let i = 0; i < g.names.length; i++) {
              if (g.names[i].includes('深紅のルビー') && !(g.itemIds[i] in prev)) next[g.itemIds[i]] = 0;
              if (g.names[i].includes('混沌の核') && !(g.itemIds[i] in prev)) next[g.itemIds[i]] = 0;
            }
          }
          return next;
        });
      } catch {}
    }
    setSimLoading(false);
  }, []);

  useEffect(() => { try { localStorage.setItem(SIM_HISTORY_KEY, JSON.stringify(simHistory)); } catch {} }, [simHistory]);

  const getEffectiveProbs = useCallback(() => {
    const base = { ...simProbs };
    if (simPlayerCount > 1) {
      const mult = simMultipliers[simPlayerCount] ?? simPlayerCount;
      return computeEffectiveProbsFor(base, mult);
    }
    const green = Math.max(0, 1 - ['cyan', 'yellow', 'red', 'purple', 'blue'].reduce((s, c) => s + (base[c] || 0), 0));
    return { ...base, green };
  }, [simProbs, simPlayerCount, simMultipliers]);

  const computeEffectiveProbsFor = (base: Record<string, number>, multiplier: number) => {
    const mc = ['cyan', 'yellow', 'red', 'purple'] as const;
    const adjusted: Record<string, number> = {};
    let totalIncrease = 0;
    for (const c of mc) {
      adjusted[c] = Math.min(1, (base[c] ?? 0) * multiplier);
      totalIncrease += adjusted[c] - (base[c] ?? 0);
    }
    adjusted.blue = Math.max(0, (base.blue ?? 0) - totalIncrease * ((base.blue ?? 0) / Math.max(0.001, (base.blue ?? 0) + (base.green ?? 0))));
    adjusted.green = Math.max(0, 1 - mc.reduce((s, c) => s + (adjusted[c] ?? 0), 0) - (adjusted.blue ?? 0));
    return adjusted;
  };

  const runSimulation = useCallback(async () => {
    const tf = simTargetFans;
    const tc = simTargetCoins;
    if (tf <= 0 && tc <= 0) return;
    setSimSimulating(true);

    // Build weighted pool from individual items
    const effProbs = getEffectiveProbs();
    const pool: { item: SimFlatItem; prob: number; limit: number }[] = [];
    for (const it of simItems) {
      if (simExcluded.has(it.id)) continue;
      const limit = simLimits[it.id] ?? -1;
      if (limit === 0) continue;
      const colorProb = effProbs[it.color] ?? 0;
      const effectiveProb = it.id in simProbOverrides && simProbOverrides[it.id] !== null ? simProbOverrides[it.id]! : colorProb;
      if (effectiveProb <= 0) continue;
      pool.push({ item: it, prob: effectiveProb, limit });
    }

    const TRIALS = Math.max(100, simTrialCount);
    const MAX_DRAWS = 100000;
    const stats: SimTrialResult[] = [];

    const totalProb = pool.reduce((s, p) => s + p.prob, 0);
    if (totalProb <= 0) { setSimSimulating(false); return; }
    const cdf: { item: SimFlatItem; prob: number; limit: number; cumProb: number }[] = [];
    let cum = 0;
    for (const p of pool) {
      cum += p.prob / totalProb;
      cdf.push({ ...p, cumProb: cum });
    }

    const rollItem = (itemCounts: Record<string, number>): SimFlatItem | null => {
      const r = Math.random();
      for (const entry of cdf) {
        if (r <= entry.cumProb) {
          const current = itemCounts[entry.item.id] || 0;
          if (entry.limit > 0 && current >= entry.limit) return null;
          return entry.item;
        }
      }
      return null;
    };

    for (let t = 0; t < TRIALS; t++) {
      const itemCounts: Record<string, number> = {};
      let totalFans = 0;
      let totalCoins = 0;
      let cardKeys = 0;
      let pickedCardKey = false;

      for (let d = 0; d < MAX_DRAWS; d++) {
        const picked = rollItem(itemCounts);
        if (!picked) continue;
        itemCounts[picked.id] = (itemCounts[picked.id] || 0) + 1;
        if (picked.color === 'red') { cardKeys++; pickedCardKey = true; }
        totalFans += picked.fans;
        totalCoins += picked.coins;
        if (totalFans >= tf && totalCoins >= tc) break;
      }

      stats.push({
        success: totalFans >= tf && totalCoins >= tc,
        totalItems: Object.values(itemCounts).reduce((a, b) => a + b, 0),
        totalFans,
        totalCoins,
        counts: itemCounts,
        cardKeys,
        pickedCardKey,
      });
    }

    const successes = stats.filter(s => s.success);
    const successCount = successes.length;
    const itemsList = successes.map(s => s.totalItems).sort((a, b) => a - b);
    const avgTotalItems = itemsList.length > 0 ? Math.round(itemsList.reduce((a, b) => a + b, 0) / itemsList.length) : 0;

    // Per-item stats across all items
    const perItemStats: Record<string, { picked: number; avgCount: number }> = {};
    for (const it of simItems) {
      let picked = 0;
      let totalCount = 0;
      for (const s of stats) {
        const cnt = s.counts[it.id] || 0;
        if (cnt > 0) picked++;
        totalCount += cnt;
      }
      perItemStats[it.id] = { picked, avgCount: stats.length > 0 ? totalCount / stats.length : 0 };
    }

    let sampleTrial: Record<string, number> | null = null;
    if (successCount > 0) {
      const sorted = successes.slice().sort((a, b) => a.totalItems - b.totalItems);
      const median = sorted[Math.floor(sorted.length / 2)];
      sampleTrial = median.counts;
    }

    const summary: SimResultSummary = {
      trials: TRIALS,
      successes: successCount,
      avgTotalItems,
      avgFans: Math.round(successes.reduce((a, s) => a + s.totalFans, 0) / (successCount || 1)),
      avgCoins: Math.round(successes.reduce((a, s) => a + s.totalCoins, 0) / (successCount || 1)),
      avgCardKeys: stats.reduce((s, t) => s + t.cardKeys, 0) / stats.length,
      cardKeyPickRate: stats.filter(t => t.pickedCardKey).length / stats.length,
      itemStats: perItemStats,
      sampleTrial,
    };

    setSimResult(summary);
    setSimActiveTab('result');

    const entry: SimHistoryEntry = {
      id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      targetFans: tf,
      targetCoins: tc,
      summary,
    };
    setSimHistory(prev => [entry, ...prev].slice(0, 100));
    setSimSimulating(false);
  }, [simTargetFans, simTargetCoins, simItems, simExcluded, simLimits, simProbOverrides, simTrialCount, getEffectiveProbs]);

  // Direct OCR paste integration state
  const [ocrImg1, setOcrImg1] = useState<string | null>(null);
  const [ocrImg2, setOcrImg2] = useState<string | null>(null);
  const [modalOcrStatus, setModalOcrStatus] = useState<string>('');
  const [modalOcrProgress, setModalOcrProgress] = useState<number>(0);
  const [focus1, setFocus1] = useState(false);
  const [focus2, setFocus2] = useState(false);
  const [ocrPresets, setOcrPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  const fileInputRef1 = useRef<HTMLInputElement | null>(null);
  const fileInputRef2 = useRef<HTMLInputElement | null>(null);

  // One-time startup database migration to clean system presets
  useEffect(() => {
    try {
      const savedPresets = localStorage.getItem('heist_ocr_multi_presets');
      if (savedPresets) {
        const presets: any[] = JSON.parse(savedPresets);
        const cleaned = presets.filter(p => p.id !== 'ocr_preset_dadada_default' && p.id !== 'ocr_preset_dada_default');
        if (presets.length !== cleaned.length) {
          localStorage.setItem('heist_ocr_multi_presets', JSON.stringify(cleaned));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // --- Sound Player state ---
  const [playlist, setPlaylist] = useState<{ id: string; url: string; title: string }[]>(() => {
    try {
      const saved = localStorage.getItem('nikukyu_playlist_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
{ id: 'default', url: 'https://youtu.be/AcfvpsDO6jI?si=zypwUpXy1pYtPlk5', title: '🎶 NTE: Neverness to Everness - EXP & Beetle Coins Stage | 이환 BGM OST Music / NTE Creator' }
    ];
  });
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [shuffleMode, setShuffleMode] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<boolean>(false);
  const [newUrlInput, setNewUrlInput] = useState<string>('');
  const [newTitleInput, setNewTitleInput] = useState<string>('');
  const [showAddUrl, setShowAddUrl] = useState<boolean>(false);

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const currentVideoId = useMemo(() => {
    if (playlist.length === 0) return null;
    return extractVideoId(playlist[currentTrackIndex]?.url || '');
  }, [playlist, currentTrackIndex]);

  // --- YouTube IFrame Player API ---
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useMemo(() => `yt-player-${Math.random().toString(36).slice(2, 8)}`, []);
  const [playerReady, setPlayerReady] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);
  const shuffleModeRef = useRef(shuffleMode);
  const playlistLenRef = useRef(playlist.length);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { shuffleModeRef.current = shuffleMode; }, [shuffleMode]);
  useEffect(() => { playlistLenRef.current = playlist.length; }, [playlist.length]);

  useEffect(() => {
    let destroyed = false;

    const createPlayer = () => {
      if (destroyed || ytPlayerRef.current) return;
      if (!document.getElementById(ytContainerId)) return;

      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        videoId: currentVideoId || undefined,
        playerVars: {
          autoplay: 0,
          enablejsapi: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!destroyed) setPlayerReady(true);
          },
          onStateChange: (e: any) => {
            if (e.data === 0) {
              if (repeatModeRef.current) {
                ytPlayerRef.current?.seekTo(0);
                ytPlayerRef.current?.playVideo();
              } else {
                setCurrentTrackIndex(prev => {
                  if (shuffleModeRef.current) {
                    return Math.floor(Math.random() * playlistLenRef.current);
                  }
                  return (prev + 1) % playlistLenRef.current;
                });
              }
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      destroyed = true;
      window.onYouTubeIframeAPIReady = undefined;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      setPlayerReady(false);
    };
  }, []);

  useEffect(() => {
    if (!playerReady || !ytPlayerRef.current) return;
    if (isPlaying) {
      ytPlayerRef.current.playVideo();
    } else {
      ytPlayerRef.current.pauseVideo();
    }
  }, [isPlaying, playerReady]);

  useEffect(() => {
    if (!playerReady || !ytPlayerRef.current || !currentVideoId) return;
    ytPlayerRef.current.loadVideoById(currentVideoId);
    if (!isPlayingRef.current) {
      const timer = setTimeout(() => {
        ytPlayerRef.current?.pauseVideo();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentVideoId, playerReady]);

  useEffect(() => {
    localStorage.setItem('nikukyu_playlist_v1', JSON.stringify(playlist));
  }, [playlist]);

  useEffect(() => {
    savePlayData(state);
  }, [state]);

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      setState(checkAutoReset(loadPlayData()));
    }
  }, [refreshKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setState(prev => {
        const next = checkAutoReset(prev);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  // --- Derived values ---
  const nikukyuuCurrent = useMemo(
    () => calculateNikukyuuPoints(state.currentFans),
    [state.currentFans]
  );

  const fansWithBonus = useMemo(
    () => applyRequiemBonus(state.currentFans, state.requiem15, state.requiem20),
    [state.currentFans, state.requiem15, state.requiem20]
  );

  const coinsWithBonus = useMemo(
    () => applyRequiemBonus(state.currentCoins, state.requiem15, state.requiem20),
    [state.currentCoins, state.requiem15, state.requiem20]
  );

  const remaining = useMemo(() => getRemainingCap(state), [state]);
  const average = useMemo(() => getAverage(state.records), [state.records]);
  const timeUntilReset = useMemo(() => getTimeUntilReset(state.periodStart), [state.periodStart]);

  // --- Handlers ---
  const setCurrentFans = (v: number) => {
    setState(prev => ({ ...prev, currentFans: Math.max(0, v) }));
  };
  const setCurrentCoins = (v: number) => {
    setState(prev => ({ ...prev, currentCoins: Math.max(0, v) }));
  };

  // Requiem toggles are mutually exclusive — only one bonus applies at a time.
  const setRequiem15 = (v: boolean) => {
    setState(prev => ({ ...prev, requiem15: v, requiem20: v ? false : prev.requiem20 }));
  };
  const setRequiem20 = (v: boolean) => {
    setState(prev => ({ ...prev, requiem20: v, requiem15: v ? false : prev.requiem15 }));
  };

  const setRecordedLocation = (v: string) => {
    setState(prev => ({ ...prev, recordedLocation: v }));
  };

  const handleEscape = () => {
    if (state.currentFans <= 0 && state.currentCoins <= 0) {
      notify(t('現在値が空です。ファンスかコインを入力してください'));
      return;
    }
    const now = Date.now();
    const post = checkAutoReset(state, now);
    const addedFans = Math.min(state.currentFans, Math.max(0, BIWEEKLY_FANS_CAP - post.recordedFans));
    const addedCoins = Math.min(state.currentCoins, Math.max(0, BIWEEKLY_COINS_CAP - post.recordedCoins));
    const addedNikukyuu = nikukyuuCurrent;
    const finalLocation = state.recordedLocation.trim() || routeTitle.trim();
    const newRecord: PlayDataRecord = {
      id: generateRecordId(),
      timestamp: now,
      fans: state.currentFans,
      coins: state.currentCoins,
      location: finalLocation,
      requiem15: state.requiem15,
      requiem20: state.requiem20,
      excluded: false
    };
    setState({
      ...post,
      currentFans: 0,
      currentCoins: 0,
      recordedFans: post.recordedFans + addedFans,
      recordedCoins: post.recordedCoins + addedCoins,
      recordedNikukyuu: post.recordedNikukyuu + addedNikukyuu,
      records: [...post.records, newRecord]
    });
    const capNote = addedFans < state.currentFans || addedCoins < state.currentCoins ? t(' (上限に達したため一部のみ加算)') : '';
    notify(t('脱出記録を追加しました{0}', capNote));
  };

  const handleResetCurrent = () => {
    setState(prev => ({ ...prev, currentFans: 0, currentCoins: 0 }));
    notify(t('現在値をリセットしました'));
  };

  const handleManualResetPeriod = () => {
    if (!window.confirm(t('記録値（累計）と現在値を全てリセットします。よろしいですか？'))) return;
    setState(prev => ({
      ...prev,
      recordedFans: 0,
      recordedCoins: 0,
      recordedNikukyuu: 0,
      currentFans: 0,
      currentCoins: 0,
      periodStart: checkAutoReset({ ...prev, periodStart: 0 }).periodStart,
      records: []
    }));
    notify(t('記録値と現在値をリセットしました'));
  };

  // --- Goal handlers ---
  const handleAddGoal = () => {
    const name = newGoal.name.trim();
    const target = parseInt(newGoal.target) || 0;
    const reward = parseInt(newGoal.reward) || 0;
    if (!name || target <= 0) {
      notify(t('目標名と目標数を入力してください'));
      return;
    }
    const goal: WeeklyGoal = {
      id: generateGoalId(),
      name,
      target,
      current: 0,
      reward: reward > 0 ? reward : undefined,
      completed: false
    };
    setState(prev => ({ ...prev, goals: [...prev.goals, goal] }));
    setNewGoal({ name: '', target: '', reward: '' });
    setShowAddGoal(false);
    notify(t('目標を追加しました: {0}', name));
  };

  const handleDeleteGoal = (id: string) => {
    if (!window.confirm(t('この目標を削除しますか？'))) return;
    setState(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== id) }));
    notify(t('目標を削除しました'));
  };

  const handleToggleGoalCompleted = (id: string) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== id) return g;
        const completed = !g.completed;
        return { ...g, completed, current: completed ? Math.max(g.current, g.target) : g.current };
      })
    }));
  };

  const handleUpdateGoalCurrent = (id: string, current: number) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, current, completed: current >= g.target && g.target > 0 } : g)
    }));
  };

  const handleUpdateGoalTarget = (id: string, target: number) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, target, completed: g.current >= target && target > 0 } : g)
    }));
  };

  const handleUpdateGoalName = (id: string, name: string) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, name } : g)
    }));
  };

  const handleClearAllGoals = () => {
    if (state.goals.length === 0) return;
    // Two-step confirmation: first click arms, second click confirms.
    // Avoids window.confirm (unreliable in some embedded contexts) and
    // accidental deletion from misclicks.
    if (!confirmClearGoals) {
      setConfirmClearGoals(true);
      return;
    }
    setState(prev => ({ ...prev, goals: [] }));
    setConfirmClearGoals(false);
    notify(t('今週の目標を全て削除しました'));
  };

  // --- Text-input goal parser ---
  const handleParseTextGoals = () => {
    const parsed = parseGoalsFromInput(textGoalInput);
    if (parsed.length === 0) {
      notify(t('「を」を含む行が見つかりません'));
      return;
    }
    setTextGoalParsed(parsed.map(g => ({
      name: g.name,
      target: String(g.target),
      reward: g.reward > 0 ? String(g.reward) : ''
    })));
    notify(t('{0}件検出', parsed.length));
  };

  const handleAddParsedTextGoals = () => {
    const valid = textGoalParsed.filter(g => g.name.trim() && parseInt(g.target.replace(/,/g, '')) > 0);
    if (valid.length === 0) {
      notify(t('追加できる目標がありません'));
      return;
    }
    const existing = new Set(state.goals.map(g => g.name.replace(/\s+/g, '').toLowerCase()));
    const toAdd = valid.filter(g => !existing.has(g.name.replace(/\s+/g, '').toLowerCase()));
    const skipped = valid.length - toAdd.length;
    const newGoals: WeeklyGoal[] = toAdd.map(g => {
      const target = parseInt(g.target.replace(/,/g, '')) || 0;
      const reward = parseInt(g.reward.replace(/,/g, '')) || 0;
      return {
        id: generateGoalId(),
        name: g.name.trim(),
        target,
        current: 0,
        reward: reward > 0 ? reward : undefined,
        completed: false
      };
    });
    setState(prev => ({ ...prev, goals: [...prev.goals, ...newGoals] }));
    notify(t('{0}件追加{1}', newGoals.length, skipped > 0 ? t(' (重複{0}件スキップ)', skipped) : ''));
    setShowTextGoalModal(false);
    setTextGoalInput('');
    setTextGoalParsed([]);
    setOcrImg1(null);
    setOcrImg2(null);
    setModalOcrStatus('');
    setModalOcrProgress(0);
  };

  const handleCloseTextGoalModal = () => {
    setShowTextGoalModal(false);
    setTextGoalInput('');
    setTextGoalParsed([]);
    setOcrImg1(null);
    setOcrImg2(null);
    setModalOcrStatus('');
    setModalOcrProgress(0);
  };

  useEffect(() => {
    if (showTextGoalModal) {
      try {
        const saved = localStorage.getItem('heist_ocr_multi_presets');
        if (saved) {
          const parsed = JSON.parse(saved);
          setOcrPresets(parsed);
          if (parsed.length > 0) {
            const activeId = localStorage.getItem('heist_ocr_active_preset_id') || '';
            const exists = parsed.some((p: any) => p.id === activeId);
            setSelectedPresetId(exists ? activeId : parsed[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [showTextGoalModal]);

  const runDirectOcr = async () => {
    if (!ocrImg1 && !ocrImg2) {
      notify(t('画像を貼り付けてください'));
      return;
    }

    setModalOcrStatus('Tesseract.jsを読み込み中...');
    setModalOcrProgress(0.05);

    try {
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

      setModalOcrStatus('OCRエンジン初期化中...');
      setModalOcrProgress(0.15);

      const worker = await Tesseract.createWorker('eng+jpn', 1);

      // Try to load user's actual preset coordinates
      let activePresetRegions: any[] | null = null;
      let activePresetBaseWidth = 3840;
      let activePresetBaseHeight = 2160;
      if (selectedPresetId) {
        const found = ocrPresets.find(x => x.id === selectedPresetId);
        if (found && found.regions && found.regions.length > 0) {
          activePresetRegions = found.regions;
          activePresetBaseWidth = found.baseWidth || 3840;
          activePresetBaseHeight = found.baseHeight || 2160;
        }
      }

      if (!activePresetRegions) {
        try {
          // Fallback 1. Look at currently active regions in the workspace
          const savedRegions = localStorage.getItem('heist_ocr_regions');
          if (savedRegions) {
            const parsed = JSON.parse(savedRegions);
            if (parsed && parsed.length > 0) {
              activePresetRegions = parsed;
            }
          }
        } catch (e) {
          console.error('Failed to load user presets from localStorage', e);
        }
      }

      // Fallback/Default specs (3840x2160 screen)
      let cropSpecs = [
        { name: 'R1_text', x: 1250, y: 795, w: 1200, h: 40, whitelist: '', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R1_reward', x: 2548, y: 795, w: 120, h: 40, whitelist: '0123456789$,.', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R2_text', x: 1250, y: 925, w: 1200, h: 40, whitelist: '', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R2_reward', x: 2548, y: 925, w: 120, h: 40, whitelist: '0123456789$,.', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R3_text', x: 1250, y: 1055, w: 1200, h: 40, whitelist: '', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R3_reward', x: 2548, y: 1055, w: 120, h: 40, whitelist: '0123456789$,.', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R4_text', x: 1250, y: 1185, w: 1200, h: 40, whitelist: '', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 },
        { name: 'R4_reward', x: 2548, y: 1185, w: 120, h: 40, whitelist: '0123456789$,.', psm: '7', scale: 2, thresholdVal: 128, thresholdEnabled: true, grayscaleEnabled: true, invertEnabled: false, baseWidth: 3840, baseHeight: 2160 }
      ];

      if (activePresetRegions) {
        cropSpecs = activePresetRegions.map((r) => ({
          name: r.name,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          whitelist: r.whitelist || '',
          psm: r.psm || '7',
          scale: typeof r.scale === 'number' ? r.scale : 2,
          thresholdVal: typeof r.thresholdVal === 'number' ? r.thresholdVal : 128,
          thresholdEnabled: r.thresholdEnabled !== false,
          grayscaleEnabled: r.grayscaleEnabled !== false,
          invertEnabled: !!r.invertEnabled,
          baseWidth: activePresetBaseWidth,
          baseHeight: activePresetBaseHeight
        }));
      }

      // Helper function to load image and crop
      const cropImage = (imgSrc: string, spec: typeof cropSpecs[0]): Promise<string> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(''); return; }

            const baseW = (spec as any).baseWidth || 3840;
            const baseH = (spec as any).baseHeight || 2160;
            const scaleX = img.width / baseW;
            const scaleY = img.height / baseH;

            const rx = Math.round(spec.x * scaleX);
            const ry = Math.round(spec.y * scaleY);
            const rw = Math.max(1, Math.round(spec.w * scaleX));
            const rh = Math.max(1, Math.round(spec.h * scaleY));

            const currentScale = spec.scale;
            canvas.width = rw * currentScale;
            canvas.height = rh * currentScale;

            ctx.imageSmoothingEnabled = false;
            // Draw image cropped
            ctx.drawImage(
              img,
              rx, ry, rw, rh,
              0, 0, canvas.width, canvas.height
            );

            // Apply Grayscale and Thresholding filter
            try {
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const data = imgData.data;
              for (let i = 0; i < data.length; i += 4) {
                const red = data[i];
                const green = data[i+1];
                const blue = data[i+2];
                // Grayscale
                let v = red;
                if (spec.grayscaleEnabled) {
                  v = 0.299 * red + 0.587 * green + 0.114 * blue;
                }
                // Thresholding
                let val = v;
                if (spec.thresholdEnabled) {
                  val = v >= spec.thresholdVal ? 255 : 0;
                }
                if (spec.invertEnabled) {
                  val = 255 - val;
                }
                data[i] = data[i+1] = data[i+2] = val;
              }
              ctx.putImageData(imgData, 0, 0);
            } catch (e) {}

            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve('');
          img.src = imgSrc;
        });
      };

      const getOcrRows = async (imgSrc: string, specs: any[]): Promise<{ goalName: string; requiredQty: string; reward: string }[]> => {
        const sortedByY = [...specs].sort((a, b) => a.y - b.y);
        const rows: { textRegion: any; rewardRegion: any }[] = [];
        for (let i = 0; i < sortedByY.length; i += 2) {
          if (i + 1 < sortedByY.length) {
            const regA = sortedByY[i];
            const regB = sortedByY[i + 1];
            const [left, right] = regA.x < regB.x ? [regA, regB] : [regB, regA];
            rows.push({ textRegion: left, rewardRegion: right });
          }
        }

        const parsedRows: { goalName: string; requiredQty: string; reward: string }[] = [];
        for (const row of rows) {
          // OCR Text
          const textUrl = await cropImage(imgSrc, row.textRegion);
          let rawGoalText = '';
          if (textUrl) {
            await worker.setParameters({
              tessedit_char_whitelist: row.textRegion.whitelist || '',
              tessedit_pageseg_mode: row.textRegion.psm || '7'
            });
            const res = await worker.recognize(textUrl);
            rawGoalText = res.data.text ? res.data.text.trim() : '';
          }

          // OCR Reward
          const rewardUrl = await cropImage(imgSrc, row.rewardRegion);
          let rewardVal = '';
          if (rewardUrl) {
            await worker.setParameters({
              tessedit_char_whitelist: row.rewardRegion.whitelist || '0123456789$,.',
              tessedit_pageseg_mode: row.rewardRegion.psm || '7'
            });
            const res = await worker.recognize(rewardUrl);
            rewardVal = res.data.text ? res.data.text.trim().replace(/\s+/g, '').replace(/[®©]/g, '') : '';
          }

          const cleanGoalText = rawGoalText.replace(/\s+/g, '').replace(/[®©]/g, '');
          let goalName = cleanGoalText;
          if (cleanGoalText.includes('を')) {
            goalName = cleanGoalText.split('を')[0];
          }
          const numMatch = cleanGoalText.match(/[\d,]+/);
          const requiredQty = numMatch ? numMatch[0] : '-';

          parsedRows.push({ goalName, requiredQty, reward: rewardVal });
        }
        return parsedRows;
      };

      const final6Slots: { goalName: string; requiredQty: string; reward: string }[] = Array.from({ length: 6 }, () => ({ goalName: '', requiredQty: '', reward: '' }));

      if (ocrImg1) {
        setModalOcrStatus('SS1枚目の解析中...');
        setModalOcrProgress(0.2);
        const ss1Rows = await getOcrRows(ocrImg1, cropSpecs);
        ss1Rows.forEach((row, idx) => {
          if (idx < 4) {
            final6Slots[idx] = row;
          }
        });
        setModalOcrProgress(0.5);
      }

      if (ocrImg2) {
        setModalOcrStatus('SS2枚目の解析中...');
        setModalOcrProgress(0.6);
        const ss2Rows = await getOcrRows(ocrImg2, cropSpecs);
        ss2Rows.forEach((row, idx) => {
          if (idx + 2 < 6) {
            final6Slots[idx + 2] = row;
          }
        });
        setModalOcrProgress(0.9);
      }

      const filtered = final6Slots.filter(itm => itm.goalName.trim() !== '');
      setTextGoalParsed(filtered.map(itm => ({
        name: itm.goalName,
        target: itm.requiredQty,
        reward: itm.reward
      })));

      await worker.terminate();
      setModalOcrStatus('一括認識完了');
      setModalOcrProgress(1);
      setTimeout(() => {
        setModalOcrStatus('');
        setModalOcrProgress(0);
      }, 2000);
      notify(t('OCR解析が完了しました'));
    } catch (err) {
      console.error(err);
      setModalOcrStatus('エラーが発生しました');
      setModalOcrProgress(0);
      notify(t('OCR認識エラー'));
    }
  };

  // --- Cumulative field handlers ---
  const handleUpdateCumulative = (field: CumulativeField, value: number) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  // --- Sound Player handlers ---
  const handleAddUrl = () => {
    const url = newUrlInput.trim();
    if (!url) { notify(t('URLを入力してください')); return; }
    const videoId = extractVideoId(url);
    if (!videoId) { notify(t('有効なYouTube URLではありません')); return; }
    const title = newTitleInput.trim() || `曲 ${playlist.length + 1}`;
    setPlaylist(prev => [...prev, { id: Date.now().toString(), url: `https://www.youtube.com/watch?v=${videoId}`, title }]);
    setNewUrlInput('');
    setNewTitleInput('');
    setShowAddUrl(false);
    notify(t('プレイリストに追加しました: {0}', title));
  };

  const handleRemoveTrack = (id: string) => {
    setPlaylist(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) return [{ id: 'default', url: 'https://youtu.be/AcfvpsDO6jI?si=zypwUpXy1pYtPlk5', title: '🎶 NTE: Neverness to Everness - EXP & Beetle Coins Stage | 이환 BGM OST Music / NTE Creator' }];
      return next;
    });
    setCurrentTrackIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextTrack = useCallback(() => {
    if (shuffleMode) {
      setCurrentTrackIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentTrackIndex(prev => (prev + 1) % playlist.length);
    }
  }, [playlist.length, shuffleMode]);

  const handlePrevTrack = () => {
    setCurrentTrackIndex(prev => (prev - 1 + playlist.length) % playlist.length);
  };

  const handlePlayTrack = (index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  };

  // --- Records handlers ---
  const handleToggleExcluded = (id: string) => {
    setState(prev => ({
      ...prev,
      records: prev.records.map(r => r.id === id ? { ...r, excluded: !r.excluded } : r)
    }));
  };

  const handleDeleteRecord = (id: string) => {
    if (!window.confirm(t('この記録を削除しますか？'))) return;
    setState(prev => ({ ...prev, records: prev.records.filter(r => r.id !== id) }));
    notify(t('記録を削除しました'));
  };

  const handleStartEditLocation = (rec: PlayDataRecord) => {
    setEditingRecordId(rec.id);
    setEditingLocation(rec.location);
  };

  const handleSaveLocation = (id: string) => {
    setState(prev => ({
      ...prev,
      records: prev.records.map(r => r.id === id ? { ...r, location: editingLocation } : r)
    }));
    setEditingRecordId(null);
    setEditingLocation('');
  };

  const handleCancelEditLocation = () => {
    setEditingRecordId(null);
    setEditingLocation('');
  };

  const handleExportCSV = () => {
    if (state.records.length === 0) {
      notify(t('エクスポートする記録がありません'));
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(state.records, `heist_escape_records_${date}.csv`);
    notify(t('{0}件の記録をCSVエクスポートしました', state.records.length));
  };

  // --- Styling helpers ---
  const sectionStyle: React.CSSProperties = {
    background: 'rgba(10, 15, 28, 0.6)',
    border: '1px solid rgba(0, 240, 255, 0.2)',
    borderRadius: '6px',
    padding: '8px',
    marginTop: '8px'
  };

  const labelBaseStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--cyan-neon)',
    fontWeight: 700,
    marginBottom: '4px',
    display: 'block'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box'
  };

  const smallText: React.CSSProperties = {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginTop: '2px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* ====================================================== */}
      {/* 次の更新                                                */}
      {/* ====================================================== */}
      <div
        style={{
          ...sectionStyle,
          marginTop: 0,
          borderColor: 'rgba(57, 255, 20, 0.4)',
          background: 'rgba(57, 255, 20, 0.07)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Clock size={14} color="var(--green-neon)" />
          <span style={{ fontSize: '13px', color: 'var(--green-neon)', fontWeight: 700 }}>{t('次回更新 (隔週月曜 5:00)')}</span>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace' }}>
          {formatNextReset(state.periodStart)}
        </div>
        {timeUntilReset && timeUntilReset.total > 0 && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '18px',
              color: 'var(--yellow-neon)',
              fontWeight: 900,
              fontFamily: 'monospace',
              textShadow: '0 0 4px rgba(255,230,0,0.4)'
            }}
          >
            {t('あと {0}日 {1}時間', timeUntilReset.days, timeUntilReset.hours)}
          </div>
        )}
        <div
          style={{
            marginTop: '6px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px'
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>{t('残りファンス')}</span>
          <span style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontFamily: 'monospace' }}>
            {remaining.fans.toLocaleString()}
          </span>
        </div>
        <div style={{ ...smallText, marginTop: '4px' }}>{t('ファンス上限と目標のリセット')}</div>
      </div>

      {/* ====================================================== */}
      {/* 今回の獲得                                              */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={labelBaseStyle}>{t('🐾 今回の獲得')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('$ ファンス')}</div>
            <input
              type="number"
              min="0"
              step="100"
              className="input-cyber"
              style={inputStyle}
              value={state.currentFans || ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setCurrentFans(0);
                } else {
                  const n = parseInt(raw);
                  setCurrentFans(isNaN(n) ? 0 : Math.max(0, n));
                }
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('🪙 コイン')}</div>
            <input
              type="number"
              min="0"
              step="1"
              className="input-cyber"
              style={inputStyle}
              value={state.currentCoins || ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setCurrentCoins(0);
                } else {
                  const n = parseInt(raw);
                  setCurrentCoins(isNaN(n) ? 0 : Math.max(0, n));
                }
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: '6px',
            padding: '5px 8px',
            background: 'rgba(255, 215, 0, 0.08)',
            border: '1px solid rgba(255, 215, 0, 0.25)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>🐾</span>
            <span style={{ fontSize: '11px', color: 'var(--yellow-neon)', fontWeight: 700 }}>{t('にくきゅうポイント')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace' }}>
              {nikukyuuCurrent}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>pt</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <label
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontSize: '12px',
              color: state.requiem15 ? '#a855f7' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '5px 6px',
              border: `1px solid ${state.requiem15 ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem15 ? 'rgba(168,85,247,0.15)' : 'transparent',
              fontWeight: state.requiem15 ? 700 : 400
            }}
          >
            <input
              type="checkbox"
              checked={state.requiem15}
              onChange={(e) => setRequiem15(e.target.checked)}
              style={{ accentColor: '#a855f7', cursor: 'pointer' }}
            />
            {t('+15% レクイエム')}
          </label>
          <label
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontSize: '12px',
              color: state.requiem20 ? 'var(--yellow-neon, #ffe600)' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '5px 6px',
              border: `1px solid ${state.requiem20 ? 'rgba(255,230,0,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem20 ? 'rgba(255,230,0,0.15)' : 'transparent',
              fontWeight: state.requiem20 ? 700 : 400
            }}
          >
            <input
              type="checkbox"
              checked={state.requiem20}
              onChange={(e) => setRequiem20(e.target.checked)}
              style={{ accentColor: 'var(--yellow-neon, #ffe600)', cursor: 'pointer' }}
            />
            {t('+20% レクイエム')}
          </label>
        </div>

        <div
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255, 230, 0, 0.3)',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('ボーナス適用後 $ ファンス')}</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace', textShadow: '0 0 4px rgba(255,230,0,0.5)' }}>
              {fansWithBonus.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('ボーナス適用後 🪙 コイン')}</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace', textShadow: '0 0 4px rgba(255,230,0,0.5)' }}>
              {coinsWithBonus.toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '10px' }}>
          <input
            type="text"
            className="input-cyber"
            style={inputStyle}
            value={state.recordedLocation}
            onChange={(e) => setRecordedLocation(e.target.value)}
            placeholder={routeTitle
              ? t('📍 記録名 (デフォルトはプラン名)')
              : t('📍 記録名 (例: 本日 1回目)')}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <button
            className="btn-cyber success"
            style={{ flex: 2, padding: '7px', fontSize: '13px', fontWeight: 700 }}
            onClick={handleEscape}
            title={t('現在の値を記録値に加算してリストに追加 (現在値は自動リセット)')}
          >
            {t('🚪 脱出 (加算)')}
          </button>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '7px', fontSize: '10px' }}
            onClick={handleResetCurrent}
            title={t('入力中の現在値のみリセット (加算しない)')}
          >
            {t('現在値リセット')}
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* 累計値 (Cumulative, with NumberInput)                    */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BarChart3 size={12} color="var(--cyan-neon)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>{t('累計値 (クリックで編集)')}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('$ ファンス累計 ')}<span style={{ fontSize: '9px' }}>{t('(隔週リセット)')}</span>:
              </span>
              <span>
                <NumberInput
                  value={state.recordedFans}
                  onChange={(v) => handleUpdateCumulative('recordedFans', v)}
                  step={1}
                  width={100}
                  accent="var(--cyan-neon)"
                />
                <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>/ {BIWEEKLY_FANS_CAP.toLocaleString()}</span>
              </span>
            </div>
            <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (state.recordedFans / BIWEEKLY_FANS_CAP) * 100)}%`,
                  background: state.recordedFans >= BIWEEKLY_FANS_CAP ? 'var(--red-neon)' : 'var(--cyan-neon)',
                  transition: 'width 0.2s'
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('🪙 コイン累計 ')}<span style={{ fontSize: '9px' }}>{t('(累積)')}</span>:
              </span>
              <span>
              <NumberInput
                value={state.recordedCoins}
                onChange={(v) => handleUpdateCumulative('recordedCoins', v)}
                step={1}
                width={110}
                accent="var(--cyan-neon)"
              />
                <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>/ {BIWEEKLY_COINS_CAP.toLocaleString()}</span>
              </span>
            </div>
            <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (state.recordedCoins / BIWEEKLY_COINS_CAP) * 100)}%`,
                  background: state.recordedCoins >= BIWEEKLY_COINS_CAP ? 'var(--red-neon)' : 'var(--cyan-neon)',
                  transition: 'width 0.2s'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {t('🐾 にくきゅうpt累計 ')}<span style={{ fontSize: '9px' }}>{t('(累積)')}</span>:
            </span>
            <span>
              <NumberInput
                value={state.recordedNikukyuu}
                onChange={(v) => handleUpdateCumulative('recordedNikukyuu', v)}
                step={1}
                width={110}
                accent="var(--yellow-neon)"
              />
              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>pt</span>
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* 今週の目標                                              */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Target size={12} color="var(--magenta-neon, #ff00ff)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>{t('今週の目標 ({0}件)', state.goals.length)}</span>
          {state.goals.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
              {confirmClearGoals ? (
                <>
                  <button
                    className="btn-cyber danger"
                    style={{ padding: '1px 6px', fontSize: '9px', lineHeight: 1.4 }}
                    onClick={handleClearAllGoals}
                    title={t('クリックで削除実行')}
                  >
                    {t('✓ 削除する')}
                  </button>
                  <button
                    className="btn-cyber"
                    style={{ padding: '1px 6px', fontSize: '9px', lineHeight: 1.4 }}
                    onClick={() => setConfirmClearGoals(false)}
                    title={t('キャンセル')}
                  >
                    {t('取消')}
                  </button>
                </>
              ) : (
                <button
                  className="btn-cyber"
                  style={{ padding: '1px 6px', fontSize: '9px', opacity: 0.55, lineHeight: 1.4 }}
                  onClick={handleClearAllGoals}
                  title={t('全削除 (確認あり)')}
                >
                  <Trash2 size={9} /> {t('全削除')}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setShowAddGoal(true)}
          >
            <Plus size={10} /> {t('目標を追加')}
          </button>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setShowTextGoalModal(true)}
            title={t('テキストから複数行を一括追加')}
          >
            <Type size={10} /> {t('テキストから')}
          </button>
        </div>

        {showAddGoal && (
          <div
            style={{
              background: 'rgba(255,0,255,0.05)',
              border: '1px solid rgba(255,0,255,0.25)',
              borderRadius: '4px',
              padding: '6px',
              marginBottom: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <input
              type="text"
              className="input-cyber"
              style={{ ...inputStyle, fontSize: '11px', padding: '3px 6px' }}
              value={newGoal.name}
              onChange={(e) => setNewGoal(g => ({ ...g, name: e.target.value }))}
              placeholder={t('目標名 (例: 金塊を240個集める)')}
              autoFocus
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <input
                type="number"
                min="1"
                className="input-cyber"
                style={{ fontSize: '11px', padding: '3px 6px' }}
                value={newGoal.target}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setNewGoal(g => ({ ...g, target: '' }));
                  } else {
                    const n = parseInt(raw);
                    setNewGoal(g => ({ ...g, target: isNaN(n) ? '' : String(Math.max(1, n)) }));
                  }
                }}
                placeholder={t('目標数')}
              />
              <input
                type="number"
                min="0"
                className="input-cyber"
                style={{ fontSize: '11px', padding: '3px 6px' }}
                value={newGoal.reward}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setNewGoal(g => ({ ...g, reward: '' }));
                  } else {
                    const n = parseInt(raw);
                    setNewGoal(g => ({ ...g, reward: isNaN(n) ? '' : String(Math.max(0, n)) }));
                  }
                }}
                placeholder={t('報酬 (任意)')}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleAddGoal}>
                <Check size={10} /> {t('追加')}
              </button>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '4px', fontSize: '10px' }}
                onClick={() => { setShowAddGoal(false); setNewGoal({ name: '', target: '', reward: '' }); }}
              >
                <X size={10} /> {t('キャンセル')}
              </button>
            </div>
          </div>
        )}

        {state.goals.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '6px' }}>
            {t('まだ目標がありません')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {state.goals.map(goal => {
              const ratio = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
              return (
                <div
                  key={goal.id}
                  style={{
                    background: goal.completed ? 'rgba(57,255,20,0.08)' : 'rgba(255,0,255,0.05)',
                    border: goal.completed ? '1px solid rgba(57,255,20,0.4)' : '1px solid rgba(255,0,255,0.2)',
                    borderRadius: '4px',
                    padding: '5px 6px',
                    fontSize: '10px',
                    opacity: goal.completed ? 0.85 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={goal.completed}
                      onChange={() => handleToggleGoalCompleted(goal.id)}
                      title={t('完了')}
                      style={{ cursor: 'pointer', accentColor: 'var(--green-neon)' }}
                    />
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {editingGoalId === goal.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingGoalCurrent}
                          onChange={(e) => setEditingGoalCurrent(e.target.value)}
                          onBlur={() => {
                            handleUpdateGoalName(goal.id, editingGoalCurrent);
                            setEditingGoalId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateGoalName(goal.id, editingGoalCurrent);
                              setEditingGoalId(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingGoalId(null);
                            }
                          }}
                          style={{ flex: 1, fontSize: '11px', padding: '1px 4px' }}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingGoalId(goal.id);
                            setEditingGoalCurrent(goal.name);
                          }}
                          style={{
                            color: goal.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: goal.completed ? 'line-through' : 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                            flex: 1
                          }}
                          title={t('クリックで名前を編集')}
                        >
                          {goal.name}
                        </span>
                      )}
                    </span>
                    {goal.reward !== undefined && goal.reward > 0 && (
                      <span style={{ color: 'var(--yellow-neon)', fontSize: '11px', fontWeight: 700 }}>🪙{goal.reward}</span>
                    )}
                    <button
                      className="btn-cyber danger"
                      style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
                      onClick={() => handleDeleteGoal(goal.id)}
                      title={t('この目標を削除')}
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <NumberInput
                      value={goal.current}
                      onChange={(v) => handleUpdateGoalCurrent(goal.id, v)}
                      step={1}
                      width={70}
                      accent={goal.completed ? 'var(--green-neon)' : 'var(--cyan-neon)'}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>/</span>
                    <NumberInput
                      value={goal.target}
                      onChange={(v) => handleUpdateGoalTarget(goal.id, v)}
                      step={1}
                      width={70}
                      accent="var(--magenta-neon, #ff00ff)"
                    />
                    <div style={{ flex: 1, height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${ratio}%`,
                          background: goal.completed ? 'var(--green-neon)' : 'var(--magenta-neon, #ff00ff)',
                          transition: 'width 0.2s'
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ====================================================== */}
      {/* 脱出記録 (history)                                       */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <TrendingUp size={12} color="var(--cyan-neon)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>{t('脱出記録 ({0}件)', state.records.length)}</span>
        </div>

        {state.records.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
            {t('まだ脱出記録がありません')}
          </div>
        ) : (
          <>
            <div
              style={{
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 240, 255, 0.2)',
                borderRadius: '4px',
                padding: '5px 6px',
                marginBottom: '6px',
                fontSize: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('平均 ')}({t('除外 ')}{state.records.filter(r => r.excluded).length}{t('件除く')}):</span>
                <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>
                  {average.fans.toLocaleString()}f / 🪙{average.coins.toLocaleString()} / {average.nikukyuu}pt
                </span>
              </div>
            </div>

            <button
              className="btn-cyber"
              style={{ width: '100%', padding: '4px', fontSize: '10px', marginBottom: '6px' }}
              onClick={handleExportCSV}
            >
              <Download size={10} /> {t('CSVエクスポート')}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {state.records.slice().reverse().slice(0, RECORDS_INLINE_LIMIT).map(rec => (
                <RecordRow
                  key={rec.id}
                  rec={rec}
                  editingRecordId={editingRecordId}
                  editingLocation={editingLocation}
                  setEditingLocation={setEditingLocation}
                  onToggleExcluded={handleToggleExcluded}
                  onDelete={handleDeleteRecord}
                  onStartEdit={handleStartEditLocation}
                  onSaveEdit={handleSaveLocation}
                  onCancelEdit={handleCancelEditLocation}
                />
              ))}
            </div>

            <button
              className="btn-cyber"
              style={{ width: '100%', padding: '5px', fontSize: '11px', marginTop: '6px' }}
              onClick={() => setShowAllRecords(true)}
            >
              <List size={11} /> {t('一覧表示 (全{0}件)', state.records.length)}
            </button>
          </>
        )}
      </div>

      {/* ====================================================== */}
      {/* ツール                                                    */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={labelBaseStyle}>{t('ツール')}</div>
        <button
          className="btn-cyber"
          style={{ width: '100%', padding: '8px', fontSize: '13px', fontWeight: 600 }}
          onClick={() => {
            loadSimItems();
            setSimActiveTab('input');
            setSimResult(null);
            setShowSimulator(true);
          }}
        >
          <Calculator size={14} /> {t('アイテム取得シミュレーター')}
        </button>
      </div>

      {/* ====================================================== */}
      {/* サウンドプレイヤー (YouTube Playlist)                     */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Music size={12} color="var(--magenta-neon, #ff00ff)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>{t('サウンドプレイヤー ({0}曲)', playlist.length)}</span>
        </div>

        {/* Now Playing */}
        <div style={{
          background: 'rgba(255,0,255,0.05)',
          border: '1px solid rgba(255,0,255,0.2)',
          borderRadius: '4px',
          padding: '6px',
          marginBottom: '6px'
        }}>
          {currentVideoId ? (
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', marginBottom: '6px' }}>
              <div
                id={ytContainerId}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '4px' }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '11px' }}>
              {t('曲を追加してください')}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
            <button
              className={`btn-cyber ${shuffleMode ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={() => setShuffleMode(s => !s)}
              title={shuffleMode ? t('シャッフルON') : t('シャッフルOFF')}
            >
              <Shuffle size={12} />
            </button>
            <button
              className="btn-cyber"
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={handlePrevTrack}
              title={t('前の曲')}
            >
              <SkipBack size={14} />
            </button>
            <button
              className="btn-cyber success"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setIsPlaying(p => !p)}
              title={isPlaying ? t('一時停止') : t('再生')}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="btn-cyber"
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={handleNextTrack}
              title={t('次の曲')}
            >
              <SkipForward size={14} />
            </button>
            <button
              className={`btn-cyber ${repeatMode ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={() => setRepeatMode(r => !r)}
              title={repeatMode ? t('リピートON') : t('リピートOFF')}
            >
              <Repeat size={12} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {playlist[currentTrackIndex]?.title || '-'}
          </div>
        </div>

        {/* Add URL */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setShowAddUrl(s => !s)}
          >
            <Plus size={10} /> {t('URLを追加')}
          </button>
        </div>

        {showAddUrl && (
          <div style={{
            background: 'rgba(255,0,255,0.05)',
            border: '1px solid rgba(255,0,255,0.25)',
            borderRadius: '4px',
            padding: '6px',
            marginBottom: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <input
              type="text"
              className="input-cyber"
              style={{ ...inputStyle, fontSize: '11px', padding: '3px 6px' }}
              value={newUrlInput}
              onChange={(e) => setNewUrlInput(e.target.value)}
              placeholder={t('YouTube URL (例: https://youtu.be/...)')}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            />
            <input
              type="text"
              className="input-cyber"
              style={{ ...inputStyle, fontSize: '11px', padding: '3px 6px' }}
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder={t('曲名 (任意)')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleAddUrl}>
                <Check size={10} /> {t('追加')}
              </button>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '4px', fontSize: '10px' }}
                onClick={() => { setShowAddUrl(false); setNewUrlInput(''); setNewTitleInput(''); }}
              >
                <X size={10} /> {t('キャンセル')}
              </button>
            </div>
          </div>
        )}

        {/* Playlist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {playlist.map((track, idx) => (
            <div
              key={track.id}
              style={{
                background: idx === currentTrackIndex ? 'rgba(0,240,255,0.1)' : 'rgba(10,15,28,0.4)',
                border: idx === currentTrackIndex ? '1px solid rgba(0,240,255,0.4)' : '1px solid rgba(255,255,255,0.05)',
                borderRadius: '4px',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
              onClick={() => handlePlayTrack(idx)}
            >
              <span style={{ color: idx === currentTrackIndex ? 'var(--cyan-neon)' : 'var(--text-muted)', fontWeight: 700, minWidth: '16px' }}>
                {idx === currentTrackIndex && isPlaying ? '▶' : `${idx + 1}`}
              </span>
              <span style={{ flex: 1, color: idx === currentTrackIndex ? 'var(--cyan-neon)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {track.title}
              </span>
              <button
                className="btn-cyber danger"
                style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
                onClick={(e) => { e.stopPropagation(); handleRemoveTrack(track.id); }}
                title={t('削除')}
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ====================================================== */}
      {/* テキストから目標追加 モーダル                            */}
      {/* ====================================================== */}
      {showTextGoalModal && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={handleCloseTextGoalModal}
        >
          <div
            style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(255,0,255,0.3)', borderRadius: '12px', width: '600px', maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,0,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Type size={14} color="var(--magenta-neon, #ff00ff)" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--magenta-neon, #ff00ff)' }}>{t('テキストから目標を追加')}</span>
              </div>
              <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '10px' }} onClick={handleCloseTextGoalModal}>
                ✕ 閉じる
              </button>
            </div>

            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {t('1行に1目標ずつ。「を」の前を目標名、「を」の後の数字を目標数として抽出します。')}
                </div>
                <textarea
                  className="input-cyber"
                  style={{ width: '100%', minHeight: '160px', fontSize: '12px', padding: '6px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                  value={textGoalInput}
                  onChange={(e) => setTextGoalInput(e.target.value)}
                  placeholder="銀行書類・その四を22個集める&#10;絵画「花畑」を12枚集める&#10;ナクペイダ模型を20体集める&#10;金塊を240個集める&#10;金角の月光を12個集める&#10;累計1,950,000の収益を獲得"
                />
                {/* 2-Screenshot Paste integration dropzones */}
                <div style={{ marginTop: '8px', border: '1px dashed rgba(255,0,255,0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.4)', boxSizing: 'border-box' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--magenta-neon, #ff00ff)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('📷 画像(SS)直接 OCR 解析機能')}</span>
                    {modalOcrStatus && <span style={{ color: 'var(--cyan-neon)', animation: 'pulse 1s infinite' }}>{modalOcrStatus}</span>}
                  </div>
                  
                  {/* Side by side pasting dropzones */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    
                    {/* SS 1 Dropzone */}
                    <div 
                      tabIndex={0}
                      onFocus={() => setFocus1(true)}
                      onBlur={() => setFocus1(false)}
                      onClick={(e) => {
                        e.currentTarget.focus();
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.indexOf('image') !== -1) {
                            const file = items[i].getAsFile();
                            if (file) {
                              const rdr = new FileReader();
                              rdr.onload = (ev) => {
                                if (ev.target?.result) setOcrImg1(ev.target.result as string);
                              };
                              rdr.readAsDataURL(file);
                            }
                            break;
                          }
                        }
                      }}
                      style={{
                        height: '85px',
                        border: focus1 ? '1.5px solid var(--magenta-neon, #ff00ff)' : '1px solid rgba(255,255,255,0.15)',
                        boxShadow: focus1 ? '0 0 8px rgba(255,0,255,0.3)' : 'none',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'text',
                        background: ocrImg1 ? `url(${ocrImg1}) center/contain no-repeat rgba(0,0,0,0.85)` : 'rgba(0,0,0,0.5)',
                        color: 'var(--text-muted)',
                        fontSize: '9px',
                        outline: 'none',
                        position: 'relative',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                    >
                      {!ocrImg1 && (
                        <>
                          <span style={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>{t('SS 1枚目 (1-4行目)')}</span>
                          <span style={{ fontSize: '8px', opacity: 0.8, color: focus1 ? 'var(--cyan-neon)' : 'inherit' }}>
                            {focus1 ? '【Ctrl+Vで貼り付け可能】' : 'クリックして選択し Ctrl+Vで貼付'}
                          </span>
                          <button
                            type="button"
                            className="btn-cyber"
                            style={{ padding: '2px 6px', fontSize: '8px', marginTop: '6px', clipPath: 'none', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef1.current?.click();
                            }}
                          >
                            ファイル選択
                          </button>
                        </>
                      )}
                      {ocrImg1 && (
                        <button 
                          style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.8)', border: 'none', color: '#ff4b4b', borderRadius: '30%', cursor: 'pointer', padding: '1px 4px', fontSize: '8px', zIndex: 10 }}
                          onClick={(e) => { e.stopPropagation(); setOcrImg1(null); }}
                        >
                          ✕
                        </button>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef1}
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const rdr = new FileReader();
                            rdr.onload = (ev) => {
                              if (ev.target?.result) setOcrImg1(ev.target.result as string);
                            };
                            rdr.readAsDataURL(file);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>

                    {/* SS 2 Dropzone */}
                    <div 
                      tabIndex={0}
                      onFocus={() => setFocus2(true)}
                      onBlur={() => setFocus2(false)}
                      onClick={(e) => {
                        e.currentTarget.focus();
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.indexOf('image') !== -1) {
                            const file = items[i].getAsFile();
                            if (file) {
                              const rdr = new FileReader();
                              rdr.onload = (ev) => {
                                if (ev.target?.result) setOcrImg2(ev.target.result as string);
                              };
                              rdr.readAsDataURL(file);
                            }
                            break;
                          }
                        }
                      }}
                      style={{
                        height: '85px',
                        border: focus2 ? '1.5px solid var(--magenta-neon, #ff00ff)' : '1px solid rgba(255,255,255,0.15)',
                        boxShadow: focus2 ? '0 0 8px rgba(255,0,255,0.3)' : 'none',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'text',
                        background: ocrImg2 ? `url(${ocrImg2}) center/contain no-repeat rgba(0,0,0,0.85)` : 'rgba(0,0,0,0.5)',
                        color: 'var(--text-muted)',
                        fontSize: '9px',
                        outline: 'none',
                        position: 'relative',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                    >
                      {!ocrImg2 && (
                        <>
                          <span style={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>{t('SS 2枚目 (3-6行目)')}</span>
                          <span style={{ fontSize: '8px', opacity: 0.8, color: focus2 ? 'var(--cyan-neon)' : 'inherit' }}>
                            {focus2 ? '【Ctrl+Vで貼り付け可能】' : 'クリックして選択し Ctrl+Vで貼付'}
                          </span>
                          <button
                            type="button"
                            className="btn-cyber"
                            style={{ padding: '2px 6px', fontSize: '8px', marginTop: '6px', clipPath: 'none', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef2.current?.click();
                            }}
                          >
                            {t('ファイル選択')}
                          </button>
                        </>
                      )}
                      {ocrImg2 && (
                        <button 
                          style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.8)', border: 'none', color: '#ff4b4b', borderRadius: '30%', cursor: 'pointer', padding: '1px 4px', fontSize: '8px', zIndex: 10 }}
                          onClick={(e) => { e.stopPropagation(); setOcrImg2(null); }}
                        >
                          ✕
                        </button>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef2}
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const rdr = new FileReader();
                            rdr.onload = (ev) => {
                              if (ev.target?.result) setOcrImg2(ev.target.result as string);
                            };
                            rdr.readAsDataURL(file);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>

                  {/* Progress bar inside the dropzone area */}
                  {modalOcrProgress > 0 && (
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${modalOcrProgress * 100}%`, background: 'var(--magenta-neon, #ff00ff)', transition: 'width 0.2s' }} />
                    </div>
                  )}

                  {/* Extract action button */}
                  <button
                    type="button"
                    className="btn-cyber success"
                    onClick={runDirectOcr}
                    disabled={(!ocrImg1 && !ocrImg2) || !!modalOcrStatus.includes('解析中') || !!modalOcrStatus.includes('初期化')}
                    style={{ width: '100%', fontSize: '11px', padding: '6px', fontWeight: 'bold', clipPath: 'none' }}
                  >
                    ⚡ {ocrImg1 && ocrImg2 ? t('2枚のSSから6項目を自動OCR抽出') : ocrImg1 ? t('SS1枚目から4項目を自動OCR抽出') : ocrImg2 ? t('SS2枚目から4項目を自動OCR抽出') : t('画像を貼り付けて自動OCR抽出')}
                  </button>
                </div>
                <button
                  className="btn-cyber"
                  style={{ width: '100%', marginTop: '6px', padding: '6px', fontSize: '11px' }}
                  onClick={handleParseTextGoals}
                >
                  {t('解析')}
                </button>
              </div>

              {textGoalParsed.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--magenta-neon, #ff00ff)', fontWeight: 700, marginBottom: '4px' }}>
                    {t('検出された目標 ({0}件 — 編集可)', textGoalParsed.length)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '240px', overflowY: 'auto' }}>
                    {textGoalParsed.map((g, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,0,255,0.05)', border: '1px solid rgba(255,0,255,0.2)', borderRadius: '4px', padding: '4px 6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="input-cyber"
                          style={{ flex: 1, fontSize: '11px', padding: '2px 4px' }}
                          value={g.name}
                          onChange={(e) => setTextGoalParsed(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                        />
                        <input
                          type="text"
                          className="input-cyber"
                          style={{ width: 70, fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                          value={g.target}
                          onChange={(e) => setTextGoalParsed(prev => prev.map((x, i) => i === idx ? { ...x, target: e.target.value } : x))}
                          placeholder={t('目標')}
                        />
                        <input
                          type="text"
                          className="input-cyber"
                          style={{ width: 60, fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                          value={g.reward}
                          onChange={(e) => setTextGoalParsed(prev => prev.map((x, i) => i === idx ? { ...x, reward: e.target.value } : x))}
                          placeholder={t('報酬')}
                        />
                        <button
                          className="btn-cyber danger"
                          style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
                          onClick={() => setTextGoalParsed(prev => prev.filter((_, i) => i !== idx))}
                          title={t('削除')}
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', borderTop: '1px solid rgba(255,0,255,0.2)' }}>
              <button
                className="btn-cyber success"
                style={{ flex: 2, padding: '7px', fontSize: '12px', fontWeight: 700 }}
                onClick={handleAddParsedTextGoals}
                disabled={textGoalParsed.length === 0}
              >
                <Check size={12} /> {t('{0}件を追加', textGoalParsed.length)}
              </button>
              <button className="btn-cyber" style={{ flex: 1, padding: '7px', fontSize: '11px' }} onClick={handleCloseTextGoalModal}>
                {t('キャンセル')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ====================================================== */}
      {/* 脱出記録 一覧モーダル (Portal経由でbody直下へ)              */}
      {/* ====================================================== */}
      {showAllRecords && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAllRecords(false)}
        >
          <div
            style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(79,195,247,0.2)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--cyan-neon)' }}>
                {t('脱出記録 一覧 ({0}件)', state.records.length)}
              </div>
              <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '10px' }} onClick={() => setShowAllRecords(false)}>
                {t('✕ 閉じる')}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {state.records.slice().reverse().map(rec => (
                <RecordRow
                  key={rec.id}
                  rec={rec}
                  editingRecordId={editingRecordId}
                  editingLocation={editingLocation}
                  setEditingLocation={setEditingLocation}
                  onToggleExcluded={handleToggleExcluded}
                  onDelete={handleDeleteRecord}
                  onStartEdit={handleStartEditLocation}
                  onSaveEdit={handleSaveLocation}
                  onCancelEdit={handleCancelEditLocation}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', borderTop: '1px solid rgba(79,195,247,0.2)' }}>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                onClick={handleExportCSV}
              >
                <Download size={11} /> {t('CSVエクスポート')}
              </button>
              <button
                className="btn-cyber danger"
                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                onClick={handleManualResetPeriod}
                title={t('累計値・現在値・記録履歴を全てリセット')}
              >
                <AlertTriangle size={11} /> {t('全リセット')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ====================================================== */}
      {/* アイテム取得シミュレーションモーダル                      */}
      {/* ====================================================== */}
      {showSimulator && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSimulator(false)}
        >
          <div
            style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: '12px', width: '720px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(0,240,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={18} color="var(--cyan-neon)" />
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-neon)' }}>{t('アイテム取得シミュレーター')}</span>
              </div>
              <button className="btn-cyber" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => setShowSimulator(false)}>
                ✕ {t('閉じる')}
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,240,255,0.15)' }}>
              {(['input', 'prob', 'result', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  className="btn-cyber"
                  style={{
                    flex: 1, padding: '8px', fontSize: '12px', borderRadius: 0,
                    border: 'none', borderBottom: simActiveTab === tab ? '2px solid var(--cyan-neon)' : '2px solid transparent',
                    color: simActiveTab === tab ? 'var(--cyan-neon)' : 'var(--text-muted)',
                    fontWeight: simActiveTab === tab ? 700 : 400,
                    background: simActiveTab === tab ? 'rgba(0,240,255,0.08)' : 'transparent'
                  }}
                  onClick={() => setSimActiveTab(tab)}
                >
                  {tab === 'input' ? t('設定') : tab === 'prob' ? t('確率') : tab === 'result' ? t('結果') : t('履歴')}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ height: '440px', overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {simLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  {t('アイテムデータを読み込み中...')}
                </div>
              ) : simActiveTab === 'input' ? (
                <>
                  {/* Target & Probability settings side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>{t('目標 ファンス')}</div>
                      <input
                        type="number" min="0" step="1000"
                        className="input-cyber"
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '15px', padding: '6px 8px' }}
                        value={simTargetFans || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          setSimTargetFans(raw === '' ? 0 : Math.max(0, parseInt(raw) || 0));
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>{t('目標 コイン')}</div>
                      <input
                        type="number" min="0" step="100"
                        className="input-cyber"
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '15px', padding: '6px 8px' }}
                        value={simTargetCoins || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          setSimTargetCoins(raw === '' ? 0 : Math.max(0, parseInt(raw) || 0));
                        }}
                      />
                    </div>
                  </div>

                  {/* Trial count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('シミュレーション回数')}</span>
                    <input
                      type="number" min="100" max="50000" step="100"
                      className="input-cyber"
                      style={{ width: '80px', fontSize: '12px', padding: '3px 6px', textAlign: 'right' }}
                      value={simTrialCount}
                      onChange={(e) => setSimTrialCount(Math.max(100, parseInt(e.target.value) || 100))}
                    />
                  </div>
                  {(simTrialCount >= 10000 || simTargetFans >= 1000000) && (
                    <div style={{ fontSize: '10px', color: '#ff9500', background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)', borderRadius: '4px', padding: '4px 8px' }}>
                      ⚠ {t('試行数が多い、または目標ファンスが大きいため処理に時間がかかる場合があります')}
                    </div>
                  )}

                  {/* Player count buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>{t('プレイヤー人数')}</span>
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        className="btn-cyber"
                        style={{
                          padding: '4px 12px', fontSize: '12px', minWidth: '36px',
                          background: simPlayerCount === n ? 'rgba(0,240,255,0.15)' : 'transparent',
                          border: `1px solid ${simPlayerCount === n ? 'var(--cyan-neon)' : 'rgba(0,240,255,0.2)'}`,
                          color: simPlayerCount === n ? 'var(--cyan-neon)' : 'var(--text-muted)',
                        }}
                        onClick={() => setSimPlayerCount(n)}
                      >{n}{t('人')}</button>
                    ))}
                  </div>

                  {/* Color filter tabs */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <button
                      className="btn-cyber"
                      style={{
                        padding: '3px 10px', fontSize: '11px', borderRadius: '4px',
                        background: Object.values(simColorFilter).every(Boolean) ? 'rgba(0,240,255,0.15)' : 'transparent',
                        border: `1px solid ${Object.values(simColorFilter).every(Boolean) ? 'var(--cyan-neon)' : 'rgba(0,240,255,0.2)'}`,
                        color: Object.values(simColorFilter).every(Boolean) ? 'var(--cyan-neon)' : 'var(--text-muted)',
                      }}
                      onClick={() => setSimColorFilter({ cyan: true, yellow: true, red: true, purple: true, blue: true, green: true })}
                    >{t('全部')}</button>
                    {(['cyan', 'yellow', 'red', 'purple', 'blue', 'green'] as const).map(col => {
                      const colorDot = col === 'cyan' ? '#00ffff' : col === 'yellow' ? '#ffd700' : col === 'red' ? '#ff4444' : col === 'purple' ? '#a855f7' : col === 'blue' ? '#3b82f6' : '#22c55e';
                      const active = simColorFilter[col] !== false && !Object.entries(simColorFilter).some(([k, v]) => k !== col && v !== false);
                      return (
                        <button
                          key={col}
                          className="btn-cyber"
                          style={{
                            padding: '3px 10px', fontSize: '11px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px',
                            background: active ? `${colorDot}22` : 'transparent',
                            border: `1px solid ${active ? colorDot : 'rgba(0,240,255,0.15)'}`,
                            color: active ? colorDot : 'var(--text-muted)',
                          }}
                          onClick={() => setSimColorFilter({ cyan: false, yellow: false, red: false, purple: false, blue: false, green: false, [col]: true })}
                        >
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: colorDot }} />
                          {COLOR_LABELS[col]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Item list — individual items */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--cyan-neon)', fontWeight: 700 }}>
                      {t('アイテム一覧 ({0}点)', simItems.length)}
                    </div>
                    <button
                      className="btn-cyber"
                      style={{
                        padding: '3px 8px', fontSize: '11px',
                        opacity: Object.keys(simProbOverrides).length > 0 ? 1 : 0.4
                      }}
                      onClick={() => setSimProbOverrides({})}
                      title={t('個別確率設定を全解除')}
                    >{t('確率全解除')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '380px', overflowY: 'auto' }}>
                    {simItems.filter(it => simColorFilter[it.color] !== false).map(it => {
                      const excluded = simExcluded.has(it.id);
                      const limit = simLimits[it.id] ?? -1;
                      const effProbs = getEffectiveProbs();
                      const colorProb = effProbs[it.color] ?? 0;
                      const colorDot = it.color === 'cyan' ? '#00ffff' : it.color === 'yellow' ? '#ffd700' : it.color === 'red' ? '#ff4444' : it.color === 'purple' ? '#a855f7' : it.color === 'blue' ? '#3b82f6' : '#22c55e';
                      return (
                        <div
                          key={it.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '5px 8px', fontSize: '12px',
                            background: excluded ? 'rgba(100,100,100,0.08)' : 'rgba(0,240,255,0.03)',
                            border: `1px solid ${excluded ? 'rgba(100,100,100,0.2)' : 'rgba(0,240,255,0.12)'}`,
                            borderRadius: '4px', opacity: excluded ? 0.5 : 1
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => {
                              setSimExcluded(prev => {
                                const next = new Set(prev);
                                if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                                return next;
                              });
                            }}
                            title={t('計算に含める/除外')}
                            style={{ cursor: 'pointer', accentColor: 'var(--cyan-neon)', width: '16px', height: '16px' }}
                          />
                          <span style={{
                            display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                            background: colorDot, flexShrink: 0
                          }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {it.name}
                          </span>
                          <span style={{ color: 'var(--yellow-neon)', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '11px' }}>
                            {it.fans > 0 ? `${it.fans.toLocaleString()}f` : ''}
                            {it.fans > 0 && it.coins > 0 ? ' / ' : ''}
                            {it.coins > 0 ? `🪙${it.coins.toLocaleString()}` : ''}
                            {it.fans === 0 && it.coins === 0 ? `(${COLOR_LABELS[it.color] || it.color})` : ''}
                          </span>
                          <input
                            type="number" min="0" max="100" step="0.1"
                            style={{
                              width: '52px', fontSize: '10px', padding: '1px 3px',
                              background: it.id in simProbOverrides && simProbOverrides[it.id] !== null ? 'rgba(255,215,0,0.15)' : 'rgba(0,0,0,0.3)',
                              border: `1px solid ${it.id in simProbOverrides && simProbOverrides[it.id] !== null ? 'rgba(255,215,0,0.4)' : 'rgba(0,240,255,0.15)'}`,
                              borderRadius: '3px', color: 'var(--text-primary)', textAlign: 'right'
                            }}
                            value={((simProbOverrides[it.id] ?? colorProb) * 100).toFixed(colorProb < 0.01 ? 2 : 1)}
                            placeholder={(colorProb * 100).toFixed(colorProb < 0.01 ? 2 : 1)}
                            title={t('個別確率 (空欄=色デフォルト)')}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setSimProbOverrides(prev => {
                                const next = { ...prev };
                                if (raw === '') delete next[it.id];
                                else {
                                  const v = parseFloat(raw);
                                  if (!isNaN(v) && v >= 0) next[it.id] = Math.min(100, v) / 100;
                                }
                                return next;
                              });
                            }}
                          />
                          <input
                            type="number" min="0" step="1"
                            style={{
                              width: '50px', fontSize: '11px', padding: '2px 4px',
                              background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,240,255,0.2)',
                              borderRadius: '3px', color: 'var(--text-primary)', textAlign: 'right'
                            }}
                            value={limit >= 0 ? limit : ''}
                            placeholder={t('無制限')}
                            title={t('最大取得数を制限 (空欄=無制限)')}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setSimLimits(prev => {
                                const next = { ...prev };
                                if (raw === '') delete next[it.id];
                                else next[it.id] = Math.max(0, parseInt(raw) || 0);
                                return next;
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Simulate button */}
                  <button
                    className="btn-cyber success"
                    style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 700, marginTop: '6px' }}
                    onClick={runSimulation}
                    disabled={(simTargetFans <= 0 && simTargetCoins <= 0) || simSimulating}
                  >
                    {simSimulating ? <RefreshCw size={14} className="spin" /> : <Calculator size={14} />} {simSimulating ? t('シミュレーション中...') : t('シミュレーション実行')}
                  </button>
                </>
              ) : simActiveTab === 'prob' ? (
                <>
                  <div style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--yellow-neon)', fontWeight: 700, marginBottom: '6px' }}>{t('基本ドロップ率')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      {['cyan', 'yellow', 'red', 'purple', 'blue', 'green'].map(col => {
                        const baseVal = simProbs[col] ?? 0;
                        const disabled = col === 'green' || col === 'blue';
                        return (
                          <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                              background: col === 'cyan' ? '#00ffff' : col === 'yellow' ? '#ffd700' : col === 'red' ? '#ff4444' : col === 'purple' ? '#a855f7' : col === 'blue' ? '#3b82f6' : '#22c55e',
                              flexShrink: 0
                            }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)', minWidth: '50px' }}>{COLOR_LABELS[col]}</span>
                            <input
                              type="number" min="0" max="100" step="0.1"
                              className="input-cyber"
                              style={{ width: '60px', fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                              value={(baseVal * 100).toFixed(1)}
                              disabled={disabled}
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                if (isNaN(raw) || raw < 0) return;
                                setSimProbs(prev => ({ ...prev, [col]: Math.min(100, raw) / 100 }));
                              }}
                            />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Player count multipliers + effective probability previews */}
                  {[2, 3, 4].map(n => {
                    const mult = simMultipliers[n] ?? n;
                    const eff = computeEffectiveProbsFor(simProbs, mult);
                    return (
                      <div key={n} style={{ background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.15)', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '14px', color: 'var(--cyan-neon)', fontWeight: 700, minWidth: '32px' }}>{n}{t('人')}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('倍率')}</span>
                          <input
                            type="number" min="1" max="20" step="0.5"
                            className="input-cyber"
                            style={{ width: '60px', fontSize: '13px', padding: '2px 6px', textAlign: 'right' }}
                            value={mult}
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value);
                              if (isNaN(raw) || raw < 0) return;
                              setSimMultipliers(prev => ({ ...prev, [n]: Math.max(0.1, Math.min(20, raw)) }));
                            }}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>×</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: '11px' }}>
                          {(['cyan', 'yellow', 'red', 'purple', 'blue', 'green'] as const).map(col => {
                            const cd = col === 'cyan' ? '#00ffff' : col === 'yellow' ? '#ffd700' : col === 'red' ? '#ff4444' : col === 'purple' ? '#a855f7' : col === 'blue' ? '#3b82f6' : '#22c55e';
                            return (
                              <span key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: cd }} />
                                <span style={{ color: 'var(--text-primary)' }}>{(eff[col] * 100).toFixed(1)}%</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {simPlayerCount > 1 && (
                    <div style={{ fontSize: '11px', color: '#ffd700', background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '4px', padding: '6px 10px' }}>
                      {t('現在 {0}人設定: EH･金･カードキー･紫 ×{1}、青･緑を按分減', simPlayerCount, simMultipliers[simPlayerCount] ?? simPlayerCount)}
                    </div>
                  )}
                </>
              ) : simActiveTab === 'result' && simResult ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green-neon)', marginBottom: '6px' }}>
                    {t('シミュレーション結果 (試行数: {0})', simResult.trials.toLocaleString())}
                  </div>

                  {/* Averages & card key stats — 2-column */}
                  <div style={{
                    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.15)',
                    borderRadius: '6px', padding: '12px 14px', fontSize: '13px',
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px'
                  }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('平均取得アイテム数')}</div>
                      <div style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontSize: '16px' }}>{simResult.avgTotalItems.toLocaleString()}個</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('平均ファンス')}</div>
                      <div style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontSize: '16px' }}>{simResult.avgFans.toLocaleString()}f</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('平均コイン')}</div>
                      <div style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontSize: '16px' }}>🪙{simResult.avgCoins.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('カードキー平均取得数')}</div>
                      <div style={{ color: '#ff4444', fontWeight: 700, fontSize: '16px' }}>{(simResult.avgCardKeys ?? 0).toFixed(1)}個</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('カードキー取得試行率')}</div>
                      <div style={{ color: '#ff4444', fontWeight: 700, fontSize: '16px' }}>
                        {((simResult.cardKeyPickRate ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Sample trial — grouped by value, per-item rate (no nested scroll) */}
                  {simResult.sampleTrial && (() => {
                    const gMap = new Map<string, { key: string; fans: number; coins: number; color: string; entries: { id: string; name: string; count: number; rate: number }[] }>();
                    for (const id of Object.keys(simResult.sampleTrial)) {
                      const count = simResult.sampleTrial![id];
                      if (count <= 0) continue;
                      const it = simItems.find(x => x.id === id);
                      if (!it) continue;
                      const gk = it.groupKey;
                      if (!gMap.has(gk)) {
                        gMap.set(gk, { key: gk, fans: it.fans, coins: it.coins, color: it.color, entries: [] });
                      }
                      const picked = simResult.itemStats?.[id]?.picked ?? 0;
                      gMap.get(gk)!.entries.push({ id, name: it.name, count, rate: simResult.trials > 0 ? (picked / simResult.trials) * 100 : 0 });
                    }
                    const groups = Array.from(gMap.values()).filter(g => g.entries.length > 0);
                    if (groups.length === 0) return null;
                    groups.sort((a, b) => (b.fans * 1000 + b.coins) - (a.fans * 1000 + a.coins));
                    for (const g of groups) g.entries.sort((a, b) => b.count - a.count);
                    return (
                      <div>
                        <div style={{ fontSize: '12px', color: '#ffd700', fontWeight: 700, marginBottom: '4px', marginTop: '6px' }}>
                          サンプルパターン (成功例の中央値)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {groups.map(g => {
                            const cd = g.color === 'cyan' ? '#00ffff' : g.color === 'yellow' ? '#ffd700' : g.color === 'red' ? '#ff4444' : g.color === 'purple' ? '#a855f7' : g.color === 'blue' ? '#3b82f6' : '#22c55e';
                            return (
                              <div key={g.key} style={{ border: '1px solid rgba(255,215,0,0.15)', borderRadius: '4px', background: 'rgba(255,215,0,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderBottom: '1px solid rgba(255,215,0,0.1)', fontSize: '11px' }}>
                                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: cd }} />
                                  <span style={{ color: '#00ffff', fontWeight: 700 }}>{g.fans.toLocaleString()}f / 🪙{g.coins.toLocaleString()}</span>
                                  <span style={{ color: '#888', marginLeft: 'auto' }}>計 {g.entries.reduce((s, e) => s + e.count, 0).toLocaleString()}個</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 8px', padding: '2px 0' }}>
                                  {g.entries.map(e => (
                                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11px', minWidth: 0 }}>
                                      <span style={{ flex: 1, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                                      <span style={{ color: '#00ffff', fontWeight: 600, flexShrink: 0 }}>x{e.count}</span>
                                      <span style={{ color: '#888', minWidth: '36px', textAlign: 'right', flexShrink: 0 }}>{e.rate.toFixed(1)}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <button
                    className="btn-cyber"
                    style={{ width: '100%', padding: '8px', fontSize: '12px', marginTop: '6px' }}
                    onClick={() => setSimActiveTab('input')}
                  >
                    {t('設定を変更して再シミュレーション')}
                  </button>
                </>
              ) : simActiveTab === 'result' && !simResult ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {t('目標値を入力してシミュレーションを実行してください')}
                </div>
              ) : simActiveTab === 'history' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--cyan-neon)' }}>
                      {t('算出履歴 ({0}件)', simHistory.length)}
                    </span>
                    {simHistory.length > 0 && (
                      <button
                        className="btn-cyber danger"
                        style={{ padding: '4px 10px', fontSize: '10px' }}
                        onClick={() => {
                          if (window.confirm(t('全ての履歴を削除しますか？'))) setSimHistory([]);
                        }}
                      >
                        <Trash2 size={10} /> {t('全削除')}
                      </button>
                    )}
                  </div>
                  {simHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {t('履歴がありません')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '360px', overflowY: 'auto' }}>
                      {simHistory.map(entry => (
                        <div
                          key={entry.id}
                          style={{
                            background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.15)',
                            borderRadius: '5px', padding: '7px 10px', fontSize: '11px', cursor: 'pointer'
                          }}
                          onClick={() => {
                            setSimTargetFans(entry.targetFans);
                            setSimTargetCoins(entry.targetCoins);
                            setSimResult(entry.summary);
                            setSimActiveTab('result');
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>{new Date(entry.timestamp).toLocaleString('ja-JP')}</span>
                            <span style={{ color: 'var(--cyan-neon)', fontWeight: 600 }}>
                              {t('目標: {0}f / 🪙{1}', entry.targetFans.toLocaleString(), entry.targetCoins.toLocaleString())}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--green-neon)', fontWeight: 600 }}>
                              {(entry.summary.successes / entry.summary.trials * 100).toFixed(1)}% ({entry.summary.successes}/{entry.summary.trials})
                            </span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {entry.summary.avgTotalItems > 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                  ~{entry.summary.avgTotalItems.toLocaleString()} items
                                </span>
                              )}
                              <span style={{ color: entry.summary.successes / entry.summary.trials >= 0.8 ? 'var(--green-neon)' : 'var(--yellow-neon)' }}>
                                {t('平均 {0}f / 🪙{1}', entry.summary.avgFans.toLocaleString(), entry.summary.avgCoins.toLocaleString())}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface RecordRowProps {
  rec: PlayDataRecord;
  editingRecordId: string | null;
  editingLocation: string;
  setEditingLocation: (v: string) => void;
  onToggleExcluded: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (rec: PlayDataRecord) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
}

function RecordRow({
  rec, editingRecordId, editingLocation, setEditingLocation,
  onToggleExcluded, onDelete, onStartEdit, onSaveEdit, onCancelEdit
}: RecordRowProps) {
  return (
    <div
      style={{
        background: rec.excluded ? 'rgba(100,100,100,0.1)' : 'rgba(79,195,247,0.05)',
        border: rec.excluded ? '1px solid rgba(100,100,100,0.3)' : '1px solid rgba(79,195,247,0.2)',
        borderRadius: '4px',
        padding: '4px 6px',
        fontSize: '10px',
        opacity: rec.excluded ? 0.55 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="checkbox"
          checked={!rec.excluded}
          onChange={() => onToggleExcluded(rec.id)}
          title={t('一時的に平均計算から除外')}
          style={{ cursor: 'pointer', accentColor: 'var(--cyan-neon)' }}
        />
        <span style={{ flex: 1, color: 'var(--text-muted)' }}>
          {new Date(rec.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        {(rec.requiem15 || rec.requiem20) && (
          <span style={{ color: '#ff9500', fontSize: '9px' }}>
            {rec.requiem20 ? '+20%' : '+15%'}
          </span>
        )}
        <button
          className="btn-cyber danger"
          style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
          onClick={() => onDelete(rec.id)}
          title={t('この記録を削除')}
        >
          <Trash2 size={9} />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        {editingRecordId === rec.id ? (
          <>
            <input
              type="text"
              className="input-cyber"
              style={{ flex: 1, fontSize: '10px', padding: '1px 4px' }}
              value={editingLocation}
              onChange={(e) => setEditingLocation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit(rec.id);
                if (e.key === 'Escape') onCancelEdit();
              }}
              autoFocus
            />
            <button
              className="btn-cyber success"
              style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', marginLeft: '2px' }}
              onClick={() => onSaveEdit(rec.id)}
            >{t('保存')}</button>
            <button
              className="btn-cyber"
              style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', marginLeft: '2px' }}
              onClick={onCancelEdit}
            >×</button>
          </>
        ) : (
          <span
            style={{ color: rec.location ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: rec.location ? 'normal' : 'italic', cursor: 'pointer', flex: 1 }}
            onClick={() => onStartEdit(rec)}
            title={t('クリックで記録名を編集')}
          >
            {rec.location || t('(記録名なし - クリックで追加)')}
          </span>
        )}
        <span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginLeft: '4px' }}>
          {rec.fans.toLocaleString()} / 🪙{rec.coins.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
