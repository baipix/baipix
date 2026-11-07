/**
 * CHANGELOG.md, read at build time for the site's /changelog page and its feed: what changed in
 * the editor, version by version. The Website parts stay in the file and the GitHub releases.
 */
import source from '../../CHANGELOG.md?raw';

export type Kind = 'new' | 'better' | 'fixed' | 'removed';

export interface Group {
  kind: Kind;
  label: string;
  /** Each line as HTML. */
  items: string[];
}

export interface Thanks {
  login: string;
  /** What they did, as HTML, without their name. */
  html: string;
}

export interface Release {
  version: string;
  /** YYYY-MM-DD, missing for the first version. */
  date?: string;
  summary: string;
  groups: Group[];
  thanks: Thanks[];
}

export interface Series {
  /** 0.8, 0.7… */
  name: string;
  releases: Release[];
}

const KINDS: Record<string, { kind: Kind; label: string }> = {
  Added: { kind: 'new', label: 'New' },
  Changed: { kind: 'better', label: 'Better' },
  Fixed: { kind: 'fixed', label: 'Fixed' },
  Removed: { kind: 'removed', label: 'Removed' },
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The changelog's Markdown on one line: links, code and bold. Pull request links come out small. */
function inline(md: string): string {
  return escape(md)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\(((?:\[#\d+\]\([^)]+\)(?:, )?)+)\)\s*$/, (_, links: string) => {
      const prs = [...links.matchAll(/\[#(\d+)\]\(([^)]+)\)/g)]
        .map(([, n, url]) => `<a href="${url}">#${n}</a>`)
        .join(', ');
      return `<span class="prs">${prs}</span>`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function parse(md: string) {
  let unreleased: Release | undefined;
  const releases: Release[] = [];
  let current: Release | undefined;
  let section = '';
  for (const line of md.split('\n')) {
    const head = line.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
    if (head) {
      current = { version: head[1], date: head[2], summary: '', groups: [], thanks: [] };
      if (head[1] === 'Unreleased') unreleased = current;
      else releases.push(current);
      // The first version lists what it has, with no heading.
      section = 'Added';
      continue;
    }
    if (!current) continue;
    const sub = line.match(/^### (.+)/);
    if (sub) {
      section = sub[1].trim();
      continue;
    }
    if (line.startsWith('- ')) {
      const text = line.slice(2).trim();
      if (section === 'Thanks') {
        const who = text.match(/^\[@([\w-]+)\]\([^)]+\)\s*(.*)$/);
        if (who) current.thanks.push({ login: who[1], html: inline(who[2]) });
        continue;
      }
      const kind = KINDS[section];
      if (!kind) continue;
      let group = current.groups.find((g) => g.kind === kind.kind);
      if (!group) current.groups.push((group = { ...kind, items: [] }));
      group.items.push(inline(text));
      continue;
    }
    if (
      line.trim() &&
      !line.startsWith('[') &&
      !line.startsWith('#') &&
      !current.summary &&
      section === 'Added' &&
      !current.groups.length
    )
      current.summary = inline(line.trim());
  }
  return { unreleased, releases };
}

const parsed = parse(source);

/** What's live on baipix.app but not in a version yet. */
export const comingNext: Release | undefined =
  parsed.unreleased && (parsed.unreleased.groups.length || parsed.unreleased.thanks.length)
    ? parsed.unreleased
    : undefined;

/** Every version, newest first. */
export const releases: Release[] = parsed.releases;

/** The versions by minor version (0.8, 0.7…), newest first. */
export const series: Series[] = releases.reduce<Series[]>((all, release) => {
  const name = release.version.split('.').slice(0, 2).join('.');
  const last = all.at(-1);
  if (last?.name === name) last.releases.push(release);
  else all.push({ name, releases: [release] });
  return all;
}, []);

/** The anchor of a version on the page: its number, as in /changelog/#0.8.0. */
export const anchor = (version: string) => version;

/** A date as the site writes it: November 6, 2026. */
export const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
