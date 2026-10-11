import { alpha, toHex, type Color } from '../color';
import type { BlendMode } from '../composite';
import type { PixelDoc } from '../document';
import { withEffects } from '../effects';
import { layerTree, type LayerNode } from '../groups';

export interface RenderGeometry {
  pixelSize: number;
  gap: number;
  width: number;
  height: number;
}

export const MAX_EXPORT_SIZE = 8192;

/**
 * Output size for a document rendered with a pixel size and gap. The pixel size is halved
 * until the image fits within MAX_EXPORT_SIZE.
 */
export function renderGeometry(
  docWidth: number,
  docHeight: number,
  pixelSize: number,
  gap: number,
): RenderGeometry {
  const at = (k: number): RenderGeometry => ({
    pixelSize: k,
    gap,
    width: docWidth * k + (docWidth - 1) * gap,
    height: docHeight * k + (docHeight - 1) * gap,
  });
  let k = pixelSize;
  let g = at(k);
  while (k > 1 && (g.width > MAX_EXPORT_SIZE || g.height > MAX_EXPORT_SIZE)) {
    k = Math.max(1, k >> 1);
    g = at(k);
  }
  return g;
}

const fillAttrs = (c: Color): string =>
  `fill="${toHex(c)}"${alpha(c) < 255 ? ` fill-opacity="${(alpha(c) / 255).toFixed(3)}"` : ''}`;

/**
 * One <path> per color. Without a gap, horizontal runs of the same color are merged into a single
 * rectangle, which keeps files small and makes them pleasant to edit in design tools.
 */
function colorPaths(
  pixels: Uint32Array,
  docWidth: number,
  docHeight: number,
  geometry: RenderGeometry,
): string[] {
  const { pixelSize: k, gap: g } = geometry;
  const step = k + g;
  const paths = new Map<Color, string[]>();
  const add = (c: Color, d: string) => {
    const list = paths.get(c);
    if (list) list.push(d);
    else paths.set(c, [d]);
  };
  for (let y = 0; y < docHeight; y++) {
    for (let x = 0; x < docWidth; x++) {
      const c = pixels[y * docWidth + x];
      if (!alpha(c)) continue;
      if (g === 0) {
        let end = x + 1;
        while (end < docWidth && pixels[y * docWidth + end] === c) end++;
        const w = (end - x) * k;
        add(c, `M${x * k} ${y * k}h${w}v${k}h-${w}z`);
        x = end - 1;
      } else {
        add(c, `M${x * step} ${y * step}h${k}v${k}h-${k}z`);
      }
    }
  }
  return [...paths].map(([c, d]) => `<path ${fillAttrs(c)} d="${d.join('')}"/>`);
}

function svgDocument(geometry: RenderGeometry, background: Color, body: string[]): string {
  const { width, height } = geometry;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
  ];
  if (alpha(background)) lines.push(`<rect width="${width}" height="${height}" ${fillAttrs(background)}/>`);
  lines.push(...body, '</svg>', '');
  return lines.join('\n');
}

/** Crisp SVG of flat pixels (one layer, or the drawing merged). */
export function toSvg(
  pixels: Uint32Array,
  docWidth: number,
  docHeight: number,
  geometry: RenderGeometry,
  background: Color = 0,
): string {
  return svgDocument(geometry, background, colorPaths(pixels, docWidth, docHeight, geometry));
}

const escapeXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

/**
 * Crisp SVG that keeps the layers: a <g> per layer and per group, named after it, so they stay
 * apart once opened in a design tool. It looks the same as the merged drawing: opacity and blend
 * modes go on the <g>s, effects are drawn into their layer, hidden layers are left out.
 */
export function toLayeredSvg(doc: PixelDoc, geometry: RenderGeometry, background: Color = 0): string {
  const used = new Set<string>();
  // Design tools name layers after `id` (it can't have spaces, and must be unique) or `data-name`.
  const names = (name: string) => {
    const base =
      name
        .trim()
        .replace(/[^\w-]+/g, '_')
        .replace(/^(?=[\d-])/, '_') || 'layer';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return `id="${id}" data-name="${escapeXml(name)}"`;
  };
  const look = (opacity: number, mode: BlendMode | undefined, isolate: boolean) => {
    const styles = [
      mode && mode !== 'normal' ? `mix-blend-mode:${mode}` : '',
      isolate ? 'isolation:isolate' : '',
    ].filter(Boolean);
    return `${opacity < 1 ? ` opacity="${+opacity.toFixed(3)}"` : ''}${styles.length ? ` style="${styles.join(';')}"` : ''}`;
  };
  const render = (nodes: LayerNode[], indent: string): string[] =>
    // Top layers last: SVG paints in order.
    nodes.flatMap((node) => {
      if (node.kind === 'layer') {
        const { layer } = node;
        if (!layer.visible || layer.opacity <= 0) return [];
        const pixels = withEffects(layer.pixels, doc.width, doc.height, layer.effects);
        const paths = colorPaths(pixels, doc.width, doc.height, geometry);
        if (!paths.length) return [];
        return [
          `${indent}<g ${names(layer.name)}${look(layer.opacity, layer.blendMode, false)}>`,
          ...paths.map((p) => indent + '  ' + p),
          `${indent}</g>`,
        ];
      }
      const { group } = node;
      if (!group.visible || group.opacity <= 0) return [];
      const inner = render(node.children, indent + '  ');
      if (!inner.length) return [];
      // A group in a mode of its own (even Normal) puts its layers together before laying them down.
      return [
        `${indent}<g ${names(group.name)}${look(group.opacity, group.blendMode, group.blendMode === 'normal')}>`,
        ...inner,
        `${indent}</g>`,
      ];
    });
  return svgDocument(geometry, background, render(layerTree(doc), ''));
}
