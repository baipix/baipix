export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Puts HTML and a PNG on the clipboard together (copied layers: see storage/layerClip.ts). */
export async function copyHtmlAndPng(html: string, png: Promise<Blob>): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'image/png': png }),
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
