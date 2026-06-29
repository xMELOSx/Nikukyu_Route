import { useState, useEffect, useMemo } from 'react';
import { aesGcmDecrypt, AUTHOR_TAMPERED, AUTHOR_DEFAULT_PLAIN } from '../utils/DataManager';

export interface UseAuthorFieldOptions {
  /** 編集可能かどうか。 破損時に動作を変える。
   *   - editable=true: 破損しても plain を AUTHOR_DEFAULT_PLAIN にフォールバックして編集可に。
   *                     (作者名 = 編集者名のため、 破損 = 改ざんなので No name にして編集させる)
   *   - editable=false: 破損時は plain = AUTHOR_TAMPERED のまま編集不可 (表示のみ)。
   *                      (原作者名 = 保護対象のため、 破損 = 改ざんなので そのまま Anomaly 表示) */
  editable: boolean;
}

export interface UseAuthorFieldResult {
  /** 復号された平文。復号失敗時は AUTHOR_TAMPERED。復号前は undefined (まだ解決していない)。
   *  editable=true かつ tampered のときは AUTHOR_DEFAULT_PLAIN (編集可の「No name」状態)。 */
  plain: string | undefined;
  /** 復号中かどうか */
  loading: boolean;
  /** 改ざん / 鍵違いで復号できなかったかどうか (表示用) */
  tampered: boolean;
  /** 復号結果が AUTHOR_DEFAULT_PLAIN ('No name') と一致したか (未設定状態) */
  isDefault: boolean;
  /** 編集可能かどうか (props から透過) */
  editable: boolean;
}

/**
 * AES-GCM で暗号化された作者名フィールドを「表示」するための hook。
 *  - 暗号文 (encoded) と派生鍵 (passphrase) を受け取り、平文を非同期復号
 *  - encoded が変わるたびに自動再復号
 *  - 復号失敗時:
 *     - editable=true:  plain = AUTHOR_DEFAULT_PLAIN (No name) にフォールバックし、編集可
 *     - editable=false: plain = AUTHOR_TAMPERED のまま、編集不可
 *  - 編集は呼び出し側で aesGcmEncrypt を直接 await して route state に書き戻す
 */
export function useAuthorField(encoded: string, passphrase: string, options: UseAuthorFieldOptions): UseAuthorFieldResult {
  const { editable } = options;
  const [state, setState] = useState<{ plain: string | undefined; loading: boolean; tampered: boolean; isDefault: boolean }>(() => ({
    plain: encoded ? undefined : '',
    loading: encoded !== '',
    tampered: false,
    isDefault: false
  }));

  useEffect(() => {
    let cancelled = false;
    const apply = (next: { plain: string; loading: boolean; tampered: boolean; isDefault: boolean }) => {
      if (cancelled) return;
      setState(next);
    };
    if (!encoded) {
      // 暗号文が空 -> 「未設定」状態 (No name) とみなす。 editable に依らず同じ扱い。
      Promise.resolve().then(() => apply({ plain: AUTHOR_DEFAULT_PLAIN, loading: false, tampered: false, isDefault: true }));
      return;
    }
    aesGcmDecrypt(encoded, passphrase).then((v) => {
      if (v === AUTHOR_TAMPERED) {
        if (editable) {
          // 編集可フィールドは破損時に No name にフォールバック (編集可能状態にする)
          apply({ plain: AUTHOR_DEFAULT_PLAIN, loading: false, tampered: false, isDefault: true });
        } else {
          // 編集不可フィールドは破損を Anomaly として維持
          apply({ plain: AUTHOR_TAMPERED, loading: false, tampered: true, isDefault: false });
        }
      } else {
        apply({ plain: v, loading: false, tampered: false, isDefault: v === AUTHOR_DEFAULT_PLAIN });
      }
    });
    return () => { cancelled = true; };
  }, [encoded, passphrase, editable]);

  return useMemo(() => ({ ...state, editable }), [state, editable]);
}
