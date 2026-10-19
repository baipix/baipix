import type { APIRoute } from 'astro';
import { DOC_PAGES } from '../../docs';
import { en } from '../../../../src/i18n/en';
import { SHORTCUT_GROUPS } from '../../../../src/ui/dialogs/shortcuts';
import { TOOL_LIST } from '../../../../src/ui/tools';

/**
 * The docs' search index, built with the site: each page cut into its sections (an h2 and the text
 * under it), as plain text. The docs' search box loads it the first time it's used.
 */
interface Entry {
  /** The page's address, with the section's anchor. */
  url: string;
  page: string;
  /** The section's title, or the page's for the text before its first section. */
  title: string;
  text: string;
}

const pages = import.meta.glob<{ compiledContent: () => Promise<string> | string }>('./**/*.md', {
  eager: true,
});

/** An anchor from a heading's text, the way the docs' "On this page" makes them. */
const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const plain = (html: string) =>
  html
    .replace(/<figure[\s\S]*?<\/figure>/g, ' ')
    // Inline tags go without a space, so "<strong>Dithering</strong>:" stays "Dithering:".
    .replace(/<\/?(strong|em|code|kbd|a|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const entries: Entry[] = [];
  for (const page of DOC_PAGES) {
    const url = `${base}docs/${page.slug}/`;
    const md = pages[`./${page.slug}.md`];
    if (!md) continue;
    const html = await md.compiledContent();
    // Split at each h2: the text before the first one belongs to the page itself.
    const parts = html.split(/<h2[^>]*>/);
    entries.push({ url, page: page.title, title: page.title, text: plain(parts[0]) });
    for (const part of parts.slice(1)) {
      const [heading, ...rest] = part.split('</h2>');
      const title = plain(heading);
      entries.push({ url: `${url}#${slug(title)}`, page: page.title, title, text: plain(rest.join(' ')) });
    }
  }
  // The shortcuts page is built from the editor: its tools and commands, with their keys.
  const label = (key: string) => (en as Record<string, string>)[key] ?? key;
  const shortcuts = `${base}docs/reference/shortcuts/`;
  entries.push({
    url: `${shortcuts}#tools`,
    page: 'Keyboard shortcuts',
    title: 'Tools',
    text: TOOL_LIST.filter((t) => t.shortcut)
      .map((t) => `${label(t.label)} ${t.shortcut}`)
      .join(', '),
  });
  for (const group of SHORTCUT_GROUPS.filter((g) => g.title !== 'shortcuts.tools'))
    entries.push({
      url: `${shortcuts}#${slug(label(group.title))}`,
      page: 'Keyboard shortcuts',
      title: label(group.title),
      text: group.items.map(([key, keys]) => `${label(key)} ${keys}`).join(', '),
    });
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } });
};
