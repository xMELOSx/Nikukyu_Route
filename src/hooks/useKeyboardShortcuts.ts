import { useEffect } from 'react';

export interface KeyboardShortcutsOptions {
  /** Returns true to short-circuit the default browser handling. */
  preventDefault?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected?: () => void;
  onToggleEditMode: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onCloseModal?: () => void;
  hasOpenModal?: boolean;
}

/**
 * Global keyboard shortcuts. Ignores key events fired from form inputs so
 * that typing in text fields doesn't trigger app-level shortcuts.
 *
 *   Ctrl/Cmd + Z → Undo
 *   Ctrl/Cmd + Y → Redo
 *   Delete       → Delete selected strokes (edit-stroke / measure mode)
 *   P / V        → Toggle edit/view mode
 *   [            → Toggle left sidebar
 *   ]            → Toggle right sidebar
 *   Esc          → Close topmost modal (if `onCloseModal` provided)
 */
export function useKeyboardShortcuts({
  preventDefault = true,
  onUndo, onRedo, onDeleteSelected, onToggleEditMode,
  onToggleLeftSidebar, onToggleRightSidebar,
  onCloseModal, hasOpenModal
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasOpenModal && onCloseModal) {
        if (preventDefault) e.preventDefault();
        onCloseModal();
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (preventDefault) e.preventDefault();
        onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        if (preventDefault) e.preventDefault();
        onRedo();
        return;
      }
      if (e.key === 'Delete' && onDeleteSelected) {
        if (preventDefault) e.preventDefault();
        onDeleteSelected();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'v' || e.key === 'V') {
        onToggleEditMode();
        return;
      }
      if (e.key === '[' || e.key === '［') {
        if (preventDefault) e.preventDefault();
        onToggleLeftSidebar();
        return;
      }
      if (e.key === ']' || e.key === '］') {
        if (preventDefault) e.preventDefault();
        onToggleRightSidebar();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    preventDefault, onUndo, onRedo, onDeleteSelected, onToggleEditMode,
    onToggleLeftSidebar, onToggleRightSidebar, onCloseModal, hasOpenModal
  ]);
}
