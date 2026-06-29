import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useLang, supportedLangs, type LangCode } from '../i18n';

const FLAG: Record<LangCode, string> = {
  ja: '🇯🇵',
  en: '🇺🇸',
};

const LANG_NAME: Record<LangCode, string> = {
  ja: '日本語',
  en: 'English',
};

export function LanguageSwitcher() {
  const { lang, mode, detected, setLang, setAutoLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const labelAuto = `Auto (${LANG_NAME[detected]})`;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'block', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Language / 言語"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
          width: '100%', padding: '8px 10px', fontSize: '12px',
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid rgba(0, 240, 255, 0.25)',
          borderRadius: '4px', color: 'var(--cyan-neon)',
          cursor: 'pointer', fontWeight: 700, boxSizing: 'border-box',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <Globe size={14} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{FLAG[lang]} {LANG_NAME[lang]}</span>
            {mode === 'auto' && <span style={{ fontSize: '9px', opacity: 0.6 }}>(auto)</span>}
          </span>
        </span>
        <span style={{ fontSize: '9px', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          translate="no"
          style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
            background: 'rgba(10, 15, 28, 0.98)',
            border: '1px solid rgba(0, 240, 255, 0.4)',
            borderRadius: '6px', padding: '4px', zIndex: 5000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}
        >
          <button
            type="button"
            onClick={() => { setAutoLang(); setOpen(false); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '6px 10px', fontSize: '11px', background: 'transparent',
              border: 'none', borderRadius: '3px', color: mode === 'auto' ? 'var(--cyan-neon)' : 'var(--text-primary)',
              fontWeight: mode === 'auto' ? 700 : 400, cursor: 'pointer',
            }}
          >
            {labelAuto}
          </button>
          <div style={{ height: '1px', background: 'rgba(0,240,255,0.2)', margin: '4px 0' }} />
          {supportedLangs.map(code => (
            <button
              key={code}
              type="button"
              onClick={() => { setLang(code); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', fontSize: '11px', background: 'transparent',
                border: 'none', borderRadius: '3px', color: mode === code ? 'var(--cyan-neon)' : 'var(--text-primary)',
                fontWeight: mode === code ? 700 : 400, cursor: 'pointer',
              }}
            >
              {FLAG[code]} {LANG_NAME[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
