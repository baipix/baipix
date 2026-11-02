import type { APIRoute } from 'astro';
import { posts } from '../../blog';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The blog as an RSS feed: each post's title, link, date and description. */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const items = posts
    .map((p) => {
      const link = new URL(p.url, site).href;
      return `    <item>
      <title>${escape(p.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(p.description)}</description>
    </item>`;
    })
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Baipix blog</title>
    <link>${new URL(`${base}blog/`, site).href}</link>
    <description>News and tutorials from Baipix, the free pixel art editor in your browser.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`,
    { headers: { 'Content-Type': 'application/rss+xml' } },
  );
};
