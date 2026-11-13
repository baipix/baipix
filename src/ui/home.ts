import type { Editor, FileInfo } from '../engine/editor';
import { uiStore } from './uiStore';

/**
 * On first launch, or once the last file is deleted, the editor holds a blank "Untitled" file. The
 * home screen hides it, and it goes away as soon as another file is created or imported, unless it
 * was drawn in or renamed.
 */
let starter: { id: string; updatedAt: number } | null = null;

/** Shows the empty home screen, the active file being the blank one. */
export function showEmptyHome(editor: Editor): void {
  const s = editor.getState();
  const file = s.files.find((f) => f.id === s.activeId);
  starter = file ? { id: file.id, updatedAt: file.updatedAt } : null;
  uiStore.set({ home: true, sheet: null });
}

export const isUntouchedStarter = (f: FileInfo): boolean =>
  !!starter && f.id === starter.id && f.updatedAt === starter.updatedAt;

/** True while the blank starter file is still there, untouched: it will make way for the next file. */
export function hasUntouchedStarter(editor: Editor): boolean {
  return editor.getState().files.some(isUntouchedStarter);
}

/** Drops the blank starter file once there is another one: it was only there to hold the editor. */
export function dropStarter(editor: Editor): void {
  if (!starter) return;
  const { files } = editor.getState();
  const file = files.find((f) => f.id === starter!.id);
  if (file && files.length > 1 && isUntouchedStarter(file)) editor.discardFile(file.id);
  starter = null;
}

/** Back to the editor, dropping the blank starter file once there is another one. */
export function leaveHome(editor: Editor): void {
  uiStore.set({ home: false });
  dropStarter(editor);
}
