import React from 'react';

interface ErrorBoundaryProps {
  isLocal: boolean;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // 本番ビルドではコンソールにのみ出力。デバッグの役に立てるように詳細を残す。
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    try {
      const errInfo = {
        message: error?.message || 'React render error',
        stack: (error?.stack || '') + '\n\nComponent Stack:\n' + (errorInfo?.componentStack || ''),
        url: typeof window !== 'undefined' ? window.location.href : '',
        time: new Date().toISOString()
      };
      localStorage.setItem('heist_last_crash_error', JSON.stringify(errInfo));
      const copyText = `=== Last Crash Error ===\nURL: ${errInfo.url}\nTime: ${errInfo.time}\nMessage: ${errInfo.message}\nStack: ${errInfo.stack}\n`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).catch(() => {});
      }
    } catch (e) {}
  }

  handleCopy = async () => {
    const { error, errorInfo } = this.state;
    const text =
      `=== Error ===\n${error?.stack || error?.message || 'unknown error'}\n\n` +
      `=== Component stack ===\n${errorInfo?.componentStack || '(none)'}\n\n` +
      `=== URL ===\n${typeof window !== 'undefined' ? window.location.href : '(no window)'}\n` +
      `=== User Agent ===\n${typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)'}\n` +
      `=== Timestamp ===\n${new Date().toISOString()}\n`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // フォールバック (非HTTPS環境用)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (e) {
      console.error('[ErrorBoundary] copy failed:', e);
    }
  };

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // 本番 (= !isLocal) ではエラー内容を画面に出さず、簡素なフォールバックのみ。
    // ローカルモード (= isLocal) ではコピー＆リロード UI を出す。
    if (!this.props.isLocal) {
      return (
        <div style={{
          width: '100vw', height: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0f1c', color: '#ff6b6b', fontFamily: 'system-ui, sans-serif',
          flexDirection: 'column', gap: '12px', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>😿 Something went wrong</div>
          <div style={{ fontSize: '13px', color: '#bbb' }}>Please reload the page.</div>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600,
              background: '#00f0ff', color: '#000', border: 'none', borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    // ローカルモード: 詳細エラー情報 + コピーボタン
    const { error, errorInfo, copied } = this.state;
    const fullText =
      `${error?.stack || error?.message || 'unknown error'}\n\n` +
      `Component stack:\n${errorInfo?.componentStack || '(none)'}\n\n` +
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}\n` +
      `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}\n` +
      `Time: ${new Date().toISOString()}\n`;

    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: '#0a0f1c', color: '#e0e0e0', fontFamily: 'monospace',
        padding: '20px', boxSizing: 'border-box', overflow: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
          padding: '12px 16px',
          background: 'rgba(255, 68, 68, 0.12)', border: '1px solid rgba(255, 68, 68, 0.4)',
          borderRadius: '6px',
        }}>
          <span style={{ fontSize: '24px' }}>🛠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#ff8888' }}>
              Local mode — uncaught error
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
              {error?.message || 'unknown error'}
            </div>
          </div>
          <button
            onClick={this.handleCopy}
            style={{
              padding: '8px 14px', fontSize: '12px', fontWeight: 600,
              background: copied ? '#39ff14' : '#00f0ff',
              color: '#000', border: 'none', borderRadius: '4px',
              cursor: 'pointer', minWidth: '110px',
            }}
          >
            {copied ? '✓ Copied' : '📋 Copy error'}
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 14px', fontSize: '12px', fontWeight: 600,
              background: '#ff9500', color: '#000', border: 'none', borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ↻ Reload
          </button>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 14px', fontSize: '12px', fontWeight: 600,
              background: 'transparent', color: '#00f0ff', border: '1px solid #00f0ff',
              borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
        <pre style={{
          flex: 1, minHeight: 0,
          margin: 0, padding: '16px',
          background: '#05070a', border: '1px solid rgba(0, 240, 255, 0.2)',
          borderRadius: '6px', overflow: 'auto',
          fontSize: '11px', lineHeight: 1.5, color: '#d0d0d0',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {fullText}
        </pre>
      </div>
    );
  }
}
