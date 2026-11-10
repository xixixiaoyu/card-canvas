import { expect, test } from '@playwright/test'

test('capture traps focus and cards are keyboard movable', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()

  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press('Tab')
  }

  const focusInsideDialog = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('[role="dialog"]')),
  )
  expect(focusInsideDialog).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  const card = page.locator('[data-world-item]').first()
  await card.focus()
  const before = await card.boundingBox()
  expect(before).not.toBeNull()

  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
  const after = await card.boundingBox()
  expect(after).not.toBeNull()
  expect(after!.x - before!.x).toBeGreaterThan(4)
})

test('backup capture shortcut avoids browser-reserved Alt+N', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Alt+n')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.keyboard.press('Shift+N')
  await expect(page.getByRole('dialog')).toBeVisible()
})
