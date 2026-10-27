import type { Layer, PixelDoc } from '../document';
import { groupChain, isShown } from '../groups';

/** Layers eligible for export, in the document's bottom-to-top order. */
export function exportableLayers(doc: PixelDoc): Layer[] {
  return doc.layers.filter(
    (layer) =>
      isShown(doc, layer) &&
      layer.opacity > 0 &&
      groupChain(doc, layer.group).every((group) => group.opacity > 0),
  );
}

/**
 * Places layer pixel buffers side by side, preserving their order.
 * Every layer has the same dimensions as the document.
 */
export function composeLayerSpriteSheet(layers: Uint32Array[], width: number, height: number): Uint32Array {
  const layerSize = width * height;

  if (layers.some((pixels) => pixels.length !== layerSize))
    throw new RangeError('Layer pixel buffer does not match document dimensions');

  const sheetWidth = width * layers.length;
  const sheet = new Uint32Array(sheetWidth * height);

  layers.forEach((pixels, index) => {
    for (let y = 0; y < height; y++) {
      sheet.set(pixels.subarray(y * width, (y + 1) * width), y * sheetWidth + index * width);
    }
  });

  return sheet;
}
