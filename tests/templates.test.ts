import { describe, expect, it } from 'vitest';
import { Editor } from '../src/engine/editor';
import { presetColors } from '../src/engine/palette';
import { createFromTemplate, TEMPLATES } from '../src/ui/templates';

const template = (id: string) => TEMPLATES.find((t) => t.id === id)!;

describe('Templates', () => {
  it('all use palettes that exist', () => {
    for (const t of TEMPLATES) expect(presetColors(t.palette).length).toBeGreaterThan(0);
  });

  it('set the size, the palette and the views', () => {
    const e = new Editor();
    createFromTemplate(e, template('sprite'));
    let s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([32, 32]);
    expect(s.palette.key).toBe('pico8');
    expect(s.view.mirrorX).toBe(true);
    // The next template turns the symmetry back off.
    createFromTemplate(e, template('banner'));
    s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([128, 32]);
    expect(s.view.mirrorX).toBe(false);
  });
});
