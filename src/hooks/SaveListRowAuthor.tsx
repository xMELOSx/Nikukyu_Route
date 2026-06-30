import React, { useEffect, useState } from 'react';
import { AUTHOR_DEFAULT_PLAIN, AUTHOR_UNKNOWN_MARKER, aesGcmDecrypt, AUTHOR_TAMPERED, getRenderCacheKey } from '../utils/DataManager';
import { useAuthorField } from './useAuthorField';

interface SaveListRowAuthorProps {
  authorEnc: string;
  renderCacheEnc: string;
  routeId: string;
  createdAt: number;
}

const FieldText: React.FC<{
  isDefault: boolean;
  plain: string;
  label: string;
  tampered?: boolean;
}> = ({ isDefault, plain, label, tampered }) => {
  if (tampered) {
    return <span style={{ color: 'var(--text-danger, #ff0055)' }}>{label}: Anomaly</span>;
  }
  if (isDefault || !plain) {
    return <span style={{ color: 'var(--text-muted)' }}>{label}: No name</span>;
  }
  return <span>{label}: {plain}</span>;
};

/**
 * セーブ一覧 1 行の author / renderCache (=原作者) 表示。
 *  - author: 平文として直接表示
 *  - renderCache: AES-GCM 暗号文。useAuthorField で復号して表示 (DEV/local のみ意味がある)
 *  - 復号失敗 (改ざん/鍵違い) → 「Anomaly」を赤字で表示
 *  - AUTHOR_UNKNOWN_MARKER ('v2:0:') は「意図的に No name として保存」されたもの。
 *    改ざんの疑いではなくユーザの意図なので、 Anomaly ではなく No name 表示にする
 *    (= useAuthorField 側で処理)。
 */
export const SaveListRowAuthor: React.FC<SaveListRowAuthorProps> = ({
  authorEnc, renderCacheEnc, routeId
}) => {
  const authorPlain = authorEnc || '';
  const isAuthorDefault = !authorPlain || authorPlain === AUTHOR_DEFAULT_PLAIN;

  // renderCache を routeId をキーに復号 (editable=false: 改ざん時に AUTHOR_TAMPERED を維持)
  const renderCache = useAuthorField(renderCacheEnc || '', getRenderCacheKey(routeId), { editable: false });
  const isOriginalDefault = renderCache.isDefault || !renderCache.plain || renderCache.plain === AUTHOR_DEFAULT_PLAIN;
  const isOriginalTampered = renderCache.tampered;

  // 作者名と原作者名が一致している場合は、原作者名の表示を省略する
  const hideOriginal = !isAuthorDefault && !isOriginalDefault && !isOriginalTampered
    && authorPlain === renderCache.plain;

  // AUTHOR_UNKNOWN_MARKER だけ = 「No name で保存された」は Anomaly ではないので
  // 原作者行を出す必要なし (author 行と重複)。
  const isUnknownMarker = renderCacheEnc === AUTHOR_UNKNOWN_MARKER;

    // ---- デバッグ表示 (一時) ----
    // 生データ・キー・復号結果を画面とコンソールに出す。
    // 復号失敗の原因 (= 鍵違い / 改ざん / フォーマット不正) を切り分けやすくする。
    const [debugInfo, setDebugInfo] = useState<string>('');
    useEffect(() => {
      let cancelled = false;
      const enc = renderCacheEnc || '';
      const key = getRenderCacheKey(routeId);
      (async () => {
        let result = 'n/a';
        let reason = 'n/a';
        if (!enc) {
          result = '(empty)';
          reason = 'no data';
        } else if (enc === AUTHOR_UNKNOWN_MARKER) {
          result = AUTHOR_UNKNOWN_MARKER;
          reason = 'AUTHOR_UNKNOWN_MARKER (No name saved)';
        } else {
          try {
            const v = await aesGcmDecrypt(enc, key);
            if (v === AUTHOR_TAMPERED) {
              result = 'AUTHOR_TAMPERED';
              reason = 'decrypt failed (wrong key? tampered?)';
            } else {
              result = v;
              reason = 'ok';
            }
          } catch (e: any) {
            result = 'EXCEPTION';
            reason = e?.message || String(e);
          }
        }
        if (cancelled) return;
        setDebugInfo(`[enc=${enc.slice(0, 24)}… len=${enc.length}] [key=${key}] [result=${result}] [reason=${reason}]`);
        console.log('[SaveListRowAuthor]', {
          routeId,
          author: authorEnc,
          enc_preview: enc.slice(0, 40),
          enc_len: enc.length,
          key,
          result,
          reason
        });
      })();
      return () => { cancelled = true; };
    }, [renderCacheEnc, routeId, authorEnc]);

  if (isUnknownMarker) {
    return (
      <>
        <FieldText isDefault={isAuthorDefault} plain={authorPlain} label="作者" />
        <span style={{ fontSize: '9px', color: '#888', marginLeft: '8px' }}>{debugInfo}</span>
      </>
    );
  }

  return (
    <>
      <FieldText isDefault={isAuthorDefault} plain={authorPlain} label="作者" />
      {(renderCacheEnc || isOriginalTampered) && !hideOriginal
        ? <FieldText isDefault={isOriginalDefault} plain={renderCache.plain || ''} label="原作者" tampered={isOriginalTampered} />
        : null}
      <span style={{ fontSize: '9px', color: '#888', marginLeft: '8px' }}>{debugInfo}</span>
    </>
  );
};
