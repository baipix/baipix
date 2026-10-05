import { describe, expect, it } from 'vitest';
import { pack, withAlpha } from '../src/engine/color';
import { BLEND_MODES, blendWith, flatten } from '../src/engine/composite';
import { createDocument, createLayer } from '../src/engine/document';
import { Editor } from '../src/engine/editor';
import { deserializeDocument, serializeDocument } from '../src/storage/fileFormat';

const GREY = pack(128, 128, 128);
const RED = pack(255, 0, 0);
const WHITE = pack(255, 255, 255);
const BLACK = pack(0, 0, 0);

describe('blendWith', () => {
  it('mixes channels like CSS mix-blend-mode', () => {
    expect(blendWith('multiply', RED, GREY)).toBe(pack(128, 0, 0));
    expect(blendWith('screen', RED, GREY)).toBe(pack(255, 128, 128));
    expect(blendWith('darken', RED, GREY)).toBe(pack(128, 0, 0));
    expect(blendWith('lighten', RED, GREY)).toBe(pack(255, 128, 128));
    expect(blendWith('difference', WHITE, RED)).toBe(pack(0, 255, 255));
    expect(blendWith('multiply', WHITE, RED)).toBe(RED);
    expect(blendWith('screen', BLACK, RED)).toBe(RED);
  });

  it('keeps the source as it is over transparent pixels', () => {
    for (const mode of BLEND_MODES) expect(blendWith(mode, RED, 0)).toBe(RED);
  });

  it('applies the opacity after the mix', () => {
    // Half of multiply(white, red) = red over red: red.
    expect(blendWith('multiply', WHITE, RED, 0.5)).toBe(RED);
    expect(blendWith('multiply', withAlpha(BLACK, 0), RED)).toBe(RED);
  });
});

describe('Layer blend modes', () => {
  it('flatten uses each layer’s mode', () => {
    const doc = createDocument('t', 1, 1);
    doc.layers[0].pixels[0] = GREY;
    const top = createLayer('top', 1, 1);
    top.pixels[0] = RED;
    top.blendMode = 'multiply';
    doc.layers.push(top);
    expect(flatten(doc, { includeBackground: false })[0]).toBe(pack(128, 0, 0));
  });

  it('is saved in .baipix files, and missing means normal', () => {
    const doc = createDocument('t', 2, 2);
    doc.layers[0].blendMode = 'screen';
    doc.layers.push(createLayer('normal', 2, 2));
    const json = serializeDocument(doc);
    expect(json.layers[1].blendMode).toBeUndefined();
    const back = deserializeDocument(JSON.parse(JSON.stringify(json)));
    expect(back.layers[0].blendMode).toBe('screen');
    expect(back.layers[1].blendMode).toBeUndefined();
    expect(
      deserializeDocument({ ...json, layers: [{ ...json.layers[0], blendMode: 'bogus' }] }).layers[0]
        .blendMode,
    ).toBeUndefined();
  });

  it('changes as one undo step', () => {
    const e = new Editor();
    e.setLayerBlendMode('overlay');
    const mode = () => e.getState().doc.layers[e.getState().doc.activeLayer].blendMode;
    expect(mode()).toBe('overlay');
    e.undo();
    expect(mode()).toBeUndefined();
  });

  it('previews a mode without keeping it, and keeps it in one undo step', () => {
    const e = new Editor();
    const mode = () => e.getState().doc.layers[e.getState().doc.activeLayer].blendMode;
    e.previewLayerBlendMode('screen');
    expect(mode()).toBe('screen');
    e.previewLayerBlendMode(null);
    expect(mode()).toBeUndefined();
    e.previewLayerBlendMode('multiply');
    e.endBlendPreview();
    expect(mode()).toBeUndefined();
    expect(e.getState().canUndo).toBe(false);
    e.previewLayerBlendMode('overlay');
    e.setLayerBlendMode('overlay');
    expect(mode()).toBe('overlay');
    e.undo();
    expect(mode()).toBeUndefined();
  });
});
