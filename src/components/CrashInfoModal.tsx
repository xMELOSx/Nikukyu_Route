import React from 'react';
import { t } from '../i18n';

interface CrashInfoModalProps {
  info: { time: string; url: string; message: string; stack: string } | null;
  onClose: () => void;
  onCopy: (text: string) => void;
}

export const CrashInfoModal: React.FC<CrashInfoModalProps> = ({ info, onClose, onCopy }) => {
  if (!info) return null;
  const text = `=== Last Crash Error ===\nURL: ${info.url}\nTime: ${info.time}\nMessage: ${info.message}\nStack: ${info.stack}\n`;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#0a0e18', border: '2px solid #ff4444', borderRadius: '12px', width: '550px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '80vh', boxShadow: '0 0 20px rgba(255, 68, 68, 0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 68, 68, 0.3)', paddingBottom: '10px', marginBottom: '12px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#ff6666', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> {t('前回のセッションでのクラッシュエラー情報')}
          </div>
          <button className="btn-cyber danger" style={{ padding: '3px 10px', fontSize: '11px', clipPath: 'none' }} onClick={onClose}>✕ {t('閉じる')}</button>
        </div>
        <div style={{ fontSize: '12px', color: '#bbb', marginBottom: '8px' }}>
          {t('自動リロードされる前にクリップボードにエラー内容がコピーされていますが、ここから手動で再度コピーも可能です。')}
        </div>
        <pre style={{
          flex: 1, minHeight: '150px', margin: 0, padding: '12px',
          background: '#05070a', border: '1px solid rgba(255, 68, 68, 0.2)',
          borderRadius: '6px', overflow: 'auto',
          fontSize: '11px', lineHeight: 1.4, color: '#ffaaaa',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {`Time: ${info.time}\nURL: ${info.url}\nMessage: ${info.message}\n\nStack:\n${info.stack}`}
        </pre>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button className="btn-cyber" style={{ padding: '6px 16px', fontSize: '11px', clipPath: 'none', borderColor: '#ff4444', color: '#ff4444' }} onClick={async () => {
            await navigator.clipboard.writeText(text);
            onCopy(t('エラーログをクリップボードにコピーしました'));
          }}>{t('📋 ログをコピー')}</button>
          <button className="btn-cyber" style={{ padding: '6px 16px', fontSize: '11px', clipPath: 'none' }} onClick={onClose}>{t('閉じる')}</button>
        </div>
      </div>
    </div>
  );
};
