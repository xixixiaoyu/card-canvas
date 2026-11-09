import { expect, test } from '@playwright/test'

test('restores the camera after reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const zoomButton = page.locator('[aria-label^="当前缩放"]')
  await zoomButton.click()
  await page.waitForTimeout(700)

  const zoomIn = page.getByRole('button', { name: '放大画布' })
  await zoomIn.click()
  await page.waitForTimeout(800)
  const percent = (await zoomButton.textContent())?.trim()
  expect(percent).toBeTruthy()

  // Let the 250ms viewport-save debounce flush after the zoom animation.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await expect(page.locator('[aria-label^="当前缩放"]')).toContainText(percent!)
})
