import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { createDocument, createLayer, type PixelDoc } from '../src/engine/document';
import { renderGeometry, toLayeredSvg } from '../src/engine/export/svg';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

/** Sky at the bottom, then a Clouds group holding Far and "Near & low", the top layer. */
function scene(): PixelDoc {
  const doc = createDocument('t', 3, 1, 'Sky');
  const far = createLayer('Far', 3, 1);
  const near = createLayer('Near & low', 3, 1);
  doc.layers[0].pixels[0] = BLUE;
  far.pixels[1] = RED;
  near.pixels[2] = RED;
  far.group = near.group = 'g1';
  doc.layers.push(far, near);
  doc.groups = [{ id: 'g1', name: 'Clouds', visible: true, locked: false, opacity: 1 }];
  return doc;
}

const svgOf = (doc: PixelDoc) => toLayeredSvg(doc, renderGeometry(doc.width, doc.height, 10, 0));

describe('SVG export with layers', () => {
  it('keeps each layer and group as a named <g>, bottom to top', () => {
    const svg = svgOf(scene());
    const ids = [...svg.matchAll(/<g id="([^"]+)" data-name="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(ids).toEqual([
      ['Sky', 'Sky'],
      ['Clouds', 'Clouds'],
      ['Far', 'Far'],
      ['Near_low', 'Near &amp; low'],
    ]);
    // Far and Near are inside Clouds.
    expect(svg).toMatch(/id="Clouds"[^]*id="Far"[^]*id="Near_low"[^]*<\/g>\s*<\/g>\s*<\/svg>/);
  });

  it('gives layers with the same name different ids', () => {
    const doc = scene();
    doc.layers[1].name = doc.layers[2].name = 'Cloud';
    const svg = svgOf(doc);
    expect(svg).toContain('id="Cloud" data-name="Cloud"');
    expect(svg).toContain('id="Cloud_2" data-name="Cloud"');
  });

  it('carries opacity and blend modes, and isolates a group in a mode of its own', () => {
    const doc = scene();
    doc.layers[1].opacity = 0.5;
    doc.layers[2].blendMode = 'multiply';
    expect(svgOf(doc)).toMatch(/<g id="Clouds" data-name="Clouds">/);
    expect(svgOf(doc)).toContain('id="Far" data-name="Far" opacity="0.5"');
    expect(svgOf(doc)).toContain('style="mix-blend-mode:multiply"');
    doc.groups![0].blendMode = 'normal';
    expect(svgOf(doc)).toContain('id="Clouds" data-name="Clouds" style="isolation:isolate"');
  });

  it('leaves out hidden and empty layers, and groups with nothing left', () => {
    const doc = scene();
    doc.layers[1].visible = false;
    doc.layers[2].pixels.fill(0);
    const svg = svgOf(doc);
    expect(svg).not.toContain('Far');
    expect(svg).not.toContain('Clouds');
    expect(svg).toContain('id="Sky"');
  });

  it('draws effects into their layer', () => {
    const doc = scene();
    doc.layers[0].effects = [
      { type: 'outline', visible: true, color: RED, size: 1, place: 'outside', corners: false },
    ];
    const sky = svgOf(doc).split('id="Clouds"')[0];
    expect(sky).toContain('fill="#ff0000"');
  });
});
