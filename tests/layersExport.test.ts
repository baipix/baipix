import { describe, expect, it } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument, createLayer } from '../src/engine/document';
import { exportableLayers, layerSheetGrid, layerSpriteSheet } from '../src/engine/export/layers';

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

  it('includes layers with zero opacity', () => {
    const { doc, layers } = documentWithLayers('Background', 'Transparent', 'Details');
    layers[1].opacity = 0;

    expect(exportableLayers(doc)).toEqual([layers[0], layers[1], layers[2]]);
  });

  it('includes layers inside groups with zero opacity', () => {
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

    expect(exportableLayers(doc)).toEqual([layers[0], layers[1], layers[2]]);
  });

  it('builds a horizontal sprite sheet from visible layers', () => {
    const { doc, layers } = documentWithLayers('Base', 'Details');
    const red = pack(255, 0, 0);
    const blue = pack(0, 0, 255);
    layers[0].pixels[0] = red;
    layers[1].pixels[0] = blue;

    const sheet = layerSpriteSheet(doc);

    expect(sheet.layers).toEqual(layers);
    expect(sheet.width).toBe(doc.width * layers.length);
    expect(sheet.height).toBe(doc.height);
    expect(Array.from(sheet.pixels.slice(0, 8))).toEqual([red, 0, 0, 0, blue, 0, 0, 0]);
  });

  it('lays the sheet out in a grid of the given columns, empty cells left transparent', () => {
    const { doc, layers } = documentWithLayers('A', 'B', 'C');
    const colors = [pack(255, 0, 0), pack(0, 255, 0), pack(0, 0, 255)];
    layers.forEach((layer, i) => (layer.pixels[0] = colors[i]));

    const sheet = layerSpriteSheet(doc, layers, 2);

    expect(sheet.width).toBe(doc.width * 2);
    expect(sheet.height).toBe(doc.height * 2);
    const at = (x: number, y: number) => sheet.pixels[y * sheet.width + x];
    expect(at(0, 0)).toBe(colors[0]);
    expect(at(doc.width, 0)).toBe(colors[1]);
    expect(at(0, doc.height)).toBe(colors[2]);
    expect(
      sheet.pixels.slice(doc.height * sheet.width).filter((c, i) => i % sheet.width >= doc.width && c),
    ).toHaveLength(0);
  });

  it('never makes more columns than layers', () => {
    expect(layerSheetGrid(3, 10, 4, 4)).toEqual({ columns: 3, rows: 1, width: 12, height: 4 });
    expect(layerSheetGrid(5, null, 4, 4)).toEqual({ columns: 5, rows: 1, width: 20, height: 4 });
    expect(layerSheetGrid(5, 1, 4, 4)).toEqual({ columns: 1, rows: 5, width: 4, height: 20 });
  });

  it('keeps visible layers that contain no pixels', () => {
    const { doc, layers } = documentWithLayers('Empty layer');

    expect(layers[0].pixels.some((pixel) => pixel !== 0)).toBe(false);
    expect(exportableLayers(doc)).toEqual(layers);
  });
});
