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

  const box = await placed.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()

  // The capture lands in a visible empty slot, not under another card.
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)

  const overlapArea = await page.evaluate(() => {
    const selected = document.querySelector('[data-world-item].is-selected')
    if (!selected) return -1
    const a = selected.getBoundingClientRect()

    return [...document.querySelectorAll('[data-world-item]')]
      .filter((element) => element !== selected)
      .reduce((total, element) => {
        const b = element.getBoundingClientRect()
        return (
          total +
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
        )
      }, 0)
  })
  expect(overlapArea).toBeLessThan(box!.width * box!.height * 0.35)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: 'E2E 速记' }),
  ).toHaveCount(1)
})
