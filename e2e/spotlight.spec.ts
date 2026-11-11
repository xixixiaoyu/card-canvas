import { expect, test, type Page } from '@playwright/test'

const searchDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Card Atlas 卡片纵览' })
const searchInput = (page: Page) =>
  page.getByRole('textbox', { name: '搜索卡片' })

async function zoomOut(page: Page, target = 40) {
  const zoomButton = page.locator('[aria-label^="当前缩放"]')
  const zoomOutButton = page.getByRole('button', { name: '缩小画布' })
  let guard = 0

  while (
    Number.parseInt((await zoomButton.textContent()) ?? '100', 10) > target &&
    guard < 12
  ) {
    await zoomOutButton.click()
    await page.waitForTimeout(120)
    guard += 1
  }
}

async function panFarAway(page: Page) {
  await page.keyboard.down('Space')
  await page.mouse.move(640, 360)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(640 + step * 48, 360 + step * 24)
  }
  await page.mouse.up()
  await page.keyboard.up('Space')
  await page.waitForTimeout(350)
}

async function connect(page: Page, fromIndex: number, toIndex: number) {
  const cards = page.locator('[data-world-item]')
  const source = cards.nth(fromIndex)
  await source.locator('h2').click()
  const handle = await source.locator('.link-handle').boundingBox()
  const target = await cards.nth(toIndex).boundingBox()

  const sx = handle!.x + handle!.width / 2
  const sy = handle!.y + handle!.height / 2
  const tx = target!.x + target!.width / 2
  const ty = target!.y + target!.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      sx + ((tx - sx) * step) / 10,
      sy + ((ty - sy) * step) / 10,
    )
  }
  await page.mouse.up()
  await expect(page.locator('[data-line]')).toHaveCount(fromIndex === 0 ? 1 : 2)
}

test('spotlight flies to the exact card centre and pulses', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await zoomOut(page)
  await panFarAway(page)
  await page
    .locator('[data-world-item]')
    .filter({ hasText: '边界不是墙' })
    .focus()

  await page.keyboard.press('Control+f')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  const input = searchInput(page)
  await expect(input).toBeFocused()
  await input.fill('支点')

  await expect(page.locator('[data-spotlight-result]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()

  const pulse = page.locator('[data-card-pulse]')
  await expect(pulse).toHaveCount(1)
  await expect(page.locator('[data-world-item].is-selected')).toContainText(
    '声音的支点',
  )

  const box = await page.locator('[data-world-item].is-selected').boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThan(
    2,
  )
  expect(
    Math.abs(box!.y + box!.height / 2 - viewport!.height / 2),
  ).toBeLessThan(2)

  await expect(pulse).toHaveCount(0, { timeout: 3_000 })
})

test('search shortcuts respect inputs and selections, and slash is typed', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const firstContent = page
    .locator('[data-world-item]')
    .first()
    .locator('.card-content')
  await firstContent.selectText()
  await page.keyboard.press('/')
  await expect(searchDialog(page)).toHaveCount(0)

  await page.mouse.click(350, 680)
  await page.keyboard.press('/')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  const input = searchInput(page)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')

  await page.keyboard.press('/')
  await expect(input).toHaveValue('/')
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.keyboard.press('Control+k')
  const title = page.getByLabel('卡片标题')
  await expect(title).toBeVisible()
  await title.fill('')
  await title.press('/')
  await expect(title).toHaveValue('/')
  await expect(searchDialog(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('clicking a tag dims the galaxy and blank canvas clears it', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await connect(page, 0, 1)
  await connect(page, 1, 2)

  const tag = page.locator('[data-filter-tag="心理学/防御机制"]').first()
  await tag.click()
  await expect(tag).toHaveAttribute('aria-pressed', 'true')

  const cards = page.locator('[data-world-item]')
  await expect(cards.nth(0)).not.toHaveClass(/is-dimmed/)
  await expect(cards.nth(1)).toHaveClass(/is-dimmed/)
  await expect(cards.nth(2)).toHaveClass(/is-dimmed/)
  await expect(cards.nth(1)).toHaveCSS('opacity', '0.15')

  await expect(
    page.locator('[data-connection-id][data-dimmed="true"]'),
  ).toHaveCount(1)
  await expect(
    page.locator('[data-connection-id]:not([data-dimmed="true"])'),
  ).toHaveCount(1)

  await page.mouse.click(350, 680)
  await expect(page.locator('[data-world-item].is-dimmed')).toHaveCount(0)
  await expect(
    page.locator('[data-filter-tag][aria-pressed="true"]'),
  ).toHaveCount(0)
})

test('starting a card drag clears tag focus and removes ghost opacity', async ({
  page,
}) => {
  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await expect(cards).toHaveCount(3)

  await page.locator('[data-filter-tag="心理学/防御机制"]').first().click()
  await expect(cards.nth(1)).toHaveClass(/is-dimmed/)
  await expect(cards.nth(2)).toHaveClass(/is-dimmed/)

  const target = cards.nth(1)
  const title = await target.locator('h2').boundingBox()
  expect(title).not.toBeNull()
  await page.mouse.move(title!.x + 24, title!.y + 12)
  await page.mouse.down()
  await page.mouse.move(title!.x + 34, title!.y + 22, { steps: 4 })

  await expect(page.locator('[data-world-item].is-dimmed')).toHaveCount(0)
  await expect(
    page.locator('[data-filter-tag][aria-pressed="true"]'),
  ).toHaveCount(0)
  await expect(target).toHaveClass(/is-dragging/)
  await expect(target).toHaveCSS('opacity', '1')

  await page.mouse.up()
  await expect(target).not.toHaveClass(/is-dragging/)
})

test('a wheel gesture interrupts the camera flight', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await zoomOut(page)
  await panFarAway(page)
  await page
    .locator('[data-world-item]')
    .filter({ hasText: '边界不是墙' })
    .focus()

  await page.keyboard.press('Control+f')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  await searchInput(page).fill('支点')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()

  await page.mouse.move(640, 360)
  await page.mouse.wheel(0, 220)
  await page.waitForTimeout(650)

  const stopped = await page
    .locator('[data-world-item].is-selected')
    .boundingBox()
  await page.waitForTimeout(450)
  const later = await page
    .locator('[data-world-item].is-selected')
    .boundingBox()

  expect(stopped).not.toBeNull()
  expect(later).not.toBeNull()
  expect(Math.abs(later!.x - stopped!.x)).toBeLessThan(1)
  expect(Math.abs(later!.y - stopped!.y)).toBeLessThan(1)
  await expect(searchDialog(page)).toBeHidden()
})
