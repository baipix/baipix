import { clampFrame, findMaster, syncInstances } from './components';
import { activeLayer, cloneLayer, newId, type Layer, type LayerGroup, type PixelDoc } from './document';
import { groupChain, isWithin, itemLayers, moveItems, pickedItems, type LayerItem } from './groups';
import { reframe } from './outside';

/**
 * Whole layers on the clipboard (Cmd+C with no pixels selected, or in the Layers panel): copies of
 * the layers with their settings, the groups they fill and their component links, at the size of
 * the canvas they came from.
 */
export interface LayerFragment {
  /** Which copy this is: tells an older copy left on the system clipboard from a newer one here. */
  id?: string;
  width: number;
  height: number;
  /** Bottom to top. An instance may point at a master outside the fragment: see `pasteFragment`. */
  layers: Layer[];
  /** Only groups whose layers are all in the fragment; a group's `parent` is one of them or none. */
  groups: LayerGroup[];
}

/** The selected layers as a fragment: whole groups when all their layers are selected. */
export function fragmentOf(doc: PixelDoc, picked: string[]): LayerFragment | null {
  const items = pickedItems(doc, picked);
  if (!items.length) return null;
  const groupIds = new Set(
    items.flatMap((item) =>
      item.kind === 'group'
        ? (doc.groups ?? []).filter((g) => isWithin(doc, g.id, item.id)).map((g) => g.id)
        : [],
    ),
  );
  const groups = (doc.groups ?? [])
    .filter((g) => groupIds.has(g.id))
    .map((g) => {
      const copy = { ...g };
      if (!copy.parent || !groupIds.has(copy.parent)) delete copy.parent;
      return copy;
    });
  const layers = items
    .flatMap((item) => itemLayers(doc, item))
    .map((l) => {
      const copy = cloneLayer(l);
      if (!copy.group || !groupIds.has(copy.group)) delete copy.group;
      return copy;
    });
  return { width: doc.width, height: doc.height, layers, groups };
}

/**
 * Adds a fragment's layers right above the active layer, in its group (or above that group when
 * it would nest too deep), under new ids. They keep their place on the canvas: from a canvas of
 * another size, what falls outside is kept off the canvas. An instance stays linked to its master
 * when the master comes along, or is already in this document; otherwise it becomes plain pixels.
 * Returns the new layers' ids, bottom to top, and the group when the fragment is a single group.
 */
export function pasteFragment(doc: PixelDoc, fragment: LayerFragment): { ids: string[]; group?: string } {
  const groupIds = new Map(fragment.groups.map((g) => [g.id, newId('group')]));
  const layerIds = new Map(fragment.layers.map((l) => [l.id, newId('layer')]));
  const groups: LayerGroup[] = fragment.groups.map((g) => {
    const copy = { ...g, id: groupIds.get(g.id)! };
    if (g.parent && groupIds.has(g.parent)) copy.parent = groupIds.get(g.parent);
    else delete copy.parent;
    return copy;
  });
  const layers = fragment.layers.map((l) => {
    const r = reframe(l.pixels, fragment.width, fragment.height, l.outside, 0, 0, doc.width, doc.height);
    const copy: Layer = { ...cloneLayer(l), id: layerIds.get(l.id)!, pixels: r.pixels };
    if (r.outside) copy.outside = r.outside;
    else delete copy.outside;
    if (l.group && groupIds.has(l.group)) copy.group = groupIds.get(l.group);
    else delete copy.group;
    if (copy.component) copy.component = clampFrame(doc, copy.component);
    if (copy.instance) {
      const of =
        layerIds.get(copy.instance.of) ?? (findMaster(doc, copy.instance.of) ? copy.instance.of : null);
      if (of) copy.instance = { ...copy.instance, of };
      else delete copy.instance;
    }
    return copy;
  });
  const active = activeLayer(doc);
  doc.layers.push(...layers);
  if (groups.length) doc.groups = [...(doc.groups ?? []), ...groups];
  const items: LayerItem[] = pickedItems(
    doc,
    layers.map((l) => l.id),
  );
  // Above the active layer in its group; too deep there, above its outermost group.
  const outer = groupChain(doc, active.group).at(-1);
  const top = outer ? doc.layers.filter((l) => isWithin(doc, l.group, outer.id)).at(-1)! : active;
  if (!moveItems(doc, items, { parent: active.group, aboveLayer: active.id }))
    moveItems(doc, items, { parent: undefined, aboveLayer: top.id });
  syncInstances(doc);
  const single = items.length === 1 && items[0].kind === 'group' ? items[0].id : undefined;
  const pasted = new Set(layers.map((l) => l.id));
  return { ids: doc.layers.filter((l) => pasted.has(l.id)).map((l) => l.id), group: single };
}
