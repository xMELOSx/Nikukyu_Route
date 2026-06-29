// 辞書データがあるのは ja / en のみ。
// zh / ko を再有効化する場合は types.ts と i18n/index.ts の supported 配列を同時に更新すること。
export type LangCode = 'ja' | 'en';

export type Dict = Record<string, string>;

export interface Locale {
  code: LangCode;
  name: string;
  dict: Dict;
}
