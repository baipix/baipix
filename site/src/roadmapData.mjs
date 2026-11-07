/**
 * The roadmap from the repo's milestones on GitHub: each one's version, name, description, progress
 * and its open issues, the most telling first. Plain JavaScript, so both the site's build (../roadmap.ts) and
 * `npm run roadmap` (which saves roadmap.json, the copy used when GitHub can't be reached) use it.
 */
const REPO = 'baipix/baipix';
const API = `https://api.github.com/repos/${REPO}`;

async function get(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'baipix-site',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

/** "v0.10 · Share and brand work" → { version: '0.10', name: 'Share and brand work' }; "Later" has no version. */
function split(title) {
  const m = title.match(/^v(\d+(?:\.\d+)*)\s*·\s*(.+)$/);
  return m ? { version: m[1], name: m[2] } : { version: null, name: title };
}

const order = (v) => (v ? v.split('.').map(Number) : [Infinity]);
function byVersion(a, b) {
  const [x, y] = [order(a.version), order(b.version)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Epics first, then the bigger issues, then the oldest. */
function rank(issue) {
  const labels = issue.labels.map((l) => l.name);
  return (
    (labels.includes('epic') ? 0 : 10) +
    (labels.includes('size: large') ? 0 : labels.includes('size: medium') ? 1 : 2)
  );
}

export async function fetchRoadmap(token) {
  const milestones = await get('/milestones?state=all&per_page=100', token);
  const all = milestones
    .map((m) => ({
      ...split(m.title),
      title: m.title,
      description: m.description ?? '',
      open: m.open_issues,
      closed: m.closed_issues,
      done: m.state === 'closed',
      url: m.html_url,
      number: m.number,
    }))
    // Fix releases (v0.3.1) are part of their version's story, not a stop of their own.
    .filter((m) => !m.version || m.version.split('.').length === 2)
    .sort(byVersion);
  const ahead = all.filter((m) => !m.done);
  for (const m of ahead) {
    const issues = (await get(`/issues?milestone=${m.number}&state=open&per_page=100`, token)).filter(
      (i) => !i.pull_request,
    );
    m.issues = issues
      .sort((a, b) => rank(a) - rank(b) || a.number - b.number)
      .map((i) => ({ number: i.number, title: i.title, url: i.html_url }));
    m.firstIssues = issues.filter((i) => i.labels.some((l) => l.name === 'good first issue')).length;
  }
  return {
    past: all.filter((m) => m.done).map(({ version, name, title }) => ({ version, name, title })),
    ahead: ahead.map(({ number, ...m }) => m),
  };
}
