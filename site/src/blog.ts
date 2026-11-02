/**
 * The blog: one Markdown file per post in ./blog, its frontmatter saying what it is. The cover is a
 * picture from site/public (a screenshot…), or a piece of pixel art (a .baipix from the gallery or
 * from ./art) rendered to SVG at build time, on the pastel of the post's category. Drafts show only
 * on the dev server.
 */
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { flatten } from '../../src/engine/composite';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { fileFromJson } from '../../src/storage/fileFormat';

/** Who writes: their pixel avatar (in site/public) and their GitHub profile. */
export const AUTHORS: Record<string, { avatar: string; url: string }> = {
  'Todo-bai': { avatar: 'blog/todo-bai.svg', url: 'https://github.com/Todo-bai' },
};

export const CATEGORIES = {
  news: { label: 'News', tone: 'start' },
  tutorial: { label: 'Tutorials', tone: 'shapes' },
} as const;
export type Category = keyof typeof CATEGORIES;

interface Frontmatter {
  title: string;
  description: string;
  /** YYYY-MM-DD. */
  date: string;
  category: Category;
  author: string;
  /** A picture's path in site/public (`/screenshot-light.png`), or a .baipix file name, from ../../gallery or ./art. */
  cover: string;
  draft?: boolean;
}

export interface Post extends Frontmatter {
  slug: string;
  url: string;
  /** About how long it takes to read, in minutes. */
  minutes: number;
  /** The cover: a picture's address, or pixel art as SVG. */
  coverImage?: string;
  coverSvg?: string;
  Content: AstroComponentFactory;
}

const files = import.meta.glob<{
  frontmatter: Frontmatter;
  Content: AstroComponentFactory;
  rawContent: () => string;
}>('./blog/*.md', { eager: true });

const art = import.meta.glob<string>(['../../gallery/*.baipix', './art/*.baipix'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The cover's first board, as SVG, with its background when it has one. */
function coverSvg(file: string): string {
  const source = art[`../../gallery/${file}`] ?? art[`./art/${file}`];
  if (!source) throw new Error(`Blog cover not found: ${file}`);
  const [doc] = fileFromJson(source);
  return toSvg(flatten(doc), doc.width, doc.height, renderGeometry(doc.width, doc.height, 1, 0));
}

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Every post to show, newest first. */
export const posts: Post[] = Object.entries(files)
  .map(([path, { frontmatter, Content, rawContent }]) => {
    const slug = path.replace(/^\.\/blog\/|\.md$/g, '');
    return {
      ...frontmatter,
      slug,
      url: `${base}blog/${slug}/`,
      minutes: Math.max(1, Math.round(rawContent().split(/\s+/).length / 220)),
      ...(frontmatter.cover.endsWith('.baipix')
        ? { coverSvg: coverSvg(frontmatter.cover) }
        : { coverImage: `${base}${frontmatter.cover.replace(/^\//, '')}` }),
      Content,
    };
  })
  .filter((p) => import.meta.env.DEV || !p.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

export const formatDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
