import type { Selection } from './selection';
import { cloneDocument, type DocPalette, type PixelDoc } from './document';

export interface Snapshot {
  doc: PixelDoc;
  selection: Selection | null;
  /**
   * The palette, only for steps that change it: an edit of the palette alone, or along with the
   * pixels (an adjustment applied to the palette too). Undoing it restores both, so they stay in
   * step; other steps leave the palette as it is.
   */
  palette?: DocPalette;
  /**
   * A canvas resize: it moved the guides and the reference image along with the drawing, so
   * undoing it puts them back too (otherwise they stay as they are, outside the history).
   */
  resized?: boolean;
}

export const takeSnapshot = (doc: PixelDoc, selection: Selection | null): Snapshot => ({
  doc: cloneDocument(doc),
  selection: selection ? { ...selection } : null,
});

const snapshotBytes = (s: Snapshot): number => s.doc.width * s.doc.height * 4 * s.doc.layers.length;

/**
 * Snapshot-based undo/redo. Pixel art documents are small, so full snapshots are simpler
 * and more robust than diffing. The stack is trimmed to a memory budget.
 */
export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(private readonly budgetBytes = 160_000_000) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Records the state *before* a change. */
  push(snapshot: Snapshot): void {
    this.undoStack.push(snapshot);
    this.redoStack = [];
    let total = this.undoStack.reduce((sum, s) => sum + snapshotBytes(s), 0);
    while (this.undoStack.length > 12 && total > this.budgetBytes) {
      total -= snapshotBytes(this.undoStack.shift()!);
    }
  }

  /** The last recorded state, to attach more to it. */
  top(): Snapshot | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  /** Drops the last recorded state (e.g. a stroke that changed nothing). */
  discardLast(): void {
    this.undoStack.pop();
  }

  undo(current: Snapshot): Snapshot | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(current);
    return previous;
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    return next;
  }
}
