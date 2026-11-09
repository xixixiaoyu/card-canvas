import { expect, test } from '@playwright/test'

test('connections synchronize across tabs', async ({ context }) => {
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  await pageA.goto('/')
  await pageB.goto('/')
  await expect(pageA.locator('[data-world-item]')).toHaveCount(3)
  await expect(pageB.locator('[data-world-item]')).toHaveCount(3)
  await expect(pageA.locator('[data-line]')).toHaveCount(0)

  const cardsA = pageA.locator('[data-world-item]')
  const source = cardsA.nth(0)
  const target = cardsA.nth(1)
  await source.locator('h2').click()
  const handle = await source.locator('.link-handle').boundingBox()
  const targetBox = await target.boundingBox()

  const sx = handle!.x + handle!.width / 2
  const sy = handle!.y + handle!.height / 2
  const tx = targetBox!.x + targetBox!.width / 2
  const ty = targetBox!.y + targetBox!.height / 2

  await pageA.mouse.move(sx, sy)
  await pageA.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await pageA.mouse.move(
      sx + ((tx - sx) * step) / 10,
      sy + ((ty - sy) * step) / 10,
    )
  }
  await pageA.mouse.up()

  await expect(pageA.locator('[data-line]')).toHaveCount(1)
  await expect
    .poll(async () => pageB.locator('[data-line]').count(), { timeout: 5_000 })
    .toBe(1)

  const point = await pageB.evaluate(() => {
    const path = document.querySelector('[data-line]') as SVGPathElement | null
    if (!path) return null

    const at = path.getPointAtLength(path.getTotalLength() / 2)
    const matrix = path.getScreenCTM()
    if (!matrix) return null

    return {
      x: matrix.a * at.x + matrix.c * at.y + matrix.e,
      y: matrix.b * at.x + matrix.d * at.y + matrix.f,
    }
  })
  expect(point).not.toBeNull()

  await pageB.mouse.click(point!.x, point!.y)
  await pageB.keyboard.press('Delete')
  await expect(pageB.locator('[data-line]')).toHaveCount(0)
  await expect
    .poll(async () => pageA.locator('[data-line]').count(), { timeout: 5_000 })
    .toBe(0)
})
