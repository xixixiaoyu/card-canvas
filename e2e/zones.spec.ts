import { expect, test, type Page } from '@playwright/test'

async function box(locator: ReturnType<Page['locator']>) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('missing box')
  return value
}

test('selected cards become a persistent zone that can move and dissolve', async ({
  page,
}) => {
  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await expect(cards).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.getByRole('button', { name: '居中全部卡片' }).click()
  await page.waitForTimeout(550)

  await cards.nth(0).locator('h2').click()
  await cards
    .nth(1)
    .locator('h2')
    .click({ modifiers: ['Shift'] })
  await expect(page.locator('.selection-toolbar')).toContainText('2 SELECTED')

  await page.locator('[data-create-zone]').click()
  const dialog = page.locator('[data-zone-dialog]')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('区域名称').fill('心理学')
  await dialog.getByRole('radio', { name: '玫瑰' }).click()
  await dialog.locator('[data-zone-confirm]').click()

  const zone = page.locator('[data-board-zone]')
  await expect(zone).toHaveCount(1)
  await expect(zone).toContainText('心理学')
  await expect(zone).toContainText('2')
  await expect(page.locator('.selection-toolbar')).toHaveCount(0)

  const titleButton = zone.locator('button[title^="重命名区域"]')
  await titleButton.click()
  const titleInput = zone.getByLabel('区域名称')
  await titleInput.fill('自我和解')
  await titleInput.press('Enter')
  await expect(zone).toContainText('自我和解')

  const before = {
    first: await box(cards.nth(0)),
    second: await box(cards.nth(1)),
    zone: await box(zone),
  }
  const handle = await box(zone.locator('[data-zone-drag-handle]'))
  const start = {
    x: handle.x + 12,
    y: handle.y + handle.height / 2,
  }
  const delta = { x: 56, y: 34 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      start.x + (delta.x * step) / 10,
      start.y + (delta.y * step) / 10,
    )
  }
  await page.mouse.up()
  await page.waitForTimeout(250)

  const moved = {
    first: await box(cards.nth(0)),
    second: await box(cards.nth(1)),
    zone: await box(zone),
  }
  for (const key of ['first', 'second', 'zone'] as const) {
    expect(Math.abs(moved[key].x - before[key].x - delta.x)).toBeLessThan(2)
    expect(Math.abs(moved[key].y - before[key].y - delta.y)).toBeLessThan(2)
  }

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(250)
  const restored = {
    first: await box(cards.nth(0)),
    second: await box(cards.nth(1)),
    zone: await box(zone),
  }
  for (const key of ['first', 'second', 'zone'] as const) {
    expect(restored[key].x).toBeCloseTo(before[key].x, 0)
    expect(restored[key].y).toBeCloseTo(before[key].y, 0)
  }

  await page.reload()
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await expect(cards).toHaveCount(3)
  const reloadedZone = page.locator('[data-board-zone]')
  await expect(reloadedZone).toHaveCount(1)
  await expect(reloadedZone).toContainText('自我和解')

  await reloadedZone.getByRole('button', { name: '解散区域' }).click()
  await expect(reloadedZone).toHaveCount(0)
  await expect(cards).toHaveCount(3)

  await page.locator('header button[aria-label="撤销"]').first().click()
  await expect(page.locator('[data-board-zone]')).toHaveCount(1)
  await expect(page.locator('[data-board-zone]')).toContainText('自我和解')
})

test('zone toolbar and dialog stay inside a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 800 })
  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await expect(cards).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.getByRole('button', { name: '居中全部卡片' }).click()
  await page.waitForTimeout(550)

  await cards.nth(0).locator('h2').click()
  await cards
    .nth(1)
    .locator('h2')
    .click({ modifiers: ['Shift'] })
  const toolbar = page.locator('.selection-toolbar')
  await expect(toolbar).toBeVisible()
  const toolbarBox = await box(toolbar)
  expect(toolbarBox.x).toBeGreaterThanOrEqual(0)
  expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(500)

  await page.locator('[data-create-zone]').click()
  const dialogBox = await box(page.locator('[data-zone-dialog]'))
  expect(dialogBox.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(500)
})
