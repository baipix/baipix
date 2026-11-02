/**
 * Calculates the grid layout and total dimensions of a sprite sheet.
 * `columns` sets the number of items per row; when null, all items are placed in one row.
 * The number of columns never exceeds `count`. `width` and `height` are the dimensions
 * of each item in document pixels.
 */
export function spriteSheetGrid(count: number, columns: number | null, width: number, height: number) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('A sprite sheet must contain at least one item.');
  }

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Sprite sheet dimensions must be positive integers.');
  }

  if (columns !== null && (!Number.isInteger(columns) || columns < 1)) {
    throw new RangeError('Columns must be a positive integer.');
  }

  const cols = Math.min(columns ?? count, count);
  const rows = Math.ceil(count / cols);

  return {
    columns: cols,
    rows,
    width: width * cols,
    height: height * rows,
  };
}

/**
 * Places equally sized pixel buffers on a grid, left to right and top to bottom.
 * Cells left after the last item remain transparent.
 */
export function composeSpriteSheet(
  items: readonly Uint32Array[],
  width: number,
  height: number,
  columns: number | null = null,
) {
  const grid = spriteSheetGrid(items.length, columns, width, height);
  const itemSize = width * height;

  if (items.some((pixels) => pixels.length !== itemSize)) {
    throw new RangeError('Sprite sheet item pixel buffer does not match document dimensions.');
  }

  const pixels = new Uint32Array(grid.width * grid.height);

  items.forEach((item, index) => {
    const left = (index % grid.columns) * width;
    const top = Math.floor(index / grid.columns) * height;

    for (let y = 0; y < height; y++) {
      pixels.set(item.subarray(y * width, (y + 1) * width), (top + y) * grid.width + left);
    }
  });

  return {
    pixels,
    ...grid,
  };
}
