export interface HelpTab {
  id: string;
  label: string;
}

export const HELP_TABS: HelpTab[] = [
  { id: 'spec', label: '仕様' },
  { id: 'updates', label: '最近の更新' },
  { id: 'bugs', label: '奇妙な動作' },
  { id: 'help', label: '操作ヘルプ' },
  { id: 'credits', label: '出展' },
  { id: 'settings', label: '⚙️ 設定' },
  { id: 'debug', label: 'デバッグ' }
];

export interface HelpData {
  [tabId: string]: string;
}

let cachedHelpData: HelpData | null = null;

export async function fetchHelpData(): Promise<HelpData> {
  if (cachedHelpData) return cachedHelpData;

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/global-help`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedHelpData = data;
    return data;
  } catch {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}global_help.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cachedHelpData = data;
      return data;
    } catch (err) {
      console.error('Failed to load global_help.json:', err);
      cachedHelpData = {};
      return cachedHelpData;
    }
  }
}

export async function saveHelpData(data: HelpData): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/global-help`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cachedHelpData = data;
    return true;
  } catch (err) {
    console.error('Failed to save global help:', err);
    return false;
  }
}
