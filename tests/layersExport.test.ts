import { describe, expect, it } from 'vitest';

import { createDocument, createLayer } from '../src/engine/document';
import { exportableLayers } from '../src/engine/export/layers';

function documentWithLayers(...names: string[]) {
  const doc = createDocument('Test', 4, 4);
  const layers = names.map((name) => createLayer(name, doc.width, doc.height));
  doc.layers = layers;
  return { doc, layers };
}

describe('exportableLayers', () => {
  it('returns visible layers in document order', () => {
    const { doc, layers } = documentWithLayers('Background', 'Character', 'Details');

    expect(exportableLayers(doc)).toEqual(layers);
  });

  it('skips hidden layers', () => {
    const { doc, layers } = documentWithLayers('Background', 'Hidden', 'Details');
    layers[1].visible = false;

    expect(exportableLayers(doc)).toEqual([layers[0], layers[2]]);
  });

  it('skips layers inside hidden groups', () => {
    const { doc, layers } = documentWithLayers('Background', 'Hidden group layer', 'Details');
    doc.groups = [
      {
        id: 'hidden-group',
        name: 'Hidden group',
        visible: false,
        locked: false,
        opacity: 1,
      },
    ];
    layers[1].group = 'hidden-group';

    expect(exportableLayers(doc)).toEqual([layers[0], layers[2]]);
  });

  it('skips layers with zero opacity', () => {
    const { doc, layers } = documentWithLayers('Background', 'Transparent', 'Details');
    layers[1].opacity = 0;

    expect(exportableLayers(doc)).toEqual([layers[0], layers[2]]);
  });

  it('skips layers inside groups with zero opacity', () => {
    const { doc, layers } = documentWithLayers('Background', 'Transparent group layer', 'Details');
    doc.groups = [
      {
        id: 'transparent-group',
        name: 'Transparent group',
        visible: true,
        locked: false,
        opacity: 0,
      },
    ];
    layers[1].group = 'transparent-group';

    expect(exportableLayers(doc)).toEqual([layers[0], layers[2]]);
  });

  it('keeps visible layers that contain no pixels', () => {
    const { doc, layers } = documentWithLayers('Empty layer');

    expect(layers[0].pixels.some((pixel) => pixel !== 0)).toBe(false);
    expect(exportableLayers(doc)).toEqual(layers);
  });
});
