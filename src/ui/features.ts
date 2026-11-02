/**
 * Animation stays hidden on baipix.app until it's complete: it ships with the onion skin and the
 * GIF export, in v0.8. It shows while developing, or with `?animation` in the address. Files with
 * frames open either way: only the ways in (Animate, View › Timeline, the shortcuts) are hidden.
 */
export const ANIMATION =
  import.meta.env.DEV ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).has('animation'));
