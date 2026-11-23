import { createHash } from 'node:crypto';

/**
 * Big pixel art goes in .svg files of its own instead of inside the page, so the HTML stays light
 * and the browser caches each picture once (a flipbook frame is shown twice, the slime on three
 * pages). A file is named after its content, so a changed picture gets a new address.
 */
export const artFile = (svg: string) => `${createHash('sha1').update(svg).digest('hex').slice(0, 12)}.svg`;

/** The address of a picture's file, and its size, for an <img>. */
export function artImage(svg: string) {
  const size = (name: string) => Number(svg.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  return {
    src: `${import.meta.env.BASE_URL}art/${artFile(svg)}`,
    width: size('width'),
    height: size('height'),
  };
}
