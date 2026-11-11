import { expect, test } from '@playwright/test'

test('edits, deletes and undoes card actions', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const first = page.locator('[data-world-item]').first()
  const originalTitle = (await first.locator('h2').textContent())?.trim()
  expect(originalTitle).toBeTruthy()
  const undoButton = page.locator('button[aria-label="撤销"]')

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

  await expect(undoButton).toBeEnabled()
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: 'E2E 编辑后的标题' }),
  ).toHaveCount(1)
})

test('double-click edits the card without stealing text selection', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').dblclick()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await card.locator('.atomic-paragraph').dblclick()
  await expect(dialog).toHaveCount(0)
  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString(),
  )
  expect(selectedText?.trim().length).toBeGreaterThan(0)
})

test('a deleted card stays deleted after refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = page.locator('[data-world-item]').first()
  const title = (await card.locator('h2').textContent())?.trim()
  expect(title).toBeTruthy()

  await card.hover()
  await card.getByRole('button', { name: '删除卡片' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(2)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(2)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: title! }),
  ).toHaveCount(0)
})
