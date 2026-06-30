import { useEffect, useRef, useState, useCallback } from 'react';

export const STORAGE_TARGET_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * localStorage の使用量を実測 (= 全キー length 合計をバイト換算)。
 * estimate() のフォールバック・クロスチェック用。
 * navigator.storage 由来 (IndexedDB 等) は含まない点に注意。
 */
function measureLocalStorageBytes(): number {
  if (typeof localStorage === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === null) continue;
    const v = localStorage.getItem(k) || '';
    total += (k.length + v.length) * 2;
  }
  return total;
}

/**
 * ブラウザの localStorage / IndexedDB を含む全ストレージの容量を管理する。
 *  - estimate(): クォータと現在の使用量を取得
 *  - persist(): 永続化を要求 (= ブラウザが自動削除しなくなる)
 *  - persisted: 永続化が承認済みかどうか
 *
 * 容量「上限」は estimate() の quota を信頼しつつ、50MB の目標値を別途提示する。
 * (quota はブラウザ/環境で大きく異なる: Chrome ~数十% of free disk, Firefox ~10GB,
 *  Safari ~1GB, mobile はさらに少ない)
 *
 * 重要: estimate() は localStorage を含めて usage を返すはずだが、 Chrome など
 * 特定の状況 (= SameSite=None Cookie / 3rd-party Storage Access / 拡張機能干渉 /
 *   iframe sandbox 等) で usage が 0 を返すことが知られている (= 実データ量と
 *   表示が乖離するバグの主因)。このフックでは estimate().usage が 0 のとき
 *   localStorage を直接実測した値でフォールバックする。
 */
export function useStorageQuota(pollMs: number = 2000) {
  const [usage, setUsage] = useState<number>(0);
  const [quota, setQuota] = useState<number>(0);
  const [persisted, setPersisted] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      setSupported(false);
      return;
    }
    setSupported(true);
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') setQuota(est.quota);
      if (typeof navigator.storage.persisted === 'function') {
        const p = await navigator.storage.persisted();
        setPersisted(p);
      }
      // estimate().usage が number で 0 より大きいならそれを信頼。
      // 0 (= 報告なし) や undefined (= フィールド欠落) のときは localStorage を
      // 実測してフォールバック (= 0B 表示バグの修正)。
      let nextUsage: number;
      if (typeof est.usage === 'number' && est.usage > 0) {
        nextUsage = est.usage;
      } else {
        nextUsage = measureLocalStorageBytes();
      }
      setUsage(nextUsage);
    } catch {
      // estimate() 自体が失敗した場合も localStorage 実測でフォールバック
      setUsage(measureLocalStorageBytes());
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const id = window.setInterval(refresh, pollMs);
      return () => window.clearInterval(id);
    }
  }, [refresh, pollMs]);

  const requestPersist = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
      return false;
    }
    try {
      const ok = await navigator.storage.persist();
      setPersisted(ok);
      await refresh();
      return ok;
    } catch {
      return false;
    }
  }, [refresh]);

  return {
    usage,
    quota,
    /** 目標上限 (50MB)。バッジの警告色判定に使う */
    targetLimit: STORAGE_TARGET_LIMIT_BYTES,
    /** estimate() を手動で再実行する (削除後など) */
    refresh,
    /** 永続化を要求する */
    requestPersist,
    /** navigator.storage が使えるか */
    supported,
    /** 永続化が承認されているか */
    persisted
  };
}
