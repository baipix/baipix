export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Puts HTML, a PNG and an SVG on the clipboard together (copied layers: see storage/layerClip.ts).
 * Each app takes what it reads best: Baipix the HTML, design apps the SVG's shapes, the others
 * the PNG. Figma only reads an SVG pasted as text, as Copy as SVG puts it, so it goes as text too.
 */
export async function copyHtmlAndPng(html: string, png: Promise<Blob>, svg?: string): Promise<boolean> {
  const withSvg = svg !== undefined && (ClipboardItem.supports?.('image/svg+xml') ?? false);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'image/png': png,
        ...(withSvg && { 'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }) }),
        ...(svg !== undefined && { 'text/plain': new Blob([svg], { type: 'text/plain' }) }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function copyPng(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
