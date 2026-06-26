export interface ParsedGoal {
  name: string;
  target: number;
  current: number;
  reward: number;
}

/**
 * Parse OCR output from a 挑戦目標 (challenge goals) screenshot.
 *
 * The screenshot is a full game window with a lot of UI chrome (tab names,
 * page title, UID, sidebar labels, …). Tesseract is noisy on this, so we
 * need a tolerant parser:
 *
 *  1. Strip obvious UI-chrome lines (UID, tab names, sidebar labels, …).
 *  2. Find progress patterns — accept `[N/M]`, `N/M`, `N／M`, even
 *     collapsed forms like `22722` (= `22/22`).
 *  3. Identify goal-name lines — any line containing Japanese text plus
 *     `を`/`を獲得`/etc. (lenient: also accept lines that simply contain
 *     Japanese characters and are long enough).
 *  4. Reward lines — standalone integer 50..999999.
 *  5. Greedy group: name → progress → reward.
 *  6. Fallback: if a goal line has no detected target but contains
 *     `をN個集める` / `を獲得`, extract the number as the target.
 */

// Lines that are clearly UI chrome — never treat as goal data.
const NOISE_KEYWORDS = [
  'UID', 'uid', 'Uid',
  '挑戦目標', '挑戦 目標',
  'ポイント報酬', 'にくきゅう図鑑',
  '普通', '収集', '今期',
  '残り時間', '今期更新回数',
  '受け取る', '更新', '一括受け取り',
  '今週', '期間',
  'ピンク', 'パウ', 'バンク',
  'タブ', 'メニュー', '閉じる',
  'めう', 'め う', '弟 盗', '大 強', '強 盗',
  // page title variants
  'にくきゅう大強盗'
];

/** Returns true if the line is almost certainly UI chrome, not a goal. */
function isNoiseLine(line: string): boolean {
  if (line.length < 2) return true;
  for (const kw of NOISE_KEYWORDS) {
    if (line.includes(kw)) return true;
  }
  // Lines that are just symbols / decorative chars
  if (/^[\sー\-ー「」『』\(\)\[\]【】・、。,…~〜]+$/.test(line)) return true;
  return false;
}

type LineKind = 'name' | 'progress' | 'reward' | 'skip';

/**
 * Extract a {current, target} progress pair from a noisy string.
 * Accepts: `[22/22]`, `22/22`, `22／22`, `22722`, `2407240` etc.
 * For collapsed forms, succeeds only when both halves are identical.
 */
export function extractProgress(raw: string): { current: number; target: number } | null {
  // Standard form: [N/M] or N/M
  const re = /[\[\(]?\s*(\d{1,9})\s*[\/／]\s*(\d{1,9})\s*[\]\)]?/;
  const m = raw.match(re);
  if (m) {
    const cur = parseInt(m[1]);
    const tgt = parseInt(m[2]);
    if (tgt > 0 && cur >= 0 && cur <= tgt * 1.1) {
      return { current: cur, target: tgt };
    }
  }
  // Collapsed form: "22722" → 22/22 (works when len is even and halves match)
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length >= 4 && digits.length % 2 === 0) {
    const half = digits.length / 2;
    const a = digits.slice(0, half);
    const b = digits.slice(half);
    if (a === b) {
      const n = parseInt(a);
      if (n > 0) return { current: n, target: n };
    }
  }
  return null;
}

/** Extract a reward number from a standalone numeric line. */
function extractReward(raw: string): number | null {
  const cleaned = raw.replace(/[,，\s　]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned);
  if (n < 50 || n > 999999) return null;
  return n;
}

/** Does this line look like a goal name? Lenient. */
function looksLikeGoalName(line: string): boolean {
  if (line.length < 3) return false;
  // Must contain Japanese text
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(line)) return false;
  // Common goal-name indicators
  if (/を.+?(集める|獲得|体集める|枚集める|個集める|体)/.test(line)) return true;
  if (/(を獲得|を入手|を集める)/.test(line)) return true;
  // Tolerant fallback: contains Japanese and not just whitespace/punct
  if (line.replace(/[\s　「」『』\(\)\[\]【】、。,…~〜・]/g, '').length >= 3) {
    // but exclude pure-sidebar labels by requiring some specific structure
    return true;
  }
  return false;
}

/** Extract a target number from a goal name, e.g. "を240個集める" → 240. */
function extractTargetFromName(name: string): number | null {
  const m = name.match(/[をに](\d{1,3}(?:,\d{3})*|\d+)/);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''));
    if (n > 0) return n;
  }
  return null;
}

/** Clean a noisy goal name (strip leading/trailing junk). */
function cleanGoalName(line: string): string {
  return line
    .replace(/^[「『\[\(【]?\s*/, '')
    .replace(/\s*[」』\]\)】]?$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function parseGoalsFromText(text: string): ParsedGoal[] {
  // Normalize lines
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Stage 1: classify each line (best-effort)
  const classified: Array<{ kind: LineKind; raw: string; cur?: number; tgt?: number; reward?: number; name?: string }> = [];

  for (const line of lines) {
    if (isNoiseLine(line)) {
      classified.push({ kind: 'skip', raw: line });
      continue;
    }

    // Try progress first — it can appear inside otherwise-name-looking lines
    const prog = extractProgress(line);
    if (prog) {
      // The line might be ONLY progress, or progress + name (e.g. "挑戦 [2/12 普通").
      // If it has Japanese text outside brackets, treat the rest as a name candidate.
      const stripped = line.replace(prog.current + '/' + prog.target, '')
        .replace(/[\[\(]\s*\d+\s*[\/／]\s*\d+\s*[\]\)]/, '')
        .replace(/[「」『』\(\)\[\]【】]/g, '')
        .trim();
      if (looksLikeGoalName(stripped)) {
        classified.push({ kind: 'name', raw: stripped, name: cleanGoalName(stripped) });
        classified.push({ kind: 'progress', raw: line, cur: prog.current, tgt: prog.target });
        continue;
      }
      classified.push({ kind: 'progress', raw: line, cur: prog.current, tgt: prog.target });
      continue;
    }

    // Reward candidate
    const rew = extractReward(line);
    if (rew !== null) {
      classified.push({ kind: 'reward', raw: line, reward: rew });
      continue;
    }

    // Goal name candidate
    if (looksLikeGoalName(line)) {
      classified.push({ kind: 'name', raw: line, name: cleanGoalName(line) });
      continue;
    }

    classified.push({ kind: 'skip', raw: line });
  }

  // Stage 2: greedy grouping. Each "name" is the anchor; look forward for
  // the next progress, then the next reward.
  const goals: ParsedGoal[] = [];
  let i = 0;
  while (i < classified.length) {
    if (classified[i].kind !== 'name') { i++; continue; }
    const name = classified[i].name || classified[i].raw;
    i++;

    // Skip noise lines, then look for progress
    while (i < classified.length && classified[i].kind === 'skip') i++;
    let current = 0;
    let target = 0;
    if (i < classified.length && classified[i].kind === 'progress') {
      current = classified[i].cur!;
      target = classified[i].tgt!;
      i++;
    }

    // Skip noise lines, then look for reward
    while (i < classified.length && classified[i].kind === 'skip') i++;
    let reward = 0;
    if (i < classified.length && classified[i].kind === 'reward') {
      reward = classified[i].reward!;
      i++;
    }

    // Fallback: extract target from name if missing
    if (target === 0) {
      const t = extractTargetFromName(name);
      if (t !== null) {
        target = t;
        if (current === 0) current = t;
      }
    }

    if (target > 0) {
      goals.push({ name, target, current, reward });
    }
  }

  return goals;
}
