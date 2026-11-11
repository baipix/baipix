import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTouchGestures, type TouchPoint } from '../src/ui/touchGestures';

const point = (id: number, x = id, y = id): TouchPoint => ({ id, x, y });

describe('touch gestures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('recognizes a stationary one-finger long press', () => {
    // Keep the first touch stationary and advance time to just before the long-press threshold.
    vi.useFakeTimers();
    const picked: TouchPoint[] = [];
    const gestures = createTouchGestures({ onLongPress: (p) => picked.push(p) });

    gestures.down(point(1, 10, 20));
    vi.advanceTimersByTime(499);
    // The picker must not run before the full long-press duration has elapsed.
    expect(picked).toEqual([]);
    vi.advanceTimersByTime(1);

    // Once the threshold is reached, the recognizer reports the original touch position.
    expect(picked).toEqual([point(1, 10, 20)]);
    // Releasing after a long press must not produce a second gesture action.
    expect(gestures.up(1)).toEqual({ type: 'none' });
  });

  it('cancels long press when the finger moves beyond the threshold', () => {
    // Start a possible long press, then move far enough to turn it into drawing.
    vi.useFakeTimers();
    const picked: TouchPoint[] = [];
    const gestures = createTouchGestures({ onLongPress: (p) => picked.push(p) });

    gestures.down(point(1));
    expect(gestures.move(point(1, 10, 0))).toEqual({
      type: 'draw-start',
      from: point(1),
      to: point(1, 10, 0),
    });
    vi.advanceTimersByTime(500);

    // Movement cancels the picker timer, so long press must never be reported.
    expect(picked).toEqual([]);
    // The active drawing gesture finishes when the pointer is released.
    expect(gestures.up(1)).toEqual({ type: 'draw-end', point: point(1, 10, 0) });
  });

  it('recognizes two-finger tap as undo', () => {
    // Put two fingers down without moving them, then release them as a tap.
    vi.useFakeTimers();
    const gestures = createTouchGestures({ onLongPress: vi.fn() });

    gestures.down(point(1));
    gestures.down(point(2));

    // The first release only removes one active finger; the second completes the two-finger tap.
    expect(gestures.up(1)).toEqual({ type: 'none' });
    expect(gestures.up(2)).toEqual({ type: 'tap', fingers: 2 });
  });

  it('keeps a one-finger tap available for the normal drawing path', () => {
    // A simple touch without movement remains available for CanvasView's normal tap handling.
    const gestures = createTouchGestures({ onLongPress: vi.fn() });
    gestures.down(point(1, 12, 18));
    // The recognizer reports the tap instead of treating it as a long press or a drag.
    expect(gestures.up(1)).toEqual({ type: 'tap', fingers: 1 });
  });

  it('recognizes three-finger tap as redo', () => {
    // Start a three-finger gesture and release the fingers without movement.
    vi.useFakeTimers();
    const gestures = createTouchGestures({ onLongPress: vi.fn() });

    gestures.down(point(1));
    gestures.down(point(2));
    gestures.down(point(3));
    gestures.up(1);
    gestures.up(2);

    // The final release completes the three-finger tap used for redo.
    expect(gestures.up(3)).toEqual({ type: 'tap', fingers: 3 });
  });

  it('rejects a multitouch tap when a third or fourth finger is involved', () => {
    // Four active fingers make the gesture invalid, even if none of them moves.
    const gestures = createTouchGestures({ onLongPress: vi.fn() });

    gestures.down(point(1));
    gestures.down(point(2));
    gestures.down(point(3));
    gestures.down(point(4));
    gestures.up(1);
    gestures.up(2);
    gestures.up(3);

    // No undo or redo action is returned for four-finger input.
    expect(gestures.up(4)).toEqual({ type: 'none' });
  });

  it('turns a moving two-finger gesture into a pinch candidate', () => {
    // Two fingers begin together, then one moves beyond the tap threshold.
    const gestures = createTouchGestures({ onLongPress: vi.fn() });

    gestures.down(point(1, 10, 10));
    gestures.down(point(2, 30, 10));

    // Movement changes the gesture from a two-finger tap to pinch handling.
    expect(gestures.move(point(1, 20, 10))).toEqual({ type: 'pinch-start' });
    // Once pinch starts, releasing either finger must not trigger undo or redo.
    expect(gestures.up(1)).toEqual({ type: 'none' });
    expect(gestures.up(2)).toEqual({ type: 'none' });
  });

  it('rejects a tap after movement, cancellation, or a late second finger', () => {
    // A second finger arriving after the multitouch time window must not create undo.
    vi.useFakeTimers();
    const gestures = createTouchGestures({ onLongPress: vi.fn(), tapMs: -1 });

    gestures.down(point(1));
    gestures.down(point(2));
    gestures.up(1);
    expect(gestures.up(2)).toEqual({ type: 'none' });

    // Cancellation clears the previous gesture state and allows a new single-finger tap.
    gestures.down(point(3));
    gestures.cancel(3);
    gestures.down(point(4));
    expect(gestures.up(4)).toEqual({ type: 'tap', fingers: 1 });
  });

  it('cleans up a pending timer on cancellation', () => {
    // Cancel the only active pointer before the long-press timer expires.
    vi.useFakeTimers();
    const picked = vi.fn();
    const gestures = createTouchGestures({ onLongPress: picked });

    gestures.down(point(1));
    gestures.cancel(1);
    vi.advanceTimersByTime(500);

    // A cancelled pointer must not invoke the delayed long-press callback.
    expect(picked).not.toHaveBeenCalled();
  });
});
