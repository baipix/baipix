import { LOGO } from '../ui/icons';

export const LOGO_COLORS = [
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'blue', label: 'Blue', color: '#66c4ff' },
] as const;

/** The logo as an SVG file, on its 8×8 grid, scaled to `size` px. */
export const logoSvg = (color: string, size = 256): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${LOGO.width} ${LOGO.height}" shape-rendering="crispEdges"><path fill="${color}" d="${LOGO.d}${LOGO.pixel}"/></svg>\n`;

/** The logo as a PNG with a transparent background, `size` px (a multiple of 8 keeps it sharp). */
export function logoPng(color: string, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(size / LOGO.width, size / LOGO.height);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(LOGO.d + LOGO.pixel));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png'),
  );
}

export function download(name: string, data: Blob | string, type = 'image/svg+xml'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
