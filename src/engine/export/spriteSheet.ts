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
