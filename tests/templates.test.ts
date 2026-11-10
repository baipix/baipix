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

  it('the new sizes, and the small tile turns the tile preview on', () => {
    const e = new Editor();
    createFromTemplate(e, template('smallTile'));
    let s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([16, 16]);
    expect(s.view.tile).toBe(true);
    createFromTemplate(e, template('emote'));
    s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([112, 112]);
    expect(s.view.tile).toBe(false);
    createFromTemplate(e, template('favicon'));
    s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([32, 32]);
    expect(s.palette.key).toBe('sweetie16');
    createFromTemplate(e, template('card'));
    s = e.getState();
    expect([s.doc.width, s.doc.height]).toEqual([64, 96]);
    expect(s.palette.key).toBe('dawnbringer16');
  });
});
