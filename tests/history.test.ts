import { describe, expect, it } from 'vitest';
import { createDocument } from '../src/engine/document';
import { History, takeSnapshot } from '../src/engine/history';

/** A 10 × 10 drawing of one layer on `frames` frames, each frame's pixels its own. */
function animation(frames: number) {
  const doc = createDocument('Walk', 10, 10);
  doc.frames = Array.from({ length: frames }, (_, i) => ({ id: `f${i}`, duration: 100 }));
  doc.activeFrame = 0;
  doc.layers[0].cels = doc.frames.map((_, f) => (f ? { pixels: new Uint32Array(100) } : null));
  return doc;
}

const depth = (h: History) => {
  let n = 0;
  while (h.undo(takeSnapshot(animation(1), null))) n++;
  return n;
};

describe('undo history', () => {
  // A frame is 400 bytes: 20 frames, 8 KB a step.
  it('counts every frame in its memory budget', () => {
    const h = new History(100_000);
    for (let i = 0; i < 40; i++) h.push(takeSnapshot(animation(20), null));
    expect(depth(h)).toBe(12);
  });

  it('counts a frame shared by several steps once', () => {
    const h = new History(100_000);
    const doc = animation(20);
    for (let i = 0; i < 40; i++) h.push(takeSnapshot(doc, null));
    expect(depth(h)).toBe(40);
  });
});
