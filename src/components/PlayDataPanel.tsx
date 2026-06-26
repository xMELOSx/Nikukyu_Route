import React, { useState, useEffect, useMemo } from 'react';
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
  BIWEEKLY_COINS_CAP,
  FANS_PER_NIKUKYUU_POINT
} from '../utils/PlayDataManager';
import { Download, Trash2, AlertTriangle, TrendingUp, Clock, BarChart3, Pencil, Check, X, List, Target, Plus, ScanText, Image as ImageIcon, ClipboardPaste, Loader2 } from 'lucide-react';
import { parseGoalsFromText } from '../utils/goalOcr';
import { preprocessImageForOcr } from '../utils/imagePreprocess';

interface PlayDataPanelProps {
  onNotify?: (msg: string) => void;
  routeTitle?: string;
}

type CumulativeField = 'recordedFans' | 'recordedCoins' | 'recordedNikukyuu';

const RECORDS_INLINE_LIMIT = 5;

export function PlayDataPanel({ onNotify, routeTitle = '' }: PlayDataPanelProps) {
  const [state, setState] = useState<PlayDataState>(() => checkAutoReset(loadPlayData()));
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string>('');
  const [editingCumulative, setEditingCumulative] = useState<CumulativeField | null>(null);
  const [editingCumulativeValue, setEditingCumulativeValue] = useState<string>('');
  const [showAllRecords, setShowAllRecords] = useState<boolean>(false);
  const [showAddGoal, setShowAddGoal] = useState<boolean>(false);
  const [newGoal, setNewGoal] = useState<{ name: string; target: string; reward: string }>({ name: '', target: '', reward: '' });
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingGoalCurrent, setEditingGoalCurrent] = useState<string>('');
  // OCR state
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrParsed, setOcrParsed] = useState<{ name: string; target: string; current: string; reward: string }[]>([]);
  const [ocrRawText, setOcrRawText] = useState<string>('');

  useEffect(() => {
    savePlayData(state);
  }, [state]);

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
      notify('現在値が空です。ファンスかコインを入力してください。');
      return;
    }

    const now = Date.now();
    const preState: PlayDataState = { ...state };
    const post = checkAutoReset(preState, now);

    // Cap the per-run fans against the biweekly cap
    const addedFans = Math.min(state.currentFans, Math.max(0, BIWEEKLY_FANS_CAP - post.recordedFans));
    const addedCoins = Math.min(state.currentCoins, Math.max(0, BIWEEKLY_COINS_CAP - post.recordedCoins));
    const addedNikukyuu = nikukyuuCurrent;

    // When the 記録名 field is empty, fall back to the loaded plan title
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
      // Reset current run inputs so the next run starts fresh
      currentFans: 0,
      currentCoins: 0,
      recordedFans: post.recordedFans + addedFans,
      recordedCoins: post.recordedCoins + addedCoins,
      recordedNikukyuu: post.recordedNikukyuu + addedNikukyuu,
      records: [...post.records, newRecord]
    });

    const capNote =
      addedFans < state.currentFans || addedCoins < state.currentCoins
        ? ' (上限に達したため一部のみ加算)'
        : '';
    notify(`脱出記録を追加しました${capNote}`);
  };

  const handleResetCurrent = () => {
    setState(prev => ({
      ...prev,
      currentFans: 0,
      currentCoins: 0
    }));
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
        // When marking complete, snap current to target if needed
        const completed = !g.completed;
        return { ...g, completed, current: completed ? Math.max(g.current, g.target) : g.current };
      })
    }));
  };

  const startEditGoalCurrent = (goal: WeeklyGoal) => {
    setEditingGoalId(goal.id);
    setEditingGoalCurrent(String(goal.current));
  };

  const commitEditGoalCurrent = () => {
    if (!editingGoalId) return;
    const num = Math.max(0, parseInt(editingGoalCurrent) || 0);
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== editingGoalId) return g;
        return { ...g, current: num, completed: num >= g.target };
      })
    }));
    setEditingGoalId(null);
    setEditingGoalCurrent('');
  };

  const cancelEditGoalCurrent = () => {
    setEditingGoalId(null);
    setEditingGoalCurrent('');
  };

  const handleClearAllGoals = () => {
    if (!window.confirm('全ての今週の目標を削除します。よろしいですか？')) return;
    setState(prev => ({ ...prev, goals: [] }));
    notify('今週の目標を全て削除しました');
  };

  // --- OCR handlers ---
  const runOcrOnFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      notify('画像ファイルを選択してください');
      return;
    }

    // Show first file as preview
    const firstReader = new FileReader();
    firstReader.onload = (e) => setOcrPreview(e.target?.result as string);
    firstReader.readAsDataURL(imageFiles[0]);

    setOcrStatus('Tesseract を読み込み中…');
    setOcrProgress(0);
    setOcrParsed([]);
    setOcrRawText('');

    try {
      // Dynamic import — only loaded on first OCR use
      const Tesseract = await import('tesseract.js');

      // Collect all parsed goals from all images, dedup by name
      const allParsed: { name: string; target: number; current: number; reward: number }[] = [];
      const rawTexts: string[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        setOcrStatus(`画像 ${i + 1}/${imageFiles.length} を処理中…`);

        // Pre-process: scale 2x + grayscale + binarize for better OCR
        const canvas = await preprocessImageForOcr(imageFiles[i]);

        const result = await Tesseract.recognize(canvas, 'jpn', {
          logger: (m: { status: string; progress: number }) => {
            const label = m.status === 'recognizing text' ? 'テキスト認識中…' : m.status;
            setOcrStatus(`画像 ${i + 1}/${imageFiles.length}: ${label}`);
            setOcrProgress(m.progress);
          }
        });
        const text = result.data.text;
        rawTexts.push(text);
        const parsed = parseGoalsFromText(text);
        for (const g of parsed) {
          // Dedup by name (normalize whitespace)
          const norm = g.name.replace(/\s+/g, '').toLowerCase();
          if (!allParsed.some(x => x.name.replace(/\s+/g, '').toLowerCase() === norm)) {
            allParsed.push(g);
          }
        }
      }

      setOcrRawText(rawTexts.join('\n\n─────\n\n'));
      setOcrParsed(allParsed.map(g => ({
        name: g.name,
        target: String(g.target),
        current: String(g.current),
        reward: String(g.reward)
      })));
      setOcrStatus(allParsed.length > 0
        ? `${imageFiles.length}枚から ${allParsed.length}件検出 (重複除外済)`
        : '検出できず — 画像を確認するか手動で入力してください');
    } catch (err) {
      console.error(err);
      setOcrStatus('OCRエラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleOcrFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) runOcrOnFiles(files);
    e.target.value = '';
  };

  const handleOcrPaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            files.push(new File([blob], 'pasted.png', { type }));
          }
        }
      }
      if (files.length === 0) {
        notify('クリップボードに画像がありません');
        return;
      }
      await runOcrOnFiles(files);
    } catch (err) {
      notify('クリップボードの読み取りに失敗: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const updateParsedGoal = (idx: number, field: 'name' | 'target' | 'current' | 'reward', value: string) => {
    setOcrParsed(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
  };

  const removeParsedGoal = (idx: number) => {
    setOcrParsed(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmOcr = () => {
    const valid = ocrParsed.filter(g => g.name.trim() && parseInt(g.target) > 0);
    if (valid.length === 0) {
      notify('追加できる目標がありません');
      return;
    }

    // Dedup against existing goals in the list (by normalized name)
    const existing = new Set(state.goals.map(g => g.name.replace(/\s+/g, '').toLowerCase()));
    const toAdd = valid.filter(g => !existing.has(g.name.replace(/\s+/g, '').toLowerCase()));
    const skipped = valid.length - toAdd.length;

    const newGoals: WeeklyGoal[] = toAdd.map(g => {
      const target = parseInt(g.target) || 0;
      const current = parseInt(g.current) || 0;
      const reward = parseInt(g.reward) || 0;
      return {
        id: generateGoalId(),
        name: g.name.trim(),
        target,
        current,
        reward: reward > 0 ? reward : undefined,
        completed: current >= target && target > 0
      };
    });
    setState(prev => ({ ...prev, goals: [...prev.goals, ...newGoals] }));
    notify(`${newGoals.length}件追加${skipped > 0 ? ` (既存と重複${skipped}件スキップ)` : ''}`);
    setShowOcrModal(false);
    setOcrPreview(null);
    setOcrParsed([]);
    setOcrRawText('');
    setOcrProgress(0);
    setOcrStatus('');
  };

  const handleCloseOcr = () => {
    setShowOcrModal(false);
    setOcrPreview(null);
    setOcrParsed([]);
    setOcrRawText('');
    setOcrProgress(0);
    setOcrStatus('');
  };

  const handleToggleExcluded = (id: string) => {
    setState(prev => ({
      ...prev,
      records: prev.records.map(r => r.id === id ? { ...r, excluded: !r.excluded } : r)
    }));
  };

  const handleDeleteRecord = (id: string) => {
    if (!window.confirm('この記録を削除しますか？')) return;
    setState(prev => ({
      ...prev,
      records: prev.records.filter(r => r.id !== id)
    }));
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

  // Cumulative field inline edit handlers
  const startEditCumulative = (field: CumulativeField) => {
    setEditingCumulative(field);
    setEditingCumulativeValue(String(state[field] || 0));
  };
  const commitEditCumulative = () => {
    if (!editingCumulative) return;
    const num = Math.max(0, parseInt(editingCumulativeValue) || 0);
    setState(prev => ({ ...prev, [editingCumulative]: num }));
    setEditingCumulative(null);
    setEditingCumulativeValue('');
  };
  const cancelEditCumulative = () => {
    setEditingCumulative(null);
    setEditingCumulativeValue('');
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

  // Reusable editable cumulative value renderer
  const renderCumulativeValue = (
    field: CumulativeField,
    value: number,
    accent: string
  ) => {
    if (editingCumulative === field) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          <input
            type="number"
            min="0"
            step="1"
            autoFocus
            value={editingCumulativeValue}
            onChange={(e) => setEditingCumulativeValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEditCumulative();
              if (e.key === 'Escape') cancelEditCumulative();
            }}
            onBlur={commitEditCumulative}
            style={{
              width: '90px',
              fontSize: '13px',
              fontWeight: 700,
              padding: '1px 4px',
              textAlign: 'right',
              background: 'rgba(5,7,10,0.8)',
              border: `1px solid ${accent}`,
              color: accent,
              borderRadius: '2px',
              fontFamily: 'monospace'
            }}
          />
          <button
            className="btn-cyber success"
            style={{ padding: '0 4px', fontSize: '10px', clipPath: 'none', lineHeight: 1.2 }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={commitEditCumulative}
            title="保存"
          >
            <Check size={10} />
          </button>
          <button
            className="btn-cyber"
            style={{ padding: '0 4px', fontSize: '10px', clipPath: 'none', lineHeight: 1.2 }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelEditCumulative}
            title="キャンセル"
          >
            <X size={10} />
          </button>
        </span>
      );
    }
    return (
      <span
        style={{ color: accent, fontWeight: 700, cursor: 'pointer', borderBottom: `1px dashed ${accent}55` }}
        onClick={() => startEditCumulative(field)}
        title="クリックで手動編集"
      >
        {value.toLocaleString()}
        <Pencil size={9} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: 0.6 }} />
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* ====================================================== */}
      {/* 次の更新 (PLAY DATA TOP)                                 */}
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
          <span style={{ fontSize: '13px', color: 'var(--green-neon)', fontWeight: 700 }}>次回更新 (隔週月曜 5:00)</span>
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
          <span style={{ color: 'var(--text-muted)' }}>残りファンス</span>
          <span style={{ color: 'var(--cyan-neon)', fontWeight: 700, fontFamily: 'monospace' }}>
            {remaining.fans.toLocaleString()}
          </span>
        </div>
        <div style={{ ...smallText, marginTop: '4px' }}>
          ファンス上限のみ更新
        </div>
      </div>

      {/* ====================================================== */}
      {/* 今回の獲得                                              */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={labelBaseStyle}>🐾 今回の獲得</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>$ ファンス</div>
            <input
              type="number"
              min="0"
              step="100"
              className="input-cyber"
              style={inputStyle}
              value={state.currentFans || ''}
              placeholder="0"
              onChange={(e) => setCurrentFans(parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>🪙 コイン</div>
            <input
              type="number"
              min="0"
              step="1"
              className="input-cyber"
              style={inputStyle}
              value={state.currentCoins || ''}
              placeholder="0"
              onChange={(e) => setCurrentCoins(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* にくきゅうポイント — current fans based, displayed under coins */}
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
            <span style={{ fontSize: '11px', color: 'var(--yellow-neon)', fontWeight: 700 }}>にくきゅうポイント</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace' }}>
              {nikukyuuCurrent}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>pt</span>
          </div>
        </div>

        {/* Requiem bonus toggles (mutually exclusive) */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <label
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontSize: '12px',
              color: state.requiem15 ? '#ff9500' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '5px 6px',
              border: `1px solid ${state.requiem15 ? 'rgba(255,149,0,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem15 ? 'rgba(255,149,0,0.15)' : 'transparent',
              fontWeight: state.requiem15 ? 700 : 400
            }}
          >
            <input
              type="checkbox"
              checked={state.requiem15}
              onChange={(e) => setRequiem15(e.target.checked)}
              style={{ accentColor: '#ff9500', cursor: 'pointer' }}
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
              color: state.requiem20 ? '#ff00ff' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '5px 6px',
              border: `1px solid ${state.requiem20 ? 'rgba(255,0,255,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem20 ? 'rgba(255,0,255,0.15)' : 'transparent',
              fontWeight: state.requiem20 ? 700 : 400
            }}
          >
            <input
              type="checkbox"
              checked={state.requiem20}
              onChange={(e) => setRequiem20(e.target.checked)}
              style={{ accentColor: '#ff00ff', cursor: 'pointer' }}
            />
            +20% レクイエム
          </label>
        </div>

        {/* Bonus-applied display (LARGER) */}
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
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ボーナス適用後 $ ファンス</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace', textShadow: '0 0 4px rgba(255,230,0,0.5)' }}>
              {fansWithBonus.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ボーナス適用後 🪙 コイン</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace', textShadow: '0 0 4px rgba(255,230,0,0.5)' }}>
              {coinsWithBonus.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 記録名 — placed directly above 脱出 */}
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

        {/* 🚪 Escape + 現在値リセット — placed AFTER the current values */}
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
      {/* 累計値 (Cumulative, manually editable)                   */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BarChart3 size={12} color="var(--cyan-neon)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>累計値 (手動編集可)</span>
        </div>

        {/* 累計ファンス (with cap) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              $ ファンス累計 <span style={{ fontSize: '9px' }}>(隔週リセット)</span>:
            </span>
            <span>
              {renderCumulativeValue('recordedFans', state.recordedFans, 'var(--cyan-neon)')}
              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>/ {BIWEEKLY_FANS_CAP.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
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

        {/* 累計コイン (cap only, never auto-reset) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              🪙 コイン累計 <span style={{ fontSize: '9px' }}>(累積)</span>:
            </span>
            <span>
              {renderCumulativeValue('recordedCoins', state.recordedCoins, 'var(--cyan-neon)')}
              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>/ {BIWEEKLY_COINS_CAP.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
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

        {/* 累計にくきゅうポイント (no cap, never auto-reset) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              🐾 にくきゅうpt累計 <span style={{ fontSize: '9px' }}>(累積)</span>:
            </span>
            <span>
              {renderCumulativeValue('recordedNikukyuu', state.recordedNikukyuu, 'var(--yellow-neon)')}
              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>pt</span>
            </span>
          </div>
        </div>

        <div style={smallText}>
          ※累計値は値をクリックして手動編集できます
        </div>
      </div>

      {/* ====================================================== */}
      {/* 今週の目標 (Weekly challenge goals)                       */}
      {/* ====================================================== */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Target size={12} color="var(--magenta-neon, #ff00ff)" />
          <span style={{ ...labelBaseStyle, marginBottom: 0 }}>今週の目標 ({state.goals.length}件)</span>
        </div>

        {/* Add new goal inline form */}
        {showAddGoal ? (
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
                onChange={(e) => setNewGoal(g => ({ ...g, target: e.target.value }))}
                placeholder="目標数"
              />
              <input
                type="number"
                min="0"
                className="input-cyber"
                style={{ fontSize: '11px', padding: '3px 6px' }}
                value={newGoal.reward}
                onChange={(e) => setNewGoal(g => ({ ...g, reward: e.target.value }))}
                placeholder="報酬 (任意)"
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn-cyber success"
                style={{ flex: 1, padding: '4px', fontSize: '10px' }}
                onClick={handleAddGoal}
              >
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
        ) : (
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
              onClick={() => setShowOcrModal(true)}
              title="スクリーンショットからOCRで目標を一括追加"
            >
              <ScanText size={10} /> SSから追加
            </button>
          </div>
        )}

        {/* Goal list */}
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
                    <span
                      style={{
                        flex: 1,
                        color: goal.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: goal.completed ? 'line-through' : 'none',
                        fontWeight: 600
                      }}
                    >
                      {goal.name}
                    </span>
                    {goal.reward !== undefined && goal.reward > 0 && (
                      <span style={{ color: 'var(--yellow-neon)', fontSize: '9px', fontWeight: 700 }}>
                        🪙{goal.reward}
                      </span>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                    {editingGoalId === goal.id ? (
                      <>
                        <input
                          type="number"
                          min="0"
                          className="input-cyber"
                          style={{ width: '70px', fontSize: '11px', fontWeight: 700, padding: '1px 4px', textAlign: 'right', fontFamily: 'monospace' }}
                          value={editingGoalCurrent}
                          onChange={(e) => setEditingGoalCurrent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEditGoalCurrent();
                            if (e.key === 'Escape') cancelEditGoalCurrent();
                          }}
                          onBlur={commitEditGoalCurrent}
                          autoFocus
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> / {goal.target.toLocaleString()}</span>
                      </>
                    ) : (
                      <span
                        onClick={() => startEditGoalCurrent(goal)}
                        style={{ color: goal.completed ? 'var(--green-neon)' : 'var(--cyan-neon)', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer', borderBottom: `1px dashed ${goal.completed ? 'var(--green-neon)' : 'var(--cyan-neon)'}55` }}
                        title="クリックで進捗を編集"
                      >
                        {goal.current.toLocaleString()} / {goal.target.toLocaleString()}
                        <Pencil size={9} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: 0.6 }} />
                      </span>
                    )}
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

        {state.goals.length > 0 && (
          <button
            className="btn-cyber danger"
            style={{ width: '100%', padding: '3px', fontSize: '9px', marginTop: '6px', clipPath: 'none' }}
            onClick={handleClearAllGoals}
            title="今週の目標を全て削除"
          >
            目標を全削除
          </button>
        )}
      </div>

      {/* ====================================================== */}
      {/* SS OCR モーダル                                           */}
      {/* ====================================================== */}
      {showOcrModal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={handleCloseOcr}
        >
          <div
            style={{ background: 'var(--panel-bg, #0a0e18)', border: '1px solid rgba(255,0,255,0.3)', borderRadius: '12px', width: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,0,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ScanText size={14} color="var(--magenta-neon, #ff00ff)" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--magenta-neon, #ff00ff)' }}>SSから目標を追加 (OCR)</span>
              </div>
              <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '10px' }} onClick={handleCloseOcr}>
                ✕ 閉じる
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Input methods */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <label className="btn-cyber" style={{ flex: 1, padding: '6px', fontSize: '11px', textAlign: 'center', cursor: 'pointer' }}>
                  <ImageIcon size={11} /> ファイル選択(複数可)
                  <input type="file" accept="image/*" multiple onChange={handleOcrFileInput} style={{ display: 'none' }} />
                </label>
                <button className="btn-cyber" style={{ flex: 1, padding: '6px', fontSize: '11px' }} onClick={handleOcrPaste}>
                  <ClipboardPaste size={11} /> クリップボードから
                </button>
              </div>

              {/* Status / progress */}
              {ocrStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {ocrProgress < 1 && ocrParsed.length === 0 && <Loader2 size={12} className="spin" />}
                  <span>{ocrStatus}</span>
                  {ocrProgress > 0 && ocrProgress < 1 && (
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(ocrProgress * 100)}%`, background: 'var(--magenta-neon, #ff00ff)' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Image preview */}
              {ocrPreview && (
                <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,0,255,0.2)', borderRadius: '4px', padding: '4px', textAlign: 'center' }}>
                  <img src={ocrPreview} alt="preview" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} />
                </div>
              )}

              {/* Parsed goals list */}
              {ocrParsed.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--magenta-neon, #ff00ff)', fontWeight: 700, marginBottom: '4px' }}>
                    検出された目標 (編集可)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {ocrParsed.map((g, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,0,255,0.05)', border: '1px solid rgba(255,0,255,0.2)', borderRadius: '4px', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="input-cyber"
                            style={{ flex: 1, fontSize: '11px', padding: '2px 4px' }}
                            value={g.name}
                            onChange={(e) => updateParsedGoal(idx, 'name', e.target.value)}
                            placeholder="目標名"
                          />
                          <button
                            className="btn-cyber danger"
                            style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
                            onClick={() => removeParsedGoal(idx)}
                            title="削除"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                          <input
                            type="number"
                            className="input-cyber"
                            style={{ fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                            value={g.target}
                            onChange={(e) => updateParsedGoal(idx, 'target', e.target.value)}
                            placeholder="目標"
                          />
                          <input
                            type="number"
                            className="input-cyber"
                            style={{ fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                            value={g.current}
                            onChange={(e) => updateParsedGoal(idx, 'current', e.target.value)}
                            placeholder="現在"
                          />
                          <input
                            type="number"
                            className="input-cyber"
                            style={{ fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                            value={g.reward}
                            onChange={(e) => updateParsedGoal(idx, 'reward', e.target.value)}
                            placeholder="報酬"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw OCR text (for debugging) */}
              {ocrRawText && (
                <details style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  <summary style={{ cursor: 'pointer' }}>OCR生テキストを表示</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0 0', padding: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', maxHeight: '120px', overflowY: 'auto' }}>{ocrRawText}</pre>
                </details>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', borderTop: '1px solid rgba(255,0,255,0.2)' }}>
              <button
                className="btn-cyber success"
                style={{ flex: 2, padding: '7px', fontSize: '12px', fontWeight: 700 }}
                onClick={handleConfirmOcr}
                disabled={ocrParsed.length === 0}
              >
                <Check size={12} /> {ocrParsed.length}件を追加
              </button>
              <button
                className="btn-cyber"
                style={{ flex: 1, padding: '7px', fontSize: '11px' }}
                onClick={handleCloseOcr}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

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
            {/* Average summary (compact) */}
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
                <span style={{ color: 'var(--text-muted)' }}>平均 (除外 {state.records.filter(r => r.excluded).length}件除く):</span>
                <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>
                  {average.fans.toLocaleString()}f / 🪙{average.coins.toLocaleString()} / {average.nikukyuu}pt
                </span>
              </div>
            </div>

            {/* Records list — inline shows only the latest RECORDS_INLINE_LIMIT */}
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

            {/* 一覧表示 — opens a modal with all records, CSV export, and full reset */}
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
      {/* 脱出記録 一覧モーダル                                     */}
      {/* ====================================================== */}
      {showAllRecords && (
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
                脱出記録 一覧 ({state.records.length}件)
              </div>
              <button className="btn-cyber" style={{ padding: '3px 10px', fontSize: '10px' }} onClick={() => setShowAllRecords(false)}>
                ✕ 閉じる
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
                <Download size={11} /> CSVエクスポート
              </button>
              <button
                className="btn-cyber danger"
                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                onClick={handleManualResetPeriod}
                title="累計値・現在値・記録履歴を全てリセット"
              >
                <AlertTriangle size={11} /> 全リセット
              </button>
            </div>
          </div>
        </div>
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
          title="一時的に平均計算から除外"
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
          title="この記録を削除"
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
            >保存</button>
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
            title="クリックで記録名を編集"
          >
            {rec.location || '(記録名なし - クリックで追加)'}
          </span>
        )}
        <span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginLeft: '4px' }}>
          {rec.fans.toLocaleString()} / 🪙{rec.coins.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
