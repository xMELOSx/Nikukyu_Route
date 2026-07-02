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

  if (isUnknownMarker) {
    return (
      <FieldText isDefault={isAuthorDefault} plain={authorPlain} label="作者" />
    );
  }

  return (
    <>
      <FieldText isDefault={isAuthorDefault} plain={authorPlain} label="作者" />
      {(renderCacheEnc || isOriginalTampered) && !hideOriginal
        ? <FieldText isDefault={isOriginalDefault} plain={renderCache.plain || ''} label="原作者" tampered={isOriginalTampered} />
        : null}
    </>
  );
};
