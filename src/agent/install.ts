import type { Editor } from '../engine/editor';
import { renderToCanvas } from '../io/png';
import { leaveHome } from '../ui/home';
import { createAgentApi, type AgentApi } from './api';

declare global {
  interface Window {
    /** The agent API: `baipix.help()` lists what it can do. */
    baipix?: AgentApi;
  }
}

/**
 * Puts the agent API on `window.baipix`, so an agent driving the browser (Playwright, a browser
 * extension, DevTools) can draw with the editor's tools. It shows in the console as one line.
 */
export function installAgentApi(editor: Editor): AgentApi {
  const api = createAgentApi(editor, {
    onOpen: () => leaveHome(editor),
    png: (pixels, width, height, scale) =>
      renderToCanvas(pixels, width, height, {
        pixelSize: scale,
        gap: 0,
        width: width * scale,
        height: height * scale,
      }).toDataURL('image/png'),
  });
  window.baipix = api;
  return api;
}
