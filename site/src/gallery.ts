/**
 * Gallery pieces from ../gallery, rendered to SVG at build time with Baipix's own exporter: the
 * same clean vector the editor produces (one path per color, merged runs, render gap included).
 */
import { flatten } from '../../src/engine/composite';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { uniqueColors } from '../../src/engine/region';
import { deserializeDocument } from '../../src/storage/fileFormat';
import entries from '../../gallery/gallery.json';

const sources = import.meta.glob<string>('../../gallery/*.baipix', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const urls = import.meta.glob<string>('../../gallery/*.baipix', {
  query: '?url',
  import: 'default',
  eager: true,
});

export interface GalleryPiece {
  title: string;
  style: string;
  author: string;
  width: number;
  height: number;
  colors: number;
  layers: number;
  svg: string;
  /** No background: the piece is shown on the page surface, with some padding. */
  transparent: boolean;
  download: string;
  file: string;
}

/** A gallery file (`knight.baipix`…), as a document. */
export const galleryDoc = (file: string) => deserializeDocument(JSON.parse(sources[`../../gallery/${file}`]));

export const gallery: GalleryPiece[] = entries.map((entry) => {
  const key = `../../gallery/${entry.file}`;
  const doc = galleryDoc(entry.file);
  const pixels = flatten(doc, { includeBackground: false });
  const geometry = renderGeometry(doc.width, doc.height, doc.render.pixelSize, doc.render.gap);
  const background = doc.backgroundVisible ? doc.background : 0;
  return {
    ...entry,
    width: doc.width,
    height: doc.height,
    colors: uniqueColors(flatten(doc)).length,
    layers: doc.layers.length,
    svg: toSvg(pixels, doc.width, doc.height, geometry, background),
    transparent: !background && pixels.some((c) => c >>> 24 === 0),
    download: urls[key],
  };
});
