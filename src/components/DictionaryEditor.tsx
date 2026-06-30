import { useState, useMemo } from 'react';
import { Plus, Trash2, Search, Download, Upload, Eraser } from 'lucide-react';
import { useLang, type LangCode } from '../i18n';
import {
  getUserDict,
  setEntry,
  deleteEntry,
  clearForLang,
  type UserDict,
} from '../i18n/userDict';

const LANG_OPTIONS: { code: LangCode; label: string; description: string }[] = [
  { code: 'en', label: '🇺🇸 English', description: 'Used to translate ja → en' },
  { code: 'ja', label: '🇯🇵 日本語', description: 'Used to translate en → ja' },
];

export function DictionaryEditor() {
  const { lang: uiLang } = useLang();
  // デフォルト編集対象は「UI 言語が ja のときは en、en のときは ja」
  // つまり逆翻訳(原文→UI) 用の言語
  const defaultTarget: LangCode = uiLang === 'ja' ? 'en' : (uiLang === 'en' ? 'ja' : 'en');
  const [targetLang, setTargetLang] = useState<LangCode>(defaultTarget);
  const [, force] = useState(0);
  const [filter, setFilter] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const allDict: UserDict = getUserDict();

  const list = useMemo(() => {
    const entries = Object.entries(allDict[targetLang] || {});
    if (!filter) return entries;
    const f = filter.toLowerCase();
    return entries.filter(([k, v]) =>
      k.toLowerCase().includes(f) || v.toLowerCase().includes(f)
    );
  }, [allDict, targetLang, filter]);

  const handleAdd = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (!k || !v) return;
    setEntry(targetLang, k, v);
    setNewKey('');
    setNewVal('');
    force(x => x + 1);
  };

  const handleDelete = (k: string) => {
    if (!confirm(`Delete entry "${k}" from ${targetLang}?`)) return;
    deleteEntry(targetLang, k);
    force(x => x + 1);
  };

  const handleClear = () => {
    if (!confirm(`Clear all entries in ${targetLang}?`)) return;
    clearForLang(targetLang);
    force(x => x + 1);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(allDict, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-dict-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid');
        for (const l of ['ja', 'en'] as const) {
          if (parsed[l] && typeof parsed[l] === 'object') {
            for (const [k, v] of Object.entries(parsed[l])) {
              if (typeof v === 'string') setEntry(l, k, v);
            }
          }
        }
        force(x => x + 1);
      } catch {
        alert('Failed to parse user dictionary file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{
      background: 'rgba(10, 15, 28, 0.85)',
      border: '1px solid rgba(255, 215, 0, 0.4)',
      borderRadius: '6px',
      padding: '10px',
      display: 'flex', flexDirection: 'column', gap: '8px',
      fontSize: '11px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#ffd700', fontWeight: 700, fontSize: '12px' }}>
          📖 Dictionary Editor — {list.length} entries
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={handleExport} className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px' }}>
            <Download size={10} /> Export
          </button>
          <label className="btn-cyber" style={{ padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>
            <Upload size={10} /> Import
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button onClick={handleClear} className="btn-cyber danger" style={{ padding: '2px 6px', fontSize: '10px' }}>
            <Eraser size={10} /> Clear
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', border: '1px solid rgba(255,215,0,0.15)' }}>
        <span style={{ fontSize: '10px', color: '#aaa' }}>Editing:</span>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value as LangCode)}
          style={{
            flex: 1, padding: '3px 6px', fontSize: '11px',
            background: 'rgba(5,7,10,0.8)', color: '#fff',
            border: '1px solid rgba(255,215,0,0.3)', borderRadius: '3px',
          }}
        >
          {LANG_OPTIONS.map(opt => (
            <option key={opt.code} value={opt.code}>{opt.label} — {opt.description}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={11} style={{ position: 'absolute', left: 6, top: 6, color: '#888' }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter..."
            style={{
              width: '100%', padding: '4px 6px 4px 22px',
              background: 'rgba(5,7,10,0.8)', color: '#fff',
              border: '1px solid rgba(0,240,255,0.3)', borderRadius: '3px',
              fontSize: '11px',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <input
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="key (原文)"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          style={{
            flex: 1, padding: '4px 6px',
            background: 'rgba(5,7,10,0.8)', color: '#fff',
            border: '1px solid rgba(0,240,255,0.3)', borderRadius: '3px',
            fontSize: '11px',
          }}
        />
        <input
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          placeholder={`translation (${targetLang})`}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          style={{
            flex: 1, padding: '4px 6px',
            background: 'rgba(5,7,10,0.8)', color: '#fff',
            border: '1px solid rgba(0,240,255,0.3)', borderRadius: '3px',
            fontSize: '11px',
          }}
        />
        <button onClick={handleAdd} className="btn-cyber success" style={{ padding: '4px 10px', fontSize: '11px' }}>
          <Plus size={11} /> Add
        </button>
      </div>

      <div style={{ fontSize: '9px', color: '#888', padding: '0 2px', lineHeight: 1.4 }}>
        Tip: To translate Japanese UI text to English, edit the <strong style={{ color: '#ffd700' }}>🇺🇸 English</strong> dictionary
        (key = Japanese text, value = English translation).<br />
        For translating user-entered marker names, paste the original Japanese in the key field and the English version in the value field.
      </div>

      <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {list.length === 0 ? (
          <div style={{ color: '#888', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
            No entries. Add some above.
          </div>
        ) : (
          list.map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 6px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '3px',
              border: '1px solid rgba(0,240,255,0.1)',
            }}>
              <span style={{ flex: 1, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k}
              </span>
              <span style={{ color: '#888' }}>→</span>
              <input
                defaultValue={v}
                onBlur={e => {
                  if (e.target.value !== v) setEntry(targetLang, k, e.target.value);
                }}
                style={{
                  flex: 1, padding: '2px 4px',
                  background: 'rgba(0,240,255,0.05)', color: '#fff',
                  border: '1px solid rgba(0,240,255,0.2)', borderRadius: '2px',
                  fontSize: '11px',
                }}
              />
              <button
                onClick={() => handleDelete(k)}
                className="btn-cyber danger"
                style={{ padding: '2px 4px', fontSize: '10px' }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
