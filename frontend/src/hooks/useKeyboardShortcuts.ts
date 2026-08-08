import { useEffect } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';

/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts for common whiteboard actions:
 *   Ctrl + Z  → Undo
 *   Ctrl + Y  → Redo
 *   Ctrl + Shift + Z → Redo (alternative)
 *   Ctrl + S  → Save session (dispatches custom DOM event)
 *   Delete / Backspace → Delete selected object
 *   Escape    → Deselect (reset selectedObjectId)
 *   G         → Toggle grid
 *   1–7       → Switch between tools
 */
export function useKeyboardShortcuts() {
  const { undo, redo, deleteObject, selectedObjectId, toggleGrid, setTool, brushSize, setBrushSize, setZoom, setPan, color, setColor } = useWhiteboardStore();

  useEffect(() => {
    const TOOL_KEYS: Record<string, Parameters<typeof setTool>[0]> = {
      '1': 'select',
      '2': 'brush',
      '3': 'highlighter',
      '4': 'shape',
      '5': 'text',
      '6': 'laser',
      '7': 'eraser',
    };

    const PALETTE = ['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // ── Undo / Redo ───────────────────────────────────────────────────────
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if (
        (ctrl && e.key.toLowerCase() === 'y') ||
        (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // ── Save (Ctrl + S) ───────────────────────────────────────────────────
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('trigger-session-save'));
        return;
      }

      // ── Recenter Zoom (Ctrl + 0) ──────────────────────────────────────────
      if (ctrl && e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        return;
      }

      // ── Delete selected object ────────────────────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        e.preventDefault();
        deleteObject(selectedObjectId);
        return;
      }

      // ── Escape → deselect ─────────────────────────────────────────────────
      if (e.key === 'Escape') {
        useWhiteboardStore.setState({ selectedObjectId: null });
        return;
      }

      // ── Toggle grid (G key) ───────────────────────────────────────────────
      if (!ctrl && (e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        toggleGrid();
        return;
      }

      // ── Brush Size Adjustments ([ and ]) ─────────────────────────────────
      if (!ctrl && e.key === '[') {
        e.preventDefault();
        setBrushSize(Math.max(1, brushSize - 2));
        return;
      }
      if (!ctrl && e.key === ']') {
        e.preventDefault();
        setBrushSize(Math.min(50, brushSize + 2));
        return;
      }

      // ── Color Cycle (C key) ───────────────────────────────────────────────
      if (!ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const nextIdx = (PALETTE.indexOf(color) + 1) % PALETTE.length;
        setColor(PALETTE[nextIdx]);
        return;
      }

      // ── Tool switching (1–7) ──────────────────────────────────────────────
      if (!ctrl && TOOL_KEYS[e.key]) {
        e.preventDefault();
        setTool(TOOL_KEYS[e.key]);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteObject, selectedObjectId, toggleGrid, setTool, brushSize, setBrushSize, setZoom, setPan, color, setColor]);
}
