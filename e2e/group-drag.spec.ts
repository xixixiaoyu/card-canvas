import { expect, test, type Page } from '@playwright/test'

async function dragBox(
  page: Page,
  locator: ReturnType<Page['locator']>,
  dx: number,
  dy: number,
  mode: 'title' | 'edge' = 'title',
) {
  const surface = await locator.boundingBox()
  const title = await locator.locator('h2').boundingBox()
  const sx = mode === 'title' ? title!.x + 30 : surface!.x + 16
  const sy =
    mode === 'title'
      ? title!.y + title!.height * 0.8
      : surface!.y + surface!.height * 0.3
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(sx + (dx * step) / 10, sy + (dy * step) / 10)
  }
  await settleAnimationFrames(page)
}

async function box(locator: ReturnType<Page['locator']>) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('missing box')
  return value
}

async function settleAnimationFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

async function rigidTransformError(page: Page, includeY = false) {
  return page
    .locator('[data-world-item].is-selected')
    .evaluateAll((elements, withY) => {
      const translations = elements.map((element) => {
        const match = (element as HTMLElement).style.transform.match(
          /translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px,/,
        )
        return match
          ? { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) }
          : null
      })
      if (
        translations.length < 2 ||
        translations.some((translation) => !translation)
      ) {
        return Number.POSITIVE_INFINITY
      }

      const first = translations[0]!
      return Math.max(
        ...translations.map((translation) =>
          withY
            ? Math.max(
                Math.abs(translation!.x - first.x),
                Math.abs(translation!.y - first.y),
              )
            : Math.abs(translation!.x - first.x),
        ),
      )
    }, includeY)
}

async function largestVisibleSelectedIndex(page: Page) {
  const boxes = await page
    .locator('[data-world-item]')
    .evaluateAll((elements) =>
      elements.map((element, index) => {
        const rect = element.getBoundingClientRect()
        const title = element.querySelector('h2')?.getBoundingClientRect()
        const clickX = title ? title.x + Math.min(30, title.width - 1) : -1
        const clickY = title ? title.y + title.height * 0.8 : -1
        return {
          index,
          selected: element.classList.contains('is-selected'),
          area: rect.width * rect.height,
          visible:
            clickX > 10 &&
            clickX < window.innerWidth - 10 &&
            clickY > 70 &&
            clickY < window.innerHeight - 60 &&
            rect.width > 120 &&
            rect.height > 120,
        }
      }),
    )
  const visible = boxes
    .filter((entry) => entry.selected && entry.visible)
    .sort((a, b) => b.area - a.area)
  if (!visible[0]) throw new Error('no visible selected card')
  return visible[0].index
}

async function connect(
  page: Page,
  source: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>,
  targetPoint?: { x: number; y: number },
) {
  const before = await page.locator('[data-line]').count()
  await source.locator('h2').click()
  const handle = await source.locator('.link-handle').boundingBox()
  const targetBox = await target.boundingBox()

  const sx = handle!.x + handle!.width / 2
  const sy = handle!.y + handle!.height / 2
  const tx = targetPoint?.x ?? targetBox!.x + targetBox!.width / 2
  const ty = targetPoint?.y ?? targetBox!.y + targetBox!.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      sx + ((tx - sx) * step) / 10,
      sy + ((ty - sy) * step) / 10,
    )
  }
  await page.mouse.up()
  await expect(page.locator('[data-line]')).toHaveCount(before + 1)
}

async function zoomTo(page: Page, target: number, direction: 'in' | 'out') {
  const zoomButton = page.locator('[aria-label^="当前缩放"]')
  const action = page.getByRole('button', {
    name: direction === 'in' ? '放大画布' : '缩小画布',
  })
  await zoomButton.click()
  await page.waitForTimeout(300)
  let guard = 0
  while (
    (direction === 'in'
      ? Number.parseInt((await zoomButton.textContent()) ?? '100', 10) < target
      : Number.parseInt((await zoomButton.textContent()) ?? '100', 10) >
        target) &&
    guard < 12
  ) {
    await action.click()
    await page.waitForTimeout(100)
    guard += 1
  }
}

test('selected cluster drags as a rigid body, follows wires and undoes once', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  // Create an unselected external card so one wire has a stationary endpoint.
  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill('外部参照卡')
  await page.getByLabel('卡片正文').fill('我不参与本次刚体拖拽。')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await page.waitForTimeout(500)

  const cards = page.locator('[data-world-item]')
  const first = cards.filter({ hasText: '声音的支点' })
  const second = cards.filter({ hasText: '边界不是墙' })
  const third = cards.filter({ hasText: '先让气息落下' })
  const external = cards.filter({ hasText: '外部参照卡' })

  await connect(page, first, second)
  const externalBox = await box(external)
  await connect(page, second, external, {
    x: externalBox.x + externalBox.width - 24,
    y: externalBox.y + externalBox.height / 2,
  })

  // Select the three seed cards, leaving the external card out.
  await first.locator('h2').click()
  await second.locator('h2').click({ modifiers: ['Shift'] })
  await third.locator('h2').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)
  await expect(page.locator('.selection-toolbar')).toContainText('3 SELECTED')

  const externalId = await external.getAttribute('data-card-id')
  const externalConnection = await page.evaluate(async (cardId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('card-canvas')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const request = database
          .transaction('connections', 'readonly')
          .objectStore('connections')
          .getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      },
    )
    const found = all.find((entry) => entry.toCardId === cardId)
    return found ? String(found.id) : null
  }, externalId)
  expect(externalConnection).not.toBeNull()

  const before = {
    first: await box(first),
    second: await box(second),
    third: await box(third),
    external: await box(external),
    lines: await page
      .locator('[data-line]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('d')),
      ),
  }

  await dragBox(page, first, 40, 40)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)

  const during = {
    first: await box(first),
    second: await box(second),
    third: await box(third),
    external: await box(external),
    lines: await page
      .locator('[data-line]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('d')),
      ),
  }

  const dx1 = during.first.x - before.first.x
  const dy1 = during.first.y - before.first.y
  for (const key of ['first', 'second', 'third'] as const) {
    expect(Math.abs(during[key].x - before[key].x - dx1)).toBeLessThan(1)
    expect(Math.abs(during[key].y - before[key].y - dy1)).toBeLessThan(1)
  }
  expect(during.external.x).toBeCloseTo(before.external.x, 0)
  expect(during.external.y).toBeCloseTo(before.external.y, 0)
  expect(during.lines).not.toEqual(before.lines)

  // The endpoint attached to the stationary external card stays glued to it.
  const externalLine = page.locator(
    `[data-connection-id="${externalConnection}"] [data-line]`,
  )
  const externalEndpoint = await externalLine.evaluate((path) => {
    const element = path as SVGPathElement
    const point = element.getPointAtLength(element.getTotalLength())
    const matrix = element.getScreenCTM()!
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    }
  })
  expect(
    Math.min(
      Math.abs(externalEndpoint.x - during.external.x),
      Math.abs(
        externalEndpoint.x - (during.external.x + during.external.width),
      ),
    ),
  ).toBeLessThan(2)

  await page.mouse.up()
  const undoButton = page.locator('button[aria-label="撤销"]')
  await expect(undoButton).toHaveAttribute('title', /移动 3 张卡片/)

  const afterDrop = {
    first: await box(first),
    second: await box(second),
    third: await box(third),
  }
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const undone = {
    first: await box(first),
    second: await box(second),
    third: await box(third),
  }
  for (const key of ['first', 'second', 'third'] as const) {
    expect(Math.abs(undone[key].x - before[key].x)).toBeLessThan(1)
    expect(Math.abs(undone[key].y - before[key].y)).toBeLessThan(1)
  }

  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(500)
  const redone = {
    first: await box(first),
    second: await box(second),
    third: await box(third),
  }
  for (const key of ['first', 'second', 'third'] as const) {
    expect(Math.abs(redone[key].x - afterDrop[key].x)).toBeLessThan(1)
    expect(Math.abs(redone[key].y - afterDrop[key].y)).toBeLessThan(1)
  }
})

test('rigid offsets survive at 40% and 200% zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.waitForTimeout(500)
  const cards = page.locator('[data-world-item]')
  await connect(page, cards.nth(0), cards.nth(1))
  await cards.nth(0).locator('h2').click()
  await cards
    .nth(1)
    .locator('h2')
    .click({ modifiers: ['Shift'] })
  await cards
    .nth(2)
    .locator('h2')
    .click({ modifiers: ['Shift'] })

  await zoomTo(page, 40, 'out')
  await page.waitForTimeout(600)
  await page.waitForTimeout(800)
  const source40 = await largestVisibleSelectedIndex(page)
  const line40 = await page.locator('[data-line]').getAttribute('d')
  await dragBox(page, cards.nth(source40), 30, 18)
  expect(await page.locator('[data-line]').getAttribute('d')).not.toBe(line40)
  await expect
    .poll(() => rigidTransformError(page), { timeout: 3_000 })
    .toBeLessThan(0.01)
  await page.mouse.up()
  await page.waitForTimeout(400)

  await zoomTo(page, 200, 'in')
  await page.waitForTimeout(600)
  const source200 = await largestVisibleSelectedIndex(page)
  const line200 = await page.locator('[data-line]').getAttribute('d')
  await dragBox(page, cards.nth(source200), 24, 12, 'edge')
  expect(await page.locator('[data-line]').getAttribute('d')).not.toBe(line200)
  await expect
    .poll(() => rigidTransformError(page, true), {
      timeout: 3_000,
    })
    .toBeLessThan(0.01)
  await page.mouse.up()
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)
})
