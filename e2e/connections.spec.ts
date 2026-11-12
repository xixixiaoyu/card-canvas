import { expect, test, type Page } from '@playwright/test'

async function lineMidpoint(page: Page) {
  return page.evaluate(() => {
    const path = document.querySelector('[data-line]')
    if (!path) return null

    const point = (path as SVGPathElement).getPointAtLength(
      (path as SVGPathElement).getTotalLength() / 2,
    )
    const matrix = (path as SVGPathElement).getScreenCTM()
    if (!matrix) return null

    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    }
  })
}

async function dragHandleToCard(page: Page, sourceIndex: number) {
  const cards = page.locator('[data-world-item]')
  const source = cards.nth(sourceIndex)
  const target = cards.nth(sourceIndex === 0 ? 1 : 0)

  await source.locator('h2').click()
  await expect(source.locator('.link-handle')).toHaveCSS('opacity', '1')

  const handle = await source.locator('.link-handle').boundingBox()
  const targetBox = await target.boundingBox()
  expect(handle).not.toBeNull()
  expect(targetBox).not.toBeNull()

  const sx = handle!.x + handle!.width / 2
  const sy = handle!.y + handle!.height / 2
  const tx = targetBox!.x + targetBox!.width / 2
  const ty = targetBox!.y + targetBox!.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      sx + ((tx - sx) * step) / 12,
      sy + ((ty - sy) * step) / 12,
    )
  }

  await expect(page.locator('.connection-draft')).toHaveCount(1)
  await expect(page.locator('.connection-snap-ring')).toHaveCount(1)
  await page.mouse.up()
}

async function endpointDrift(page: Page, cardIndex: number) {
  const card = page.locator('[data-world-item]').nth(cardIndex)
  const box = await card.boundingBox()
  const start = await page.evaluate(() => {
    const path = document.querySelector('[data-line]')
    if (!path) return null

    const matrix = new DOMMatrix(
      getComputedStyle(document.querySelector('.canvas-world') as Element)
        .transform,
    )
    const match = path.getAttribute('d')?.match(/^M ([-\d.]+) ([-\d.]+)/)
    if (!match) return null

    const x = Number(match[1])
    const y = Number(match[2])
    return {
      x: matrix.e + x * matrix.a,
      y: matrix.f + y * matrix.a,
    }
  })

  if (!box || !start) return null

  const edges = [
    { x: box.x, y: box.y + box.height / 2 },
    { x: box.x + box.width, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2, y: box.y },
    { x: box.x + box.width / 2, y: box.y + box.height },
  ]

  return Math.min(
    ...edges.map((edge) => Math.hypot(edge.x - start.x, edge.y - start.y)),
  )
}

test('creates, labels, persists, deletes and cascades a connection', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('[data-line]')).toHaveCount(0)

  const visibleHandles = await page.evaluate(
    () =>
      [...document.querySelectorAll('.link-handle')].filter(
        (element) => getComputedStyle(element).opacity !== '0',
      ).length,
  )
  expect(visibleHandles).toBe(0)

  await dragHandleToCard(page, 0)
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(page.locator('.connection-line.is-selected')).toHaveCount(1)

  const point = await lineMidpoint(page)
  expect(point).not.toBeNull()
  await page.mouse.dblclick(point!.x, point!.y)

  const labelInput = page.locator('.connection-label-input')
  await expect(labelInput).toBeVisible()
  await labelInput.fill('底层神经机制相同')
  await page.keyboard.press('Enter')
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '底层神经机制相同',
  )

  await page.reload()
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '底层神经机制相同',
  )

  const reloadedPoint = await lineMidpoint(page)
  expect(reloadedPoint).not.toBeNull()
  await page.mouse.click(reloadedPoint!.x, reloadedPoint!.y)
  await expect(page.locator('.connection-line.is-selected')).toHaveCount(1)

  await page.keyboard.press('Enter')
  await expect(page.locator('.connection-label-input')).toBeVisible()
  await page.locator('.connection-label-input').press('Escape')
  await expect(page.locator('.connection-label-input')).toHaveCount(0)

  await page.keyboard.press('Delete')
  await expect(page.locator('[data-line]')).toHaveCount(0)
  const undoButton = page.locator('button[aria-label="撤销"]')
  const redoButton = page.locator('button[aria-label="重做"]')
  await expect(undoButton).toBeEnabled()
  await expect(undoButton).toHaveAttribute('title', /删除连线/)

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(redoButton).toBeEnabled()
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '底层神经机制相同',
  )

  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('[data-line]')).toHaveCount(0)
  await expect(undoButton).toHaveAttribute('title', /删除连线/)

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(redoButton).toBeEnabled()

  const card = page.locator('[data-world-item]').nth(0)
  await card.hover()
  await card.getByRole('button', { name: '删除卡片' }).click()
  await page.locator('[data-delete-card-dialog] [data-delete-card-all]').click()
  await expect(page.locator('[data-world-item]')).toHaveCount(2)
  await expect(page.locator('[data-line]')).toHaveCount(0)
  await expect(undoButton).toHaveAttribute('title', /删除卡片/)

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '底层神经机制相同',
  )
})

test('keeps endpoints docked while dragging at 30% and 250%', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await dragHandleToCard(page, 0)
  await expect(page.locator('[data-line]')).toHaveCount(1)

  const zoomButton = page.locator('[aria-label^="当前缩放"]')
  const zoomOut = page.getByRole('button', { name: '缩小画布' })
  const percent = async () =>
    Number.parseInt((await zoomButton.textContent())!, 10)

  const dragCardBy = async (dx: number, dy: number) => {
    const card = page.locator('[data-world-item]').nth(0)
    const title = await card.locator('h2').boundingBox()
    const sx = Math.min(Math.max(title!.x + 25, 20), 1200)
    const sy = Math.min(Math.max(title!.y + 12, 20), 820)

    await page.mouse.move(sx, sy)
    await page.mouse.down()
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(sx + (dx * step) / 8, sy + (dy * step) / 8)
    }
    await expect
      .poll(async () => endpointDrift(page, 0), { timeout: 5_000 })
      .toBeLessThan(1.5)
    await page.mouse.up()
  }

  await zoomButton.click()
  await page.waitForTimeout(650)
  let guard = 0
  while ((await percent()) > 32 && guard < 20) {
    await zoomOut.click()
    await page.waitForTimeout(100)
    guard += 1
  }
  await dragCardBy(60, 30)

  await page.locator('[aria-label="居中全部卡片"]').click()
  await page.waitForTimeout(800)

  // Anchor the title under the cursor while zooming deep.
  const title = await page
    .locator('[data-world-item]')
    .nth(0)
    .locator('h2')
    .boundingBox()
  const anchor = {
    x: Math.min(Math.max(title!.x + 25, 30), 1200),
    y: Math.min(Math.max(title!.y + 12, 30), 820),
  }
  for (let step = 0; step < 9; step += 1) {
    await page.evaluate(({ x, y }) => {
      document.querySelector('.canvas-stage')?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          ctrlKey: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, anchor)
    await page.waitForTimeout(480)
  }
  await expect
    .poll(async () => percent(), { timeout: 5_000 })
    .toBeGreaterThan(230)

  await dragCardBy(40, 20)
  await expect(page.locator('[data-line]')).toHaveCount(1)
})
