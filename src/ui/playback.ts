import type { Editor } from '../engine/editor';
import { activeFrame, frameCount } from '../engine/frames';
import { createStore } from './store';

/**
 * Playing the active board's frames on the canvas, each for its own duration, in a loop. It shows
 * them as Previous / Next would, without saving each one: playing never changes the drawing.
 */
export const playbackStore = createStore({ playing: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function pause(): void {
  clearTimeout(timer);
  if (playbackStore.get().playing) playbackStore.set({ playing: false });
}

export function play(editor: Editor): void {
  const { doc } = editor.getState();
  if (frameCount(doc) < 2 || playbackStore.get().playing) return;
  playbackStore.set({ playing: true });
  const board = doc.id;
  const next = () => {
    const { doc } = editor.getState();
    // Another board shown, or its frames deleted down to one: nothing left to play.
    if (doc.id !== board || frameCount(doc) < 2) return pause();
    const f = (activeFrame(doc) + 1) % frameCount(doc);
    editor.setFrame(f, false);
    timer = setTimeout(next, doc.frames![f].duration);
  };
  timer = setTimeout(next, doc.frames![activeFrame(doc)].duration);
}

export const togglePlay = (editor: Editor): void => (playbackStore.get().playing ? pause() : play(editor));

/** Shows the previous or next frame, looping at both ends. */
export function stepFrame(editor: Editor, by: 1 | -1): void {
  pause();
  const { doc } = editor.getState();
  const n = frameCount(doc);
  if (n > 1) editor.setFrame((activeFrame(doc) + by + n) % n);
}
