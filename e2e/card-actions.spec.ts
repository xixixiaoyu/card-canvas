import { expect, test } from '@playwright/test'

test('edits, deletes and undoes card actions', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const first = page.locator('[data-world-item]').first()
  const originalTitle = (await first.locator('h2').textContent())?.trim()
  expect(originalTitle).toBeTruthy()

  await first.hover()
  await first.getByRole('button', { name: '编辑卡片' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const titleInput = page.getByLabel('卡片标题')
  await expect(titleInput).toHaveValue(originalTitle!)

  await titleInput.fill('E2E 编辑后的标题')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const edited = page
    .locator('[data-world-item]')
    .filter({ hasText: 'E2E 编辑后的标题' })
  await expect(edited).toHaveCount(1)

  await page.keyboard.press('Control+z')
  await expect(
    page.locator('[data-world-item]').filter({ hasText: originalTitle! }),
  ).toHaveCount(1)

  await page.keyboard.press('Control+Shift+z')
  await expect(edited).toHaveCount(1)

  await edited.hover()
  await edited.getByRole('button', { name: '删除卡片' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(2)

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: 'E2E 编辑后的标题' }),
  ).toHaveCount(1)
})
