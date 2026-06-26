import React, { useState, useEffect, useMemo } from 'react';
import {
  type PlayDataState,
  type PlayDataRecord,
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
  BIWEEKLY_FANS_CAP,
  BIWEEKLY_COINS_CAP,
  FANS_PER_NIKUKYUU_POINT
} from '../utils/PlayDataManager';
import { Download, Trash2, AlertTriangle, TrendingUp, Clock, BarChart3 } from 'lucide-react';

interface PlayDataPanelProps {
  onNotify?: (msg: string) => void;
}

export function PlayDataPanel({ onNotify }: PlayDataPanelProps) {
  const [state, setState] = useState<PlayDataState>(() => checkAutoReset(loadPlayData()));
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string>('');

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    savePlayData(state);
  }, [state]);

  // Periodically check for auto-reset (e.g. the app is left open past a reset)
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
  const setRequiem15 = (v: boolean) => {
    setState(prev => ({ ...prev, requiem15: v }));
  };
  const setRequiem20 = (v: boolean) => {
    setState(prev => ({ ...prev, requiem20: v }));
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
    // Ensure a period exists; if not, start one now.
    let periodStart = state.periodStart;
    if (!periodStart) periodStart = now;

    // Check whether a reset has just fired before this run is committed
    const preState: PlayDataState = { ...state, periodStart };
    const post = checkAutoReset(preState, now);

    // Add to cumulative with cap
    const addedFans = Math.min(state.currentFans, Math.max(0, BIWEEKLY_FANS_CAP - post.recordedFans));
    const addedCoins = Math.min(state.currentCoins, Math.max(0, BIWEEKLY_COINS_CAP - post.recordedCoins));

    const newRecord: PlayDataRecord = {
      id: generateRecordId(),
      timestamp: now,
      fans: state.currentFans,
      coins: state.currentCoins,
      location: state.recordedLocation.trim(),
      requiem15: state.requiem15,
      requiem20: state.requiem20,
      excluded: false
    };

    setState({
      ...post,
      recordedFans: post.recordedFans + addedFans,
      recordedCoins: post.recordedCoins + addedCoins,
      records: [...post.records, newRecord],
      periodStart: post.periodStart
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
      currentFans: 0,
      currentCoins: 0,
      periodStart: Date.now(),
      records: []
    }));
    notify('記録値と現在値をリセットしました');
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

  // --- Styling helpers ---
  const labelStyle: React.CSSProperties = {
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

  const sectionStyle: React.CSSProperties = {
    background: 'rgba(10, 15, 28, 0.6)',
    border: '1px solid rgba(0, 240, 255, 0.2)',
    borderRadius: '6px',
    padding: '8px',
    marginTop: '8px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* --- Current run input --- */}
      <div style={sectionStyle}>
        <div style={labelStyle}>🐾 今回の獲得</div>
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

        {/* Requiem bonus toggles */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <label
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: state.requiem15 ? '#ff9500' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '4px 6px',
              border: `1px solid ${state.requiem15 ? 'rgba(255,149,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem15 ? 'rgba(255,149,0,0.1)' : 'transparent'
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
              gap: '4px',
              fontSize: '11px',
              color: state.requiem20 ? '#ff00ff' : 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '4px 6px',
              border: `1px solid ${state.requiem20 ? 'rgba(255,0,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              background: state.requiem20 ? 'rgba(255,0,255,0.1)' : 'transparent'
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

        {/* Bonus-applied display */}
        <div
          style={{
            marginTop: '6px',
            padding: '4px 6px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '3px',
            fontSize: '10px',
            color: 'var(--text-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>ボーナス適用後 ファンス:</span>
            <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>
              {fansWithBonus.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>ボーナス適用後 コイン:</span>
            <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>
              {coinsWithBonus.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* --- Nikukyuu points --- */}
      <div
        style={{
          ...sectionStyle,
          borderColor: 'rgba(255, 215, 0, 0.3)',
          background: 'rgba(255, 215, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px' }}>🐾</span>
          <span style={{ fontSize: '12px', color: 'var(--yellow-neon)', fontWeight: 700 }}>にくきゅうポイント</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--yellow-neon)', fontFamily: 'monospace' }}>
            {nikukyuuCurrent}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>pt</span>
        </div>
        <div style={smallText}>
          入力ファンス ({state.currentFans.toLocaleString()}) ÷ {FANS_PER_NIKUKYUU_POINT} = {nikukyuuCurrent}pt
        </div>
        <div style={smallText}>
          ※レクイエムボーナスの影響を受けず元の獲得数から算出
        </div>
      </div>

      {/* --- Recorded value (cumulative) --- */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <BarChart3 size={12} color="var(--cyan-neon)" />
          <span style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>記録値 (累計・隔週)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>ファンス:</span>
            <span>
              <span style={{ color: 'var(--cyan-neon)', fontWeight: 700 }}>
                {state.recordedFans.toLocaleString()}
              </span>
              <span style={{ color: 'var(--text-muted)' }}> / {BIWEEKLY_FANS_CAP.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (state.recordedFans / BIWEEKLY_FANS_CAP) * 100)}%`,
                background: state.recordedFans >= BIWEEKLY_FANS_CAP ? 'var(--red-neon)' : 'var(--cyan-neon)',
                transition: 'width 0.2s'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>コイン:</span>
            <span>
              <span style={{ color: 'var(--cyan-neon)', fontWeight: 700 }}>
                {state.recordedCoins.toLocaleString()}
              </span>
              <span style={{ color: 'var(--text-muted)' }}> / {BIWEEKLY_COINS_CAP.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
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
        <div style={{ ...smallText, marginTop: '6px' }}>
          残り: ファンス {remaining.fans.toLocaleString()} / コイン {remaining.coins.toLocaleString()}
        </div>
      </div>

      {/* --- Record location + escape button --- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>📍 記録地</label>
        <input
          type="text"
          className="input-cyber"
          style={inputStyle}
          value={state.recordedLocation}
          onChange={(e) => setRecordedLocation(e.target.value)}
          placeholder="例: 本日 1回目"
        />

        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <button
            className="btn-cyber success"
            style={{ flex: 2, padding: '6px', fontSize: '12px' }}
            onClick={handleEscape}
            title="現在の値を記録値に加算してリストに追加"
          >
            🚪 脱出 (加算)
          </button>
          <button
            className="btn-cyber"
            style={{ flex: 1, padding: '6px', fontSize: '10px' }}
            onClick={handleResetCurrent}
            title="入力中の現在値のみリセット"
          >
            現在値リセット
          </button>
        </div>
      </div>

      {/* --- Next reset info --- */}
      <div
        style={{
          ...sectionStyle,
          borderColor: 'rgba(57, 255, 20, 0.3)',
          background: 'rgba(57, 255, 20, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <Clock size={12} color="var(--green-neon)" />
          <span style={{ fontSize: '12px', color: 'var(--green-neon)', fontWeight: 700 }}>次の更新 (隔週月曜 5:00)</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
          {formatNextReset(state.periodStart)}
        </div>
        {timeUntilReset && timeUntilReset.total > 0 && (
          <div style={smallText}>
            あと {timeUntilReset.days}日 {timeUntilReset.hours}時間
          </div>
        )}
        <div style={smallText}>
          ※前回脱出記録から算出して自動リセットされます
        </div>
        <button
          className="btn-cyber danger"
          style={{ width: '100%', marginTop: '6px', padding: '4px', fontSize: '10px', clipPath: 'none' }}
          onClick={handleManualResetPeriod}
          title="記録値と現在値を全てリセット（リストも削除）"
        >
          <AlertTriangle size={10} /> 記録値を全てリセット
        </button>
      </div>

      {/* --- Records list --- */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <TrendingUp size={12} color="var(--cyan-neon)" />
          <span style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: 700 }}>
            脱出記録 ({state.records.length}件)
          </span>
        </div>

        {state.records.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
            まだ脱出記録がありません
          </div>
        ) : (
          <>
            {/* Average summary */}
            <div
              style={{
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 240, 255, 0.2)',
                borderRadius: '4px',
                padding: '6px',
                marginBottom: '6px',
                fontSize: '11px'
              }}
            >
              <div style={{ color: 'var(--cyan-neon)', fontWeight: 700, marginBottom: '2px' }}>
                平均 (除外 {state.records.filter(r => r.excluded).length}件除く)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ファンス/回:</span>
                <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>{average.fans.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>コイン/回:</span>
                <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>{average.coins.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>にくきゅうpt/回:</span>
                <span style={{ color: 'var(--yellow-neon)', fontWeight: 700 }}>{average.nikukyuu}</span>
              </div>
            </div>

            {/* CSV Export */}
            <button
              className="btn-cyber"
              style={{ width: '100%', padding: '4px', fontSize: '10px', marginBottom: '6px' }}
              onClick={handleExportCSV}
            >
              <Download size={10} /> CSVエクスポート
            </button>

            {/* Records list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
              {state.records.slice().reverse().map(rec => (
                <div
                  key={rec.id}
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
                      onChange={() => handleToggleExcluded(rec.id)}
                      title="一時的に平均計算から除外"
                      style={{ cursor: 'pointer', accentColor: 'var(--cyan-neon)' }}
                    />
                    <span style={{ flex: 1, color: 'var(--text-muted)' }}>
                      {new Date(rec.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {(rec.requiem15 || rec.requiem20) && (
                      <span style={{ color: '#ff9500', fontSize: '9px' }}>
                        {[rec.requiem15 && '+15', rec.requiem20 && '+20'].filter(Boolean).join('/')}%
                      </span>
                    )}
                    <button
                      className="btn-cyber danger"
                      style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', lineHeight: 1.2 }}
                      onClick={() => handleDeleteRecord(rec.id)}
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
                            if (e.key === 'Enter') handleSaveLocation(rec.id);
                            if (e.key === 'Escape') handleCancelEditLocation();
                          }}
                          autoFocus
                        />
                        <button
                          className="btn-cyber success"
                          style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', marginLeft: '2px' }}
                          onClick={() => handleSaveLocation(rec.id)}
                        >保存</button>
                        <button
                          className="btn-cyber"
                          style={{ padding: '0 4px', fontSize: '9px', clipPath: 'none', marginLeft: '2px' }}
                          onClick={handleCancelEditLocation}
                        >×</button>
                      </>
                    ) : (
                      <span
                        style={{ color: rec.location ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: rec.location ? 'normal' : 'italic', cursor: 'pointer', flex: 1 }}
                        onClick={() => handleStartEditLocation(rec)}
                        title="クリックで記録地を編集"
                      >
                        {rec.location || '(記録地なし - クリックで追加)'}
                      </span>
                    )}
                    <span style={{ color: 'var(--yellow-neon)', fontWeight: 700, marginLeft: '4px' }}>
                      {rec.fans.toLocaleString()} / 🪙{rec.coins.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
