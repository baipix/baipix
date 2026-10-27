import { flatten } from '../composite';
import type { Layer, PixelDoc } from '../document';
import { isShown } from '../groups';

/** Layers eligible for export, in the document's bottom-to-top order. */
export function exportableLayers(doc: PixelDoc): Layer[] {
  return doc.layers.filter((layer) => isShown(doc, layer));
}

/**
 * The sheet's grid for `count` layers, `columns` to a row (all on one row when null, never more
 * columns than layers), and its size in document pixels.
 */
export function layerSheetGrid(count: number, columns: number | null, width: number, height: number) {
  const cols = Math.max(1, Math.min(columns ?? count, count));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { columns: cols, rows, width: width * cols, height: height * rows };
}

/**
 * Places layer pixel buffers on a grid, `columns` to a row, left to right then top to bottom,
 * preserving their order. Every layer has the same dimensions as the document; the cells left
 * after the last layer stay transparent.
 */
export function composeLayerSpriteSheet(
  layers: Uint32Array[],
  width: number,
  height: number,
  columns: number | null = null,
): Uint32Array {
  const layerSize = width * height;

  if (layers.some((pixels) => pixels.length !== layerSize))
    throw new RangeError('Layer pixel buffer does not match document dimensions');

  const grid = layerSheetGrid(layers.length, columns, width, height);
  const sheet = new Uint32Array(grid.width * grid.height);

  layers.forEach((pixels, index) => {
    const left = (index % grid.columns) * width;
    const top = Math.floor(index / grid.columns) * height;
    for (let y = 0; y < height; y++) {
      sheet.set(pixels.subarray(y * width, (y + 1) * width), (top + y) * grid.width + left);
    }
  });

  return sheet;
}

/** Builds a sprite sheet from the visible layers, in bottom-to-top document order. */
export function layerSpriteSheet(
  doc: PixelDoc,
  layers = exportableLayers(doc),
  columns: number | null = null,
) {
  const pixels = composeLayerSpriteSheet(
    layers.map((layer) => flatten(doc, { onlyLayer: layer })),
    doc.width,
    doc.height,
    columns,
  );
  const { width, height } = layerSheetGrid(layers.length, columns, doc.width, doc.height);

  return { layers, pixels, width, height };
}
