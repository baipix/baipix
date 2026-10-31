import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '../src/engine/editor';
import { pause, play, playbackStore, stepFrame } from '../src/ui/playback';

function animated(frames: number) {
  const e = new Editor();
  e.newFile(8, 8, 'Walk');
  for (let i = 1; i < frames; i++) e.addFrame();
  e.setFrame(0);
  return e;
}

const shown = (e: Editor) => e.getState().doc.activeFrame;

describe('playing the frames', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    pause();
    vi.useRealTimers();
  });

  it('shows each frame for its own duration, and loops', () => {
    const e = animated(3);
    e.setFrameDuration(300, [1]);
    play(e);
    vi.advanceTimersByTime(100);
    expect(shown(e)).toBe(1);
    vi.advanceTimersByTime(200);
    expect(shown(e)).toBe(1);
    vi.advanceTimersByTime(100);
    expect(shown(e)).toBe(2);
    vi.advanceTimersByTime(100);
    expect(shown(e)).toBe(0);
  });

  it("doesn't save each frame it shows", () => {
    const e = animated(2);
    const saves = vi.fn();
    e.onPersist(saves);
    play(e);
    vi.advanceTimersByTime(500);
    expect(saves).not.toHaveBeenCalled();
  });

  it('stops on pause, and on a board of a single frame', () => {
    const e = animated(2);
    play(e);
    pause();
    vi.advanceTimersByTime(500);
    expect(shown(e)).toBe(0);
    expect(playbackStore.get().playing).toBe(false);
    play(e);
    e.deleteFrame(1);
    vi.advanceTimersByTime(100);
    expect(playbackStore.get().playing).toBe(false);
  });

  it('steps through the frames, looping at both ends', () => {
    const e = animated(3);
    stepFrame(e, -1);
    expect(shown(e)).toBe(2);
    stepFrame(e, 1);
    expect(shown(e)).toBe(0);
  });
});
