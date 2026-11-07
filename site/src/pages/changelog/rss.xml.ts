import type { APIRoute } from 'astro';
import { anchor, releases } from '../../changelog';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Each version as an RSS item: its number, a link to it on the page, its date and its summary. */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const page = new URL(`${base}changelog/`, site).href;
  const items = releases
    .filter((r) => r.date)
    .map((r) => {
      const link = `${page}#${anchor(r.version)}`;
      const summary = r.summary.replace(/<[^>]+>/g, '');
      return `    <item>
      <title>Baipix ${escape(r.version)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${new Date(`${r.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(summary)}</description>
    </item>`;
    })
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Baipix release notes</title>
    <link>${page}</link>
    <description>What changed in Baipix, the free pixel art editor in your browser, version by version.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`,
    { headers: { 'Content-Type': 'application/rss+xml' } },
  );
};
