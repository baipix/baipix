import { expect, test } from '@playwright/test';

test('opens the editor home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Baipix editor/i);

  const createButton = page
    .locator('.home-welcome-actions')
    .getByRole('button', { name: 'Create', exact: true });

  await expect(createButton).toBeVisible();
});
