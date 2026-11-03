import type { APIRoute } from 'astro';
import guide from '../../../docs/AGENT_API.md?raw';
import { APP_URL } from '../links';

/** The editor's address as written in the guide; built for another address, it points there instead. */
const GUIDE_APP_URL = 'https://baipix.app/app/';

/**
 * How an AI agent draws in Baipix through `window.baipix`: point any agent at /agent.md. The text is
 * docs/AGENT_API.md, served as it is, so the guide in the repository and this one never differ.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(guide.replaceAll(GUIDE_APP_URL, new URL(APP_URL, site).href), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
