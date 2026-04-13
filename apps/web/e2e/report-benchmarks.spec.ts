import { expect, test } from '@playwright/test';

test.describe('report benchmark visuals', () => {
  test('operations draft editor benchmark stays stable', async ({ page }) => {
    await page.goto('/reports/benchmarks');
    await page.setViewportSize({ width: 1680, height: 1200 });
    await page.locator('.report-benchmarks-block').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.report-benchmarks-block').first()).toHaveScreenshot('operations-draft-benchmark.png');
  });

  test('workspace final preview benchmark stays stable', async ({ page }) => {
    await page.goto('/reports/benchmarks');
    await page.setViewportSize({ width: 1680, height: 1400 });
    await page.locator('.report-benchmarks-block').nth(1).scrollIntoViewIfNeeded();
    await expect(page.locator('.report-benchmarks-block').nth(1)).toHaveScreenshot('workspace-final-benchmark.png');
  });

  test('homepage featured report benchmark stays stable', async ({ page }) => {
    await page.goto('/reports/benchmarks');
    await page.setViewportSize({ width: 1720, height: 1500 });
    await page.locator('.report-benchmarks-block').nth(2).scrollIntoViewIfNeeded();
    await expect(page.locator('.report-benchmarks-block').nth(2)).toHaveScreenshot('homepage-featured-report-benchmark.png');
  });

  test('homepage featured report editor benchmark stays stable', async ({ page }) => {
    await page.goto('/reports/benchmarks');
    await page.setViewportSize({ width: 1720, height: 1680 });
    await page.locator('.report-benchmarks-block').nth(2).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '手动编辑' }).click();
    await expect(page.locator('.report-benchmarks-block').nth(2)).toHaveScreenshot('homepage-featured-report-editor-benchmark.png');
  });
});
