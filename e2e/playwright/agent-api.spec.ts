import { expect, test } from '@playwright/test';
import type { AgentApi } from '../../src/agent/api';

declare global {
  interface Window {
    baipix?: AgentApi;
  }
}

test('an agent draws through window.baipix and the editor shows it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-welcome-actions')).toBeVisible();

  const result = await page.evaluate(() => {
    const api = window.baipix!;
    api.newFile(16, 16, 'Agent drawing');
    api.rect(2, 2, 12, 12, { color: '#222034', options: { filled: true } });
    api.stroke(
      [
        [4, 8],
        [11, 8],
      ],
      { tool: 'pencil', color: '#df7126' },
    );
    return { state: api.state(), pixel: api.pixel(6, 8), png: api.png(4) };
  });

  // Creating the file left the home screen for the editor, as the Create button does.
  await expect(page.locator('canvas.canvas')).toBeVisible();
  await expect(page.locator('.home-welcome-actions')).toBeHidden();
  expect(result.state).toMatchObject({ file: 'Agent drawing', width: 16, height: 16, canUndo: true });
  expect(result.pixel).toBe('#df7126');
  expect(result.png).toMatch(/^data:image\/png;base64,/);

  // The undo the person sees in the menu is the agent's too.
  const afterUndo = await page.evaluate(() => {
    window.baipix!.undo();
    return window.baipix!.pixel(6, 8);
  });
  expect(afterUndo).toBe('#222034');
});
