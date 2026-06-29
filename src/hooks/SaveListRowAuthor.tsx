import React from 'react';
import { useAuthorField } from './useAuthorField';
import { AUTHOR_TAMPERED, getAuthorKey, getOriginalAuthorKey } from '../utils/DataManager';

interface SaveListRowAuthorProps {
  authorEnc: string;
  originalAuthorEnc: string;
  routeId: string;
  createdAt: number;
}

const FieldText: React.FC<{
  isDefault: boolean;
  plain: string | undefined;
  loading: boolean;
  tampered: boolean;
  editable: boolean;
  label: string;
}> = ({ isDefault, plain, loading, tampered, editable, label }) => {
  if (loading) {
    return <span style={{ color: 'var(--text-muted)' }}>{label}: …</span>;
  }
  // 復号失敗 (tampered):
  //   - editable=true (作者名)        -> 編集可フィールドなので No name にフォールバック表示
  //   - editable=false (原作者名)     -> 保護対象なので Anomaly 赤字表示
  if (tampered || (!editable && plain === AUTHOR_TAMPERED)) {
    if (editable) {
      return <span style={{ color: 'var(--text-muted)' }}>{label}: No name</span>;
    }
    return <span style={{ color: 'var(--red-neon, #f44)' }}>{label}: Anomaly</span>;
  }
  if (isDefault || !plain) {
    return <span style={{ color: 'var(--text-muted)' }}>{label}: No name</span>;
  }
  return <span>{label}: {plain}</span>;
};

/**
 * セーブ一覧 1 行の author / originalAuthor 表示。
 * AES-GCM で非同期復号し、 結果を表示する。復号成功時は平文、
 * 未設定 (No name) は灰色で表示、 復号失敗はフィールドの editable によって
 *   - 作者名:  No name にフォールバック表示 (編集可なので)
 *   - 原作者名: Anomaly 赤字表示 (保護対象なので)
 */
export const SaveListRowAuthor: React.FC<SaveListRowAuthorProps> = ({
  authorEnc, originalAuthorEnc, routeId, createdAt
}) => {
  const authorField = useAuthorField(authorEnc, getAuthorKey(routeId, createdAt), { editable: true });
  const originalField = useAuthorField(originalAuthorEnc, getOriginalAuthorKey(routeId, createdAt), { editable: false });

  // 復号結果の平文が両方取得でき、 かつ同一なら原作者は非表示 (旧仕様と整合)
  const authorPlain = (authorField.tampered || authorField.loading || !authorField.plain || authorField.plain === AUTHOR_TAMPERED)
    ? null : authorField.plain;
  const originalPlain = (originalField.tampered || originalField.loading || !originalField.plain || originalField.plain === AUTHOR_TAMPERED)
    ? null : originalField.plain;
  const hideOriginal = authorPlain !== null && originalPlain !== null && authorPlain === originalPlain;

  return (
    <>
      <FieldText isDefault={authorField.isDefault} plain={authorField.plain} loading={authorField.loading} tampered={authorField.tampered} editable={true} label="作者" />
      {originalAuthorEnc && !hideOriginal
        ? <FieldText isDefault={originalField.isDefault} plain={originalField.plain} loading={originalField.loading} tampered={originalField.tampered} editable={false} label="原作者" />
        : null}
    </>
  );
};
