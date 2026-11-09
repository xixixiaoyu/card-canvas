import { expect, test } from '@playwright/test'

test('capture lands directly on the canvas and survives reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.getByLabel('卡片标题').fill('E2E 速记')
  await page.getByLabel('卡片正文').fill('捕获即上板，不再经过待整理池。')
  await page.getByLabel('添加标签').fill('E2E')
  await page.getByLabel('添加标签').press('Enter')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const placed = page
    .locator('[data-world-item]')
    .filter({ hasText: 'E2E 速记' })
  await expect(placed).toHaveCount(1)
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(placed).toHaveClass(/is-selected/)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: 'E2E 速记' }),
  ).toHaveCount(1)
})

test('new captures land beside the selected card', async ({ page }) => {
  await page.setViewportSize({ width: 1764, height: 965 })
  await page.goto('/')

  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill('落位测试板')
  await menu.getByRole('button', { name: '新建' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  await page.waitForTimeout(350)

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('卡片标题').fill('第一张')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('[data-world-item]')).toHaveCount(1)
  await page.waitForTimeout(350)

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('卡片标题')).toHaveValue('')
  await page.getByLabel('卡片标题').fill('第二张')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(2)
  await page.waitForTimeout(600)

  const first = await page
    .locator('[data-world-item]')
    .filter({ hasText: '第一张' })
    .boundingBox()
  const second = await page
    .locator('[data-world-item]')
    .filter({ hasText: '第二张' })
    .boundingBox()

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.x).toBeGreaterThan(first!.x + first!.width + 8)
  expect(second!.x - (first!.x + first!.width)).toBeLessThan(120)
})
