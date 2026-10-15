import appCss from '../ui/styles/app.css?raw';
import tokensCss from '../ui/styles/tokens.css?raw';

export interface Token {
  name: string;
  value: string;
  group: string;
  kind: 'color' | 'shadow' | 'other';
}

/**
 * Reads the design tokens straight from the stylesheets, so this page can't drift from them: every
 * custom property set in a top-level `:root { … }` block, grouped by the comment above it.
 */
function parse(css: string, fallbackGroup: string): Token[] {
  const tokens: Token[] = [];
  for (const block of css.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)) {
    let group = fallbackGroup;
    let blank = true;
    // Declarations can span lines (shadows): join each one before reading it.
    const lines = block[1].replace(/,\n\s+/g, ', ').split('\n');
    for (const line of lines) {
      const comment = line.match(/^\s*\/\*\s*(.+?)\s*\*\//);
      // A comment after a blank line names the group of the tokens below it; others describe a token.
      if (comment && blank) group = comment[1].split(/[:.]/)[0];
      blank = !line.trim();
      const decl = line.match(/--([\w-]+):\s*([^;]+);/);
      if (!decl) continue;
      const value = decl[2].replace(/\s+/g, ' ').trim();
      const kind =
        /\dpx/.test(value) && /rgba|light-dark/.test(value)
          ? 'shadow'
          : /^(#|rgb|light-dark\()/.test(value)
            ? 'color'
            : 'other';
      tokens.push({ name: `--${decl[1]}`, value, group, kind });
    }
  }
  return tokens;
}

export const TOKENS: Token[] = [...parse(tokensCss, 'Tokens'), ...parse(appCss, 'Accent')].filter(
  (t, i, all) => all.findIndex((x) => x.name === t.name) === i,
);
