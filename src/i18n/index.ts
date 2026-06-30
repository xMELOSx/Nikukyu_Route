import { useEffect, useState } from 'react';
import type { LangCode, Locale } from './types';
import { en } from './en';
import { ja } from './ja';
import { getUserDictFor, subscribe as subscribeUserDict } from './userDict';

const STORAGE_KEY = 'heist_lang';
const AUTO = 'auto' as const;
type Mode = typeof AUTO | LangCode;

// 現在データがあるのは ja / en のみ。zh / ko は辞書にデータが入り次第公開。
const locales: Record<LangCode, Locale> = { ja, en };
const supported: LangCode[] = ['ja', 'en'];

function detectBrowserLang(): LangCode {
  if (typeof navigator === 'undefined') return 'ja';
  const raw = (navigator.language || 'ja').toLowerCase();
  const base = raw.split('-')[0];
  if (supported.includes(base as LangCode)) return base as LangCode;
  return 'ja';
}

function loadMode(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === AUTO || v === null || v === undefined) return AUTO;
    if (supported.includes(v as LangCode)) return v as LangCode;
  } catch { /* ignore */ }
  return AUTO;
}

function saveMode(m: Mode) {
  try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
}

let currentMode: Mode = (() => {
  if (typeof window === 'undefined') return AUTO;
  return loadMode();
})();

let currentLang: LangCode = currentMode === AUTO ? detectBrowserLang() : (currentMode as LangCode);

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function applyMode(next: Mode) {
  currentMode = next;
  currentLang = next === AUTO ? detectBrowserLang() : (next as LangCode);
  saveMode(next);
  emit();
}

export function getLang(): LangCode { return currentLang; }
export function getMode(): Mode { return currentMode; }
export function getDetectedLang(): LangCode { return detectBrowserLang(); }

export function setLang(lang: LangCode) {
  applyMode(lang);
}

export function setAutoLang() {
  applyMode(AUTO);
}

/**
 * UI 言語が ja の場合、en 辞書を引く (= 日本語→英語)
 * UI 言語が en の場合、ja 辞書を引く (= 英語→日本語、逆翻訳用)
 * UI 言語が zh/ko の場合、en 辞書を引く
 *
 * つまり「現在の UI 言語以外の、対応する辞書」を引いて原文→UI言語の翻訳を得る。
 */
function getInverseDictLang(): LangCode {
  if (currentLang === 'ja') return 'en';
  if (currentLang === 'en') return 'ja';
  return 'en';
}

export function t(key: string, ...args: unknown[]): string {
  // 1. アプリ辞書 (固定) を引く
  const locale = locales[currentLang];
  let s = (locale?.dict && locale.dict[key]) || '';
  // 2. アプリ辞書に無ければユーザー辞書を引く
  //    UI 言語に対応する「逆方向」の辞書を引く
  if (!s) {
    const user = getUserDictFor(getInverseDictLang());
    s = user[key] || '';
  }
  // 3. それでも無ければ原文を返す
  if (!s) s = key;
  for (let i = 0; i < args.length; i++) {
    s = s.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
  }
  return s;
}

/**
 * ユーザー入力テキスト(マーカー note など)に対する翻訳。
 * - "__i18n:KEY" で始まる文字列を key として翻訳
 * - プレフィックスなしの通常の日本語は原文ママ
 * - ただし、現在の UI 言語が ja のとき、ユーザー辞書の en 側に
 *   完全一致エントリがあれば翻訳 (例: マーカーに「シャドウファング」と
 *   書かれていて、en 辞書に「シャドウファング」→「Shadow Fang」があれば英語化)
 */
export function tNote(note: string | undefined | null): string {
  if (!note) return '';
  if (note.startsWith('__i18n:')) return t(note.slice('__i18n:'.length));
  const trimmed = note.trim();
  if (trimmed) {
    const inverseLang = getInverseDictLang();
    const inverse = getUserDictFor(inverseLang);
    if (inverse[trimmed]) return inverse[trimmed];
    if (currentLang === 'en') {
      const en = getUserDictFor('en');
      if (en[trimmed]) return en[trimmed];
    }
  }
  return note;
}

export function tMarkerText(text: string | undefined | null): string {
  return tNote(text);
}

export function useLangState() {
  const [snapshot, setSnapshot] = useState(() => ({
    lang: currentLang,
    mode: currentMode,
    detected: detectBrowserLang(),
    userDictVersion: 0,
  }));
  useEffect(() => {
    const cb = () => setSnapshot({
      lang: currentLang,
      mode: currentMode,
      detected: detectBrowserLang(),
      userDictVersion: 0,
    });
    listeners.add(cb);
    const cb2 = () => setSnapshot(s => ({ ...s, userDictVersion: s.userDictVersion + 1 }));
    subscribeUserDict(cb2);
    return () => {
      listeners.delete(cb);
      // userDict subscriber cleans itself via subscribe API
    };
  }, []);
  return snapshot;
}

export function useLang(): {
  lang: LangCode;
  mode: Mode;
  detected: LangCode;
  setLang: (l: LangCode) => void;
  setAutoLang: () => void;
} {
  const { lang, mode, detected } = useLangState();
  return { lang, mode, detected, setLang, setAutoLang };
}

export { supported as supportedLangs };
export type { LangCode, Locale } from './types';

export const useLangSnapshot = useLangState;
