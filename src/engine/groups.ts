import type { BlendMode } from './composite';
import type { Layer, LayerGroup, PixelDoc } from './document';

/** Groups go this deep: a group, and groups inside it. */
export const MAX_GROUP_DEPTH = 2;

/** A group's blend mode: `pass-through` (the default) lets each layer blend on its own. */
export type GroupBlendMode = BlendMode | 'pass-through';

/** The layers as a tree, bottom to top: layers, and groups holding their own children. */
export type LayerNode =
  | { kind: 'layer'; layer: Layer; index: number }
  | { kind: 'group'; group: LayerGroup; children: LayerNode[] };

const groupsOf = (doc: PixelDoc): LayerGroup[] => doc.groups ?? [];
export const findGroup = (doc: PixelDoc, id: string | undefined): LayerGroup | undefined =>
  id ? groupsOf(doc).find((g) => g.id === id) : undefined;

/** A group and the groups it's in, innermost first. */
export function groupChain(doc: PixelDoc, id: string | undefined): LayerGroup[] {
  const chain: LayerGroup[] = [];
  for (let g = findGroup(doc, id); g && chain.length <= MAX_GROUP_DEPTH; g = findGroup(doc, g.parent))
    chain.push(g);
  return chain;
}

/** How deep a group is: 1 at the top level, 2 inside another group. */
export const groupDepth = (doc: PixelDoc, id: string): number => groupChain(doc, id).length;

/** Whether `inner` is `outer` or inside it. */
export const isWithin = (doc: PixelDoc, inner: string | undefined, outer: string): boolean =>
  groupChain(doc, inner).some((g) => g.id === outer);

/** The layers in a group, its subgroups included, bottom to top. */
export const groupLayers = (doc: PixelDoc, id: string): Layer[] =>
  doc.layers.filter((l) => isWithin(doc, l.group, id));

/** Shown on the canvas: the layer and every group it's in. */
export const isShown = (doc: PixelDoc, layer: Layer): boolean =>
  layer.visible && groupChain(doc, layer.group).every((g) => g.visible);

/** Locked by itself or by a group it's in. */
export const isLocked = (doc: PixelDoc, layer: Layer): boolean =>
  layer.locked || groupChain(doc, layer.group).some((g) => g.locked);

/** The tree of `doc.layers`, bottom to top. Relies on the layers of a group being contiguous. */
export function layerTree(doc: PixelDoc): LayerNode[] {
  const root: LayerNode[] = [];
  // The open groups, outermost first, with the list their children go in.
  const open: { id: string; children: LayerNode[] }[] = [];
  doc.layers.forEach((layer, index) => {
    const chain = groupChain(doc, layer.group).reverse();
    // Close the groups this layer isn't in, then open the ones it is in.
    let depth = 0;
    while (depth < open.length && depth < chain.length && open[depth].id === chain[depth].id) depth++;
    open.length = depth;
    for (let d = depth; d < chain.length; d++) {
      const node: LayerNode = { kind: 'group', group: chain[d], children: [] };
      (d ? open[d - 1].children : root).push(node);
      open.push({ id: chain[d].id, children: node.children });
    }
    (open.length ? open[open.length - 1].children : root).push({ kind: 'layer', layer, index });
  });
  return root;
}

/**
 * Makes the groups valid again after layers moved or went away: drops empty groups, groups too
 * deep or with a missing parent, and ungroups any group whose layers aren't contiguous anymore.
 */
export function normalizeGroups(doc: PixelDoc): void {
  let groups = groupsOf(doc);
  // Parents must exist, and stay within the depth limit.
  for (let changed = true; changed;) {
    changed = false;
    const ids = new Set(groups.map((g) => g.id));
    for (const g of groups)
      if (g.parent && (!ids.has(g.parent) || g.parent === g.id)) {
        delete g.parent;
        changed = true;
      }
    const tooDeep = groups.filter((g) => groupChain({ ...doc, groups }, g.id).length > MAX_GROUP_DEPTH);
    if (tooDeep.length) {
      for (const g of tooDeep) delete g.parent;
      changed = true;
    }
  }
  const ids = new Set(groups.map((g) => g.id));
  for (const l of doc.layers) if (l.group && !ids.has(l.group)) delete l.group;
  const probe = { ...doc, groups };
  // A group's layers must be contiguous; otherwise its layers leave it.
  for (const g of groups) {
    const at = doc.layers.flatMap((l, i) => (isWithin(probe, l.group, g.id) ? [i] : []));
    if (at.length && at[at.length - 1] - at[0] + 1 !== at.length) {
      for (const l of doc.layers) if (l.group === g.id) l.group = g.parent;
      for (const c of groups) if (c.parent === g.id) c.parent = g.parent;
    }
  }
  // Groups with no layers left go away.
  groups = groups.filter((g) => doc.layers.some((l) => isWithin(probe, l.group, g.id)));
  if (groups.length) doc.groups = groups;
  else delete doc.groups;
}

/** An item of the layer list: a layer, or a whole group. */
export type LayerItem = { kind: 'layer'; id: string } | { kind: 'group'; id: string };

/** The layers an item holds, bottom to top. */
export const itemLayers = (doc: PixelDoc, item: LayerItem): Layer[] =>
  item.kind === 'layer' ? doc.layers.filter((l) => l.id === item.id) : groupLayers(doc, item.id);

/** The group an item is in. */
export const itemParent = (doc: PixelDoc, item: LayerItem): string | undefined =>
  item.kind === 'layer' ? doc.layers.find((l) => l.id === item.id)?.group : findGroup(doc, item.id)?.parent;

/** How many group levels an item adds when put in a group: 0 for a layer, 1 or 2 for a group. */
function itemHeight(doc: PixelDoc, item: LayerItem): number {
  if (item.kind === 'layer') return 0;
  const childGroups = groupsOf(doc).filter((g) => g.parent === item.id);
  return 1 + (childGroups.length ? 1 : 0);
}

/**
 * The selected layers as list items: whole groups when all their layers are selected (the
 * outermost such group), single layers otherwise. Bottom to top.
 */
export function pickedItems(doc: PixelDoc, picked: string[]): LayerItem[] {
  const items: LayerItem[] = [];
  const full = (g: LayerGroup) => groupLayers(doc, g.id).every((l) => picked.includes(l.id));
  for (const layer of doc.layers) {
    if (!picked.includes(layer.id)) continue;
    const outer = groupChain(doc, layer.group)
      .reverse()
      .find((g) => full(g));
    const item: LayerItem = outer ? { kind: 'group', id: outer.id } : { kind: 'layer', id: layer.id };
    if (!items.some((x) => x.kind === item.kind && x.id === item.id)) items.push(item);
  }
  return items;
}

/** Where items go: into `parent`, right above the layer `above` (or at the bottom of… `null`: on top). */
export interface Placement {
  parent: string | undefined;
  /** The layer the items land right above; `null` puts them below every layer of `parent`. */
  aboveLayer: string | null;
}

/**
 * Moves items (keeping their order) to a placement, putting them in its group. Returns false when
 * it can't: a group into itself, or deeper than two levels. Normalizes the groups after.
 */
export function moveItems(doc: PixelDoc, items: LayerItem[], to: Placement): boolean {
  if (!items.length) return false;
  if (to.parent) {
    const depth = groupDepth(doc, to.parent);
    for (const item of items) {
      if (item.kind === 'group' && isWithin(doc, to.parent, item.id)) return false;
      if (depth + itemHeight(doc, item) > MAX_GROUP_DEPTH) return false;
    }
  }
  const moving = items.flatMap((item) => itemLayers(doc, item));
  if (to.aboveLayer && moving.some((l) => l.id === to.aboveLayer)) return false;
  const rest = doc.layers.filter((l) => !moving.includes(l));
  let at: number;
  if (to.aboveLayer) at = rest.findIndex((l) => l.id === to.aboveLayer) + 1;
  else if (to.parent) {
    // Below every layer of the group: right where its first layer is.
    const first = rest.findIndex((l) => isWithin(doc, l.group, to.parent!));
    at = first < 0 ? rest.length : first;
  } else at = 0;
  if (to.aboveLayer && at === 0) return false;
  const active = doc.layers[doc.activeLayer];
  doc.layers = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  for (const item of items) {
    if (item.kind === 'layer') {
      const layer = doc.layers.find((l) => l.id === item.id)!;
      if (to.parent) layer.group = to.parent;
      else delete layer.group;
    } else {
      const group = findGroup(doc, item.id)!;
      if (to.parent) group.parent = to.parent;
      else delete group.parent;
    }
  }
  doc.activeLayer = Math.max(0, doc.layers.indexOf(active));
  normalizeGroups(doc);
  return true;
}
