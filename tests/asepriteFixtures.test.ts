import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { fromAseprite } from '../src/engine/import/aseprite';

// Load the original Aseprite fixture without rebuilding its binary data.
async function loadFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`./fixtures/aseprite/${name}`, import.meta.url)));
}

describe('Aseprite import fixtures', () => {
  it('imports an indexed sprite with four layers', async () => {
    const { document } = await fromAseprite(await loadFixture('abcd.aseprite'));

    // Verify the canvas dimensions and all four source layers.
    expect([document.width, document.height]).toEqual([32, 32]);
    expect(document.layers.map((layer) => layer.name)).toEqual(['a', 'b', 'c', 'd']);

    // Confirm that the indexed palette and compressed cel data were decoded.
    expect(document.palette?.colors.length).toBeGreaterThan(0);
    expect(document.layers.every((layer) => layer.pixels.some((pixel) => pixel !== 0))).toBe(true);
  });

  it('preserves groups, child layers, and hidden layer visibility', async () => {
    const { document } = await fromAseprite(await loadFixture('groups2.aseprite'));

    // Verify both groups and all four editable child layers.
    expect(document.groups?.map((group) => group.name).sort()).toEqual(['items', 'player']);
    expect(document.layers.map((layer) => layer.name).sort()).toEqual(['body', 'gun', 'head', 'sword']);

    // Verify that each layer remains in its original group.
    const itemsGroup = document.groups?.find((group) => group.name === 'items');
    const playerGroup = document.groups?.find((group) => group.name === 'player');

    expect(document.layers.find((layer) => layer.name === 'gun')?.group).toBe(itemsGroup?.id);
    expect(document.layers.find((layer) => layer.name === 'sword')?.group).toBe(itemsGroup?.id);
    expect(document.layers.find((layer) => layer.name === 'body')?.group).toBe(playerGroup?.id);
    expect(document.layers.find((layer) => layer.name === 'head')?.group).toBe(playerGroup?.id);

    // The hidden gun layer must not become visible after import.
    expect(document.layers.find((layer) => layer.name === 'gun')?.visible).toBe(false);
  });

  it('imports linked cels and preserves empty animation cels', async () => {
    const { document, warnings } = await fromAseprite(await loadFixture('tags3.aseprite'));

    // Verify all 12 frames and the three source layers.
    expect([document.width, document.height]).toEqual([4, 4]);
    expect(document.frames).toHaveLength(12);
    expect(document.layers.map((layer) => layer.name)).toEqual(['a', 'b', 'c']);

    // Animation tags are not imported, but their presence must be reported.
    expect(warnings).toContainEqual({ code: 'animationTags' });

    // A linked cel in frame 1 must resolve to the original pixels from frame 0.
    const layerA = document.layers.find((layer) => layer.name === 'a');
    expect(layerA?.cels?.[1]?.pixels).toEqual(layerA?.pixels);

    // Layer c has no cel in frame 2, so the imported cel must remain transparent.
    const layerC = document.layers.find((layer) => layer.name === 'c');
    expect(layerC?.cels?.[2]?.pixels.every((pixel) => pixel === 0)).toBe(true);
  });

  it('imports supported content and reports skipped tilemap and user data', async () => {
    const { document, warnings } = await fromAseprite(await loadFixture('file-tests-props.aseprite'));

    // The source has six frames and four layers, including one unsupported tilemap.
    expect([document.width, document.height]).toEqual([64, 64]);
    expect(document.frames).toHaveLength(6);

    // Only the three regular image layers should become editable layers.
    expect(document.layers.map((layer) => layer.name).sort()).toEqual(['Layer 1', 'Layer 2', 'Layer 3']);

    // Every imported layer must have data slots for all animation frames.
    expect(document.layers.every((layer) => layer.cels?.length === 6)).toBe(true);

    // Unsupported tilemap data, tilesets, and user data must produce warnings.
    const warningCodes = warnings.map((warning) => warning.code);

    expect(warningCodes).toContain('tilemapsSkipped');
    expect(warningCodes).toContain('tilesetsSkipped');
    expect(warningCodes).toContain('userData');
  });

  it('imports a two-frame indexed sprite', async () => {
    const { document } = await fromAseprite(await loadFixture('2f-index-3x3.aseprite'));

    // Verify the indexed image dimensions, palette, and animation frames.
    expect([document.width, document.height]).toEqual([3, 3]);
    expect(document.frames).toHaveLength(2);
    expect(document.layers).toHaveLength(1);
    expect(document.palette?.colors.length).toBeGreaterThan(0);

    // The single layer must contain cel data for both frames.
    expect(document.layers[0].cels).toHaveLength(2);
    expect(document.layers[0].pixels.some((pixel) => pixel !== 0)).toBe(true);
    expect(document.layers[0].cels?.[1]?.pixels.some((pixel) => pixel !== 0)).toBe(true);
  });
});
