import { expect, test, type Page } from '@playwright/test'

async function settleAnimationFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

async function dragCardBy(
  page: Page,
  card: ReturnType<Page['locator']>,
  dx: number,
  dy: number,
) {
  const title = await card.locator('h2').boundingBox()
  if (!title) throw new Error('missing card title box')

  const startX = title.x + Math.min(40, title.width / 2)
  const startY = title.y + title.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 })
  await page.mouse.up()
  await settleAnimationFrames(page)
}

async function worldPosition(card: ReturnType<Page['locator']>) {
  return card.evaluate((element) => ({
    x: Number.parseFloat((element as HTMLElement).style.left),
    y: Number.parseFloat((element as HTMLElement).style.top),
  }))
}

test('dragged cards land at the pointer position after refresh', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = page
    .locator('[data-world-item]')
    .filter({ hasText: '声音的支点' })
  const before = await card.boundingBox()
  if (!before) throw new Error('missing card')

  await dragCardBy(page, card, 42, 24)
  await expect
    .poll(async () => {
      const after = await card.boundingBox()
      if (!after) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(after.x - before.x - 42),
        Math.abs(after.y - before.y - 24),
      )
    })
    .toBeLessThan(1.5)

  const zoom = page.locator('[aria-label^="当前缩放"]')
  const initialZoom = Number.parseInt((await zoom.textContent()) ?? '100', 10)
  await page.getByRole('button', { name: '缩小画布' }).click()
  await expect(zoom).toHaveText(`${Math.round(initialZoom * 0.8)}%`)
  await settleAnimationFrames(page)

  const beforeZoomedDrag = await card.boundingBox()
  if (!beforeZoomedDrag) throw new Error('missing zoomed card')
  await dragCardBy(page, card, -28, 20)
  await expect
    .poll(async () => {
      const after = await card.boundingBox()
      if (!after) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(after.x - beforeZoomedDrag.x + 28),
        Math.abs(after.y - beforeZoomedDrag.y - 20),
      )
    })
    .toBeLessThan(1.5)

  const itemId = await card.getAttribute('data-item-id')
  const committed = await worldPosition(card)
  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  const restored = await worldPosition(
    page.locator(`[data-world-item][data-item-id="${itemId}"]`),
  )
  expect(Math.abs(restored.x - committed.x)).toBeLessThan(0.01)
  expect(Math.abs(restored.y - committed.y)).toBeLessThan(0.01)
})

test('space drag pans without changing zoom after using the HUD', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)

  const zoom = page.locator('[aria-label^="当前缩放"]')
  const initialZoom = Number.parseInt((await zoom.textContent()) ?? '100', 10)
  await page.getByRole('button', { name: '缩小画布' }).click()
  await expect(zoom).toHaveText(`${Math.round(initialZoom * 0.8)}%`)
  const zoomAfterClick = await zoom.textContent()
  await settleAnimationFrames(page)

  const card = page.locator('[data-world-item]').first()
  const before = await card.boundingBox()
  const stage = await page.getByLabel('Card Canvas 无限画布').boundingBox()
  if (!before || !stage) throw new Error('missing canvas geometry')

  const startX = stage.x + 56
  const startY = stage.y + stage.height * 0.55
  await page.keyboard.down('Space')
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 72, startY + 36, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await settleAnimationFrames(page)

  await expect(zoom).toHaveText(zoomAfterClick!)
  await expect
    .poll(async () => {
      const after = await card.boundingBox()
      if (!after) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(after.x - before.x - 72),
        Math.abs(after.y - before.y - 36),
      )
    })
    .toBeLessThan(1.5)
})
