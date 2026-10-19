/**
 * Cloudflare Web Analytics on baipix.app, the site and the editor: page views only, no cookies,
 * nothing about the drawings. Opening any page with `?notrack` stops it for this browser (for us,
 * so our own visits don't count, or for anyone who'd rather not be counted); `?track` resumes it.
 * The choice is kept in localStorage, shared by the site and the editor (same origin).
 */
const TOKEN = 'c751710cc6a54b69a0442aec83131356';

/** An inline script that loads the beacon, unless this browser opted out. */
export const ANALYTICS_SNIPPET = `(() => {
  const key = 'baipix-notrack';
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('notrack')) localStorage.setItem(key, '1');
    if (params.has('track')) localStorage.removeItem(key);
    if (localStorage.getItem(key)) return;
  } catch {}
  const beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.dataset.cfBeacon = JSON.stringify({ token: '${TOKEN}' });
  document.head.appendChild(beacon);
})();`;
