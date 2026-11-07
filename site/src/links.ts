/** The editor is deployed next to the site, under /app/ (relative to the site's base path). */
export const APP_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}app/`;
/** The design system page, built with the editor: tokens, components, and the logo to download. */
export const DESIGN_URL = `${APP_URL}design.html`;
export const REPO_URL = 'https://github.com/baipix/baipix';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
/** Baipix on Wikidata, for search engines and AI tools to tie the site, the repo and the item together. */
export const WIKIDATA_URL = 'https://www.wikidata.org/wiki/Q142070866';
/** Baipix on Bluesky, as @baipix.app. */
export const BLUESKY_URL = 'https://bsky.app/profile/baipix.app';
