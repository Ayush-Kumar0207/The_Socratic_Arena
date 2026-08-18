import { test, expect } from '@playwright/test';

test('commercial preview shows regional pricing, usage, and server-gated Pro tools', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Practice reasoning, not just answers.' })).toBeVisible();
  await expect(page.getByText('₹2,870')).toBeVisible();
  await page.getByLabel('Billing region').selectOption('US');
  await expect(page.getByText('$57.50')).toBeVisible();
  await expect(page.getByText('Human debate stays free')).toBeVisible();

  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Plan & usage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plus' })).toBeVisible();
  await expect(page.getByText('43/600')).toBeVisible();

  await page.goto('/pro-studio');
  await expect(page.getByRole('heading', { name: 'Pro Studio' })).toBeVisible();
  await expect(page.getByText('Reasoning progression')).toBeVisible();
  await page.getByRole('button', { name: 'Mentor' }).click();
  await expect(page.getByText('Socratic Mentor is in Premium')).toBeVisible();
  await page.getByRole('button', { name: 'Evidence Vault' }).click();
  await page.getByPlaceholder('Collection name').fill('Policy research');
  await page.getByPlaceholder('Purpose or topic').fill('Private launch research');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Policy research')).toBeVisible();
});
