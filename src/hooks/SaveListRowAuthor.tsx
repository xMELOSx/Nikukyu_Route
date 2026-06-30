import React from 'react';
import { AUTHOR_DEFAULT_PLAIN } from '../utils/DataManager';

interface SaveListRowAuthorProps {
  authorEnc: string;
  originalAuthorEnc: string;
  routeId: string;
  createdAt: number;
}

const FieldText: React.FC<{
  isDefault: boolean;
  plain: string;
  label: string;
}> = ({ isDefault, plain, label }) => {
  if (isDefault || !plain) {
    return <span style={{ color: 'var(--text-muted)' }}>{label}: No name</span>;
  }
  return <span>{label}: {plain}</span>;
};

/**
 * セーブ一覧 1 行の author / originalAuthor 表示。
 * 全て平文として直接表示する。
 */
export const SaveListRowAuthor: React.FC<SaveListRowAuthorProps> = ({
  authorEnc, originalAuthorEnc
}) => {
  const authorPlain = authorEnc || '';
  const isAuthorDefault = !authorPlain || authorPlain === AUTHOR_DEFAULT_PLAIN;

  const originalPlain = originalAuthorEnc || '';
  const isOriginalDefault = !originalPlain || originalPlain === AUTHOR_DEFAULT_PLAIN;

  // 作者名と原作者名が一致している場合は、原作者名の表示を省略する
  const hideOriginal = !isAuthorDefault && !isOriginalDefault && authorPlain === originalPlain;

  return (
    <>
      <FieldText isDefault={isAuthorDefault} plain={authorPlain} label="作者" />
      {originalPlain && !hideOriginal
        ? <FieldText isDefault={isOriginalDefault} plain={originalPlain} label="原作者" />
        : null}
    </>
  );
};
