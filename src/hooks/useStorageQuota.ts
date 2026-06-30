import { useEffect, useRef, useState, useCallback } from 'react';

export const STORAGE_TARGET_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * ブラウザの localStorage / IndexedDB を含む全ストレージの容量を管理する。
 *  - estimate(): クォータと現在の使用量を取得
 *  - persist(): 永続化を要求 (= ブラウザが自動削除しなくなる)
 *  - persisted: 永続化が承認済みかどうか
 *
 * 容量「上限」は estimate() の quota を信頼しつつ、50MB の目標値を別途提示する。
 * (quota はブラウザ/環境で大きく異なる: Chrome ~数十% of free disk, Firefox ~10GB,
 *  Safari ~1GB, mobile はさらに少ない)
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
      if (typeof est.usage === 'number') setUsage(est.usage);
      if (typeof est.quota === 'number') setQuota(est.quota);
      if (typeof navigator.storage.persisted === 'function') {
        const p = await navigator.storage.persisted();
        setPersisted(p);
      }
    } catch {
      // ignore
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
