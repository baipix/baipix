import type { APIRoute } from 'astro';

/** Everything can be crawled; the sitemap lists the pages. */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(`${base}sitemap.xml`, site).href}\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
