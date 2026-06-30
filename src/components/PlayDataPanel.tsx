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
import { Download, Trash2, AlertTriangle, TrendingUp, Clock, BarChart3, Check, List, Target, Plus, X, Type, Music, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from 'lucide-react';
import { t } from '../i18n';

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
  bigStep,
  width = 80,
  accent = 'var(--cyan-neon)',
  align = 'right'
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  bigStep?: number;
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

  // Mouse-wheel adjustment on the displayed value. Without modifiers use
  // `bigStep` if provided (e.g. bigStep=100 for large currency amounts
  // where the default step=1 would take forever). Shift=×10, Ctrl=×100.
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const baseStep = bigStep ?? step;
    const wheelStep = e.ctrlKey ? step * 100 : (e.shiftKey ? step * 10 : baseStep);
    const delta = e.deltaY < 0 ? wheelStep : -wheelStep;
    onChange(Math.max(min, value + delta));
  };

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
      onWheel={handleWheel}
      title={t('クリックで編集 / ホイールで増減 (Shift=×10, Ctrl=×100)')}
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
      notify('現在値が空です。ファンスかコインを入力してください');
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
    const capNote = addedFans < state.currentFans || addedCoins < state.currentCoins ? ' (上限に達したため一部のみ加算)' : '';
    notify(`脱出記録を追加しました${capNote}`);
  };

  const handleResetCurrent = () => {
    setState(prev => ({ ...prev, currentFans: 0, currentCoins: 0 }));
    notify('現在値をリセットしました');
  };

  const handleManualResetPeriod = () => {
    if (!window.confirm('記録値（累計）と現在値を全てリセットします。よろしいですか？')) return;
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
    notify('記録値と現在値をリセットしました');
  };

  // --- Goal handlers ---
  const handleAddGoal = () => {
    const name = newGoal.name.trim();
    const target = parseInt(newGoal.target) || 0;
    const reward = parseInt(newGoal.reward) || 0;
    if (!name || target <= 0) {
      notify('目標名と目標数を入力してください');
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
    notify(`目標を追加しました: ${name}`);
  };

  const handleDeleteGoal = (id: string) => {
    if (!window.confirm('この目標を削除しますか？')) return;
    setState(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== id) }));
    notify('目標を削除しました');
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
    notify('今週の目標を全て削除しました');
  };

  // --- Text-input goal parser ---
  const handleParseTextGoals = () => {
    const parsed = parseGoalsFromInput(textGoalInput);
    if (parsed.length === 0) {
      notify('「を」を含む行が見つかりません');
      return;
    }
    setTextGoalParsed(parsed.map(g => ({
      name: g.name,
      target: String(g.target),
      reward: g.reward > 0 ? String(g.reward) : ''
    })));
    notify(`${parsed.length}件検出`);
  };

  const handleAddParsedTextGoals = () => {
    const valid = textGoalParsed.filter(g => g.name.trim() && parseInt(g.target.replace(/,/g, '')) > 0);
    if (valid.length === 0) {
      notify('追加できる目標がありません');
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
    notify(`${newGoals.length}件追加${skipped > 0 ? ` (重複${skipped}件スキップ)` : ''}`);
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
      notify('画像を貼り付けてください');
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
      notify('OCR解析が完了しました');
    } catch (err) {
      console.error(err);
      setModalOcrStatus('エラーが発生しました');
      setModalOcrProgress(0);
      notify('OCR認識エラー');
    }
  };

  // --- Cumulative field handlers ---
  const handleUpdateCumulative = (field: CumulativeField, value: number) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  // --- Sound Player handlers ---
  const handleAddUrl = () => {
    const url = newUrlInput.trim();
    if (!url) { notify('URLを入力してください'); return; }
    const videoId = extractVideoId(url);
    if (!videoId) { notify('有効なYouTube URLではありません'); return; }
    const title = newTitleInput.trim() || `曲 ${playlist.length + 1}`;
    setPlaylist(prev => [...prev, { id: Date.now().toString(), url: `https://www.youtube.com/watch?v=${videoId}`, title }]);
    setNewUrlInput('');
    setNewTitleInput('');
    setShowAddUrl(false);
    notify(`プレイリストに追加しました: ${title}`);
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
    if (!window.confirm('この記録を削除しますか？')) return;
    setState(prev => ({ ...prev, records: prev.records.filter(r => r.id !== id) }));
    notify('記録を削除しました');
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
      notify('エクスポートする記録がありません');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(state.records, `heist_escape_records_${date}.csv`);
    notify(`${state.records.length}件の記録をCSVエクスポートしました`);
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
            あと {timeUntilReset.days}日 {timeUntilReset.hours}時間
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
            +15% レクイエム
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
            +20% レクイエム
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
              ? `📍 記録名 (空なら「${routeTitle}」を使用)`
              : '📍 記録名 (例: 本日 1回目)'}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <button
            className="btn-cyber success"
            style={{ flex: 2, padding: '7px', fontSize: '13px', fontWeight: 700 }}
            onClick={handleEscape}
            title="現在の値を記録値に加算してリストに追加 (現在値は自動リセット)"
          >
            🚪 脱出 (加算)
          </button>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '7px', fontSize: '10px' }}
            onClick={handleResetCurrent}
            title="入力中の現在値のみリセット (加算しない)"
          >
            現在値リセット
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* 累計値 (Cumulative, with NumberInput)                    */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BarChart3 size={12} color="var(--cyan-neon)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>{t('累計値 (クリックで編集 / ±で増減)')}</span>
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
                  bigStep={100}
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
                bigStep={10}
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
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>今週の目標 ({state.goals.length}件)</span>
          {state.goals.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
              {confirmClearGoals ? (
                <>
                  <button
                    className="btn-cyber danger"
                    style={{ padding: '1px 6px', fontSize: '9px', lineHeight: 1.4 }}
                    onClick={handleClearAllGoals}
                    title="クリックで削除実行"
                  >
                    ✓ 削除する
                  </button>
                  <button
                    className="btn-cyber"
                    style={{ padding: '1px 6px', fontSize: '9px', lineHeight: 1.4 }}
                    onClick={() => setConfirmClearGoals(false)}
                    title="キャンセル"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  className="btn-cyber"
                  style={{ padding: '1px 6px', fontSize: '9px', opacity: 0.55, lineHeight: 1.4 }}
                  onClick={handleClearAllGoals}
                  title="全削除 (確認あり)"
                >
                  <Trash2 size={9} /> 全削除
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
            <Plus size={10} /> 目標を追加
          </button>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setShowTextGoalModal(true)}
            title="テキストから複数行を一括追加"
          >
            <Type size={10} /> テキストから
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
              placeholder="目標名 (例: 金塊を240個集める)"
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
                placeholder="目標数"
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
                placeholder="報酬 (任意)"
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleAddGoal}>
                <Check size={10} /> 追加
              </button>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '4px', fontSize: '10px' }}
                onClick={() => { setShowAddGoal(false); setNewGoal({ name: '', target: '', reward: '' }); }}
              >
                <X size={10} /> キャンセル
              </button>
            </div>
          </div>
        )}

        {state.goals.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '6px' }}>
            まだ目標がありません
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
                      title="完了"
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
                          title="クリックで名前を編集"
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
                      title="この目標を削除"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <NumberInput
                      value={goal.current}
                      onChange={(v) => handleUpdateGoalCurrent(goal.id, v)}
                      step={1}
                      bigStep={10}
                      width={70}
                      accent={goal.completed ? 'var(--green-neon)' : 'var(--cyan-neon)'}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>/</span>
                    <NumberInput
                      value={goal.target}
                      onChange={(v) => handleUpdateGoalTarget(goal.id, v)}
                      step={1}
                      bigStep={10}
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
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>脱出記録 ({state.records.length}件)</span>
        </div>

        {state.records.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
            まだ脱出記録がありません
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
              <Download size={10} /> CSVエクスポート
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
              <List size={11} /> 一覧表示 (全{state.records.length}件)
            </button>
          </>
        )}
      </div>

      {/* ====================================================== */}
      {/* サウンドプレイヤー (YouTube Playlist)                     */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Music size={12} color="var(--magenta-neon, #ff00ff)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>サウンドプレイヤー ({playlist.length}曲)</span>
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
              曲を追加してください
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
            <button
              className={`btn-cyber ${shuffleMode ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={() => setShuffleMode(s => !s)}
              title={shuffleMode ? 'シャッフルON' : 'シャッフルOFF'}
            >
              <Shuffle size={12} />
            </button>
            <button
              className="btn-cyber"
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={handlePrevTrack}
              title="前の曲"
            >
              <SkipBack size={14} />
            </button>
            <button
              className="btn-cyber success"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setIsPlaying(p => !p)}
              title={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="btn-cyber"
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={handleNextTrack}
              title="次の曲"
            >
              <SkipForward size={14} />
            </button>
            <button
              className={`btn-cyber ${repeatMode ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '10px' }}
              onClick={() => setRepeatMode(r => !r)}
              title={repeatMode ? 'リピートON' : 'リピートOFF'}
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
            <Plus size={10} /> URLを追加
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
              placeholder="YouTube URL (例: https://youtu.be/...)"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            />
            <input
              type="text"
              className="input-cyber"
              style={{ ...inputStyle, fontSize: '11px', padding: '3px 6px' }}
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder="曲名 (任意)"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-cyber success" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={handleAddUrl}>
                <Check size={10} /> 追加
              </button>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '4px', fontSize: '10px' }}
                onClick={() => { setShowAddUrl(false); setNewUrlInput(''); setNewTitleInput(''); }}
              >
                <X size={10} /> キャンセル
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
                title="削除"
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
                  1行に1目標ずつ。「を」の前を目標名、「を」の後の数字を目標数として抽出します。
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
