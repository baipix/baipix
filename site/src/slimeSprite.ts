import { flattenFrame } from '../../src/engine/composite';
import { DEFAULT_DURATION, frameCount } from '../../src/engine/frames';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { slime } from './slime';

/**
 * The slime on its own, for small places like the roadmap: its jump without the sky and the
 * ground, every frame cropped to the same box around what moves.
 */
const doc = {
  ...slime,
  layers: slime.layers.map((l) => (l.name === 'Sky' || l.name === 'Ground' ? { ...l, visible: false } : l)),
};
const frames = Array.from({ length: frameCount(doc) }, (_, f) =>
  flattenFrame(doc, f, { includeBackground: false }),
);

let [left, top, right, bottom] = [doc.width, doc.height, -1, -1];
for (const pixels of frames)
  pixels.forEach((c, i) => {
    if (!(c >>> 24)) return;
    const [x, y] = [i % doc.width, Math.floor(i / doc.width)];
    [left, top, right, bottom] = [
      Math.min(left, x),
      Math.min(top, y),
      Math.max(right, x),
      Math.max(bottom, y),
    ];
  });
const w = right - left + 1;
const h = bottom - top + 1;
const crop = (pixels: Uint32Array) => {
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    out.set(pixels.subarray((top + y) * doc.width + left, (top + y) * doc.width + left + w), y * w);
  return out;
};

export const slimeSprite = {
  width: w,
  height: h,
  frames: frames.map((pixels, f) => {
    const svg = toSvg(crop(pixels), w, h, renderGeometry(w, h, 1, 0));
    return {
      paths: svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).trim(),
      duration: doc.frames?.[f].duration ?? DEFAULT_DURATION,
    };
  }),
};
