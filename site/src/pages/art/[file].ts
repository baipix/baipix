import type { APIRoute, GetStaticPaths } from 'astro';
import { artFile } from '../../artFiles';
import { carFrames } from '../../car';
import { gallery } from '../../gallery';
import { hobbitBoards } from '../../hobbit';
import { slimeFrames } from '../../slime';

/** The pictures the pages show with artImage(), as files: the gallery, the flipbooks' frames and the hobbit house. */
export const getStaticPaths = (() => {
  const svgs = new Set([...gallery, ...slimeFrames, ...carFrames, ...hobbitBoards].map((p) => p.svg));
  return [...svgs].map((svg) => ({ params: { file: artFile(svg) }, props: { svg } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.svg, { headers: { 'Content-Type': 'image/svg+xml' } });
