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
