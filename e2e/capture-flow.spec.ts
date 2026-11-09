import { expect, test } from '@playwright/test'

test('capture, inbox and drop survive a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.getByLabel('卡片标题').fill('E2E 速记')
  await page.getByLabel('卡片正文').fill('从 1D 捕获进入 2D 画布。')
  await page.getByLabel('添加标签').fill('E2E')
  await page.getByLabel('添加标签').press('Enter')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  const inboxButton = page.locator('button[aria-label^="待整理池，"]')
  await expect(inboxButton).toContainText('1')

  await inboxButton.click()
  const drawer = page.locator('#inbox-shelf')
  await expect(drawer).toBeVisible()
  const drawerCard = drawer.locator('[data-inbox-card]').filter({ hasText: 'E2E 速记' })
  await expect(drawerCard).toHaveCount(1)

  const source = await drawerCard.boundingBox()
  expect(source).not.toBeNull()
  const drop = { x: 420, y: 380 }

  await page.mouse.move(source!.x + 60, source!.y + 30)
  await page.mouse.down()
  await page.mouse.move(source!.x - 20, source!.y + 30, { steps: 4 })
  await page.mouse.move(drop.x, drop.y, { steps: 10 })
  await page.mouse.up()

  const placed = page.locator('[data-world-item]').filter({ hasText: 'E2E 速记' })
  await expect(placed).toHaveCount(1)
  await expect(inboxButton).toContainText('0')

  const box = await placed.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.x + box!.width / 2 - drop.x)).toBeLessThan(1.5)
  expect(Math.abs(box!.y + box!.height / 2 - drop.y)).toBeLessThan(1.5)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(page.locator('button[aria-label^="待整理池，"]')).toContainText('0')
})
