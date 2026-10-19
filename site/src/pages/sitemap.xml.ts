import type { APIRoute } from 'astro';
import { DOC_PAGES } from '../docs';

/** The pages worth finding: the home page, the Draw page, the guides, the docs and the editor (not the 404). */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const pages = [
    base,
    `${base}draw/`,
    `${base}pixel-art-to-svg/`,
    `${base}pixel-art-for-figma/`,
    `${base}isometric-pixel-art/`,
    `${base}docs/`,
    ...DOC_PAGES.map((p) => `${base}docs/${p.slug}/`),
    `${base}app/`,
  ];
  const urls = pages.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
