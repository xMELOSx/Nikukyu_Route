// HMRや自動リロード時にエラー情報をクリップボードやlocalStorageに退避するグローバルハンドラ
if (typeof window !== 'undefined') {
  const saveCrashError = (msg: string, stack: string) => {
    try {
      const errInfo = {
        message: msg,
        stack: stack || 'no stack available',
        url: window.location.href,
        time: new Date().toISOString()
      };
      localStorage.setItem('heist_last_crash_error', JSON.stringify(errInfo));

      const copyText = `=== Last Crash Error ===\nURL: ${errInfo.url}\nTime: ${errInfo.time}\nMessage: ${msg}\nStack: ${stack || 'no stack'}\n`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).catch(() => {});
      }
    } catch (e) {
      console.error('[GlobalErrorHandler] failed to save/copy:', e);
    }
  };

  window.addEventListener('error', (e) => {
    saveCrashError(e.message, e.error?.stack || '');
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e.reason?.message || e.reason);
    const stack = String(e.reason?.stack || '');
    saveCrashError(msg, stack);
  });
}
