import { expect, test } from '@playwright/test';
import { createNewFile } from './helpers';

test('opens the editor home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Baipix editor/i);

  const createButton = page
    .locator('.home-welcome-actions')
    .getByRole('button', { name: 'Create', exact: true });

  await expect(createButton).toBeVisible();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, locale: 'en-US' });

  test('tools, icon buttons, rows and menu rows are big enough for a finger', async ({ page }) => {
    await createNewFile(page);

    const height = async (selector: string) => (await page.locator(selector).first().boundingBox())!.height;
    expect(await height('.toolbar .tool-btn')).toBe(44);
    expect(await height('.panel-left .icon-btn')).toBe(44);
    expect(await height('.panel-left .item')).toBe(44);

    await page
      .getByRole('menubar', { name: 'Main menu' })
      .getByRole('menuitem', { name: 'Layer', exact: true })
      .click();
    expect(await height('.menu .menu-item')).toBe(44);
    // The bars over the toolbar move up with it: nothing sits on the tools.
    const toolbar = (await page.locator('.toolbar').boundingBox())!;
    const options = (await page.locator('.tool-options').boundingBox())!;
    expect(options.y + options.height).toBeLessThanOrEqual(toolbar.y);
  });
});
