import { useEffect } from 'react';
import type { Editor } from '../../engine/editor';
import { t } from '../../i18n';
import type { Actions } from '../actions';
import { isMenuOpen } from '../components/Menu';
import { renameFile, togglePreview } from '../menus';
import { keyState } from '../keyState';
import { TOOL_LIST } from '../tools';
import { openAdjust, openDialog, toast, uiStore } from '../uiStore';
import { viewport } from '../viewport';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]');

/** Global keyboard shortcuts. Uses `event.code` for digits so AZERTY layouts work too. */
export function useKeyboardShortcuts(editor: Editor, actions: Actions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isMenuOpen() || document.querySelector('dialog[open]') || isTyping(e.target)) return;
      if (uiStore.get().home) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Space') {
        keyState.space = true;
        document.body.classList.add('is-panning');
        e.preventDefault();
        return;
      }

      // `@` toggles the interface. Checked before modifiers: AltGr (AZERTY on Windows) reports Ctrl+Alt.
      if (e.key === '@') {
        e.preventDefault();
        return uiStore.set((s) => ({ uiHidden: !s.uiHidden }));
      }

      if (mod) {
        const handled = (() => {
          if (key === 'z' && !e.shiftKey) return (editor.undo(), true);
          if ((key === 'z' && e.shiftKey) || key === 'y') return (editor.redo(), true);
          if (key === 'c' && e.shiftKey) return (void actions.copySvg(), true);
          if (key === 'c')
            return (
              editor.copy() &&
                toast(t(editor.getState().selection ? 'toast.selectionCopied' : 'toast.layerCopied')),
              true
            );
          if (key === 'x') return (editor.cut() && toast(t('toast.cut')), true);
          if (key === 'a') return (editor.selectAll(), true);
          if (key === 'd') return (editor.deselect(), true);
          if (key === 'e' || key === 's')
            return (
              void actions.exportImage(uiStore.get().exportFormat, uiStore.get().exportActiveLayer),
              true
            );
          if (key === 'o') return (void actions.openDocument(), true);
          if (key === 'u') return (openAdjust('all'), true);
          if (key === 'k') return (uiStore.set({ commandPalette: true }), true);
          // The browser's own zoom keys zoom the canvas instead.
          if (e.key === '=' || e.key === '+') return (viewport.step(1), true);
          if (e.key === '-') return (viewport.step(-1), true);
          if (e.code === 'Digit0' || e.code === 'Numpad0') return (viewport.fit(editor.getState().doc), true);
          return false;
        })();
        if (handled) e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        if (uiStore.get().picker) uiStore.set({ picker: null });
        else if (editor.getState().referenceSelected) editor.deselectReference();
        else if (editor.isStroking) editor.cancelStroke();
        else editor.deselect();
        return;
      }
      if (e.key === '?') return openDialog({ type: 'shortcuts' });
      if (e.key === 'F2') return (e.preventDefault(), renameFile());
      // Tab hides the interface, like in Photoshop, unless it's moving the focus along the buttons.
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
        const focus = document.activeElement;
        if (focus && focus !== document.body && !focus.closest('.workspace')) return;
        e.preventDefault();
        return uiStore.set((s) => ({ uiHidden: !s.uiHidden }));
      }
      if (e.shiftKey && e.code === 'Digit1') return viewport.fit(editor.getState().doc);
      if (e.shiftKey && e.code === 'Digit0') return viewport.zoomTo(1);
      if (e.shiftKey && !e.altKey) {
        const toggles = { g: 'grid', t: 'tile', x: 'mirrorX', y: 'mirrorY' } as const;
        const view = toggles[key as keyof typeof toggles];
        if (view) return editor.toggleView(view);
        const { doc } = editor.getState();
        const command = {
          p: togglePreview,
          n: () => editor.addLayer(),
          d: () => editor.duplicateLayer(),
          m: () => doc.activeLayer > 0 && editor.mergeDown(),
          h: () => editor.flip(true),
          v: () => editor.flip(false),
          r: () => editor.rotate(),
          o: () => openAdjust('layer', 'outline'),
        }[key];
        if (command) return (e.preventDefault(), command());
      }
      // Alt+letter (by key position: on a Mac, Alt changes the character): align, like in Figma.
      if (e.altKey && !mod) {
        if (e.shiftKey && e.code === 'KeyR') return (e.preventDefault(), editor.rotate(false));
        const to = (
          {
            KeyA: 'left',
            KeyH: 'centerX',
            KeyD: 'right',
            KeyW: 'top',
            KeyV: 'centerY',
            KeyS: 'bottom',
          } as const
        )[e.code as 'KeyA'];
        if (to && !e.shiftKey) return (e.preventDefault(), editor.align(to));
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const { doc } = editor.getState();
        if (e.key === 'ArrowUp' && doc.activeLayer < doc.layers.length - 1) editor.moveLayer(1);
        if (e.key === 'ArrowDown' && doc.activeLayer > 0) editor.moveLayer(-1);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (editor.getState().referenceSelected) return actions.removeReference();
        return e.shiftKey ? editor.fill() : editor.clearSelection();
      }
      if (e.key.startsWith('Arrow') && (editor.getState().tool === 'move' || editor.getState().selection)) {
        e.preventDefault();
        const d = e.shiftKey ? 8 : 1;
        const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[
          e.key
        ] ?? [0, 0];
        return editor.nudge(dx, dy);
      }
      if (e.key === '+' || e.key === '=') return viewport.step(1);
      if (e.key === '-' || e.key === '_') return viewport.step(-1);
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit && !e.shiftKey) return editor.setOption('size', Number(digit[2]));
      if (key === 'x' && !e.shiftKey) return editor.swapColors();
      // Tools without a shortcut have an empty one: never match it (some keys have no name).
      const tool = key ? TOOL_LIST.find((x) => x.shortcut && x.shortcut.toLowerCase() === key) : undefined;
      if (tool && !e.shiftKey && !e.altKey) editor.setTool(tool.id);
    };
    const release = () => {
      keyState.space = false;
      document.body.classList.remove('is-panning');
    };
    const onKeyUp = (e: KeyboardEvent) => e.code === 'Space' && release();
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || uiStore.get().home) return;
      const files = [...(e.clipboardData?.files ?? [])];
      void actions.pasteFromClipboard(files).then((pasted) => pasted && e.preventDefault());
      if (files.length || editor.hasClipboard()) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('paste', onPaste);
    };
  }, [editor, actions]);
}
