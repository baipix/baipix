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

test.describe('on a phone', () => {
  test.use({ hasTouch: true, locale: 'en-US', viewport: { width: 375, height: 812 } });

  test('the toolbar fits, and its sheets give every tool and the colors', async ({ page }) => {
    await createNewFile(page);

    const toolbar = page.locator('.mobile-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(page.locator('.toolbar')).toBeHidden();
    // Nothing to scroll: the whole bar is on screen.
    const box = (await toolbar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    // A tool from the sheet takes the last place on the bar.
    await toolbar.getByRole('button', { name: 'All tools' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Tools' });
    await sheet.getByRole('button', { name: 'Spray' }).tap();
    await expect(sheet).toBeHidden();
    await expect(toolbar.getByRole('button', { name: 'Spray' })).toHaveAttribute('aria-pressed', 'true');
    await toolbar.getByRole('button', { name: 'Eraser' }).tap();
    await expect(toolbar.getByRole('button', { name: 'Spray' })).toHaveAttribute('aria-pressed', 'false');

    // A color from the sheet becomes the one drawn with, and the sheet closes.
    await toolbar.getByRole('button', { name: 'Colors' }).tap();
    const colors = page.getByRole('dialog', { name: 'Colors' });
    const swatch = colors.locator('.mobile-swatch').nth(3);
    const color = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    await swatch.tap();
    await expect(colors).toBeHidden();
    await expect(toolbar.locator('.mobile-chip.is-primary')).toHaveCSS('background-color', color);
  });

  test("a submenu takes its menu's place, with a way back", async ({ page }) => {
    await createNewFile(page);

    await page.locator('.mobile-bar').getByRole('button', { name: 'Main menu' }).tap();
    const menu = page.locator('.menu');
    await expect(menu.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible();

    await menu.getByRole('menuitem', { name: 'File', exact: true }).tap();
    // One menu, showing File's items under its name.
    await expect(menu).toHaveCount(1);
    await expect(menu.getByRole('menuitem', { name: 'New file…' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit', exact: true })).toBeHidden();

    await menu.getByRole('button', { name: 'File', exact: true }).tap();
    await expect(menu.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible();
  });
});

test.describe('on a phone, the file', () => {
  test.use({ hasTouch: true, locale: 'en-US', viewport: { width: 375, height: 812 } });

  test('is renamed from the top bar', async ({ page }) => {
    await createNewFile(page);

    const bar = page.locator('.mobile-bar');
    await bar.locator('.mobile-name').tap();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).tap();

    const field = bar.getByRole('textbox', { name: 'File name' });
    await expect(field).toBeFocused();
    await field.fill('Robot');
    await field.press('Enter');

    await expect(bar.locator('.mobile-name')).toContainText('Robot');
  });
});
