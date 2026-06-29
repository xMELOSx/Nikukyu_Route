import type { Locale } from './types';

export const ja: Locale = {
  code: 'ja',
  name: '日本語',
  dict: {}, // 原文 = key なので辞書は空
};

// 辞書にデータが入り次第 zh / ko を再有効化する想定。
// export const zh: Locale = { code: 'zh', name: '中文', dict: {} };
// export const ko: Locale = { code: 'ko', name: '한국어', dict: {} };
