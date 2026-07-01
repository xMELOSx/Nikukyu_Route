import type { LangCode } from './types';

const STORAGE_KEY = 'heist_user_dict';

export type UserDict = Partial<Record<LangCode, Record<string, string>>>;

const EMPTY: UserDict = { ja: {}, en: {} };

function load(): UserDict {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return {
      ja: parsed.ja ?? {},
      en: parsed.en ?? {},
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(d: UserDict) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

let current: UserDict = (typeof window !== 'undefined') ? load() : structuredClone(EMPTY);

// public/user-dict.json を読み込み、localStorage にないエントリをマージ
// コードと一緒にデプロイされる辞書なので、どのオリジンでも利用可能
if (typeof window !== 'undefined') {
  fetch(`${import.meta.env.BASE_URL}user-dict.json`)
    .then(r => r.ok ? r.json() : null)
    .then((deployed: UserDict | null) => {
      if (!deployed) return;
      let changed = false;
      for (const lang of ['en', 'ja'] as LangCode[]) {
        const entries = deployed[lang];
        if (!entries) continue;
        if (!current[lang]) current[lang] = {};
        for (const [k, v] of Object.entries(entries)) {
          if (!current[lang]![k]) {
            current[lang]![k] = v;
            changed = true;
          }
        }
      }
      if (changed) {
        save(current);
        emit();
      }
    })
    .catch(() => {});
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function getUserDict(): UserDict {
  return {
    ja: { ...(current.ja || {}) },
    en: { ...(current.en || {}) },
  };
}

export function getUserDictFor(lang: LangCode): Record<string, string> {
  return (current[lang] as Record<string, string> | undefined) || {};
}

export function setEntry(lang: LangCode, key: string, value: string): void {
  if (!current[lang]) current[lang] = {};
  if (value === '') {
    delete current[lang][key];
  } else {
    current[lang][key] = value;
  }
  save(current);
  emit();
}

export function deleteEntry(lang: LangCode, key: string): void {
  if (current[lang] && key in current[lang]) {
    delete current[lang][key];
    save(current);
    emit();
  }
}

export function clearForLang(lang: LangCode): void {
  current[lang] = {};
  save(current);
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
